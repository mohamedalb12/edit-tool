'use strict';
// تفريغ الكلام على Groq (Whisper large v3 على سيرفراتهم — أسرع وأدق بكتير من اللي على الجهاز، خصوصًا في العربي).
// الصوت بيتصغّر (mono 16k FLAC) ويتقسّم لحتت ≤ 10 دقايق عشان حد الـ 25 ميجا، والكلمات بترجع بتوقيتها.
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');

const URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELS = { 'whisper-large-v3': 'Whisper Large v3 (الأدق)', 'whisper-large-v3-turbo': 'Whisper Large v3 Turbo (أسرع وأرخص)' };
const CHUNK = 600; // seconds per request

/** multipart/form-data body from fields + one file */
function multipart(fields, file) {
  const boundary = '----EditFast' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of fields) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + boundary };
}

/** Groq's answer → words [{text, start, end}] (+ offset); falls back to segments split evenly when no word times */
function wordsFrom(json, offset = 0) {
  const out = [];
  if (Array.isArray(json.words) && json.words.length) {
    for (const w of json.words) { const t = String(w.word || '').trim(); if (t) out.push({ text: t, start: +(w.start + offset).toFixed(3), end: +(Math.max(w.end, w.start + 0.02) + offset).toFixed(3) }); }
  } else for (const s of json.segments || []) {
    const ws = String(s.text || '').trim().split(/\s+/).filter(Boolean), d = (s.end - s.start) / Math.max(1, ws.length);
    ws.forEach((t, i) => out.push({ text: t, start: +(s.start + i * d + offset).toFixed(3), end: +(s.start + (i + 1) * d + offset).toFixed(3) }));
  }
  return out;
}
function friendly(status, text) {
  if (status === 401) return 'مفتاح Groq غلط — اعمل واحد جديد من console.groq.com/keys';
  if (status === 413) return 'الصوت كبير على Groq';
  if (status === 429) return 'Groq: وصلت لحد الاستخدام دلوقتي — استنى دقيقة وجرّب تاني';
  return 'Groq ' + status + ': ' + String(text || '').slice(0, 200);
}

/**
 * Transcribe [start, start+duration] of a media file on Groq. → words [{text, start, end}] in source seconds.
 * language: 'ar' / 'en' / '' (auto) · prompt: a hint (dialect, names) that steers spelling.
 */
async function transcribe({ ffmpeg, file, start = 0, duration = 0, key, fetchImpl, model = 'whisper-large-v3', language = 'ar', prompt = '', tmpDir, onProgress }) {
  if (!key) throw new Error('حط مفتاح Groq من الإعدادات (console.groq.com/keys)');
  const dir = fs.mkdtempSync(path.join(tmpDir || require('os').tmpdir(), 'ef-groq-'));
  try {
    // the whole span as small FLAC chunks
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', file);
    if (duration > 0) args.push('-t', String(duration));
    args.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', '-f', 'segment', '-segment_time', String(CHUNK), path.join(dir, 'c_%03d.flac'));
    await run(ffmpeg, args);
    const chunks = fs.readdirSync(dir).filter(f => /^c_\d+\.flac$/.test(f)).sort();
    if (!chunks.length) throw new Error('مفيش صوت في الملف');
    const words = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress && onProgress(chunks.length > 1 ? `Groq: جزء ${i + 1} من ${chunks.length}…` : 'Groq بيفرّغ…');
      const fields = [['model', model], ['response_format', 'verbose_json'], ['timestamp_granularities[]', 'word'], ['timestamp_granularities[]', 'segment'], ['temperature', '0']];
      if (language) fields.push(['language', language]);
      if (prompt) fields.push(['prompt', prompt.slice(0, 600)]);
      const mp = multipart(fields, { name: chunks[i], type: 'audio/flac', data: fs.readFileSync(path.join(dir, chunks[i])) });
      let res, text, tries = 0;
      for (;;) {
        res = await fetchImpl(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': mp.type }, body: mp.body, timeout: 300000 });
        text = await res.text();
        if (res.status === 429 && tries++ < 3) { const wait = Math.min(60, +(res.headers && res.headers.get && res.headers.get('retry-after')) || 8 * tries); onProgress && onProgress('Groq مشغول — هيجرّب تاني بعد ' + wait + ' ث'); await new Promise(r => setTimeout(r, wait * 1000)); continue; }
        break;
      }
      if (!res.ok) throw new Error(friendly(res.status, text));
      words.push(...wordsFrom(JSON.parse(text), start + i * CHUNK));
    }
    return words;
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

module.exports = { transcribe, wordsFrom, multipart, MODELS, URL, CHUNK };

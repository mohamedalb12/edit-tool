'use strict';
// تفريغ الكلام على Groq (Whisper large v3 على سيرفراتهم — أسرع وأدق بكتير من اللي على الجهاز، خصوصًا في العربي).
// الصوت بيتصغّر (mono 16k FLAC) ويتقسّم لحتت ≤ 30 ثانية كل واحدة لوحدها (Whisper مايفضلش يكرر نفسه) — والقطع بيبقى في سكتة (عمره ما يقص
// كلمة في النص)، والكلمات بترجع بتوقيتها ومعاها بيانات كل جملة (احتمال إن مفيش كلام، الثقة) عشان فلتر الهلوسة.
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');

const URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELS = { 'whisper-large-v3': 'Whisper Large v3 (الأدق)', 'whisper-large-v3-turbo': 'Whisper Large v3 Turbo (أسرع وأرخص)' };
// seconds per request: each piece is transcribed on its own, so one stuck stretch can't run on. Measured on 15 min of
// Egyptian speech with pauses / music (bench/captions): one long request 54.6% word errors (a 2-minute loop ate real
// speech), 30 s pieces cut in pauses 30.2%.
const CHUNK = 30;

/** multipart/form-data body from fields + one file */
function multipart(fields, file) {
  const boundary = '----EditFast' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of fields) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + boundary };
}

/**
 * Groq's answer → words [{text, start, end, seg}] (+ offset); falls back to segments split evenly when no word times.
 * `seg` = index into segmentsFrom(json) (same order) — whisper's own signals for that stretch.
 */
function wordsFrom(json, offset = 0, segBase = 0) {
  const out = [], segs = json.segments || [];
  const segOf = t => { for (let k = 0; k < segs.length; k++) if (t >= segs[k].start - 0.05 && t <= segs[k].end + 0.05) return segBase + k; return undefined; };
  if (Array.isArray(json.words) && json.words.length) {
    for (const w of json.words) { const t = String(w.word || '').trim(); if (t) { const o = { text: t, start: +(w.start + offset).toFixed(3), end: +(Math.max(w.end, w.start + 0.02) + offset).toFixed(3) }; const k = segOf(w.start); if (k !== undefined) o.seg = k; out.push(o); } }
  } else for (const s of json.segments || []) {
    const ws = String(s.text || '').trim().split(/\s+/).filter(Boolean), d = (s.end - s.start) / Math.max(1, ws.length);
    ws.forEach((t, i) => out.push({ text: t, start: +(s.start + i * d + offset).toFixed(3), end: +(s.start + (i + 1) * d + offset).toFixed(3), seg: segBase + segs.indexOf(s) }));
  }
  return out;
}
/** whisper's per-segment signals: no_speech_prob, avg_logprob, compression_ratio (+ offset) */
function segmentsFrom(json, offset = 0) {
  return (json.segments || []).map(s => ({ start: +(s.start + offset).toFixed(3), end: +(s.end + offset).toFixed(3), text: String(s.text || '').trim(), noSpeech: s.no_speech_prob, logprob: s.avg_logprob, compression: s.compression_ratio }));
}

/**
 * Where to cut a long recording into ≤ chunk pieces: in the middle of the longest pause in the last quarter before each mark —
 * never inside a word. silences: [{start, end}] (seconds). → cut times (no 0, no end)
 */
function cutPoints(duration, silences, chunk = CHUNK) {
  const cuts = []; let from = 0;
  while (duration - from > chunk) {
    const mark = from + chunk, lo = from + chunk * 0.75;
    const cand = (silences || []).filter(s => (s.start + s.end) / 2 > lo && (s.start + s.end) / 2 < mark).sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const at = cand.length ? +((cand[0].start + cand[0].end) / 2).toFixed(3) : mark;
    cuts.push(at); from = at;
  }
  return cuts;
}
function friendly(status, text) {
  if (status === 401) return 'مفتاح Groq غلط — اعمل واحد جديد من console.groq.com/keys';
  if (status === 413) return 'الصوت كبير على Groq';
  if (status === 429) return 'Groq: وصلت لحد الاستخدام دلوقتي — استنى دقيقة وجرّب تاني';
  return 'Groq ' + status + ': ' + String(text || '').slice(0, 200);
}

async function mediaDuration(ffmpeg, file, start = 0) {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', file], { allowFail: true });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(String(stderr));
  return m ? Math.max(0, +m[1] * 3600 + +m[2] * 60 + +m[3] - start) : 0;
}

/**
 * Transcribe [start, start+duration] of a media file on Groq. → words [{text, start, end}] in source seconds, with
 * `.segments` (whisper's signals per stretch).
 * language: 'ar' / 'en' / '' (auto) · prompt: a hint (dialect, names) that steers spelling.
 */
async function transcribe({ ffmpeg, file, start = 0, duration = 0, key, fetchImpl, model = 'whisper-large-v3', language = 'ar', prompt = '', tmpDir, onProgress, chunk = CHUNK }) {
  if (!key) throw new Error('حط مفتاح Groq من الإعدادات (console.groq.com/keys)');
  const dir = fs.mkdtempSync(path.join(tmpDir || require('os').tmpdir(), 'ef-groq-'));
  try {
    // pieces of ≤ CHUNK s, cut in pauses (a cut at a fixed time lands mid-word and loses it)
    const span = duration > 0 ? duration : await mediaDuration(ffmpeg, file, start);
    let sil = [];
    try { sil = await require('./silence').detectSilence(ffmpeg, file, { thresholdDb: -40, minSilence: 0.3, start, duration: span }); } catch (_) {}
    const bounds = [0].concat(cutPoints(span, sil, chunk), [span]), chunks = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const name = 'c_' + String(i).padStart(3, '0') + '.flac';
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(start + bounds[i]), '-i', file, '-t', String(bounds[i + 1] - bounds[i]), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', path.join(dir, name)];
      await run(ffmpeg, args);
      chunks.push({ name, at: bounds[i] });
    }
    if (!chunks.length) throw new Error('مفيش صوت في الملف');
    const words = [], segments = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress && onProgress(chunks.length > 1 ? `Groq: ${Math.round(100 * i / chunks.length)}%` : 'Groq بيفرّغ…');
      const fields = [['model', model], ['response_format', 'verbose_json'], ['timestamp_granularities[]', 'word'], ['timestamp_granularities[]', 'segment'], ['temperature', '0']];
      if (language) fields.push(['language', language]);
      if (prompt) fields.push(['prompt', prompt.slice(0, 600)]);
      const mp = multipart(fields, { name: chunks[i].name, type: 'audio/flac', data: fs.readFileSync(path.join(dir, chunks[i].name)) });
      let res, text, tries = 0;
      for (;;) {
        res = await fetchImpl(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': mp.type }, body: mp.body, timeout: 300000 });
        text = await res.text();
        if (res.status === 429 && tries++ < 3) { const wait = Math.min(60, +(res.headers && res.headers.get && res.headers.get('retry-after')) || 8 * tries); onProgress && onProgress('Groq مشغول — هيجرّب تاني بعد ' + wait + ' ث'); await new Promise(r => setTimeout(r, wait * 1000)); continue; }
        break;
      }
      if (!res.ok) throw new Error(friendly(res.status, text));
      const json = JSON.parse(text);
      words.push(...wordsFrom(json, start + chunks[i].at, segments.length));
      segments.push(...segmentsFrom(json, start + chunks[i].at));
    }
    words.segments = segments; // whisper's per-stretch signals, for the hallucination check
    return words;
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

module.exports = { transcribe, wordsFrom, segmentsFrom, cutPoints, multipart, MODELS, URL, CHUNK };

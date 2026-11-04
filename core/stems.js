'use strict';
// فصل الصوت عن المزيكا (Demucs على fal.ai — fal-ai/demucs): الكلام لوحده، والمزيكا لوحدها (درامز + بيز + الباقي
// متجمّعين)، كل واحد في ملف. بيتقطع لأجزاء ≤ 5 دقايق عشان حجم الرفع، وبيتجمّع تاني بنفس التوقيت.
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');

const MODEL = 'fal-ai/demucs';
const CHUNK = 300; // seconds per request
const PRICE_PER_SEC = 0.0007; // fal's listed price (USD) — for the estimate shown before running

/** the first audio URL in a fal answer field: "https://…", { url }, or [{ url }] */
function urlOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return /^(https?:|data:audio)/.test(v) ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = urlOf(x); if (u) return u; } return null; }
  if (typeof v === 'object') return urlOf(v.url) || urlOf(v.file) || null;
  return null;
}
/** fal's answer → { vocals, drums, bass, other, guitar, piano } urls (whatever it returned) */
function stemUrls(res) {
  const out = {};
  for (const k of ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']) { const u = urlOf(res && (res[k] || (res.stems && res.stems[k]))); if (u) out[k] = u; }
  return out;
}
async function fetchTo(fetchImpl, url, file) {
  if (/^data:/.test(url)) { fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); return file; }
  const res = await fetchImpl(url, { timeout: 600000 });
  if (!res.ok) throw new Error('التحميل من fal وقف: ' + res.status);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/**
 * Separate [start, start+duration] of a media file → { vocals: wav, music: wav, seconds, cost }.
 * key: the fal.ai key. fetchImpl: Node fetch. onStep(text).
 */
async function separate({ ffmpeg, file, start = 0, duration, key, fetchImpl, dir, onStep }) {
  if (!key) throw new Error('فصل الصوت عن المزيكا محتاج مفتاح fal.ai (الإعدادات) — بيتعمل بموديل Demucs');
  const step = m => { try { onStep && onStep(m); } catch (_) {} };
  fs.mkdirSync(dir, { recursive: true });
  const work = fs.mkdtempSync(path.join(dir, 'stems-'));
  try {
    // the span as ≤ 5-minute stereo MP3 chunks (small uploads, enough quality for separation)
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', file);
    if (duration) args.push('-t', String(duration));
    args.push('-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'segment', '-segment_time', String(CHUNK), path.join(work, 'in_%03d.mp3'));
    await run(ffmpeg, args);
    const chunks = fs.readdirSync(work).filter(f => /^in_\d+\.mp3$/.test(f)).sort();
    if (!chunks.length) throw new Error('مفيش صوت في الملف ده');
    const parts = { vocals: [], music: [] };
    for (let i = 0; i < chunks.length; i++) {
      step(chunks.length > 1 ? `بيفصل الجزء ${i + 1} من ${chunks.length}…` : 'بيفصل الكلام عن المزيكا (دقيقة أو اتنين)…');
      const audio = 'data:audio/mpeg;base64,' + fs.readFileSync(path.join(work, chunks[i])).toString('base64');
      const res = await fetchImpl('https://fal.run/' + MODEL, { method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ audio_url: audio }), timeout: 1800000 });
      const txt = await res.text();
      if (res.status === 401 || res.status === 403) throw new Error('مفتاح fal.ai غلط أو مفيهوش رصيد');
      if (!res.ok) throw new Error('fal.ai ' + res.status + ': ' + txt.slice(0, 200));
      const urls = stemUrls(JSON.parse(txt));
      if (!urls.vocals) throw new Error('fal.ai مارجّعش الكلام لوحده');
      const v = await fetchTo(fetchImpl, urls.vocals, path.join(work, `v_${i}` + ext(urls.vocals)));
      const rest = [];
      for (const k of ['drums', 'bass', 'other', 'guitar', 'piano']) if (urls[k]) rest.push(await fetchTo(fetchImpl, urls[k], path.join(work, `${k}_${i}` + ext(urls[k]))));
      // the music = every other stem mixed back together (same length / timing as the vocals)
      const m = path.join(work, `m_${i}.wav`);
      if (rest.length) await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...rest.flatMap(f => ['-i', f]), '-filter_complex', rest.map((_, k) => `[${k}:a]`).join('') + `amix=inputs=${rest.length}:normalize=0:duration=longest`, '-ar', '48000', '-ac', '2', m]);
      parts.vocals.push(v); if (rest.length) parts.music.push(m);
    }
    step('بيجمّع…');
    const base = path.join(dir, path.basename(file).replace(/\.\w+$/, '').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 40) + '-' + Date.now().toString(36));
    const join = async (list, out) => {
      if (!list.length) return null;
      const txt = path.join(work, path.basename(out) + '.txt');
      fs.writeFileSync(txt, list.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
      await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', txt, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out]);
      return out;
    };
    const vocals = await join(parts.vocals, base + '-voice.wav'), music = await join(parts.music, base + '-music.wav');
    const seconds = duration || null;
    return { vocals, music, cost: seconds ? +(seconds * PRICE_PER_SEC).toFixed(2) : null };
  } finally { try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {} }
}
const ext = u => (/\.(wav|mp3|flac|ogg|m4a)(\?|$)/i.exec(u) || [null, 'wav'])[1].replace(/^/, '.');
const estimate = seconds => +(seconds * PRICE_PER_SEC).toFixed(2);

module.exports = { separate, stemUrls, urlOf, estimate, MODEL, CHUNK, PRICE_PER_SEC };

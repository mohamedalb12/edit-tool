'use strict';
// الصوت: تنضيف أوفلاين (ffmpeg) + توطية الموسيقى تحت الكلام (Auto ducking).
const { run, decodePCM } = require('./ffmpeg');
const { rmsEnvelope, toDb, percentile } = require('./audio');
const ranges = require('./ranges');

const STRENGTH = { light: { nr: 12, comp: 2 }, medium: { nr: 20, comp: 3 }, strong: { nr: 30, comp: 4 } };

/** Voice chain: rumble cut → FFT denoise (noise floor measured per clip) → de-ess → gentle compression. */
function cleanFilter({ strength = 'medium', noiseFloorDb = -50 } = {}) {
  const s = STRENGTH[strength] || STRENGTH.medium;
  // calibrated: afftdn removes ~30 dB of hiss without touching speech when nf ≈ measured floor + 10 dB
  const nf = Math.max(-80, Math.min(-20, noiseFloorDb + 10));
  return [
    'highpass=f=80', 'lowpass=f=15000',
    `afftdn=nr=${s.nr}:nf=${nf.toFixed(1)}`,
    'deesser=i=0.4:m=0.5:f=0.5',
    `acompressor=threshold=-20dB:ratio=${s.comp}:attack=8:release=180:makeup=2`
  ].join(',');
}

/* ---------- "صوت استوديو" (Auphonic-style): neural denoise + hum removal + leveler + loudness to a target ---------- */
const path = require('path');
const fs = require('fs');
const MODELS = path.join(__dirname, '..', 'assets', 'models', 'rnnoise');
/** a path inside an ffmpeg filter argument: forward slashes, ':' and '\'' escaped, quoted */
const filterPath = p => "'" + String(p).replace(/\\/g, '/').replace(/'/g, "'\\\\''").replace(/:/g, '\\:') + "'";
const STUDIO = {
  light: { mix: 0.7, nr: 6, leveler: 4, comp: 1.6 },
  medium: { mix: 0.9, nr: 10, leveler: 6, comp: 2 },
  strong: { mix: 1, nr: 16, leveler: 8, comp: 2.5 }
};
/** Goertzel power of one frequency over a block of samples */
function tone(x, from, n, f, rate) {
  const w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = from; i < from + n; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / (n * n);
}
/**
 * What kind of noise is under the voice, from the quietest 30 % of the recording (the pauses):
 * { floorDb, hum: 50 | 60 | 0 (mains hum + harmonics clearly above their neighbours), lowRatio (share of the noise
 * energy under ~400 Hz: street / traffic / AC rumble), kind: 'low' → neural (RNNoise) | 'broad' → FFT (afftdn) }
 */
function noiseProfile(pcm, rate) {
  const win = Math.round(rate * 0.1), frames = [];
  for (let i = 0; i + win <= pcm.length; i += win) { let e = 0; for (let k = i; k < i + win; k++) e += pcm[k] * pcm[k]; frames.push({ i, e: e / win }); }
  if (frames.length < 5) return { floorDb: -60, hum: 0, lowRatio: 0, kind: 'broad' };
  const quiet = frames.slice().sort((a, b) => a.e - b.e).slice(0, Math.max(3, Math.round(frames.length * 0.3)));
  const floorDb = 10 * Math.log10(quiet[Math.floor(quiet.length / 2)].e + 1e-12);
  let humScore = { 50: 0, 60: 0 }, low = 0, all = 0;
  for (const q of quiet) {
    for (const base of [50, 60]) {
      let on = 0, off = 0;
      for (let h = 1; h <= 3; h++) { const f = base * h; on += tone(pcm, q.i, win, f, rate); off += (tone(pcm, q.i, win, f - 8, rate) + tone(pcm, q.i, win, f + 8, rate)) / 2; }
      humScore[base] += 10 * Math.log10((on + 1e-15) / (off + 1e-15));
    }
    // a one-pole low-pass at ~400 Hz splits the noise into "rumble" (traffic, AC, crowd) and the rest
    const a = Math.exp(-2 * Math.PI * 400 / rate); let y = 0, el = 0, et = 0;
    for (let k = q.i; k < q.i + win; k++) { y = (1 - a) * pcm[k] + a * y; el += y * y; et += pcm[k] * pcm[k]; }
    low += el; all += et;
  }
  const h50 = humScore[50] / quiet.length, h60 = humScore[60] / quiet.length;
  const hum = Math.max(h50, h60) > 10 ? (h50 >= h60 ? 50 : 60) : 0;
  const lowRatio = all > 0 ? low / all : 0;
  // measured on real speech: street rumble ≈ 0.88, pink hiss ≈ 0.63, a clean take ≈ 0.57 → 0.75. Mains hum is its
  // own case: the notch alone did best on it (+13 dB), the neural net on top only cost
  return { floorDb: +floorDb.toFixed(1), hum, lowRatio: +lowRatio.toFixed(2), kind: !hum && lowRatio > 0.75 && floorDb > -60 ? 'low' : 'broad' };
}
async function analyzeNoise(ffmpeg, file, start = 0, duration = 0) {
  const rate = 16000, pcm = await decodePCM(ffmpeg, file, { rate, start, duration: duration || 0 });
  return noiseProfile(pcm, rate);
}
/**
 * rumble → mains hum (50 / 60 Hz + harmonics) → RNNoise (a neural net trained on speech in recording noise:
 * keyboard, street, fans — not just steady hiss) → light FFT clean-up of what's left → de-ess → speech leveler
 * (quiet and loud talkers brought together, like Auphonic's Adaptive Leveler) → gentle compression.
 * hum: 50 | 60 | 0 (none). model: a .rnnn file (default the speech-in-recording model shipped with the panel).
 */
function studioFilter({ strength = 'medium', noiseFloorDb = -50, hum = 0, model, neural = 'auto', kind = 'broad' } = {}) {
  const s = STUDIO[strength] || STUDIO.medium, nf = Math.max(-80, Math.min(-20, noiseFloorDb + 10));
  const m = model || path.join(MODELS, 'std.rnnn'), f = [];
  // measured on real speech (SI-SDR): RNNoise wins on low, moving noise (street +5 dB) but costs on steady hiss
  // and keyboard clicks, where the FFT denoiser wins — so the noise profile picks; a hum notch only when there is hum
  const useNeural = neural === true || (neural === 'auto' && kind === 'low');
  f.push('highpass=f=75');
  if (hum) for (let k = 1; k <= 4; k++) f.push(`bandreject=f=${hum * k}:width_type=q:w=${8 + k * 4}`);
  if (useNeural && fs.existsSync(m)) f.push(`arnndn=m=${filterPath(m)}:mix=${s.mix}`, `afftdn=nr=${Math.round(s.nr / 2)}:nf=${nf.toFixed(1)}`);
  // with hum, the measured floor *is* the hum (gone after the notch): a light FFT pass on what's left
  else if (hum) f.push(`afftdn=nr=${Math.round(s.nr / 2)}:nf=${Math.max(-80, nf - 15).toFixed(1)}`);
  else f.push(`afftdn=nr=${s.nr * 2}:nf=${nf.toFixed(1)}`);
  f.push('lowpass=f=16000', 'deesser=i=0.35:m=0.5:f=0.5');
  f.push(`speechnorm=e=${s.leveler}:r=0.0005:l=1`);
  f.push(`acompressor=threshold=-18dB:ratio=${s.comp}:attack=10:release=200:makeup=1`);
  return f.join(',');
}
/** integrated loudness / true peak / range of a file (EBU R128) → { lufs, truePeak, lra } */
async function measureLoudness(ffmpeg, file, start = 0, duration = 0) {
  const args = ['-hide_banner', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration) args.push('-t', String(duration));
  args.push('-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-');
  const { stderr } = await run(ffmpeg, args);
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  return { lufs: +(+j.input_i).toFixed(1), truePeak: +(+j.input_tp).toFixed(1), lra: +(+j.input_lra).toFixed(1) };
}
/**
 * The whole studio pass on one file → { out, before: {lufs, truePeak, lra, noiseFloor}, after: {…} } — the
 * before / after card the panel shows (like Auphonic's result page).
 * target: −16 LUFS (podcast / voice) · −14 (YouTube / social) · −23 (broadcast)
 */
async function studioFile(ffmpeg, { file, start = 0, duration, out, strength = 'medium', loudness = -16, hum = 'auto', neural = 'auto' }) {
  const floor = await measureNoiseFloor(ffmpeg, file, start, duration);
  const profile = await analyzeNoise(ffmpeg, file, start, duration);
  const before = Object.assign({ noiseFloor: +floor.toFixed(1) }, await measureLoudness(ffmpeg, file, start, duration));
  const chain = studioFilter({ strength, noiseFloorDb: floor, hum: hum === 'auto' ? profile.hum : hum, neural, kind: profile.kind });
  const norm = await loudnessArgs(ffmpeg, file, chain, start, duration, loudness);
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration) args.push('-t', String(duration));
  args.push('-vn', '-af', `${chain},${norm}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out);
  await run(ffmpeg, args);
  const after = Object.assign({ noiseFloor: +(await measureNoiseFloor(ffmpeg, out, 0, 0)).toFixed(1) }, await measureLoudness(ffmpeg, out));
  return { out, before, after, chain, profile };
}

/** per-clip studio reports → one before / after card: loudness, true peak, noise floor, what was found */
function summarize(reports) {
  if (!reports || !reports.length) return null;
  const avg = (k, w) => { const v = reports.map(r => r[w] && r[w][k]).filter(x => typeof x === 'number' && isFinite(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
  const found = [];
  if (reports.some(r => r.profile && r.profile.hum)) found.push('وزن كهربا ' + reports.find(r => r.profile && r.profile.hum).profile.hum + 'Hz');
  if (reports.some(r => r.profile && r.profile.kind === 'low')) found.push('دوشة منخفضة (شارع / تكييف) — اتنضّفت بالـ AI');
  return { before: { lufs: avg('lufs', 'before'), truePeak: avg('truePeak', 'before'), noiseFloor: avg('noiseFloor', 'before') },
    after: { lufs: avg('lufs', 'after'), truePeak: avg('truePeak', 'after'), noiseFloor: avg('noiseFloor', 'after') }, found };
}

/** 10th-percentile short-term level = the noise floor (dBFS). */
async function measureNoiseFloor(ffmpeg, file, start, duration) {
  const rate = 16000;
  const pcm = await decodePCM(ffmpeg, file, { rate, start, duration });
  const env = Array.from(rmsEnvelope(pcm, rate, 0.05)).map(toDb);
  return percentile(env, 0.1);
}

/** Two-pass EBU R128: measure, then normalise linearly (single-pass loudnorm would pump the quiet gaps back up). */
async function loudnessArgs(ffmpeg, file, chain, start, duration, target) {
  const args = ['-hide_banner', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration) args.push('-t', String(duration));
  args.push('-vn', '-af', `${chain},loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-');
  const { stderr } = await run(ffmpeg, args);
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!m) return `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  const j = JSON.parse(m[0]);
  return `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
}

async function cleanFile(ffmpeg, { file, start = 0, duration, out, strength, loudness = -16 }) {
  const floor = await measureNoiseFloor(ffmpeg, file, start, duration);
  const chain = cleanFilter({ strength, noiseFloorDb: floor });
  const norm = await loudnessArgs(ffmpeg, file, chain, start, duration, loudness);
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration) args.push('-t', String(duration));
  args.push('-vn', '-af', `${chain},${norm}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out);
  await run(ffmpeg, args);
  return out;
}

/** Speech windows from an RMS envelope (relative to the noise floor), merged + padded. */
function speechSegments(env, windowSec, { aboveFloorDb = 12, minLen = 0.25, mergeGap = 0.45 } = {}) {
  const db = Array.from(env).map(toDb);
  const floor = percentile(db, 0.15);
  const segs = []; let open = -1;
  db.forEach((v, i) => {
    const on = v > floor + aboveFloorDb;
    if (on && open < 0) open = i;
    if (!on && open >= 0) { segs.push({ start: open * windowSec, end: i * windowSec }); open = -1; }
  });
  if (open >= 0) segs.push({ start: open * windowSec, end: db.length * windowSec });
  return ranges.merge(segs, mergeGap).filter(s => s.end - s.start >= minLen);
}

async function voiceActivity(ffmpeg, clips) {
  const out = [];
  for (const c of clips) {
    const rate = 8000, win = 0.05;
    const pcm = await decodePCM(ffmpeg, c.mediaPath, { rate, start: c.inPoint, duration: c.end - c.start });
    for (const s of speechSegments(rmsEnvelope(pcm, rate, win), win)) out.push({ start: c.start + s.start, end: c.start + s.end });
  }
  return ranges.merge(out, 0.45);
}

/** Volume keyframes (timeline seconds, dB relative to the clip's level) for one music clip. */
function duckKeys(speech, clip, { duckDb = -12, attack = 0.25, release = 0.6 } = {}) {
  const keys = [];
  const add = (t, db) => { if (t >= clip.start - 1e-6 && t <= clip.end + 1e-6) keys.push({ t: +t.toFixed(3), db }); };
  for (const s of speech) {
    if (s.end <= clip.start || s.start >= clip.end) continue;
    add(Math.max(clip.start, s.start - attack), 0);
    add(Math.max(clip.start, s.start), duckDb);
    add(Math.min(clip.end, s.end), duckDb);
    add(Math.min(clip.end, s.end + release), 0);
  }
  // merge keys that overlap when speech windows are close
  keys.sort((a, b) => a.t - b.t);
  const out = [];
  for (const k of keys) { const last = out[out.length - 1]; if (last && Math.abs(last.t - k.t) < 1e-3) last.db = Math.min(last.db, k.db); else if (last && k.t < last.t) continue; else out.push({ ...k }); }
  // inside a long duck, drop the "0" keys that fall between two ducked keys
  return out.filter((k, i) => !(k.db === 0 && out[i - 1] && out[i + 1] && out[i - 1].db < 0 && out[i + 1].db < 0 && out[i + 1].t - out[i - 1].t < attack + release + 0.05));
}

module.exports = { summarize, studioFilter, studioFile, measureLoudness, filterPath, noiseProfile, analyzeNoise, STRENGTH, cleanFilter, measureNoiseFloor, cleanFile, speechSegments, voiceActivity, duckKeys };

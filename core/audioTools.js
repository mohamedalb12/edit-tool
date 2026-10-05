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

module.exports = { STRENGTH, cleanFilter, measureNoiseFloor, cleanFile, speechSegments, voiceActivity, duckKeys };

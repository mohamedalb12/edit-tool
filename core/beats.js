'use strict';
// ماركرز على إيقاع الموسيقى — كشف البيتس أوفلاين (onset + autocorrelation).
const { decodePCM } = require('./ffmpeg');

function onsetEnvelope(samples, rate, hop = 512) {
  const win = hop * 2, n = Math.floor((samples.length - win) / hop);
  const energy = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) {
    let e = 0; const a = i * hop;
    for (let j = 0; j < win; j++) e += samples[a + j] * samples[a + j];
    energy[i] = Math.log1p(1000 * e / win);
  }
  const flux = new Float32Array(energy.length);
  for (let i = 1; i < energy.length; i++) flux[i] = Math.max(0, energy[i] - energy[i - 1]);
  // remove local mean
  const k = 8, out = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(flux.length - 1, i + k); j++) { s += flux[j]; c++; } out[i] = Math.max(0, flux[i] - s / c); }
  return { env: out, fps: rate / hop };
}

function estimateTempo(env, fps, { minBpm = 70, maxBpm = 180 } = {}) {
  const minLag = Math.floor(fps * 60 / maxBpm), maxLag = Math.ceil(fps * 60 / minBpm);
  let best = minLag, bestV = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    s /= (env.length - lag);
    if (s > bestV) { bestV = s; best = lag; }
  }
  // parabolic refinement
  const f = l => { let s = 0; for (let i = l; i < env.length; i++) s += env[i] * env[i - l]; return s / (env.length - l); };
  const y0 = f(best - 1), y1 = bestV, y2 = f(best + 1);
  const d = (y0 - 2 * y1 + y2) ? 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) : 0;
  const lag = best + Math.max(-0.5, Math.min(0.5, d));
  return { bpm: 60 * fps / lag, period: lag / fps };
}

function placeBeats(env, fps, period) {
  const lag = period * fps;
  let bestPhase = 0, bestV = -Infinity;
  for (let ph = 0; ph < lag; ph += 0.25) {
    let s = 0; for (let t = ph; t < env.length; t += lag) s += env[Math.round(t)] || 0;
    if (s > bestV) { bestV = s; bestPhase = ph; }
  }
  const beats = [];
  for (let t = bestPhase; t < env.length; t += lag) {
    // snap to local max within ±10% of period
    const r = Math.max(1, Math.round(lag * 0.1)); let bi = Math.round(t), bv = -1;
    for (let j = Math.max(0, Math.round(t) - r); j <= Math.min(env.length - 1, Math.round(t) + r); j++) if (env[j] > bv) { bv = env[j]; bi = j; }
    beats.push(+(bi / fps).toFixed(3));
  }
  return beats;
}

function detectFromSamples(samples, rate, opts = {}) {
  const { env, fps } = onsetEnvelope(samples, rate);
  const { bpm, period } = estimateTempo(env, fps, opts);
  let beats = placeBeats(env, fps, period);
  if (opts.every && opts.every > 1) beats = beats.filter((_, i) => i % opts.every === 0);
  return { bpm: Math.round(bpm * 10) / 10, beats };
}

async function detect(ffmpeg, file, { start = 0, duration = 0, every = 1 } = {}) {
  const rate = 22050;
  const pcm = await decodePCM(ffmpeg, file, { rate, start, duration });
  const r = detectFromSamples(pcm, rate, { every });
  return { ...r, beats: r.beats.map(b => b + 0) };
}

module.exports = { onsetEnvelope, estimateTempo, placeBeats, detectFromSamples, detect };

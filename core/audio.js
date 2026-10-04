'use strict';
// تحليل صوت خفيف (RMS / dB) — أوفلاين بالكامل.

function rmsEnvelope(samples, rate, windowSec = 0.05) {
  const win = Math.max(1, Math.round(rate * windowSec));
  const n = Math.ceil(samples.length / win);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const a = i * win, b = Math.min(samples.length, a + win);
    for (let j = a; j < b; j++) s += samples[j] * samples[j];
    env[i] = Math.sqrt(s / Math.max(1, b - a));
  }
  return env;
}

function toDb(v) { return 20 * Math.log10(Math.max(v, 1e-9)); }

function percentile(arr, p) {
  const a = Array.from(arr).sort((x, y) => x - y);
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))];
}

module.exports = { rmsEnvelope, toDb, percentile };

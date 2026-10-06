'use strict';
// باقة مؤثرات صوتية ترند بتتولّد على جهازك (من غير نت ولا حقوق): ووش، رايزر، إمباكت، بوب، جليتش، تايبنج…
// كل صوت متصنّع بالكود (DSP) وبيتحفظ WAV 48kHz ستيريو، وبيتضاف لمكتبتك تلقائيًا.
const fs = require('fs');
const path = require('path');

const SR = 48000;

/* ---------- أدوات DSP صغيرة ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const buf = (sec) => ({ L: new Float32Array(Math.ceil(sec * SR)), R: new Float32Array(Math.ceil(sec * SR)) });

/** RBJ biquad whose cutoff can move every sample (coeffs refreshed every 16 samples) */
function biquad(type) {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, n = 0;
  function set(f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let B0, B1, B2; const A0 = 1 + al;
    if (type === 'lp') { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; }
    else if (type === 'hp') { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; }
    else { B0 = al; B1 = 0; B2 = -al; } // band-pass (0 dB peak)
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * c) / A0; a2 = (1 - al) / A0;
  }
  return (x, f, q = 0.707) => {
    if (n++ % 16 === 0) set(f, q);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}

/** Schroeder reverb (stereo by detuned delays), mix 0..1 */
function reverb(b, { mix = 0.25, size = 1, damp = 0.4 } = {}) {
  const make = (offs) => {
    const combs = [1557, 1617, 1491, 1422].map(d => ({ d: Math.round((d + offs) * size), buf: null, i: 0, lp: 0 }));
    combs.forEach(c => { c.buf = new Float32Array(c.d); });
    const aps = [225, 556].map(d => ({ d: d + offs, buf: new Float32Array(d + offs), i: 0 }));
    return x => {
      let o = 0;
      for (const c of combs) { const y = c.buf[c.i]; c.lp = y * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * 0.82; c.i = (c.i + 1) % c.d; o += y; }
      o *= 0.25;
      for (const a of aps) { const y = a.buf[a.i]; const v = o + y * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; o = y - v * 0.5; }
      return o;
    };
  };
  const rl = make(0), rr = make(23);
  // fade the dry end so a sound cut short never clicks into the tail
  const fd = Math.min(b.L.length, Math.round(SR * 0.06));
  for (let k = 0; k < fd; k++) { const g = k / fd; b.L[b.L.length - 1 - k] *= g; b.R[b.R.length - 1 - k] *= g; }
  // let the tail ring out: extend by ~1.2 s
  const tail = Math.round(SR * 1.2 * size);
  const L = new Float32Array(b.L.length + tail), R = new Float32Array(b.R.length + tail);
  for (let i = 0; i < L.length; i++) {
    const xl = i < b.L.length ? b.L[i] : 0, xr = i < b.R.length ? b.R[i] : 0;
    const m = (xl + xr) * 0.5;
    L[i] = xl * (1 - mix) + rl(m) * mix * 2.2; R[i] = xr * (1 - mix) + rr(m) * mix * 2.2;
  }
  return trimTail({ L, R });
}

function trimTail(b, floor = 0.0008) {
  let end = b.L.length;
  while (end > 1 && Math.abs(b.L[end - 1]) < floor && Math.abs(b.R[end - 1]) < floor) end--;
  const fade = Math.min(end, Math.round(SR * 0.02));
  for (let k = 0; k < fade; k++) { const g = k / fade; b.L[end - 1 - k] *= g; b.R[end - 1 - k] *= g; }
  return { L: b.L.slice(0, end), R: b.R.slice(0, end) };
}

function normalize(b, peakDb = -1) {
  let p = 0;
  for (let i = 0; i < b.L.length; i++) {
    if (!isFinite(b.L[i])) b.L[i] = 0; if (!isFinite(b.R[i])) b.R[i] = 0;
    p = Math.max(p, Math.abs(b.L[i]), Math.abs(b.R[i]));
  }
  const g = p > 0 ? Math.pow(10, peakDb / 20) / p : 1;
  for (let i = 0; i < b.L.length; i++) { b.L[i] *= g; b.R[i] *= g; }
  return b;
}

/** equal-power pan: p in -1..1 */
function put(b, i, v, p = 0) { if (i < 0 || i >= b.L.length) return; const a = (p + 1) * Math.PI / 4; b.L[i] += v * Math.cos(a); b.R[i] += v * Math.sin(a); }
const bell = (x) => Math.sin(Math.PI * Math.min(1, Math.max(0, x))) ** 2;
const sat = (x, d = 2) => Math.tanh(x * d) / Math.tanh(d);

/* ---------- الأصوات ---------- */
function whoosh({ dur = 0.9, lo = 280, hi = 3200, peak = 0.55, seed = 1, pan = true, q = 1.1 } = {}) {
  const b = buf(dur), r = rng(seed), f = biquad('bp'), f2 = biquad('bp'); let pink = 0;
  for (let i = 0; i < b.L.length; i++) {
    const t = i / b.L.length, e = t < peak ? (t / peak) : 1 - (t - peak) / (1 - peak);
    pink = pink * 0.86 + (r() * 2 - 1) * 0.14;
    const fc = lo * Math.pow(hi / lo, Math.sin(Math.PI * Math.min(1, t / (peak * 2))) ** 1.2);
    const v = (f(pink, fc, q) * 0.8 + f2(r() * 2 - 1, fc * 1.9, q * 2) * 0.25) * e * e;
    put(b, i, v, pan ? (t * 2 - 1) * 0.8 : 0);
  }
  return reverb(b, { mix: 0.18, size: 0.7 });
}

function riser({ dur = 3, seed = 2, down = false } = {}) {
  const b = buf(dur), r = rng(seed), f = biquad('bp'); let ph = 0, ph2 = 0;
  for (let i = 0; i < b.L.length; i++) {
    let t = i / b.L.length; if (down) t = 1 - t;
    const e = Math.pow(t, 2.2), fc = 200 * Math.pow(30, t), fo = 110 * Math.pow(9, t);
    ph += (2 * Math.PI * fo) / SR; ph2 += (2 * Math.PI * fo * 1.005) / SR;
    const tone = (Math.sin(ph) + Math.sin(2 * ph) * 0.4 + Math.sin(3 * ph2) * 0.25) * 0.3;
    const v = (f(r() * 2 - 1, fc, 2.5) * 1.2 + tone) * e;
    put(b, i, v, Math.sin(i / SR * 6) * 0.3 * t);
  }
  return reverb(b, { mix: 0.3, size: 1.1 });
}

function impact({ dur = 1.8, f0 = 120, f1 = 38, metal = false, seed = 3 } = {}) {
  const b = buf(dur), r = rng(seed), lp = biquad('lp'); let ph = 0;
  const partials = metal ? [[183, 1.4], [264, 1.1], [397, 0.9], [541, 0.7], [733, 0.5]] : [];
  const php = partials.map(() => 0);
  for (let i = 0; i < b.L.length; i++) {
    const s = i / SR, fo = f1 + (f0 - f1) * Math.exp(-s / 0.07);
    ph += (2 * Math.PI * fo) / SR;
    let v = sat(Math.sin(ph) * Math.exp(-s / 0.55), 2.5) * 0.9;
    v += lp(r() * 2 - 1, 2400 * Math.exp(-s / 0.08) + 200) * Math.exp(-s / 0.09) * 0.8;
    partials.forEach(([pf, d], k) => { php[k] += (2 * Math.PI * pf) / SR; v += Math.sin(php[k]) * Math.exp(-s / d) * 0.12 * Math.min(1, s / 0.004); });
    put(b, i, v * Math.min(1, s / 0.002));
  }
  return reverb(b, { mix: metal ? 0.38 : 0.25, size: metal ? 1.6 : 1.1, damp: 0.5 });
}

function subDrop({ dur = 1.6, f0 = 95, f1 = 28 } = {}) {
  const b = buf(dur); let ph = 0;
  for (let i = 0; i < b.L.length; i++) {
    const s = i / SR, fo = f1 + (f0 - f1) * Math.exp(-s / 0.35);
    ph += (2 * Math.PI * fo) / SR;
    put(b, i, sat(Math.sin(ph), 1.8) * Math.exp(-s / 0.7) * Math.min(1, s / 0.004));
  }
  return b;
}

function tone({ freqs = [880], dur = 0.15, decay = 0.08, attack = 0.002, sweep = 1, gap = 0, partials = [[1, 1]], pan = 0, wave = 'sine' } = {}) {
  const total = freqs.length * (dur + gap) + decay * 4;
  const b = buf(total);
  freqs.forEach((f, n) => {
    const start = Math.round(n * (dur + gap) * SR), len = Math.round((dur + decay * 4) * SR);
    const ph = partials.map(() => 0);
    for (let k = 0; k < len; k++) {
      const s = k / SR, env = Math.min(1, s / attack) * (s < dur ? 1 : Math.exp(-(s - dur) / decay));
      const fo = f * (sweep === 1 ? 1 : Math.pow(sweep, Math.min(1, s / dur)));
      let v = 0;
      partials.forEach(([m, a, d], j) => {
        ph[j] += (2 * Math.PI * fo * m) / SR;
        const w = wave === 'square' ? Math.sign(Math.sin(ph[j])) * 0.5 : Math.sin(ph[j]);
        v += w * a * (d ? Math.exp(-s / d) : 1);
      });
      put(b, start + k, v * env, pan);
    }
  });
  return trimTail(b);
}

function noiseBurst(b, at, { len = 0.01, f = 4000, q = 1.5, gain = 1, seed = 5, type = 'bp', pan = 0 } = {}) {
  const r = rng(seed), flt = biquad(type), n = Math.round(len * SR), st = Math.round(at * SR);
  for (let k = 0; k < n; k++) put(b, st + k, flt(r() * 2 - 1, f, q) * gain * Math.exp(-k / (n / 4)), pan);
}

const BELL = [[1, 1, 1.2], [2.76, 0.5, 0.6], [5.4, 0.25, 0.35], [8.93, 0.12, 0.2]];

const SOUNDS = {
  'whoosh': { label: 'ووش', tags: 'transition whoosh انتقال', make: () => whoosh() },
  'whoosh-fast': { label: 'ووش سريع', tags: 'transition fast swish', make: () => whoosh({ dur: 0.42, lo: 600, hi: 5200, seed: 7 }) },
  'whoosh-deep': { label: 'ووش تقيل', tags: 'transition deep cinematic', make: () => whoosh({ dur: 1.3, lo: 90, hi: 900, seed: 11, q: 0.8 }) },
  'swipe': { label: 'سوايب', tags: 'swipe ui slide', make: () => whoosh({ dur: 0.22, lo: 1500, hi: 7000, peak: 0.4, seed: 13, q: 1.6 }) },
  'reverse-whoosh': { label: 'ووش معكوس', tags: 'reverse suck build', make: () => { const b = whoosh({ dur: 1.1, peak: 0.95, lo: 200, hi: 4500, seed: 17 }); return b; } },
  'riser': { label: 'رايزر', tags: 'riser build tension', make: () => riser() },
  'riser-short': { label: 'رايزر قصير', tags: 'riser short build', make: () => riser({ dur: 1.4, seed: 19 }) },
  'downlifter': { label: 'داون ليفتر', tags: 'downlifter drop fall', make: () => riser({ dur: 2, down: true, seed: 23 }) },
  'impact': { label: 'إمباكت', tags: 'impact hit boom', make: () => impact() },
  'cinematic-hit': { label: 'ضربة سينمائية', tags: 'cinematic hit trailer metal', make: () => impact({ dur: 2.6, f0: 140, f1: 34, metal: true }) },
  'sub-drop': { label: 'ساب دروب', tags: 'sub bass drop', make: () => subDrop() },
  'bass-808': { label: 'باص 808', tags: '808 bass drop trap', make: () => subDrop({ dur: 1.9, f0: 170, f1: 46 }) },
  'pop': { label: 'بوب', tags: 'pop bubble appear', make: () => tone({ freqs: [380], dur: 0.03, decay: 0.035, sweep: 3.2 }) },
  'bubble': { label: 'فقاعة', tags: 'bubble pop cute', make: () => tone({ freqs: [520, 700], dur: 0.035, decay: 0.03, sweep: 2.4, gap: 0.05 }) },
  'click': { label: 'كليك', tags: 'click ui tap mouse', make: () => { const b = buf(0.08); noiseBurst(b, 0, { len: 0.012, f: 3500, q: 2, gain: 1.4 }); return b; } },
  'tick': { label: 'تك', tags: 'tick clock ui', make: () => tone({ freqs: [2200], dur: 0.004, decay: 0.012 }) },
  'ding': { label: 'دينج', tags: 'ding bell correct', make: () => tone({ freqs: [1046], dur: 0.01, decay: 0.5, partials: BELL }) },
  'notification': { label: 'إشعار', tags: 'notification message phone', make: () => tone({ freqs: [988, 1319], dur: 0.09, decay: 0.12, gap: 0.02, partials: [[1, 1], [2, 0.2, 0.1]] }) },
  'success': { label: 'نجاح', tags: 'success win level up', make: () => tone({ freqs: [523, 659, 784, 1046], dur: 0.07, decay: 0.16, partials: BELL }) },
  'error': { label: 'غلط', tags: 'error wrong buzz fail', make: () => tone({ freqs: [220, 175], dur: 0.14, decay: 0.04, gap: 0.03, wave: 'square', partials: [[1, 0.6], [1.01, 0.4]] }) },
  'camera-shutter': { label: 'شتر كاميرا', tags: 'camera shutter photo snap', make: () => { const b = buf(0.3); noiseBurst(b, 0, { len: 0.03, f: 2800, q: 1.2, gain: 1.3 }); noiseBurst(b, 0.085, { len: 0.045, f: 1900, q: 1, gain: 1, seed: 9 }); return b; } },
  'typing': { label: 'كتابة كيبورد', tags: 'typing keyboard text', make: () => { const b = buf(2), r = rng(29); let t = 0.02; while (t < 1.9) { noiseBurst(b, t, { len: 0.012 + r() * 0.01, f: 2500 + r() * 2500, q: 2.2, gain: 0.6 + r() * 0.6, seed: Math.floor(r() * 1e6), pan: r() * 0.6 - 0.3 }); t += 0.055 + r() * 0.11; } return b; } },
  'glitch': { label: 'جليتش', tags: 'glitch digital error transition', make: () => {
    const b = buf(0.8), r = rng(31); let t = 0;
    while (t < 0.75) { const len = 0.02 + r() * 0.07, f = 80 + r() * 1800, st = Math.round(t * SR), n = Math.round(len * SR), crush = 1 + Math.floor(r() * 12), p = r() * 1.6 - 0.8; let hold = 0;
      for (let k = 0; k < n; k++) { if (k % crush === 0) hold = r() < 0.5 ? Math.sign(Math.sin(2 * Math.PI * f * k / SR)) * 0.6 : (r() * 2 - 1) * 0.5; put(b, st + k, hold, p); }
      t += len + (r() < 0.3 ? r() * 0.04 : 0); }
    return b; } },
  'boing': { label: 'بوينج', tags: 'boing cartoon spring funny', make: () => { const b = buf(0.8); let ph = 0; for (let i = 0; i < b.L.length; i++) { const s = i / SR; ph += 2 * Math.PI * (170 + 140 * Math.exp(-s * 4) + 40 * Math.sin(s * 70) * Math.exp(-s * 3)) / SR; put(b, i, Math.sin(ph) * Math.exp(-s * 3.5) * Math.min(1, s / 0.004)); } return b; } },
  'record-scratch': { label: 'خربشة اسطوانة', tags: 'record scratch stop funny', make: () => { const b = buf(0.6), r = rng(37), f = biquad('bp'); for (let i = 0; i < b.L.length; i++) { const s = i / SR; put(b, i, f(r() * 2 - 1, 900 + 700 * Math.sin(s * 38) + 1400 * (1 - s / 0.6), 3) * 1.6 * Math.exp(-s * 2.5)); } return b; } },
  'magic-sparkle': { label: 'سبركل سحري', tags: 'magic sparkle shine twinkle', make: () => { const r = rng(41); let b = buf(1.4); for (let n = 0; n < 22; n++) { const at = r() * 1.1, f = 2000 + r() * 4500, p = r() * 1.6 - 0.8, len = Math.round(0.25 * SR), st = Math.round(at * SR); let ph = 0; for (let k = 0; k < len; k++) { ph += 2 * Math.PI * f / SR; put(b, st + k, Math.sin(ph) * Math.exp(-k / (SR * 0.05)) * 0.35, p); } } return reverb(b, { mix: 0.35, size: 1.2 }); } },
  'cash': { label: 'كاشير فلوس', tags: 'cash money register ka-ching', make: () => { const b = tone({ freqs: [2093, 2637], dur: 0.02, decay: 0.25, gap: 0.08, partials: BELL }); const c = buf(b.L.length / SR); noiseBurst(c, 0, { len: 0.02, f: 3000, q: 1.5, gain: 0.9 }); for (let i = 0; i < c.L.length; i++) { c.L[i] += b.L[i] || 0; c.R[i] += b.R[i] || 0; } return c; } },
  'heartbeat': { label: 'نبض قلب', tags: 'heartbeat tension suspense', make: () => { const b = buf(1.7); [0, 0.24, 0.85, 1.09].forEach((at, n) => { let ph = 0; const st = Math.round(at * SR); for (let k = 0; k < SR * 0.25; k++) { const s = k / SR; ph += 2 * Math.PI * (70 - 25 * s) / SR; put(b, st + k, Math.sin(ph) * Math.exp(-s / 0.06) * (n % 2 ? 0.75 : 1) * Math.min(1, s / 0.003)); } }); return b; } },
  'countdown': { label: 'عد تنازلي', tags: 'countdown beep timer', make: () => tone({ freqs: [988, 988, 988, 1976], dur: 0.1, decay: 0.03, gap: 0.4 }) },
  'swoosh-pan': { label: 'سووش ستيريو', tags: 'swoosh pan stereo transition', make: () => whoosh({ dur: 0.7, lo: 400, hi: 4200, seed: 43, peak: 0.45 }) }
};

function wav(b) {
  const n = b.L.length, data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.L[i])) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.R[i])) * 32767), i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function render(id) {
  const s = SOUNDS[id]; if (!s) throw new Error('مؤثر مش معروف: ' + id);
  return normalize(trimTail(s.make()), -1);
}

/** Write the pack (or some of it) to dir; existing files are kept. */
function generate(dir, { ids, onProgress } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const list = ids || Object.keys(SOUNDS);
  const files = [];
  list.forEach((id, k) => {
    const f = path.join(dir, `${id}.wav`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, wav(render(id)));
    files.push({ id, file: f, label: SOUNDS[id].label, tags: SOUNDS[id].tags });
    onProgress && onProgress((k + 1) / list.length);
  });
  return files;
}

function list() { return Object.entries(SOUNDS).map(([id, s]) => ({ id, label: s.label, tags: s.tags })); }

module.exports = { SOUNDS, SR, list, render, generate, wav };

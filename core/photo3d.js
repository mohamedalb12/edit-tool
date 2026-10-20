'use strict';
// صورة → ثري دي (زي 3D Photo / Depth Scanner): خريطة عمق → شرايح بعمقها → ليرز ثري دي في الأفتر بكاميرا بتتحرك.
// العمق: من ملف عمق جاهز، أو من fal.ai (لو فيه مفتاح)، أو تقدير بسيط (اللي تحت أقرب + المنطقة المهمة قدّام).
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');
const { encodePng } = require('./util');

/** decode a file to exactly w×h: RGBA, or one grey channel (gray: true) */
async function decodeExact(ffmpeg, file, w, h, { gray = false } = {}) {
  const { stdout } = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=bicubic,format=${gray ? 'gray' : 'rgba'}`, '-f', 'rawvideo', '-']);
  const b = Buffer.from(stdout);
  if (b.length < w * h * (gray ? 1 : 4)) throw new Error('مقدرتش أقرا الصورة');
  return b;
}
/** box blur (separable, a few passes ≈ gaussian) on a float map */
function blur(d, w, h, r) {
  if (r < 1) return d;
  let a = Float32Array.from(d), b = new Float32Array(d.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { b[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
  }
  return a;
}
/**
 * A guess when there's no depth model: lower in the frame = nearer, and the subject box (from the vision model,
 * normalised x,y,w,h) pops out in front. → Float32Array 0 (far) … 1 (near)
 */
function guessDepth(w, h, subject) {
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0.15 + 0.45 * Math.pow(y / h, 1.3);
    if (subject) {
      const cx = (subject.x + subject.w / 2) * w, cy = (subject.y + subject.h / 2) * h, rx = Math.max(4, subject.w * w / 2), ry = Math.max(4, subject.h * h / 2);
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 1.4) v = Math.max(v, 0.95 - Math.max(0, e - 0.8) * 1.2);
    }
    d[y * w + x] = Math.min(1, Math.max(0, v));
  }
  return blur(d, w, h, Math.round(Math.max(w, h) / 80));
}
function fromGray(buf, w, h, { invert = false } = {}) {
  const d = new Float32Array(w * h);
  let lo = 255, hi = 0;
  for (let i = 0; i < w * h; i++) { lo = Math.min(lo, buf[i]); hi = Math.max(hi, buf[i]); }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < w * h; i++) { const v = (buf[i] - lo) / span; d[i] = invert ? 1 - v : v; }
  return blur(d, w, h, 1);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The image cut into depth slices: slice 0 = the whole image (far), each next one only what's nearer than its
 * threshold (soft edge). → [{ rgba, depth (mean, 0 far … 1 near) }]
 */
function slices(rgba, depth, w, h, n = 5) {
  const sorted = Float32Array.from(depth).sort();
  const thr = [];
  for (let k = 1; k < n; k++) { const v = sorted[Math.floor(sorted.length * k / n)]; if (!thr.length || v - thr[thr.length - 1] > 0.02) thr.push(v); }
  const out = [{ rgba: Buffer.from(rgba), depth: sorted[Math.floor(sorted.length * 0.15)] }];
  const f = 0.025;
  for (let k = 0; k < thr.length; k++) {
    const b = Buffer.from(rgba); let sum = 0, cnt = 0;
    const lo = thr[k], hi = k + 1 < thr.length ? thr[k + 1] : 1;
    for (let i = 0; i < w * h; i++) {
      const a = smooth(lo - 2 * f, lo, depth[i]); // at / past the threshold = fully in
      b[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * a);
      if (depth[i] >= lo && depth[i] < hi) { sum += depth[i]; cnt++; }
    }
    if (cnt < w * h * 0.002) continue; // nothing at that depth
    out.push({ rgba: b, depth: cnt ? sum / cnt : lo });
  }
  return out;
}

/**
 * Raw scene: one 3D layer per slice at its depth (scaled so the frame looks the same from the camera), a camera
 * that moves (push / orbit / rise / float). Pure.
 */
function photoScene(files, { width, height, duration = 6, move = 'push', strength = 1, name = '3D Photo' } = {}) {
  const W = width, H = height, Z = Math.round(W * 1.2), range = W * 0.9 * strength;
  const layers = files.map((f, k) => {
    const z = Math.round((1 - f.depth) * range);
    const s = (Z + z) / Z * 108;
    return { type: 'footage', name: 'Depth ' + (k + 1), file: f.file, cover: false, threeD: true, transform: { position: [W / 2, H / 2, z], scale: [s * W / f.w, s * W / f.w, 100] } };
  }).reverse(); // nearest on top
  const cam = { type: 'camera', name: 'Camera', camera: { zoom: Z } };
  const P = (dx, dy, dz) => [W / 2 + dx, H / 2 + dy, -Z + dz];
  const st = strength;
  cam.keys = {
    push: { position: [[0, P(0, 0, 0), 'easeInOut'], [duration, P(0, 0, Z * 0.22 * st)]] },
    orbit: { position: [[0, P(-W * 0.07 * st, 0, 0), 'easeInOut'], [duration, P(W * 0.07 * st, 0, Z * 0.05)]] },
    rise: { position: [[0, P(0, H * 0.06 * st, 0), 'easeInOut'], [duration, P(0, -H * 0.06 * st, Z * 0.12 * st)]] },
    float: {}
  }[move] || {};
  cam.transform = { position: P(0, 0, 0) };
  if (move === 'float') cam.expressions = { position: 'value+[Math.sin(time*0.8)*' + Math.round(W * 0.03 * st) + ',Math.cos(time*0.6)*' + Math.round(H * 0.02 * st) + ',0]' };
  return { comp: { create: true, name, width: W, height: H, duration, bg: '#000000' }, layers: [cam].concat(layers) };
}

async function writeSlices(ffmpeg, parts, w, h, dir, base) {
  fs.mkdirSync(dir, { recursive: true });
  return parts.map((p, k) => {
    const file = path.join(dir, `${base}-depth${k + 1}.png`);
    fs.writeFileSync(file, encodePng(w, h, p.rgba));
    return { file, depth: p.depth, w, h };
  });
}

module.exports = { decodeExact, guessDepth, fromGray, slices, photoScene, writeSlices, blur };

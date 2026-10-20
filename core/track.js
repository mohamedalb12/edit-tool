'use strict';
// تراكينج (زي Track Motion / Mocha-lite): نقطة، نقطتين (مكان + سكيل + لف)، أو 4 نقط (Corner Pin لاستبدال شاشة).
// الفريمات بتتفك بـ ffmpeg رمادي وصغير، والتتبّع template matching (خشن → ناعم + sub-pixel) في Node.
const { run } = require('./ffmpeg');

/** grey frames of a video from `start` for `duration` seconds at `fps`, at most `width` px wide */
async function frames(ffmpeg, file, { start = 0, duration = 5, fps = 30, width = 640, srcW = 0, srcH = 0 } = {}) {
  const s = srcW ? Math.min(1, width / srcW) : 1;
  const w = srcW ? Math.max(16, Math.round(srcW * s / 2) * 2) : width, h = srcH ? Math.max(16, Math.round(srcH * s / 2) * 2) : Math.round(width * 9 / 16 / 2) * 2;
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file, '-t', String(Math.max(0.1, duration)), '-an', '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-');
  const { stdout } = await run(ffmpeg, args, { maxBuffer: 1024 * 1024 * 1024 });
  const buf = Buffer.from(stdout), n = Math.floor(buf.length / (w * h)), out = [];
  for (let i = 0; i < n; i++) out.push(new Uint8Array(buf.buffer, buf.byteOffset + i * w * h, w * h));
  return { w, h, fps, frames: out, scale: srcW ? w / srcW : 1 };
}

function patch(f, w, h, cx, cy, r) {
  const n = 2 * r + 1, p = new Float32Array(n * n);
  const x0 = Math.round(cx), y0 = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.min(w - 1, Math.max(0, x0 + dx)), y = Math.min(h - 1, Math.max(0, y0 + dy));
    p[(dy + r) * n + dx + r] = f[y * w + x];
  }
  return p;
}
/** mean absolute difference of the template at integer (x, y), with the patch's mean removed (light changes) */
function cost(f, w, h, x, y, T, Tmean, r) {
  const n = 2 * r + 1;
  if (x - r < 0 || y - r < 0 || x + r >= w || y + r >= h) return Infinity;
  let m = 0;
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) m += f[(y + dy) * w + x + dx];
  m /= Math.pow(Math.floor(r) + 1, 2);
  let s = 0;
  for (let dy = -r; dy <= r; dy++) { const row = (y + dy) * w + x, trow = (dy + r) * n + r; for (let dx = -r; dx <= r; dx++) s += Math.abs(f[row + dx] - m - (T[trow + dx] - Tmean)); }
  return s / (n * n);
}
const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };

/**
 * Follow one point through the frames. p0 = [x, y] in frame pixels.
 * → [{ x, y, err }] one per frame (err = mean grey difference; > ~35 = probably lost)
 */
function trackPoint(F, w, h, p0, { r = 0, search = 0 } = {}) {
  r = r || Math.max(6, Math.round(w / 48)); search = search || Math.max(12, Math.round(w / 20));
  let T = patch(F[0], w, h, p0[0], p0[1], r), T0 = T, Tm = mean(T);
  let x = p0[0], y = p0[1], vx = 0, vy = 0;
  const out = [{ x, y, err: 0 }];
  for (let k = 1; k < F.length; k++) {
    const f = F[k], px = Math.round(x + vx), py = Math.round(y + vy);
    let bx = px, by = py, best = Infinity;
    // coarse (every 2 px), then ±2 fine
    for (let dy = -search; dy <= search; dy += 2) for (let dx = -search; dx <= search; dx += 2) { const c = cost(f, w, h, px + dx, py + dy, T, Tm, r); if (c < best) { best = c; bx = px + dx; by = py + dy; } }
    const cx = bx, cy = by;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = cost(f, w, h, cx + dx, cy + dy, T, Tm, r); if (c < best) { best = c; bx = cx + dx; by = cy + dy; } }
    // sub-pixel: parabola through the neighbours
    const sub = (a, b, c) => { const d = a - 2 * b + c; return d > 1e-6 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0; };
    const ox = sub(cost(f, w, h, bx - 1, by, T, Tm, r), best, cost(f, w, h, bx + 1, by, T, Tm, r));
    const oy = sub(cost(f, w, h, bx, by - 1, T, Tm, r), best, cost(f, w, h, bx, by + 1, T, Tm, r));
    const nx = bx + (isFinite(ox) ? ox : 0), ny = by + (isFinite(oy) ? oy : 0);
    vx = 0.6 * (nx - x) + 0.4 * vx; vy = 0.6 * (ny - y) + 0.4 * vy;
    x = nx; y = ny;
    out.push({ x, y, err: best });
    // slowly refresh the template (follows turning / light) but stay anchored to the first look
    if (best < 30) {
      const P = patch(f, w, h, x, y, r);
      const N = new Float32Array(T.length);
      for (let i = 0; i < T.length; i++) N[i] = 0.7 * T[i] + 0.2 * P[i] + 0.1 * T0[i];
      T = N; Tm = mean(T);
    }
  }
  return out;
}

/** two tracked points → per frame { centre, scale % (from frame 0), rotation ° } */
function similarity(a, b) {
  const d0 = Math.hypot(b[0].x - a[0].x, b[0].y - a[0].y) || 1, a0 = Math.atan2(b[0].y - a[0].y, b[0].x - a[0].x);
  return a.map((p, i) => {
    const q = b[i], d = Math.hypot(q.x - p.x, q.y - p.y), ang = Math.atan2(q.y - p.y, q.x - p.x);
    let rot = (ang - a0) * 180 / Math.PI; while (rot > 180) rot -= 360; while (rot < -180) rot += 360;
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, scale: d / d0 * 100, rotation: rot, err: Math.max(p.err, q.err) };
  });
}
/** a source-pixel point → comp pixels through the footage layer's 2D transform */
function toComp(pt, L) {
  const a = L.anchor || [0, 0], pos = L.position || [0, 0], sc = L.scale || [100, 100], r = (L.rotation || 0) * Math.PI / 180;
  const x = (pt[0] - a[0]) * sc[0] / 100, y = (pt[1] - a[1]) * sc[1] / 100;
  return [pos[0] + x * Math.cos(r) - y * Math.sin(r), pos[1] + x * Math.sin(r) + y * Math.cos(r)];
}
/** first frame where the track is probably lost (or -1) */
function lostAt(track, limit = 38) { for (let i = 1; i < track.length; i++) if (track[i].err > limit) return i; return -1; }

module.exports = { frames, trackPoint, similarity, toComp, lostAt, patch, cost };

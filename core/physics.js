'use strict';
// فيزيا (زي Newton): الليرز بتقع وتخبط في بعض وفي الأرض والحيطان وتتنطط وتتدحرج — محاكاة 2D في Node بتتخبز كي فريمز.

const MODES = { drop: 'بتقع من فوق', fall: 'بتقع من مكانها', explode: 'بتتفرتك من النص', float: 'من غير جاذبية (بتخبط وتطفو)' };

let S = 7;
const rnd = () => { S = (S * 16807) % 2147483647; return (S - 1) / 2147483646; };

/**
 * bodies: [{ name, x, y (centre, comp px), w, h, rot (deg), round: bool }]
 * → { frames: n, fps, tracks: { name: [{ x, y, rot }] } }
 */
function simulate(bodies, { width = 1920, height = 1080, fps = 30, duration = 4, mode = 'drop', gravity = 1, bounce = 0.5, friction = 0.35, walls = true, floor = null, seed = 7 } = {}) {
  S = seed;
  const g = (mode === 'float' ? 0 : 2600) * gravity * (height / 1080), ground = floor === null ? height : floor, sub = 6, dt = 1 / fps / sub;
  const B = bodies.map(b => {
    const r = b.round ? Math.min(b.w, b.h) / 2 : Math.sqrt(b.w * b.h) / 2 * 0.92;
    const o = { name: b.name, x: b.x, y: b.y, vx: 0, vy: 0, a: (b.rot || 0) * Math.PI / 180, w: 0, r, hw: b.w / 2, hh: b.h / 2, round: !!b.round, m: Math.max(1, b.w * b.h) };
    return o;
  });
  const cx = B.reduce((s, b) => s + b.x, 0) / Math.max(1, B.length), cy = B.reduce((s, b) => s + b.y, 0) / Math.max(1, B.length);
  B.forEach((b, i) => {
    if (mode === 'drop') { b.y -= height * (0.75 + rnd() * 0.5) + i * b.r * 0.6; b.vx = (rnd() - 0.5) * 120; b.w = (rnd() - 0.5) * 4; }
    if (mode === 'explode') { const ang = Math.atan2(b.y - cy, b.x - cx) || rnd() * 6.28, sp = 900 + rnd() * 900; b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp - 900 * gravity; b.w = (rnd() - 0.5) * 14; }
    if (mode === 'float') { const ang = rnd() * 6.28; b.vx = Math.cos(ang) * 250; b.vy = Math.sin(ang) * 250; b.w = (rnd() - 0.5) * 2; }
  });
  // the lowest point of a body for the floor: a box touches with its rotated corner
  const bottom = b => b.round ? b.r : Math.abs(b.hw * Math.sin(b.a)) + Math.abs(b.hh * Math.cos(b.a));
  const side = b => b.round ? b.r : Math.abs(b.hw * Math.cos(b.a)) + Math.abs(b.hh * Math.sin(b.a));
  const n = Math.max(2, Math.round(duration * fps)), tracks = {};
  B.forEach(b => { tracks[b.name] = []; });
  for (let f = 0; f < n; f++) {
    B.forEach(b => tracks[b.name].push({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), rot: +(b.a * 180 / Math.PI).toFixed(2) }));
    for (let s = 0; s < sub; s++) {
      for (const b of B) {
        b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
        if (mode === 'float') { b.vx *= 0.9995; b.vy *= 0.9995; }
        // floor
        const bt = bottom(b);
        if (b.y + bt > ground) {
          b.y = ground - bt;
          if (b.vy > 0) b.vy = -b.vy * bounce;
          if (Math.abs(b.vy) < 40) b.vy = 0;
          // friction → rolling (round) or settling flat (box)
          b.vx *= 1 - friction * 0.08;
          if (b.round) b.w = b.vx / b.r;
          else { const flat = Math.round(b.a / (Math.PI / 2)) * (Math.PI / 2); b.w = (flat - b.a) * 12 + b.vx / b.r * 0.15; }
        }
        if (mode === 'float' && b.y - bottom(b) < 0) { b.y = bottom(b); b.vy = Math.abs(b.vy) * bounce; }
        if (walls) {
          const sd = side(b);
          if (b.x - sd < 0) { b.x = sd; b.vx = Math.abs(b.vx) * bounce; }
          if (b.x + sd > width) { b.x = width - sd; b.vx = -Math.abs(b.vx) * bounce; }
        }
      }
      // body vs body (as circles): push apart + bounce, spin from the glancing part
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
        const p = B[i], q = B[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = p.r + q.r;
        if (d >= min) continue;
        const nx = dx / d, ny = dy / d, over = min - d, tm = p.m + q.m;
        p.x -= nx * over * q.m / tm; p.y -= ny * over * q.m / tm; q.x += nx * over * p.m / tm; q.y += ny * over * p.m / tm;
        const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (rv < 0) {
          const j2 = -(1 + bounce) * rv / (1 / p.m + 1 / q.m);
          p.vx -= j2 * nx / p.m; p.vy -= j2 * ny / p.m; q.vx += j2 * nx / q.m; q.vy += j2 * ny / q.m;
          const tv = (q.vx - p.vx) * -ny + (q.vy - p.vy) * nx;
          p.w -= tv / p.r * 0.2; q.w += tv / q.r * 0.2;
        }
      }
    }
  }
  return { frames: n, fps, tracks };
}

module.exports = { MODES, simulate };

'use strict';
// تتبّع الوش: الوشوش اللي face-api لقاها في كل فريم → مسار وش واحد ناعم (المكان + الحجم)، حتى لو فيه أكتر من وش
// أو فريمات ماتلقاش فيها. Pure: الـ samples جاية من البانل (EF.analyzeFaces).

/**
 * samples: [{ t, faces: [{cx, cy, w, h, score}] }] (normalised 0–1) · pick: [x, y] normalised (the face nearest it)
 * or null (the biggest face in the first frames) → [{ t, cx, cy, w, h, seen }] one per sample, or [] if no face.
 */
function path(samples, { pick = null, maxJump = 0.12, sizeTol = 0.2, smooth = 2 } = {}) {
  if (!samples || !samples.length) return [];
  // the start: the face nearest the click, or the biggest in the first frames that have one
  let cur = null;
  for (const s of samples) {
    if (!s.faces || !s.faces.length) continue;
    cur = pick ? s.faces.slice().sort((a, b) => Math.hypot(a.cx - pick[0], a.cy - pick[1]) - Math.hypot(b.cx - pick[0], b.cy - pick[1]))[0]
      : s.faces.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    break;
  }
  if (!cur) return [];
  // follow it: each frame the face nearest the last one. Someone else = too far away for the time since we last saw
  // it, or a clearly different size (a second face walking past is near for a moment, but not the same size)
  let lastT = samples.find(s => s.faces && s.faces.length).t;
  const raw = samples.map(s => {
    const gap = Math.max(0.1, s.t - lastT), reach = maxJump * Math.min(3, gap / 0.1) + cur.w * 0.5;
    const near = (s.faces || []).map(f => ({ f, d: Math.hypot(f.cx - cur.cx, f.cy - cur.cy), r: f.w / cur.w }))
      .filter(x => x.d <= reach && x.r >= 1 - sizeTol && x.r <= 1 / (1 - sizeTol)).sort((a, b) => a.d - b.d)[0];
    if (near) { cur = near.f; lastT = s.t; return { t: s.t, cx: cur.cx, cy: cur.cy, w: cur.w, h: cur.h, seen: true }; }
    return { t: s.t, seen: false };
  });
  // gaps: linear between the frames around them (hold at the ends)
  const seen = raw.map((r, i) => (r.seen ? i : -1)).filter(i => i >= 0);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].seen) continue;
    const a = seen.filter(k => k < i).pop(), b = seen.find(k => k > i);
    const A = raw[a === undefined ? b : a], B = raw[b === undefined ? a : b], u = a === undefined || b === undefined || a === b ? 0 : (i - a) / (b - a);
    for (const k of ['cx', 'cy', 'w', 'h']) raw[i][k] = A[k] + (B[k] - A[k]) * u;
  }
  // a light moving average: face detectors jitter by a few pixels frame to frame
  return raw.map((r, i) => {
    const o = { t: r.t, seen: r.seen };
    for (const k of ['cx', 'cy', 'w', 'h']) { let s = 0, n = 0; for (let j = Math.max(0, i - smooth); j <= Math.min(raw.length - 1, i + smooth); j++) { s += raw[j][k]; n++; } o[k] = s / n; }
    return o;
  });
}

module.exports = { path };

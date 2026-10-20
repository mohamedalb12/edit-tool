'use strict';
// مورف من شكل لشكل (زي ShapeShifter): كل مرحلة بتتعمل بنفس عدد المسارات والنقط، والنقط بتتلف عشان تقابل
// أقرب نقط في الشكل اللي بعده — فالتحوّل بيبقى ناعم من غير ما الشكل يتقلب أو يتلخبط.

function bez(a, b, c, d, t) { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; }
/** a path {v,i,o,c} → a dense polyline */
function flatten(p, per = 12) {
  const out = [], n = p.v.length, segs = p.c ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const a = p.v[k], b = p.v[(k + 1) % n];
    const c1 = [a[0] + p.o[k][0], a[1] + p.o[k][1]], c2 = [b[0] + p.i[(k + 1) % n][0], b[1] + p.i[(k + 1) % n][1]];
    const straight = !p.o[k][0] && !p.o[k][1] && !p.i[(k + 1) % n][0] && !p.i[(k + 1) % n][1];
    const steps = straight ? 1 : per;
    for (let s = 0; s < steps; s++) out.push(bez(a, c1, c2, b, s / steps));
  }
  if (!p.c) out.push(p.v[n - 1].slice());
  return out;
}
function signedArea(q) { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], r = q[(i + 1) % q.length]; a += p[0] * r[1] - r[0] * p[1]; } return a / 2; }
function centroid(q) { let x = 0, y = 0; for (const p of q) { x += p[0]; y += p[1]; } return [x / q.length, y / q.length]; }
/** N points evenly along the polyline (by length) */
function resample(q, N, closed) {
  const pts = closed ? q.concat([q[0]]) : q, L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  if (!total) return Array.from({ length: N }, () => pts[0].slice());
  const out = []; let j = 1;
  for (let k = 0; k < N; k++) {
    const d = closed ? total * k / N : total * k / (N - 1);
    while (j < L.length - 1 && L[j] < d) j++;
    const t = (d - L[j - 1]) / ((L[j] - L[j - 1]) || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]);
  }
  return out;
}
/** smooth closed / open path through the points (Catmull-Rom → bezier) */
function smoothPath(v, closed) {
  const n = v.length, I = [], O = [];
  for (let k = 0; k < n; k++) {
    const a = v[k - 1] || (closed ? v[n - 1] : v[k]), b = v[k + 1] || (closed ? v[0] : v[k]);
    const t = [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6];
    I.push([-t[0], -t[1]]); O.push(t);
  }
  const r = x => Math.round(x * 100) / 100;
  return { v: v.map(p => [r(p[0]), r(p[1])]), i: I.map(p => [r(p[0]), r(p[1])]), o: O.map(p => [r(p[0]), r(p[1])]), c: !!closed };
}
/** best start-index shift of b to sit on a (both centred) */
function bestShift(a, b) {
  const ca = centroid(a), cb = centroid(b), N = a.length;
  let best = 0, bd = Infinity;
  for (let k = 0; k < N; k++) {
    let d = 0;
    for (let j = 0; j < N; j += Math.max(1, Math.floor(N / 48))) { const p = a[j], q = b[(j + k) % N]; d += (p[0] - ca[0] - q[0] + cb[0]) ** 2 + (p[1] - ca[1] - q[1] + cb[1]) ** 2; }
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * Stages (each a list of paths) → the same stages with equal path counts and point counts, aligned to each other.
 * → { stages: [[path…]…], points, paths }
 */
function matchStages(stages, { maxPoints = 96, minPoints = 24 } = {}) {
  const prepped = stages.map(paths => paths.filter(p => p && p.v && p.v.length > 1).map(p => {
    const poly = flatten(p);
    return { poly, closed: !!p.c, area: Math.abs(signedArea(poly)), centre: centroid(poly), verts: p.v.length };
  }).sort((x, y) => y.area - x.area));
  if (prepped.some(s => !s.length)) throw new Error('فيه شكل من غير مسارات');
  const count = Math.min(60, Math.max(...prepped.map(s => s.length)));
  const N = Math.max(minPoints, Math.min(maxPoints, Math.max(...prepped.flat().map(p => p.verts * 4))));
  const out = prepped.map(() => []);
  for (let k = 0; k < count; k++) {
    let prev = null;
    prepped.forEach((s, si) => {
      // a stage with fewer paths: the extra ones grow from / shrink to a point (at the matching path of a neighbour stage)
      let src = s[k];
      if (!src) {
        const other = prepped.find(x => x[k]), at = other[k].centre;
        src = { poly: [at, at, at], closed: other[k].closed, collapsed: true };
      }
      let r = resample(src.poly, N, src.closed);
      if (prev) {
        if (src.closed) {
          if (!src.collapsed && Math.sign(signedArea(r)) !== Math.sign(signedArea(prev)) && signedArea(prev) !== 0) r.reverse();
          const sh = bestShift(prev, r); r = r.slice(sh).concat(r.slice(0, sh));
        } else {
          const d1 = Math.hypot(r[0][0] - prev[0][0], r[0][1] - prev[0][1]), d2 = Math.hypot(r[N - 1][0] - prev[0][0], r[N - 1][1] - prev[0][1]);
          if (d2 < d1) r.reverse();
        }
      }
      prev = r;
      out[si].push(smoothPath(r, src.closed));
    });
  }
  return { stages: out, points: N, paths: count };
}

module.exports = { flatten, resample, smoothPath, matchStages, signedArea, centroid };

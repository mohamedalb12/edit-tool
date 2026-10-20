'use strict';
// إبراز مبنى / أرض (إعلانات العقارات): حدود المبنى بتتتبّع (منظور كامل من نقط الحدود نفسها) أو ماسك بالـ AI،
// والباقي يتلوّن (أزرق / أي لون / أبيض وأسود) والمبنى بلونه — أو المبنى نفسه يتلوّن — بأوباسيتي على سلايدرز.

/** solve A x = b (Gaussian elimination, partial pivoting) */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
/**
 * Homography src → dst (≥ 4 point pairs, least squares). With 3 points: an affine map. → 3×3 as [a..i] (i = 1)
 */
function homography(src, dst) {
  const n = Math.min(src.length, dst.length);
  if (n < 3) return null;
  if (n === 3) {
    // affine: x' = a x + b y + c, y' = d x + e y + f
    const A = [], b = [];
    for (let k = 0; k < 3; k++) { A.push([src[k][0], src[k][1], 1, 0, 0, 0]); b.push(dst[k][0]); A.push([0, 0, 0, src[k][0], src[k][1], 1]); b.push(dst[k][1]); }
    const x = solve(A, b); return x ? [x[0], x[1], x[2], x[3], x[4], x[5], 0, 0, 1] : null;
  }
  // normalise for stability
  const norm = pts => { const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length; const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1, k = Math.SQRT2 / d; return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], p: pts.map(q => [(q[0] - cx) * k, (q[1] - cy) * k]) }; };
  const S = norm(src.slice(0, n)), D = norm(dst.slice(0, n));
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
  const add = (row, v) => { for (let i = 0; i < 8; i++) { Atb[i] += row[i] * v; for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j]; } };
  for (let k = 0; k < n; k++) {
    const [x, y] = S.p[k], [u, v] = D.p[k];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(AtA, Atb);
  if (!h) return null;
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  // H = D⁻¹ · Hn · S
  const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
  const Dinv = (() => { const k = D.T[0]; return [1 / k, 0, -D.T[2] / k, 0, 1 / k, -D.T[5] / k, 0, 0, 1]; })();
  const H = mul(mul(Dinv, Hn), S.T);
  return H.map(x => x / H[8]);
}
function apply(H, p) { const w = H[6] * p[0] + H[7] * p[1] + H[8]; return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w]; }

/**
 * The outline through the shot: every vertex tracked on its own, then one perspective map per frame fitted to the
 * vertices that tracked well (a lost / occluded corner follows the others), then a light temporal smoothing.
 * tracks: [[{x, y, err}] per frame] per vertex → [[ [x, y] per vertex ] per frame]
 */
function fitOutline(tracks, { maxErr = 32, smooth = 1 } = {}) {
  const nV = tracks.length, nF = tracks[0].length, P0 = tracks.map(t => [t[0].x, t[0].y]);
  const out = [];
  for (let f = 0; f < nF; f++) {
    let use = tracks.map((t, i) => i).filter(i => tracks[i][f].err <= maxErr);
    if (use.length < 3) { out.push(out.length ? out[out.length - 1] : P0); continue; }
    const cur = i => [tracks[i][f].x, tracks[i][f].y];
    let H = homography(use.map(i => P0[i]), use.map(cur));
    if (use.length > 4) {
      // RANSAC: the map most corners agree with (a tracker that slid off doesn't drag the outline)
      const thr = Math.max(2, 0.01 * Math.hypot(...P0.reduce((m, p) => [Math.max(m[0], p[0]), Math.max(m[1], p[1])], [0, 0]))), err = (M, i) => { const q = apply(M, P0[i]), c = cur(i); return Math.hypot(q[0] - c[0], q[1] - c[1]); };
      let best = null, bestIn = [];
      const combos = [];
      for (let a = 0; a < use.length; a++) for (let b = a + 1; b < use.length; b++) for (let c = b + 1; c < use.length; c++) for (let d = c + 1; d < use.length; d++) combos.push([a, b, c, d]);
      for (const cb of combos.slice(0, 400)) {
        const sub = cb.map(k => use[k]), M = homography(sub.map(i => P0[i]), sub.map(cur));
        if (!M) continue;
        const inl = use.filter(i => err(M, i) <= thr);
        if (inl.length > bestIn.length) { best = M; bestIn = inl; if (inl.length === use.length) break; }
      }
      if (best && bestIn.length >= 4) { use = bestIn; H = homography(use.map(i => P0[i]), use.map(cur)) || best; }
    }
    out.push(H ? P0.map(p => apply(H, p)) : tracks.map(t => [t[f].x, t[f].y]));
  }
  if (smooth > 0 && nF > 2) {
    const sm = out.map((poly, f) => poly.map((p, v) => {
      let x = 0, y = 0, n = 0;
      for (let k = Math.max(0, f - smooth); k <= Math.min(nF - 1, f + smooth); k++) { x += out[k][v][0]; y += out[k][v][1]; n++; }
      return [x / n, y / n];
    }));
    return sm.map(poly => poly.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]));
  }
  return out.map(poly => poly.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]));
}

/**
 * Whatever the segmentation model sent back → a clean grey mask (255 = the building):
 * a plain black / white mask (picked so the clicked point is white), or the picture with the object highlighted
 * (the mask = what changed from the original frame).
 */
function maskFrom(res, orig, w, h, click) {
  const n = w * h, out = Buffer.alloc(n);
  let transparent = 0, extreme = 0;
  for (let i = 0; i < n; i++) {
    const r = res[i * 4], g = res[i * 4 + 1], b = res[i * 4 + 2], a = res[i * 4 + 3];
    if (a < 250) transparent++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 30 || mn > 225) extreme++;
  }
  if (transparent > n * 0.05) { for (let i = 0; i < n; i++) out[i] = res[i * 4 + 3] > 127 ? 255 : 0; return out; }
  if (extreme > n * 0.9) {
    const ci = Math.min(n - 1, Math.max(0, Math.round(click[1]) * w + Math.round(click[0])));
    const white = res[ci * 4] + res[ci * 4 + 1] + res[ci * 4 + 2] > 382;
    for (let i = 0; i < n; i++) { const on = res[i * 4] + res[i * 4 + 1] + res[i * 4 + 2] > 382; out[i] = on === white ? 255 : 0; }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const d = Math.abs(res[i * 4] - orig[i * 4]) + Math.abs(res[i * 4 + 1] - orig[i * 4 + 1]) + Math.abs(res[i * 4 + 2] - orig[i * 4 + 2]);
    out[i] = d > 60 ? 255 : 0;
  }
  return out;
}
/** bounding box of a mask (for the next frame's box prompt), grown by `pad` */
function maskBox(mask, w, h, pad = 0.08) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const px = (x1 - x0) * pad, py = (y1 - y0) * pad;
  return { x_min: Math.max(0, Math.round(x0 - px)), y_min: Math.max(0, Math.round(y0 - py)), x_max: Math.min(w - 1, Math.round(x1 + px)), y_max: Math.min(h - 1, Math.round(y1 + py)) };
}
function centroid(poly) { return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]; }

const PRESETS = {
  'blue-rest': { name: 'الباقي أزرق والمبنى طبيعي', rest: { color: '#1d4ed8', opacity: 70 }, building: { color: '#f97316', opacity: 0 }, outline: { color: '#ffffff', width: 4, glow: 40 } },
  'bw-rest': { name: 'الباقي أبيض وأسود', rest: { color: '#ffffff', opacity: 100, bw: true }, building: { color: '#f97316', opacity: 0 }, outline: { color: '#fbbf24', width: 4, glow: 30 } },
  'gold': { name: 'ذهبي فاخر', rest: { color: '#0f172a', opacity: 55, dim: 25 }, building: { color: '#fbbf24', opacity: 35 }, outline: { color: '#fde68a', width: 5, glow: 70 } },
  'color-building': { name: 'المبنى ملوّن', rest: { color: '#1d4ed8', opacity: 0 }, building: { color: '#f97316', opacity: 55 }, outline: { color: '#f97316', width: 5, glow: 50 } },
  'focus': { name: 'الباقي غامق ومبلّر', rest: { color: '#0b0806', opacity: 0, dim: 45, blur: 8 }, building: { color: '#f97316', opacity: 0 }, outline: { color: '#ffffff', width: 3, glow: 30 } }
};

module.exports = { homography, apply, fitOutline, maskFrom, maskBox, centroid, PRESETS, solve };

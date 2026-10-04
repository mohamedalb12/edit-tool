'use strict';
// محرر المنحنيات: إيزينج (cubic-bezier وغيره) + "تخبيز" المنحنى على الكي فريمز الموجودة.
(function (root, factory) {
  // Works as a <script> in the panel AND via require() — in Premiere's mixed context both window and module exist.
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EFCurves = api;
})(typeof window !== 'undefined' ? window : null, function () {

  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    function solveX(x) {
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6) return t; if (Math.abs(d) < 1e-6) break; t -= e / d; }
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return t;
    }
    const fn = x => x <= 0 ? 0 : x >= 1 ? 1 : sy(solveX(x));
    fn.bezier = [x1, y1, x2, y2];
    return fn;
  }

  function elasticOut(t) { if (t <= 0) return 0; if (t >= 1) return 1; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1; }
  function bounceOut(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }

  const PRESETS = {
    linear: { label: 'خطي', fn: t => t },
    ease: { label: 'ناعم', fn: cubicBezier(0.25, 0.1, 0.25, 1) },
    easeIn: { label: 'دخول ناعم', fn: cubicBezier(0.42, 0, 1, 1) },
    easeOut: { label: 'خروج ناعم', fn: cubicBezier(0, 0, 0.58, 1) },
    easeInOut: { label: 'ناعم من الناحيتين', fn: cubicBezier(0.42, 0, 0.58, 1) },
    expoOut: { label: 'سريع ثم هادي (Expo)', fn: cubicBezier(0.16, 1, 0.3, 1) },
    expoInOut: { label: 'سموذ قوي (Expo)', fn: cubicBezier(0.87, 0, 0.13, 1) },
    backOut: { label: 'بيعدّي ويرجع', fn: cubicBezier(0.34, 1.56, 0.64, 1) },
    backIn: { label: 'يرجع لورا ويطلق', fn: cubicBezier(0.36, 0, 0.66, -0.56) },
    elastic: { label: 'مطاطي', fn: elasticOut },
    bounce: { label: 'نطّة', fn: bounceOut }
  };

  function getEasing(e) {
    if (typeof e === 'function') return e;
    if (Array.isArray(e) && e.length === 4) return cubicBezier.apply(null, e);
    return (PRESETS[e] || PRESETS.linear).fn;
  }

  function lerp(a, b, t) {
    if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * t);
    return a + (b - a) * t;
  }

  /**
   * keys: [{t, v}] sorted by t (seconds). Returns a dense key list where every segment
   * between two original keys follows `easing`. Sampling rate = fps (frame accurate).
   */
  function bake(keys, easing, { fps = 30, maxPerSegment = 60 } = {}) {
    const ease = getEasing(easing);
    const k = keys.slice().sort((a, b) => a.t - b.t);
    if (k.length < 2) return k.map(x => ({ t: x.t, v: x.v }));
    const out = [];
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i], b = k[i + 1], d = b.t - a.t;
      const steps = Math.max(1, Math.min(maxPerSegment, Math.round(d * fps)));
      for (let s = 0; s < steps; s++) {
        const u = s / steps;
        out.push({ t: +(a.t + d * u).toFixed(6), v: s === 0 ? a.v : lerp(a.v, b.v, ease(u)) });
      }
    }
    const last = k[k.length - 1];
    out.push({ t: last.t, v: last.v });
    return out;
  }

  /** Points for drawing the curve of a property (value over time). */
  function sample(keys, easing, n = 120) {
    const k = keys.slice().sort((a, b) => a.t - b.t);
    if (!k.length) return [];
    const ease = getEasing(easing);
    const t0 = k[0].t, t1 = k[k.length - 1].t, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      let j = 0; while (j < k.length - 2 && t > k[j + 1].t) j++;
      const a = k[j], b = k[Math.min(j + 1, k.length - 1)];
      const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      const v = lerp(a.v, b.v, ease(Math.min(1, Math.max(0, u))));
      pts.push({ t, v: Array.isArray(v) ? v[0] : v });
    }
    return pts;
  }

  return { cubicBezier, PRESETS, getEasing, bake, sample, lerp, elasticOut, bounceOut };
});

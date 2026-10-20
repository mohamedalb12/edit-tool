'use strict';
// A tiny After Effects expression evaluator for tests: layers by name in one comp, transform.position / rotation /
// scale / anchorPoint (with their expressions), effect("x")("Slider"), toComp / fromComp (2D, with parents),
// the vector helpers, createPath, linear, clamp, seedRandom/random. Enough to check rigs and generated motion numerically.

/** "a;b;if(x){y}c" → "a;b;if(x){y}return (c);" — the last top-level statement is the expression's value */
function lastAsReturn(code) {
  const src = code.replace(/;\s*$/, '');
  let depth = 0, cut = -1, q = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { depth--; if (ch === '}' && depth === 0) cut = i; }
    else if (ch === ';' && depth === 0) cut = i;
  }
  return src.slice(0, cut + 1) + 'return (' + src.slice(cut + 1) + ');';
}

function make(spec, { width = 1920, height = 1080 } = {}) {
  // spec.layers: normalized scene layers (transform, expressions, effects with labels) + optional overrides
  const byName = new Map(spec.layers.map(l => [l.name, l]));
  const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map(v => v * k), div = (a, k) => a.map(v => v / k);
  const length = (a, b) => { const d = b ? sub(a, b) : a; return Math.hypot(...d); };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const linear = (t, t0, t1, v0, v1) => { if (t1 === undefined) { [v0, v1, t0, t1] = [t0, t1, 0, 1]; } const u = clamp((t - t0) / (t1 - t0), 0, 1); return Array.isArray(v0) ? v0.map((x, i) => x + (v1[i] - x) * u) : v0 + (v1 - v0) * u; };
  const radiansToDegrees = r => r * 180 / Math.PI;
  let seed = 1;
  const seedRandom = s => { seed = (Math.abs(Math.round(s)) * 9301 + 49297) % 233280 || 1; };
  const random = (a, b) => { seed = (seed * 9301 + 49297) % 233280; const u = seed / 233280; if (Array.isArray(a)) return a.map((x, i) => x + (b[i] - x) * u); if (b === undefined) return a === undefined ? u : u * a; return a + (b - a) * u; };
  const createPath = (points, inT, outT, closed) => ({ points, inT, outT, closed });
  const stack = new Set();

  function base(L, prop) {
    const t = L.transform || {};
    if (prop === 'position') return (t.position || [width / 2, height / 2]).slice(0, 2);
    if (prop === 'anchor') return (t.anchor || [0, 0]).slice(0, 2);
    if (prop === 'scale') { const s = t.scale === undefined ? 100 : t.scale; return Array.isArray(s) ? s.slice(0, 2) : [s, s]; }
    if (prop === 'rotation') return t.rotation || 0;
    if (prop === 'opacity') return t.opacity === undefined ? 100 : t.opacity;
    return t[prop];
  }
  function value(name, prop, time) {
    const L = byName.get(name);
    if (!L) throw new Error('no layer ' + name);
    const key = name + '|' + prop + '|' + time;
    if (stack.has(key)) throw new Error('expression cycle at ' + key);
    const ex = (L.expressions || {})[prop];
    const v = base(L, prop);
    if (!ex) return v;
    stack.add(key);
    try { return run(L, ex, time, v); } finally { stack.delete(key); }
  }
  function layerObj(name, time) {
    const L = byName.get(name);
    if (!L) throw new Error('no layer ' + name);
    const self = {
      name,
      get transform() { return { get position() { return value(name, 'position', time); }, get rotation() { return value(name, 'rotation', time); }, get scale() { return value(name, 'scale', time); }, get anchorPoint() { return value(name, 'anchor', time); } }; },
      get position() { return value(name, 'position', time); }, get rotation() { return value(name, 'rotation', time); }, get scale() { return value(name, 'scale', time); }, get anchorPoint() { return value(name, 'anchor', time); },
      get hasParent() { return !!L.parent; },
      get parent() { return layerObj(L.parent, time); },
      effect(label) { const e = (L.effects || []).find(x => x.label === label || x.name === label); if (!e) throw new Error('no effect ' + label + ' on ' + name); const v = Object.values(e.params)[0]; return () => (v === undefined ? 0 : v); },
      toComp(p) { return toComp(name, p, time); }, fromComp(p) { return fromComp(name, p, time); }
    };
    return self;
  }
  function matrix(name, time) {
    const L = byName.get(name), a = value(name, 'anchor', time), p = value(name, 'position', time), s = value(name, 'scale', time), r = value(name, 'rotation', time) * Math.PI / 180;
    let M = { a: Math.cos(r) * s[0] / 100, b: Math.sin(r) * s[0] / 100, c: -Math.sin(r) * s[1] / 100, d: Math.cos(r) * s[1] / 100 };
    M.e = p[0] - (M.a * a[0] + M.c * a[1]); M.f = p[1] - (M.b * a[0] + M.d * a[1]);
    if (L.parent) { const P = matrix(L.parent, time); M = { a: P.a * M.a + P.c * M.b, b: P.b * M.a + P.d * M.b, c: P.a * M.c + P.c * M.d, d: P.b * M.c + P.d * M.d, e: P.a * M.e + P.c * M.f + P.e, f: P.b * M.e + P.d * M.f + P.f }; }
    return M;
  }
  function toComp(name, p, time) { const M = matrix(name, time); return [M.a * p[0] + M.c * p[1] + M.e, M.b * p[0] + M.d * p[1] + M.f]; }
  function fromComp(name, p, time) { const M = matrix(name, time), det = M.a * M.d - M.b * M.c, x = p[0] - M.e, y = p[1] - M.f; return [(M.d * x - M.c * y) / det, (-M.b * x + M.a * y) / det]; }
  function run(L, code, time, val) {
    const thisComp = { layer: n => layerObj(n, time), width, height };
    const thisLayer = layerObj(L.name, time);
    const fn = new Function('time', 'value', 'thisComp', 'thisLayer', 'add', 'sub', 'mul', 'div', 'length', 'clamp', 'linear', 'radiansToDegrees', 'seedRandom', 'random', 'createPath', 'fromComp', 'toComp', 'index',
      // the last expression statement is the value
      lastAsReturn(code));
    return fn(time, val, thisComp, thisLayer, add, sub, mul, div, length, clamp, linear, radiansToDegrees, seedRandom, random, createPath, p => thisLayer.fromComp(p), p => thisLayer.toComp(p), 1);
  }
  return { value, toComp, fromComp, layer: layerObj };
}

module.exports = { make };

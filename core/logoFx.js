'use strict';
// لوجوهات وأشكال: صورة / SVG → أجزاء → مشهد (بيترسم، نيون، بيتبني، ثري دي، مورف). كله بيطلع "وصف مشهد" عادي
// يتبني بنفس طريقة المونتير الذكي (ليرز أشكال حقيقية تتعدّل).
const fs = require('fs');
const svg = require('./svgPath');
const svgFile = require('./svgFile');
const trace = require('./trace');
const morph = require('./morph');

const STYLES = { draw: 'بيترسم بخط وبعدين يتملي', outline: 'خط بس بيترسم', neon: 'نيون منوّر', build: 'الأجزاء بتتبني ورا بعض', '3d': 'ثري دي مجسّم بكاميرا', static: 'شكل ثابت (من غير حركة)' };

/** a logo / icon / image file → vector art { width, height, items, bg } */
async function loadArt(file, { ffmpeg, ffprobe, colors = 0, detail = 3 } = {}) {
  if (/\.svg$/i.test(file)) return Object.assign(svgFile.parse(fs.readFileSync(file, 'utf8')), { source: 'svg' });
  if (!ffmpeg) throw new Error('ffmpeg مش متسطب — لازم عشان أقرا الصورة');
  return Object.assign(await trace.traceFile(ffmpeg, ffprobe, file, { colors, detail }), { source: 'trace' });
}

function lighten(hex, k) {
  const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0xffffff, r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = x => Math.round(x + (255 - x) * k).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
/** many small items with the same colours → one item each (keeps layers few) */
function mergeByColour(items, max = 30) {
  if (items.length <= max) return items;
  const by = new Map();
  for (const it of items) { const k = (it.fill || '-') + '|' + (it.stroke || '-'); if (!by.has(k)) by.set(k, Object.assign({}, it, { paths: [] })); by.get(k).paths.push(...it.paths); }
  return [...by.values()].map((it, i) => Object.assign(it, { name: 'Part ' + (i + 1) }));
}
/**
 * Art → parts placed in the comp: each part's paths relative to its own centre, + where that centre goes.
 * fit = how much of the comp the art fills.
 */
function toParts(art, comp, { fit = 0.6 } = {}) {
  const items = mergeByColour(art.items || []);
  const all = items.flatMap(i => i.paths), b = svg.bbox(all);
  if (!all.length || !b.w || !b.h) throw new Error('مالقيتش أشكال في الملف');
  const s = Math.min(comp.width * fit / b.w, comp.height * fit / b.h), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const r = x => Math.round(x * 100) / 100;
  return items.map((it, k) => {
    const ps = it.paths.map(p => ({ v: p.v.map(q => [(q[0] - cx) * s, (q[1] - cy) * s]), i: p.i.map(q => [q[0] * s, q[1] * s]), o: p.o.map(q => [q[0] * s, q[1] * s]), c: p.c }));
    const pb = svg.bbox(ps), pc = [pb.x + pb.w / 2, pb.y + pb.h / 2];
    const local = ps.map(p => ({ v: p.v.map(q => [r(q[0] - pc[0]), r(q[1] - pc[1])]), i: p.i.map(q => [r(q[0]), r(q[1])]), o: p.o.map(q => [r(q[0]), r(q[1])]), c: p.c }));
    return { name: String(it.name || 'Part ' + (k + 1)).slice(0, 50), fill: it.fill || null, stroke: it.stroke || null, strokeWidth: it.strokeWidth ? it.strokeWidth * s : 0, paths: local,
      position: [r(comp.width / 2 + pc[0]), r(comp.height / 2 + pc[1])], centre: pc, size: [pb.w, pb.h], evenOdd: art.source === 'trace' || !!it.evenOdd, opacity: it.opacity };
  });
}

/** the logo animation as a raw scene (then aeScene.normalize → buildScene) */
function logoScene(parts, { style = 'draw', duration = 5, comp = { width: 1920, height: 1080 }, bg = '#0b0806', name = 'Logo', color } = {}) {
  const W = comp.width, H = comp.height, n = parts.length;
  const stag = Math.min(0.15, 1.2 / Math.max(1, n)), drawDur = 1.4;
  const sw = Math.max(2, Math.min(W, H) * 0.004);
  const layers = [];
  const ctrl = { type: 'null', name: name + ' Control', transform: { position: ['50%', '50%'] }, keys: { scale: [[drawDur + n * stag, 100, 'easeInOut'], [duration, 104, 'linear']] } };
  const fillOf = p => p.fill || (p.stroke ? null : '#ffffff');
  const shapeBase = (p, extra) => Object.assign({ items: [{ paths: p.paths }], fillRule: p.evenOdd ? 'evenodd' : undefined }, extra);
  parts.forEach((p, i) => {
    // positions are relative to the centred control null (its parent)
    const t = i * stag, pos = style === '3d' ? [p.position[0] - W / 2, p.position[1] - H / 2, 0] : [p.position[0] - W / 2, p.position[1] - H / 2], base = { parent: ctrl.name, transform: { position: pos } };
    const strokeCol = color || p.stroke || p.fill || '#ffffff';
    if (style === 'draw' || style === 'outline' || style === 'neon') {
      const neon = style === 'neon', nc = neon ? lighten(color || p.fill || p.stroke || '#f97316', 0.25) : strokeCol;
      layers.push(Object.assign({}, base, { type: 'shape', name: p.name + ' Line', motionBlur: true,
        shape: shapeBase(p, { fill: null, stroke: nc, strokeWidth: p.stroke && p.strokeWidth ? p.strokeWidth : (neon ? sw * 1.3 : sw), trim: { end: 0, individually: true }, lineCap: 'round' }),
        keys: Object.assign({ 'shape:trimEnd': [[t, 0, 'easeInOut'], [t + drawDur, 100]] },
          style === 'draw' && fillOf(p) && !p.stroke ? { 'shape:strokeWidth': [[t + drawDur * 0.9, sw, 'easeIn'], [t + drawDur + 0.5, 0]] } : {},
          neon ? { opacity: [[t + drawDur, 100, 'hold'], [t + drawDur + 0.08, 30, 'hold'], [t + drawDur + 0.14, 100, 'hold'], [t + drawDur + 0.22, 45, 'hold'], [t + drawDur + 0.3, 100]] } : {}),
        effects: neon ? [{ name: 'glow', params: { threshold: 20, radius: 25, intensity: 2.5 } }, { name: 'glow', params: { threshold: 30, radius: 80, intensity: 1 } }] : [],
        expressions: neon ? { opacity: 'time<' + (t + drawDur + 0.35).toFixed(2) + '?value:96+Math.sin(time*37)*4' } : {} }));
    }
    if ((style === 'draw' && fillOf(p)) || style === 'build' || style === '3d' || style === 'static') {
      const L = Object.assign({}, base, { type: 'shape', name: p.name, motionBlur: style === 'build',
        shape: shapeBase(p, { fill: fillOf(p), stroke: p.stroke || null, strokeWidth: p.strokeWidth || undefined }), keys: {}, transform: { position: pos } });
      if (style === 'draw') L.keys['shape:fillOpacity'] = [[t + drawDur * 0.75, 0, 'easeOut'], [t + drawDur + 0.4, 100]];
      if (style === 'build') {
        const ang = Math.atan2(p.centre[1], p.centre[0]) || (i * 2.4), d = Math.min(W, H) * 0.08;
        L.keys = { scale: [[t, 0, 'backOut'], [t + 0.6, 100]], opacity: [[t, 0], [t + 0.15, 100]], rotation: [[t, i % 2 ? 25 : -25, 'expoOut'], [t + 0.8, 0]],
          position: [[t, [pos[0] + Math.cos(ang) * d, pos[1] + Math.sin(ang) * d], 'expoOut'], [t + 0.7, pos]] };
      }
      if (style === '3d') { L.extrude = { depth: Math.max(20, Math.min(W, H) * 0.05), bevel: 4, bevelStyle: 'convex' }; L.threeD = true; }
      layers.push(L);
    }
  });
  if (style === '3d') {
    ctrl.threeD = true; ctrl.transform.position = ['50%', '50%', 0];
    ctrl.keys = { rotationY: [[0, -60, 'expoOut'], [2.2, 0, 'easeInOut'], [duration, 12]], rotationX: [[0, 25, 'expoOut'], [2.2, 0]], scale: [[0, 70, 'expoOut'], [2.2, 100]] };
    layers.push(ctrl,
      { type: 'camera', name: 'Camera', camera: { zoom: Math.round(W * 1.4) }, transform: { position: ['50%', '50%', -Math.round(W * 1.4)] }, keys: { position: [[0, ['50%', '50%', -Math.round(W * 1.6)], 'easeInOut'], [duration, ['52%', '48%', -Math.round(W * 1.3)]]] } },
      { type: 'light', name: 'Key Light', lightType: 'point', light: { intensity: 110, castsShadows: 1 }, transform: { position: ['25%', '15%', -800] } },
      { type: 'light', name: 'Fill Light', lightType: 'ambient', light: { intensity: 35 } });
  } else layers.push(ctrl);
  return { comp: { create: true, name: name + ' — ' + style, duration, bg, width: W, height: H }, layers };
}

/* ---------------- morph ---------------- */
/** AE parametric shapes (rect / ellipse / star) → paths, so they can morph too */
function paramPath(s) {
  const P = s.position || [0, 0];
  if (s.kind === 'rect') {
    const w = s.size[0], h = s.size[1], r = Math.min(s.round || 0, w / 2, h / 2), x = P[0] - w / 2, y = P[1] - h / 2;
    return r ? svg.parse(`M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`)[0] : svg.rect(x, y, w, h);
  }
  if (s.kind === 'ellipse') return svg.ellipse(P[0], P[1], s.size[0], s.size[1]);
  if (s.kind === 'star') {
    const n = Math.max(3, Math.round(s.points || 5)), pts = [], rot = ((s.rotation || 0) - 90) * Math.PI / 180, star = s.type === 1;
    for (let k = 0; k < (star ? n * 2 : n); k++) { const r = star && k % 2 ? s.inner : s.outer, a = rot + k * Math.PI * 2 / (star ? n * 2 : n); pts.push([P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r]); }
    return svg.fromPoints(pts, { closed: true });
  }
  return null;
}
/** a transform {anchor, position, scale, rotation} on a path (the shape groups, then the layer) */
function xf(p, t) {
  const a = t.anchor || [0, 0], pos = t.position || [0, 0], sc = t.scale || [100, 100], r = (t.rotation || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const lin = q => { const x = q[0] * sc[0] / 100, y = q[1] * sc[1] / 100; return [x * c - y * s, x * s + y * c]; };
  const pt = q => { const l = lin([q[0] - a[0], q[1] - a[1]]); return [l[0] + pos[0], l[1] + pos[1]]; };
  return { v: p.v.map(pt), i: p.i.map(lin), o: p.o.map(lin), c: p.c };
}
/** what readShapes returned for one layer → its paths in comp space */
function layerPaths(L) {
  const out = [];
  for (const s of L.paths || []) {
    let p = s.v ? { v: s.v, i: s.i, o: s.o, c: s.c } : paramPath(s);
    if (!p) continue;
    for (const g of s.xf || []) p = xf(p, g);
    out.push(xf(p, L.layer || {}));
  }
  return out;
}
/**
 * Morph between stages (each: { paths (comp space), fill, stroke, name }) → raw scene with ONE shape layer whose
 * paths (and colour) are keyed stage → stage. hold = time each shape stays; dur = time of each change.
 */
function morphScene(stages, { comp = { width: 1920, height: 1080 }, dur = 1, hold = 0.6, loop = false, name = 'EF Morph', where = 'here', ease = 'easeInOut' } = {}) {
  if (stages.length < 2) throw new Error('اختار شكلين أو أكتر (أو كلام) عشان أعمل مورف');
  const list = loop ? stages.concat([stages[0]]) : stages;
  const m = morph.matchStages(list.map(s => s.paths));
  const C = [comp.width / 2, comp.height / 2];
  const rel = p => ({ v: p.v.map(q => [q[0] - C[0], q[1] - C[1]]), i: p.i, o: p.o, c: p.c });
  const keys = {};
  const times = []; let t = 0.2;
  list.forEach((_, si) => { times.push(t); t += si < list.length - 1 ? hold + dur : 0; });
  for (let k = 0; k < m.paths; k++) {
    const arr = [];
    list.forEach((_, si) => { const pv = rel(m.stages[si][k]); arr.push([times[si], pv, ease]); if (si < list.length - 1 && hold > 0) arr.push([times[si] + hold, pv, ease]); });
    keys['shape:path.' + (k + 1)] = arr;
  }
  const fills = list.map(s => s.fill || '#f97316');
  if (fills.some(f => f !== fills[0])) {
    const arr = []; list.forEach((_, si) => { arr.push([times[si], fills[si], ease]); if (si < list.length - 1 && hold > 0) arr.push([times[si] + hold, fills[si], ease]); });
    keys['shape:fillColor'] = arr;
  }
  const first = m.stages[0].map(rel), anyStroke = list.find(s => s.stroke);
  const duration = Math.max(1, times[times.length - 1] + hold + 0.3);
  return {
    raw: { comp: { create: where !== 'here', name, duration, width: comp.width, height: comp.height }, layers: [{ type: 'shape', name, motionBlur: true, transform: { position: ['50%', '50%'] },
      shape: { items: [{ paths: first }], fill: fills[0], stroke: anyStroke ? anyStroke.stroke : null, strokeWidth: anyStroke ? anyStroke.strokeWidth || 4 : undefined }, keys }] },
    paths: m.paths, points: m.points, duration
  };
}

module.exports = { STYLES, loadArt, toParts, logoScene, mergeByColour, paramPath, xf, layerPaths, morphScene, lighten };

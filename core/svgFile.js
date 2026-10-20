'use strict';
// ملف SVG (من إليستريتور / فيجما / أيقونات) → أجزاء بألوانها ومساراتها، جاهزة تبقى ليرز أشكال في الأفتر (زي Overlord).
const svg = require('./svgPath');

const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080', purple: '#800080', pink: '#ffc0cb', currentcolor: '#000000' };

function attrs(s) {
  const o = {};
  for (const m of String(s).matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) o[m[1]] = m[3] !== undefined ? m[3] : m[4];
  if (o.style) for (const part of o.style.split(';')) { const [k, v] = part.split(':'); if (k && v !== undefined) o[k.trim()] = v.trim(); }
  return o;
}
function color(v, grads) {
  if (v === undefined) return undefined;
  v = String(v).trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;
  const u = /^url\(#([^)]+)\)/.exec(v); if (u) return grads[u[1]] || '#888888';
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  const rgb = /^rgba?\(([^)]+)\)/.exec(v);
  if (rgb) { const p = rgb[1].split(/[ ,]+/).map(x => /%$/.test(x) ? parseFloat(x) * 2.55 : +x); return '#' + p.slice(0, 3).map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  return NAMED[v] || '#000000';
}
/** "translate(…) scale(…) rotate(…) matrix(…)" → [a,b,c,d,e,f] */
function matrix(t) {
  let M = [1, 0, 0, 1, 0, 0];
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  for (const m of String(t || '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let N = [1, 0, 0, 1, 0, 0];
    if (m[1] === 'matrix' && a.length === 6) N = a;
    else if (m[1] === 'translate') N = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (m[1] === 'scale') N = [a[0], 0, 0, a[1] === undefined ? a[0] : a[1], 0, 0];
    else if (m[1] === 'rotate') {
      const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] || 0, cy = a[2] || 0;
      N = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (m[1] === 'skewX') N = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0];
    else if (m[1] === 'skewY') N = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
    M = mul(M, N);
  }
  return M;
}
const mulM = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
function apply(p, M) {
  const pt = q => [M[0] * q[0] + M[2] * q[1] + M[4], M[1] * q[0] + M[3] * q[1] + M[5]];
  const vecT = q => [M[0] * q[0] + M[2] * q[1], M[1] * q[0] + M[3] * q[1]];
  return { v: p.v.map(pt), i: p.i.map(vecT), o: p.o.map(vecT), c: p.c };
}
function shapePaths(tag, a) {
  const n = k => parseFloat(a[k]) || 0;
  if (tag === 'path') return svg.parse(a.d);
  if (tag === 'rect') {
    const x = n('x'), y = n('y'), w = n('width'), h = n('height'); let rx = a.rx !== undefined ? n('rx') : n('ry'), ry = a.ry !== undefined ? n('ry') : rx;
    if (!w || !h) return [];
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx) return [svg.rect(x, y, w, h)];
    return svg.parse(`M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`);
  }
  if (tag === 'circle') return n('r') ? [svg.ellipse(n('cx'), n('cy'), n('r') * 2, n('r') * 2)] : [];
  if (tag === 'ellipse') return n('rx') ? [svg.ellipse(n('cx'), n('cy'), n('rx') * 2, n('ry') * 2)] : [];
  if (tag === 'line') return [svg.fromPoints([[n('x1'), n('y1')], [n('x2'), n('y2')]])];
  if (tag === 'polyline' || tag === 'polygon') {
    const nums = String(a.points || '').split(/[\s,]+/).filter(Boolean).map(Number), pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return pts.length > 1 ? [svg.fromPoints(pts, { closed: tag === 'polygon' })] : [];
  }
  return [];
}

/** SVG text → { width, height, items: [{ name, fill, stroke, strokeWidth, paths }] } in drawing order (first = bottom) */
function parse(text) {
  text = String(text || '').replace(/<!--[\s\S]*?-->/g, '');
  const grads = {};
  for (const m of text.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const id = attrs(m[2]).id, stop = /<stop\b([^>]*)>/.exec(m[3]);
    if (id && stop) { const sa = attrs(stop[1]); grads[id.toLowerCase()] = color(sa['stop-color'] || '#888888', {}) || '#888888'; }
  }
  const root = /<svg\b([^>]*)>/.exec(text), ra = root ? attrs(root[1]) : {};
  const vb = String(ra.viewBox || ra.viewbox || '').split(/[\s,]+/).map(Number);
  let width = parseFloat(ra.width) || (vb.length === 4 ? vb[2] : 0), height = parseFloat(ra.height) || (vb.length === 4 ? vb[3] : 0);
  let base = [1, 0, 0, 1, 0, 0];
  if (vb.length === 4 && vb[2] > 0) { width = vb[2]; height = vb[3]; base = [1, 0, 0, 1, -vb[0], -vb[1]]; }
  const stack = [{ M: base, fill: '#000000', stroke: null, sw: 1, opacity: 1 }];
  const items = [];
  let skip = 0;
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g)) {
    const close = !!m[1], tag = m[2].toLowerCase(), selfClose = !!m[4];
    if (/^(defs|clippath|mask|symbol|pattern|lineargradient|radialgradient|style|title|desc|metadata|text)$/.test(tag)) {
      if (close) skip = Math.max(0, skip - 1); else if (!selfClose) skip++;
      continue;
    }
    if (skip) continue;
    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      if (tag === 'svg' && stack.length === 1 && !items.length && m.index === (root && root.index)) continue;
      const a = attrs(m[3]), top = stack[stack.length - 1];
      const ctx = { M: mulM(top.M, matrix(a.transform)), fill: a.fill !== undefined ? color(a.fill, grads) : top.fill, stroke: a.stroke !== undefined ? color(a.stroke, grads) : top.stroke, sw: a['stroke-width'] !== undefined ? parseFloat(a['stroke-width']) : top.sw, opacity: top.opacity * (a.opacity !== undefined ? +a.opacity : 1), id: a.id || top.id };
      if (!selfClose) stack.push(ctx);
      continue;
    }
    if (close) continue;
    const a = attrs(m[3]), top = stack[stack.length - 1];
    if (a.display === 'none' || a.visibility === 'hidden') continue;
    const M = mulM(top.M, matrix(a.transform));
    const paths = shapePaths(tag, a).map(p => apply(p, M));
    if (!paths.length) continue;
    const fill = a.fill !== undefined ? color(a.fill, grads) : top.fill, stroke = a.stroke !== undefined ? color(a.stroke, grads) : top.stroke;
    if (!fill && !stroke) continue;
    const scale = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
    items.push({ name: (a.id || top.id || tag) + ' ' + (items.length + 1), fill: tag === 'line' || tag === 'polyline' ? null : fill, stroke, strokeWidth: (a['stroke-width'] !== undefined ? parseFloat(a['stroke-width']) : top.sw) * scale, opacity: top.opacity * (a.opacity !== undefined ? +a.opacity : 1) * (a['fill-opacity'] !== undefined ? +a['fill-opacity'] : 1), paths, evenOdd: a['fill-rule'] === 'evenodd' || a['clip-rule'] === 'evenodd' });
    if (items.length >= 300) break;
  }
  if (!width || !height) { const b = svg.bbox(items.flatMap(i => i.paths)); width = b.x + b.w; height = b.y + b.h; }
  return { width, height, items };
}

module.exports = { parse, color, matrix };

'use strict';
// مسارات الأشكال: SVG path ("M10 10 C…Z") أو نقط → اللي الأفتر بيفهمه (vertices + tangents نسبةً لكل نقطة).
// path = { v: [[x,y]…], i: [[dx,dy]…], o: [[dx,dy]…], c: closed }

const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** SVG arc → cubic segments (endpoint parameterisation, SVG spec F.6) */
function arcToCubics(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const r = phi * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  let k = Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  if (!!large === !!sweep) k = -k;
  const cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), d = dt / n, a4 = 4 / 3 * Math.tan(d / 4);
  const pt = t => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dpt = t => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out = [];
  for (let s = 0; s < n; s++) {
    const ta = t1 + s * d, tb = ta + d, A = pt(ta), B = pt(tb), dA = dpt(ta), dB = dpt(tb);
    out.push([A[0] + a4 * dA[0], A[1] + a4 * dA[1], B[0] - a4 * dB[0], B[1] - a4 * dB[1], B[0], B[1]]);
  }
  return out;
}

/** "M… L… C… Q… A… Z" (absolute + relative, H V S T too) → [path] (one per sub-path) */
function parse(d) {
  const toks = String(d || '').match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lastC = null, lastQ = null, cur = null, guard = 0;
  const subs = [];
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const num = () => (isNum() ? +toks[i++] : NaN);
  const start = (x, y) => { cur = { v: [[x, y]], i: [[0, 0]], o: [[0, 0]], c: false }; subs.push(cur); };
  const lineTo = (x, y) => { if (!cur) start(cx, cy); cur.v.push([x, y]); cur.i.push([0, 0]); cur.o.push([0, 0]); };
  const curveTo = (x1, y1, x2, y2, x, y) => {
    if (!cur) start(cx, cy);
    const n = cur.v.length - 1;
    cur.o[n] = [x1 - cur.v[n][0], y1 - cur.v[n][1]];
    cur.v.push([x, y]); cur.i.push([x2 - x, y2 - y]); cur.o.push([0, 0]);
  };
  while (i < toks.length && guard++ < 20000) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') {
      if (cur) {
        cur.c = true;
        const n = cur.v.length - 1;
        if (n > 0 && near(cur.v[n], cur.v[0])) { cur.i[0] = cur.i[n]; cur.v.pop(); cur.i.pop(); cur.o.pop(); }
      }
      cx = sx; cy = sy; cur = null; lastC = lastQ = null; cmd = '';
      continue;
    }
    if (!isNum()) { cmd = ''; continue; }
    if (C === 'M') { const x = num() + ox, y = num() + oy; start(x, y); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
    if (C === 'L') { const x = num() + ox, y = num() + oy; lineTo(x, y); cx = x; cy = y; lastC = lastQ = null; }
    else if (C === 'H') { const x = num() + ox; lineTo(x, cy); cx = x; lastC = lastQ = null; }
    else if (C === 'V') { const y = num() + oy; lineTo(cx, y); cy = y; lastC = lastQ = null; }
    else if (C === 'C') { const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]; curveTo(...a); lastC = [a[2], a[3]]; lastQ = null; cx = a[4]; cy = a[5]; }
    else if (C === 'S') { const r = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy]; const a = [num() + ox, num() + oy, num() + ox, num() + oy]; curveTo(r[0], r[1], a[0], a[1], a[2], a[3]); lastC = [a[0], a[1]]; lastQ = null; cx = a[2]; cy = a[3]; }
    else if (C === 'Q' || C === 'T') {
      let q;
      if (C === 'Q') { q = [num() + ox, num() + oy]; } else q = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
      const x = num() + ox, y = num() + oy;
      curveTo(cx + 2 / 3 * (q[0] - cx), cy + 2 / 3 * (q[1] - cy), x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), x, y);
      lastQ = q; lastC = null; cx = x; cy = y;
    } else if (C === 'A') {
      const rx = num(), ry = num(), phi = num(), large = num(), sweep = num(), x = num() + ox, y = num() + oy;
      for (const s of arcToCubics(cx, cy, rx, ry, phi, large, sweep, x, y)) curveTo(...s);
      cx = x; cy = y; lastC = lastQ = null;
    } else { i++; continue; }
  }
  return subs.filter(s => s.v.length > 1 && s.v.every(p => isFinite(p[0]) && isFinite(p[1])) && s.i.concat(s.o).every(p => isFinite(p[0]) && isFinite(p[1]))).slice(0, 60)
    .map(s => (s.v.length > 2000 ? { v: s.v.slice(0, 2000), i: s.i.slice(0, 2000), o: s.o.slice(0, 2000), c: s.c } : s));
}

/** points [[x,y]…] → path; smooth = Catmull-Rom tangents */
function fromPoints(pts, { closed = false, smooth = false } = {}) {
  const v = (pts || []).filter(p => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])).slice(0, 2000).map(p => [+p[0], +p[1]]);
  const n = v.length, i = v.map(() => [0, 0]), o = v.map(() => [0, 0]);
  if (smooth && n > 2) {
    for (let k = 0; k < n; k++) {
      const a = v[k - 1] || (closed ? v[n - 1] : null), b = v[k + 1] || (closed ? v[0] : null);
      if (!a || !b) continue;
      const t = [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6];
      i[k] = [-t[0], -t[1]]; o[k] = t;
    }
  }
  return { v, i, o, c: !!closed };
}

/** rectangle / ellipse paths (masks) — x,y = top-left */
function rect(x, y, w, h) { return { v: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]], c: true }; }
function ellipse(cx, cy, w, h) {
  const k = 0.5523, rx = w / 2, ry = h / 2;
  return { v: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]], i: [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]], o: [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]], c: true };
}

function bbox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) for (const q of p.v) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}
/** move the paths so their box is centred on 0,0, scaled (keeping the aspect) to fit size [w,h] when given */
function fit(paths, size) {
  const b = bbox(paths), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let s = 1;
  if (size && b.w > 0 && b.h > 0) s = Math.min(size[0] / b.w, size[1] / b.h);
  else if (size && (b.w > 0 || b.h > 0)) s = (b.w > 0 ? size[0] / b.w : size[1] / b.h);
  const r = x => Math.round(x * 1000) / 1000;
  return paths.map(p => ({ v: p.v.map(q => [r((q[0] - cx) * s), r((q[1] - cy) * s)]), i: p.i.map(q => [r(q[0] * s), r(q[1] * s)]), o: p.o.map(q => [r(q[0] * s), r(q[1] * s)]), c: p.c }));
}

module.exports = { parse, fromPoints, rect, ellipse, bbox, fit, arcToCubics };

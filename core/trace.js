'use strict';
// من صورة / لوجو لمسارات (زي Image Trace في إليستريتور): الألوان بتتجمّع، كل لون بيتحوّل لمسارات بيزيير ناعمة.
// كله بيتعمل هنا في Node (ffmpeg بيفك الصورة بس) — مفيش حاجة بتتبعت برّه.
const { run } = require('./ffmpeg');

/** decode a still (or a video frame at t) to RGBA at most `max` px wide/high → { w, h, data } */
async function decode(ffmpeg, ffprobe, file, { max = 600, t = 0 } = {}) {
  const probe = require('./ffmpeg').probe;
  let W = 0, H = 0;
  try { const p = await probe(ffprobe, file); W = p.width; H = p.height; } catch (_) {}
  if (!W || !H) { W = max; H = max; }
  const s = Math.min(1, max / Math.max(W, H));
  const w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (t > 0) args.push('-ss', String(t));
  args.push('-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area,format=rgba`, '-f', 'rawvideo', '-');
  const { stdout } = await run(ffmpeg, args);
  const data = Buffer.from(stdout);
  if (data.length < w * h * 4) throw new Error('مقدرتش أقرا الصورة');
  return { w, h, data };
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const toHex = c => '#' + c.slice(0, 3).map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

/**
 * Which pixels are the logo, and which colour group each belongs to.
 * Background = transparent pixels, or (no alpha) the colour most of the border has.
 * → { labels: Int16Array (-1 = background), colors: [[r,g,b]], bg }
 */
function segment({ w, h, data }, { colors = 0, tolerance = 40 } = {}) {
  const n = w * h, labels = new Int16Array(n).fill(-1);
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) transparent++;
  let bg = null;
  if (transparent < n * 0.02) {
    // most common (quantised) border colour
    const count = new Map();
    const add = i => { const k = (data[i * 4] >> 4) << 8 | (data[i * 4 + 1] >> 4) << 4 | (data[i * 4 + 2] >> 4); count.set(k, (count.get(k) || 0) + 1); };
    for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
    let best = 0, key = 0; for (const [k, v] of count) if (v > best) { best = v; key = k; }
    // average of the border pixels in that bucket
    let r = 0, g = 0, b = 0, m = 0;
    const take = i => { const k = (data[i * 4] >> 4) << 8 | (data[i * 4 + 1] >> 4) << 4 | (data[i * 4 + 2] >> 4); if (k === key) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; m++; } };
    for (let x = 0; x < w; x++) { take(x); take((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { take(y * w); take(y * w + w - 1); }
    bg = [r / m, g / m, b / m];
  }
  const fg = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (bg && d2(p, bg) < tolerance * tolerance) continue;
    fg.push(i);
  }
  if (!fg.length) return { labels, colors: [], bg: bg ? toHex(bg) : null };
  // k-means (k-means++ seeding, deterministic) on a sample, then label everything
  const K = Math.max(1, Math.min(8, colors || 6));
  const step = Math.max(1, Math.floor(fg.length / 20000));
  const sample = []; for (let j = 0; j < fg.length; j += step) { const i = fg[j]; sample.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]); }
  const cents = [sample[Math.floor(sample.length / 2)].slice()];
  while (cents.length < K) {
    let far = -1, fd = -1;
    for (let j = 0; j < sample.length; j++) { let m = Infinity; for (const c of cents) m = Math.min(m, d2(sample[j], c)); if (m > fd) { fd = m; far = j; } }
    if (fd < 30 * 30) break; // no more distinct colours
    cents.push(sample[far].slice());
  }
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (const p of sample) { let b = 0, bd = Infinity; cents.forEach((c, k) => { const d = d2(p, c); if (d < bd) { bd = d; b = k; } }); sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++; }
    sum.forEach((s, k) => { if (s[3]) cents[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  // merge close colours (anti-aliasing shades), auto mode only keeps groups that matter
  const merged = [];
  for (const c of cents) { const m = merged.find(x => d2(x, c) < 45 * 45); if (!m) merged.push(c); }
  const cnt = new Array(merged.length).fill(0);
  for (const i of fg) {
    const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    let b = 0, bd = Infinity; merged.forEach((c, k) => { const d = d2(p, c); if (d < bd) { bd = d; b = k; } });
    labels[i] = b; cnt[b]++;
  }
  // tiny groups → their nearest big group
  const keep = merged.map((_, k) => cnt[k] >= fg.length * 0.004);
  if (!keep.some(Boolean)) keep[cnt.indexOf(Math.max(...cnt))] = true;
  const remap = merged.map((c, k) => { if (keep[k]) return k; let b = -1, bd = Infinity; merged.forEach((x, j) => { if (keep[j] && d2(x, c) < bd) { bd = d2(x, c); b = j; } }); return b; });
  const finalIdx = []; merged.forEach((_, k) => { if (keep[k]) finalIdx.push(k); });
  const newOf = merged.map((_, k) => finalIdx.indexOf(remap[k]));
  for (const i of fg) labels[i] = newOf[labels[i]];
  return { labels, colors: finalIdx.map(k => merged[k]), bg: bg ? toHex(bg) : null };
}

/** majority filter: single stray pixels in / out of a mask */
function clean(mask, w, h) {
  const out = new Uint8Array(mask);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += mask[(y + dy) * w + x + dx];
    out[y * w + x] = s >= 5 ? 1 : 0;
  }
  return out;
}

/**
 * Outlines of a binary mask: pixel-edge loops (outer clockwise, holes counter-clockwise on screen).
 * → [[ [x,y], … ]] corner coordinates
 */
function contours(mask, w, h) {
  const W1 = w + 1, out = new Map(); // vertex → list of next vertices
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const edge = (x0, y0, x1, y1) => { const k = y0 * W1 + x0; const l = out.get(k); const e = { to: y1 * W1 + x1, used: false }; if (l) l.push(e); else out.set(k, [e]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!at(x, y - 1)) edge(x, y, x + 1, y);
    if (!at(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) edge(x, y + 1, x, y);
  }
  const loops = [];
  for (const [start, list] of out) {
    for (const e0 of list) {
      if (e0.used) continue;
      const loop = []; let cur = start, e = e0, prevDir = null, guard = 0;
      while (e && !e.used && guard++ < 1e6) {
        e.used = true;
        loop.push([cur % W1, Math.floor(cur / W1)]);
        const dir = [(e.to % W1) - (cur % W1), Math.floor(e.to / W1) - Math.floor(cur / W1)];
        prevDir = dir; cur = e.to;
        const next = (out.get(cur) || []).filter(x => !x.used);
        if (next.length > 1) {
          // saddle: turn right (keeps diagonal pixels apart, like potrace's default)
          next.sort((a, b) => turn(prevDir, cur, a.to) - turn(prevDir, cur, b.to));
        }
        e = next[0];
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
  function turn(d, from, to) { const nd = [(to % W1) - (from % W1), Math.floor(to / W1) - Math.floor(from / W1)]; const cross = d[0] * nd[1] - d[1] * nd[0]; return cross > 0 ? 0 : cross === 0 ? 1 : 2; }
}

function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
/** Ramer–Douglas–Peucker on a closed polygon */
function simplify(pts, eps) {
  if (pts.length < 5) return pts;
  // split at the two farthest points so the closed loop becomes two open runs
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 64))) for (let j = i + 1; j < pts.length; j += Math.max(1, Math.floor(pts.length / 64))) { const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2; if (d > best) { best = d; a = i; b = j; } }
  const run1 = pts.slice(a, b + 1), run2 = pts.slice(b).concat(pts.slice(0, a + 1));
  const r1 = rdp(run1, eps), r2 = rdp(run2, eps);
  return r1.slice(0, -1).concat(r2.slice(0, -1));
}
function rdp(p, eps) {
  if (p.length < 3) return p;
  const [x1, y1] = p[0], [x2, y2] = p[p.length - 1], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-9;
  let idx = 0, dm = -1;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x2 * y1 - y2 * x1) / L; if (d > dm) { dm = d; idx = i; } }
  if (dm <= eps) return [p[0], p[p.length - 1]];
  return rdp(p.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(p.slice(idx), eps));
}
/** staircase → smooth: edge midpoints, simplify, then Catmull-Rom tangents except at corners */
function smoothLoop(loop, { eps = 0.9, corner = 65 } = {}) {
  const mids = loop.map((p, i) => { const q = loop[(i + 1) % loop.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  const v = simplify(mids, eps);
  if (v.length < 3) return null;
  const n = v.length, I = [], O = [];
  for (let k = 0; k < n; k++) {
    const a = v[(k - 1 + n) % n], p = v[k], b = v[(k + 1) % n];
    const u = [p[0] - a[0], p[1] - a[1]], w = [b[0] - p[0], b[1] - p[1]];
    const ang = Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])) * 180 / Math.PI;
    if (ang > corner) { I.push([0, 0]); O.push([0, 0]); continue; }
    const la = Math.hypot(u[0], u[1]), lb = Math.hypot(w[0], w[1]), t = [(b[0] - a[0]), (b[1] - a[1])], lt = Math.hypot(t[0], t[1]) || 1;
    I.push([-t[0] / lt * la / 3, -t[1] / lt * la / 3]); O.push([t[0] / lt * lb / 3, t[1] / lt * lb / 3]);
  }
  const r = x => Math.round(x * 100) / 100;
  return { v: v.map(p => [r(p[0]), r(p[1])]), i: I.map(p => [r(p[0]), r(p[1])]), o: O.map(p => [r(p[0]), r(p[1])]), c: true };
}

/**
 * Image pixels → vector art { width, height, bg, items: [{ name, fill, paths, area }] } (biggest first).
 * opts: colors (max groups, 0 = auto), detail 1..5 (more = more points), minArea (px)
 */
function vectorize(img, { colors = 0, detail = 3, tolerance = 40, minArea = 0 } = {}) {
  const { w, h } = img;
  const seg = segment(img, { colors, tolerance });
  const eps = [2.2, 1.5, 1, 0.7, 0.45][Math.max(1, Math.min(5, detail)) - 1];
  const minA = minArea || Math.max(4, w * h * 0.00004);
  const items = [];
  seg.colors.forEach((c, k) => {
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (seg.labels[i] === k) mask[i] = 1;
    mask = clean(mask, w, h);
    const paths = []; let total = 0;
    for (const loop of contours(mask, w, h)) {
      const a = area(loop);
      if (Math.abs(a) < minA) continue;
      const p = smoothLoop(loop, { eps });
      if (p) { paths.push(p); if (a > 0) total += a; }
    }
    if (paths.length) items.push({ name: 'Color ' + (k + 1), fill: toHex(c), paths: paths.slice(0, 400), area: total });
  });
  items.sort((a, b) => b.area - a.area);
  items.forEach((it, i) => { it.name = 'Part ' + (i + 1) + ' ' + it.fill; });
  return { width: w, height: h, bg: seg.bg, items };
}

async function traceFile(ffmpeg, ffprobe, file, opts = {}) {
  const img = await decode(ffmpeg, ffprobe, file, { max: opts.max || 600, t: opts.t || 0 });
  return vectorize(img, opts);
}

module.exports = { decode, segment, contours, smoothLoop, simplify, vectorize, traceFile, area };

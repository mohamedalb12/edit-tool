'use strict';
// سكيل من فيديوهات مرجعية: بترفع كام فيديو عاجبك، والإضافة بتحللهم على جهازك (من غير نت) وتطلع منهم "سكيل":
// إيقاع القطع، الزووم (بانش سريع ولا دخول ناعم)، الحركة، الفلاشات، الألوان والجريد، وهل القطع ماشي على البيت —
// وبعدين تطبّقه على شغلك أو Claude يشتغل بيه. كله في ~/.editfast/skills/<id>.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('./config');
const shots = require('./shots');

const AW = 96, AH = 54, AFPS = 10; // analysis size and rate: enough for cuts, zooms and colour, fast on a laptop

/* ---------------- pure analysis on raw frames ---------------- */
const gray = (rgb, n) => { const g = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 3) g[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2]; return g; };
function sample(img, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy;
}
/** mean |cur − prev scaled by s about the centre| over the inner 70% → how well "cur = prev zoomed by s" explains it */
function scaleError(prev, cur, w, h, s) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2, x0 = Math.round(w * 0.15), x1 = w - x0, y0 = Math.round(h * 0.15), y1 = h - y0;
  let e = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { e += Math.abs(cur[y * w + x] - sample(prev, w, h, cx + (x - cx) / s, cy + (y - cy) / s)); n++; }
  return e / n;
}
/** the zoom from prev to cur (1 = none, 1.05 = 5% in) or 1 when a zoom doesn't explain the change clearly */
function estimateScale(prev, cur, w, h, { range = 0.12, step = 0.01 } = {}) {
  const e1 = scaleError(prev, cur, w, h, 1);
  let best = 1, be = e1;
  for (let s = 1 - range; s <= 1 + range + 1e-9; s += step) { if (Math.abs(s - 1) < 1e-9) continue; const e = scaleError(prev, cur, w, h, s); if (e < be) { be = e; best = s; } }
  return { scale: be < e1 * 0.85 && e1 > 1.5 ? +best.toFixed(4) : 1, error: e1, best: be };
}
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** k-means on RGB samples, deterministic (seeded by brightness quantiles) → [{hex, share}] biggest first */
function palette(px, k = 5, iters = 10) {
  if (!px.length) return [];
  const lum = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const sorted = px.slice().sort((a, b) => lum(a) - lum(b));
  let cs = Array.from({ length: k }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor((i + 0.5) * sorted.length / k))].slice());
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      let bi = 0, bd = Infinity;
      cs.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = j; } });
      assign[i] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    cs = cs.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  const count = cs.map(() => 0); assign.forEach(a => count[a]++);
  return cs.map((c, j) => ({ hex: hex(c), share: +(count[j] / px.length).toFixed(3) })).filter(c => c.share > 0.02).sort((a, b) => b.share - a.share);
}

/**
 * Raw RGB frames (AW×AH at AFPS) → the measurements. Pure.
 * → { duration, cuts:[s], shots:{count, avg, median, p10, p90, perMin}, zoom:{punches:[{t,amount}], punchPerMin, punchAmount,
 *     smoothShare, smoothRate}, motion, flashes:{white, black, perMin}, color:{palette, brightness, contrast, saturation, warmth} }
 */
function analyzeFrames(frames, { fps = AFPS, w = AW, h = AH } = {}) {
  const n = w * h, N = frames.length, duration = N / fps;
  // cuts: PySceneDetect's adaptive detector on HSV scores
  const scores = []; let prevHSV = null;
  for (const f of frames) { const hsv = shots.toHSV(f, n); scores.push(prevHSV ? (md(hsv[0], prevHSV[0]) + md(hsv[1], prevHSV[1]) + md(hsv[2], prevHSV[2])) / 3 : 0); prevHSV = hsv; }
  const G = frames.map(f => gray(f, n));
  // a punch-in looks like a cut to the detector (the whole picture changes at once): keep it as a zoom when the
  // frame before, scaled, explains the frame after
  const punches = [], cutIdx = [];
  for (const i of shots.adaptiveCuts(scores, fps, { minSceneLen: 0.3 })) {
    const r = estimateScale(G[i - 1], G[i], w, h, { range: 0.3, step: 0.01 });
    if (r.scale !== 1 && r.best < r.error * 0.5) punches.push({ t: +(i / fps).toFixed(2), amount: +((r.scale - 1) * 100).toFixed(1) }); else cutIdx.push(i);
  }
  const isCut = new Set(cutIdx), cuts = cutIdx.map(i => +(i / fps).toFixed(2));
  const bounds = [0].concat(cutIdx, [N]), lens = [];
  for (let i = 1; i < bounds.length; i++) lens.push((bounds[i] - bounds[i - 1]) / fps);
  const L = G.map(g => { let s = 0; for (let i = 0; i < n; i++) s += g[i]; return s / n; });
  // zoom: a big scale step between two frames of the same shot = a punch-in/out; a steady drift over half a second = a smooth push
  const moves = []; let smooth = 0, smoothFrames = 0, rate = [];
  const shotOf = i => { let k = 0; while (k + 1 < bounds.length && bounds[k + 1] <= i) k++; return k; };
  for (let i = 1; i < N; i++) {
    if (isCut.has(i)) continue;
    const r = estimateScale(G[i - 1], G[i], w, h);
    moves.push(r.error);
    if (Math.abs(Math.log(r.scale)) >= 0.035) {
      if (!punches.some(p => Math.abs(i / fps - p.t) <= 0.4)) punches.push({ t: +(i / fps).toFixed(2), amount: +((r.scale - 1) * 100).toFixed(1) });
    }
  }
  punches.sort((a, b) => a.t - b.t);
  const half = Math.max(2, Math.round(fps / 2));
  for (let i = half; i < N; i += half) {
    if (shotOf(i) !== shotOf(i - half)) continue;
    let cutIn = false; for (let k = i - half + 1; k <= i; k++) if (isCut.has(k)) cutIn = true;
    if (cutIn || punches.some(p => p.t > (i - half) / fps && p.t <= i / fps + 0.05)) continue;
    smoothFrames++;
    const r = estimateScale(G[i - half], G[i], w, h, { range: 0.08, step: 0.005 });
    if (Math.abs(r.scale - 1) >= 0.008) { smooth++; rate.push(Math.abs(r.scale - 1) * fps / half * 100); }
  }
  // flashes: brightness jumps far over the frames before and comes back within 0.4 s
  let white = 0, black = 0;
  for (let i = 3; i < N - 1; i++) {
    const before = (L[i - 1] + L[i - 2] + L[i - 3]) / 3, back = L[Math.min(N - 1, i + Math.round(fps * 0.4))];
    if (L[i] - before > 45 && L[i] - back > 30 && L[i] > 170) { white++; i += 3; } else if (before - L[i] > 45 && L[i] < 25 && back - L[i] > 30) { black++; i += 3; }
  }
  // colour: samples from a frame every second
  const px = []; let sat = 0, bri = 0, con = 0, warm = 0, cn = 0;
  for (let i = 0; i < N; i += fps) {
    const f = frames[i], g = G[i]; let m = 0, m2 = 0;
    for (let p = 0; p < n; p++) { m += g[p]; m2 += g[p] * g[p]; }
    m /= n; bri += m; con += Math.sqrt(Math.max(0, m2 / n - m * m));
    for (let p = 0; p < n; p += 7) {
      const r = f[p * 3], gg = f[p * 3 + 1], b = f[p * 3 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      sat += mx ? (mx - mn) / mx : 0; warm += r - b; cn++; px.push([r, gg, b]);
    }
  }
  const fr = Math.max(1, Math.ceil(N / fps));
  return {
    duration: +duration.toFixed(2), cuts,
    shots: { count: lens.length, avg: +(duration / lens.length).toFixed(2), median: +median(lens).toFixed(2), p10: +pct(lens, 0.1).toFixed(2), p90: +pct(lens, 0.9).toFixed(2), perMin: +(cuts.length / (duration / 60)).toFixed(1) },
    zoom: { punches, punchPerMin: +(punches.length / (duration / 60)).toFixed(1), punchAmount: +median(punches.map(p => Math.abs(p.amount))).toFixed(1), smoothShare: smoothFrames ? +(smooth / smoothFrames).toFixed(2) : 0, smoothRate: +median(rate).toFixed(1) },
    motion: +median(moves).toFixed(1),
    flashes: { white, black, perMin: +((white + black) / (duration / 60)).toFixed(1) },
    color: { palette: palette(px), brightness: Math.round(bri / fr), contrast: Math.round(con / fr), saturation: +(sat / Math.max(1, cn)).toFixed(2), warmth: Math.round(warm / Math.max(1, cn)) }
  };
}
const md = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/** cuts that land on a beat (within 0.1 s) vs what chance would give → { bpm, onBeat (0–1), chance } */
function beatFit(cuts, beats, bpm) {
  if (!beats || beats.length < 4 || !cuts.length) return { bpm: bpm || 0, onBeat: 0, chance: 0 };
  const near = t => { let lo = 0, hi = beats.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] < t) lo = m; else hi = m; } return Math.min(Math.abs(beats[lo] - t), Math.abs(beats[hi] - t)); };
  const period = 60 / (bpm || 120);
  return { bpm: Math.round(bpm || 0), onBeat: +(cuts.filter(t => near(t) <= 0.1).length / cuts.length).toFixed(2), chance: +Math.min(1, 0.2 / period).toFixed(2) };
}

/* ---------------- ffmpeg side ---------------- */
function readFrames(ffmpeg, file, { maxSeconds = 180 } = {}) {
  return new Promise((resolve, reject) => {
    const size = AW * AH * 3, frames = [];
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-t', String(maxSeconds), '-an',
      '-vf', `fps=${AFPS},scale=${AW}:${AH}:force_original_aspect_ratio=decrease,pad=${AW}:${AH}:(ow-iw)/2:(oh-ih)/2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { windowsHide: true });
    let buf = Buffer.alloc(0), err = '';
    p.stdout.on('data', d => { buf = buf.length ? Buffer.concat([buf, d]) : d; while (buf.length >= size) { frames.push(Buffer.from(buf.subarray(0, size))); buf = buf.subarray(size); } });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (frames.length ? resolve(frames) : reject(new Error('مش قادر أقرا الفيديو: ' + (err.trim().slice(0, 200) || code)))));
  });
}
/** a 4×3 contact sheet of the video (evenly spaced) → jpg file */
function contactSheet(ffmpeg, file, out, duration) {
  return new Promise(resolve => {
    const every = Math.max(0.2, (duration || 12) / 12);
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', file, '-an', '-vf', `fps=1/${every.toFixed(3)},scale=320:-2,tile=4x3`, '-frames:v', '1', '-q:v', '4', out], { windowsHide: true });
    p.on('error', () => resolve(null)); p.on('close', () => resolve(fs.existsSync(out) ? out : null));
  });
}
/** one reference video → its measurements (+ its contact sheet when `sheet` is a path) */
async function analyzeVideo(ffmpeg, file, { sheet, maxSeconds = 180 } = {}) {
  const frames = await readFrames(ffmpeg, file, { maxSeconds });
  const a = analyzeFrames(frames);
  try { const b = await require('./beats').detect(ffmpeg, file, { duration: Math.min(maxSeconds, a.duration) }); a.music = beatFit(a.cuts, b.beats, b.bpm); } catch (_) { a.music = { bpm: 0, onBeat: 0, chance: 0 }; }
  if (sheet) a.sheet = await contactSheet(ffmpeg, file, sheet, a.duration);
  a.file = file; a.name = path.basename(file);
  return a;
}

/* ---------------- many references → one skill ---------------- */
function combine(refs) {
  const m = f => +median(refs.map(f)).toFixed(2);
  const colors = new Map();
  refs.forEach(r => (r.color.palette || []).forEach(c => colors.set(c.hex, (colors.get(c.hex) || 0) + c.share / refs.length)));
  const stats = {
    refs: refs.length, seconds: +refs.reduce((s, r) => s + r.duration, 0).toFixed(1),
    shotAvg: m(r => r.shots.avg), shotP10: m(r => r.shots.p10), shotP90: m(r => r.shots.p90), cutsPerMin: m(r => r.shots.perMin),
    punchPerMin: m(r => r.zoom.punchPerMin), punchAmount: m(r => r.zoom.punchAmount), smoothShare: m(r => r.zoom.smoothShare), smoothRate: m(r => r.zoom.smoothRate),
    motion: m(r => r.motion), flashesPerMin: m(r => r.flashes.perMin),
    brightness: m(r => r.color.brightness), contrast: m(r => r.color.contrast), saturation: m(r => r.color.saturation), warmth: m(r => r.color.warmth),
    bpm: m(r => r.music.bpm), onBeat: m(r => r.music.onBeat), chance: m(r => r.music.chance),
    palette: [...colors].map(([hex, share]) => ({ hex, share: +share.toFixed(3) })).sort((a, b) => b.share - a.share).slice(0, 6)
  };
  return { stats, settings: settingsOf(stats) };
}
/** the measurements → concrete values the tools take */
function settingsOf(s) {
  const pace = s.shotAvg < 1.2 ? 'سريع جدًا' : s.shotAvg < 2.5 ? 'سريع' : s.shotAvg < 5 ? 'متوسط' : 'هادي';
  const zoomDensity = s.punchPerMin >= 6 ? 'high' : s.punchPerMin >= 2 ? 'medium' : 'low';
  const zoomStyle = s.smoothShare > 0.35 && s.punchPerMin < 4 ? 'smooth' : 'jump';
  const zoomScale = Math.round(Math.max(105, Math.min(130, 100 + (s.punchAmount || (zoomStyle === 'smooth' ? 10 : 12)))));
  const onBeat = s.bpm > 0 && s.onBeat >= Math.max(0.4, s.chance + 0.2);
  const beatEvery = onBeat ? Math.max(1, Math.min(8, Math.round(s.shotAvg / (60 / s.bpm)))) : 0;
  const motion = s.motion < 6 ? 'هادية' : s.motion < 14 ? 'متوسطة' : 'كتير';
  const grade = [s.brightness < 90 ? 'غامق' : s.brightness > 150 ? 'فاتح' : 'متوسط الإضاءة', s.contrast > 60 ? 'كونتراست عالي' : s.contrast < 35 ? 'كونتراست هادي' : 'كونتراست طبيعي', s.saturation > 0.45 ? 'ألوان مشبّعة' : s.saturation < 0.2 ? 'ألوان باهتة' : 'تشبّع طبيعي', s.warmth > 15 ? 'دافي' : s.warmth < -10 ? 'بارد' : 'محايد'];
  return {
    pace, motion, grade,
    zoom: { density: zoomDensity, style: zoomStyle, scale: zoomScale },
    beat: { on: onBeat, every: beatEvery, bpm: Math.round(s.bpm) },
    shots: { min: +Math.max(0.4, s.shotP10).toFixed(1), max: +Math.max(s.shotP10 + 0.5, s.shotP90).toFixed(1) },
    flashes: s.flashesPerMin >= 1 ? 'فلاشات بين اللقطات' : 'من غير فلاشات',
    colors: s.palette.map(c => c.hex)
  };
}

/* ---------------- store ---------------- */
const root = () => { const d = path.join(config.dataDir(), 'skills'); fs.mkdirSync(d, { recursive: true }); return d; };
const dirOf = id => path.join(root(), String(id).replace(/[^\w-]/g, '_'));
const now = () => new Date().toISOString();
function list() {
  return fs.readdirSync(root()).map(id => get(id)).filter(Boolean).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .map(s => ({ id: s.id, name: s.name, refs: s.refs.length, pace: s.settings && s.settings.pace, colors: s.settings ? s.settings.colors.slice(0, 5) : [], ready: !!s.stats }));
}
function get(id) { try { return JSON.parse(fs.readFileSync(path.join(dirOf(id), 'skill.json'), 'utf8')); } catch (_) { return null; } }
function save(s) { fs.mkdirSync(dirOf(s.id), { recursive: true }); s.updated = now(); fs.writeFileSync(path.join(dirOf(s.id), 'skill.json'), JSON.stringify(s, null, 1)); return s; }
function remove(id) { try { fs.rmSync(dirOf(id), { recursive: true, force: true }); return true; } catch (_) { return false; } }
function update(id, patch) { const s = get(id); if (!s) throw new Error('السكيل مش موجود'); if (patch.name) s.name = String(patch.name).slice(0, 60); if (patch.notes !== undefined) s.notes = String(patch.notes).slice(0, 4000); return save(s); }
const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi|mxf|mts)$/i;
/**
 * Make a skill from reference videos: analyse each (on this machine), keep a contact sheet of each, combine.
 * → the skill { id, name, refs:[{name, file, sheet, ...measurements}], stats, settings, notes }
 */
async function create({ ffmpeg, name, files, onStep, maxSeconds = 180 }) {
  files = (files || []).filter(f => VIDEO.test(f));
  if (!files.length) throw new Error('اختار فيديو واحد على الأقل (mp4 / mov…)');
  if (files.length > 12) throw new Error('كفاية 12 فيديو للسكيل الواحد');
  const s = { id: crypto.randomBytes(6).toString('hex'), name: String(name || 'سكيل جديد').slice(0, 60), refs: [], notes: '', created: now() };
  fs.mkdirSync(dirOf(s.id), { recursive: true });
  for (let i = 0; i < files.length; i++) {
    onStep && onStep('بيحلل ' + (i + 1) + ' / ' + files.length + ': ' + path.basename(files[i]));
    const a = await analyzeVideo(ffmpeg, files[i], { sheet: path.join(dirOf(s.id), 'sheet-' + (i + 1) + '.jpg'), maxSeconds });
    delete a.cuts; a.zoom.punches = a.zoom.punches.slice(0, 40);
    s.refs.push(a);
  }
  Object.assign(s, combine(s.refs));
  onStep && onStep('خلص ✓');
  return save(s);
}
function sheets(s, max = 6) {
  return (s.refs || []).map(r => r.sheet).filter(f => f && fs.existsSync(f)).slice(0, max).map(f => ({ b64: fs.readFileSync(f).toString('base64'), mime: 'image/jpeg', label: path.basename(f) }));
}

/** what Claude / the editor reads: the skill in words + how to apply it with the tools */
function guideText(s, app = 'premiere') {
  if (!s || !s.stats) return 'السكيل لسه ماتحللش';
  const t = s.stats, g = s.settings;
  const lines = [
    'السكيل: ' + s.name + ' (من ' + t.refs + ' فيديو، ' + Math.round(t.seconds) + ' ثانية)',
    '- الإيقاع: ' + g.pace + ' — اللقطة في المتوسط ' + t.shotAvg + ' ث (من ' + g.shots.min + ' لـ ' + g.shots.max + ' ث)، ' + t.cutsPerMin + ' قطع في الدقيقة',
    '- الزووم: ' + (g.zoom.style === 'smooth' ? 'دخول ناعم' : 'بانش سريع') + '، ' + t.punchPerMin + ' بانش في الدقيقة بحوالي ' + (t.punchAmount || 0) + '%' + (t.smoothShare ? '، والكاميرا بتزحف ناعم في ' + Math.round(t.smoothShare * 100) + '% من الوقت' : ''),
    '- الحركة جوه اللقطة: ' + g.motion + ' · ' + g.flashes + (t.flashesPerMin ? ' (' + t.flashesPerMin + ' في الدقيقة)' : ''),
    '- الألوان والجريد: ' + g.grade.join('، ') + ' · الباليت: ' + g.colors.join(' '),
    '- المزيكا: ' + (g.beat.bpm ? g.beat.bpm + ' BPM، ' : '') + (g.beat.on ? 'القطع ماشي على البيت (كل ' + g.beat.every + ' بيت تقريبًا)' : 'القطع مش مربوط بالبيت')
  ];
  if (s.notes) lines.push('- ملاحظات (الكابشن، الكلام المتحرك، الترانزيشنز، الجرافيك):\n' + s.notes);
  lines.push(app === 'ae'
    ? 'طبّقه في الأفتر: نفس سرعة الحركة والإيقاع، الباليت دي للألوان، والبانش/الزووم بنفس النسبة. بص على صور المرجع (skill_get) قبل ما تبني.'
    : 'طبّقه في بريمير: premiere_auto_zoom بـ density=' + g.zoom.density + ' style=' + g.zoom.style + (g.beat.on ? '، premiere_beat_montage بـ every=' + g.beat.every : '') + '، والقطع يخلّي اللقطات بين ' + g.shots.min + ' و' + g.shots.max + ' ث.');
  return lines.join('\n');
}
const hashOf = s => (s ? crypto.createHash('md5').update(JSON.stringify([s.id, s.updated])).digest('hex').slice(0, 10) : null);

/** an AI look at the contact sheets (OpenRouter vision): captions, text animation, transitions, graphics → notes */
async function describe(llm, model, s) {
  const imgs = sheets(s, 4);
  if (!imgs.length) throw new Error('مفيش صور من الفيديوهات');
  const m = await llm.chat({ model, maxTokens: 900, messages: [
    { role: 'system', content: 'You are a senior video editor. Describe the editing style seen in these contact sheets (12 evenly spaced frames per reference video) so another editor can copy it. Answer in Egyptian Arabic, short bullet lines: captions (font, size, colour, position, word-by-word or lines), animated text and titles, transitions, graphics/overlays/stickers, framing and zoom, colour grade, overall vibe. Only what you can see.' },
    { role: 'user', content: [{ type: 'text', text: 'Measured: ' + guideText(s) }].concat(imgs.map(i => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + i.b64 } }))) }
  ] });
  const text = String((m && (m.content || (m.choices && m.choices[0].message.content))) || '').trim();
  if (!text) throw new Error('الموديل مارجّعش وصف');
  return update(s.id, { notes: text });
}

module.exports = { analyzeFrames, estimateScale, palette, beatFit, combine, settingsOf, analyzeVideo, create, list, get, update, remove, sheets, guideText, hashOf, describe, root, AW, AH, AFPS };

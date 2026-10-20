'use strict';
// "اختبر كل الأدوات": every tool runs for real in this After Effects, each on its own scratch comp with test media
// made here (logo, photo, video, green screen, voice), then AE itself checks every expression it wrote
// (expressionError), and everything the test made is removed. Nothing paid / AI is called.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const ff = require('./ffmpeg');
const { encodePng } = require('./util');
const aeScene = require('./aeScene');
const motionKit = require('./motionKit');
const motion = require('./motionPresets');
const curves = require('./curves');
const logoFx = require('./logoFx');
const character = require('./character');
const physics = require('./physics');
const kinetic = require('./kinetic');
const highlight = require('./highlight');

/* ---------- test media ---------- */
function raster(w, h, fn) {
  const b = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); b[(y * w + x) * 4] = c[0]; b[(y * w + x) * 4 + 1] = c[1]; b[(y * w + x) * 4 + 2] = c[2]; b[(y * w + x) * 4 + 3] = c[3] === undefined ? 255 : c[3]; }
  return encodePng(w, h, b);
}
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><path d="M20 100 L60 20 L100 100 Z" fill="#f97316"/><path d="M150 20 A40 40 0 1 1 149.9 20 Z M150 45 A15 15 0 1 0 150.1 45 Z" fill="#2563eb" fill-rule="evenodd"/></svg>';
const LOGO2_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="30" y="20" width="140" height="80" rx="20" fill="#16a34a"/></svg>';

async function media(ffmpeg, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = n => path.join(dir, n);
  // logo: orange triangle + blue ring on transparent
  fs.writeFileSync(f('logo.png'), raster(600, 360, (x, y) => {
    const tri = y > 60 && y < 300 && Math.abs(x - 180) < (y - 60) * 0.5;
    const d = Math.hypot(x - 430, y - 180), ring = d < 120 && d > 50;
    return tri ? [249, 115, 22, 255] : ring ? [37, 99, 235, 255] : [0, 0, 0, 0];
  }));
  fs.writeFileSync(f('logo.svg'), LOGO_SVG);
  fs.writeFileSync(f('logo2.svg'), LOGO2_SVG);
  // a street: sky, ground, a building with a window grid (texture to track), some noise
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  fs.writeFileSync(f('photo.png'), raster(1200, 680, (x, y) => {
    const n = (rnd() - 0.5) * 18;
    if (x > 420 && x < 780 && y > 140 && y < 600) {
      const win = (x - 420) % 60 > 12 && (x - 420) % 60 < 48 && (y - 140) % 70 > 15 && (y - 140) % 70 < 55;
      return win ? [40 + n, 70 + n, 110 + n] : [210 + n, 190 + n, 160 + n];
    }
    if (y > 560) return [70 + n, 75 + n, 70 + n];
    return [120 + y * 0.1 + n, 170 + y * 0.05 + n, 230 + n];
  }));
  const run = args => ff.run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args]);
  if (!fs.existsSync(f('street.mp4'))) await run(['-loop', '1', '-i', f('photo.png'), '-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*220*t)*abs(sin(2*PI*1.3*t)):s=44100:d=3',
    '-vf', "crop=960:540:'40+t*40':'30+t*12',format=yuv420p", '-t', '3', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('street.mp4')]);
  if (!fs.existsSync(f('green.mp4'))) await run(['-f', 'lavfi', '-i', 'color=c=0x00c832:s=960x540:d=2:r=25', '-vf', 'drawbox=x=360:y=140:w=240:h=280:color=white:t=fill,format=yuv420p', '-c:v', 'libx264', f('green.mp4')]);
  if (!fs.existsSync(f('voice.wav'))) await run(['-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*180*t)*abs(sin(2*PI*2.1*t)):s=16000:d=3', f('voice.wav')]);
  return { logo: f('logo.png'), svg: f('logo.svg'), svg2: f('logo2.svg'), photo: f('photo.png'), video: f('street.mp4'), green: f('green.mp4'), audio: f('voice.wav') };
}

/* ---------- the tool list ---------- */
const TEXT = (name, extra) => Object.assign({ kind: 'text', name, text: name }, extra);
const SHAPE = (name, extra) => Object.assign({ kind: 'shape', name, groups: 1 }, extra);
const VIDEO = M => ({ kind: 'footage', name: 'Street', file: M.video });

function steps(svc, M, info) {
  const S = [];
  const add = (group, name, setup, fn) => S.push({ group, name, setup, fn });
  // حركة
  for (const p of ['pop-in', 'slide-in-left', 'zoom-out-exit', 'shake', 'ken-burns-left', 'glitch-jump', 'elastic-in', 'heartbeat']) if (motion.PRESETS[p]) add('حركة', 'Motion ' + p, [TEXT('Hello')], () => svc.applyMotion({ preset: p, level: 2 }));
  for (const c of Object.keys(curves.PRESETS).filter(k => curves.PRESETS[k].fn.bezier).slice(0, 4)) add('حركة', 'Ease ' + c, [TEXT('Hello', { keys: true })], () => svc.applyEase({ curve: c }));
  add('حركة', 'Stagger', [TEXT('A'), TEXT('B'), TEXT('C')], () => svc.stagger({ frames: 3 }));
  add('حركة', 'Anchor', [SHAPE('Box')], () => svc.anchor({ where: 'bl' }));
  add('حركة', 'Null controller', [TEXT('A'), TEXT('B')], () => svc.nullController({}));
  for (const k of info.exprKinds || []) add('إكسبريشن', k, [TEXT('Hello', { keys: true })], () => svc.addExpression({ kind: k }));
  for (const p of aeScene.TEXT_PRESETS || ['fadeUp', 'typewriter', 'blurIn', 'scalePop']) add('كلام', 'Text ' + p, [TEXT('أهلاً بيك')], () => svc.textAnimate({ preset: p, by: 'chars', duration: 1 }));
  for (const k of ['rect', 'circle', 'ring', 'line']) add('أشكال', 'Shape ' + k, [], () => svc.addShape({ kind: k, color: '#f97316' }));
  add('أشكال', 'Lower third', [], () => svc.lowerThird({ name: 'محمد أيمن', title: 'مونتير' }));
  // 3D
  for (const k of ['push', 'orbit', 'dolly']) add('ثري دي', 'Camera ' + k, [TEXT('3D')], () => svc.cameraRig({ kind: k }));
  add('ثري دي', 'Parallax', [TEXT('Front'), TEXT('Back')], () => svc.parallax({ depth: 300 }));
  add('ثري دي', 'Lights', [TEXT('3D')], async () => { await svc.extrude({ depth: 30 }); return svc.lightRig(); });
  add('ثري دي', 'Extrude text + shape', [TEXT('3D'), SHAPE('Box')], async () => { const r = await svc.extrude({ depth: 40 }); if (!/Calder|Ernst|Cinema|Advanced/.test(r.renderer || '')) throw new Error('renderer ' + r.renderer); return r; });
  // المونتير: every library scene
  for (const s of aeScene.SCENES) add('مشاهد', s.id, [], () => svc.libraryScene(s.id, {}, 'new'));
  // استوديو
  for (const st of Object.keys(logoFx.STYLES)) add('لوجو', 'Logo PNG ' + st, [], () => svc.logoAnimate({ file: M.logo, style: st, where: 'new' }));
  add('لوجو', 'Logo SVG draw', [], () => svc.logoAnimate({ file: M.svg, style: 'draw', where: 'new' }));
  add('لوجو', 'Logo SVG 3d', [], () => svc.logoAnimate({ file: M.svg, style: '3d', where: 'new' }));
  add('لوجو', 'Vector import', [], () => svc.vectorImport({ file: M.svg }));
  add('لوجو', 'Morph files', [], () => svc.morph({ files: [M.svg, M.svg2] }));
  add('لوجو', 'Morph layers', [SHAPE('One'), SHAPE('Two', { groups: 2 })], () => svc.morph({}));
  for (const mv of ['push', 'orbit', 'rise', 'float']) add('صورة ثري دي', 'Photo 3D ' + mv, [], () => svc.photo3D({ file: M.photo, move: mv, slices: 4, ai: false }));
  // تراكينج
  add('تراكينج', 'Track 1 point', [VIDEO(M), TEXT('Label', { select: true })], () => svc.track({ points: [[0.5, 0.45]], mode: 'attach', duration: 1 }));
  add('تراكينج', 'Track 2 points + text', [VIDEO(M)], () => svc.track({ points: [[0.42, 0.4], [0.6, 0.55]], mode: 'attach', duration: 1, text: 'تست' }));
  add('تراكينج', 'Corner pin', [VIDEO(M), { kind: 'solid', name: 'Screen' }], () => svc.track({ points: [[0.4, 0.3], [0.6, 0.3], [0.6, 0.7], [0.4, 0.7]], mode: 'pin', duration: 1 }));
  add('تراكينج', 'Stabilize', [VIDEO(M)], () => svc.track({ points: [[0.5, 0.45]], mode: 'stabilize', duration: 1 }));
  add('تراكينج', 'Place on surface', [VIDEO(M)], () => svc.surfacePlace({ points: [[0.4, 0.3], [0.6, 0.3], [0.6, 0.7], [0.4, 0.7]], text: 'SALE' }));
  // عقارات
  for (const p of Object.keys(highlight.PRESETS)) add('عقارات', 'Highlight ' + p, [VIDEO(M)], () => svc.highlight({ points: [[0.38, 0.22], [0.66, 0.22], [0.66, 0.85], [0.38, 0.85]], mode: 'manual', preset: p, seconds: 1, label: p === 'gold' ? { title: 'برج النيل', price: 2500000, currency: 'EGP', area: 180 } : null }));
  // كاراكتر
  for (const a of Object.keys(character.ACTIONS)) add('كاراكتر', 'Character ' + a, [], () => svc.characterAdd({ name: 'Hero', action: a, where: 'here' }));
  add('كاراكتر', 'Lip sync', [], async () => { await svc.characterAdd({ name: 'Hero', action: 'talk', where: 'here' }); return svc.lipSync({ audio: M.audio }); });
  add('كاراكتر', 'Auto rig', ['Head', 'Body', 'Arm L', 'Arm R', 'Leg L', 'Leg R'].map((n, i) => SHAPE(n, { position: [700 + (i % 2) * 300, 300 + i * 80], select: false })), () => svc.characterRig({ ik: true }));
  // أدوات
  add('أدوات', 'Explode shapes', [SHAPE('Icons', { groups: 3 })], () => svc.explodeShapes());
  for (const m of ['left', 'hcenter', 'top', 'distH']) add('أدوات', 'Align ' + m, [SHAPE('A', { position: [300, 300] }), SHAPE('B', { position: [900, 500] }), SHAPE('C', { position: [1500, 700] })], () => svc.alignLayers({ mode: m, to: 'selection' }));
  add('أدوات', 'Sequence', [TEXT('A'), TEXT('B'), TEXT('C')], () => svc.sequenceLayers({ gap: 0 }));
  add('أدوات', 'Color rig', [SHAPE('Logo', { groups: 2 })], () => svc.colorRig());
  add('أدوات', 'Palette', [SHAPE('Logo', { groups: 2 })], async () => { const p = await svc.paletteRead(); const from = (p.colors || p)[0]; return svc.paletteApply({ [from && from.hex || from || '#f97316']: '#22c55e' }); });
  add('أدوات', 'Audio react', [SHAPE('Speaker')], () => svc.audioReact({ audio: M.audio, amount: 30 }));
  for (const m of Object.keys(physics.MODES)) add('أدوات', 'Physics ' + m, [SHAPE('Ball 1', { position: [600, 200] }), SHAPE('Ball 2', { position: [960, 300] }), SHAPE('Box', { position: [1300, 250] })], () => svc.physics({ mode: m, duration: 2 }));
  add('أدوات', 'Multi-size (no render)', [TEXT('Hello')], () => svc.multiFormat({ sizes: ['16:9', '9:16', '1:1', '4:5'], fit: 'blur', render: false }));
  add('أدوات', 'Green screen', [{ kind: 'footage', name: 'Green', file: M.green }], () => svc.roto({ mode: 'green' }));
  add('قوالب', 'Template scan', [TEXT('Title'), SHAPE('Box')], () => svc.templateScan());
  // جرافيكس
  for (const st of Object.keys(motionKit.COUNTER_STYLES)) for (const f of [{}, { format: 'currency', currency: 'USD' }, { format: 'percent', to: 87 }, { arabic: true, compact: true, to: 1500000 }]) add('عدّاد', 'Counter ' + st + ' ' + (f.format || (f.arabic ? 'arabic' : 'plain')), [], () => svc.counterAdd(Object.assign({ style: st, label: 'Sales', to: 12500, duration: 2 }, f)));
  for (const t of Object.keys(motionKit.CHARTS)) add('شارت', 'Chart ' + t, [], () => svc.chartAdd({ type: t, data: 'Jan, 30\nFeb, 55\nMar, 80', title: 'Sales' }));
  for (const p of Object.keys(motionKit.LIQUID)) add('ليكويد', 'Liquid ' + p, [], () => svc.liquidAdd({ preset: p }));
  for (const t of Object.keys(motionKit.TRANSITIONS)) add('ترانزيشن', 'Transition ' + t, [TEXT('A')], () => svc.transitionApply({ kind: t, duration: 0.6 }));
  for (const st of Object.keys(kinetic.STYLES)) add('كلام بالصوت', 'Kinetic ' + st, [], () => svc.buildHere(kinetic.layers([{ text: 'أهلاً', start: 0, end: 0.4 }, { text: 'بيك', start: 0.45, end: 0.9 }, { text: 'هنا', start: 1.4, end: 2 }], { style: st, comp: { width: 1920, height: 1080 } }), { name: 'Kinetic', duration: 4 }));
  return S;
}

/**
 * Run everything. → { ok, fail, results: [{group, name, ok, error, layers, expressions, errors, ms}], env, report (text) }
 * o: { only: [group names], keep: leave the test comps in the project, onStep }
 */
async function run(svc, { only = null, keep = false, onStep } = {}) {
  const step = m => { try { onStep && onStep(m); } catch (_) {} };
  step('بيجهّز ميديا الاختبار…');
  const M = await media(svc.ffmpeg(), path.join(config.dataDir(), 'selftest'));
  const env = await svc.host('testBegin', {});
  const list = steps(svc, M, env).filter(s => !only || only.includes(s.group));
  const results = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const s = list[i], t0 = Date.now();
      step(`(${i + 1}/${list.length}) ${s.group} · ${s.name}`);
      const r = { group: s.group, name: s.name, ok: false };
      try {
        await svc.host('testPrep', { name: (i + 1) + ' ' + s.name.slice(0, 40), setup: s.setup });
        const out = await s.fn();
        if (out && out.skipped && out.skipped.length) r.warn = out.skipped.slice(0, 5).map(String);
        r.ok = true;
      } catch (e) { r.error = String(e && e.message || e).slice(0, 300); }
      try {
        const c = await svc.host('testCheck', {});
        Object.assign(r, { layers: c.layers, expressions: c.expressions, errors: c.errors });
        if (c.errors.length) r.ok = false;
      } catch (e) { r.error = (r.error ? r.error + ' · ' : '') + 'check: ' + e.message; r.ok = false; }
      r.ms = Date.now() - t0;
      results.push(r);
    }
  } finally {
    if (!keep) { step('بيمسح كومبات الاختبار…'); try { await svc.host('testEnd', {}); } catch (_) {} }
  }
  const fail = results.filter(r => !r.ok), text = report(results, env);
  const file = path.join(config.dataDir(), 'selftest', 'report.txt');
  try { fs.writeFileSync(file, text, 'utf8'); } catch (_) {}
  return { ok: results.length - fail.length, fail: fail.length, total: results.length, results, env, report: text, file };
}

function report(results, env) {
  const fail = results.filter(r => !r.ok), lines = [];
  lines.push('EditFast Motion — اختبار كل الأدوات');
  lines.push(`After Effects ${env.version} · 3D renderer: ${env.pick3d || 'مش موجود (الثري دي مش هيشتغل)'} · كتابة ملفات: ${env.canWrite ? 'مسموح' : 'مقفول'}`);
  lines.push(`النتيجة: ${results.length - fail.length} / ${results.length} شغالين${fail.length ? ' · ' + fail.length + ' فيهم مشكلة' : ' ✓'}`);
  if (fail.length) {
    lines.push('', '✗ اللي فيه مشكلة:');
    for (const r of fail) {
      lines.push(`✗ ${r.group} · ${r.name}${r.error ? ' → ' + r.error : ''}`);
      for (const e of r.errors || []) lines.push('    expression: ' + e);
    }
  }
  const groups = [...new Set(results.map(r => r.group))];
  lines.push('', 'كل مجموعة:');
  for (const g of groups) { const rs = results.filter(r => r.group === g); lines.push(`${rs.every(r => r.ok) ? '✓' : '✗'} ${g}: ${rs.filter(r => r.ok).length}/${rs.length}`); }
  const warns = results.filter(r => r.warn && r.warn.length);
  if (warns.length) { lines.push('', 'ملاحظات (اتعملت بس حاجة صغيرة اتخطّت):'); for (const r of warns.slice(0, 20)) lines.push(`• ${r.name}: ${r.warn.join('، ')}`); }
  return lines.join('\n');
}

module.exports = { run, steps, media, report };

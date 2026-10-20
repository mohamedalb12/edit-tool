'use strict';
// أدوات الاستوديو في أفتر: تتبّع اللوجو لمسارات، SVG، أنيميشن اللوجو، المورف، صورة → ثري دي، التراكينج، الكاراكتر
// (جينيريتور + ريج + IK + ليب سينك)، وأدوات الشغل اليومي — في محاكي الأفتر، والإكسبريشنز بتتحسب بـ exprSim.
const { TMP, FFMPEG, makeClicks } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../core/config');
const aeScene = require('../../core/aeScene');
const trace = require('../../core/trace');
const svgFile = require('../../core/svgFile');
const morph = require('../../core/morph');
const character = require('../../core/character');
const photo3d = require('../../core/photo3d');
const svg = require('../../core/svgPath');
const X = require('./exprSim');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

const D = path.join(TMP, 'ae-studio'); fs.mkdirSync(D, { recursive: true });
function services(ae) { config.save({ ...config.DEFAULTS }); return new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }); }
const byName = (c, n) => c.layerList.find(L => L.name === n);
const find = (g, m) => { for (const ch of g.children || []) { if (ch.matchName === m) return ch; const x = find(ch, m); if (x) return x; } return null; };
const all = (g, m, out = []) => { for (const ch of g.children || []) { if (ch.matchName === m) out.push(ch); all(ch, m, out); } return out; };
function logoPng() {
  const f = path.join(D, 'logo.png');
  if (!fs.existsSync(f)) execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=400x200', '-vf', 'drawbox=x=40:y=40:w=120:h=120:color=0xf97316:t=fill,drawbox=x=70:y=70:w=60:h=60:color=white:t=fill,drawbox=x=220:y=60:w=140:h=80:color=0x1e293b:t=fill', '-frames:v', '1', f]);
  return f;
}

test('trace: colours grouped, background dropped, holes kept, smooth closed paths', () => {
  const w = 200, h = 120, data = Buffer.alloc(w * h * 4, 255);
  const set = (x, y, c) => { const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 60, y - 60); if (d < 45 && d > 20) set(x, y, [249, 115, 22]); if (x > 120 && x < 180 && y > 30 && y < 90) set(x, y, [20, 20, 20]); }
  const art = trace.vectorize({ w, h, data });
  assert.equal(art.bg, '#ffffff');
  assert.equal(art.items.length, 2);
  const ring = art.items.find(i => i.fill === '#f97316');
  assert.equal(ring.paths.length, 2, 'outer + hole');
  const b = svg.bbox([ring.paths[0]]);
  assert.ok(Math.abs(b.w - 90) < 3 && Math.abs(b.h - 90) < 3, JSON.stringify(b));
  assert.ok(ring.paths.every(p => p.c && p.v.length >= 8 && p.v.length < 120));
  assert.ok(ring.paths[0].o.some(t => t[0] || t[1]), 'curves, not a polygon');
  // transparent PNG-like input: alpha decides
  const t = Buffer.alloc(w * h * 4, 0); for (let y = 40; y < 80; y++) for (let x = 40; x < 160; x++) { const i = (y * w + x) * 4; t[i] = 30; t[i + 3] = 255; }
  assert.equal(trace.vectorize({ w, h, data: t }).items.length, 1);
});

test('svg file: shapes, groups, transforms, viewBox, gradients → parts with colours', () => {
  const r = svgFile.parse('<svg viewBox="10 10 100 100"><defs><linearGradient id="g"><stop stop-color="#123456"/></linearGradient></defs><g transform="translate(10 10)" fill="#ff0000"><rect x="10" y="10" width="20" height="10"/><circle cx="50" cy="50" r="10" fill="url(#g)"/></g><path d="M10 10 L20 20" stroke="#00ff00" stroke-width="3" fill="none"/></svg>');
  assert.equal(r.width, 100);
  assert.deepEqual(r.items.map(i => [i.fill, i.stroke]), [['#ff0000', null], ['#123456', null], [null, '#00ff00']]);
  assert.deepEqual(r.items[0].paths[0].v[0], [10, 10], 'translate(10) + viewBox -10');
});

test('morph engine: different shapes / path counts → same counts, aligned starts, no flips', () => {
  const r = morph.matchStages([[svg.rect(-50, -50, 100, 100)], [svg.ellipse(0, 0, 100, 100), svg.rect(100, 0, 10, 10)]]);
  assert.equal(r.paths, 2);
  assert.deepEqual(r.stages.map(s => s.map(p => p.v.length)), [[r.points, r.points], [r.points, r.points]]);
  const sa = p => morph.signedArea(p.v);
  assert.equal(Math.sign(sa(r.stages[0][0])), Math.sign(sa(r.stages[1][0])), 'same winding');
  const s0 = r.stages[0][0].v[0], s1 = r.stages[1][0].v[0];
  assert.ok(Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) < 30, 'starts close: ' + s0 + ' / ' + s1);
  assert.ok(r.stages[0][1].v.every(p => Math.hypot(p[0] - 105, p[1] - 5) < 0.01), 'a missing path grows from where it appears');
});

test('logo animator: draw (stroke trim then fill), neon (glow + flicker), build (staggered), 3D (extruded, Advanced 3D, camera + lights)', { skip: !FFMPEG }, async () => {
  const ae = loadAE(), A = services(ae), png = logoPng();
  const r = await A.logoAnimate({ file: png, style: 'draw' });
  let c = ae.project.activeItem;
  assert.equal(r.parts, 2); assert.deepEqual(r.skipped, []);
  const line = c.layerList.find(L => / Line$/.test(L.name)), fillL = byName(c, line.name.replace(/ Line$/, ''));
  assert.equal(find(line.root, 'ADBE Vector Trim End').keys.length, 2);
  assert.equal(find(line.root, 'ADBE Vector Trim Type').value, 2, 'paths one after another');
  assert.ok(!find(line.root, 'ADBE Vector Graphic - Fill'), 'the line layer has no fill (trim would eat it)');
  assert.equal(find(fillL.root, 'ADBE Vector Fill Opacity').keys.length, 2);
  assert.equal(find(fillL.root, 'ADBE Vector Fill Rule').value, 2, 'even-odd keeps the hole');
  assert.ok(all(byName(c, line.name.replace(/ Line$/, '')).root, 'ADBE Vector Shape').length >= 1);
  assert.equal(line.parent && line.parent.name, 'logo Control'); assert.equal(line.jumped, true, 'parented without compensation');
  await A.logoAnimate({ file: png, style: 'neon' }); c = ae.project.activeItem;
  const neon = c.layerList.find(L => / Line$/.test(L.name));
  assert.equal(neon.property('ADBE Effect Parade').numProperties, 2);
  assert.match(neon.property('ADBE Transform Group').property('ADBE Opacity').expression, /Math\.sin\(time\*37\)/);
  await A.logoAnimate({ file: png, style: 'build' }); c = ae.project.activeItem;
  const parts = c.layerList.filter(L => /^Part/.test(L.name));
  const starts = parts.map(L => L.property('ADBE Transform Group').property('ADBE Scale').keys[0].t).sort();
  assert.ok(starts[1] > starts[0], 'staggered');
  await A.logoAnimate({ file: png, style: '3d' }); c = ae.project.activeItem;
  const p3 = c.layerList.find(L => /^Part/.test(L.name));
  assert.ok(p3.threeDLayer); assert.ok(p3.property('ADBE Extrsn Options Group').property('ADBE Extrsn Depth').value >= 20);
  assert.equal(p3.property('ADBE Extrsn Options Group').property('ADBE Bevel Styles').value, 4);
  assert.ok(byName(c, 'Camera') && byName(c, 'Key Light'));
  assert.equal(c.renderer, 'ADBE Calder');
});

test('SVG import as editable layers into the open comp; morph from SVG files keeps colours and loops', async () => {
  const ae = loadAE(), A = services(ae);
  const host = ae.newComp('Main', { duration: 6 }); ae.project._active = host;
  const a = path.join(D, 'a.svg'), b = path.join(D, 'b.svg');
  fs.writeFileSync(a, '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff0000"/><rect x="2" y="20" width="20" height="2" fill="#000"/></svg>');
  fs.writeFileSync(b, '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M2 2h20v20H2z M8 8h8v8H8z" fill="#0000ff"/></svg>');
  const r = await A.vectorImport({ file: a });
  assert.equal(ae.project.activeItem, host, 'into the open comp'); assert.equal(r.parts, 2);
  const m = await A.morph({ files: [a, b], loop: true });
  const L = byName(ae.project.activeItem, 'EF Morph');
  const paths = all(L.root, 'ADBE Vector Shape');
  assert.equal(paths.length, m.paths);
  assert.ok(paths.every(p => p.keys.length === 5 && p.keys.every(k => k.v.vertices.length === m.points)), 'A hold, B hold, back to A');
  const fill = find(L.root, 'ADBE Vector Fill Color');
  assert.deepEqual(Array.from(fill.keys[2].v).slice(0, 3), [0, 0, 1]);
});

test('morph from selected layers: a shape (rect / star) and a text (converted to outlines, then cleaned up)', async () => {
  const ae = loadAE(), A = services(ae);
  const c = ae.newComp('M', { duration: 5 }); ae.project._active = c;
  const S = c.layers.addShape(); S.name = 'Box';
  const g = S.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  const rp = g.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Rect'); rp.property('ADBE Vector Rect Size').value = [200, 100];
  g.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').value = [1, 0.5, 0, 1];
  const T = c.layers.addText('Hi'); T.name = 'Word';
  c.selectedLayers = [S, T];
  const before = c.layerList.length;
  const r = await A.morph({ dur: 0.8, hold: 0.4 });
  assert.equal(r.stages, 2);
  assert.equal(c.layerList.length, before + 1, 'temporary outlines removed');
  assert.equal(T.enabled, true);
  const mL = byName(c, 'EF Morph');
  assert.equal(all(mL.root, 'ADBE Vector Shape')[0].keys.length, 3);
});

test('3D photo: depth slices (far = whole image), nearer ones only what is near; layers scaled for their depth, camera moves', { skip: !FFMPEG }, async () => {
  const w = 40, h = 20, rgba = Buffer.alloc(w * h * 4, 200), depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = x < 20 ? 0.1 : 0.9;
  const sl = photo3d.slices(rgba, depth, w, h, 3);
  assert.ok(sl.length >= 2);
  assert.equal(sl[0].rgba[3], 200, 'far slice keeps everything');
  const near = sl[sl.length - 1]; assert.equal(near.rgba[(5 * w + 2) * 4 + 3], 0); assert.equal(near.rgba[(5 * w + 35) * 4 + 3], 200);
  const ae = loadAE(), A = services(ae);
  const r = await A.photo3D({ file: logoPng(), slices: 4, move: 'orbit' });
  const c = ae.project.activeItem;
  assert.equal(r.depth, 'تقدير');
  const layers = c.layerList.filter(L => /^Depth/.test(L.name));
  assert.equal(layers.length, r.slices); assert.ok(layers.every(L => L.threeDLayer));
  const zs = layers.map(L => L.property('ADBE Transform Group').property('ADBE Position').value[2]);
  const ss = layers.map(L => L.property('ADBE Transform Group').property('ADBE Scale').value[0]);
  const far = zs.indexOf(Math.max(...zs)); assert.equal(ss[far], Math.max(...ss), 'the far slice is the biggest (same look from the camera)');
  assert.equal(byName(c, 'Camera').property('ADBE Transform Group').property('ADBE Position').keys.length, 2);
  assert.ok(fs.existsSync(layers[0].source.file.fsName));
});

test('tracking: attach a text to a moving patch, stabilize, and a 4-corner pin on a second layer', { skip: !FFMPEG }, async () => {
  const ae = loadAE(), A = services(ae);
  const patch = path.join(D, 'patch.png'), vid = path.join(D, 'move.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=120x120', '-frames:v', '1', patch]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:d=2:r=25', '-loop', '1', '-t', '2', '-i', patch, '-filter_complex', "[0][1]overlay=x='200+t*150':y='150+t*50'", '-pix_fmt', 'yuv420p', vid]);
  const c = ae.newComp('Shot', { width: 1920, height: 1080, fps: 25, duration: 2 }); ae.project._active = c;
  const L = c.layers.add(ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(vid))));
  const tr = L.property('ADBE Transform Group'); tr.property('ADBE Anchor Point').value = [640, 360]; tr.property('ADBE Position').value = [960, 540]; tr.property('ADBE Scale').value = [150, 150];
  c.selectedLayers = [L];
  const f = await A.trackFrame(); assert.ok(f.b64.length > 1000);
  const r = await A.track({ points: [[260 / 1280, 210 / 720]], text: 'اسم المنتج' });
  assert.equal(r.lost, null); assert.equal(r.frames, 50);
  const N = c.layerList.find(x => /^EF Track/.test(x.name)), pos = N.property('ADBE Transform Group').property('ADBE Position');
  const last = pos.keys[pos.keys.length - 1], want = [(260 + 150 * last.t - 640) * 1.5 + 960, (210 + 50 * last.t - 360) * 1.5 + 540];
  assert.ok(Math.hypot(last.v[0] - want[0], last.v[1] - want[1]) < 3, last.v + ' vs ' + want);
  assert.equal(byName(c, 'Tracked Text').parent, N);
  c.selectedLayers = [L];
  const s = await A.track({ points: [[230 / 1280, 180 / 720], [290 / 1280, 240 / 720]], mode: 'stabilize' });
  assert.equal(s.stabilized, L.name);
  assert.ok(Math.abs(tr.property('ADBE Scale').keys[10].v[0] - 150) < 3, 'same size patch → scale stays');
  const screen = c.layers.addSolid([1, 1, 1], 'Screen', 1920, 1080); screen.property('ADBE Transform Group').property('ADBE Anchor Point').value = [960, 540]; screen.property('ADBE Transform Group').property('ADBE Position').value = [960, 540];
  c.selectedLayers = [L, screen];
  tr.property('ADBE Anchor Point').removeKey(1); while (tr.property('ADBE Anchor Point').keys.length) tr.property('ADBE Anchor Point').removeKey(1);
  tr.property('ADBE Anchor Point').value = [640, 360]; tr.property('ADBE Position').value = [960, 540]; while (tr.property('ADBE Scale').keys.length) tr.property('ADBE Scale').removeKey(1); tr.property('ADBE Scale').value = [150, 150];
  while (tr.property('ADBE Rotate Z').keys.length) tr.property('ADBE Rotate Z').removeKey(1);
  const corners = [[205, 155], [315, 155], [205, 265], [315, 265]].map(p => [p[0] / 1280, p[1] / 720]);
  const p = await A.track({ points: corners, mode: 'pin' });
  assert.equal(p.pinned, 'Screen');
  const pin = screen.property('ADBE Effect Parade').property('ADBE Corner Pin');
  assert.equal(pin.property('ADBE Corner Pin-0001').keys.length, 50);
  await assert.rejects(A.track({ points: corners.slice(0, 3), mode: 'pin' }), /4 نقط/);
});

test('character: rubber-hose rig follows its sliders — feet on the ground, hands at arm length, waving arm up, blink, talk', () => {
  const { spec } = aeScene.normalize({ comp: { duration: 6 }, layers: [{ type: 'character', name: 'Ali', action: 'wave', position: [960, 1000], height: 700 }] }, {});
  const sim = X.make(spec);
  const hand = sim.value('Ali Hand R', 'position', 0.3), sh = sim.value('Ali Shoulder R', 'position', 0.3);
  assert.ok(hand[1] < sh[1], 'waving hand above the shoulder');
  const k = 700 / 880;
  assert.ok(Math.abs(Math.hypot(hand[0] - sh[0], hand[1] - sh[1]) - 270 * k) < 1);
  const foot = sim.value('Ali Foot L', 'position', 0);
  assert.ok(Math.abs(foot[1] + 18 * k - 1000) < 3, 'shoe on the ground line: ' + foot[1]);
  const leg = sim.value('Ali Leg L', 'shape:path', 0);
  assert.equal(leg.points.length, 3);
  assert.deepEqual(sim.value('Ali Eye 1', 'scale', 3.0 - 0.4 + 0.05 + 3.4 - 3.0), [100, 8], 'blink');
  const talk = X.make(aeScene.normalize({ layers: [{ type: 'character', name: 'B', action: 'talk' }] }, {}).spec);
  const ys = [0.1, 0.2, 0.3].map(t => talk.value('B Mouth', 'scale', t)[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 20, 'mouth moves: ' + ys);
  const walk = X.make(aeScene.normalize({ layers: [{ type: 'character', name: 'C', action: 'walk' }] }, {}).spec);
  const fx = [0, 0.45].map(t => walk.value('C Foot L', 'position', t)[0]);
  assert.ok(Math.abs(fx[1] - fx[0]) > 20, 'feet step');
});

test('auto-rig + IK: roles from names (EN + عربي), joints at the right ends, IK reaches the controller exactly', async () => {
  const mk = (name, x, y, w, h) => ({ name, rect: { left: 0, top: 0, width: w, height: h }, anchor: [w / 2, h / 2], position: [x + w / 2, y + h / 2], scale: [100, 100], rotation: 0 });
  const layers = [mk('راس', 900, 200, 120, 120), mk('Body', 890, 320, 140, 260), mk('Arm L upper', 850, 330, 40, 140), mk('Arm L lower', 850, 470, 40, 130), mk('Hand L', 845, 600, 50, 50), mk('رجل شمال', 900, 580, 50, 180), mk('Shin L', 900, 760, 50, 170), mk('Foot L', 890, 930, 80, 40), mk('Background', 0, 0, 1920, 1080)];
  const plan = character.rigPlan(layers, { ik: true });
  const roles = Object.fromEntries(plan.layers.map(l => [l.name, l.role + (l.side ? ' ' + l.side : '') + ' < ' + l.parent]));
  assert.deepEqual(roles, { Body: 'body < null', 'راس': 'head < Body', 'Arm L upper': 'upperArm L < Body', 'Arm L lower': 'forearm L < Arm L upper', 'Hand L': 'hand L < Arm L lower', 'رجل شمال': 'thigh L < Body', 'Shin L': 'shin L < رجل شمال', 'Foot L': 'foot L < Shin L' });
  assert.deepEqual(plan.layers.find(l => l.name === 'Arm L upper').position, [870, 338.4], 'shoulder at the top');
  const byN = Object.fromEntries(plan.layers.map(l => [l.name, l]));
  const spec = { layers: plan.layers.map(l => ({ name: l.name, parent: l.parent, transform: { anchor: l.anchor, position: l.parent ? [l.position[0] - byN[l.parent].position[0] + byN[l.parent].anchor[0], l.position[1] - byN[l.parent].position[1] + byN[l.parent].anchor[1]] : l.position, scale: 100 }, expressions: l.expressions.rotation ? { rotation: l.expressions.rotation } : {} })) };
  const targets = {};
  for (const ik of plan.ik) { targets[ik.name] = [ik.position[0] + 50, ik.position[1] - 80]; spec.layers.push({ name: ik.name, transform: { position: targets[ik.name] } }); }
  spec.layers.push({ name: 'EF Character', effects: Object.entries(plan.ctrl.sliders).map(([k, v]) => ({ label: k, params: { v } })) });
  const sim = X.make(spec);
  for (const [ik, end] of [['EF IK Hand L', 'Hand L'], ['EF IK Foot L', 'Foot L']]) {
    const tip = sim.toComp(end, byN[end].anchor, 0);
    assert.ok(Math.hypot(tip[0] - targets[ik][0], tip[1] - targets[ik][1]) < 0.5, ik + ': ' + tip + ' vs ' + targets[ik]);
  }
  // in AE
  const ae = loadAE(), A = services(ae);
  const c = ae.newComp('Rig', { duration: 5 }); ae.project._active = c;
  for (const l of layers.slice(0, 8)) { const S = c.layers.addShape(); S.name = l.name; S._rect = l.rect; const t = S.property('ADBE Transform Group'); t.property('ADBE Anchor Point').value = l.anchor; t.property('ADBE Position').value = l.position; }
  const r = await A.characterRig({ ik: true });
  assert.equal(r.ik, 2); assert.equal(byName(c, 'Hand L').parent, byName(c, 'Arm L lower'));
  assert.match(byName(c, 'Arm L upper').property('ADBE Transform Group').property('ADBE Rotate Z').expression, /Math\.acos/);
  assert.equal(byName(c, 'EF Character').property('ADBE Effect Parade').numProperties, 10);
  assert.deepEqual(Array.from(byName(c, 'Arm L upper').property('ADBE Transform Group').property('ADBE Position').value), [870, 338.4]);
});

test('lip sync + audio react: loudness per frame → sliders, the selected layers pulse, the audio lands in the comp', { skip: !FFMPEG }, async () => {
  const ae = loadAE(), A = services(ae);
  await A.characterAdd({ name: 'Ali', action: 'talk' });
  const voice = makeClicks('ae-voice.wav', 120, 3);
  const r = await A.lipSync({ audio: voice });
  const c = ae.project.activeItem;
  assert.equal(r.ctrl, 'Ali Ctrl');
  const mouth = byName(c, 'Ali Ctrl').property('ADBE Effect Parade').property('Mouth').property(1);
  assert.ok(mouth.keys.length >= 80 && mouth.keys.some(k => k.v > 50) && mouth.keys.some(k => k.v === 0));
  assert.ok(byName(c, 'Voice'));
  c.selectedLayers = [byName(c, 'Ali Head')];
  const a = await A.audioReact({ audio: voice, amount: 40 });
  assert.equal(a.linked, 1);
  assert.match(byName(c, 'Ali Head').property('ADBE Transform Group').property('ADBE Scale').expression, /EF Audio/);
  assert.ok(byName(c, 'EF Audio').property('ADBE Effect Parade').property('Level').property(1).keys.length >= 80);
});

test('workflow: explode shape groups to layers, align + distribute, sequence in time, one colour controller, squash / pendulum expressions', () => {
  const ae = loadAE();
  const c = ae.newComp('W', { duration: 10 }); ae.project._active = c;
  const S = c.layers.addShape(); S.name = 'Icons';
  for (const nm of ['A', 'B', 'C']) { const g = S.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group'); g.name = nm; g.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').value = nm === 'C' ? [0, 0, 1, 1] : [1, 0, 0, 1]; }
  c.selectedLayers = [S];
  assert.equal(ae.call('explodeShapes', {}).layers, 3);
  const parts = c.layerList.filter(L => /^Icons • /.test(L.name));
  assert.deepEqual(parts.map(L => L.property('ADBE Root Vectors Group').numProperties), [1, 1, 1]);
  assert.equal(S.enabled, false);
  parts.forEach((L, i) => { L.property('ADBE Transform Group').property('ADBE Position').value = [100 + i * i * 300, 200 + i * 50]; L._rect = { left: -50, top: -50, width: 100, height: 100 }; });
  c.selectedLayers = parts.slice();
  ae.call('alignLayers', { mode: 'top', to: 'selection' });
  assert.deepEqual(parts.map(L => L.property('ADBE Transform Group').property('ADBE Position').value[1]), [200, 200, 200]);
  ae.call('alignLayers', { mode: 'distH', to: 'selection' });
  const xs = parts.map(L => L.property('ADBE Transform Group').property('ADBE Position').value[0]).sort((a, b) => a - b);
  assert.ok(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.01, 'evenly spaced');
  parts.forEach(L => { L.inPoint = 0; L.outPoint = 2; L.startTime = 0; });
  ae.call('sequenceLayers', { gap: 0 });
  assert.deepEqual(parts.map(L => L.startTime), [0, 2, 4]);
  const cr = ae.call('colorRig', {});
  assert.equal(cr.colors.length, 2); assert.equal(cr.linked, 6);
  assert.match(find(parts[0].root, 'ADBE Vector Fill Color').expression, /EF Colors/);
  c.selectedLayers = [parts[0]];
  ae.call('addExpression', { kind: 'squash' });
  assert.match(parts[0].property('ADBE Transform Group').property('ADBE Scale').expression, /velocity/);
  ae.call('addExpression', { kind: 'pendulum' });
  assert.match(parts[0].property('ADBE Transform Group').property('ADBE Rotate Z').expression, /Math\.exp/);
});

test('director knows the new tools: character, plexus, extrude in the scene language', () => {
  const doc = aeScene.promptDoc();
  for (const w of ['character', 'plexus', 'extrude', 'shape:path.2']) assert.ok(doc.includes(w), w);
  const { spec, warnings } = aeScene.normalize({ comp: { duration: 5 }, layers: [{ type: 'plexus', name: 'Net', count: 5 }, { type: 'text', name: 'T', text: '3D', extrude: { depth: 30 } }] }, {});
  assert.deepEqual(warnings, []);
  assert.equal(spec.comp.renderer, '3d');
  assert.equal(spec.layers[0].layers.length, 5 + 10, 'points + every pair of lines');
  const sim = X.make(spec.layers[0]);
  const op = sim.value('Line 1-2', 'opacity', 0);
  assert.ok(op >= 0 && op <= 90);
});

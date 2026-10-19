'use strict';
// المونتير الذكي في أفتر: وصف المشهد → ليرز وكي فريمز حقيقية (في محاكي الأفتر)، تعديلات بالأسامي، ريفرانس، مونتاج لوحده.
const { TMP, FFMPEG, makeClicks, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../core/config');
const aeScene = require('../../core/aeScene');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

function services(ae, replies) {
  const asked = [];
  const fetchImpl = async (url, o) => { const b = JSON.parse(o.body); asked.push(b); const r = replies.shift(); return mockResponse({ choices: [{ message: { content: JSON.stringify(r) } }] }); };
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, openrouter: 'sk-or' } });
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))), fetchImpl });
  return { A, asked };
}
const tr = (L, m) => L.property('ADBE Transform Group').property(m);
const byName = (c, n) => c.layerList.find(L => L.name === n);
const text = m => typeof m.content === 'string' ? m.content : m.content.map(x => x.text || '').join('');

test('scene language: unknown layers / effects / props and unsafe expressions are dropped; % → px, #hex → colour, eases → bezier', () => {
  const { spec, warnings } = aeScene.normalize({ comp: { width: 1000, height: 500, duration: 4 }, layers: [
    { type: 'text', name: 'T', text: 'hi', color: '#ff0000', transform: { position: ['50%', '20%'] }, keys: { opacity: [[0, 0, 'expoOut'], [1, 100]], fly: [[0, 1]] }, expressions: { position: 'system.callSystem("rm")', rotation: 'time*30' }, effects: [{ name: 'glow', params: { intensity: 2 } }, { name: 'hack' }] },
    { type: 'script', name: 'x' }
  ] });
  const L = spec.layers[0];
  assert.equal(spec.layers.length, 1);
  assert.deepEqual(L.transform.position, [500, 100]);
  assert.deepEqual(L.color, [1, 0, 0, 1]);
  assert.equal(L.keys.opacity.length, 2); assert.equal(L.keys.opacity[0].bz.length, 4);
  assert.deepEqual(Object.keys(L.expressions), ['rotation']);
  assert.deepEqual(L.effects.map(e => e.match), ['ADBE Glo2']);
  assert.ok(warnings.some(w => /script/.test(w)) && warnings.some(w => /fly/.test(w)) && warnings.some(w => /hack/.test(w)) && warnings.some(w => /إكسبريشن/.test(w)));
});

test('every library scene builds real layers in AE: new comp, order (first = top), keys with ease, parents, counter, text animator, effect keys', () => {
  const ae = loadAE();
  for (const s of aeScene.SCENES) {
    const raw = aeScene.buildLibrary(s.id, { title: 'أهلا', subtitle: 'سطر', color: '#22c55e' });
    if (raw.comp.create === false) { const c0 = ae.newComp('Host', { duration: 6 }); ae.project._active = c0; }
    const { spec, warnings } = aeScene.normalize(raw, {});
    assert.deepEqual(warnings, [], s.id);
    const r = ae.call('buildScene', { spec: JSON.parse(JSON.stringify(spec)) });
    const c = ae.project.activeItem;
    assert.equal(r.comp, c.name, s.id);
    const names = c.layerList.map(L => L.name).filter(n => n !== 'Background');
    assert.deepEqual(names, spec.layers.map(l => l.name), s.id + ' order');
  }
  const ae2 = loadAE();
  ae2.call('buildScene', { spec: aeScene.normalize(aeScene.buildLibrary('subscribe', {}), {}).spec });
  const c = ae2.project.activeItem;
  assert.equal(byName(c, 'Label').parent, byName(c, 'Button'), 'parent set after both exist');
  const sc = tr(byName(c, 'Button'), 'ADBE Scale');
  assert.equal(sc.numKeys, 5); assert.ok(sc.keys[0].outE && sc.keys[0].outE[0].influence > 0, 'eased');
  ae2.call('buildScene', { spec: aeScene.normalize(aeScene.buildLibrary('number-counter', { title: '250' }), {}).spec });
  const num = byName(ae2.project.activeItem, 'Number');
  assert.match(num.property('ADBE Text Properties').property('ADBE Text Document').expression, /linear\(t,0,2,0,250\)/);
  ae2.call('buildScene', { spec: aeScene.normalize(aeScene.buildLibrary('glitch-title', {}), {}).spec });
  const g = byName(ae2.project.activeItem, 'Title');
  const blur = g.property('ADBE Effect Parade').property('ADBE Motion Blur');
  assert.equal(blur.property('ADBE Motion Blur-0002').numKeys, 2, 'effect param keyed');
  assert.ok(ae2.project.activeItem.layerList.some(L => L.name === 'Background'));
  ae2.call('buildScene', { spec: aeScene.normalize(aeScene.buildLibrary('kinetic-title', {}), {}).spec });
  const t = byName(ae2.project.activeItem, 'Title');
  assert.equal(t.property('ADBE Text Properties').property('ADBE Text Animators').numProperties, 1);
});

test('edit by layer names: set text/colour/size + keys, add, delete, slower (keys stretched from the layer start)', () => {
  const ae = loadAE();
  ae.call('buildScene', { spec: aeScene.normalize(aeScene.buildLibrary('kinetic-title', { title: 'قديم' }), {}).spec });
  const c = ae.project.activeItem;
  const before = tr(byName(c, 'Subtitle'), 'ADBE Opacity').keys.map(k => k.t);
  const ops = [
    { op: 'set', layer: 'Title', look: { text: 'جديد', color: [0, 0, 1, 1], size: 200, transform: {}, keys: { rotation: [{ t: 0, v: -10, bz: [0.16, 1, 0.3, 1], hold: false }, { t: 1, v: 0, bz: null, hold: false }] }, effects: [], expressions: {} } },
    { op: 'add', spec: aeScene.normalize({ layers: [{ type: 'shape', name: 'Badge', shape: { kind: 'star' } }] }, { width: 1920, height: 1080 }).spec.layers[0] },
    { op: 'delete', layer: 'Glow Orb' },
    { op: 'set', layer: 'Nope', look: {} },
    { op: 'retime', factor: 2 }
  ];
  const r = ae.call('editScene', { ops });
  assert.equal(r.done, 4); assert.deepEqual(r.missing, ['Nope']);
  const doc = byName(c, 'Title').property('ADBE Text Properties').property('ADBE Text Document').value;
  assert.equal(doc.text, 'جديد'); assert.equal(doc.fontSize, 200); assert.deepEqual(Array.from(doc.fillColor), [0, 0, 1]);
  assert.ok(byName(c, 'Badge') && !byName(c, 'Glow Orb'));
  const after = tr(byName(c, 'Subtitle'), 'ADBE Opacity').keys.map(k => k.t);
  assert.deepEqual(after, before.map(t => t * 2), 'twice as slow');
  const st = ae.call('sceneState', {});
  assert.ok(st.layers.find(l => l.name === 'Title').animated.some(a => /^Rotation:2/.test(a)));
});

test('director: description → new scene; then "make it bigger and orange" → edit on the same layers; the chat is remembered', async () => {
  const ae = loadAE();
  const { A, asked } = services(ae, [
    { action: 'build', say: 'عملت إنترو', scene: { comp: { create: true, name: 'Intro', duration: 5 }, layers: [{ type: 'text', name: 'Brand', text: 'EditFast', keys: { scale: [[0, 0, 'backOut'], [0.6, 100]] } }, { type: 'shape', name: 'Ring', shape: { kind: 'ellipse', size: [300, 300], fill: null, stroke: '#fff' }, keys: { rotation: [[0, 0, 'linear'], [5, 360]] } }] } },
    { action: 'edit', say: 'كبّرته', ops: [{ op: 'set', layer: 'Brand', look: { size: 160, color: '#f97316', keys: { position: [[0, ['50%', '60%'], 'expoOut'], [0.5, ['50%', '50%']]] } } }, { op: 'delete', layer: 'Ring' }] },
    { action: 'library', say: 'ده عدّاد', use: 'number-counter', params: { title: '99' } }
  ]);
  const r1 = await A.director({ message: 'إنترو باسم EditFast ودايرة بتلف', review: false });
  assert.equal(r1.action, 'build'); assert.equal(r1.result.layers, 2);
  const c = ae.project.activeItem; assert.equal(c.name, 'Intro');
  assert.match(text(asked[0].messages[0]), /"layers"/, 'the scene language is in the prompt');
  const r2 = await A.director({ message: 'كبّر الاسم وخليه برتقالي وشيل الدايرة', review: false });
  assert.equal(r2.action, 'edit'); assert.equal(r2.result.done, 2);
  assert.match(JSON.stringify(asked[1].messages), /Brand/, 'the AI sees the comp state by names');
  assert.ok(asked[1].messages.some(m => m.role === 'assistant'), 'history');
  const doc = byName(c, 'Brand').property('ADBE Text Properties').property('ADBE Text Document').value;
  assert.equal(doc.fontSize, 160); assert.equal(Math.round(doc.fillColor[0] * 255), 249);
  assert.deepEqual(Array.from(tr(byName(c, 'Brand'), 'ADBE Position').keys[1].v).slice(0, 2), [c.width / 2, c.height / 2]);
  const r3 = await A.director({ message: 'عدّاد 99', where: 'new', review: false });
  assert.equal(r3.action, 'library'); assert.ok(byName(ae.project.activeItem, 'Number'));
  A.directorReset(); assert.equal(A.history.length, 0);
});

test('director with a reference image: frames go to the vision model with the analysis asked for', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  const img = path.join(TMP, 'ref.png'); fs.writeFileSync(img, require('../../core/util').makePng(64, 36, [234, 88, 12, 255]));
  const { A, asked } = services(ae, [{ action: 'build', say: 'زيه', reference: 'برتقالي غامق وخط عريض', scene: { layers: [{ type: 'solid', name: 'BG', color: '#ea580c' }] } }]);
  const r = await A.director({ message: 'اعمل زي ده', refs: [img], review: false });
  assert.equal(r.reference, 'برتقالي غامق وخط عريض');
  const user = asked[0].messages[asked[0].messages.length - 1];
  assert.ok(Array.isArray(user.content) && user.content.some(p => p.type === 'image_url'));
  assert.match(text(asked[0].messages[0]), /ريفرانس/);
});

test('auto edit: clips + music → cuts on the beat, each clip a new part of itself, filled to the frame, music under it', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  const vids = [0, 1].map(i => { const f = path.join(TMP, 'ae-clip' + i + '.mp4'); execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-pix_fmt', 'yuv420p', f]); return f; });
  const music = makeClicks('ae-music.wav', 120, 8);
  const { A } = services(ae, [{ order: [1, 0], best: { 1: 2 }, titles: [{ text: 'يلا بينا', at: 0.5 }], note: 'تمام' }]);
  const steps = [];
  const r = await A.autoEdit({ files: vids, music, style: 'energetic', ratio: '9:16', brief: 'حماسي', onStep: m => steps.push(m) });
  const c = ae.project.activeItem;
  assert.equal(c.width, 1080); assert.equal(c.height, 1920);
  assert.ok(r.cuts >= 8, 'cuts ' + r.cuts); assert.ok(Math.abs(r.bpm - 120) < 3, 'bpm ' + r.bpm);
  const cuts = c.layerList.filter(L => /^Cut /.test(L.name)).sort((a, b) => a.inPoint - b.inPoint);
  assert.equal(cuts[0].source.file.fsName, vids[1], 'AI order');
  assert.ok(Math.abs((cuts[0].inPoint - cuts[0].startTime) - 2) < 0.01, 'starts at the best moment');
  for (let i = 1; i < cuts.length; i++) assert.ok(Math.abs(cuts[i].inPoint - cuts[i - 1].outPoint) < 0.02, 'back to back');
  const sc = tr(cuts[0], 'ADBE Scale').keys[1].v[0];
  assert.ok(Math.abs(sc - 100 * 1920 / 720) < 0.5, 'cover: ' + sc);
  assert.ok(byName(c, 'Music') && byName(c, 'Title 1'));
  assert.ok(steps.length >= 3);
});

/* ---------------- v2: paths, trim, repeater, masks, mattes, gradients, precomps, particles, plugins, review ---------------- */
const svg = require('../../core/svgPath');

test('svg paths: M/L/H/V/C/S/Q/T/A (absolute + relative), Z merges the closing point, fit centres + scales', () => {
  const [a, b] = svg.parse('M10 10 H30 V30 Z m 5 5 l 10 0 q 5 5 0 10 t -10 0 z');
  assert.deepEqual(a.v, [[10, 10], [30, 10], [30, 30]]); assert.equal(a.c, true);
  assert.deepEqual(b.v[0], [15, 15]); assert.equal(b.v.length, 4); assert.ok(b.o[1][0] > 0, 'quadratic → cubic handles');
  const circle = svg.parse('M 0 -10 A 10 10 0 1 1 0 10 A 10 10 0 1 1 0 -10 Z')[0];
  const bb = svg.bbox([circle]); assert.ok(Math.abs(bb.w - 20) < 0.01 && Math.abs(bb.h - 20) < 0.01, JSON.stringify(bb));
  const [f] = svg.fit([svg.fromPoints([[0, 0], [100, 0], [100, 50]])], [200, 200]);
  assert.deepEqual(f.v, [[-100, -50], [100, -50], [100, 50]]);
  const sm = svg.fromPoints([[0, 0], [10, 10], [20, 0]], { smooth: true });
  assert.deepEqual(sm.o[1], [20 / 6, 0]); assert.deepEqual(svg.parse('nonsense 1 2'), []);
});

function buildV2(ae, extra = {}) {
  const raw = { comp: { create: true, name: 'V2', duration: 6 }, layers: [
    { type: 'text', name: 'Title', text: 'أهلا', matte: { layer: 'Box', type: 'alpha' }, textAnimators: [{ preset: 'rotateIn', by: 'chars' }], textOut: { preset: 'fadeUp', duration: 0.5, start: 5 }, counter: { to: 99, prefix: '$', suffix: '+', decimals: 1 } },
    { type: 'shape', name: 'Box', shape: { kind: 'rect', size: ['100%', 200] } },
    { type: 'shape', name: 'Icon', shape: { path: 'M12 2 L22 22 L2 22 Z', size: [300, 300], fill: null, stroke: '#ffffff', trim: { end: 0 }, dash: 30 }, keys: { 'shape:trimEnd': [[0, 0, 'expoOut'], [1, 100]], 'shape:path': [[0, 'M0 0 L10 0 L5 10 Z', 'easeInOut'], [2, [[0, 0], [20, 0], [10, 30]]]] } },
    { type: 'shape', name: 'Blob', shape: { kind: 'ellipse', size: [400, 400], gradient: { colors: ['#ff0000', '#0000ff'], type: 'radial' }, repeater: { copies: 6, rotation: 60, position: [0, 0] } }, keys: { 'shape:repeaterCopies': [[0, 1], [1, 6]] } },
    { type: 'solid', name: 'Plate', color: '#222', masks: [{ rect: ['10%', '10%', '80%', '80%'], feather: 40, mode: 'add' }, { ellipse: ['50%', '50%', 200, 200], mode: 'subtract', inverted: true }], keys: { 'mask:1.expansion': [[0, -300, 'expoOut'], [1, 0]] },
      effects: [{ match: 'VIDEOCOPILOT 3DSaber', params: { 'Glow Intensity': 80, 'Core Size': 2 } }, { match: 'NOT Installed FX', params: {} }, { name: 'fractalNoise', params: { contrast: 150, scale: 300 } }],
      expressions: { 'fx:fractalNoise.evolution': 'time*90' } },
    { type: 'precomp', name: 'Sub', start: 1, comp: { duration: 3 }, layers: [{ type: 'text', name: 'Inner', text: 'جوه' }, { type: 'particles', name: 'Snow', preset: 'snow', count: 7 }] },
    { type: 'camera', name: 'Cam', camera: { zoom: 1800, dof: true, focusDistance: 1500 } },
    ...(extra.layers || [])
  ] };
  const n = aeScene.normalize(raw, {});
  const r = ae.call('buildScene', { spec: JSON.parse(JSON.stringify(n.spec)) });
  return { n, r, c: ae.project.activeItem };
}

test('v2 build: svg path + trim + dash + morph keys, gradient (matted solid), repeater, masks, track matte, precomp with particles, plugin + raw effects, camera options, text in/out', () => {
  const ae = loadAE();
  const { n, r, c } = buildV2(ae);
  const root = L => L.property('ADBE Root Vectors Group');
  const find = (g, m) => { for (const ch of g.children || []) { if (ch.matchName === m) return ch; const x = find(ch, m); if (x) return x; } return null; };
  // path icon
  const icon = byName(c, 'Icon'), pth = find(root(icon), 'ADBE Vector Shape');
  assert.equal(pth.keys.length, 2, 'morph keys'); assert.equal(pth.keys[1].v.vertices.length, 3);
  assert.ok(pth.keys[0].outE && isFinite(pth.keys[0].outE[0].speed), 'path ease without NaN');
  const trimEnd = find(root(icon), 'ADBE Vector Trim End'); assert.deepEqual(trimEnd.keys.map(k => k.v), [0, 100]);
  assert.equal(find(root(icon), 'ADBE Vector Stroke Line Cap').value, 2, 'round caps with trim');
  assert.ok(find(root(icon), 'ADBE Vector Stroke Dash 1'), 'dash');
  assert.ok(!find(root(icon), 'ADBE Vector Graphic - Fill'), 'open path: stroke only');
  // gradient: a solid with Ramp matted by the blob
  const grad = byName(c, 'Blob Gradient'), ramp = grad.property('ADBE Effect Parade').property('ADBE Ramp');
  assert.deepEqual(Array.from(ramp.property('ADBE Ramp-0002').value), [1, 0, 0, 1]); assert.equal(ramp.property('ADBE Ramp-0005').value, 2);
  assert.equal(grad.trackMatteLayer, byName(c, 'Blob')); assert.equal(byName(c, 'Blob').enabled, false);
  assert.equal(find(root(byName(c, 'Blob')), 'ADBE Vector Repeater Copies').keys.length, 2);
  // masks
  const mp = byName(c, 'Plate').property('ADBE Mask Parade');
  assert.equal(mp.numProperties, 2); assert.equal(mp.property(2).maskMode, ae.ctx.MaskMode.SUBTRACT); assert.equal(mp.property(2).inverted, true);
  assert.deepEqual(Array.from(mp.property(1).property('ADBE Mask Shape').value.vertices[0]), [192, 108]);
  assert.equal(mp.property(1).property('ADBE Mask Offset').keys.length, 2);
  // effects: plugin by display names, raw missing one reported, friendly param inside a sub-group, expression on a fx param
  const fx = byName(c, 'Plate').property('ADBE Effect Parade');
  assert.equal(fx.property('VIDEOCOPILOT 3DSaber').property('Glow Intensity').value, 80);
  assert.ok(r.skipped.some(w => /NOT Installed FX/.test(w)), JSON.stringify(r.skipped));
  assert.equal(fx.property('ADBE Fractal Noise').property('Transform').property('Scale').value, 300);
  assert.equal(fx.property('ADBE Fractal Noise').property('Evolution').expression, 'time*90');
  // matte + text
  const title = byName(c, 'Title');
  assert.equal(title.trackMatteLayer, byName(c, 'Box'));
  const anims = title.property('ADBE Text Properties').property('ADBE Text Animators');
  assert.equal(anims.numProperties, 2);
  const outOff = anims.property(2).property('ADBE Text Selectors').property(1).property('ADBE Text Percent Offset');
  assert.deepEqual(outOff.keys.map(k => [k.t, k.v]), [[5, -100], [5.5, 0]]);
  assert.match(title.property('ADBE Text Properties').property('ADBE Text Document').expression, /'\$'\+n\.toFixed\(1\)\+'\+'/);
  // precomp + particles (a precomp of expression-driven shapes)
  const sub = byName(c, 'Sub');
  assert.equal(sub.startTime, 1); assert.equal(sub.source.layerList.length, 2);
  const snow = sub.source.layerList.find(L => L.name === 'Snow');
  assert.equal(snow.source.layerList.length, 7);
  assert.match(snow.source.layerList[0].property('ADBE Transform Group').property('ADBE Position').expression, /seedRandom/);
  // camera options
  const cam = byName(c, 'Cam').property('ADBE Camera Options Group');
  assert.equal(cam.property('ADBE Camera Zoom').value, 1800); assert.equal(cam.property('ADBE Camera Depth of Field').value, 1);
  assert.deepEqual(n.warnings, []);
});

test('v2: track matte on older AE (no setTrackMatte) moves the matte right above; edits: replace keeps the stack place, masks, comp length', () => {
  const ae = loadAE();
  delete ae.ctx.AVLayer.prototype.setTrackMatte; // the class chain shares Layer.prototype
  const Lp = Object.getPrototypeOf(ae.ctx.AVLayer.prototype); const keep = Lp.setTrackMatte; delete Lp.setTrackMatte;
  const { c } = buildV2(ae);
  const title = byName(c, 'Title'), box = byName(c, 'Box');
  assert.equal(title.trackMatteType, ae.ctx.TrackMatteType.ALPHA); assert.equal(box.index, title.index - 1);
  Lp.setTrackMatte = keep;
  const idx = byName(c, 'Icon').index;
  const ops = [
    { op: 'replace', layer: 'Icon', spec: aeScene.normalize({ layers: [{ type: 'shape', name: 'Icon', shape: { kind: 'star', points: 6 } }] }, { width: 1920, height: 1080 }).spec.layers[0] },
    { op: 'set', layer: 'Plate', look: aeScene.normalizeLook({ masks: [{ ellipse: ['50%', '50%', 100, 100] }] }, { width: 1920, height: 1080 }).look },
    { op: 'comp', duration: 12 }
  ];
  const r = ae.call('editScene', { ops });
  assert.equal(r.done, 3);
  assert.equal(byName(c, 'Icon').index, idx, 'same place in the stack');
  assert.ok(byName(c, 'Icon').property('ADBE Root Vectors Group').children[0].property('ADBE Vectors Group').property('ADBE Vector Shape - Star'));
  assert.equal(byName(c, 'Plate').property('ADBE Mask Parade').numProperties, 1, 'masks replaced');
  assert.equal(c.duration, 12);
});

test('director v2: plugins in the prompt, then self-review looks at PNG frames of the comp and applies its fixes', async () => {
  const ae = loadAE();
  const { A, asked } = services(ae, [
    { action: 'build', say: 'تمام', scene: { comp: { create: true, name: 'Ad', duration: 4 }, layers: [{ type: 'text', name: 'Headline', text: 'عرض', size: 40 }] } },
    { ok: false, say: 'الكلام كان صغير', ops: [{ op: 'set', layer: 'Headline', look: { size: 140 } }, { op: 'add', layer: { type: 'particles', name: 'Sparks', preset: 'sparks', count: 5 } }] }
  ]);
  const steps = [];
  const r = await A.director({ message: 'إعلان عرض', onStep: m => steps.push(m) });
  assert.match(text(asked[0].messages[0]), /Saber = VIDEOCOPILOT 3DSaber/); assert.doesNotMatch(text(asked[0].messages[0]), /X Old/);
  const rv = asked[1].messages[asked[1].messages.length - 1].content;
  assert.equal(rv.filter(p => p.type === 'image_url' && /^data:image\/png;base64,/.test(p.image_url.url)).length, 4, 'four frames of the comp');
  assert.equal(asked[1].messages.length, 2, 'review without the chat history');
  assert.deepEqual(r.review, { ok: false, fixed: 2, say: 'الكلام كان صغير' });
  const c = ae.project.activeItem;
  assert.equal(byName(c, 'Headline').property('ADBE Text Properties').property('ADBE Text Document').value.fontSize, 140);
  assert.ok(byName(c, 'Sparks'));
  assert.ok(steps.includes('بيراجع شغله…') && steps.includes('بيصلّح…'));
});

test('reference video: evenly spaced frames with their times + the pacing from shot detection', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  const vid = path.join(TMP, 'ref-cuts.mp4');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=2', '-f', 'lavfi', '-i', 'color=c=green:s=160x90:d=2', '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0', '-pix_fmt', 'yuv420p', vid]);
  const { A, asked } = services(ae, [{ action: 'build', say: 'زيه', scene: { layers: [{ type: 'solid', name: 'BG' }] } }]);
  await A.director({ message: 'زي ده', refs: [vid], review: false });
  const user = asked[0].messages[asked[0].messages.length - 1].content;
  assert.equal(user.filter(p => p.type === 'image_url').length, 8);
  assert.match(user[0].text, /ref-cuts\.mp4: 6\.0 ثانية، 2 قطع/);
  assert.match(user[0].text, /@0\.38s/);
});

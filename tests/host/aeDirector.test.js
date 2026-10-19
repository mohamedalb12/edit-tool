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
  assert.ok(st.layers.find(l => l.name === 'Title').animated.some(a => /rotation/.test(a)));
});

test('director: description → new scene; then "make it bigger and orange" → edit on the same layers; the chat is remembered', async () => {
  const ae = loadAE();
  const { A, asked } = services(ae, [
    { action: 'build', say: 'عملت إنترو', scene: { comp: { create: true, name: 'Intro', duration: 5 }, layers: [{ type: 'text', name: 'Brand', text: 'EditFast', keys: { scale: [[0, 0, 'backOut'], [0.6, 100]] } }, { type: 'shape', name: 'Ring', shape: { kind: 'ellipse', size: [300, 300], fill: null, stroke: '#fff' }, keys: { rotation: [[0, 0, 'linear'], [5, 360]] } }] } },
    { action: 'edit', say: 'كبّرته', ops: [{ op: 'set', layer: 'Brand', look: { size: 160, color: '#f97316', keys: { position: [[0, ['50%', '60%'], 'expoOut'], [0.5, ['50%', '50%']]] } } }, { op: 'delete', layer: 'Ring' }] },
    { action: 'library', say: 'ده عدّاد', use: 'number-counter', params: { title: '99' } }
  ]);
  const r1 = await A.director({ message: 'إنترو باسم EditFast ودايرة بتلف' });
  assert.equal(r1.action, 'build'); assert.equal(r1.result.layers, 2);
  const c = ae.project.activeItem; assert.equal(c.name, 'Intro');
  assert.match(text(asked[0].messages[0]), /"layers"/, 'the scene language is in the prompt');
  const r2 = await A.director({ message: 'كبّر الاسم وخليه برتقالي وشيل الدايرة' });
  assert.equal(r2.action, 'edit'); assert.equal(r2.result.done, 2);
  assert.match(JSON.stringify(asked[1].messages), /Brand/, 'the AI sees the comp state by names');
  assert.ok(asked[1].messages.some(m => m.role === 'assistant'), 'history');
  const doc = byName(c, 'Brand').property('ADBE Text Properties').property('ADBE Text Document').value;
  assert.equal(doc.fontSize, 160); assert.equal(Math.round(doc.fillColor[0] * 255), 249);
  assert.deepEqual(Array.from(tr(byName(c, 'Brand'), 'ADBE Position').keys[1].v).slice(0, 2), [c.width / 2, c.height / 2]);
  const r3 = await A.director({ message: 'عدّاد 99', where: 'new' });
  assert.equal(r3.action, 'library'); assert.ok(byName(ae.project.activeItem, 'Number'));
  A.directorReset(); assert.equal(A.history.length, 0);
});

test('director with a reference image: frames go to the vision model with the analysis asked for', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  const img = path.join(TMP, 'ref.png'); fs.writeFileSync(img, require('../../core/util').makePng(64, 36, [234, 88, 12, 255]));
  const { A, asked } = services(ae, [{ action: 'build', say: 'زيه', reference: 'برتقالي غامق وخط عريض', scene: { layers: [{ type: 'solid', name: 'BG', color: '#ea580c' }] } }]);
  const r = await A.director({ message: 'اعمل زي ده', refs: [img] });
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

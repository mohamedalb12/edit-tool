'use strict';
// EditFast Motion (After Effects): host/ae.jsx in the AE simulator, through AEServices, down to Premiere placing the
// template with its fields filled.
const { TMP } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const config = require('../../core/config');
const { loadAE } = require('./mockAE');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'host', 'ae.jsx'), 'utf8');

function scene(ae) {
  const c = ae.newComp('Title Card', { duration: 6 });
  ae.project.file = new ae.File(path.join(TMP, 'ae-proj', 'card.aep'));
  const txt = c.layers.addText('أهلا بيكم'); txt.name = 'Headline';
  const box = c.layers.addShape(); box.name = 'Box';
  const g = box.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  g.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Rect');
  g.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([0.976, 0.451, 0.086, 1]);
  const box2 = c.layers.addShape(); box2.name = 'Box 2';
  const g2 = box2.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  g2.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([0.976, 0.451, 0.086, 1]); // same orange
  const sc = box.property('ADBE Transform Group').property('ADBE Scale');
  sc.setValueAtTime(0, [0, 0]); sc.setValueAtTime(0.5, [100, 100]);
  ae.project._active = c;
  return { c, txt, box, box2 };
}

test('ae.jsx is valid ES3 (ExtendScript)', () => { acorn.parse(SRC, { ecmaVersion: 3 }); });

test('template: a copy of the comp gets the chosen editable parts (text, one colour per colour, speed + strength), exported as MOGRT; the original is untouched', () => {
  const ae = loadAE(); const { c } = scene(ae);
  const scan = ae.call('templateScan', {});
  assert.deepEqual(scan.texts, ['أهلا بيكم']); assert.equal(scan.colors.length, 2, 'orange + the text white'); assert.ok(scan.animated >= 1);
  const out = path.join(TMP, 'mgt', 'Title Card.mogrt'); try { fs.unlinkSync(out); } catch (_) {}
  const r = ae.call('templateSave', { name: 'تايتل برتقالي', path: out, editable: { text: true, colors: true, motion: true } });
  assert.ok(fs.existsSync(out));
  assert.ok(r.exposed.includes('text') && r.exposed.includes('color') && r.exposed.includes('speed') && r.exposed.includes('strength'));
  const dup = ae.project.item(ae.project.numItems - 1) instanceof ae.K.CompItem ? null : null; void dup;
  const tpl = Array.from({ length: ae.project.numItems }, (_, i) => ae.project.item(i + 1)).find(x => x.name === 'تايتل برتقالي (EditFast)');
  assert.ok(tpl, 'the duplicate is the template');
  assert.equal(tpl.motionGraphicsTemplateName, 'تايتل برتقالي');
  const names = tpl._egp.map(e => e.name);
  assert.deepEqual(names.filter(n => /^لون/.test(n)).length, 2, 'one control per colour, not per fill');
  assert.ok(names.includes('الكلام') && names.includes('سرعة الحركة %') && names.includes('قوة الحركة %'));
  // both orange fills follow the same control; the animated scale follows speed + strength
  const fills = [];
  tpl.layerList.forEach(L => { const root = L.property('ADBE Root Vectors Group'); if (root) root.children.forEach(gr => gr.property('ADBE Vectors Group').children.forEach(it => { const f = it.property && it.property('ADBE Vector Fill Color'); if (f) fills.push(f); })); });
  assert.equal(new Set(fills.map(f => f.expression)).size, 1, 'same colour → same control');
  const box = tpl.layerList.find(L => L.name === 'Box');
  assert.match(box.property('ADBE Transform Group').property('ADBE Scale').expression, /EF Speed[\s\S]*EF Strength/);
  // the user's comp has none of it
  assert.equal(c._egp.length, 0); assert.equal(c.layerList.some(L => L.name === 'EF Controls'), false);
  assert.equal(c.layerList.find(L => L.name === 'Box').property('ADBE Transform Group').property('ADBE Scale').expression, '');
  const def = require('../../core/mogrt').readDefinition(out);
  assert.deepEqual(def.controls.map(x => x.type).sort(), ['color', 'color', 'slider', 'slider', 'text']);
  assert.equal(def.controls.find(x => x.type === 'text').value, 'أهلا بيكم');
});

test('template: an unsaved project is refused with a clear message; transform + own controls are exposed', () => {
  const ae = loadAE(); const { c } = scene(ae);
  ae.project.file = null;
  assert.throws(() => ae.call('templateSave', { name: 'x', path: path.join(TMP, 'mgt', 'x.mogrt'), editable: { text: true } }), /احفظ مشروع الأفتر/);
  ae.project.file = new ae.File(path.join(TMP, 'ae-proj', 'card.aep'));
  const fx = c.layerList.find(L => L.name === 'Headline').property('ADBE Effect Parade').addProperty('ADBE Slider Control'); fx.name = 'Glow';
  const r = ae.call('templateSave', { name: 'كله', path: path.join(TMP, 'mgt', 'all.mogrt'), editable: { transform: true, controls: true } });
  assert.ok(r.exposed.includes('position') && r.exposed.includes('scale') && r.exposed.includes('control'));
  const tpl = Array.from({ length: ae.project.numItems }, (_, i) => ae.project.item(i + 1)).find(x => x.name === 'كله (EditFast)');
  assert.ok(tpl._egp.some(e => e.name === 'Glow'));
  const rig = tpl.layerList.find(L => L.name === 'EF Rig');
  assert.ok(tpl.layerList.filter(L => L !== rig).every(L => L.parent === rig || L.name === 'EF Controls'));
});

test('motion presets in AE: keys on the selected layers, eased like the preset curve (influence / speed)', () => {
  const ae = loadAE(); const { c, txt } = scene(ae);
  c.selectedLayers = [txt]; txt.inPoint = 1;
  const g = require('../../core/motionPresets').generate('zoom-in-reveal', 2, { fps: 25 });
  const r = ae.call('applyMotion', { mode: 'in', duration: g.duration, props: g.props });
  assert.equal(r.layers, 1);
  const sc = txt.property('ADBE Transform Group').property('ADBE Scale');
  assert.equal(sc.numKeys, 2); assert.equal(sc.keyTime(1), 1);
  assert.deepEqual(sc.keyValue(1), [130, 130]); assert.deepEqual(sc.keyValue(2), [100, 100]);
  const out = sc.keyOutTemporalEase(1)[0];
  assert.ok(Math.abs(out.influence - 16) < 0.5, 'expoOut x1 0.16 → 16 % influence: ' + out.influence);
  assert.equal(sc.keyOutTemporalEase(1).length, 2, 'scale: one ease per dimension');
  const pos = txt.property('ADBE Transform Group').property('ADBE Position');
  void pos;
});

test('Flow-style ease on selected keyframes; stagger; anchor without moving; null controller', () => {
  const ae = loadAE(); const { c, box, box2, txt } = scene(ae);
  const sc = box.property('ADBE Transform Group').property('ADBE Scale'); sc.selectedKeys = [1, 2];
  c.selectedProperties = [sc];
  assert.equal(ae.call('applyEase', { bezier: [0.7, 0, 0.3, 1] }).segments, 1);
  assert.ok(Math.abs(sc.keyOutTemporalEase(1)[0].influence - 70) < 0.01 && Math.abs(sc.keyInTemporalEase(2)[0].influence - 70) < 0.01);
  c.selectedLayers = [txt, box, box2];
  ae.call('stagger', { frames: 5, order: 'down' });
  const st = [txt, box, box2].sort((a, b) => a.index - b.index).map(L => +L.startTime.toFixed(3));
  assert.deepEqual(st, [0, 0.2, 0.4]);
  // anchor to the top-left: the layer stays where it was on screen
  box2._rect = { left: -100, top: -50, width: 200, height: 100 };
  const p0 = box2.property('ADBE Transform Group').property('ADBE Position').value.slice();
  c.selectedLayers = [box2];
  ae.call('anchor', { where: 'tl' });
  assert.deepEqual(box2.property('ADBE Transform Group').property('ADBE Anchor Point').value, [-100, -50]);
  assert.deepEqual(box2.property('ADBE Transform Group').property('ADBE Position').value, [p0[0] - 100, p0[1] - 50]);
  c.selectedLayers = [txt, box2];
  const n = ae.call('nullController', {});
  assert.equal(n.layers, 2);
  assert.ok(txt.parent && txt.parent === box2.parent && txt.parent.nullLayer);
});

test('expressions with sliders, text animator, lower third, shapes', () => {
  const ae = loadAE(); const { c, txt, box } = scene(ae);
  c.selectedLayers = [txt]; c.selectedProperties = [];
  ae.call('addExpression', { kind: 'wiggle' });
  assert.match(txt.property('ADBE Transform Group').property('ADBE Position').expression, /wiggle\(effect\("EF Wiggle Freq"\)/);
  assert.equal(txt.property('ADBE Effect Parade').property('EF Wiggle Amp').property(1).value, 30);
  c.selectedLayers = [txt];
  assert.throws(() => ae.call('addExpression', { kind: 'bounce' }), /كي فريمز/);
  c.selectedLayers = [box];
  assert.equal(ae.call('addExpression', { kind: 'autoFade' }).applied, 1);
  assert.match(box.property('ADBE Transform Group').property('ADBE Opacity').expression, /EF Fade Frames/);
  c.selectedLayers = [txt];
  ae.call('textAnimate', { preset: 'fadeUp', by: 'words', duration: 1.2 });
  const an = txt.property('ADBE Text Properties').property('ADBE Text Animators').property(1);
  const off = an.property('ADBE Text Selectors').property(1).property('ADBE Text Percent Offset');
  assert.deepEqual([off.keyValue(1), off.keyValue(2), off.keyTime(2)], [0, 100, 1.2]);
  assert.equal(an.property('ADBE Text Animator Properties').property('ADBE Text Opacity').value, 0);
  c.selectedLayers = [box];
  assert.throws(() => ae.call('textAnimate', { preset: 'fadeUp' }), /Text/);
  c.time = 1;
  const lt = ae.call('lowerThird', { name: 'محمد', title: 'مونتير', duration: 4 });
  assert.equal(lt.layers, 4);
  const bar = c.layerList.find(L => L.name === 'LT Bar');
  assert.deepEqual(bar.property('ADBE Transform Group').property('ADBE Scale').keys.map(k => k.t), [1, 1.45, 4.6, 5]);
  assert.equal(c.layerList.find(L => L.name === 'LT Name').property('ADBE Text Properties').property('ADBE Text Document').value.text, 'محمد');
  ae.call('addShape', { kind: 'ring', color: '#22c55e' });
  const ring = c.layerList.find(L => L.name === 'EF ring');
  const stroke = ring.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('ADBE Vector Graphic - Stroke');
  assert.deepEqual(stroke.property('ADBE Vector Stroke Color').value.map(v => Math.round(v * 255)), [34, 197, 94, 255]);
});

test('3D: camera rig on a null, parallax keeps the on-screen size, lights, extrusion with Advanced 3D', () => {
  const ae = loadAE(); const { c, txt, box, box2 } = scene(ae);
  ae.call('cameraRig', { kind: 'push', duration: 4 });
  const rig = c.layerList.find(L => L.name === 'EF Camera Rig'), cam = c.layerList.find(L => L.name === 'EF Camera');
  assert.equal(cam.parent, rig);
  assert.deepEqual(rig.property('ADBE Transform Group').property('ADBE Position').keys.map(k => k.v[2]), [0, 400]);
  c.selectedLayers = [txt, box, box2];
  ae.call('parallax', { depth: 500 });
  const sorted = [txt, box, box2].sort((a, b) => a.index - b.index);
  sorted.forEach((L, i) => {
    const p = L.property('ADBE Transform Group').property('ADBE Position').valueAtTime(1), s = L.property('ADBE Transform Group').property('ADBE Scale').valueAtTime(1);
    assert.equal(p[2], i * 500); assert.ok(Math.abs(s[0] - 100 * (2666.7 + i * 500) / 2666.7) < 0.01, 'scaled for its depth'); assert.equal(L.threeDLayer, true);
  });
  const lr = ae.call('lightRig', {});
  assert.equal(lr.lights, 2); assert.equal(lr.casting, 3);
  c.selectedLayers = [txt];
  const ex = ae.call('extrude', { depth: 60 });
  assert.equal(ex.renderer, 'ADBE Calder'); assert.equal(c.renderer, 'ADBE Calder');
  assert.equal(txt.property('ADBE Extrsn Options Group').property('ADBE Extrsn Depth').value, 60);
});

test('routine: render with the right output template, palette read + swap, cleanup, import into the comp', () => {
  const ae = loadAE(); const { c, box } = scene(ae);
  const out = path.join(TMP, 'ae-renders', 'card.mov');
  const r = ae.call('render', { path: out, template: 'alpha' });
  assert.equal(r.template, 'High Quality with Alpha'); assert.ok(fs.existsSync(out));
  const pal = ae.call('paletteRead', {});
  assert.equal(pal.colors[0].hex, '#f97316'); assert.equal(pal.colors[0].count, 2);
  assert.equal(ae.call('paletteApply', { map: { '#f97316': '#22c55e' } }).changed, 2);
  const fill = box.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color');
  assert.deepEqual(fill.value.slice(0, 3).map(v => Math.round(v * 255)), [34, 197, 94]);
  const media = path.join(TMP, 'ae-lib-leak.mp4'); fs.writeFileSync(media, 'x');
  const unused = path.join(TMP, 'ae-unused.mp4'); fs.writeFileSync(unused, 'x');
  ae.project.importFile({ file: new ae.File(unused) });
  c.time = 2;
  const im = ae.call('importToComp', { path: media });
  assert.equal(c.layerList.find(L => L.name === 'ae-lib-leak.mp4').startTime, 2); assert.ok(im.index >= 1);
  const cl = ae.call('cleanup', { removeUnused: true, organize: true });
  assert.equal(cl.removed, 1); assert.ok(cl.moved >= 1, 'the comp went into Comps');
});

test('AEServices → Premiere: save a template, it lands in Premiere\'s templates folder + مكتبتي; Premiere places it with the fields filled', async () => {
  const ae = loadAE(); scene(ae);
  const mgtDir = path.join(TMP, 'premiere-mgt-' + Date.now());
  config.save({ ...config.DEFAULTS, paths: { ...config.DEFAULTS.paths, mogrtDir: mgtDir } });
  require('../../core/mogrt').save(config.dataDir(), []);
  const { AEServices } = require('../../core/aeServices');
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) });
  await assert.rejects(A.templateSave({ name: 'x', editable: {} }), /اختار حاجة/);
  const t = await A.templateSave({ name: 'تايتل برتقالي', editable: { text: true, colors: true, motion: true } });
  assert.equal(t.path, path.join(mgtDir, 'تايتل برتقالي.mogrt'));
  assert.deepEqual(t.fields.map(f => f.type).sort(), ['color', 'color', 'slider', 'slider', 'text']);
  assert.ok(t.thumb && fs.existsSync(t.thumb));
  assert.ok(A.settings.libraryDirs.includes(mgtDir), 'Premiere\'s مكتبتي scans the templates folder');
  assert.equal(A.templates().length, 1);
  // edit in AE → update re-exports the same file
  const before = fs.statSync(t.path).mtimeMs;
  await new Promise(r => setTimeout(r, 20));
  await A.templateUpdate(t.id);
  assert.ok(fs.statSync(t.path).mtimeMs >= before);
  // render → Premiere's "from After Effects" list
  ae.project.file = new ae.File(path.join(TMP, 'ae-proj', 'card.aep'));
  const rr = await A.render({ template: 'h264' });
  assert.match(rr.path, /EditFast Renders[\\/]Title Card\.mp4$/);
  // Premiere side
  const { Services } = require('../../core/services');
  const { loadHost } = require('./mockPremiere');
  const h = loadHost(); const seq = h.pr.newSequence('Main', { fps: 25 }); seq.player = 3;
  const P = new Services({ host: async (n, a) => h.call(n, JSON.parse(JSON.stringify(a))) });
  const mine = P.myTemplates();
  assert.equal(mine[0].name, 'تايتل برتقالي');
  const fields = P.templateFields(mine[0].path);
  assert.equal(fields.find(f => f.type === 'text').value, 'أهلا بيكم');
  const placed = await P.placeTemplate({ path: mine[0].path, values: [{ name: 'الكلام', type: 'text', value: 'إزيكم' }, { name: 'لون 1', type: 'color', value: '#22c55e' }, { name: 'سرعة الحركة %', type: 'slider', value: 150 }] });
  assert.equal(placed.params, 3);
  const clip = seq.v.flatMap(tr => tr.items).find(c => /تايتل برتقالي/.test(c.projectItem.mediaPath));
  const prop = n => clip.mgtComp.properties[clip.mgtComp.props.findIndex(p => p.displayName === n)];
  assert.match(prop('الكلام').getValue(), /إزيكم/);
  assert.deepEqual(prop('لون 1').getValue(), [255, 34, 197, 94]);
  assert.equal(prop('سرعة الحركة %').getValue(), 150);
  assert.equal(P.handoffList()[0].name, 'Title Card');
});

test('motion assistant: the AI turns a request into known steps only, they run in order through the host', async () => {
  const ae = loadAE(); const { c, txt } = scene(ae);
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, openrouter: 'sk-or' } });
  const { mockResponse } = require('../helpers');
  let asked = null;
  const fetchImpl = async (url, o) => { asked = JSON.parse(o.body); return mockResponse({ choices: [{ message: { content: JSON.stringify({ steps: [{ action: 'lowerThird', args: { name: 'أحمد', color: '#EA580C' }, why: 'اسم' }, { action: 'rm -rf', args: {} }, { action: 'textAnimate', args: { preset: 'typewriter', by: 'chars' }, why: 'كتابة' }, { action: 'cameraRig', args: { kind: 'push' } }], note: '' }) } }] }); };
  const { AEServices } = require('../../core/aeServices');
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))), fetchImpl });
  c.selectedLayers = [txt];
  const plan = await A.aiPlan('لوور ثيرد باسم أحمد والكلام يتكتب وكاميرا داخلة');
  assert.deepEqual(plan.steps.map(s => s.action), ['lowerThird', 'textAnimate', 'cameraRig'], 'unknown actions dropped');
  assert.match(asked.messages[0].content.map ? asked.messages[0].content.map(x => x.text || '').join('') : asked.messages[0].content, /lowerThird/);
  const r = await A.aiRun(plan.steps);
  assert.deepEqual(r.done, ['lowerThird', 'textAnimate', 'cameraRig']); assert.deepEqual(r.failed, []);
  assert.ok(c.layerList.some(L => L.name === 'LT Name') && c.layerList.some(L => L.name === 'EF Camera'));
});

test('AE engine is shared by every panel: our globals are EFM / EFMAPI / efm_call (no EF), and writing files needs AE\'s scripting permission', () => {
  assert.doesNotMatch(SRC, /\bEF\.|\bef_call\b|\bEFAPI\b|var EF\b/);
  const ae = loadAE(); scene(ae);
  assert.equal(ae.call('ping', {}).canWrite, true);
  ae.app.preferences.scriptsCanWrite = 0;
  assert.throws(() => ae.call('templateSave', { name: 'x', path: path.join(TMP, 'mgt', 'x.mogrt'), editable: { text: true } }), /Allow Scripts to Write Files/);
  assert.throws(() => ae.call('render', { path: path.join(TMP, 'r.mp4') }), /Allow Scripts to Write Files/);
  assert.equal(ae.call('selfTest', {}).canWrite, false);
});

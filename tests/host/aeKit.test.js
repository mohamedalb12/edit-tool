'use strict';
// عدة 2.1: عدّاد بكل الصيغ، إنفوجرافيك، سايل، ترانزيشنز، فيزيا، روتو، سطح، مقاسات، كلام مع الصوت، صوت ← فيديو،
// ستايلك، ريفرانس من لينك، توليد صور، معاينات — في محاكي الأفتر (+ exprSim للإكسبريشنز).
const { TMP, FFMPEG, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../core/config');
const aeScene = require('../../core/aeScene');
const kit = require('../../core/motionKit');
const physics = require('../../core/physics');
const kinetic = require('../../core/kinetic');
const X = require('./exprSim');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

const D = path.join(TMP, 'ae-kit'); fs.mkdirSync(D, { recursive: true });
function services(ae, { replies = [], keys = {} } = {}) {
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, ...keys } });
  const asked = [];
  const fetchImpl = async (url, o) => { asked.push({ url, body: o && o.body ? JSON.parse(o.body) : null }); const r = replies.shift(); return mockResponse({ choices: [{ message: { content: JSON.stringify(r) } }] }); };
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))), fetchImpl });
  return { A, asked };
}
const byName = (c, n) => c.layerList.find(L => L.name === n);
const fxp = (L, label) => L.property('ADBE Effect Parade').property(label);

test('counter formats: currencies (also Arabic), percent, K / M / B, time, sign, padding, separators, Arabic digits', () => {
  const f = kit.formatNumber;
  assert.equal(f(1234567.891, {}), '1,234,568');
  assert.equal(f(1234.5, { format: 'currency', currency: 'USD', decimals: 2 }), '$1,234.50');
  assert.equal(f(99.99, { format: 'currency', currency: 'EUR', decimals: 2, separator: '.', decimalMark: ',' }), '€99,99');
  assert.equal(f(1500, { format: 'currency', currency: 'EGP', arabic: true }), '١٬٥٠٠ ج.م');
  assert.equal(f(1500, { format: 'currency', currency: 'SAR' }), '1,500 SAR');
  assert.equal(f(42, { format: 'currency', symbol: 'ريال', symbolAfter: true }), '42 ريال');
  assert.equal(f(87.5, { format: 'percent', decimals: 1 }), '87.5%');
  assert.equal(f(87, { format: 'percent', arabic: true }), '٨٧٪');
  assert.equal(f(2500000, { format: 'compact' }), '2.5M');
  assert.equal(f(3000, { format: 'compact' }), '3K', 'trailing .0 trimmed');
  assert.equal(f(1540, { format: 'compact', unitsArabic: true }), '1.5 ألف');
  assert.equal(f(125, { format: 'time' }), '2:05');
  assert.equal(f(3725, { format: 'time' }), '1:02:05');
  assert.equal(f(42, { plus: true, suffix: ' عميل' }), '+42 عميل');
  assert.equal(f(5, { pad: 3 }), '005');
  assert.equal(f(1234567, { separator: ' ' }), '1 234 567');
  assert.equal(f(-7.25, { decimals: 2 }), '-7.25');
});

test('counter in AE: a "Count" slider keyed from → to, the text formatted live, ring / bar follow the count', () => {
  const ae = loadAE();
  const { spec, warnings } = aeScene.normalize({ comp: { duration: 5 }, layers: kit.counterLayers({ name: 'Sales', from: 0, to: 2000000, format: 'compact', style: 'ring', label: 'مبيعات', duration: 2, max: 2000000 }) }, {});
  assert.deepEqual(warnings, []);
  ae.call('buildScene', { spec: JSON.parse(JSON.stringify(spec)) });
  const c = ae.project.activeItem, L = byName(c, 'Sales');
  assert.deepEqual(fxp(L, 'Count').property(1).keys.map(k => [k.t, k.v]), [[0, 0], [2, 2000000]]);
  assert.match(L.property('ADBE Text Properties').property('ADBE Text Document').expression, /efFmt\(effect\("Count"\)/);
  const sim = X.make(spec);
  assert.equal(sim.value('Sales', 'text', 1), '1M');
  assert.equal(sim.value('Sales', 'text', 2), '2M');
  assert.equal(sim.value('Sales Ring', 'shape:trimEnd', 1), 50);
  assert.ok(byName(c, 'Sales Label') && byName(c, 'Sales Track'));
});

test('infographics: every chart type from a pasted table builds; bars grow from the base, values count up, donut slices add to 100%', () => {
  assert.deepEqual(kit.parseTable('مصر, 120\nالسعودية\t85\n2021 | 45 | حدث مهم\nبدون رقم').map(r => [r.label, r.value, r.note]), [['مصر', 120, undefined], ['السعودية', 85, undefined], ['2021', 45, 'حدث مهم'], ['بدون رقم', 0, undefined]]);
  assert.deepEqual(kit.parseTable('أ, ١٢٠').map(r => r.value), [120], 'Arabic digits');
  for (const type of Object.keys(kit.CHARTS)) {
    const raw = kit.chartScene({ type, data: 'A, 80\nB, 40\nC, 120', title: 'T', format: { format: 'compact' } });
    const { spec, warnings } = aeScene.normalize(raw, {});
    assert.deepEqual(warnings, [], type);
    const r = loadAE().call('buildScene', { spec: JSON.parse(JSON.stringify(spec)) });
    assert.deepEqual(r.skipped, [], type);
  }
  const col = aeScene.normalize(kit.chartScene({ type: 'column', data: 'A, 50\nB, 100' }), {}).spec;
  const bar = col.layers.find(l => l.name === 'Bar 2');
  assert.deepEqual(bar.keys.scale.map(k => k.v), [[100, 0], [100, 100]]);
  assert.ok(bar.shape.items[0].position[1] < 0, 'the rect sits above its base point');
  const donut = kit.chartScene({ type: 'donut', data: 'A, 1\nB, 3' });
  const ends = donut.layers.filter(l => /^Slice/.test(l.name)).map(l => l.keys['shape:trimEnd'][1][1]);
  assert.deepEqual(ends, [25, 100]);
  assert.throws(() => kit.chartScene({ data: '' }), /البيانات/);
});

test('liquid shapes: every preset builds; blobs morph in a loop (last key = first)', () => {
  for (const id of Object.keys(kit.LIQUID)) {
    const { spec, warnings } = aeScene.normalize({ comp: { duration: 6 }, layers: kit.liquidLayers({ preset: id }) }, {});
    assert.deepEqual(warnings, [], id);
    assert.deepEqual(loadAE().call('buildScene', { spec: JSON.parse(JSON.stringify(spec)) }).skipped, [], id);
  }
  const L = kit.liquidLayers({ preset: 'blob-calm' })[0];
  const k = L.keys['shape:path.1'];
  assert.deepEqual(k[0][1], k[k.length - 1][1]);
  assert.match(L.expressions['shape:path.1'], /loopOut/);
  assert.ok(Object.keys(kit.LIQUID).length >= 20);
});

test('transitions: one on every cut between the selected clips (adjustment moves / covering shapes), keys around the cut', async () => {
  const ae = loadAE(), { A } = services(ae);
  const c = ae.newComp('Edit', { duration: 9 }); ae.project._active = c;
  const clips = [0, 3, 6].map((t, i) => { const L = c.layers.addSolid([i / 3, 0.2, 0.3], 'Clip ' + (i + 1), 1920, 1080); L.inPoint = t; L.outPoint = t + 3; return L; });
  c.selectedLayers = clips.slice();
  const r = await A.transitionApply({ kind: 'whipLeft', duration: 0.6 });
  assert.equal(r.cuts, 2);
  const adj = c.layerList.filter(L => /^EF whipLeft/.test(L.name));
  assert.equal(adj.length, 2);
  assert.ok(Math.abs(adj[0].inPoint - 5.7) < 1e-6 || Math.abs(adj[0].inPoint - 2.7) < 1e-6);
  const tf = adj[0].property('ADBE Effect Parade').property('EF Transform');
  assert.equal(tf.property('Position').keys.length, 4);
  assert.equal(tf.property("Use Composition's Shutter Angle").value, 0);
  for (const kind of Object.keys(kit.TRANSITIONS)) { const rr = await A.transitionApply({ kind }); assert.equal(rr.cuts, 2, kind); assert.deepEqual(rr.skipped, [], kind); }
});

test('physics: bodies fall to the floor and stop; boxes settle flat; collisions keep them apart; keys baked on the layers', async () => {
  const sim = physics.simulate([{ name: 'A', x: 500, y: 300, w: 200, h: 200, round: true }, { name: 'B', x: 560, y: 0, w: 200, h: 200, round: true }], { mode: 'fall', duration: 4 });
  const a = sim.tracks.A[sim.frames - 1], b = sim.tracks.B[sim.frames - 1];
  assert.ok(Math.abs(a.y - 980) < 2 || Math.abs(b.y - 980) < 2, 'on the floor');
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 199, 'not inside each other');
  const box = physics.simulate([{ name: 'K', x: 900, y: 200, w: 300, h: 100, rot: 20 }], { mode: 'fall', duration: 5 }).tracks.K;
  assert.ok(Math.abs(((box[box.length - 1].rot % 90) + 90) % 90) < 2 || Math.abs(((box[box.length - 1].rot % 90) + 90) % 90 - 90) < 2, 'lands flat: ' + box[box.length - 1].rot);
  const ae = loadAE(), { A } = services(ae);
  const c = ae.newComp('P', { duration: 6, fps: 25 }); ae.project._active = c;
  const L = c.layers.addShape(); L.name = 'Ball'; L._rect = { left: -50, top: -50, width: 100, height: 100 };
  c.selectedLayers = [L];
  const r = await A.physics({ mode: 'drop', duration: 3 });
  assert.equal(r.bodies, 1);
  const pos = L.property('ADBE Transform Group').property('ADBE Position').keys;
  assert.equal(pos.length, 75);
  assert.ok(pos[0].v[1] < 0, 'starts above the frame'); assert.ok(Math.abs(pos[74].v[1] - 1030) < 2, 'ends on the floor: ' + pos[74].v[1]);
});

test('kinetic typography: phrases, Arabic right-to-left, each word appears when it is said; services put the voice under it', async () => {
  const words = [['أهلا', 0, 0.4], ['بيكم', 0.45, 0.8], ['النهارده', 2, 2.4], ['هنتكلم', 2.45, 2.8]].map(([text, start, end]) => ({ text, start, end }));
  assert.equal(kinetic.phrases(words).length, 2);
  const L = kinetic.layers(words, { style: 'highlight' });
  assert.ok(L[0].transform.position[0] > L[1].transform.position[0], 'first Arabic word on the right');
  assert.deepEqual(L[1].keys['fx:fill.color'].map(k => k[0]), [0.44, 0.45, 0.8]);
  const ae = loadAE(), { A } = services(ae);
  A.transcribeAudio = async () => ({ words });
  const audio = path.join(D, 'v.wav'); fs.writeFileSync(audio, 'x');
  const r = await A.kinetic({ audio, style: 'pop' });
  const c = ae.project.activeItem;
  assert.equal(r.words, 4);
  const w2 = byName(c, 'W1-1-2');
  assert.equal(w2.property('ADBE Transform Group').property('ADBE Scale').keys[0].t, 0.45);
  assert.ok(byName(c, 'Voice'));
});

test('voice → animation: scenes timed to the transcript from the AI, captions and the voice added', async () => {
  const ae = loadAE();
  const { A, asked } = services(ae, { keys: { openrouter: 'sk' }, replies: [{ say: 'تمام', scene: { comp: { name: 'Ad' }, layers: [{ type: 'counter', name: 'Price', to: 99, format: 'currency', currency: 'USD', start: 1, end: 3 }, { type: 'shape', name: 'Icon', start: 0, end: 1, shape: { kind: 'star' } }] } }] });
  A.transcribeAudio = async () => ({ words: [{ text: 'عرض', start: 0, end: 0.5 }, { text: 'النهارده', start: 0.55, end: 1 }, { text: 'بـ99', start: 1.6, end: 2.2 }, { text: 'دولار', start: 2.25, end: 2.8 }] });
  const audio = path.join(D, 'ad.wav'); fs.writeFileSync(audio, 'x');
  const r = await A.voiceAd({ audio, brief: 'مطعم' });
  const prompt = asked[0].body.messages[asked[0].body.messages.length - 1].content;
  assert.match(prompt, /\[0\.00–1\.00\] عرض النهارده/); assert.match(prompt, /مطعم/);
  const c = ae.project.activeItem;
  assert.ok(byName(c, 'Price') && byName(c, 'Voice') && c.layerList.some(L => /^W1-/.test(L.name)));
  assert.ok(c.duration >= 2.8); assert.equal(r.sentences, 2);
});

test('style favourites: a liked scene is saved with a summary and sent to the director as your style', async () => {
  const ae = loadAE();
  const { A, asked } = services(ae, { keys: { openrouter: 'sk' }, replies: [
    { action: 'build', say: 'ok', scene: { comp: { bg: '#0b0806' }, layers: [{ type: 'text', name: 'T', text: 'Hi', color: '#f97316', font: 'Cairo-Black', keys: { scale: [[0, 0, 'backOut'], [1, 100]] }, effects: [{ name: 'glow' }] }] } },
    { action: 'build', say: 'ok', scene: { layers: [{ type: 'solid', name: 'S' }] } }] });
  await A.director({ message: 'عنوان برتقالي بجلو', review: false });
  const f = A.favSave({});
  assert.ok(f.id);
  const list = A.favList();
  assert.equal(list[0].prompt, 'عنوان برتقالي بجلو');
  assert.match(list[0].summary, /#f97316/); assert.match(list[0].summary, /Cairo-Black/); assert.match(list[0].summary, /backOut/); assert.match(list[0].summary, /glow/);
  await A.director({ message: 'مشهد تاني', review: false });
  const sys = asked[1].body.messages[0].content; const text = Array.isArray(sys) ? sys.map(x => x.text || '').join('') : sys;
  assert.match(text, /ستايل المستخدم/); assert.match(text, /عنوان برتقالي بجلو/);
  await A.favUse(f.id); assert.ok(byName(ae.project.activeItem, 'T'));
  A.favRemove(f.id); assert.equal(A.favList().length, 0);
});

test('reference from a link: frames read straight from the stream yt-dlp gives (nothing downloaded)', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  const vid = path.join(D, 'stream.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180:d=3:r=25', '-pix_fmt', 'yuv420p', vid]);
  const Y = require('../../core/ytdlp'), keep = Y.streamUrl;
  let askedUrl = null;
  Y.streamUrl = async (bin, url) => { askedUrl = url; return vid; };
  try {
    const { A, asked } = services(ae, { keys: { openrouter: 'sk' }, replies: [{ action: 'build', say: 'زيه', scene: { layers: [{ type: 'solid', name: 'BG' }] } }] });
    A.ytdlpBin = () => '/usr/bin/yt-dlp';
    await A.director({ message: 'زي ده', refs: ['https://www.youtube.com/watch?v=abc'], review: false });
    assert.equal(askedUrl, 'https://www.youtube.com/watch?v=abc');
    const user = asked[0].body.messages[asked[0].body.messages.length - 1].content;
    assert.ok(user.filter(p => p.type === 'image_url').length >= 4);
    assert.match(user[0].text, /youtube\.com/);
  } finally { Y.streamUrl = keep; }
});

test('AI generate (fal.ai): image → downloaded → in the comp; background removal; roto: per-frame mattes → luma matte under a copy of the footage', { skip: !FFMPEG }, async () => {
  const ae = loadAE(), { A } = services(ae, { keys: { fal: 'fk' } });
  const png = path.join(D, 'gen.png'); execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=64x36', '-frames:v', '1', png]);
  const calls = [];
  A.falRun = async (model, input) => { calls.push(model); return model === 'fal-ai/birefnet' ? { image: { url: 'https://x/cut.png' }, mask_image: { url: 'https://x/mask.png' } } : { images: [{ url: 'https://x/img.png' }] }; };
  A.download = async (url, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(png, file); return file; };
  const r = await A.genMedia({ prompt: 'orange abstract', removeBg: true });
  assert.deepEqual(calls, ['fal-ai/flux/schnell', 'fal-ai/birefnet']);
  assert.match(r.file, /cutout\.png$/); assert.ok(ae.project.activeItem.layerList.some(L => /^AI Image/.test(L.name)));
  // roto
  const vid = path.join(D, 'person.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180:d=1:r=10', '-pix_fmt', 'yuv420p', vid]);
  const c = ae.newComp('Shot', { width: 1920, height: 1080, fps: 10, duration: 1 }); ae.project._active = c;
  const L = c.layers.add(ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(vid)))); L.name = 'Person';
  c.selectedLayers = [L];
  const ro = await A.roto({ seconds: 1 });
  assert.equal(ro.frames, 10);
  assert.ok(fs.existsSync(ro.file));
  const cut = byName(c, 'Person (EF Cutout)'), M = byName(c, 'Person (EF Matte)');
  assert.ok(cut && M); assert.equal(cut.trackMatteLayer, M); assert.equal(cut.trackMatteType, ae.ctx.TrackMatteType.LUMA);
  assert.ok(cut.index < L.index, 'the cut-out is above the original');
  await assert.rejects(services(loadAE()).A.roto({}), /fal|اختار/);
});

test('green screen, camera tracker, surface placement, every size rendered in one go, previews rendered off-screen', async () => {
  const ae = loadAE(), { A } = services(ae);
  const c = ae.newComp('Shot', { duration: 4 }); ae.project._active = c;
  const L = c.layers.add(ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(path.join(D, 'x.mp4'))))); L.name = 'Clip';
  c.selectedLayers = [L];
  assert.deepEqual(await A.roto({ mode: 'green' }), { keyed: 'Clip' });
  assert.ok(fxp(L, 'Keylight 906'));
  const t = await A.trackCamera(); assert.equal(t.layer, 'Clip');
  ae.project.file = new ae.File(path.join(D, 'p.aep'));
  c.selectedLayers = [];
  const m = await A.multiFormat({ sizes: ['16:9', '9:16', '1:1'], fit: 'blur' });
  assert.deepEqual(m.comps.map(x => x.size), ['16:9', '9:16', '1:1']);
  assert.ok(m.comps.every(x => fs.existsSync(x.path)));
  const v = ae.project._items ? null : null; void v;
  const vertical = ae.project.item ? null : null; void vertical;
  // previews: frames saved, the temporary comp is gone
  const before = ae.project.numItems;
  const pv = await A.previewMake({ kind: 'liquid', ids: ['blob-calm', 'wave-line'] });
  assert.equal(pv.made, 2);
  assert.equal(A.previewList('liquid', 'blob-calm').length, 8);
  assert.equal(ae.project.numItems, before, 'nothing left in the project');
  assert.equal((await A.previewMake({ kind: 'liquid', ids: ['blob-calm'] })).made, 0, 'cached');
  for (const kind of ['scene', 'chart', 'counter', 'transition']) assert.doesNotThrow(() => aeScene.normalize(A.previewSpec(kind, { scene: 'kinetic-title', chart: 'pie', counter: 'ring', transition: 'glitch' }[kind]), {}), kind);
});

test('place on a surface: 4 tracked corners → Corner Pin on a precomp holding the picture / text', { skip: !FFMPEG }, async () => {
  const ae = loadAE(), { A } = services(ae);
  const patch = path.join(D, 'patch.png'), vid = path.join(D, 'wall.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=200x140', '-frames:v', '1', patch]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:d=1:r=25', '-loop', '1', '-t', '1', '-i', patch, '-filter_complex', "[0][1]overlay=x='300+t*100':y=200", '-pix_fmt', 'yuv420p', vid]);
  const c = ae.newComp('Shot', { width: 1280, height: 720, fps: 25, duration: 1 }); ae.project._active = c;
  const L = c.layers.add(ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(vid))));
  L.property('ADBE Transform Group').property('ADBE Anchor Point').value = [640, 360]; L.property('ADBE Transform Group').property('ADBE Position').value = [640, 360];
  c.selectedLayers = [L];
  const corners = [[320, 220], [480, 220], [320, 320], [480, 320]].map(p => [p[0] / 1280, p[1] / 720]);
  const r = await A.surfacePlace({ points: corners, text: 'SALE' });
  const S = byName(c, r.pinned);
  assert.ok(S && S.source && S.source.layerList.some(x => x.name === 'Content'));
  const pin = fxp(S, 'ADBE Corner Pin'), tl = pin.property('ADBE Corner Pin-0001').keys;
  assert.equal(tl.length, 25);
  // the top-left corner, in the precomp's own space, follows the patch to the right (100 px/s)
  assert.ok(Math.abs((tl[24].v[0] - tl[0].v[0]) - 96) < 3, 'moved ' + (tl[24].v[0] - tl[0].v[0]));
  await assert.rejects(A.surfacePlace({ points: corners.slice(0, 2), text: 'x' }), /4 نقط/);
});

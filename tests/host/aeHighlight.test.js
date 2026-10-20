'use strict';
// إبراز مبنى (عقارات) + تفريغ Groq.
const { TMP, FFMPEG, makeAudio, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../core/config');
const highlight = require('../../core/highlight');
const groq = require('../../core/groq');
const transcribe = require('../../core/transcribe');
const { encodePng } = require('../../core/util');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

const D = path.join(TMP, 'ae-hl'); fs.mkdirSync(D, { recursive: true });
const byName = (c, n) => c.layerList.find(L => L.name === n);

test('perspective fit: exact for a true homography; a corner that slid off is ignored (RANSAC); 3 points = affine', () => {
  const T = [1.2, 0.1, 30, -0.05, 0.9, 10, 0.0004, 0.0002, 1], ap = p => highlight.apply(T, p);
  const src = [[100, 100], [400, 120], [420, 380], [90, 360], [250, 90], [260, 390]];
  const H = highlight.homography(src, src.map(ap));
  for (const p of src) { const a = highlight.apply(H, p), b = ap(p); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6); }
  const tracks = src.map((p, i) => Array.from({ length: 5 }, (_, f) => { let q = [p[0] + f * 10, p[1] + f * 5]; if (i === 2 && f > 2) q = [q[0] + 80, q[1] - 60]; return { x: q[0], y: q[1], err: 5 }; }));
  const out = highlight.fitOutline(tracks, { smooth: 0 });
  assert.deepEqual(out[4][2], [460, 400]);
  const A = highlight.homography([[0, 0], [10, 0], [0, 10]], [[5, 5], [25, 5], [5, 15]]);
  assert.deepEqual(highlight.apply(A, [10, 10]).map(v => Math.round(v * 1e6) / 1e6), [25, 15]);
});

test('AI mask reader: plain black / white masks (either polarity), alpha cut-outs, or the picture with the object coloured', () => {
  const w = 10, h = 10, px = (fn) => { const b = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { const c = fn(i % w, Math.floor(i / w)); b.set(c, i * 4); } return b; };
  const inside = (x, y) => x >= 3 && x <= 6 && y >= 3 && y <= 6;
  const orig = px(() => [120, 110, 100, 255]);
  const count = m => m.reduce((s, v) => s + (v ? 1 : 0), 0);
  assert.equal(count(highlight.maskFrom(px((x, y) => inside(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 255]), orig, w, h, [4, 4])), 16);
  assert.equal(count(highlight.maskFrom(px((x, y) => inside(x, y) ? [0, 0, 0, 255] : [255, 255, 255, 255]), orig, w, h, [4, 4])), 16, 'inverted polarity: the clicked side wins');
  assert.equal(count(highlight.maskFrom(px((x, y) => inside(x, y) ? [9, 9, 9, 255] : [0, 0, 0, 0]), orig, w, h, [4, 4])), 16, 'alpha');
  assert.equal(count(highlight.maskFrom(px((x, y) => inside(x, y) ? [30, 144, 255, 255] : [120, 110, 100, 255]), orig, w, h, [4, 4])), 16, 'coloured overlay');
  assert.deepEqual(highlight.maskBox(Buffer.from(Array.from({ length: 100 }, (_, i) => inside(i % 10, Math.floor(i / 10)) ? 255 : 0)), 10, 10, 0), { x_min: 3, y_min: 3, x_max: 6, y_max: 6 });
});

function shot(ae, name) {
  const patch = path.join(D, 'facade.png'), vid = path.join(D, name + '.mp4');
  if (!fs.existsSync(patch)) execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=240x160', '-frames:v', '1', patch]);
  if (!fs.existsSync(vid)) execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:d=1.2:r=25', '-loop', '1', '-t', '1.2', '-i', patch, '-filter_complex', "[0][1]overlay=x='400+t*100':y=260", '-pix_fmt', 'yuv420p', vid]);
  const c = ae.newComp('Drone', { width: 1280, height: 720, fps: 25, duration: 1.2 }); ae.project._active = c;
  const L = c.layers.add(ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(vid)))); L.name = 'Drone';
  const t = L.property('ADBE Transform Group'); t.property('ADBE Anchor Point').value = [640, 360]; t.property('ADBE Position').value = [640, 360];
  c.selectedLayers = [L];
  return { c, L };
}

test('highlight by hand: the clicked outline is tracked with perspective → a masked copy of the footage on top, the rest tinted by sliders, outline + pin + card', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  config.save({ ...config.DEFAULTS });
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) });
  const { c, L } = shot(ae, 'manual');
  const corners = [[420, 280], [620, 280], [620, 400], [420, 400]].map(p => [p[0] / 1280, p[1] / 720]);
  await assert.rejects(A.highlight({ points: corners.slice(0, 2) }), /3 نقط/);
  await assert.rejects(A.highlight({ points: corners, mode: 'ai' }), /fal/);
  const r = await A.highlight({ points: corners, preset: 'blue-rest', label: { title: 'برج النيل', price: 2500000, currency: 'EGP', area: 180 } });
  assert.equal(r.mode, 'manual'); assert.deepEqual(r.skipped, []); assert.deepEqual(r.warnings, []);
  const B = byName(c, 'EF Highlight 1 Building'), R = byName(c, 'EF Highlight 1 Rest'), Cn = byName(c, 'EF Highlight 1 Controls');
  assert.ok(B && R && Cn);
  assert.ok(B.index < R.index && R.index < L.index, 'building above the tint, tint above the footage');
  assert.ok(R.adjustmentLayer);
  // the tint follows the sliders
  const tint = R.property('ADBE Effect Parade').property('ADBE Tint');
  assert.match(tint.property('ADBE Tint-0003').expression, /Rest Opacity/); assert.match(tint.property('ADBE Tint-0002').expression, /Rest Color/);
  assert.equal(Cn.property('ADBE Effect Parade').property('Rest Opacity').property(1).value, 70);
  assert.equal(Cn.property('ADBE Effect Parade').property('Building Opacity').property(1).value, 0, 'the building stays natural');
  // the mask moves with the facade (100 px/s to the right)
  const ms = B.property('ADBE Mask Parade').property(1).property('ADBE Mask Shape').keys;
  assert.equal(ms.length, 30);
  const dx = ms[25].v.vertices[0][0] - ms[0].v.vertices[0][0];
  assert.ok(Math.abs(dx - 100) < 4, 'moved ' + dx);
  assert.match(B.property('ADBE Mask Parade').property(1).property('ADBE Mask Feather').expression, /Feather/);
  // outline + pin + card
  const O = byName(c, 'EF Highlight 1 Outline');
  assert.equal(O.property('ADBE Root Vectors Group').children[0].property('ADBE Vectors Group').children.find(x => x.matchName === 'ADBE Vector Shape - Group').property('ADBE Vector Shape').keys.length, 30);
  assert.equal(byName(c, 'EF Highlight 1 Info 1').property('ADBE Text Properties').property('ADBE Text Document').value.text, 'برج النيل');
  assert.equal(byName(c, 'EF Highlight 1 Info 2').property('ADBE Text Properties').property('ADBE Text Document').value.text, '2,500,000 EGP');
  assert.equal(byName(c, 'EF Highlight 1 Info 1').parent, byName(c, 'EF Highlight 1 Pin'));
  // a second highlight gets its own name
  c.selectedLayers = [L];
  const r2 = await A.highlight({ points: corners, preset: 'color-building', outline: false });
  assert.equal(r2.name, 'EF Highlight 2');
  assert.equal(byName(c, 'EF Highlight 2 Controls').property('ADBE Effect Parade').property('Building Opacity').property(1).value, 55);
});

test('highlight with AI: the click is tracked and steers SAM2 on each frame; masks → a luma matte for the building copy', { skip: !FFMPEG }, async () => {
  const ae = loadAE();
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, fal: 'fk' } });
  const A = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) });
  const { c } = shot(ae, 'ai');
  const asked = [];
  A.falRun = async (model, input) => {
    asked.push({ model, input });
    // a white box around the clicked point, black elsewhere
    const W = 1024, H = 576, b = Buffer.alloc(W * H * 4), p = input.prompts[0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const on = Math.abs(x - p.x) < 80 && Math.abs(y - p.y) < 50, i = (y * W + x) * 4; b[i] = b[i + 1] = b[i + 2] = on ? 255 : 0; b[i + 3] = 255; }
    return { image: { url: 'data:image/png;base64,' + encodePng(W, H, b).toString('base64') } };
  };
  const r = await A.highlight({ points: [[520 / 1280, 340 / 720]], mode: 'ai', preset: 'bw-rest' });
  assert.equal(r.mode, 'ai');
  assert.equal(asked[0].model, 'fal-ai/sam2/image');
  assert.equal(asked[0].input.box_prompts.length, 0); assert.equal(asked[1].input.box_prompts.length, 1, 'next frames also get the last box');
  assert.ok(asked[asked.length - 1].input.prompts[0].x > asked[0].input.prompts[0].x + 40, 'the click moved with the building');
  const B = byName(c, 'EF Highlight 1 Building'), M = byName(c, 'EF Highlight 1 Matte');
  assert.equal(B.trackMatteLayer, M); assert.equal(B.trackMatteType, ae.ctx.TrackMatteType.LUMA);
  assert.ok(fs.existsSync(M.source.file.fsName));
  assert.equal(byName(c, 'EF Highlight 1 Controls').property('ADBE Effect Parade').property('Rest Opacity').property(1).value, 100);
});

test('Groq: a multipart request with word timestamps, the dialect prompt and language; long audio in chunks with the right offsets', { skip: !FFMPEG }, async () => {
  const wav = makeAudio('groq.wav', [{ tone: 300, dur: 1.5 }]);
  const sent = [];
  const fetchImpl = async (url, o) => {
    sent.push({ url, o, body: o.body.toString('latin1') });
    return mockResponse({ text: 'أهلا بيكم', words: [{ word: 'أهلا', start: 0.1, end: 0.5 }, { word: 'بيكم', start: 0.55, end: 1 }] });
  };
  const words = await groq.transcribe({ ffmpeg: FFMPEG, file: wav, start: 0, key: 'gsk_x', fetchImpl, language: 'ar', prompt: 'مصري' });
  assert.equal(sent[0].url, groq.URL); assert.equal(sent[0].o.headers.Authorization, 'Bearer gsk_x');
  assert.match(sent[0].o.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  for (const f of ['name="model"', 'whisper-large-v3', 'name="timestamp_granularities[]"', 'word', 'name="language"', 'name="file"; filename="c_000.flac"', 'audio/flac']) assert.ok(sent[0].body.includes(f), f);
  assert.deepEqual(words.map(w => [w.text, w.start, w.end]), [['أهلا', 0.1, 0.5], ['بيكم', 0.55, 1]]);
  assert.deepEqual(groq.wordsFrom({ segments: [{ start: 2, end: 3, text: 'a b' }] }, 600).map(w => [w.text, w.start, w.end]), [['a', 602, 602.5], ['b', 602.5, 603]]);
  const bad = async () => mockResponse({ error: 'x' }, { status: 401 });
  await assert.rejects(groq.transcribe({ ffmpeg: FFMPEG, file: wav, key: 'gsk_x', fetchImpl: bad }), /مفتاح Groq غلط/);
  await assert.rejects(groq.transcribe({ ffmpeg: FFMPEG, file: wav, key: '', fetchImpl }), /Groq/);
});

test('transcribe() picks Groq when there is a key (no whisper.cpp needed), keeps the cache per engine, shifts to source time', { skip: !FFMPEG }, async () => {
  assert.equal(transcribe.engineOf({ engine: 'auto', groqKey: 'gsk' }), 'groq');
  assert.equal(transcribe.engineOf({ engine: 'auto' }), 'local');
  assert.equal(transcribe.engineOf({ engine: 'local', groqKey: 'gsk' }), 'local');
  const wav = makeAudio('groq2.wav', [{ tone: 300, dur: 3 }]);
  let calls = 0;
  const fetchImpl = async () => { calls++; return mockResponse({ words: [{ word: 'تجربة', start: 0.2, end: 0.7 }] }); };
  const cacheDir = path.join(D, 'cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const r = await transcribe.transcribe({ ffmpeg: FFMPEG, whisper: null, model: null, file: wav, start: 1, duration: 2, cacheDir, groqKey: 'gsk_x', fetchImpl });
  assert.equal(r.engine, 'groq');
  assert.deepEqual(r.words.map(w => [w.text, w.start]), [['تجربة', 1.2]]);
  await transcribe.transcribe({ ffmpeg: FFMPEG, file: wav, start: 1, duration: 2, cacheDir, groqKey: 'gsk_x', fetchImpl });
  assert.equal(calls, 1, 'cached');
  await assert.rejects(transcribe.transcribe({ ffmpeg: FFMPEG, file: wav, cacheDir }), /whisper|Groq/);
});

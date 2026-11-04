'use strict';
// أدوات ذكية (After Effects): voice / music apart, a face track, relight, slow motion, beat cuts — on the strict
// simulator, with fal.ai answered by a stand-in that returns real audio files.
const { TMP, FFMPEG, makeClicks, makeAudio, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const config = require('../../core/config');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');
const stems = require('../../core/stems');
const faceTrack = require('../../core/faceTrack');

function world(opts = {}) {
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, fal: opts.fal === undefined ? 'fal-key' : opts.fal } });
  const ae = loadAE(); const c = ae.newComp('Main', { duration: 10 }); ae.project._active = c;
  const svc = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))), fetchImpl: opts.fetch, analyzeFaces: opts.faces });
  return { ae, c, svc };
}
const footage = (ae, c, file, name) => { const it = ae.project.importFile(new ae.ctx.ImportOptions(new ae.File(file))); const L = c.layers.add(it); L.name = name; return L; };

test('voice / music apart: Demucs stems on fal → a voice layer and a music layer above, the footage\'s own audio off', async () => {
  const voice = makeAudio('stem-voice.wav', [{ tone: 220, dur: 1.5, amp: 0.4 }]), drums = makeClicks('stem-drums.wav', 120, 1.5), song = makeAudio('stem-song.wav', [{ tone: 330, dur: 1.5 }]);
  const calls = [];
  const fetch = async (url, o) => {
    calls.push(url);
    if (/fal\.run\/fal-ai\/demucs/.test(url)) { assert.match(JSON.parse(o.body).audio_url, /^data:audio\/mpeg;base64,/); return mockResponse({ vocals: { url: 'https://cdn/v.wav' }, drums: { url: 'https://cdn/d.wav' }, other: { url: 'https://cdn/o.wav' } }); }
    return mockResponse(fs.readFileSync({ 'https://cdn/v.wav': voice, 'https://cdn/d.wav': drums, 'https://cdn/o.wav': song }[url]), { binary: true });
  };
  const { ae, c, svc } = world({ fetch });
  const L = footage(ae, c, song, 'Clip'); L.outPoint = 1.5; c.selectedLayers = [L];
  const steps = [];
  const r = await svc.separateAudio({ onStep: m => steps.push(m) });
  assert.deepEqual(r.layers, ['Clip (EF Voice)', 'Clip (EF Music)']);
  assert.equal(L.audioEnabled, false, 'the original audio is off, not deleted');
  assert.equal(c.layerList[0].name, 'Clip (EF Voice)');
  assert.ok(calls.filter(u => /demucs/.test(u)).length === 1 && calls.length === 4, 'one separation, three downloads');
  assert.ok(steps.length >= 2);
  assert.equal(stems.estimate(600), 0.42, '10 minutes ≈ $0.42 at fal\'s listed price');
  const { svc: noKey } = world({ fal: '' });
  await assert.rejects(noKey.separateAudio(), /مفتاح fal/);
});

test('face path: follows one face through a second face walking by and frames where it is lost; smooth', () => {
  const samples = Array.from({ length: 30 }, (_, i) => {
    const me = { cx: 0.3 + i * 0.01, cy: 0.4, w: 0.12, h: 0.16, score: 0.9 }, other = { cx: 0.8 - i * 0.012, cy: 0.42, w: 0.09, h: 0.12, score: 0.9 };
    return { t: i / 10, faces: i >= 12 && i <= 15 ? [other] : i % 7 === 3 ? [] : [me, other] };
  });
  const p = faceTrack.path(samples);
  assert.equal(p.length, 30);
  assert.ok(p.every((q, i) => Math.abs(q.cx - (0.3 + i * 0.01)) < 0.02), 'stays on the first (biggest) face: ' + p.map(q => q.cx.toFixed(2)).join(' '));
  assert.equal(p[13].seen, false, 'while only the other face is there, the path is filled in, not jumped');
  const other = faceTrack.path(samples, { pick: [0.8, 0.42] });
  assert.ok(other[0].cx > 0.7, 'a click picks the other face');
  assert.deepEqual(faceTrack.path([{ t: 0, faces: [] }]), []);
});

test('face track in AE: a null that follows and scales with the face, the selected text rides on it', async () => {
  const clip = path.join(TMP, 'face.mp4'); if (!fs.existsSync(clip)) fs.writeFileSync(clip, 'x');
  const faces = async job => Array.from({ length: Math.round(job.duration * job.fps) }, (_, i) => ({ t: i / job.fps, faces: [{ cx: 0.5 + i * 0.005, cy: 0.4, w: 0.1 * (1 + i * 0.01), h: 0.14, score: 0.9 }] }));
  const { ae, c, svc } = world({ faces });
  const V = footage(ae, c, clip, 'Interview'), T = c.layers.addText('محمد أيمن'); T.name = 'Name';
  c.selectedLayers = [V, T];
  const r = await svc.faceTrack({ seconds: 2 });
  assert.ok(r.frames >= 19, 'frames ' + r.frames);
  const N = c.layerList.find(L => L.name === 'EF Face');
  assert.ok(N, 'the face null');
  const pos = N.property('ADBE Transform Group').property('ADBE Position'), sc = N.property('ADBE Transform Group').property('ADBE Scale');
  assert.ok(pos.keys.length >= 19 && pos.keys[pos.keys.length - 1].v[0] > pos.keys[0].v[0], 'moves right with the face');
  assert.ok(sc.keys[sc.keys.length - 1].v[0] > 100, 'grows as the face comes closer');
  assert.equal(T.parent && T.parent.name, 'EF Face', 'the text rides on it');
});

test('relight: exposure + coloured glow in a soft ellipse, all on sliders, following the face null', async () => {
  const { ae, c, svc } = world();
  const F = c.layers.addNull(10); F.name = 'EF Face';
  const r = await svc.relight({ intensity: 1.2, color: '#ffcc88' });
  assert.equal(r.follows, 'EF Face');
  const ctl = c.layerList.find(L => L.name === 'EF Light 1 Controls'), P = c.layerList.find(L => L.name === 'EF Light 1');
  assert.equal(P.parent, F, 'the light follows the face');
  const fx = n => ctl.property('ADBE Effect Parade').property(n).property(1).value;
  assert.equal(fx('Intensity'), 1.2); assert.ok(fx('Size') > 100);
  const A = c.layerList.find(L => L.name === 'EF Light 1 Exposure'), G = c.layerList.find(L => L.name === 'EF Light 1 Glow');
  assert.ok(A.adjustmentLayer && A.parent === P && G.parent === P);
  assert.match(A.property('ADBE Mask Parade').property(1).property('ADBE Mask Shape').expression, /createPath/);
  assert.match(A.property('ADBE Effect Parade').property(1).property(1).expression, /EF Light 1 Controls.*Intensity/);
  assert.match(G.property('ADBE Transform Group').property('ADBE Opacity').expression, /Glow/);
});

test('slow motion: time remap stretched by 100/speed, Pixel Motion blending, motion blur; still layers just get blur', async () => {
  const { ae, c, svc } = world();
  const clip = path.join(TMP, 'slow.mp4'); if (!fs.existsSync(clip)) fs.writeFileSync(clip, 'x');
  const V = footage(ae, c, clip, 'Shot'); V.inPoint = 1; V.outPoint = 3;
  const T = c.layers.addText('x');
  c.selectedLayers = [V, T];
  const r = await svc.slowMotion({ speed: 50 });
  assert.equal(r.remapped, 1);
  assert.equal(V.outPoint, 5, '2 s at 50% = 4 s');
  const tr = V.property('ADBE Time Remapping');
  assert.deepEqual(tr.keys.map(k => [k.t, k.v]), [[1, 1], [5, 3]], 'the same 2 s of source spread over 4 s');
  assert.equal(V.frameBlendingType, 4014, 'Pixel Motion'); assert.equal(c.frameBlending, true);
  assert.equal(T.motionBlur, true); assert.equal(c.motionBlur, true);
});

test('beat cut: markers on every beat of the music, the selected layers laid one per 2 beats', async () => {
  const music = makeClicks('beat-120.wav', 120, 8);
  const { ae, c, svc } = world();
  const M = footage(ae, c, music, 'Song'); M.outPoint = 8;
  const shots = ['A', 'B', 'C'].map(n => { const L = c.layers.addSolid([0.2, 0.3, 0.4], n, 100, 100); L.inPoint = 0; L.outPoint = 10; return L; });
  c.selectedLayers = [M].concat(shots);
  const r = await svc.beatCut({ every: 2, cut: true });
  assert.ok(Math.abs(r.bpm - 120) <= 3, 'bpm ' + r.bpm);
  assert.ok(r.markers >= 12, 'markers ' + r.markers);
  const ks = c.markerProperty.keys.map(k => k.t);
  assert.ok(ks.slice(1).every((t, i) => Math.abs(t - ks[i] - 0.5) < 0.06), 'a marker every 0.5 s');
  const laid = shots.slice().sort((a, b) => a.inPoint - b.inPoint);
  assert.ok(laid.every(L => Math.abs((L.outPoint - L.inPoint) - 1) < 0.08), 'each layer = 2 beats = 1 s: ' + laid.map(L => (L.outPoint - L.inPoint).toFixed(2)));
  assert.ok(laid.slice(1).every((L, i) => Math.abs(L.inPoint - laid[i].outPoint) < 0.01), 'back to back on the beats');
});

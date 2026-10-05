'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const acorn = require('acorn');
const { loadHost } = require('./mockPremiere');

const SRC = fs.readFileSync(require('path').join(__dirname, '..', '..', 'host', 'host.jsx'), 'utf8');

function setup({ withBroll = true } = {}) {
  const h = loadHost();
  const seq = h.pr.newSequence('Main', { fps: 25 });
  const media = h.pr.project.importOne('/media/talk.mp4', h.pr.project.root);
  seq.v[0].add({ projectItem: media, start: 0, end: 10, inPoint: 2 });
  seq.a[0].add({ projectItem: media, start: 0, end: 10, inPoint: 2 });
  if (withBroll) seq.v[1].add({ projectItem: h.pr.project.importOne('/media/broll.mp4', h.pr.project.root), start: 6, end: 8, inPoint: 0 });
  return { ...h, seq, media };
}
const spans = tr => tr.items.slice().sort((a, b) => a._start - b._start).map(c => [+c._start.toFixed(3), +c._end.toFixed(3), +c._in.toFixed(3)]);

test('host.jsx is valid ES3 (ExtendScript) — no let/const/arrows/JSON', () => {
  acorn.parse(SRC, { ecmaVersion: 3 });
  assert.ok(!/\bJSON\./.test(SRC.replace(/EF\.json/g, '')), 'uses native JSON');
  assert.ok(!/\.(forEach|map|filter|indexOf)\(/.test(SRC.replace(/\.name\.indexOf\(|v\.indexOf\(/g, '')), 'array ES5 methods');
});

test('errors come back as {ok:false} with a readable message', () => {
  const h = loadHost();
  const r = h.raw('sequenceInfo', {});
  assert.equal(r.ok, false); assert.match(r.error, /سيكوينس/);
  assert.match(h.raw('nope', {}).error, /unknown host function/);
});

test('sequenceInfo: tracks, clips, fps, playhead', () => {
  const { call, seq } = setup();
  seq.player = 3.2;
  const s = call('sequenceInfo');
  assert.equal(s.name, 'Main'); assert.equal(s.fps, 25); assert.equal(s.duration, 10); assert.equal(s.playhead, 3.2);
  assert.equal(s.video[0].clips[0].mediaPath, '/media/talk.mp4'); assert.equal(s.video[0].clips[0].inPoint, 2);
  assert.equal(s.audio[0].clips.length, 1); assert.equal(s.video[1].clips[0].start, 6);
});

test('removeRanges: razor + ripple on every track, keeps tracks in sync, adds crossfades, on a copy', () => {
  const { call, pr } = setup();
  const r = call('removeRanges', { ranges: [{ start: 2, end: 3 }, { start: 4.02, end: 5.5 }], clone: true, cloneName: 'Main - cut', crossfadeFrames: 2 });
  const cut = pr.project.activeSeq;
  assert.equal(cut.name, 'Main - cut'); assert.equal(r.sequence, 'Main - cut');
  assert.equal(pr.project.seqs[0].v[0].items.length, 1, 'original untouched');
  // ranges snap to frames at 25fps: [4.02, 5.5] → [4.00, 5.52]
  assert.deepEqual(spans(cut.v[0]), [[0, 2, 2], [2, 3, 5], [3, 7.48, 7.52]]);
  assert.deepEqual(spans(cut.a[0]), spans(cut.v[0]));
  // V2 had no clip inside the ranges → shifted left by the removed length (1 + 1.52)
  assert.deepEqual(spans(cut.v[1]), [[3.48, 5.48, 0]]);
  assert.equal(r.ranges, 2); assert.equal(r.removed, 4);
  assert.ok(r.crossfades >= 2, 'crossfades ' + r.crossfades);
  assert.ok(pr.qeLog.some(l => l[0] === 'transition' && l[1] === 'Constant Power'));
});

test('removeRanges: locked tracks are left alone', () => {
  const { call, seq } = setup({ withBroll: false });
  seq.a[0].locked = true;
  call('removeRanges', { ranges: [{ start: 1, end: 2 }] });
  assert.deepEqual(spans(seq.v[0]), [[0, 1, 2], [1, 9, 4]]);
  assert.deepEqual(spans(seq.a[0]), [[0, 10, 2]]);
});

test('markers: name, comment, color, duration', () => {
  const { call, seq } = setup();
  call('addMarkers', { markers: [{ time: 1, name: 'Beat 1', color: 5 }, { time: 12, name: 'فصل', comment: 'c', duration: 2 }] });
  assert.equal(seq.markerList.length, 2);
  assert.equal(seq.markerList[0].color, 5); assert.equal(seq.markerList[1].comments, 'c'); assert.equal(seq.markerList[1].end.seconds, 14);
});

test('placeFile: imports into EditFast bin once, picks a free video track, trims to duration', () => {
  const { call, seq, pr } = setup();
  const r = call('placeFile', { path: '/cache/broll1.mp4', time: 6.5, kind: 'video', duration: 3, bin: 'EditFast/B-Roll' });
  assert.equal(r.track, 2, 'V2 busy at 6.5 → V3');
  assert.deepEqual(spans(seq.v[2]), [[6.5, 9.5, 0]]);
  const ef = pr.project.root.kids.find(k => k.name === 'EditFast');
  assert.ok(ef && ef.kids.find(k => k.name === 'B-Roll').kids.length === 1);
  call('placeFile', { path: '/cache/broll1.mp4', time: 0, kind: 'video', duration: 1, bin: 'EditFast/B-Roll' });
  assert.equal(ef.kids.find(k => k.name === 'B-Roll').kids.length, 1, 'not re-imported');
  const a = call('placeFile', { path: '/cache/whoosh.mp3', time: 1, kind: 'audio', bin: 'EditFast/SFX' });
  assert.equal(a.track, 1);
});

test('createCaptions: imports the SRT and builds a caption track', () => {
  const { call, seq } = setup();
  call('createCaptions', { srtPath: '/c/captions.srt', start: 0 });
  assert.deepEqual(seq.captionTracks, [{ item: 'captions.srt', start: 0, fmt: 'Subtitle Default' }]);
});

test('applyKeyframes: adds Transform via QE and writes real keys at media time', () => {
  const { call, seq } = setup();
  seq.player = 4;
  const r = call('applyKeyframes', { mode: 'at', duration: 0.5, props: { scale: [{ t: 0, v: 100 }, { t: 0.5, v: 120 }], pos: [{ t: 0, v: [0, 0] }, { t: 0.5, v: [0.1, -0.05] }], opacity: [{ t: 0, v: 0 }, { t: 0.25, v: 100 }] }, track: 0 });
  assert.equal(r.component, 'Transform'); assert.equal(r.keys, 6);
  const clip = seq.v[0].items[0];
  const tf = clip.comps.find(c => c.matchName === 'AE.ADBE Geometry2');
  const scale = tf.props.find(p => p.displayName === 'Scale');
  assert.deepEqual(scale.keys.map(k => [k.t, k.v]), [[6, 100], [6.5, 120]]); // timeline 4 + inPoint 2
  const pos = tf.props.find(p => p.displayName === 'Position');
  assert.deepEqual(Array.from(pos.keys[1].v), [960 + 192, 540 - 54]); // pixel position (Transform) → offset * frame size
  assert.equal(tf.props.find(p => p.displayName === 'Uniform Scale').value, true);
  // "in" mode anchors at clip start, "out" at clip end
  const rin = call('applyKeyframes', { mode: 'in', duration: 0.5, props: { rotation: [{ t: 0, v: -90 }, { t: 0.5, v: 0 }] }, track: 0, time: 4 });
  assert.equal(rin.start, 0);
  const rout = call('applyKeyframes', { mode: 'out', duration: 0.5, props: { rotation: [{ t: 0, v: 0 }, { t: 0.5, v: 90 }] }, track: 0, time: 4, clear: false });
  assert.equal(rout.start, 9.5);
});

test('readKeyframes / writeKeyframes: curve editor round-trip on the selected clip', () => {
  const { call, seq } = setup();
  call('applyKeyframes', { mode: 'at', time: 1, track: 0, duration: 1, props: { scale: [{ t: 0, v: 100 }, { t: 1, v: 150 }] } });
  seq.v[0].items[0].selected = true;
  const r = call('readKeyframes', {});
  const p = r.props.find(x => x.prop === 'Scale');
  assert.deepEqual(p.keys, [{ t: 1, v: 100 }, { t: 2, v: 150 }]);
  call('writeKeyframes', { componentIndex: p.componentIndex, propIndex: p.propIndex, from: 1, to: 2, keys: [{ t: 1, v: 100 }, { t: 1.5, v: 140 }, { t: 2, v: 150 }] });
  const again = call('readKeyframes', {}).props.find(x => x.prop === 'Scale');
  assert.deepEqual(again.keys.map(k => k.v), [100, 140, 150]);
});

test('scanProject + organize: nested bins created, items moved', () => {
  const { call, pr } = setup();
  pr.project.importOne('/a/whoosh.wav', pr.project.root);
  const items = call('scanProject').items;
  assert.ok(items.find(i => i.name === 'Main' && i.isSequence));
  const ids = Object.fromEntries(items.map(i => [i.name, i.nodeId]));
  const r = call('organize', { moves: [{ nodeId: ids['whoosh.wav'], name: 'whoosh.wav', to: 'صوت/مؤثرات' }, { nodeId: ids['talk.mp4'], name: 'talk.mp4', to: 'فيديو' }, { nodeId: 'missing', name: 'x', to: 'y' }] });
  assert.equal(r.moved, 2); assert.deepEqual(r.failed, ['x']);
  const audio = pr.project.root.kids.find(k => k.name === 'صوت');
  assert.equal(audio.kids.find(k => k.name === 'مؤثرات').kids[0].name, 'whoosh.wav');
  const again = call('scanProject').items.find(i => i.name === 'whoosh.wav');
  assert.equal(again.bin, 'صوت/مؤثرات');
});

test('importMGT: places the graphic at the playhead and sets its text for Essential Graphics', () => {
  const { call, seq } = setup();
  seq.player = 2;
  const r = call('importMGT', { path: '/t/basic.mogrt', text: 'أهلا بيكم', duration: 3, fontSize: 90 });
  assert.equal(r.start, 2); assert.equal(r.textSet, true);
  const clip = seq.v[r.track].items.find(c => c._start === 2);
  assert.equal(clip._end, 5);
  const v = JSON.parse(clip.mgtComp.props[0].value);
  assert.equal(v.textEditValue, 'أهلا بيكم'); assert.deepEqual(v.fontSizeEditValue, [90]);
});

test('multicamApply: razors camera tracks and enables only the active camera per shot', () => {
  const h = loadHost();
  const seq = h.pr.newSequence('Pod', { fps: 25 });
  const camA = h.pr.project.importOne('/m/A.mp4', h.pr.project.root), camB = h.pr.project.importOne('/m/B.mp4', h.pr.project.root);
  seq.v[0].add({ projectItem: camA, start: 0, end: 12 }); seq.v[1].add({ projectItem: camB, start: 0, end: 12 });
  const r = h.call('multicamApply', { plan: [{ start: 0, end: 4, trackIndex: 0 }, { start: 4, end: 8, trackIndex: 1 }, { start: 8, end: 12, trackIndex: 0 }], tracks: [0, 1], clone: false });
  assert.equal(r.switches, 2);
  const state = tr => tr.items.slice().sort((a, b) => a._start - b._start).map(c => [c._start, c.disabled]);
  assert.deepEqual(state(seq.v[0]), [[0, false], [4, true], [8, false]]);
  assert.deepEqual(state(seq.v[1]), [[0, true], [4, false], [8, true]]);
});

test('makeHook: copies the hook range to the start of a copy of the sequence', () => {
  const { call, pr, media } = setup({ withBroll: false });
  const r = call('makeHook', { start: 6, end: 8, cloneName: 'Main - hook' });
  const s = pr.project.activeSeq;
  assert.equal(s.name, 'Main - hook'); assert.equal(r.length, 2);
  assert.deepEqual(spans(s.v[0]), [[0, 2, 8], [2, 12, 2]]); // hook uses media 8..10 (inPoint 2 + 6)
  assert.equal(media.inPoint, null, 'in/out cleared afterwards');
});

test('panel bridge → evalScript → host.jsx round-trip keeps Arabic text and paths intact', async () => {
  const vm = require('vm');
  const { call, ctx, seq } = setup();
  const scripts = [];
  const win = { location: { pathname: '/Users/me/EditFast/client/index.html' }, __adobe_cep__: { evalScript: (s, cb) => { scripts.push(s); cb(vm.runInContext(s, ctx)); } } };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', '..', 'client', 'js', 'bridge.js'), 'utf8'), win);
  assert.equal(win.EF.extRoot, '/Users/me/EditFast');
  await win.EF.host('addMarkers', { markers: [{ time: 1, name: 'فصل "الأول" \\ جديد', comment: 'سطر\nتاني' }] });
  assert.ok(/^[\x00-\x7f]*$/.test(scripts[0]), 'script sent to ExtendScript is pure ASCII');
  assert.equal(seq.markerList[0].name, 'فصل "الأول" \\ جديد');
  assert.equal(seq.markerList[0].comments, 'سطر\nتاني');
  const info = await win.EF.host('sequenceInfo', {});
  assert.equal(info.name, 'Main');
  await assert.rejects(win.EF.host('nope', {}), /unknown host function/);
});

test('placeFile: minTrack puts a layer above the clip it belongs to', () => {
  const { call, seq } = setup({ withBroll: false });
  const r = call('placeFile', { path: '/c/glass-abc.mov', time: 1, kind: 'video', duration: 2, minTrack: 2 });
  assert.equal(r.track, 2);
  assert.deepEqual(spans(seq.v[2]), [[1, 3, 0]]);
});

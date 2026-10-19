'use strict';
// End-to-end through host.jsx in the Premiere simulator: relink, downloads, web media, SFX pack, safe zones,
// templates, 3D carousel, icons and the style editor (Remotion stubbed here — real renders live in tests/remotion).
const { TMP, makeAudio, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../core/config');
const { Services } = require('../../core/services');
const { loadHost } = require('./mockPremiere');
const FFMPEG = require('../../core/ffmpeg').findBinary('ffmpeg');

function world({ fetchImpl, analyzeFaces, renderOverlay, settings = {}, vertical = false, clip } = {}) {
  const h = loadHost();
  const seq = h.pr.newSequence('Main', vertical ? { fps: 25, width: 1080, height: 1920 } : { fps: 25 });
  if (clip) { const m = h.pr.project.importOne(clip, h.pr.project.root); seq.v[0].add({ projectItem: m, start: 0, end: 8, inPoint: 0 }); }
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, openrouter: 'sk-or', elevenlabs: 'sk_el' }, ...settings });
  const S = new Services({ host: async (n, a) => h.call(n, JSON.parse(JSON.stringify(a))), fetchImpl, analyzeFaces, renderOverlay });
  return { S, h, seq };
}

function video(name, seconds = 8) {
  const f = path.join(TMP, name);
  if (!fs.existsSync(f)) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=640x360:r=25:d=${seconds}`, '-pix_fmt', 'yuv420p', f]);
  return f;
}

test('EditFast Link: offline items are found on disk and relinked one by one in the project', async () => {
  const disk = path.join(TMP, 'moved'); fs.mkdirSync(path.join(disk, 'Shoot'), { recursive: true });
  fs.writeFileSync(path.join(disk, 'Shoot', 'cam A.mp4'), 'x'); fs.writeFileSync(path.join(disk, 'voice.wav'), 'x');
  const { S, h, seq } = world();
  const a = h.pr.project.importOne('/old/Shoot/cam A.mp4', h.pr.project.root); a.offline = true;
  const b = h.pr.project.importOne('/old/voice.wav', h.pr.project.root); b.offline = true;
  const c = h.pr.project.importOne('/old/lost.mov', h.pr.project.root); c.offline = true;
  h.pr.project.importOne('/fine/ok.mp4', h.pr.project.root);
  seq.v[0].add({ projectItem: a, start: 0, end: 5 });
  const scan = await S.relinkScan({ dirs: [disk] });
  assert.deepEqual(scan.items.map(i => i.name), ['cam A.mp4', 'voice.wav', 'lost.mov']);
  assert.equal(scan.items[0].match.path, path.join(disk, 'Shoot', 'cam A.mp4'));
  assert.equal(scan.items[2].match, null);
  assert.ok(scan.searched.includes(disk));
  const steps = [];
  const r = await S.relinkApply(scan.items, (p, name) => steps.push(name));
  assert.equal(r.done, 2); assert.deepEqual(steps, ['cam A.mp4', 'voice.wav', 'lost.mov']);
  assert.equal(a.getMediaPath(), path.join(disk, 'Shoot', 'cam A.mp4')); assert.equal(a.isOffline(), false);
  assert.equal(c.isOffline(), true);
  assert.equal(seq.v[0].items[0].projectItem, a, 'the cut on the timeline is untouched');
  assert.deepEqual((await S.relinkScan({ dirs: [disk] })).items.map(i => i.name), ['lost.mov']);
});

test('downloads: yt-dlp file lands next to the project and on the timeline; Pinterest photo pins fall back to the image', async () => {
  const fake = path.join(TMP, 'yt-dlp-e2e');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('2026.08.19'); process.exit(0); }
if (a.some(x => /pinterest|pin\\.it/.test(x))) { console.error('ERROR: [Pinterest] No video formats found'); process.exit(1); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'clip [x1]').replace('%(ext)s', 'mp4');
console.log('EFPROG 100% 1MiB/s'); fs.writeFileSync(out, 'v'); console.log('EFFILE ' + out);
`); fs.chmodSync(fake, 0o755);
  const fetchImpl = async (url, o) => {
    if (/pin\.it/.test(url)) return { ok: true, text: async () => '<meta property="og:image" content="https://i.pinimg.com/a.jpg"><meta property="og:title" content="Pin">' };
    fs.writeFileSync(o.toFile, 'jpg'); return { ok: true, status: 200, headers: { get: () => 'image/jpeg' } };
  };
  const { S, h, seq } = world({ fetchImpl, settings: { paths: { ...config.DEFAULTS.paths, ytdlp: fake } } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'demo.prproj');
  seq.player = 3;
  const r = await S.downloadMedia({ url: 'https://youtu.be/x1', quality: '720', start: '0:05', end: '0:20' });
  assert.equal(path.dirname(r.file), path.join(TMP, 'Projects', 'EditFast Media', 'Downloads'));
  assert.match(r.file, /clip \[x1\]-5-20\.mp4$/);
  assert.equal(r.placed.start, 3); assert.equal(seq.v[r.placed.track].items.length, 1);
  const p = await S.downloadMedia({ url: 'https://pin.it/abc', quality: '1080' });
  assert.equal(p.type, 'photo'); assert.match(p.file, /\.jpg$/);
  const placed = seq.v[p.placed.track].items.find(c => c._start === 3 && /\.jpg$/.test(c.projectItem.getMediaPath()));
  assert.ok(placed); assert.equal(placed._end - placed._start, 5);
  await assert.rejects(S.downloadMedia({ url: 'not a url' }), /مش صح/);
});

test('web media: search results go into the project (bin EditFast/Web) or straight onto the timeline', async () => {
  const fetchImpl = async (url, o) => {
    if (/openverse/.test(url)) return mockResponse({ results: [{ title: 'Tower', url: 'https://o/tower.jpg', width: 1200, height: 800, license: 'by' }] });
    if (/wikimedia/.test(url)) return mockResponse({ query: { pages: {} } });
    fs.writeFileSync(o.toFile, 'img'); return { ok: true, status: 200, headers: { get: () => 'image/jpeg' } };
  };
  const { S, h, seq } = world({ fetchImpl });
  const r = await S.webSearch({ q: 'برج القاهرة' });
  assert.equal(r.results.length, 1);
  const imp = await S.webImport({ id: r.results[0].id, place: false });
  assert.ok(fs.existsSync(imp.file));
  const bin = h.pr.project.root.kids.find(k => k.name === 'EditFast').kids.find(k => k.name === 'Web');
  assert.equal(bin.kids.length, 1);
  const pl = await S.webImport({ id: r.results[0].id, time: 1 });
  assert.equal(seq.v[pl.placed.track].items[0]._start, 1);
  await assert.rejects(S.webImport({ id: 'nope' }), /مش موجودة/);
});

test('trendy SFX: placed on an audio track from the offline pack; the pack joins the personal library', async () => {
  const { S, seq } = world();
  const r = await S.placeSfx({ id: 'whoosh', time: 2 });
  const it = seq.a[r.track].items[0];
  assert.equal(it._start, 2); assert.match(it.projectItem.getMediaPath(), /sfx-pack[\\/]whoosh\.wav$/);
  const inst = await S.sfxPackInstall();
  assert.equal(inst.files, 30);
  const lib = S.libraryItems().filter(x => /sfx-pack/.test(x.path));
  assert.equal(lib.length, 30); assert.ok(lib.every(x => x.category === 'sfx'), lib.map(x => x.category).join());
});

test('AI music: Arabic prompt translated, ElevenLabs music API called once (cached), placed on the timeline', async () => {
  const reqs = [];
  const fetchImpl = async (url, o) => {
    reqs.push({ url, body: o.body && JSON.parse(o.body) });
    if (/openrouter/.test(url)) return mockResponse({ choices: [{ message: { content: 'calm lo-fi beat for a vlog' } }] });
    return mockResponse(Buffer.from('ID3music'), { binary: true });
  };
  const { S, seq } = world({ fetchImpl });
  const r = await S.generateMusic({ prompt: 'لو فاي هادية للفلوج', seconds: 45, place: true, time: 0 });
  const music = reqs.find(x => /elevenlabs/.test(x.url));
  assert.equal(music.url, 'https://api.elevenlabs.io/v1/music');
  assert.deepEqual(music.body, { prompt: 'calm lo-fi beat for a vlog', music_length_ms: 45000, model_id: 'music_v1', force_instrumental: true });
  assert.equal(seq.a[r.placed.track].items[0]._end, 45);
  await S.generateMusic({ prompt: 'لو فاي هادية للفلوج', seconds: 45 });
  assert.equal(reqs.filter(x => /elevenlabs/.test(x.url)).length, 1, 'second time comes from the cache');
});

test('safe zones: faces under the platform UI become markers; the guide sits on top and undoes cleanly', async () => {
  const clip = video('talk-vertical.mp4');
  const analyzeFaces = async job => {
    assert.equal(job.fps, 1);
    return [0, 1, 2, 3, 4, 5].map(t => ({ t, faces: [{ cx: 0.5, cy: t < 3 ? 0.4 : 0.9, w: 0.12, h: 0.1, score: 0.9 }] }));
  };
  const renderOverlay = async job => { fs.writeFileSync(job.out, 'png'); return job.out; };
  const { S, seq } = world({ analyzeFaces, renderOverlay, vertical: true, clip });
  const r = await S.safeZoneCheck({ platform: 'tiktok', addMarkers: true });
  assert.equal(r.vertical, true); assert.equal(r.faces, 6);
  const faceIssues = r.issues.filter(i => i.kind === 'face');
  assert.equal(faceIssues.length, 1); assert.equal(faceIssues[0].time, 3); assert.equal(faceIssues[0].sides[0].side, 'bottom');
  assert.ok(r.issues.some(i => i.kind === 'caption'), 'default captions (82% down) sit under TikTok\'s caption area');
  assert.equal(seq.markerList.length, 1); assert.equal(seq.markerList[0].comments, faceIssues[0].text);
  const y = S.safeCaptions({ platform: 'tiktok' }).y;
  assert.equal(y, 0.73);
  assert.ok(!(await S.safeZoneCheck({ platform: 'tiktok' })).issues.some(i => i.kind === 'caption'), 'moved captions are safe');
  const g = await S.safeZoneGuide({ platform: 'tiktok' });
  assert.equal(g.track, 1); assert.equal(seq.v[1].items[0]._end, 8);
  await S.undoLast();
  assert.equal(seq.v[1].items.length, 0);
});

test('templates, 3D carousel, icons and the style editor build the right Remotion specs and place them', async () => {
  const clip = video('talk.mp4');
  const llmReqs = [];
  const plan = { scenes: [
    { time: 1, overlay: false, spec: { duration: 3, elements: [{ type: 'collage', props: { media: ['@0', '@1', '@2'], title: 'رحلة' } }] } },
    { time: 5, overlay: true, spec: { duration: 2, elements: [{ type: 'cutoutTitle', props: { text: 'وأحلى لحظة' } }] } }] };
  const fetchImpl = async (url, o) => { llmReqs.push(JSON.parse(o.body)); return mockResponse({ choices: [{ message: { content: JSON.stringify(plan) } }] }); };
  const { S, seq } = world({ clip, fetchImpl });
  S.saveSettings({ layeredScenes: false }); // this test checks the single-clip specs; layers have their own test
  const renders = [];
  S.proEngine = () => ({ installed: true, node: process.execPath, root: '/r' });
  const pro = require('../../core/proScene');
  const orig = pro.render;
  pro.render = async (o) => { renders.push(o.spec); fs.writeFileSync(o.out, 'x'); return o.out; };
  try {
    // template with photos: stills come from the timeline around the playhead
    seq.player = 2;
    const t = await S.addTemplate({ id: 'c-polaroid', values: { '0.caption': 'يوم حلو' } });
    const spT = renders.pop();
    assert.equal(spT.elements[0].props.caption, 'يوم حلو');
    assert.equal(spT.elements[0].props.media.length, 1); assert.ok(fs.existsSync(spT.elements[0].props.media[0]));
    assert.equal(spT.style, 'collage'); assert.equal(t.start, 2);
    // 3D carousel from chosen files, transparent → above the footage
    const files = [clip, spT.elements[0].props.media[0], clip];
    const c = await S.carousel3D({ files, layout: 'coverflow', speed: 2, background: 'transparent', duration: 5, title: 'أحسن لقطات' });
    const spC = renders.pop();
    assert.equal(spC.elements[0].type, 'carousel3D'); assert.deepEqual(spC.elements[0].props.media, files);
    assert.equal(spC.elements[0].props.layout, 'coverflow'); assert.equal(spC.background.type, 'transparent');
    assert.equal(c.track, 2, 'above the footage and the template already at the playhead');
    await assert.rejects(S.carousel3D({ files: [clip], time: 0 }).then(() => { throw new Error('should need 2'); }), /2/);
    // icons
    const ic = await S.addIcon({ id: 'b-whatsapp', anim: 'bounce', badge: 'circle', label: 'كلمنا', time: 4 });
    const spI = renders.pop();
    assert.equal(spI.elements[0].props.mode, 'fill'); assert.match(spI.elements[0].props.color, /^#/); assert.match(spI.elements[0].props.svg, /^<path/);
    assert.equal(ic.start, 4);
    assert.ok(S.iconSearch('عربية').some(i => i.id === 'l-car')); assert.equal(S.iconSearch('عربية')[0].mode, 'color', 'colour emoji first'); assert.ok(S.iconSearch('', 'realestate').length >= 20);
    // the style editor: one AI request for every scene, frames passed as @refs, scenes placed at their times
    const steps = [];
    const r = await S.styleEdit({ style: 'كولاج', count: 2, onStep: m => steps.push(m) });
    assert.equal(r.style, 'collage'); assert.equal(r.scenes.length, 2);
    assert.equal(llmReqs.length, 1, 'one request plans every scene');
    const sys = JSON.stringify(llmReqs[0].messages[0].content), user = JSON.stringify(llmReqs[0].messages[1].content);
    assert.match(sys, /كولاج/); assert.match(user, /@5 \(ثانية/); assert.match(user, /scenes/);
    const [s1, s2] = renders.splice(-2);
    assert.equal(s1.background.type, 'paper'); assert.equal(s1.elements[0].props.media.length, 3); assert.ok(s1.elements[0].props.media.every(f => fs.existsSync(f)));
    assert.equal(s2.background.type, 'transparent');
    assert.deepEqual(r.scenes.map(x => x.time), [1, 5]);
    assert.ok(seq.v.some(tr => tr.items.some(i => i._start === 1)) && seq.v.some(tr => tr.items.some(i => i._start === 5)));
    assert.ok(steps.some(m => /بيرندر المشهد 2/.test(m)));
    await S.undoLast();
    assert.ok(!seq.v.slice(1).some(tr => tr.items.some(i => i._start === 5)), 'the whole style edit undoes together');
    await assert.rejects(S.styleEdit({ style: 'عادي' }), /اختار استايل/);
  } finally { pro.render = orig; }
});

test('editable scenes: layers nested as a sequence, found again on the timeline, edited in place, undo brings the old one back', async () => {
  const clip = video('talk-layers.mp4');
  const reqs = [];
  const txt = c => (Array.isArray(c) ? c.map(p => p.text || '').join('') : c);
  const fetchImpl = async (url, o) => { const b = JSON.parse(o.body); b.messages = b.messages.map(m => ({ ...m, content: txt(m.content) })); reqs.push(b); const cur = JSON.parse(/ده مشهد موجود:\n(.*)\n/.exec(b.messages[1].content)[1]); cur.elements[0].props.text = 'عنوان جديد'; cur.theme = { primary: '#FF0000' }; return mockResponse({ choices: [{ message: { content: JSON.stringify(cur) } }] }); };
  const { S, h, seq } = world({ clip, fetchImpl, settings: { layeredScenes: true } }); // layers are opt-in now
  S.proEngine = () => ({ installed: true, node: process.execPath, root: '/r' });
  const pro = require('../../core/proScene');
  const orig = pro.render, batches = [];
  pro.render = async (o) => { if (o.batch) { batches.push(o.batch); o.batch.forEach(j => fs.writeFileSync(j.out, 'x')); return o.batch.map(j => j.out); } fs.writeFileSync(o.out, 'x'); return o.out; };
  try {
    seq.player = 2;
    const spec = { duration: 4, background: { type: 'mesh' }, elements: [{ type: 'kineticTitle', from: 0, duration: 3, props: { text: 'عنوان قديم' } }, { type: 'lowerThird', from: 1, duration: 3, props: { name: 'محمد', role: 'مونتير' } }] };
    const r = await S.renderProScene({ spec });
    assert.equal(r.layered, true); assert.equal(r.layers, 4, 'background + 2 elements + look');
    assert.equal(batches[0].length, 4, 'one Remotion run renders every layer');
    assert.deepEqual(batches[0].map(j => path.extname(j.out)), ['.mp4', '.mov', '.mov', '.mov']);
    // the main sequence holds ONE clip: the nested scene sequence
    const placed = seq.v[r.track].items.find(c => c._start === 2);
    assert.ok(placed.projectItem.isSequence(), 'nested sequence on the timeline');
    assert.match(placed.name, /^EF Scene [0-9a-f]{8}$/);
    const nest = h.pr.project.seqs.find(x => x.sequenceID === r.sequenceId);
    assert.deepEqual(nest.v.slice(0, 4).map(t => t.items.map(c => [c._start, c._end])), [[[0, 4]], [[0, 3]], [[1, 4]], [[0, 4]]], 'one track per layer, each at its own time');
    assert.equal(nest.a.every(t => t.items.length === 0), true);
    assert.equal(h.pr.project.activeSeq, seq, 'back on the main sequence');
    // find it again from the timeline (playhead on it)
    seq.player = 3;
    const sc = await S.sceneAt();
    assert.equal(sc.id, r.id); assert.equal(sc.spec.elements[0].props.text, 'عنوان قديم'); assert.deepEqual([sc.clip.track, sc.clip.start], [r.track, 2]);
    // edit with the AI: only the asked change, re-rendered in the same place
    const e = await S.editSceneAI({ instruction: 'غيّر العنوان لـ "عنوان جديد" وخليه أحمر' });
    assert.equal(reqs.length, 1); assert.match(reqs[0].messages[1].content, /عنوان قديم/);
    assert.equal(e.replaced, r.id); assert.equal(e.track, r.track); assert.equal(e.start, 2);
    const now = seq.v[r.track].items.filter(c => c._start === 2);
    assert.equal(now.length, 1); assert.notEqual(now[0].name, placed.name, 'the new scene replaced the old one');
    assert.equal((await S.sceneAt()).spec.elements[0].props.text, 'عنوان جديد');
    assert.equal((await S.sceneAt()).spec.theme.primary, '#FF0000');
    // undo: old scene is back exactly where it was
    await S.undoLast();
    const back = seq.v[r.track].items.filter(c => c._start === 2);
    assert.equal(back.length, 1); assert.equal(back[0].name, placed.name);
    // a single overlay element stays one clip (no nesting needed), and is still editable
    const one = await S.renderProScene({ spec: { duration: 2, background: { type: 'transparent' }, elements: [{ type: 'emojiBurst', props: { emoji: '🔥' } }] }, time: 6 });
    assert.equal(one.layered, false);
    seq.player = 6.5;
    assert.equal((await S.sceneAt()).id, one.id);
    // the setting switches nesting off
    S.saveSettings({ layeredScenes: false });
    assert.equal((await S.renderProScene({ spec, time: 0 })).layered, false);
    seq.player = 50;
    await assert.rejects(S.replaceScene({ spec }), /مفيش مشهد/);
  } finally { pro.render = orig; }
});

test('client revisions through the host: AI split falls back offline on 402, markers on the timeline, reply saved per project', async () => {
  const fetchImpl = async () => mockResponse({ error: { message: 'This request requires more credits. can only afford 25' } }, { status: 402 });
  const { S, h, seq } = world({ fetchImpl });
  h.pr.project.path = path.join(TMP, 'rev-' + Date.now() + '.prproj');
  const res = await S.revisionsSplit({ text: '- شيل الجزء اللي عند 0:03\n- المزيكا عالية', client: 'منى' });
  assert.equal(res.ai, false); assert.match(res.warning, /رصيد OpenRouter مش كفاية/);
  assert.equal(res.round.items.length, 2);
  const r = await S.revisionsToggle({ roundId: res.round.id, itemId: 'r1' });
  assert.equal(r.items[0].done, true);
  assert.deepEqual(await S.revisionsMarkers({ roundId: res.round.id }), { added: 1 });
  assert.equal(seq.markerList.length, 1); assert.equal(seq.markerList[0].start.seconds, 3);
  const m = await S.revisionsMessage({ roundId: res.round.id });
  assert.match(m.text, /منى/); assert.match(m.text, /✅ شيل الجزء/); assert.match(m.text, /⏳ المزيكا عالية/);
  assert.equal((await S.revisionsLoad()).rounds[0].message, m.text);
  await assert.rejects(S.revisionsSplit({ text: '  ' }), /الصق رسالة/);
});

test('SFX without ElevenLabs: a description places a matching sound from the built-in pack', async () => {
  const { S, seq } = world({ settings: { libraryDirs: [], keys: { ...config.DEFAULTS.keys, openrouter: '', elevenlabs: '' } } });
  S.libraryItems = () => []; // no personal SFX library on this machine
  const r = await S.placeBestSfx({ prompt: 'camera shutter', time: 1 });
  assert.equal(r.source, 'pack'); assert.equal(r.id, 'camera-shutter');
  const r2 = await S.placeBestSfx({ prompt: 'something unknown', time: 2 });
  assert.equal(r2.id, 'whoosh');
  assert.ok(seq.a.reduce((n, t) => n + t.items.length, 0) >= 2, 'both placed on the timeline');
});

test('spend counter: every answered AI request is recorded (OpenRouter cost), the panel is told, estimate uses the chosen model', async () => {
  let n = 0;
  const fetchImpl = async () => mockResponse({ choices: [{ message: { content: '{"start":1,"end":4,"reason":"x"}' } }], usage: { prompt_tokens: 900, completion_tokens: 50, cost: 0.0042 + (n++) * 0 } });
  const { S } = world({ fetchImpl, settings: { models: { hook: 'anthropic/claude-opus-5.5' } } });
  const before = S.spendSummary().today;
  const told = []; S.onSpend = c => told.push(c);
  await S.llm.text({ model: 'anthropic/claude-opus-5.5', user: 'x' });
  await S.llm.json({ model: 'anthropic/claude-opus-5.5', user: 'x' });
  const s = S.spendSummary();
  assert.ok(Math.abs(s.today - before - 0.0084) < 1e-9);
  assert.deepEqual(told, [0.0042, 0.0042]);
  assert.ok(s.byModel.some(m => m.id === 'anthropic/claude-opus-5.5'));
  const e = S.costEstimate('hook');
  assert.ok(e.low > 0); assert.equal(e.what, 'اختيار الهوك');
});

test('self-test: every Premiere call on a throwaway sequence, cleaned up after; tools + readiness + a report without keys', async () => {
  const fetchImpl = async () => mockResponse({ data: [] });
  const { S, h } = world({ fetchImpl, clip: video('selftest-src.mp4', 4) });
  const before = h.pr.project.seqs.length, active = h.pr.project.activeSeq;
  const steps = [];
  const r = await S.selfTest({ onStep: m => steps.push(m) });
  const ids = r.premiere.probes.map(p => p.id);
  for (const id of ['qe', 'import', 'importStill', 'importSrt', 'newSequence', 'addTrack', 'placeStill', 'clipEnd', 'markers', 'razor', 'rippleDelete', 'transform', 'captions', 'clone', 'cleanup']) assert.ok(ids.includes(id), id);
  const bad = r.premiere.probes.filter(p => !p.ok);
  assert.deepEqual(bad, [], JSON.stringify(bad));
  assert.equal(h.pr.project.seqs.length, before, 'test sequences deleted');
  assert.equal(h.pr.project.activeSeq, active, 'back on the user\'s sequence');
  assert.ok(!h.pr.project.root.kids.some(k => k.name === 'EditFast Self-Test'), 'test bin deleted');
  assert.equal(r.premiere.env.app, 'Premiere Pro (mock)');
  assert.ok(r.tools.ffmpeg.ok); assert.ok('ytdlp' in r.tools);
  assert.ok(r.ready.cut.ok && r.ready.markers.ok, JSON.stringify(r.ready));
  assert.ok(steps.length >= 2);
  // the test PNG is a real PNG (1.5.0 shipped a corrupt one and Premiere rightly refused it)
  const png = fs.readFileSync(path.join(require('../../core/config').cacheDir('selftest'), 'اختبار EditFast', 'ef-test.png'));
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(require('zlib').inflateSync(png.slice(41, 41 + png.readUInt32BE(33))).length === 180 * (1 + 320 * 4));
  // a probe that never ran reads as "not tested", not "broken"
  const rd = S.readiness({ premiere: { probes: [{ id: 'import', ok: false, detail: 'refused' }, { id: 'newSequence', ok: false, detail: 'skipped: nothing imported' }] }, tools: { ffmpeg: { ok: true } }, network: {}, keys: {} });
  assert.equal(rd.markers.untested, true); assert.match(rd.markers.why, /ما اتجرّبش/);
  assert.equal(rd.audio.untested, false);
  S.logError({ tab: 'download', action: 'بيحمّل', error: 'فشل مع مفتاح sk-or-abcdef123456' });
  const rep = S.diagnosticReport();
  assert.match(rep, /OK  razor/); assert.match(rep, /ready cut: yes/); assert.match(rep, /بيحمّل/);
  assert.doesNotMatch(rep, /abcdef123456/, 'keys are redacted');
});

test('مكتبتي: sorts a folder into categories, thumbnails + waveforms, fast rescans keep tags/favourites, place at markers, MOGRT, presets explained', async () => {
  const lib = path.join(TMP, 'my-lib-' + Date.now());
  for (const d of ['SFX/Whoosh', 'Music', 'Overlays', 'B-Roll', 'Titles', 'Presets']) fs.mkdirSync(path.join(lib, d), { recursive: true });
  fs.copyFileSync(makeAudio('lib-whoosh.wav', [{ tone: 600, dur: 0.8 }]), path.join(lib, 'SFX/Whoosh', 'whoosh fast.wav'));
  fs.copyFileSync(makeAudio('lib-song.wav', [{ tone: 300, dur: 45, amp: 0.2 }]), path.join(lib, 'Music', 'calm bed.wav'));
  fs.copyFileSync(video('lib-leak.mp4', 3), path.join(lib, 'Overlays', 'light leak 01.mp4'));
  fs.copyFileSync(video('lib-city.mp4', 6), path.join(lib, 'B-Roll', 'city night.mp4'));
  fs.writeFileSync(path.join(lib, 'Titles', 'lower third.mogrt'), 'x');
  fs.writeFileSync(path.join(lib, 'Presets', 'zoom.prfpset'), 'x');
  fs.writeFileSync(path.join(lib, 'Overlays', 'frame.png'), require('../../core/util').makePng(64, 36));
  const { S, seq } = world({ clip: video('lib-main.mp4', 8) });
  require('../../core/library').saveIndex(require('../../core/config').dataDir(), []);
  const r = await S.libraryAdd([lib]);
  assert.equal(r.total, 7); assert.equal(r.added, 7);
  const byName = n => S.libraryItems().find(x => x.name === n);
  assert.equal(byName('whoosh fast').category, 'sfx'); assert.equal(byName('whoosh fast').sub, 'whoosh');
  assert.equal(byName('calm bed').category, 'music');
  assert.equal(byName('light leak 01').category, 'overlays');
  assert.equal(byName('city night').category, 'footage');
  assert.equal(byName('lower third').category, 'graphics');
  assert.equal(byName('zoom').category, 'presets');
  const st = S.libraryStats(); assert.equal(st.total, 7); assert.equal(st.cats.sfx, 1); assert.deepEqual(st.dirs, [lib]);
  // thumbnails: a frame for video, a waveform for sound — cached
  const tv = await S.libraryThumb(byName('city night').id), ta = await S.libraryThumb(byName('whoosh fast').id);
  assert.ok(/\.jpg$/.test(tv) && fs.statSync(tv).size > 500); assert.ok(/\.png$/.test(ta) && fs.statSync(ta).size > 200);
  assert.equal(await S.libraryThumb(byName('city night').id), tv);
  assert.equal(await S.libraryThumb(byName('lower third').id), null);
  // favourite + tags survive a rescan, and the rescan doesn't probe unchanged files
  S.libraryUpdate({ id: byName('whoosh fast').id, fav: true, tags: 'سريع، انتقال' });
  const probeOrig = require('../../core/ffmpeg').probe; let probes = 0;
  require('../../core/ffmpeg').probe = async (...a) => { probes++; return probeOrig(...a); };
  try { const rr = await S.libraryRescan(); assert.equal(rr.added, 0); assert.equal(probes, 0, 'nothing re-probed'); } finally { require('../../core/ffmpeg').probe = probeOrig; }
  assert.equal(byName('whoosh fast').fav, true); assert.deepEqual(byName('whoosh fast').tags, ['سريع', 'انتقال']);
  assert.deepEqual(S.librarySearch({ q: 'انتقال' }).map(x => x.name), ['whoosh fast'], 'tags are searchable');
  assert.deepEqual(S.librarySearch({ special: 'fav' }).map(x => x.name), ['whoosh fast']);
  // place: at every marker (one call), recent + uses tracked
  seq.markers.createMarker(1); seq.markers.createMarker(4);
  const p = await S.libraryPlace({ id: byName('whoosh fast').id, at: 'markers' });
  assert.equal(p.placed, 2);
  const sfxClips = seq.a.flatMap(t => t.items).filter(c => /whoosh fast/.test(c.projectItem.mediaPath));
  assert.deepEqual(sfxClips.map(c => c._start).sort(), [1, 4]);
  assert.equal(byName('whoosh fast').uses, 2); assert.ok(S.librarySearch({ special: 'recent' }).length === 1);
  const m = await S.libraryPlace({ id: byName('lower third').id, time: 2 });
  assert.ok(m.track >= 1, 'MOGRT through importMGT');
  await assert.rejects(S.libraryPlace({ id: byName('zoom').id }), /اسحبه/);
  // remove a folder: its items leave the library, files stay on disk
  const rm = S.libraryRemoveDir(lib);
  assert.equal(rm.total, 0); assert.ok(fs.existsSync(path.join(lib, 'Music', 'calm bed.wav')));
});

test('download 403: an old system yt-dlp is replaced by the current one, and YouTube is retried with another player client', async () => {
  const mk = (file, body) => { fs.writeFileSync(file, `#!${process.execPath}\nconst a = process.argv.slice(2), fs = require('fs');\n${body}`); fs.chmodSync(file, 0o755); return file; };
  const okOut = `const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'yt [x]').replace('%(ext)s', 'mp4'); console.log('EFPROG 100%'); fs.writeFileSync(out, 'v'); console.log('EFFILE ' + out);`;
  const oldBin = mk(path.join(TMP, 'yt-old'), `if (a[0] === '--version') { console.log('2026.03.17'); process.exit(0); }\nconsole.error('ERROR: unable to download video data: HTTP Error 403: Forbidden'); process.exit(1);`);
  const { S, h } = world({ settings: { paths: { ...config.DEFAULTS.paths, ytdlp: '' } } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'yt.prproj');
  const managed = require('../../core/ytdlp').managedPath(require('../../core/config').dataDir());
  try { fs.unlinkSync(managed); } catch (_) {}
  let installs = 0;
  // the "latest" build still gets a 403 on the default client, but works with the retry client
  S.ytdlpInstall = async () => { installs++; fs.mkdirSync(path.dirname(managed), { recursive: true }); mk(managed, `if (a[0] === '--version') { console.log('2026.10.15'); process.exit(0); }\nif (!a.includes('youtube:player_client=tv,web_safari,mweb')) { console.error('ERROR: HTTP Error 403: Forbidden'); process.exit(1); }\n${okOut}`); return { file: managed }; };
  const origBin = S.ytdlpBin.bind(S);
  S.ytdlpBin = () => (fs.existsSync(managed) ? managed : oldBin);
  const phases = [];
  const r = await S.downloadMedia({ url: 'https://youtu.be/abc', quality: '720', place: false, onProgress: (p, ph) => ph && phases.push(ph) });
  assert.match(r.file, /yt \[x\]\.mp4$/);
  assert.equal(installs, 1, 'updated once (the system one was 7 months old)');
  assert.ok(phases.includes('update') && phases.includes('retry'), phases.join(','));
  S.ytdlpBin = origBin; try { fs.unlinkSync(managed); } catch (_) {}
});

test('download 403 only while cutting (YouTube refuses ffmpeg\'s section request): falls back to the whole file + an exact cut here', async () => {
  const fake = path.join(TMP, 'yt-sections-403');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('2026.10.15'); process.exit(0); }
if (a.includes('--download-sections')) { console.error('ERROR: [download] Got error: HTTP Error 403: Forbidden'); process.exit(1); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'full [x]').replace('%(ext)s', 'mp4');
fs.copyFileSync(process.env.EF_SRC, out); console.log('EFPROG 100%'); console.log('EFFILE ' + out);
`); fs.chmodSync(fake, 0o755);
  process.env.EF_SRC = video('yt-src-10s.mp4', 10);
  const { S, h } = world({ settings: { paths: { ...config.DEFAULTS.paths, ytdlp: fake } } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'yt2.prproj');
  const r = await S.downloadMedia({ url: 'https://youtu.be/abc', quality: '720', start: '0:02', end: '0:05', place: false });
  const d = +require('child_process').execFileSync(require('../../core/ffmpeg').findBinary('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.file]).toString();
  assert.ok(Math.abs(d - 3) < 0.2, 'cut to 3 s here: ' + d);
  delete process.env.EF_SRC;
});

test('Instagram asks for a login: the browsers\' cookies are tried one by one, the one that works is remembered; the error names the right site', async () => {
  const fake = path.join(TMP, 'yt-insta');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('2026.10.15'); process.exit(0); }
const c = a.indexOf('--cookies-from-browser') >= 0 ? a[a.indexOf('--cookies-from-browser') + 1] : null;
if (c !== process.env.EF_GOOD_BROWSER) { console.error('ERROR: [Instagram] DepEQ: Requested content is not available, rate-limit reached or login required. Use --cookies-from-browser or --cookies for the authentication.'); process.exit(1); }
if (a.includes('-J')) { console.log(JSON.stringify({ id: 'DepEQ', title: 'ريل', duration: 12, formats: [{ vcodec: 'h264', height: 1920 }] })); process.exit(0); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'reel [x]').replace('%(ext)s', 'mp4'); fs.writeFileSync(out, 'v'); console.log('EFFILE ' + out);
`); fs.chmodSync(fake, 0o755);
  const { S, h } = world({ settings: { paths: { ...config.DEFAULTS.paths, ytdlp: fake }, ytdlpCookies: '' } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'insta.prproj');
  const Y = require('../../core/ytdlp');
  assert.ok(Y.needsLogin('Requested content is not available, rate-limit reached or login required'));
  process.env.EF_GOOD_BROWSER = Y.installedBrowsers()[1]; // not the first one: it has to keep trying
  const info = await S.downloadInfo('https://www.instagram.com/reels/DepEQ/');
  assert.equal(info.title, 'ريل');
  assert.equal(S.settings.ytdlpCookies, process.env.EF_GOOD_BROWSER, 'remembered');
  const r = await S.downloadMedia({ url: 'https://www.instagram.com/reels/DepEQ/', place: false });
  assert.match(r.file, /reel \[x\]\.mp4$/);
  process.env.EF_GOOD_BROWSER = 'nobody';
  S.saveSettings({ ytdlpCookies: '' });
  await assert.rejects(S.downloadInfo('https://www.instagram.com/reels/DepEQ/'), e => /إنستجرام طالب تسجيل دخول/.test(e.message) && !/يوتيوب/.test(e.message));
  delete process.env.EF_GOOD_BROWSER;
});

test('Dropbox links: info off the link, only the chosen part comes down, folders unzip into مكتبتي + a bin, locked links explain themselves', async () => {
  const http = require('http'), { nodeFetch } = require('../../core/http'), C = require('../../core/cloud');
  // pure bits first
  assert.equal(C.direct('https://www.dropbox.com/scl/fi/abc/clip.mp4?rlkey=k&dl=0').url, 'https://www.dropbox.com/scl/fi/abc/clip.mp4?rlkey=k&dl=1');
  assert.equal(C.direct('https://www.dropbox.com/scl/fo/xyz/AAB?rlkey=k&dl=0').folder, true);
  assert.equal(C.direct('https://www.dropbox.com/scl/fo/xyz/AAB/cam%20A.mp4?rlkey=k&dl=0').folder, false, 'a file opened inside a shared folder');
  assert.equal(C.direct('https://drive.google.com/file/d/1AbCdEfGhIjK_lm/view?usp=sharing').url, 'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjK_lm&export=download&confirm=t');
  assert.throws(() => C.direct('https://drive.google.com/drive/folders/1AbCdEfGhIjK'), /فولدر جوجل درايف/);
  assert.equal(C.nameFromDisposition("attachment; filename=\"x.mp4\"; filename*=UTF-8''%D9%85%D9%82%D8%A7%D8%A8%D9%84%D8%A9.mp4"), 'مقابلة.mp4');
  assert.equal(require('../../core/ytdlp').platformOf('https://www.dropbox.com/scl/fi/abc/x.mp4').label, 'دروبوكس');

  const src = video('dbx-src-10s.mp4', 10), data = fs.readFileSync(src);
  const zdir = path.join(TMP, 'dbx-zip'); fs.rmSync(zdir, { recursive: true, force: true }); fs.mkdirSync(path.join(zdir, 'Shoot'), { recursive: true });
  fs.copyFileSync(src, path.join(zdir, 'Shoot', 'cam A.mp4')); fs.writeFileSync(path.join(zdir, 'notes.txt'), 'x');
  const zipFile = path.join(TMP, 'dbx.zip'); try { fs.unlinkSync(zipFile); } catch (_) {}
  execFileSync('zip', ['-qr', zipFile, '.'], { cwd: zdir });
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.method + ' ' + req.url + ' ' + (req.headers.range || ''));
    if (req.url.startsWith('/scl/fi/abc/')) { res.writeHead(302, { Location: '/content/clip' }); return res.end(); }
    if (req.url.startsWith('/scl/fi/locked/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>sign in</html>'); }
    if (req.url.startsWith('/scl/fo/')) { res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': "attachment; filename*=UTF-8''%D8%AA%D8%B5%D9%88%D9%8A%D8%B1.zip" }); return res.end(fs.readFileSync(zipFile)); }
    if (req.url === '/content/clip') {
      const hd = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Disposition': "attachment; filename*=UTF-8''%D9%85%D9%82%D8%A7%D8%A8%D9%84%D8%A9.mp4" };
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (m) { const a = +m[1], b = m[2] ? +m[2] : data.length - 1; res.writeHead(206, { ...hd, 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Content-Length': b - a + 1 }); return res.end(data.subarray(a, b + 1)); }
      res.writeHead(200, { ...hd, 'Content-Length': data.length }); return res.end(data);
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const fetchImpl = (u, o) => nodeFetch(u.replace('https://www.dropbox.com', base), o);
  try {
    const { S, h } = world({ fetchImpl });
    h.ctx.app.project.path = path.join(TMP, 'Projects', 'dbx.prproj');
    const url = 'https://www.dropbox.com/scl/fi/abc/clip.mp4?rlkey=k&dl=0';
    const info = await S.downloadInfo(url);
    assert.equal(info.title, 'مقابلة.mp4'); assert.equal(info.cloud, true); assert.equal(info.type, 'video');
    assert.ok(Math.abs(info.duration - 10) < 0.2, 'length read off the link: ' + info.duration);
    assert.deepEqual(info.heights, [360]);
    assert.match(info.thumbnail, /^data:image\/jpeg;base64,\/9j\//, 'a real JPEG frame for the card');
    const fr = await S.cloudFrame(url, 7);
    assert.ok(fr.length > 500 && fr !== info.thumbnail);
    assert.equal(await S.cloudFrame(url, 7), fr, 'cached');
    // preview player: the file's own link, or a playable 360p piece with sound
    const ps = await S.previewSource(url);
    assert.match(ps.url, /\/content\/clip$/); assert.equal(ps.chunks, true);
    const pc = await S.previewClip(url, 3.7, 4);
    assert.equal(pc.start, 3);
    const pr = await require('../../core/ffmpeg').probe(require('../../core/ffmpeg').findBinary('ffprobe'), pc.path);
    assert.equal(pr.height, 360); assert.ok(Math.abs(pr.duration - 4) < 0.3, 'piece length ' + pr.duration);
    // Premiere's panel browser has no H.264: the piece is WebM (VP8) so it actually plays there
    assert.match(pc.path, /\.webm$/); assert.equal(pr.codec, 'vp8'); assert.equal(pc.mime, 'video/webm');
    assert.equal((await S.previewSource(url)).webm, true);
    assert.deepEqual(await S.previewClip(url, 3.2, 4), pc, 'same piece reused');
    hits.length = 0;
    const r = await S.downloadMedia({ url, start: '0:02', end: '0:05', place: false });
    assert.match(path.basename(r.file), /^مقابلة-2-5\.mp4$/);
    assert.match(r.file, /EditFast Media[\\/]Downloads/);
    const d = +execFileSync(require('../../core/ffmpeg').findBinary('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.file]).toString();
    assert.ok(Math.abs(d - 3) < 0.2, 'only 3 s: ' + d);
    assert.ok(!hits.some(x => /^GET \/content\/clip\s*$/.test(x)), 'never pulled the whole file without a range: ' + hits.join(' | '));
    const w = await S.downloadMedia({ url, place: true });
    assert.equal(fs.statSync(w.file).size, data.length); assert.equal(w.type, 'video'); assert.ok(w.placed);
    const f = await S.downloadMedia({ url: 'https://www.dropbox.com/scl/fo/xyz/AAB?rlkey=k&dl=0' });
    assert.equal(f.type, 'folder'); assert.equal(path.basename(f.file), 'تصوير');
    assert.deepEqual(f.files.map(x => x.name), ['cam A.mp4'], 'media only, notes.txt skipped');
    assert.equal(f.imported, 1); assert.equal(f.bin, 'EditFast/Downloads/تصوير');
    assert.ok((S.settings.libraryDirs || []).includes(f.file), 'added to مكتبتي');
    await assert.rejects(S.downloadInfo('https://www.dropbox.com/scl/fi/locked/x.mp4?rlkey=k'), /Anyone with the link/);
  } finally { srv.close(); }
});

test('مكتبتي: files saved as "folders" by an old version become one chip, remove them or clear all; a MOGRT shows its own preview and takes your text', async () => {
  const lib = path.join(TMP, 'lib-files-' + Date.now()); fs.mkdirSync(path.join(lib, 'Leaks'), { recursive: true });
  const leak = path.join(lib, 'Leaks', 'Leak 3.mp4'); fs.copyFileSync(video('lib-leak.mp4', 3), leak);
  const click = path.join(lib, 'Click Digital 02.wav'); fs.copyFileSync(makeAudio('lib-click.wav', [{ tone: 900, dur: 0.3 }]), click);
  const thumb = require('../../core/util').makePng(32, 18, [255, 0, 0, 255]);
  const mogrt = path.join(lib, 'Text 14.mogrt');
  fs.writeFileSync(mogrt, require('../../core/zip').create([{ name: 'definition.json', data: Buffer.from('{}') }, { name: 'project.aegraphic', data: Buffer.alloc(4096, 7) }, { name: 'thumb.png', data: thumb }]));
  const { S, seq } = world({ clip: video('lib-main.mp4', 8), settings: { libraryDirs: [path.join(lib, 'Leaks'), leak, click], libraryFiles: [] } });
  require('../../core/library').saveIndex(require('../../core/config').dataDir(), []);
  const st = S.libraryStats();
  assert.deepEqual(st.dirs, [path.join(lib, 'Leaks')], 'only real folders stay chips');
  assert.deepEqual(st.files.sort(), [click, leak].sort());
  await S.libraryAdd([mogrt]);
  assert.ok(S.libraryStats().files.includes(mogrt), 'a dropped file joins the files list, not the folders');
  const r = await S.libraryRescan();
  assert.equal(r.total, 3, 'rescan keeps folders + single files (leak counted once)');
  const m = S.libraryItems().find(x => x.ext === 'mogrt');
  const tf = await S.libraryThumb(m.id);
  assert.ok(tf && fs.readFileSync(tf).equals(thumb), 'the MOGRT\'s own thumb.png');
  const p = await S.libraryPlace({ id: m.id, time: 1, text: 'أهلا بيكم' });
  assert.equal(p.textSet, true);
  const clip = seq.v.flatMap(t => t.items).find(c => /Text 14/.test(c.projectItem.mediaPath));
  assert.match(clip.mgtComp.properties[0].getValue(), /أهلا بيكم/);
  const rf = S.libraryRemoveFiles();
  assert.equal(rf.removed, 3); assert.deepEqual(S.libraryStats().files, []);
  assert.ok(fs.existsSync(click) && fs.existsSync(mogrt), 'nothing deleted from disk');
  assert.equal(S.libraryItems().length, 1, 'the folder\'s item stays');
  S.libraryClear();
  assert.equal(S.libraryItems().length, 0); assert.deepEqual(S.libraryStats().dirs, []);
});

test('stop button: a running yt-dlp (and the ffmpeg it started) or a Dropbox transfer is ended, half files removed, nothing placed', async () => {
  const fake = path.join(TMP, 'yt-slow');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs'), cp = require('child_process');
if (a[0] === '--version') { console.log('2026.10.15'); process.exit(0); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'slow [x]').replace('%(ext)s', 'mp4');
fs.writeFileSync(out + '.part', 'half');
// a grandchild like yt-dlp's ffmpeg: must die with it
const kid = cp.spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.env.EF_KID, String(kid.pid));
let p = 0; setInterval(() => { p = Math.min(99, p + 1); console.log('EFPROG ' + p + '%'); }, 100);
`); fs.chmodSync(fake, 0o755);
  const kidFile = path.join(TMP, 'yt-slow-kid.pid'); try { fs.unlinkSync(kidFile); } catch (_) {}
  process.env.EF_KID = kidFile;
  const { S, h, seq } = world({ settings: { paths: { ...config.DEFAULTS.paths, ytdlp: fake } } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'stop.prproj');
  assert.deepEqual(S.downloadCancel(), { stopped: false }, 'nothing running');
  let ticks = 0;
  const run = S.downloadMedia({ url: 'https://youtu.be/slow', quality: '720', place: true, onProgress: p => { if (p > 0) ticks++; } });
  const t0 = Date.now();
  while (ticks < 3 && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 50));
  assert.ok(ticks >= 3, 'it was downloading');
  assert.deepEqual(S.downloadCancel(), { stopped: true });
  await assert.rejects(run, e => e.cancelled === true && /اتوقف/.test(e.message));
  assert.ok(Date.now() - t0 < 6000, 'stopped right away, no other attempts');
  const dir = path.join(TMP, 'Projects', 'EditFast Media', 'Downloads');
  assert.deepEqual(fs.readdirSync(dir).filter(n => /slow/.test(n)), [], 'the .part is gone');
  assert.equal(seq.v.flatMap(t => t.items).length, 0, 'nothing on the timeline');
  const kid = +fs.readFileSync(kidFile, 'utf8');
  await new Promise(r => setTimeout(r, 300));
  // gone, or a zombie waiting to be reaped (containers without an init): either way it isn't running
  const alive = () => { try { process.kill(kid, 0); } catch (_) { return false; } try { return !/State:\s*Z/.test(fs.readFileSync('/proc/' + kid + '/status', 'utf8')); } catch (_) { return process.platform !== 'linux'; } };
  assert.equal(alive(), false, 'the grandchild process was stopped too');
  delete process.env.EF_KID;

  // a direct (Dropbox) transfer that trickles in
  const http = require('http'), { nodeFetch } = require('../../core/http');
  const srv = http.createServer((req, res) => {
    const hd = { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="big.mp4"' };
    if (req.headers.range) { res.writeHead(206, { ...hd, 'Content-Range': 'bytes 0-0/50000000', 'Content-Length': 1 }); return res.end('x'); }
    res.writeHead(200, { ...hd, 'Content-Length': 50000000 });
    const iv = setInterval(() => res.write(Buffer.alloc(64 * 1024)), 20); res.on('close', () => clearInterval(iv));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const W2 = world({ fetchImpl: (u, o) => nodeFetch(u.replace('https://www.dropbox.com', base), o) });
    W2.h.ctx.app.project.path = path.join(TMP, 'Projects', 'stop2.prproj');
    let got = 0;
    const run2 = W2.S.downloadMedia({ url: 'https://www.dropbox.com/scl/fi/z/big.mp4?rlkey=k', place: false, onProgress: p => { got = p; } });
    const t1 = Date.now(); while (got < 0.01 && Date.now() - t1 < 8000) await new Promise(r => setTimeout(r, 50));
    assert.ok(got > 0, 'transfer running');
    W2.S.downloadCancel();
    await assert.rejects(run2, e => e.cancelled === true);
    const d2 = path.join(TMP, 'Projects', 'EditFast Media', 'Downloads');
    assert.deepEqual(fs.readdirSync(d2).filter(n => /^big/.test(n)), [], 'no big.mp4 / big.mp4.part left');
  } finally { srv.close(); }
});

test('a download that hangs is stopped within the stall time and the next way runs (no minutes of waiting then an error); all hanging → a clear message', async () => {
  const fake = path.join(TMP, 'yt-hang');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('2026.10.15'); process.exit(0); }
if (!a.includes('--socket-timeout') || !a.includes('--concurrent-fragments')) { console.error('ERROR: missing fail-fast args'); process.exit(1); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'hang [x]').replace('%(ext)s', 'mp4');
if (a.includes('--download-sections') || process.env.EF_HANG_ALL) { console.log('EFPROG 30.0% 1.2MiB/s ETA 00:10'); setInterval(() => {}, 1000); return; }
console.log('EFPROG 50.0% 3.1MiB/s ETA 00:02'); console.log('EFPROG 100% 3.1MiB/s ETA 00:00'); fs.copyFileSync(process.env.EF_SRC, out); console.log('EFFILE ' + out);
`); fs.chmodSync(fake, 0o755);
  process.env.EF_SRC = video('yt-src-10s.mp4', 10);
  const { S, h } = world({ settings: { paths: { ...config.DEFAULTS.paths, ytdlp: fake }, dlStallSec: 2, dlIdleSec: 3 } });
  h.ctx.app.project.path = path.join(TMP, 'Projects', 'hang.prproj');
  const phases = [], infos = [];
  const t0 = Date.now();
  const r = await S.downloadMedia({ url: 'https://youtu.be/hang', quality: '720', start: '0:05', end: '0:20', place: false, onProgress: (p, ph, info) => { if (ph) phases.push(ph); if (info && info.speed) infos.push(info); } });
  assert.ok(Date.now() - t0 < 9000, 'took ' + (Date.now() - t0));
  assert.ok(phases.includes('stall'), phases.join(','));
  assert.match(r.file, /hang \[x\]-5-20\.mp4$/, 'whole file + exact cut here');
  assert.ok(infos.some(i => i.speed === '3.1MiB/s' && i.eta === '00:02'), 'speed + time left for the panel');
  process.env.EF_HANG_ALL = '1';
  try {
    await assert.rejects(S.downloadMedia({ url: 'https://youtu.be/hang2', quality: '720', place: false }), /بطيء جدًا|بيوقف التحميل/);
  } finally { delete process.env.EF_HANG_ALL; }
});

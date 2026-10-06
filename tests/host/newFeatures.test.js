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
  config.save({ ...config.DEFAULTS, keys: { ...config.DEFAULTS.keys, openrouter: 'sk-or', elevenlabs: 'el' }, ...settings });
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
    assert.equal(S.iconSearch('عربية')[0].id, 'l-car'); assert.ok(S.iconSearch('', 'realestate').length >= 20);
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
  const { S, h, seq } = world({ clip, fetchImpl });
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

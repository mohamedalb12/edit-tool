'use strict';
// End-to-end: Services (Node) → host.jsx (in the Premiere simulator) with real ffmpeg, a whisper.cpp-compatible CLI,
// and mocked network APIs (OpenRouter / ElevenLabs / Pexels).
const { TMP, makeAudio, makeClicks, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
// prompt caching sends Anthropic system/user text as content parts
const txt = c => (Array.isArray(c) ? c.map(p => p.text || '').join('') : c);
const fs = require('fs');
const path = require('path');
const config = require('../../core/config');
const { Services } = require('../../core/services');
const { EditFastAgent } = require('../../core/agent');
const { loadHost } = require('./mockPremiere');

const FAKE_WHISPER = path.join(__dirname, '..', 'fixtures', 'fake-whisper.js');
const MODEL = path.join(TMP, 'ggml-fake.bin'); fs.writeFileSync(MODEL, 'x');

function world({ clipFile, clipLen = 10, fetchImpl, renderScene, settings = {} } = {}) {
  const h = loadHost();
  const seq = h.pr.newSequence('Main', { fps: 25 });
  if (clipFile) {
    const media = h.pr.project.importOne(clipFile, h.pr.project.root);
    seq.v[0].add({ projectItem: media, start: 0, end: clipLen, inPoint: 0 });
    seq.a[0].add({ projectItem: media, start: 0, end: clipLen, inPoint: 0 });
  }
  config.save({ ...config.DEFAULTS, paths: { ...config.DEFAULTS.paths, whisper: FAKE_WHISPER, whisperModel: MODEL }, keys: { openrouter: 'sk-or', elevenlabs: 'el', pexels: 'px', pixabay: '' }, ...settings });
  const calls = [];
  const S = new Services({
    host: async (name, args) => { calls.push(name); return h.call(name, JSON.parse(JSON.stringify(args))); },
    renderScene: renderScene || (async (spec, out) => { fs.writeFileSync(out, 'video:' + JSON.stringify(spec).length); return out; }),
    fetchImpl
  });
  return { S, h, seq, calls };
}
const spans = tr => tr.items.slice().sort((a, b) => a._start - b._start).map(c => [+c._start.toFixed(2), +c._end.toFixed(2)]);

test('القص السريع: real silence detection → razor + ripple on a copy of the sequence', async () => {
  const f = makeAudio('talk.wav', [{ tone: 300, dur: 2 }, { silence: 1.5 }, { tone: 300, dur: 2 }, { silence: 1 }, { tone: 300, dur: 2 }]); // 8.5s
  const { S, h } = world({ clipFile: f, clipLen: 8.5 });
  const a = await S.quickCutAnalyze({ sensitivity: 5, padding: 0.1 });
  assert.equal(a.cuts.length, 2);
  const r = await S.quickCut({ sensitivity: 5, padding: 0.1, crossfadeFrames: 2 });
  const cut = h.pr.project.activeSeq;
  assert.match(cut.name, /قص/);
  const total = cut.v[0].items.reduce((s, c) => s + c._end - c._start, 0);
  assert.ok(Math.abs(total - (8.5 - r.removedSeconds)) < 0.1, `${total} vs ${r.removedSeconds}`);
  assert.ok(r.removedSeconds > 1.9 && r.removedSeconds < 2.2, String(r.removedSeconds));
  assert.deepEqual(spans(cut.a[0]), spans(cut.v[0]));
  assert.ok(r.crossfades >= 2);
});

test('التفريغ + الكابشن + التكرار + البحث + الفصول end-to-end', async () => {
  process.env.FAKE_WHISPER_WORDS = 'النهارده هنتكلم عن المونتاج النهارده هنتكلم عن المونتاج السريع انا انا جاهز';
  const f = makeAudio('talk2.wav', [{ tone: 250, dur: 6 }]);
  const { S, h } = world({ clipFile: f, clipLen: 6, settings: { keys: { openrouter: '' } } });
  const t = await S.transcribe({ dialect: 'egyptian' });
  assert.equal(t.words.length, 12);
  assert.equal(t.words[9].text, 'أنا', 'spell-fixed');
  const c = await S.addCaptions({ maxWords: 3 });
  assert.ok(c.cues >= 4);
  assert.match(fs.readFileSync(c.file, 'utf8'), /00:00:00,000 --> /);
  assert.equal(h.pr.project.activeSeq.captionTracks.length, 1);
  const hits = await S.search('المونتاج السريع');
  assert.equal(hits.length, 1);
  const ch = await S.chapters({ offline: true, addMarkers: true });
  assert.equal(ch.chapters[0].time, 0);
  const dry = await S.removeRepeats({ dryRun: true });
  assert.ok(dry.found >= 2, JSON.stringify(dry));
  const rr = await S.removeRepeats();
  assert.match(rr.sequence, /بدون تكرار/);
  delete process.env.FAKE_WHISPER_WORDS;
});

test('المالتي كام: analyse two mics then apply the plan', async () => {
  const a = makeAudio('mA.wav', [{ tone: 220, dur: 4, amp: 0.6 }, { tone: 220, dur: 4, amp: 0.02 }]);
  const b = makeAudio('mB.wav', [{ tone: 330, dur: 4, amp: 0.02 }, { tone: 330, dur: 4, amp: 0.6 }]);
  const { S, h, seq } = world();
  const A = h.pr.project.importOne(a, h.pr.project.root), B = h.pr.project.importOne(b, h.pr.project.root);
  seq.v[0].add({ projectItem: A, start: 0, end: 8 }); seq.v[1].add({ projectItem: B, start: 0, end: 8 });
  seq.a[0].add({ projectItem: A, start: 0, end: 8 }); seq.a[1].add({ projectItem: B, start: 0, end: 8 });
  const plan = await S.multicamAnalyze({ minShot: 1.5 });
  assert.deepEqual(plan.plan.map(p => p.trackIndex), [0, 1]);
  const r = await S.multicamApply(plan);
  assert.equal(r.switches, 1);
  const cut = h.pr.project.activeSeq;
  assert.deepEqual(cut.v[1].items.slice().sort((x, y) => x._start - y._start).map(c => c.disabled), [true, false]);
});

test('ماركرز على الإيقاع: 120 BPM music → markers every beat', async () => {
  const music = makeClicks('music.wav', 120, 8);
  const { S, h, seq } = world();
  seq.a[2].add({ projectItem: h.pr.project.importOne(music, h.pr.project.root), start: 2, end: 10 });
  const r = await S.beatMarkers({});
  assert.ok(Math.abs(r.bpm - 120) < 3); assert.ok(r.markers >= 14 && r.markers <= 18, String(r.markers));
  assert.ok(seq.markerList.every(m => m.start.seconds >= 2));
});

test('قوالب الحركة + التايتلات (MOGRT) + المشاهد المتحركة', async () => {
  const f = makeAudio('v.wav', [{ tone: 200, dur: 5 }]);
  const mogrt = path.join(TMP, 'Basic Title.mogrt'); fs.writeFileSync(mogrt, 'x');
  const { S, seq } = world({ clipFile: f, clipLen: 5, settings: { paths: { ...config.DEFAULTS.paths, whisper: FAKE_WHISPER, whisperModel: MODEL, baseMogrt: mogrt } } });
  seq.player = 1;
  const m = await S.applyMotion({ preset: 'zoom-in-reveal', level: 3 });
  assert.equal(m.component, 'Transform'); assert.ok(m.keys > 5); assert.equal(m.start, 0);
  const t = await S.addTitle({ template: 'lower-third', text: 'محمد أيمن', duration: 3 });
  assert.equal(t.mode, 'mogrt'); assert.equal(t.editable, true);
  const gclip = seq.v[t.track].items.find(c => c._start === 1);
  assert.equal(JSON.parse(gclip.mgtComp.props[0].value).textEditValue, 'محمد أيمن');
  const motionComp = gclip.comps.find(c => c.matchName === 'AE.ADBE Geometry2');
  assert.ok(motionComp.props.find(p => p.displayName === 'Position').keys.length >= 4, 'in + out keys');
  // no base MOGRT → rendered transparent video fallback
  S.saveSettings({ paths: { baseMogrt: '' } });
  S.findBaseMogrt = () => null;
  const t2 = await S.addTitle({ template: 'big-center', text: 'هوك', duration: 2 });
  assert.equal(t2.mode, 'rendered'); assert.match(t2.file, /\.mov$/);
  const sc = await S.buildScene({ spec: { duration: 3, background: { type: 'gradient' }, layers: [{ text: 'اسم القناة', color: 'accent' }] }, time: 0 });
  assert.match(sc.file, /scene-.*\.mp4$/); assert.ok(fs.existsSync(sc.file));
});

test('المؤثرات الصوتية + المؤثرات التلقائية + B-Roll (mocked APIs) land on the timeline', async () => {
  const f = makeAudio('v2.wav', [{ tone: 200, dur: 6 }]);
  process.env.FAKE_WHISPER_WORDS = 'وفجأة حصلت مفاجأة كبيرة جدا';
  const fetchImpl = async (url, opts = {}) => {
    if (url.includes('openrouter')) {
      const body = JSON.parse(opts.body);
      const sys = txt(body.messages[0].content);
      if (/مؤثر|المؤثرات/.test(sys)) return mockResponse({ choices: [{ message: { content: JSON.stringify({ effects: [{ time: 0.8, type: 'sfx', prompt: 'dramatic hit', reason: 'مفاجأة' }, { time: 1.6, type: 'motion', preset: 'punch-in' }] }) } }] });
      return mockResponse({ choices: [{ message: { content: 'city at night' } }] });
    }
    if (url.includes('elevenlabs')) return mockResponse(Buffer.from('ID3'));
    if (url.includes('api.pexels.com')) return mockResponse({ videos: [{ id: 1, image: 'i', duration: 8, video_files: [{ link: 'https://cdn/v.mp4', file_type: 'video/mp4', width: 1920, height: 1080 }] }] });
    if (url.includes('cdn/v.mp4')) return mockResponse(Buffer.from('MP4'));
    throw new Error('unexpected ' + url);
  };
  const { S, seq } = world({ clipFile: f, clipLen: 6, fetchImpl });
  const one = await S.generateSfx({ prompt: 'ووش', place: true, time: 2 });
  assert.equal(one.prompt, 'city at night'); // translated via OpenRouter (mock answer)
  assert.ok(one.placed.track >= 1);
  const fx = await S.autoEffects({ density: 'high' });
  assert.equal(fx.applied, 2, JSON.stringify(fx));
  const audioClips = seq.a.flatMap(t => t.items).filter(c => /\.mp3$/.test(c.projectItem.mediaPath));
  assert.equal(audioClips.length, 2);
  const br = await S.brollSearch({ q: 'مدينة بالليل', sources: ['pexels'] });
  assert.equal(br.query, 'city at night'); assert.equal(br.results.length, 1);
  const placed = await S.brollPlace({ id: br.results[0].id, time: 1, duration: 3 });
  assert.equal(placed.track, 1); assert.equal(placed.end, 4);
  delete process.env.FAKE_WHISPER_WORDS;
});

test('المكتبة + تنظيم المشروع through the host', async () => {
  const lib = path.join(TMP, 'lib2'); fs.mkdirSync(path.join(lib, 'SFX'), { recursive: true });
  fs.writeFileSync(path.join(lib, 'SFX', 'whoosh 1.wav'), 'x');
  const { S, h, seq } = world();
  const r = await S.libraryAdd([lib]);
  assert.equal(r.added, 1);
  const item = S.librarySearch({ category: 'sfx' })[0];
  const p = await S.libraryPlace({ id: item.id, time: 3 });
  assert.equal(seq.a[p.track].items[0]._start, 3);
  h.pr.project.importOne('/x/clip.mp4', h.pr.project.root);
  const plan = await S.organizePlan();
  assert.ok(plan.moves.find(m => m.name === 'clip.mp4' && m.to === 'فيديو'));
  const done = await S.organizeApply(plan);
  assert.equal(done.moved, plan.moves.length);
  assert.equal((await S.organizePlan()).moves.length, 0, 'idempotent');
});

test('EditFast AI agent: OpenRouter tool loop, asks taste once, stays in scope, edits the timeline', async () => {
  const f = makeAudio('agent.wav', [{ tone: 300, dur: 2 }, { silence: 1.2 }, { tone: 300, dur: 2 }]);
  const script = [
    { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_project_state', arguments: '{}' } }, { id: 'c2', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: 'ألوانك إيه؟', options: ['بنفسجي وأصفر', 'أحمر وأبيض'] }) } }] },
    { tool_calls: [{ id: 'c3', type: 'function', function: { name: 'save_style', arguments: JSON.stringify({ style: { primary: '#7C5CFF', accent: '#FFD84D', pace: 'fast' } }) } }] },
    { tool_calls: [{ id: 'c4', type: 'function', function: { name: 'remove_silences', arguments: JSON.stringify({ sensitivity: 5 }) } }] },
    { tool_calls: [{ id: 'c5', type: 'function', function: { name: 'build_scene', arguments: JSON.stringify({ time: 0, spec: { duration: 3, layers: [{ text: 'قناة EditFast', color: 'accent', in: 'pop' }] } }) } }, { id: 'c6', type: 'function', function: { name: 'apply_motion', arguments: JSON.stringify({ preset: 'does-not-exist', time: 1 }) } }] },
    { content: 'خلصت: شلت السكتات وبنيت المشهد الافتتاحي.' }
  ];
  const requests = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body); requests.push(body);
    const step = script[requests.length - 1];
    return mockResponse({ choices: [{ message: { role: 'assistant', content: step.content || null, tool_calls: step.tool_calls }, finish_reason: step.tool_calls ? 'tool_calls' : 'stop' }] });
  };
  const { S, h } = world({ clipFile: f, clipLen: 5.2, fetchImpl, settings: { models: { agent_max: 'anthropic/claude-opus-5.5' } } });
  S.askUserImpl = async (q, opts) => { assert.equal(q, 'ألوانك إيه؟'); return opts[0]; };
  const events = [];
  const agent = new EditFastAgent({ llm: S.llm, model: S.model('agent_max'), services: S, level: 'max', events: { onTool: n => events.push('tool:' + n), onToolResult: (n, r) => events.push((r.ok ? 'ok:' : 'fail:') + n), onText: t => events.push('text') } });
  const out = await agent.send('اعمل مشهد افتتاحي باسم القناة وشيل السكتات');
  assert.equal(out.text, 'خلصت: شلت السكتات وبنيت المشهد الافتتاحي.');
  assert.equal(requests[0].model, 'anthropic/claude-opus-5.5');
  assert.match(txt(requests[0].messages[0].content), /شغلتك الوحيدة/);
  assert.match(txt(requests[0].messages[0].content), /اسأله مرة واحدة/);
  assert.ok(requests[0].tools.length >= 20);
  assert.deepEqual(events.filter(e => e.startsWith('ok:') || e.startsWith('fail:')), ['ok:get_project_state', 'ok:ask_user', 'ok:save_style', 'ok:remove_silences', 'ok:build_scene', 'fail:apply_motion']);
  const toolMsg = requests[1].messages.find(m => m.role === 'tool' && m.tool_call_id === 'c2');
  assert.match(toolMsg.content, /بنفسجي وأصفر/);
  assert.equal(config.load().style.accent, '#FFD84D');
  assert.match(h.pr.project.activeSeq.name, /قص/);
  assert.ok(h.pr.project.activeSeq.v.some(t => t.items.some(c => /scene-/.test(c.projectItem.mediaPath))));
  // a new agent now has the saved taste in its system prompt and won't ask again
  const a2 = new EditFastAgent({ llm: S.llm, model: 'x', services: S, style: config.load().style });
  assert.match(txt(a2.messages[0].content), /ذوق المونتير محفوظ/);
});

test('AI sees the sequence: live snapshot (clips, playhead, selection, markers, effects, transcript near playhead)', async () => {
  process.env.FAKE_WHISPER_WORDS = 'أهلا بيكم النهارده هنتكلم عن الإضاءة في التصوير';
  const f = makeAudio('snap.wav', [{ tone: 250, dur: 6 }]);
  const { S, seq, h } = world({ clipFile: f, clipLen: 6 });
  seq.v[1].add({ projectItem: h.pr.project.importOne('/m/broll-city.mp4', h.pr.project.root), start: 1, end: 3 });
  seq.player = 2;
  await S.applyMotion({ preset: 'punch-in', level: 2, time: 2 });
  seq.v[1].items[0].selected = true;
  await S.addMarkers([{ time: 4, name: 'هنا الإضاءة' }]);
  await S.transcribe({});
  const snap = await S.sequenceSnapshot();
  assert.match(snap, /السيكوينس: "Main"/);
  assert.match(snap, /رأس التشغيل عند 0:02\.0/);
  assert.match(snap, /V2: "broll-city\.mp4" 0:01\.0–0:03\.0 \{Transform\}/, snap);
  assert.match(snap, /تحت رأس التشغيل: V2 "broll-city\.mp4"، V1/);
  assert.match(snap, /المختار: V2 "broll-city\.mp4"/);
  assert.match(snap, /ماركرز \(1\): 0:04\.0 هنا الإضاءة/);
  assert.match(snap, /التفريغ \(8 كلمة/);
  assert.match(snap, /الإضاءة في التصوير/);
  // tight budget: keeps the sentences closest to the playhead and marks the gaps
  const tiny = await S.sequenceSnapshot({ maxChars: 600 });
  assert.ok(tiny.length < 900);
  delete process.env.FAKE_WHISPER_WORDS;
});

test('AI answers questions about the sequence straight from the snapshot without editing', async () => {
  process.env.FAKE_WHISPER_WORDS = 'السعر النهارده ميتين جنيه بس';
  const f = makeAudio('qa.wav', [{ tone: 250, dur: 4 }]);
  const requests = [];
  const fetchImpl = async (url, opts) => { requests.push(JSON.parse(opts.body)); return mockResponse({ choices: [{ message: { content: 'قال إن السعر ميتين جنيه عند 0:01.' }, finish_reason: 'stop' }] }); };
  const { S, calls } = world({ clipFile: f, clipLen: 4, fetchImpl });
  await S.transcribe({});
  calls.length = 0; requests.length = 0;
  const agent = new EditFastAgent({ llm: S.llm, model: 'm', services: S, style: { primary: '#fff' } });
  const out = await agent.send('هو قال السعر كام؟');
  assert.match(out.text, /ميتين/);
  const user = txt(requests[0].messages.find(m => m.role === 'user').content);
  assert.match(user, /^<sequence_now>/);
  assert.match(user, /السعر النهارده ميتين جنيه بس/);
  assert.match(user, /هو قال السعر كام؟$/);
  assert.match(txt(requests[0].messages[0].content), /جاوب منها على طول/);
  assert.deepEqual(calls.filter(c => !['sequenceInfo'].includes(c)), [], 'no editing calls');
  delete process.env.FAKE_WHISPER_WORDS;
});

test('test every AI model: reply + tool calling for the editor models, catalog check, errors reported', async () => {
  const seen = [];
  const fetchImpl = async (url, opts = {}) => {
    if (url.endsWith('/models')) return mockResponse({ data: [{ id: 'good/tools' }, { id: 'good/text' }] });
    const b = JSON.parse(opts.body); seen.push(b.model);
    if (b.model === 'broken/model') return mockResponse({ error: { message: 'No endpoints found' } }, { status: 404 });
    if (b.tools) return mockResponse({ choices: [{ message: { content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'set_playhead', arguments: '{"time":12}' } }] } }] });
    return mockResponse({ choices: [{ message: { content: 'تمام' } }] });
  };
  const { S } = world({ fetchImpl, settings: { defaultModel: 'good/text', models: { agent_strong: 'good/tools', agent_max: 'good/tools', chapters: 'broken/model' } } });
  const live = [];
  const res = await S.testModels({ onResult: r => live.push(r.feature) });
  assert.equal(res.length, 8); assert.equal(live.length, 8);
  const by = Object.fromEntries(res.map(r => [r.feature, r]));
  assert.equal(by.agent_strong.ok, true); assert.equal(by.agent_strong.tools, true); assert.match(by.agent_strong.reply, /set_playhead/);
  assert.equal(by.sfx_translate.ok, true); assert.equal(by.sfx_translate.tools, null); assert.equal(by.sfx_translate.listed, true);
  assert.equal(by.chapters.ok, false); assert.match(by.chapters.error, /404/); assert.equal(by.chapters.listed, false);
  assert.ok(seen.includes('broken/model'));
});

test('Liquid Glass: reads the footage under the playhead, renders, places the layer right above it (and the AI can do it)', async () => {
  const f = makeAudio('glassv.wav', [{ tone: 200, dur: 6 }]);
  const jobs = [];
  const renderGlass = async job => { jobs.push(job); fs.writeFileSync(job.out, 'prores'); return job.out; };
  const { S, h, seq } = world({ clipFile: f, clipLen: 6 });
  S.renderGlassImpl = renderGlass;
  // clip on V2 too: glass must go above the TOPMOST picture at the playhead
  seq.v[1].add({ projectItem: h.pr.project.importOne('/m/broll.mp4', h.pr.project.root), start: 2, end: 5, inPoint: 10 });
  seq.player = 3;
  const r = await S.liquidGlass({ params: { preset: 'pill', label: 'اشترك', duration: 4 } });
  assert.equal(jobs[0].src.mediaPath, '/m/broll.mp4');
  assert.equal(jobs[0].src.start, 11);          // inPoint 10 + (3 - 2)
  assert.equal(jobs[0].params.duration, 2);     // clipped to the end of the B-roll (5 - 3)
  assert.equal(jobs[0].params.label, 'اشترك'); assert.equal(jobs[0].width, 1920); assert.equal(jobs[0].fps, 25);
  assert.equal(r.track, 2); assert.equal(r.source, 'broll.mp4');
  assert.ok(seq.v[2].items.find(c => /glass-[0-9a-f]+\.mov$/.test(c.projectItem.mediaPath) && c._start === 3 && c._end === 5));
  // a second glass at the same spot ignores the first glass layer as its source
  const r2 = await S.liquidGlass({ params: { preset: 'lens', duration: 1 } });
  assert.equal(jobs[1].src.mediaPath, '/m/broll.mp4'); assert.equal(r2.track, 3);
  // no footage → glass over nothing (frosted only)
  seq.player = 20;
  await S.liquidGlass({ params: { preset: 'card' } });
  assert.equal(jobs[2].src, null);
  // the AI editor's tool
  seq.player = 1;
  const agent = new EditFastAgent({ llm: { chat: async () => ({}) }, model: 'm', services: S, style: {} });
  const res = await agent.callTool('liquid_glass', { preset: 'glass-text', text: 'محمد', time: 1, duration: 3, anim_in: 'pop' });
  assert.equal(jobs[3].params.text, 'محمد'); assert.equal(jobs[3].params.animIn, 'pop'); assert.equal(jobs[3].src.start, 1);
  assert.equal(res.track, 4, 'V2–V4 are busy at 1–4s → a new track on top'); 
});

test('AI vision: the agent asks to look, gets real frames from the timeline as images, then answers', async () => {
  const vid = path.join(require('../helpers').TMP, 'vis.mp4');
  require('child_process').execFileSync(require('../helpers').FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-t', '2', '-i', 'color=c=red:s=320x180:r=25', '-f', 'lavfi', '-t', '2', '-i', 'color=c=blue:s=320x180:r=25', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', vid]);
  const requests = [];
  const script = [
    { tool_calls: [{ id: 'v1', type: 'function', function: { name: 'look_at_frames', arguments: '{"times":[1,3]}' } }] },
    { content: 'أول لقطة حمرا والتانية زرقا.' }
  ];
  const fetchImpl = async (url, opts) => { requests.push(JSON.parse(opts.body)); const st = script[requests.length - 1]; return mockResponse({ choices: [{ message: { content: st.content || null, tool_calls: st.tool_calls } }] }); };
  const { S, h, seq } = world({ fetchImpl });
  seq.v[0].add({ projectItem: h.pr.project.importOne(vid, h.pr.project.root), start: 10, end: 14, inPoint: 0 });
  const agent = new EditFastAgent({ llm: S.llm, model: 'vision-model', services: S, style: {} });
  const out = await agent.send('اللقطات لونها إيه؟');
  assert.match(out.text, /حمرا/);
  const second = requests[1].messages;
  const tool = second.find(m => m.role === 'tool');
  assert.match(tool.content, /"frames":0|"frames":2/);
  // times 1 and 3 are before the clip (it starts at 10) → nothing; ask again inside the clip
  const frames = await S.lookAtFrames({ times: [11, 13] });
  assert.equal(frames.length, 2); assert.equal(frames[0].clip, 'vis.mp4');
  const shots = await S.shots();
  assert.ok(shots.includes(10) && shots.some(t => Math.abs(t - 12) < 0.1), JSON.stringify(shots));
  const snap = await S.sequenceSnapshot();
  assert.match(snap, /تغيير لقطات/);
  // inside the clip → images are attached as a user message right after the tool result
  requests.length = 0; script.splice(0, 2, { tool_calls: [{ id: 'v2', type: 'function', function: { name: 'look_at_frames', arguments: '{"times":[11,13]}' } }] }, { content: 'تمام' });
  await agent.send('بص تاني');
  const msgs = requests[1].messages, last = msgs[msgs.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content.filter(c => c.type === 'image_url').length, 2);
  assert.match(last.content[0].text, /11\.0s/);
});

test('history + undo: placed clips, markers and cut copies are recorded and undone', async () => {
  const f = makeAudio('hist.wav', [{ tone: 300, dur: 2 }, { silence: 1.2 }, { tone: 300, dur: 2 }]);
  const { S, h, seq } = world({ clipFile: f, clipLen: 5.2 });
  const orig = h.pr.project.activeSeq;
  await S.op('B-Roll', () => S.host('placeFile', { path: '/c/b.mp4', time: 1, kind: 'video', duration: 2 }));
  await S.addMarkers([{ time: 3, name: 'هنا' }]);
  assert.equal(S.history.length, 2);
  let r = await S.undoLast();
  assert.equal(r.undone, 1); assert.equal(seq.markerList.length, 0);
  r = await S.undoLast();
  assert.equal(r.group, 'B-Roll'); assert.equal(seq.v[1].items.length, 0, 'placed clip removed');
  await S.quickCut({ sensitivity: 5 });
  assert.notEqual(h.pr.project.activeSeq, orig);
  r = await S.undoLast();
  assert.equal(h.pr.project.activeSeq, orig, 'back on the original sequence');
  assert.match((await S.undoLast()).message, /مفيش/);
  // something that can't be undone through the API is reported, not hidden
  await S.applyMotion({ preset: 'pulse', time: 1 });
  r = await S.undoLast();
  assert.deepEqual(r.manual, ['applyKeyframes']); assert.match(r.message, /Ctrl\+Z/);
});

test('one-click auto edit: runs the approved steps in order, AI picks the hook, everything undoes in one go', async () => {
  process.env.FAKE_WHISPER_WORDS = 'النهارده هنتكلم عن المونتاج النهارده هنتكلم عن المونتاج السريع والنتيجة هتبهرك';
  const f = makeAudio('auto.wav', [{ tone: 300, dur: 3 }, { silence: 1.2 }, { tone: 300, dur: 3 }]);
  const fetchImpl = async (url, opts) => {
    const b = JSON.parse(opts.body), sys = txt(b.messages[0].content);
    if (/أقوى جملة/.test(sys)) return mockResponse({ choices: [{ message: { content: '{"start":3.2,"end":4.4,"reason":"وعد بنتيجة"}' } }] });
    if (/المؤثرات/.test(sys)) return mockResponse({ choices: [{ message: { content: '{"effects":[{"time":1,"type":"motion","preset":"punch-in"}]}' } }] });
    return mockResponse({ choices: [{ message: { content: '{"words":[]}' } }] });
  };
  const { S, h } = world({ clipFile: f, clipLen: 7.2, fetchImpl });
  const orig = h.pr.project.activeSeq;
  const steps = S.autoEditSteps();
  assert.ok(steps.find(s => s.id === 'hook' && s.ai));
  const run = steps.map(s => ({ ...s, on: ['transcribe', 'repeats', 'silences', 'hook', 'zooms', 'captions'].includes(s.id) }));
  const events = [];
  const res = await S.runAutoEdit(run, e => events.push(e.id + ':' + e.status));
  assert.deepEqual(Object.keys(res).filter(k => res[k].ok), ['transcribe', 'repeats', 'silences', 'hook', 'zooms', 'captions'], JSON.stringify(res));
  assert.ok(events.indexOf('transcribe:ok') < events.indexOf('hook:run'));
  assert.ok(events.includes('broll:skip'));
  assert.match(h.pr.project.activeSeq.name, /هوك/);
  assert.ok(S.history.every(e => e.group === 'مونتاج تلقائي'));
  const u = await S.undoLast();
  assert.equal(u.group, 'مونتاج تلقائي');
  assert.equal(h.pr.project.activeSeq, orig, 'the whole auto edit is undone back to the original sequence');
  delete process.env.FAKE_WHISPER_WORDS;
});

test('reels + shorts: reframe every V1 clip into a new vertical sequence; AI picks shorts and builds them', async () => {
  process.env.FAKE_WHISPER_WORDS = Array.from({ length: 40 }, (_, i) => 'كلمة' + i).join(' ');
  const src = path.join(require('../helpers').TMP, 'wide2.mp4');
  require('child_process').execFileSync(require('../helpers').FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=20:r=25', '-f', 'lavfi', '-i', 'sine=f=300:d=20', '-shortest', '-pix_fmt', 'yuv420p', src]);
  const fetchImpl = async (url, opts) => {
    const sys = txt(JSON.parse(opts.body).messages[0].content);
    if (/شورتس/.test(sys)) return mockResponse({ choices: [{ message: { content: JSON.stringify({ shorts: [{ start: 2, end: 14, title: 'أقوى لحظة', score: 9 }, { start: 3, end: 10, title: 'متداخل', score: 7 }, { start: 0, end: 1, title: 'قصير', score: 8 }] }) } }] });
    return mockResponse({ choices: [{ message: { content: '{"words":[]}' } }] });
  };
  const { S, h, seq } = world({ fetchImpl });
  const item = h.pr.project.importOne(src, h.pr.project.root);
  seq.v[0].add({ projectItem: item, start: 0, end: 8, inPoint: 0 }); seq.v[0].add({ projectItem: item, start: 8, end: 16, inPoint: 10 });
  seq.a[0].add({ projectItem: item, start: 0, end: 16, inPoint: 0 });
  const jobs = [];
  S.analyzeFacesImpl = async job => { jobs.push(job); return Array.from({ length: Math.round(job.duration * 3) }, (_, i) => ({ t: i / 3, faces: [{ cx: 0.7, cy: 0.4, w: 0.1, h: 0.2, score: 0.9 }] })); };
  const prog = [];
  const r = await S.makeReels({ ratio: '9:16', onProgress: p => prog.push(p) });
  assert.equal(jobs.length, 2); assert.equal(jobs[1].start, 10); assert.equal(jobs[0].srcW, 640);
  assert.match(r.name, /ريلز 9:16/); assert.equal(r.clips, 2);
  const reels = h.pr.project.activeSeq;
  assert.equal(reels.v[0].items.length, 2); assert.equal(reels.v[0].items.slice().sort((a, b) => a._start - b._start)[1]._start, 8);
  assert.ok(reels.v[0].items.every(c => /reel-[0-9a-f]+\.mp4$/.test(c.projectItem.mediaPath)));
  assert.ok(prog.length && prog[prog.length - 1] === 1);
  // shorts
  h.pr.project.activeSeq = seq;
  const shorts = await S.findShorts({ count: 3 });
  assert.deepEqual(shorts.map(s => s.title), ['أقوى لحظة'], 'overlapping and too-short picks dropped');
  const made = await S.makeShort(shorts[0], { reframe: false, captions: false });
  assert.match(made.sequence, /Short - أقوى لحظة/); assert.equal(made.length, 12);
  const sh = h.pr.project.activeSeq;
  const total = sh.v[0].items.reduce((a, c) => a + c._end - c._start, 0);
  assert.ok(Math.abs(total - 12) < 0.1, 'only the chosen 12s remain: ' + total);
  delete process.env.FAKE_WHISPER_WORDS;
});

test('animated captions + translation: cards rendered with word timings, placed above the video, undone together; SRT translated', async () => {
  process.env.FAKE_WHISPER_WORDS = 'أهلا بيكم في حلقة جديدة عن المونتاج السريع جدا';
  const f = makeAudio('capv.wav', [{ tone: 250, dur: 5 }]);
  const fetchImpl = async (url, opts) => {
    const b = JSON.parse(opts.body); const sys = txt(b.messages[0].content);
    if (/Translate each subtitle/.test(sys)) { const lines = JSON.parse(b.messages[1].content); return mockResponse({ choices: [{ message: { content: JSON.stringify({ lines: lines.map(l => 'EN: ' + l.length) }) } }] }); }
    return mockResponse({ choices: [{ message: { content: '{"words":[]}' } }] });
  };
  const { S, seq } = world({ clipFile: f, clipLen: 5, fetchImpl });
  seq.v[1].add({ projectItem: seq.v[0].items[0].projectItem, start: 0, end: 1 });
  const jobs = [];
  S.renderCaptionsImpl = async job => { jobs.push(job); return job.cues.map((c, i) => { const file = path.join(job.outDir, `cap-${job.hash}-${i}.mov`); fs.writeFileSync(file, 'x'); return { file, start: c.start, end: c.end }; }); };
  const r = await S.addAnimatedCaptions({ style: { style: 'karaoke' } });
  assert.equal(jobs[0].style.style, 'karaoke'); assert.equal(jobs[0].width, 1920);
  assert.ok(jobs[0].cues.every(c => Array.isArray(c.words) && c.words.length && c.words[0].start >= c.start - 1e-6), 'word timings kept for sync');
  assert.equal(r.clips, jobs[0].cues.length);
  const capTrack = seq.v.findIndex(t => t.items.some(c => /cap-/.test(c.projectItem.mediaPath)));
  assert.ok(capTrack >= 2, 'above the topmost used track (V2)');
  assert.ok(S.history.every(e => e.group === 'كابشن متحرك'));
  const u = await S.undoLast();
  assert.equal(u.undone, r.clips); assert.ok(!seq.v.some(t => t.items.some(c => /cap-/.test(c.projectItem.mediaPath))), 'all caption cards removed');
  const tr = await S.translateCaptions({ lang: 'English' });
  assert.match(fs.readFileSync(tr.file, 'utf8'), /EN: \d+/); assert.equal(seq.captionTracks.length, 1);
  delete process.env.FAKE_WHISPER_WORDS;
});

test('audio: clean voice onto a new track (original muted), duck the music under speech, undo restores', async () => {
  const voice = makeAudio('voice.wav', [{ tone: 220, dur: 2 }, { silence: 2 }, { tone: 220, dur: 2 }]);
  const music = makeAudio('music-bed.wav', [{ tone: 440, dur: 6, amp: 0.2 }]);
  const { S, h, seq } = world();
  const v = h.pr.project.importOne(voice, h.pr.project.root), m = h.pr.project.importOne(music, h.pr.project.root);
  seq.a[0].add({ projectItem: v, start: 0, end: 6 }); seq.a[1].add({ projectItem: m, start: 0, end: 6 });
  const g = await S.audioTracksGuess();
  assert.deepEqual([g.voice, g.music], [0, 1], 'music track recognised by name');
  const c = await S.cleanAudio({ strength: 'light' });
  assert.equal(c.clips, 1); assert.equal(seq.a[0].muted, true);
  assert.ok(seq.a[2].items.some(x => /clean-[0-9a-f]+\.wav$/.test(x.projectItem.mediaPath)), 'clean copy on A3');
  await S.undoLast();
  assert.equal(seq.a[0].muted, false); assert.equal(seq.a[2].items.length, 0);
  const d = await S.duckMusic({ duckDb: -12 });
  assert.equal(d.speech, 2); assert.ok(d.keys >= 6);
  const lvl = seq.a[1].items[0].comps[0].props[1];
  const db = v => 20 * Math.log10(v) + 15;
  const ducked = lvl.keys.filter(k => Math.abs(db(k.v) + 12) < 0.2);
  assert.ok(ducked.length >= 4, 'ducked to -12 dB under both sentences');
  assert.ok(ducked.some(k => k.t >= 0 && k.t <= 2.2) && ducked.some(k => k.t >= 3.8 && k.t <= 6.1), 'keys line up with the speech: ' + lvl.keys.map(k => k.t + ':' + db(k.v).toFixed(0)).join(' '));
  assert.ok(lvl.keys.some(k => Math.abs(db(k.v)) < 0.2), 'back to 0 dB in the gap');
});

test('thumbnails: candidates prefer sharp well-lit frames over blurry/dark ones; AI ideas get the images; PNG saved next to the project', async () => {
  const H = require('../helpers');
  const vid = path.join(H.TMP, 'thumbsrc.mp4');
  // 0-3s dark, 3-6s very blurry, 6-9s sharp detailed
  require('child_process').execFileSync(H.FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=3:r=25', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=3:r=25', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=3:r=25',
    '-filter_complex', '[0:v]eq=brightness=-0.75[a];[1:v]gblur=sigma=25[b];[a][b][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', vid]);
  const reqs = [];
  const fetchImpl = async (url, opts) => { reqs.push(JSON.parse(opts.body)); return mockResponse({ choices: [{ message: { content: JSON.stringify({ titles: [{ text: 'السر اللي محدش قالهولك', highlight: 'السر' }], best: 0 }) } }] }); };
  const { S, h, seq, calls } = world({ fetchImpl });
  seq.v[0].add({ projectItem: h.pr.project.importOne(vid, h.pr.project.root), start: 0, end: 9 });
  const c = await S.thumbnailCandidates({ count: 3, samples: 12 });
  assert.ok(c[0].time >= 6, 'best frame comes from the sharp part: ' + c.map(x => x.time + ':' + x.score.toFixed(2)).join(' '));
  assert.ok(c.every(x => fs.existsSync(x.image)));
  const ideas = await S.thumbnailIdeas({ candidates: c });
  assert.equal(ideas.titles[0].highlight, 'السر');
  assert.equal(reqs[0].messages[1].content.filter(p => p.type === 'image_url').length, c.length);
  h.pr.app.project.path = path.join(H.TMP, 'proj', 'My Video.prproj');
  fs.mkdirSync(path.dirname(h.pr.app.project.path), { recursive: true });
  const file = await S.saveThumbnail(Buffer.from('PNGDATA').toString('base64'), 'السر اللي محدش قالهولك');
  assert.match(file, /EditFast Thumbnails/); assert.equal(fs.readFileSync(file, 'utf8'), 'PNGDATA');
  assert.ok(calls.includes('importFiles'));
});

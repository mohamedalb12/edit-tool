'use strict';
// 1.4: client revisions, transcription accuracy, downloader trim, clear AI errors, offline SFX matching.
const { TMP, FFMPEG, FFPROBE, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../../core/revisions');
const T = require('../../core/transcribe');
const Y = require('../../core/ytdlp');
const sfx = require('../../core/sfx');
const pack = require('../../core/sfxPack');
const { OpenRouter, friendly } = require('../../core/openrouter');

test('revisions: time refs in many forms', () => {
  assert.equal(R.parseTimeRef('شيل اللي عند 1:20'), 80);
  assert.equal(R.parseTimeRef('في 01:02:03'), 3723);
  assert.equal(R.parseTimeRef('دقيقة 2 فيها غلطة'), 120);
  assert.equal(R.parseTimeRef('الثانية 45'), 45);
  assert.equal(R.parseTimeRef('min 1.5'), 90);
  assert.equal(R.parseTimeRef('مفيش وقت هنا'), null);
});

test('revisions: offline split → one task per line/number/sentence, with type and time', () => {
  const items = R.splitOffline('- شيل الجزء اللي عند 1:20\n• المزيكا عالية شوية\n1- غيّر لون العنوان للأحمر 2- زوّد ساوند افيكت في الأول\nالكابشن فيه غلطة. خلي الإيقاع أسرع.');
  assert.deepEqual(items.map(x => x.type), ['cut', 'music', 'color', 'sfx', 'text', 'speed']);
  assert.equal(items[0].time, 80); assert.equal(items[1].time, null);
  assert.ok(items.every(x => x.done === false && /^r\d+$/.test(x.id)));
  assert.equal(new Set(items.map(x => x.id)).size, items.length);
  assert.deepEqual(R.splitOffline(''), []);
});

test('revisions: Egyptian reply lists done ✅ and remaining ⏳; AI split/message use the model', async () => {
  const items = [{ text: 'شيل الجزء', time: 80, done: true }, { text: 'غيّر اللون', time: null, done: false, note: 'أنهي لون؟' }];
  const m = R.messageOffline(items, { name: 'أحمد' });
  assert.match(m, /أهلًا أحمد/); assert.match(m, /✅ شيل الجزء \(عند 1:20\)/); assert.match(m, /⏳ غيّر اللون — أنهي لون؟/);
  assert.match(R.messageOffline(items.map(x => ({ ...x, done: true }))), /النسخة الجديدة جاهزة/);
  const llm = { json: async (o) => { assert.match(o.user, /المزيكا/); return { items: [{ text: 'وطّي المزيكا', time: '30', type: 'music' }, { text: 'غيّر الخط', time: null, type: 'zzz' }, {}] }; },
    text: async (o) => { assert.match(o.user, /\[اتعمل\] وطّي المزيكا \(0:30\)/); return '  تمام ✅  '; } };
  const ai = await R.splitAI(llm, 'm', 'المزيكا عالية عند 0:30');
  assert.equal(ai.length, 2); assert.equal(ai[0].time, 30); assert.equal(ai[1].type, 'text');
  ai[0].done = true;
  assert.equal(await R.messageAI(llm, 'm', ai), 'تمام ✅');
});

test('revisions: saved per project', () => {
  const dir = path.join(TMP, 'rev-' + Date.now());
  assert.deepEqual(R.load(dir, '/p/a.prproj').rounds, []);
  R.save(dir, '/p/a.prproj', { project: '/p/a.prproj', rounds: [{ id: 'x', items: [] }] });
  assert.equal(R.load(dir, '/p/a.prproj').rounds.length, 1);
  assert.equal(R.load(dir, '/p/b.prproj').rounds.length, 0);
});

test('whisper: beam search, all CPU threads and DTW word alignment from the model name', () => {
  assert.equal(T.dtwPreset('/m/ggml-large-v3-turbo-q5_0.bin'), 'large.v3.turbo');
  assert.equal(T.dtwPreset('ggml-base.en.bin'), 'base.en');
  assert.equal(T.dtwPreset('ggml-medium.bin'), 'medium');
  assert.equal(T.dtwPreset('my-model.bin'), null);
  const a = T.buildWhisperArgs({ model: '/m/ggml-small.bin', wav: 'a.wav', outBase: 'o', threads: 6 });
  const s = a.join(' ');
  assert.match(s, /-t 6/); assert.match(s, /-bs 5 -bo 5/); assert.match(s, /-dtw small -ojf/); assert.ok(!a.includes('-oj'));
  const b = T.buildWhisperArgs({ model: '/m/custom.bin', wav: 'a.wav', outBase: 'o', accurate: false });
  assert.ok(!b.includes('-bs') && !b.includes('-dtw') && b.includes('-oj'));
});

test('whisper: DTW token times win over the segment guess; a word ends where the next starts', () => {
  const json = { transcription: [
    { offsets: { from: 0, to: 900 }, text: ' أهلا', tokens: [{ text: ' أهلا', t_dtw: 42 }] },
    { offsets: { from: 900, to: 1500 }, text: ' بيكم', tokens: [{ text: '[_TT_50]', t_dtw: -1 }, { text: ' بيكم', t_dtw: 110 }] }] };
  const w = T.parseWhisperJson(json);
  assert.deepEqual(w.map(x => x.text), ['أهلا', 'بيكم']);
  assert.equal(w[0].start, 0.42); assert.equal(w[0].end, 0.9); assert.equal(w[1].start, 1.1); assert.equal(w[1].end, 1.5);
});

test('whisper: words snapped out of silences (no captions showing up during a pause)', () => {
  const words = [{ text: 'a', start: 0.2, end: 1.0 }, { text: 'b', start: 1.1, end: 2.4 }];
  const r = T.refineWithSilence(words, [{ start: 0.9, end: 1.6 }, { start: 3, end: 3.05 }]);
  assert.equal(r[0].end, 0.9);       // ended inside the pause → ends where it starts
  assert.equal(r[1].start, 1.6);     // started inside the pause → starts when speech returns
  assert.equal(r[1].end, 2.4);
  assert.deepEqual(T.refineWithSilence(words, []), words);
});

test('downloader: "1.00" means 1 minute; trim cuts locally when yt-dlp can\'t cut while downloading', async () => {
  assert.equal(Y.parseTime('1.00'), 60); assert.equal(Y.parseTime('2.30'), 150); assert.equal(Y.parseTime('1:40'), 100);
  assert.equal(Y.parseTime('1.5'), 1.5); assert.equal(Y.parseTime('2.75'), 2.75); assert.equal(Y.parseTime(''), null);
  const src = path.join(TMP, 'trim-src.mp4'), out = path.join(TMP, 'trim-out.mp4');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25', '-f', 'lavfi', '-i', 'sine=f=440', '-t', '6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
  await Y.trim(FFMPEG, src, { start: '0:02', end: '0:04.5', out });
  const d = +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString();
  assert.ok(Math.abs(d - 2.5) < 0.15, 'duration ' + d);
  await assert.rejects(Y.trim(FFMPEG, path.join(TMP, 'nope.mp4'), { start: 1, out }), /القص فشل/);
});

test('ElevenLabs: Key ID rejected before any request, with what to do', () => {
  assert.throws(() => sfx.checkKey(''), /حط مفتاح ElevenLabs/);
  assert.throws(() => sfx.checkKey('abcd1234'), /Key ID.*sk_/s);
  assert.doesNotThrow(() => sfx.checkKey(' sk_live '));
});

test('OpenRouter: clear Arabic errors; 402 retried once with what the key can afford', async () => {
  assert.match(friendly(402, 'This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 25.'), /رصيد OpenRouter مش كفاية \(المفتاح يقدر يصرف 25 توكن بس\).*openrouter\.ai\/settings\/credits/);
  assert.match(friendly(401, 'x'), /مفتاح OpenRouter غلط/);
  assert.match(friendly(404, 'No endpoints found for model x'), /الموديل ده مش موجود/);
  const bodies = [];
  const f = async (url, o) => { const b = JSON.parse(o.body); bodies.push(b); return bodies.length === 1 ? mockResponse({ error: { message: 'can only afford 1200' } }, { status: 402 }) : mockResponse({ choices: [{ message: { content: 'ok' } }] }); };
  const c = new OpenRouter({ apiKey: 'sk-or-1', fetchImpl: f });
  assert.equal((await c.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], maxTokens: 4096 })).content, 'ok');
  assert.equal(bodies[1].max_tokens, 1168); assert.equal(bodies[1]._shrunk, undefined);
  // too little left → no retry, clear message
  const g = async () => mockResponse({ error: { message: 'can only afford 25' } }, { status: 402 });
  await assert.rejects(new OpenRouter({ apiKey: 'k', fetchImpl: g }).chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }), /رصيد OpenRouter مش كفاية/);
});

test('offline SFX pack: a description picks a matching sound (used when there is no ElevenLabs key)', () => {
  assert.match(pack.match('fast whoosh transition'), /whoosh/);
  assert.equal(pack.match('camera shutter'), 'camera-shutter');
  assert.match(pack.match('heavy cinematic impact'), /impact|cinematic-hit/);
  assert.equal(pack.match('qqq zzz'), null);
  assert.equal(pack.match(''), null);
});

test('cost: estimate per feature from the model price (OpenRouter list first, known table as fallback)', () => {
  const C = require('../../core/cost');
  const { FEATURES } = require('../../core/openrouter');
  for (const f of FEATURES) assert.ok(C.PROFILES[f.id], 'profile for ' + f.id);
  const opus = C.estimate('hook', 'anthropic/claude-opus-5.5', []), sonnet = C.estimate('hook', 'anthropic/claude-sonnet-5.5', []);
  assert.ok(opus.low > 0 && opus.high > opus.low); assert.ok(Math.abs(opus.low - sonnet.low * 2) < 1e-9, 'Opus is twice Sonnet');
  assert.ok(C.estimate('agent_max', 'anthropic/claude-opus-5.5', []).low > C.estimate('revisions', 'anthropic/claude-opus-5.5', []).high, 'a long chat costs more than a short task');
  assert.ok(C.estimate('hook', 'anthropic/claude-opus-5.5', [], { minutes: 30 }).low > opus.low * 2.5, 'longer video → more');
  assert.equal(C.estimate('hook', 'x/unknown', []), null);
  const list = [{ id: 'x/cheap', price: { in: 0.1, out: 0.4 } }, { id: 'x/free', price: { in: 0, out: 0 } }];
  assert.ok(C.estimate('hook', 'x/cheap', list).low < 0.01);
  assert.equal(C.fmtRange(C.estimate('hook', 'x/free', list)), 'مجاني');
  assert.equal(C.fmtRange(C.estimate('hook', 'x/cheap', list)), 'أقل من سنت');
  assert.match(C.fmtRange(opus), /^≈ \d+–\d+ سنت$/);
  assert.match(C.fmtRange({ low: 1.2, high: 2.6 }), /^≈ \$1\.20–2\.60$/);
  assert.equal(C.fmtRange(null), 'السعر مش معروف');
  assert.equal(C.fmt(0.004), 'أقل من سنت'); assert.equal(C.fmt(0.42), '42 سنت'); assert.equal(C.fmt(3.5), '$3.50');
});

test('cost: what a request cost (OpenRouter number, else tokens × price with cached tokens cheaper), ledger by day', () => {
  const C = require('../../core/cost');
  assert.equal(C.costOfUsage({ cost: 0.0123 }, 'any', []), 0.0123);
  const u = { prompt_tokens: 100000, completion_tokens: 10000, prompt_tokens_details: { cached_tokens: 80000 } };
  assert.ok(Math.abs(C.costOfUsage(u, 'anthropic/claude-opus-5.5', []) - (20000 * 4 + 80000 * 0.2 + 10000 * 20) / 1e6) < 1e-9);
  const dir = path.join(TMP, 'spend-' + Date.now());
  const d1 = new Date(2026, 9, 5, 12), d2 = new Date(2026, 9, 6, 9);
  C.record(dir, { model: 'm/a', cost: 0.5, tokens: 1000 }, d1);
  C.record(dir, { model: 'm/a', cost: 0.25 }, d2); C.record(dir, { model: 'm/b', cost: 0.75 }, d2);
  const s = C.summary(dir, d2);
  assert.equal(s.today, 1); assert.equal(s.todayCalls, 2); assert.equal(s.month, 1.5); assert.equal(s.monthCalls, 3);
  assert.deepEqual(s.byModel.map(m => m.id), ['m/b', 'm/a']);
  assert.equal(s.last7.length, 7); assert.equal(s.last7[6].cost, 1); assert.equal(s.last7[5].cost, 0.5);
  assert.equal(C.summary(dir, new Date(2026, 10, 1)).month, 0, 'new month starts from zero');
});

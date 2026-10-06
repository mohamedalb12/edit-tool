'use strict';
const { TMP, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { OpenRouter, FEATURES, modelFor, FALLBACK_MODELS } = require('../../core/openrouter');
const sfx = require('../../core/sfx');
const broll = require('../../core/broll');
const autoFx = require('../../core/autoEffects');

function recorder(handler) {
  const calls = [];
  const f = async (url, opts = {}) => { calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null }); return handler(url, opts, calls.length); };
  f.calls = calls; return f;
}

test('openrouter: every AI feature has its own model, user overrides win', () => {
  assert.ok(FEATURES.length >= 8);
  for (const f of ['agent_strong', 'agent_max', 'auto_effects', 'sfx_translate', 'spellfix', 'chapters', 'scene', 'broll']) assert.ok(FEATURES.find(x => x.id === f), f);
  assert.equal(modelFor('agent_max', {}), FEATURES.find(f => f.id === 'agent_max').def);
  assert.equal(modelFor('agent_max', { defaultModel: 'g/x' }), 'g/x');
  assert.equal(modelFor('agent_max', { defaultModel: 'g/x', models: { agent_max: 'openai/gpt-5' } }), 'openai/gpt-5');
  assert.ok(FALLBACK_MODELS.length > 3);
});

test('openrouter: chat request shape, auth headers, tools, retry on 429', async () => {
  const f = recorder((url, o, n) => n === 1 ? mockResponse({ error: { message: 'rate' } }, { status: 429 })
    : mockResponse({ choices: [{ message: { role: 'assistant', content: 'تمام' }, finish_reason: 'stop' }] }));
  const c = new OpenRouter({ apiKey: 'sk-or-1', fetchImpl: f });
  const m = await c.chat({ model: 'anthropic/claude-opus-5.5', messages: [{ role: 'user', content: 'هاي' }], tools: [{ type: 'function', function: { name: 'x', parameters: {} } }] });
  assert.equal(m.content, 'تمام');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(f.calls[1].opts.headers.Authorization, 'Bearer sk-or-1');
  assert.equal(f.calls[1].body.model, 'anthropic/claude-opus-5.5');
  assert.equal(f.calls[1].body.tool_choice, 'auto');
});

test('openrouter: clear errors (no key, 401 not retried), json() parses chatty output', async () => {
  await assert.rejects(new OpenRouter({ fetchImpl: async () => mockResponse({}) }).chat({ model: 'm', messages: [] }), /مفتاح OpenRouter/);
  const f401 = recorder(() => mockResponse({ error: { message: 'bad key' } }, { status: 401 }));
  await assert.rejects(new OpenRouter({ apiKey: 'x', fetchImpl: f401 }).chat({ model: 'm', messages: [] }), /401/);
  assert.equal(f401.calls.length, 1);
  const fj = recorder(() => mockResponse({ choices: [{ message: { content: 'أكيد:\n```json\n{"ok":true}\n```' } }] }));
  assert.deepEqual(await new OpenRouter({ apiKey: 'x', fetchImpl: fj }).json({ model: 'm', user: 'x' }), { ok: true });
  assert.deepEqual(fj.calls[0].body.response_format, { type: 'json_object' });
});

test('openrouter: listModels maps ids, tool support, prices', async () => {
  const f = recorder(() => mockResponse({ data: [{ id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', context_length: 1000000, supported_parameters: ['tools'], architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0.000004', completion: '0.00002' } }] }));
  const ms = await new OpenRouter({ fetchImpl: f }).listModels();
  assert.deepEqual(ms[0], { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', context: 1000000, tools: true, vision: true, price: { in: 4, out: 20 } });
});

test('sfx: Arabic prompt is translated first; ElevenLabs request + local cache', async () => {
  const llm = { text: async ({ user }) => '"Fast whoosh followed by a heavy impact"' };
  assert.equal(await sfx.translatePrompt(llm, 'm', 'ووش سريع وبعده خبطة'), 'Fast whoosh followed by a heavy impact');
  assert.equal(await sfx.translatePrompt(llm, 'm', 'already english'), 'already english');
  const f = recorder(() => mockResponse(Buffer.from('ID3fake-mp3'), { binary: true }));
  const dir = path.join(TMP, 'sfx');
  const r = await sfx.generate({ apiKey: 'sk_1', text: 'whoosh', durationSeconds: 1.5, outDir: dir, fetchImpl: f });
  assert.ok(fs.existsSync(r.file) && !r.cached);
  assert.equal(f.calls[0].url, sfx.ENDPOINT);
  assert.equal(f.calls[0].opts.headers['xi-api-key'], 'sk_1');
  assert.deepEqual(f.calls[0].body, { text: 'whoosh', prompt_influence: 0.4, duration_seconds: 1.5 });
  const again = await sfx.generate({ apiKey: 'sk_1', text: 'whoosh', durationSeconds: 1.5, outDir: dir, fetchImpl: f });
  assert.ok(again.cached); assert.equal(f.calls.length, 1);
  await assert.rejects(sfx.generate({ text: 'x', outDir: dir }), /ElevenLabs/);
  await assert.rejects(sfx.generate({ apiKey: '7680bba80141e4112eda7e', text: 'x', outDir: dir, fetchImpl: f }), /Key ID/, 'the Key ID is caught before any request');
  assert.equal(f.calls.length, 1);
});

test('b-roll: Pexels + Pixabay normalisation, local folder search, download cache', async () => {
  const f = recorder(url => {
    if (url.includes('pexels')) return mockResponse({ videos: [{ id: 7, image: 'https://img/7.jpg', duration: 9, url: 'https://pexels.com/v/7', user: { name: 'Ali' },
      video_files: [{ link: 'https://v/4k.mp4', file_type: 'video/mp4', width: 3840, height: 2160 }, { link: 'https://v/hd.mp4', file_type: 'video/mp4', width: 1920, height: 1080 }, { link: 'https://v/sd.mp4', file_type: 'video/mp4', width: 640, height: 360 }] }] });
    if (url.includes('pixabay')) return mockResponse({ hits: [{ id: 9, duration: 12, user: 'Mona', pageURL: 'p', videos: { large: { url: 'https://px/l.mp4', width: 1920, height: 1080, thumbnail: 't.jpg' }, tiny: { url: 'https://px/t.mp4', thumbnail: 'tt.jpg' } } }] });
    return mockResponse(Buffer.from('MP4DATA'));
  });
  const p = await broll.pexels({ key: 'k', q: 'city night', fetchImpl: f });
  assert.equal(p[0].url, 'https://v/hd.mp4'); assert.equal(p[0].preview, 'https://v/sd.mp4');
  assert.equal(f.calls[0].opts.headers.Authorization, 'k');
  const x = await broll.pixabay({ key: 'k', q: 'city', fetchImpl: f });
  assert.equal(x[0].url, 'https://px/l.mp4'); assert.equal(x[0].preview, 'https://px/t.mp4');
  const dir = path.join(TMP, 'localbroll'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'city-night-drone.mp4'), 'x'); fs.writeFileSync(path.join(dir, 'beach.mov'), 'x');
  const both = await broll.search({ sources: ['pexels', 'pixabay', 'local'], q: 'city', keys: { pexels: 'k', pixabay: 'k' }, dirs: [dir], fetchImpl: f });
  assert.deepEqual(both.results.map(r => r.source).sort(), ['local', 'pexels', 'pixabay']);
  const err = await broll.search({ sources: ['pexels'], q: 'x', keys: {}, fetchImpl: f });
  assert.match(err.errors[0], /Pexels/);
  const file = await broll.download(p[0], path.join(TMP, 'dl'), { fetchImpl: f });
  assert.equal(fs.readFileSync(file, 'utf8'), 'MP4DATA');
  const n = f.calls.length; await broll.download(p[0], path.join(TMP, 'dl'), { fetchImpl: f }); assert.equal(f.calls.length, n);
  assert.equal(await broll.keywords({ text: async () => 'city at night' }, 'm', 'مدينة بالليل'), 'city at night');
});

test('auto effects: model reads the transcript, invalid suggestions are dropped', async () => {
  const words = [['أنا', 0, 0.3], ['هقولكم', 0.4, 1], ['مفاجأة', 1.1, 2], ['كبيرة', 2.1, 2.6], ['جدًا', 2.7, 3]].map(([text, start, end]) => ({ text, start, end }));
  let seen = null;
  const llm = { json: async (req) => { seen = req; return { effects: [
    { time: 1.1, type: 'sfx', prompt: 'dramatic reveal hit', reason: 'مفاجأة' },
    { time: 1.3, type: 'sfx', prompt: 'too close', reason: '' },
    { time: 2.2, type: 'motion', preset: 'punch-in', reason: 'تأكيد' },
    { time: 2.5, type: 'motion', preset: 'does-not-exist' },
    { time: 99, type: 'sfx', prompt: 'outside' }] }; } };
  const list = await autoFx.suggest(llm, 'm', words, { density: 'high' });
  assert.deepEqual(list.map(e => e.type + '@' + e.time), ['sfx@1.1', 'motion@2.2']);
  assert.match(seen.user, /مفاجأة/); assert.match(seen.system, /مش بتدوّر|تفهم|افهم/);
});

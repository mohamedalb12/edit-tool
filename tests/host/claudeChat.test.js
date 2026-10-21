'use strict';
// Chatting with Claude inside the panel: the panel runs Claude Code (claude -p, the user's subscription) wired only to
// EditFast's tools over MCP HTTP on 127.0.0.1. A stand-in `claude` (tests/fixtures/fake-claude.js) does what Claude
// Code does: reads --mcp-config, initialises, lists the tools, calls one, streams stream-json.
require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const config = require('../../core/config');
const bridge = require('../../core/mcpBridge');
const chat = require('../../core/claudeChat');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

const FAKE = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'fake-claude.js');

test('finds Claude Code and its login (CLAUDE_BIN, then the usual install places)', async () => {
  process.env.CLAUDE_BIN = FAKE;
  try {
    assert.equal(chat.find(), FAKE);
    const s = await chat.status();
    assert.deepEqual([s.installed, s.loggedIn, s.version, s.method], [true, true, '2.1.300', 'claude.ai']);
    process.env.FAKE_CLAUDE_LOGGED_OUT = '1';
    assert.equal((await chat.status()).loggedIn, false);
  } finally { delete process.env.CLAUDE_BIN; delete process.env.FAKE_CLAUDE_LOGGED_OUT; }
  const c = chat.candidates('/Users/me', { PATH: '' });
  assert.ok(c.includes('/Users/me/.local/bin/claude') && c.includes('/opt/homebrew/bin/claude'), 'native + Homebrew installs');
  assert.match(chat.terminalCommand('install'), /claude\.ai\/install/);
});

test('the bridge speaks MCP over HTTP: initialize, this panel\'s tools only, tools/call, notifications, token required', async () => {
  const ae = loadAE(); ae.project._active = ae.newComp('Main', { duration: 4 });
  const b = await bridge.start({ app: 'ae', services: new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }), port: 0 });
  const post = (body, token = b.token) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: b.port, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } }, x => { let t = ''; x.on('data', d => { t += d; }); x.on('end', () => res({ status: x.statusCode, json: t ? JSON.parse(t) : null })); }); r.end(JSON.stringify(body)); });
  try {
    const cfg = bridge.mcpConfig(b).mcpServers.editfast;
    assert.equal(cfg.type, 'http'); assert.match(cfg.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, 'nope')).status, 401);
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    assert.equal(init.json.result.serverInfo.name, 'editfast');
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const names = (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json.result.tools.map(t => t.name);
    assert.ok(names.includes('ae_build_scene') && !names.some(n => n.startsWith('premiere_')), 'only the AE tools in the AE panel');
    const st = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ae_status', arguments: {} } });
    assert.match(st.json.result.content[0].text, /Main/);
  } finally { b.close(); }
});

test('chat in the After Effects panel: Claude builds in the open comp, every step reported, the next message continues the same session', async () => {
  config.save({ ...config.DEFAULTS });
  const ae = loadAE(); const main = ae.newComp('Main', { duration: 4 }); ae.project._active = main;
  const seen = [];
  const b = await bridge.start({ app: 'ae', services: new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }), port: 0, onCall: e => seen.push(e.phase + ':' + (e.name || '')) });
  try {
    const ev = [];
    const c = new chat.ClaudeChat({ bin: FAKE, app: 'ae', mcp: bridge.mcpConfig(b), onEvent: e => ev.push(e) });
    const r = await c.send('أهلاً بيك');
    assert.equal(r.is_error, false, JSON.stringify(ev));
    assert.ok(main.layerList.some(L => L.name === 'From Claude'), 'Claude built in the open comp');
    assert.deepEqual(ev.map(e => e.type), ['text', 'tool', 'tool_result', 'text', 'done']);
    assert.equal(ev[1].name, 'ae_build_scene'); assert.equal(ev[1].label, 'ابني مشهد كامل'); assert.equal(ev[2].isError, false);
    assert.ok(seen.includes('start:ae_build_scene') && seen.includes('done:ae_build_scene'), 'the panel log sees it too');
    assert.equal(c.session, 'sess-1234');
    const ev2 = []; c.onEvent = e => ev2.push(e);
    await c.send('كبّره');
    assert.equal(ev2[0].text, 'كمّلنا نفس المحادثة', '--resume the same session');
    b.pause(true);
    const ev3 = []; c.onEvent = e => ev3.push(e);
    await c.send('تاني');
    assert.equal(ev3.find(e => e.type === 'tool_result').isError, true, 'paused from the panel: Claude can\'t touch anything');
  } finally { b.close(); }
});

test('a missing Claude Code reads as what to do', async () => {
  const ev = [];
  const c = new chat.ClaudeChat({ bin: '/nope/claude', app: 'premiere', mcp: { mcpServers: {} }, onEvent: e => ev.push(e) });
  const r = await c.send('x');
  assert.equal(r.is_error, true);
  assert.match(ev[0].message, /ثبّت Claude Code/);
  assert.equal(c.busy, false);
});

test('an expired Claude Code login is said plainly, and a setup-token (long-lived) gets through; no stray API key reaches Claude', async () => {
  process.env.FAKE_CLAUDE_EXPIRED = '1'; process.env.ANTHROPIC_API_KEY = 'sk-ant-api-should-not-leak';
  try {
    const ev = [];
    const c = new chat.ClaudeChat({ bin: FAKE, app: 'premiere', mcp: { mcpServers: { editfast: { type: 'http', url: 'http://127.0.0.1:9/mcp', headers: {} } } }, onEvent: e => ev.push(e) });
    await c.send('ازيك');
    assert.ok(ev.some(e => e.type === 'auth' && /اربط بتوكن ثابت/.test(e.message)), JSON.stringify(ev));
    assert.ok(!ev.some(e => e.type === 'text' && /Failed to authenticate/.test(e.text)), 'the raw English error is not shown as Claude talking');
    assert.equal((await chat.verify({ bin: FAKE })).auth, true);
    assert.equal(chat.isToken('sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123'), true);
    assert.equal(chat.isToken('hello'), false);
    const v = await chat.verify({ bin: FAKE, token: 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123' });
    assert.equal(v.ok, true, JSON.stringify(v));
    process.env.CLAUDE_BIN = FAKE;
    const st = await chat.status({ token: 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123' });
    assert.equal(st.method, 'token'); assert.equal(st.loggedIn, true);
  } finally { delete process.env.FAKE_CLAUDE_EXPIRED; delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDE_BIN; }
});

test('clients: a profile per client, Claude reads it and saves what it learns; each client keeps its own conversation', async () => {
  config.save({ ...config.DEFAULTS });
  const K = require('../../core/clients');
  const c = K.create('مطعم الشيف', { style: { captions: 'hormozi-pop أصفر كبير', pace: 'سريع جدًا', colors: '#f97316 #111111', bogus: 'x' }, notes: 'ريلز أكل' });
  assert.equal(K.get(c.id).style.bogus, undefined, 'only the known style fields');
  assert.match(K.profileText(K.get(c.id)), /العميل: مطعم الشيف[\s\S]*hormozi-pop أصفر كبير[\s\S]*سريع جدًا/);
  const ae = loadAE(); const main = ae.newComp('Main', { duration: 4 }); ae.project._active = main;
  const b = await bridge.start({ app: 'ae', services: new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }), port: 0 });
  const call = (name, args) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: b.port, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.token } }, x => { let t = ''; x.on('data', d => { t += d; }); x.on('end', () => res(JSON.parse(t).result)); }); r.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } })); });
  try {
    assert.equal((await call('ae_client_profile')).isError, true, 'no client picked → says so');
    b.setClient(c.id);
    assert.match((await call('ae_client_profile')).content[0].text, /مطعم الشيف/);
    await call('ae_client_remember', { note: 'بيحب اللوجو في الركن اليمين فوق' });
    await call('ae_client_remember', { note: 'بيحب اللوجو في الركن اليمين فوق' });
    assert.deepEqual(K.get(c.id).memory.map(m => m.text), ['بيحب اللوجو في الركن اليمين فوق'], 'saved once');
    await call('ae_client_update_style', { music: 'لو-فاي هادية' });
    assert.equal(K.get(c.id).style.music, 'لو-فاي هادية'); assert.equal(K.get(c.id).style.pace, 'سريع جدًا', 'the rest stays');
    // the chat for this client: the system prompt names the client, the profile goes with the first message
    const ev = [];
    const ch = new chat.ClaudeChat({ bin: FAKE, app: 'ae', mcp: bridge.mcpConfig(b), client: 'مطعم الشيف', onEvent: e => ev.push(e) });
    await ch.send('اعمل إنترو', { context: K.profileText(K.get(c.id)) });
    const texts = ev.filter(e => e.type === 'text').map(e => e.text);
    assert.ok(texts.includes('قريت ملف العميل') && texts.includes('شغّال للعميل مطعم الشيف'), texts.join(' | '));
    K.saveSession(c.id, 'ae', { session: ch.session, messages: [{ role: 'user', text: 'اعمل إنترو' }], seen: K.hashOf(K.get(c.id)) });
    const other = K.create('شركة النور');
    assert.equal(K.session(other.id, 'ae').session, null, 'another client starts fresh');
    assert.equal(K.session(c.id, 'ae').session, 'sess-1234', 'this client resumes its own session');
    assert.equal(K.session(c.id, 'premiere').session, null, 'per app');
    assert.ok(K.list().length >= 2);
    K.forget(c.id, 0); assert.equal(K.get(c.id).memory.length, 0);
    assert.equal(K.remove(other.id), true);
  } finally { b.close(); }
});

test('the setup-token is picked out of whatever gets pasted: wrapped by the terminal over lines, or the whole output', () => {
  // a made-up token with the real shape (underscores, dashes, wrapped mid-token with a leading space)
  const tok = 'sk-ant-oat01-_ZZfakeFAKEfake0123456789abcdEFGH_ijklMNOPqrst-uvwxYZ-' + 'ab9Cd5yJSnf-4-uSM-uA-xECFmAAA';
  const wrapped = tok.slice(0, 80) + '\n ' + tok.slice(80);
  assert.equal(chat.extractToken(wrapped), tok);
  const whole = [' Welcome to Claude Code v2.1.289', '', ' ✓ Long-lived authentication token created successfully!', '', ' Your OAuth token (valid for 1 year):', '',
    ' ' + tok.slice(0, 80), ' ' + tok.slice(80), '', ' Store this token securely. You won\'t be able to see it again.', '', ' Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>'].join('\n');
  assert.equal(chat.extractToken(whole), tok);
  assert.equal(chat.extractToken('  ' + tok + '  \n'), tok);
  assert.equal(chat.extractToken('mohamed@Mac ~ % hello'), '');
  assert.equal(chat.extractToken('sk-ant-oat01-short'), '');
});

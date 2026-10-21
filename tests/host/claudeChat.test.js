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

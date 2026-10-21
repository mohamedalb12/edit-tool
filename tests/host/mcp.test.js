'use strict';
// Claude ↔ EditFast over MCP: the real server process (mcp/server.js, stdio JSON-RPC) → the panel bridge (token,
// localhost) → the panel services → the simulated After Effects / Premiere.
const { TMP, makeAudio } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const config = require('../../core/config');
const bridge = require('../../core/mcpBridge');
const bundle = require('../../core/mcpBundle');
const zip = require('../../core/zip');
const { loadAE } = require('./mockAE');
const { loadHost } = require('./mockPremiere');
const { AEServices } = require('../../core/aeServices');
const { Services } = require('../../core/services');

/** the MCP server as Claude Desktop runs it: a child process spoken to over stdin / stdout */
function client() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', '..', 'mcp', 'server.js')], { env: Object.assign({}, process.env), stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '', id = 0; const wait = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } } });
  const rpc = (method, params) => new Promise(res => { const k = ++id; wait.set(k, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args || {} })).result;
  return { rpc, call, notify: (method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'), close: () => p.kill() };
}
const text = r => r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

test('mcp/tools.json is in step with the code (what Claude sees = what the panels run)', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '..', '..', 'mcp', 'tools.json'), 'utf8'), bundle.toolsJson());
});

test('MCP handshake, tool list, and a clear answer when no panel is open', async () => {
  for (const a of ['ae', 'premiere']) { try { fs.unlinkSync(bridge.fileFor(a)); } catch (_) {} }
  const c = client();
  try {
    const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'editfast');
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.ok(init.result.capabilities.tools);
    c.notify('notifications/initialized');
    const list = (await c.rpc('tools/list', {})).result.tools;
    const names = list.map(t => t.name);
    for (const n of ['editfast_status', 'ae_guide', 'ae_build_scene', 'ae_look', 'ae_tool', 'premiere_guide', 'premiere_place_clip', 'premiere_add_captions', 'premiere_remove_silences', 'premiere_look_at_frames']) assert.ok(names.includes(n), n);
    assert.ok(list.every(t => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name) && t.inputSchema && t.inputSchema.type === 'object'));
    assert.ok(!names.includes('premiere_ask_user') && !names.includes('premiere_youtube_pack'), 'no tool that needs an OpenRouter key');
    assert.match(text(await c.call('editfast_status')), /✗ After Effects مش متوصّل/);
    const r = await c.call('ae_status');
    assert.equal(r.isError, true); assert.match(text(r), /EditFast Motion/);
    assert.equal((await c.rpc('nope/method', {})).error.code, -32601);
  } finally { c.close(); }
});

test('the bridge: localhost only, needs the token, only its own tools', async () => {
  const ae = loadAE(); ae.project._active = ae.newComp('Main', { duration: 6 });
  const b = await bridge.start({ app: 'ae', services: new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }), port: 0 });
  try {
    const info = JSON.parse(fs.readFileSync(bridge.fileFor('ae'), 'utf8'));
    assert.equal(info.port, b.port); assert.equal(info.token, b.token);
    if (process.platform !== 'win32') assert.equal(fs.statSync(bridge.fileFor('ae')).mode & 0o077, 0, 'only you can read the token');
    const req = (token, body) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: b.port, method: 'POST', path: '/call', headers: token ? { Authorization: 'Bearer ' + token } : {} }, x => { let t = ''; x.on('data', d => { t += d; }); x.on('end', () => res({ status: x.statusCode, body: t })); }); r.end(JSON.stringify(body)); });
    assert.equal((await req(null, { tool: 'ae_status' })).status, 401);
    assert.equal((await req('wrong', { tool: 'ae_status' })).status, 401);
    assert.equal((await req(b.token, { tool: 'premiere_place_clip' })).status, 404, 'a Premiere tool is not served by the AE panel');
    assert.equal((await req(b.token, { tool: 'ae_status' })).status, 200);
  } finally { b.close(); }
  assert.ok(!fs.existsSync(bridge.fileFor('ae')), 'closing removes the door');
});

test('Claude in After Effects: reads the guide, builds a scene, looks at it, edits it, uses a panel tool', async () => {
  config.save({ ...config.DEFAULTS });
  const ae = loadAE(); const main = ae.newComp('Main', { duration: 6 }); ae.project._active = main;
  const b = await bridge.start({ app: 'ae', services: new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) }), port: 0 });
  const c = client();
  try {
    await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    assert.match(text(await c.call('editfast_status')), /✓ After Effects متوصّل/);
    assert.match(text(await c.call('ae_guide')), /"layers"/);
    const built = await c.call('ae_build_scene', { where: 'here', scene: { comp: { duration: 4 }, layers: [
      { type: 'text', name: 'Title', text: 'أهلاً', size: 120, color: '#ffffff', textAnimators: [{ preset: 'fadeUp' }] },
      { type: 'shape', name: 'Ring', shape: { kind: 'ellipse', size: [300, 300], fill: null, stroke: '#f97316', strokeWidth: 12, trim: { end: 0 } }, keys: { 'shape:trimEnd': [[0, 0, 'expoOut'], [1, 100]] } }] } });
    assert.ok(!built.isError, text(built));
    assert.ok(main.layerList.some(L => L.name === 'Title') && main.layerList.some(L => L.name === 'Ring'));
    const look = await c.call('ae_look', { frames: 2 });
    assert.ok(look.content.some(x => x.type === 'image' && x.mimeType === 'image/png' && x.data.length > 10), 'Claude sees the frames');
    const ed = await c.call('ae_edit_scene', { ops: [{ op: 'set', layer: 'Title', look: { color: '#fbbf24' } }, { op: 'delete', layer: 'Ring' }] });
    assert.ok(!ed.isError, text(ed));
    assert.ok(!main.layerList.some(L => L.name === 'Ring'));
    const cnt = await c.call('ae_tool', { name: 'counterAdd', args: { to: 2500000, format: 'currency', currency: 'EGP', label: 'السعر' } });
    assert.ok(!cnt.isError, text(cnt));
    assert.ok(main.layerList.some(L => L.name === 'Counter'));
    const bad = await c.call('ae_tool', { name: 'eval', args: {} });
    assert.equal(bad.isError, true, 'only the listed panel tools');
  } finally { c.close(); b.close(); }
});

test('Claude in Premiere: lists the footage, lays clips from their in-points, reads the timeline, cuts a range', async () => {
  const D = path.join(TMP, 'mcp-media'); fs.mkdirSync(D, { recursive: true });
  const talk = makeAudio('mcp-talk.wav', [{ tone: 300, dur: 3 }, { silence: 1 }, { tone: 300, dur: 3 }]);
  fs.copyFileSync(talk, path.join(D, 'talk.wav'));
  const h = loadHost(); const seq = h.pr.newSequence('Main', { fps: 25 });
  config.save({ ...config.DEFAULTS });
  const S = new Services({ host: async (n, a) => h.call(n, JSON.parse(JSON.stringify(a))) });
  const b = await bridge.start({ app: 'premiere', services: S, port: 0 });
  const c = client();
  try {
    await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    assert.match(text(await c.call('premiere_guide')), /premiere_place_clip/);
    const media = JSON.parse(text(await c.call('premiere_list_media', { folder: D })));
    assert.equal(media.files.length, 1); assert.ok(Math.abs(media.files[0].duration - 7) < 0.1);
    const p1 = await c.call('premiere_place_clip', { path: path.join(D, 'talk.wav'), time: 0, src_in: 4, duration: 2, kind: 'audio' });
    assert.ok(!p1.isError, text(p1));
    const clip = seq.a.flatMap(t => t.items)[0];
    assert.ok(clip, 'the clip is on the timeline');
    assert.ok(Math.abs(clip._end - clip._start - 2) < 0.05, 'for the asked duration');
    assert.ok(Math.abs(clip._in - 4) < 0.05, 'from 4 s into the source');
    const st = await c.call('premiere_get_project_state');
    assert.ok(!st.isError, text(st));
    await c.call('premiere_place_clip', { path: path.join(D, 'talk.wav'), time: 2, src_in: 0, duration: 3, kind: 'audio', track: 0 });
    const cut = await c.call('premiere_cut_ranges', { ranges: [{ start: 1, end: 2 }] });
    assert.ok(!cut.isError, text(cut));
    assert.match(h.pr.project.activeSeq.name, /قص/, 'cut on a copy, the original stays');
    const un = await c.call('premiere_undo_last');
    assert.ok(!un.isError, text(un));
  } finally { c.close(); b.close(); }
});

test('EditFast.mcpb: a Claude Desktop extension with its manifest, the server and the tools', () => {
  const buf = bundle.build('9.9.9');
  const files = zip.read(buf);
  const names = files.map(f => f.name).sort();
  for (const n of ['manifest.json', 'server.js', 'tools.json', 'package.json']) assert.ok(names.includes(n), n);
  const m = JSON.parse(files.find(f => f.name === 'manifest.json').data.toString());
  assert.equal(m.manifest_version, '0.3'); assert.equal(m.version, '9.9.9');
  assert.equal(m.server.type, 'node'); assert.equal(m.server.entry_point, 'server.js');
  assert.deepEqual(m.server.mcp_config.args, ['${__dirname}/server.js']);
  assert.ok(m.tools.length > 40);
  assert.match(bundle.claudeCodeCommand(), /^claude mcp add editfast -- node ".+server\.js"$/);
});

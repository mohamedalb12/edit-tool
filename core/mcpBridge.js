'use strict';
// The door Claude uses to reach an open panel: a tiny HTTP server on 127.0.0.1 inside the Premiere / After Effects
// panel. A random token (written to ~/.editfast/bridge-<app>.json, readable by this user only) must come with
// every call, only the tools in mcpTools run, and calls run one at a time (the host app does one thing at once).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const tools = require('./mcpTools');

const PORTS = { premiere: 47321, ae: 47322 };
const fileFor = app => path.join(config.dataDir(), 'bridge-' + app + '.json');

/**
 * start({ app: 'premiere'|'ae', services, version, port }) → { port, token, close() }
 * port 0 = any free port (tests); by default the app's own port, then any free one if it's taken.
 */
function start({ app, services, version = '', port, onCall } = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const list = tools.forApp(app);
  let queue = Promise.resolve(), server;
  const ctl = { paused: false, lastSeen: null, client: null };
  const emit = e => { try { onCall && onCall(e); } catch (_) {} };
  const handle = async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer ' + token) return send(401, { error: 'bad token' });
    ctl.lastSeen = new Date(); emit({ phase: 'seen' });
    if (req.method === 'GET' && req.url === '/info') return send(200, { app, version, paused: ctl.paused, tools: list.map(t => t.name) });
    if (req.url === '/mcp') return mcpHttp(req, res, send);
    if (req.method !== 'POST' || req.url !== '/call') return send(404, { error: 'not found' });
    let body = '';
    req.on('data', d => { body += d; if (body.length > 20e6) req.destroy(); });
    req.on('end', () => {
      let msg; try { msg = JSON.parse(body || '{}'); } catch (_) { return send(400, { error: 'bad json' }); }
      const tool = list.find(t => t.name === msg.tool);
      if (!tool) return send(404, { error: 'unknown tool ' + msg.tool });
      runTool(tool, msg.args || {}).then(r => send(200, r));
    });
  };
  // run one tool (queued, pausable, reported) → MCP CallToolResult
  const runTool = (tool, args) => {
    if (ctl.paused) { emit({ phase: 'blocked', name: tool.name, args }); return Promise.resolve({ isError: true, content: [{ type: 'text', text: 'المونتير وقّف Claude مؤقتًا من البانل (تاب Claude) — استنى لما يشغّله تاني.' }] }); }
    let t0 = 0;
    const job = queue.then(async () => { t0 = Date.now(); emit({ phase: 'start', name: tool.name, args: args || {} }); return tools.run(tool, services, args || {}, { client: ctl.client }); });
    queue = job.catch(() => {});
    return job.then(r => { emit({ phase: 'done', name: tool.name, ms: Date.now() - t0 }); return r; },
      e => { const m = String(e && e.message || e); emit({ phase: 'error', name: tool.name, ms: Date.now() - t0, error: m }); return { isError: true, content: [{ type: 'text', text: m }] }; });
  };
  // MCP over HTTP (streamable HTTP, JSON responses): Claude Code started by the panel connects here directly
  const mcpHttp = (req, res, send) => {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
    let body = '';
    req.on('data', d => { body += d; if (body.length > 20e6) req.destroy(); });
    req.on('end', async () => {
      let msg; try { msg = JSON.parse(body || '{}'); } catch (_) { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      const one = async m => {
        if (m.id === undefined || m.id === null) return null; // notification
        const ok = result => ({ jsonrpc: '2.0', id: m.id, result }), err = (code, message) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } });
        const p = m.params || {};
        if (m.method === 'initialize') return ok({ protocolVersion: p.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'editfast', version }, instructions: instructions(app) });
        if (m.method === 'ping') return ok({});
        if (m.method === 'tools/list') return ok({ tools: tools.describe().filter(t => list.some(x => x.name === t.name)) });
        if (m.method === 'tools/call') { const tool = list.find(t => t.name === p.name); if (!tool) return ok({ isError: true, content: [{ type: 'text', text: 'أداة مش معروفة: ' + p.name }] }); return ok(await runTool(tool, p.arguments || {})); }
        if (m.method === 'resources/list') return ok({ resources: [] });
        if (m.method === 'prompts/list') return ok({ prompts: [] });
        return err(-32601, 'Method not found: ' + m.method);
      };
      const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
      if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202); return res.end(); }
      send(200, out);
    });
  };
  const listen = p => new Promise((resolve, reject) => {
    server = http.createServer((req, res) => { handle(req, res).catch(e => { try { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); } catch (_) {} }); });
    server.once('error', reject);
    server.listen(p, '127.0.0.1', () => resolve(server.address().port));
  });
  const want = port === undefined ? PORTS[app] : port;
  return listen(want).catch(e => { if (want && e.code === 'EADDRINUSE') return listen(0); throw e; }).then(p => {
    const f = fileFor(app);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ app, port: p, token, pid: process.pid, version, started: new Date().toISOString() }), { mode: 0o600 });
    try { fs.chmodSync(f, 0o600); } catch (_) {}
    return {
      port: p, token, ctl,
      pause(v) { ctl.paused = !!v; },
      setClient(id) { ctl.client = id || null; },
      close() { try { server.close(); } catch (_) {} try { const cur = JSON.parse(fs.readFileSync(f, 'utf8')); if (cur.token === token) fs.unlinkSync(f); } catch (_) {} }
    };
  });
}

function instructions(app) {
  return app === 'ae' ? 'إنت جوه After Effects المفتوح عن طريق EditFast Motion. اقرا ae_guide الأول، ابني بـ ae_build_scene، بص على النتيجة بـ ae_look وصلّح. اتكلم بالعامية المصرية.'
    : 'إنت جوه Premiere Pro المفتوح عن طريق EditFast. اقرا premiere_guide الأول، وابدأ بـ premiere_get_project_state. اتكلم بالعامية المصرية.';
}
/** the URL + header Claude Code needs to reach this panel over MCP HTTP */
function mcpConfig(b) { return { mcpServers: { editfast: { type: 'http', url: 'http://127.0.0.1:' + b.port + '/mcp', headers: { Authorization: 'Bearer ' + b.token } } } }; }

module.exports = { start, fileFor, PORTS, mcpConfig, instructions };

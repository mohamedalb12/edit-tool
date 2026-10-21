#!/usr/bin/env node
'use strict';
// EditFast MCP server: lets Claude (Claude Desktop / Claude Code) edit in Premiere Pro and After Effects through the
// open EditFast panels. Speaks MCP (JSON-RPC 2.0, one message per line) on stdin / stdout, and forwards each tool
// call to the panel's local bridge (127.0.0.1 + the token in ~/.editfast/bridge-<app>.json). No dependencies.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const VERSION = (() => { try { return require('./package.json').version; } catch (_) { return '0'; } })();
const HOME = process.env.EDITFAST_HOME || path.join(os.homedir(), '.editfast');
const TOOLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools.json'), 'utf8'));
const APPS = { premiere: { name: 'Premiere Pro', panel: 'Window ← Extensions ← EditFast' }, ae: { name: 'After Effects', panel: 'Window ← Extensions ← EditFast Motion' } };
const STATUS = { name: 'editfast_status', description: 'مين متوصّل دلوقتي: بريمير و/أو أفتر (لازم البانل يكون مفتوح). ابدأ بيها لو مش عارف.', inputSchema: { type: 'object', properties: {} } };

const appOf = name => (name.startsWith('ae_') ? 'ae' : name.startsWith('premiere_') ? 'premiere' : null);
function bridge(app) { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'bridge-' + app + '.json'), 'utf8')); } catch (_) { return null; } }

function request(b, method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port: b.port, method, path: url, headers: Object.assign({ Authorization: 'Bearer ' + b.token }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) }, res => {
      let txt = ''; res.setEncoding('utf8'); res.on('data', d => { txt += d; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(txt) }); } catch (e) { reject(new Error('رد مش مفهوم من البانل')); } });
    });
    req.on('error', reject);
    req.setTimeout(3600000, () => req.destroy(new Error('البانل مارجعش خلال ساعة')));
    if (data) req.write(data);
    req.end();
  });
}
const notOpen = app => ({ isError: true, content: [{ type: 'text', text: APPS[app].name + ' مش متوصّل: افتح ' + APPS[app].name + ' وافتح بانل EditFast (' + APPS[app].panel + ') وسيبه مفتوح، وبعدين جرّب تاني.' }] });

async function callTool(name, args) {
  if (name === STATUS.name) {
    const lines = [];
    for (const app of Object.keys(APPS)) {
      const b = bridge(app);
      let ok = false; if (b) { try { ok = (await request(b, 'GET', '/info')).status === 200; } catch (_) {} }
      lines.push((ok ? '✓ ' : '✗ ') + APPS[app].name + (ok ? ' متوصّل' + (b.version ? ' (' + b.version + ')' : '') : ' مش متوصّل — افتح ' + APPS[app].panel));
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
  const app = appOf(name);
  if (!app || !TOOLS.some(t => t.name === name)) return { isError: true, content: [{ type: 'text', text: 'أداة مش معروفة: ' + name }] };
  const b = bridge(app);
  if (!b) return notOpen(app);
  let r;
  try { r = await request(b, 'POST', '/call', { tool: name, args: args || {} }); } catch (e) { return notOpen(app); }
  if (r.status === 401) return { isError: true, content: [{ type: 'text', text: 'البانل اتفتح من جديد — جرّب تاني.' }] };
  if (r.status !== 200) return { isError: true, content: [{ type: 'text', text: (r.json && r.json.error) || 'خطأ ' + r.status }] };
  return r.json;
}

/* ---------- JSON-RPC over stdio ---------- */
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notifications (initialized, cancelled…)
  try {
    if (method === 'initialize') return reply(id, {
      protocolVersion: (params && params.protocolVersion) || '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'editfast', title: 'EditFast (Premiere + After Effects)', version: VERSION },
      instructions: 'EditFast بيخليك تمنتج في Adobe Premiere Pro (أدوات premiere_*) وتعمل موشن جرافيك في After Effects (أدوات ae_*) — البرنامج والبانل لازم يكونوا مفتوحين. ابدأ بـ editfast_status، وبعدين premiere_guide أو ae_guide قبل الشغل. اتكلم مع المستخدم بالعامية المصرية.'
    });
    if (method === 'ping') return reply(id, {});
    if (method === 'tools/list') return reply(id, { tools: [STATUS].concat(TOOLS) });
    if (method === 'tools/call') return reply(id, await callTool(params && params.name, params && params.arguments));
    if (method === 'resources/list') return reply(id, { resources: [] });
    if (method === 'prompts/list') return reply(id, { prompts: [] });
    return fail(id, -32601, 'Method not found: ' + method);
  } catch (e) { return fail(id, -32603, String(e && e.message || e)); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch (_) { fail(null, -32700, 'Parse error'); continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

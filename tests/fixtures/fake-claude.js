#!/usr/bin/env node
'use strict';
// A stand-in for Claude Code in tests: answers --version / auth status, and in -p mode talks to the MCP server it is
// given (--mcp-config, HTTP) like Claude would — initialize, list tools, call one — streaming stream-json events.
const http = require('http');
const argv = process.argv.slice(2);
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
if (argv[0] === '--version') { console.log('2.1.300 (Claude Code)'); process.exit(0); }
if (argv[0] === 'auth' && argv[1] === 'status') { console.log(JSON.stringify({ loggedIn: process.env.FAKE_CLAUDE_LOGGED_OUT ? false : true, authMethod: process.env.FAKE_CLAUDE_LOGGED_OUT ? 'none' : 'claude.ai' })); process.exit(process.env.FAKE_CLAUDE_LOGGED_OUT ? 1 : 0); }
const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
// FAKE_CLAUDE_EXPIRED: the stored login is dead — only a setup-token (CLAUDE_CODE_OAUTH_TOKEN) gets through
const tokenOk = /^sk-ant-oat01-/.test(process.env.CLAUDE_CODE_OAUTH_TOKEN || '');
const authDead = !!process.env.FAKE_CLAUDE_EXPIRED && !tokenOk;
if (process.env.ANTHROPIC_API_KEY) { process.stderr.write('an API key leaked into the child env'); process.exit(4); }
if (arg('--output-format') === 'json') {
  if (authDead) { out({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' }); process.exit(1); }
  out({ type: 'result', is_error: false, result: 'تمام' }); process.exit(0);
}
if (authDead) {
  out({ type: 'system', subtype: 'init', session_id: arg('--resume') || 'sess-1234' });
  out({ type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'Failed to authenticate: OAuth session expired and could not be refreshed' }] } });
  out({ type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' });
  process.exit(1);
}
const prompt = arg('-p'), resume = arg('--resume'), cfg = JSON.parse(arg('--mcp-config')).mcpServers.editfast;
if (arg('--tools') !== '' || arg('--allowedTools') !== 'mcp__editfast' || argv.indexOf('--strict-mcp-config') < 0) { process.stderr.write('bad flags'); process.exit(3); }
const rpc = (method, params, id) => new Promise((res, rej) => {
  const u = new URL(cfg.url), body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, cfg.headers) }, x => { let t = ''; x.on('data', d => { t += d; }); x.on('end', () => { try { res(t ? JSON.parse(t) : null); } catch (e) { rej(e); } }); });
  r.on('error', rej); r.end(body);
});
(async () => {
  const sid = resume || 'sess-1234';
  out({ type: 'system', subtype: 'init', session_id: sid, tools: [] });
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }, 1);
  const tools = (await rpc('tools/list', {}, 2)).result.tools.map(t => t.name);
  const name = tools.includes('ae_build_scene') ? 'ae_build_scene' : 'premiere_get_project_state';
  const args = name === 'ae_build_scene' ? { where: 'here', scene: { comp: {}, layers: [{ type: 'text', name: 'From Claude', text: prompt }] } } : {};
  if (/<context>[\s\S]*العميل:/.test(prompt)) out({ type: 'assistant', session_id: sid, message: { content: [{ type: 'text', text: 'قريت ملف العميل' }] } });
  const sys = arg('--append-system-prompt') || '';
  const m = sys.match(/للعميل "([^"]+)"/); if (m) out({ type: 'assistant', session_id: sid, message: { content: [{ type: 'text', text: 'شغّال للعميل ' + m[1] }] } });
  out({ type: 'assistant', session_id: sid, message: { content: [{ type: 'text', text: resume ? 'كمّلنا نفس المحادثة' : 'حاضر، هبني العنوان' }, { type: 'tool_use', id: 'tu1', name: 'mcp__editfast__' + name, input: args }] } });
  const r = (await rpc('tools/call', { name, arguments: args }, 3)).result;
  out({ type: 'user', session_id: sid, message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: !!r.isError, content: r.content }] } });
  out({ type: 'assistant', session_id: sid, message: { content: [{ type: 'text', text: 'خلصت ✓ (' + tools.length + ' أداة متاحة)' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, result: 'خلصت', total_cost_usd: 0 });
})().catch(e => { process.stderr.write(String(e.stack || e)); process.exit(1); });

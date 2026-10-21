'use strict';
// الشات مع Claude جوه البانل: البانل بيشغّل Claude Code (claude -p) على جهازك — باشتراكك، من غير مفتاح API —
// ومتوصّل بأدوات EditFast بس (MCP HTTP على 127.0.0.1)، من غير تيرمنال ولا تعديل ملفات.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32';
/** a short Arabic label for a tool step ("نزّل كابشن على التايملين") from the tool's own description */
let LABELS = null;
function labelOf(name, input) {
  if (name === 'ae_tool' && input && input.name) return 'أداة: ' + input.name;
  if (!LABELS) { LABELS = {}; try { for (const t of require('./mcpTools').describe()) LABELS[t.name] = t.description.split(/[:.،(—\n]/)[0].trim().slice(0, 48); } catch (_) {} }
  return LABELS[name] || name.replace(/^(premiere|ae)_/, '').replace(/_/g, ' ');
}
/** where Claude Code usually lives (Adobe apps start with a short PATH, so look in the usual places too) */
function candidates(home = os.homedir(), env = process.env) {
  const exe = WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const dirs = (env.PATH || '').split(path.delimiter).concat(WIN
    ? [path.join(home, '.local', 'bin'), path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm'), path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'claude')]
    : [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.npm-global', 'bin'), path.join(home, '.bun', 'bin'), path.join(home, '.volta', 'bin')]);
  const out = [];
  if (env.CLAUDE_BIN) out.push(env.CLAUDE_BIN);
  for (const d of dirs) for (const e of exe) if (d) out.push(path.join(d, e));
  return [...new Set(out)];
}
function find(o) { for (const f of candidates(o && o.home, o && o.env)) { try { if (fs.statSync(f).isFile()) return f; } catch (_) {} } return null; }
/** PATH for the child: Adobe's plus where node / claude usually are (an npm-installed claude needs node) */
function childEnv(bin, token) {
  const extra = WIN ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin')];
  const env = Object.assign({}, process.env, { PATH: [path.dirname(bin)].concat(extra, (process.env.PATH || '').split(path.delimiter)).filter(Boolean).join(path.delimiter) });
  // the subscription, never a stray API key from the environment
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  // a long-lived token from `claude setup-token`: no Keychain, no refresh (the panel's own process can't always refresh)
  if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token; else delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}
const AUTH_ERR = /failed to authenticate|oauth|authentication_error|invalid api key|please run \/login|login expired|not logged in|invalid bearer|401/i;
const isToken = t => /^sk-ant-oat\d*-[\w-]{20,}$/.test(String(t || '').trim());
function run(bin, args, timeout = 20000, token) {
  return new Promise(resolve => {
    const shell = WIN && /\.cmd$/i.test(bin);
    execFile(bin, args, { timeout, env: childEnv(bin, token), shell, windowsHide: true }, (err, stdout, stderr) => resolve({ code: err ? (err.code || 1) : 0, out: String(stdout || ''), err: String(stderr || '') }));
  });
}
/** → { installed, bin, version, loggedIn, method } (a saved setup-token counts as logged in) */
async function status({ token } = {}) {
  const bin = find();
  if (!bin) return { installed: false };
  const v = await run(bin, ['--version']);
  const version = (v.out.match(/\d+\.\d+\.\d+/) || [''])[0];
  if (isToken(token)) return { installed: true, bin, version, loggedIn: true, method: 'token' };
  const a = await run(bin, ['auth', 'status']);
  let j = null; try { j = JSON.parse(a.out); } catch (_) {}
  const method = j && j.authMethod;
  return { installed: true, bin, version, loggedIn: a.code === 0 && method !== 'none', method: method || null };
}
/** a real one-line request: does Claude answer from inside the panel? → { ok, auth, message } */
async function verify({ bin, token } = {}) {
  bin = bin || find();
  if (!bin) return { ok: false, message: 'Claude Code مش متسطب' };
  const r = await run(bin, ['-p', 'رد بكلمة واحدة: تمام', '--output-format', 'json', '--tools', '', '--max-turns', '1'], 90000, token);
  let j = null; try { j = JSON.parse(r.out); } catch (_) {}
  const text = (j && j.result) || r.err || r.out;
  if (j && !j.is_error) return { ok: true, message: String(j.result || 'تمام').slice(0, 80) };
  return { ok: false, auth: AUTH_ERR.test(text), message: AUTH_ERR.test(text) ? 'تسجيل الدخول منتهي أو مش واصل للبانل — اربط بتوكن ثابت (تحت)' : String(text).slice(0, 300) };
}
/** the one-line install / login, run in a visible terminal (the user watches and answers the browser login) */
function terminalCommand(kind) {
  if (WIN) return kind === 'install' ? 'powershell -NoExit -Command "irm https://claude.ai/install.ps1 | iex"' : kind === 'token' ? 'cmd /k claude setup-token' : 'cmd /k claude auth login';
  return kind === 'install' ? 'curl -fsSL https://claude.ai/install.sh | bash' : (find() || 'claude') + (kind === 'token' ? ' setup-token' : ' auth login');
}
function openTerminal(kind) {
  const cmd = terminalCommand(kind);
  if (WIN) { spawn('cmd', ['/c', 'start', '', ...cmd.split(' ')], { detached: true, windowsHide: false, shell: false }); return cmd; }
  if (process.platform === 'darwin') { spawn('osascript', ['-e', 'tell application "Terminal" to activate', '-e', 'tell application "Terminal" to do script ' + JSON.stringify(cmd)], { detached: true }); return cmd; }
  spawn('x-terminal-emulator', ['-e', 'bash', '-lc', cmd], { detached: true }); return cmd;
}

const SYSTEM = {
  premiere: 'إنت مونتير فيديو محترف شغّال جوه Adobe Premiere Pro المفتوح عند المستخدم، عن طريق أدوات EditFast (MCP: editfast). مفيش عندك غير الأدوات دي — مفيش تيرمنال ولا ملفات. قبل أول شغل اقرا premiere_guide وشوف premiere_get_project_state. اشتغل خطوة خطوة، وبص على النتيجة (صور / حالة السيكوينس) وصلّح. اتكلم بالعامية المصرية باختصار، وفي الآخر قول اللي اتعمل في سطرين.',
  ae: 'إنت مصمم موشن جرافيك ومونتير محترف شغّال جوه Adobe After Effects المفتوح عند المستخدم، عن طريق أدوات EditFast Motion (MCP: editfast). مفيش عندك غير الأدوات دي — مفيش تيرمنال ولا ملفات. قبل أول شغل اقرا ae_guide وشوف ae_status. ابني بـ ae_build_scene أو ae_tool، وبعدين بص على النتيجة بـ ae_look وصلّح لحد ما يبقى احترافي. اتكلم بالعامية المصرية باختصار، وفي الآخر قول اللي اتعمل في سطرين.'
};

/**
 * One conversation. send(text) runs `claude -p` (resuming the same session after the first turn) and reports:
 * { type: 'text', text } · { type: 'tool', name, input } · { type: 'tool_result', isError, text } · { type: 'done', isError, result, cost } · { type: 'error', message }
 */
class ClaudeChat {
  constructor({ bin, app, mcp, cwd, model, token, client, session, onEvent }) {
    this.bin = bin; this.app = app; this.mcp = mcp; this.model = model; this.token = token || null; this.client = client || null; this.onEvent = onEvent || (() => {});
    this.cwd = cwd || path.join(os.tmpdir(), 'editfast-claude'); fs.mkdirSync(this.cwd, { recursive: true });
    this.session = session || null; this.proc = null;
  }
  get busy() { return !!this.proc; }
  args(text) {
    const a = ['-p', text, '--output-format', 'stream-json', '--verbose',
      '--mcp-config', JSON.stringify(this.mcp), '--strict-mcp-config',
      '--tools', '', '--allowedTools', 'mcp__editfast',
      '--append-system-prompt', (SYSTEM[this.app] || SYSTEM.premiere) + (this.client ? '\nالشغل ده للعميل "' + this.client + '": قبل أي حاجة اقرا ' + (this.app === 'ae' ? 'ae' : 'premiere') + '_client_profile والتزم بستايله، وكل ما المونتير يصحّحك أو يقول تفضيل جديد احفظه بـ ' + (this.app === 'ae' ? 'ae' : 'premiere') + '_client_remember.' : '')];
    if (this.model) a.push('--model', this.model);
    if (this.session) a.push('--resume', this.session);
    return a;
  }
  /** context: text the model reads before the message this turn (e.g. the client's updated profile) */
  send(text, { context } = {}) {
    if (this.proc) return Promise.reject(new Error('Claude لسه شغّال على الطلب اللي قبله'));
    if (context) text = '<context>\n' + context + '\n</context>\n\n' + text;
    const emit = e => { try { this.onEvent(e); } catch (_) {} };
    return new Promise(resolve => {
      const shell = WIN && /\.cmd$/i.test(this.bin);
      const p = this.proc = spawn(this.bin, this.args(text), { cwd: this.cwd, env: childEnv(this.bin, this.token), shell, windowsHide: true });
      let authed = false;
      const auth = t => { if (!authed) { authed = true; emit({ type: 'auth', message: 'Claude مش قادر يسجّل دخول من جوه البانل (' + String(t).slice(0, 120) + ') — اربط بتوكن ثابت من فوق، مرة واحدة وخلاص.' }); } };
      let buf = '', errTxt = '', final = null;
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch (_) { continue; }
          if (m.session_id) this.session = m.session_id;
          if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
            for (const c of m.message.content) {
              if (c.type === 'text' && c.text && c.text.trim()) { if (m.error || (AUTH_ERR.test(c.text) && c.text.length < 300 && /authenticate|oauth|login|api key/i.test(c.text))) auth(c.text); else emit({ type: 'text', text: c.text }); }
              else if (c.type === 'tool_use') { const nm = String(c.name || '').replace(/^mcp__editfast__/, ''); emit({ type: 'tool', id: c.id, name: nm, input: c.input, label: labelOf(nm, c.input) }); }
            }
          } else if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
            for (const c of m.message.content) if (c.type === 'tool_result') emit({ type: 'tool_result', id: c.tool_use_id, isError: !!c.is_error, text: Array.isArray(c.content) ? c.content.filter(x => x.type === 'text').map(x => x.text).join('\n').slice(0, 500) : String(c.content || '').slice(0, 500) });
          } else if (m.type === 'result') final = m;
        }
      });
      p.stderr.on('data', d => { errTxt += d; if (errTxt.length > 4000) errTxt = errTxt.slice(-4000); });
      const finish = code => {
        this.proc = null;
        if (final) { if (final.is_error && AUTH_ERR.test(String(final.result || ''))) auth(final.result); emit({ type: 'done', isError: !!final.is_error, auth: authed, result: final.result, cost: final.total_cost_usd }); return resolve(final); }
        if (AUTH_ERR.test(errTxt)) { auth(errTxt); this.proc = null; return resolve({ is_error: true, result: 'auth' }); }
        const msg = friendly(errTxt, code);
        emit({ type: 'error', message: msg }); resolve({ is_error: true, result: msg });
      };
      p.on('error', e => { errTxt += e.message; finish(-1); });
      p.on('close', finish);
    });
  }
  stop() { if (this.proc) { try { this.proc.kill(); } catch (_) {} } }
  reset() { this.stop(); this.session = null; }
}
function friendly(err, code) {
  const e = String(err || '');
  if (/log ?in|auth|credential|401|unauthori/i.test(e)) return 'Claude Code مش مسجّل دخول — دوس "سجّل دخول" في تاب Claude.';
  if (/rate|limit|usage/i.test(e)) return 'وصلت لحد الاستخدام في اشتراكك دلوقتي — استنى شوية وجرّب تاني.';
  if (/ENOENT|not found/i.test(e)) return 'مش لاقي Claude Code — دوس "ثبّت Claude Code" في تاب Claude.';
  return 'Claude وقف' + (code ? ' (' + code + ')' : '') + (e.trim() ? ': ' + e.trim().split('\n').slice(-3).join(' ').slice(0, 300) : '');
}

module.exports = { ClaudeChat, labelOf, verify, isToken, childEnv, status, find, candidates, terminalCommand, openTerminal, SYSTEM, friendly };

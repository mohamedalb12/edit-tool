/* Stand-ins for the Claude tab's Node modules in the browser tests: Claude Code (status / verify / chat) and the
   client store (in memory). window.__installClaudeFakes(toolName) swaps them in through EF.test.node. */
window.__installClaudeFakes = function (toolName) {
  window.__sent = []; window.__ctx = []; window.__cc = { installed: false }; window.__term = null; window.__reset = false;
  var store = {}, seq = 0;
  var FIELDS = { captions: 'ستايل الكابشن', pace: 'إيقاع المونتاج', music: 'المزيكا', colors: 'ألوان البراند', fonts: 'الخطوط', motion: 'الحركة', format: 'المقاس', sfx: 'المؤثرات' };
  window.__fakeClients = {
    STYLE_FIELDS: FIELDS,
    list: function () { return Object.keys(store).map(function (k) { var c = store[k]; return { id: c.id, name: c.name, memory: c.memory.length }; }); },
    get: function (id) { return store[id] ? JSON.parse(JSON.stringify(store[id])) : null; },
    create: function (name) { var c = { id: 'c' + (++seq), name: name, notes: '', logo: '', style: {}, memory: [], sessions: {} }; store[c.id] = c; return c; },
    update: function (id, p) { var c = store[id]; if (p.name) c.name = p.name; if (p.notes !== undefined) c.notes = p.notes; if (p.style) Object.keys(p.style).forEach(function (k) { c.style[k] = p.style[k]; }); return c; },
    remove: function (id) { delete store[id]; return true; },
    remember: function (id, t) { store[id].memory.push({ text: t }); return store[id]; },
    forget: function (id, i) { store[id].memory.splice(i, 1); return store[id]; },
    profileText: function (c) { return 'العميل: ' + c.name + (c.style.captions ? '\n- ستايل الكابشن: ' + c.style.captions : ''); },
    hashOf: function (c) { return JSON.stringify([c.name, c.style, c.memory.length]); },
    session: function (id, app) { return (store[id] && store[id].sessions[app]) || { session: null, messages: [], seen: null }; },
    saveSession: function (id, app, s) { if (store[id]) store[id].sessions[app] = JSON.parse(JSON.stringify(s)); return store[id]; }
  };
  window.__fakeChat = {
    status: function (o) { var c = JSON.parse(JSON.stringify(window.__cc)); if (o && o.token && c.installed) { c.loggedIn = true; c.method = 'token'; } return Promise.resolve(c); },
    isToken: function (t) { return /^sk-ant-oat01-/.test(t); },
    verify: function (o) { return Promise.resolve(o.token ? { ok: true, message: 'تمام' } : { ok: false, auth: true, message: 'منتهي' }); },
    terminalCommand: function (k) { return k === 'install' ? 'curl -fsSL https://claude.ai/install.sh | bash' : k === 'token' ? 'claude setup-token' : 'claude auth login'; },
    openTerminal: function (k) { window.__term = k; },
    ClaudeChat: function (o) {
      var self = this; this.bin = o.bin; this.token = o.token; this.client = o.client; this.session = o.session; this.busy = false;
      this.stop = function () {}; this.reset = function () { window.__reset = true; self.session = null; };
      this.send = function (t, opt) {
        self.busy = true; window.__sent.push(t); window.__ctx.push(opt && opt.context || null); window.__lastClient = self.client;
        return new Promise(function (r) { setTimeout(function () {
          if (t === 'auth') { o.onEvent({ type: 'auth', message: 'Claude مش قادر يسجّل دخول من جوه البانل — اربط بتوكن ثابت' }); self.busy = false; return r({ is_error: true }); }
          self.session = 'sess-' + (self.client || 'general');
          o.onEvent({ type: 'text', text: 'حاضر' }); o.onEvent({ type: 'tool', id: 't1', name: toolName, label: 'LABEL ' + toolName, input: {} }); o.onEvent({ type: 'tool_result', id: 't1', isError: false, text: 'ok' }); o.onEvent({ type: 'text', text: 'خلصت ✓' }); o.onEvent({ type: 'done' });
          self.busy = false; r({});
        }, 60); });
      };
    }
  };
  var orig = EF.test.node;
  EF.test.node = function (m) { return m === 'claudeChat' ? window.__fakeChat : m === 'clients' ? window.__fakeClients : m === 'mcpBridge' ? { mcpConfig: function () { return {}; } } : orig(m); };
  window.__bridgeClient = null;
  EF.claude._setBridge({ pause: function () {}, setClient: function (id) { window.__bridgeClient = id; } });
  EF.claude._testReset();
  try { Object.keys(localStorage).forEach(function (k) { if (/^ef-claude-/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
};

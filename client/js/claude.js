/* Claude ← → this panel: the local bridge Claude Desktop / Claude Code use (MCP), and its card in the settings. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { app: null, bridge: null, error: null, calls: [] };
  var NAMES = { premiere: 'بريمير', ae: 'الأفتر' };

  EF.claude = {
    /** start the bridge for this panel (called once the services are up) */
    start: function (app) {
      state.app = app;
      var g = (typeof global !== 'undefined' && global) || window;
      try {
        // a panel reload: the old server is still listening in this Node — close it so the port is ours again
        if (g.__efBridges && g.__efBridges[app]) { try { g.__efBridges[app].close(); } catch (e0) {} }
        return EF.node('mcpBridge').start({ app: app, services: EF.services, onCall: function (name) {
          state.calls.unshift({ name: name, at: new Date() }); state.calls.length = Math.min(state.calls.length, 8);
          UI.status('Claude شغّال: ' + name.replace(/^(premiere|ae)_/, ''), 'busy');
          clearTimeout(state.t); state.t = setTimeout(function () { UI.status('متصل'); }, 4000);
        } }).then(function (b) { state.bridge = b; g.__efBridges = g.__efBridges || {}; g.__efBridges[app] = b; return b; })
          .catch(function (e) { state.error = e.message; console.warn('[EditFast] Claude bridge', e); });
      } catch (e) { state.error = e.message; return Promise.resolve(null); }
    },
    info: function () { return { port: state.bridge && state.bridge.port, error: state.error, calls: state.calls.slice() }; },
    /** the settings card: install in Claude Desktop, the Claude Code command, and what Claude did lately */
    card: function () {
      var B = null, st = h('div', { class: 'hint' }), recent = h('div', { class: 'hint ltr' }), cmdText = '';
      try { B = EF.node('mcpBundle'); cmdText = B.claudeCodeCommand(); } catch (eB) {}
      function draw() {
        st.textContent = state.bridge ? '✓ ' + NAMES[state.app] + ' جاهز لـ Claude (البانل لازم يفضل مفتوح)' : '✗ مش جاهز' + (state.error ? ': ' + state.error : '');
        UI.empty(recent);
        state.calls.slice(0, 5).forEach(function (c) { recent.appendChild(h('div', null, c.at.toTimeString().slice(0, 8) + '  ' + c.name)); });
      }
      draw();
      var cmd = h('input', { class: 'grow ltr claude-cmd', readonly: 'readonly', value: cmdText });
      function install() {
        if (!B) return Promise.reject(new Error('مش متاح هنا'));
        var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
        var dir = path.join(os.homedir(), 'Downloads'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { dir = os.tmpdir(); }
        var f = path.join(dir, 'EditFast.mcpb');
        fs.writeFileSync(f, B.build(B.version()));
        try { if (process.platform === 'darwin') cp.spawn('open', [f], { detached: true }); else cp.spawn('cmd', ['/c', 'start', '', f], { detached: true, windowsHide: true }); } catch (e3) {}
        UI.toast('اتعمل ' + f + ' — Claude Desktop هيفتح ويسألك تثبّت: دوس Install ✓');
        return Promise.resolve();
      }
      var card = UI.card('Claude يمنتج هنا',
        st,
        UI.row(UI.btn('ثبّت في Claude Desktop', function () { UI.safe('بيجهّز', install); }, 'primary')),
        UI.hint('بيعمل ملف EditFast.mcpb في التنزيلات ويفتحه — Claude Desktop يسألك "Install" وخلاص. بعدها اكتب لـ Claude مثلًا: "شيل السكتات وحط كابشن هرموزي" أو "اعمل إنترو للوجو ده" وهو يشتغل هنا قدامك. مش محتاج مفتاح API — شغّال باشتراكك في Claude.'),
        UI.row(cmd, UI.btn('انسخ', function () { cmd.select(); try { document.execCommand('copy'); UI.toast('اتنسخ — الصقه في التيرمنال ✓'); } catch (e) {} }, 'small')),
        UI.hint('أو لـ Claude Code: الصق الأمر ده في التيرمنال مرة واحدة.'),
        recent);
      card.classList.add('claude-card');
      return card;
    }
  };
})();

/* تاب Claude: شات مع Claude جوه البانل (Claude Code على الجهاز، باشتراكك) + الحالة واللي اتعمل + إيقاف مؤقت + Claude Desktop. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { app: null, bridge: null, error: null, log: [], lastSeen: null, paused: false, view: null, chat: [], engine: null, cc: null, ccAt: 0 };
  var NAMES = { premiere: 'بريمير', ae: 'الأفتر' };
  var EXAMPLES = {
    premiere: [
      'شيل السكتات والحشو من الفيديو ده وحط كابشن هرموزي',
      'منتج الفوتيج اللي في فولدر ~/Desktop/shoot ريل 30 ثانية بإيقاع سريع على المزيكا',
      'اعمل من الفيديو الطويل ده 3 شورتس طولي بكابشن',
      'نضّف الصوت ووطّي المزيكا وقت الكلام',
      'بص على الفيديو وقولي أحسن 5 لقطات وحطلهم ماركرز'
    ],
    ae: [
      'اعمل إنترو 5 ثواني للوجو ده بستايل نيون (المسار: ~/Desktop/logo.png)',
      'ابنيلي لوور ثيرد احترافي باسم "محمد أيمن – مونتير" بألوان برتقالي وأسود',
      'عدّاد من 0 لـ 2,500,000 جنيه بستايل كارت مع عنوان "المبيعات"',
      'خلّي العنوان أكبر وأبطأ وزوّد جلو خفيف',
      'اعمل مشهد عقارات: المبنى طبيعي والباقي أزرق مع كارت السعر'
    ]
  };

  function label(e) {
    var n = String(e.name || '').replace(/^(premiere|ae)_/, '').replace(/_/g, ' ');
    if (e.name === 'ae_tool' && e.args && e.args.name) n = 'أداة: ' + e.args.name;
    return n;
  }
  function onEvent(e) {
    if (e.phase === 'seen') { state.lastSeen = new Date(); return refresh(); }
    if (e.phase === 'start') { state.log.unshift({ name: e.name, args: e.args, label: label(e), at: new Date(), status: 'run' }); state.log.length = Math.min(state.log.length, 40); UI.status('Claude شغّال: ' + label(e), 'busy'); }
    else {
      var row = state.log.find(function (r) { return r.name === e.name && r.status === 'run'; });
      if (e.phase === 'blocked') state.log.unshift({ name: e.name, label: label(e), at: new Date(), status: 'blocked' });
      else if (row) { row.status = e.phase === 'done' ? 'ok' : 'err'; row.ms = e.ms; row.error = e.error; }
      clearTimeout(state.t); state.t = setTimeout(function () { UI.status('متصل'); }, 2500);
    }
    refresh();
  }
  function refresh() { if (state.view && state.view.isConnected && EF.currentTab === 'claude' && state.draw) state.draw(); }
  function ago(d) {
    if (!d) return 'لسه';
    var s = Math.round((Date.now() - d.getTime()) / 1000);
    return s < 10 ? 'دلوقتي' : s < 60 ? 'من ' + s + ' ثانية' : s < 3600 ? 'من ' + Math.round(s / 60) + ' دقيقة' : 'من ' + Math.round(s / 3600) + ' ساعة';
  }
  function copy(text, what) {
    var t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); UI.toast((what || 'اتنسخ') + ' ✓'); } catch (e) {}
    t.remove();
  }
  function bundle() { try { return EF.node('mcpBundle'); } catch (e) { return null; } }
  function chatMod() { try { return EF.node('claudeChat'); } catch (e) { return null; } }

  EF.claude = {
    /** start the bridge for this panel (called once the services are up) */
    start: function (app) {
      state.app = app;
      var g = (typeof global !== 'undefined' && global) || window;
      try {
        // a panel reload: the old server is still listening in this Node — close it so the port is ours again
        if (g.__efBridges && g.__efBridges[app]) { try { g.__efBridges[app].close(); } catch (e0) {} }
        return EF.node('mcpBridge').start({ app: app, services: EF.services, onCall: onEvent })
          .then(function (b) { state.bridge = b; state.error = null; if (state.paused) b.pause(true); g.__efBridges = g.__efBridges || {}; g.__efBridges[app] = b; refresh(); return b; })
          .catch(function (e) { state.error = e.message; console.warn('[EditFast] Claude bridge', e); refresh(); });
      } catch (e) { state.error = e.message; return Promise.resolve(null); }
    },
    info: function () { return { port: state.bridge && state.bridge.port, error: state.error, log: state.log.slice(), paused: state.paused, lastSeen: state.lastSeen }; },
    /** for tests: what the bridge reports, and a stand-in bridge */
    _event: onEvent,
    _setBridge: function (b) { state.bridge = b; },
    _testReset: function () { state.cc = null; state.ccAt = 0; state.chat = []; state.engine = null; },
    /** the tab itself: a chat with Claude right here (Claude Code on this machine), plus setup and Claude Desktop */
    tab: function (app) {
      return {
        id: 'claude', icon: '✳', label: 'Claude', title: 'Claude',
        render: function (view) {
          state.app = state.app || app; state.view = view;
          var B = bundle(), C = chatMod();
          var setupBox = h('div'), chatBox = h('div', { class: 'chat claude-chat' }), logBox = h('div', { class: 'claude-log' }), statusBox = h('div', { class: 'claude-status' });
          var input = h('textarea', { class: 'grow claude-input', rows: 3, placeholder: state.app === 'ae' ? 'قول لـ Claude عايز إيه في الأفتر… (مثلًا: اعمل إنترو للوجو بنيون)' : 'قول لـ Claude عايز إيه في الفيديو… (مثلًا: شيل السكتات وحط كابشن)' });
          var sendBtn, stopBtn, pauseBtn;
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });

          function drawChat() {
            UI.empty(chatBox);
            state.chat.forEach(function (m) {
              if (m.role === 'tool') chatBox.appendChild(h('div', { class: 'msg tool' + (m.status === 'ok' ? ' ok' : m.status === 'err' ? ' fail' : '') , title: m.detail || '' }, m.label));
              else chatBox.appendChild(h('div', { class: 'msg ' + (m.role === 'user' ? 'user' : m.role === 'error' ? 'ai err' : 'ai') }, m.text));
            });
            if (state.engine && state.engine.busy) chatBox.appendChild(h('div', { class: 'msg tool' }, 'Claude بيفكّر…'));
            chatBox.scrollTop = chatBox.scrollHeight;
            if (sendBtn) sendBtn.disabled = !!(state.engine && state.engine.busy);
            if (stopBtn) stopBtn.style.display = state.engine && state.engine.busy ? '' : 'none';
          }
          function drawSetup() {
            UI.empty(setupBox);
            var cs = state.cc;
            if (!cs) { setupBox.appendChild(UI.hint('بيدوّر على Claude Code…')); return; }
            if (cs.installed && cs.loggedIn) { setupBox.appendChild(h('div', { class: 'claude-st ok' }, h('b', null, '✓'), ' Claude Code ' + (cs.version || '') + ' متسجّل — اكتب وهو يشتغل هنا (باشتراكك، من غير مفتاح API)')); return; }
            var steps = h('div', { class: 'claude-status' });
            steps.appendChild(h('div', { class: 'claude-st ' + (cs.installed ? 'ok' : 'bad') }, h('b', null, cs.installed ? '✓' : '1'), cs.installed ? ' Claude Code متسطب' : ' ثبّت Claude Code (مرة واحدة — دقيقة)'));
            steps.appendChild(h('div', { class: 'claude-st ' + (cs.loggedIn ? 'ok' : 'bad') }, h('b', null, cs.loggedIn ? '✓' : '2'), ' سجّل دخول بحساب Claude بتاعك (الاشتراك)'));
            setupBox.appendChild(UI.card('عشان تكلّم Claude هنا',
              steps,
              UI.row(
                !cs.installed ? UI.btn('ثبّت Claude Code', function () { term('install'); }, 'primary') : null,
                cs.installed && !cs.loggedIn ? UI.btn('سجّل دخول', function () { term('login'); }, 'primary') : null,
                UI.btn('اتأكد تاني', function () { check(true); }, 'small')),
              UI.hint('بيفتح التيرمنال ويكتب الأمر لوحده: ' + (C ? C.terminalCommand(cs.installed ? 'login' : 'install') : '') + ' — في تسجيل الدخول المتصفح هيفتح، وافق، وارجع هنا ودوس "اتأكد تاني".')));
          }
          function term(kind) { try { C.openTerminal(kind); UI.toast(kind === 'install' ? 'التيرمنال فتح وبيسطّب — لما يخلص دوس "اتأكد تاني"' : 'التيرمنال فتح — كمّل تسجيل الدخول في المتصفح، وبعدين "اتأكد تاني"'); } catch (e) { UI.toast(e.message, true); } }
          function check(force) {
            if (!C) { state.cc = { installed: false }; return drawSetup(); }
            if (state.cc && !force && Date.now() - state.ccAt < 60000) return drawSetup();
            if (force) { state.cc = null; drawSetup(); }
            C.status().then(function (r) { state.cc = r; state.ccAt = Date.now(); drawSetup(); }).catch(function () { state.cc = { installed: false }; drawSetup(); });
          }
          function send(textArg) {
            var text = (textArg || input.value).trim();
            if (!text) return;
            if (!state.bridge) return UI.toast('البانل لسه بيجهّز الاتصال — ثانية وجرّب', true);
            if (!state.cc || !state.cc.installed || !state.cc.loggedIn) { check(true); return UI.toast('ثبّت Claude Code وسجّل دخول الأول (فوق)', true); }
            if (!state.engine || state.engine.bin !== state.cc.bin) {
              state.engine = new C.ClaudeChat({ bin: state.cc.bin, app: state.app, mcp: EF.node('mcpBridge').mcpConfig(state.bridge), onEvent: onChat });
            }
            if (state.engine.busy) return;
            input.value = '';
            state.chat.push({ role: 'user', text: text });
            drawChat();
            state.engine.send(text).then(drawChat);
            drawChat();
          }
          function onChat(e) {
            if (e.type === 'text') state.chat.push({ role: 'ai', text: e.text });
            else if (e.type === 'tool') state.chat.push({ role: 'tool', id: e.id, label: e.label || label({ name: e.name, args: e.input }), status: 'run' });
            else if (e.type === 'tool_result') { var t = state.chat.filter(function (m) { return m.role === 'tool' && m.id === e.id; })[0]; if (t) { t.status = e.isError ? 'err' : 'ok'; t.detail = e.text; if (e.isError) state.chat.push({ role: 'error', text: '✗ ' + (e.text || 'الأداة فشلت') }); } }
            else if (e.type === 'error') state.chat.push({ role: 'error', text: e.message });
            if (state.view && state.view.isConnected && EF.currentTab === 'claude') drawChat();
          }
          state.redrawChat = drawChat;

          // the chat
          view.appendChild(setupBox);
          var ex = h('div', { class: 'chips claude-examples' });
          (EXAMPLES[state.app] || EXAMPLES.premiere).forEach(function (t) { ex.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { input.value = t; input.focus(); } }, t)); });
          view.appendChild(UI.card('كلّم Claude', chatBox,
            UI.row(input),
            UI.row(sendBtn = UI.btn('ابعت', function () { send(); }, 'primary'),
              stopBtn = UI.btn('■ وقّف', function () { if (state.engine) state.engine.stop(); }, 'small'),
              UI.btn('محادثة جديدة', function () { if (state.engine) state.engine.reset(); state.chat = []; drawChat(); }, 'small')),
            UI.hint('Ctrl/⌘ + Enter يبعت. Claude بيشتغل في ' + NAMES[state.app] + ' قدامك وانت شايف كل خطوة، وتقدر تكمّل معاه في نفس المحادثة ("كبّر العنوان"، "رجّع اللي فات").'),
            ex));

          // status, pause, live log
          state.draw = function () {
            UI.empty(statusBox);
            var rows = [
              [!!state.bridge, state.bridge ? NAMES[state.app] + ' جاهز لـ Claude' : 'البانل مش جاهز' + (state.error ? ': ' + state.error : '')],
              [state.lastSeen ? true : null, 'آخر مرة Claude استخدم أداة هنا: ' + ago(state.lastSeen)]
            ];
            rows.forEach(function (r) { statusBox.appendChild(h('div', { class: 'claude-st ' + (r[0] === true ? 'ok' : r[0] === false ? 'bad' : 'wait') }, h('b', null, r[0] === true ? '✓' : r[0] === false ? '✗' : '•'), ' ', r[1])); });
            if (state.paused) statusBox.appendChild(h('div', { class: 'claude-st bad' }, h('b', null, '⏸'), ' Claude متوقّف مؤقتًا — مش هيقدر يعمل حاجة لحد ما تشغّله'));
            if (pauseBtn) pauseBtn.textContent = state.paused ? '▶ شغّل Claude تاني' : '⏸ وقّف Claude مؤقتًا';
            UI.empty(logBox);
            if (!state.log.length) logBox.appendChild(UI.hint('لسه Claude ماعملش حاجة.'));
            state.log.forEach(function (r) {
              var icon = r.status === 'run' ? '⏳' : r.status === 'ok' ? '✓' : r.status === 'blocked' ? '⏸' : '✗';
              logBox.appendChild(h('div', { class: 'claude-row ' + r.status },
                h('span', { class: 'ic' }, icon), h('span', { class: 'nm' }, r.label),
                h('span', { class: 'tm ltr' }, r.at.toTimeString().slice(0, 8) + (r.ms ? ' · ' + (r.ms / 1000).toFixed(1) + 's' : '')),
                r.error ? h('div', { class: 'hint err' }, r.error) : null));
            });
          };
          view.appendChild(UI.card('الحالة واللي اتعمل', statusBox,
            UI.row(pauseBtn = UI.btn('⏸ وقّف Claude مؤقتًا', function () { state.paused = !state.paused; if (state.bridge) state.bridge.pause(state.paused); state.draw(); }, 'small'),
              UI.btn('اتصل تاني', function () { EF.claude.start(state.app); }, 'small')),
            logBox));

          // Claude Desktop / Claude Code in the terminal (optional)
          var cmdText = ''; try { cmdText = B ? B.claudeCodeCommand() : ''; } catch (e) {}
          var ds = null; try { ds = B && B.desktopStatus(); } catch (e2) {}
          view.appendChild(UI.card('أو من Claude Desktop (اختياري)',
            h('div', { class: 'claude-st ' + (ds && ds.installed ? 'ok' : 'wait') }, h('b', null, ds && ds.installed ? '✓' : '•'), ds && ds.installed ? ' EditFast متثبّت في Claude Desktop' : ' مش متثبّت في Claude Desktop'),
            UI.row(UI.btn('ثبّت في Claude Desktop', function () { UI.safe('بيجهّز', install); }, 'small')),
            UI.row(h('input', { class: 'grow ltr claude-cmd', readonly: 'readonly', value: cmdText }), UI.btn('انسخ', function () { copy(cmdText, 'اتنسخ — الصقه في التيرمنال'); }, 'small')),
            UI.hint('ده لو حابب تكلّم Claude من برنامج Claude Desktop أو من Claude Code في التيرمنال بدل الشات اللي فوق — نفس الأدوات.')));
          check(false); drawChat(); state.draw();
        }
      };
    }
  };

  EF.tabs = EF.tabs || [];
  EF.tabs.push(EF.claude.tab(window.EF_APP === 'ae' ? 'ae' : 'premiere'));

  function install() {
    var B = bundle();
    if (!B) return Promise.reject(new Error('مش متاح هنا'));
    var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
    var dir = path.join(os.homedir(), 'Downloads'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { dir = os.tmpdir(); }
    var f = path.join(dir, 'EditFast.mcpb');
    fs.writeFileSync(f, B.build(B.version()));
    try { if (process.platform === 'darwin') cp.spawn('open', [f], { detached: true }); else cp.spawn('cmd', ['/c', 'start', '', f], { detached: true, windowsHide: true }); } catch (e3) {}
    UI.toast('اتعمل ' + f + ' — Claude Desktop هيفتح ويسألك تثبّت: دوس Install ✓');
    return Promise.resolve();
  }
})();

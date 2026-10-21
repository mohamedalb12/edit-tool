/* تاب Claude: شات مع Claude جوه البانل (Claude Code على الجهاز، باشتراكك) + الحالة واللي اتعمل + إيقاف مؤقت + Claude Desktop. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { app: null, bridge: null, error: null, log: [], lastSeen: null, paused: false, view: null, chat: [], engine: null, cc: null, ccAt: 0, client: undefined, sessionId: null, seen: null, editing: false, authFailed: false };
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
  function clientsMod() { try { return EF.node('clients'); } catch (e) { return null; } }

  EF.claude = {
    /** start the bridge for this panel (called once the services are up) */
    start: function (app) {
      state.app = app;
      var g = (typeof global !== 'undefined' && global) || window;
      try {
        // a panel reload: the old server is still listening in this Node — close it so the port is ours again
        if (g.__efBridges && g.__efBridges[app]) { try { g.__efBridges[app].close(); } catch (e0) {} }
        return EF.node('mcpBridge').start({ app: app, services: EF.services, onCall: onEvent })
          .then(function (b) { state.bridge = b; state.error = null; if (state.paused) b.pause(true); if (b.setClient) b.setClient(state.client || null); g.__efBridges = g.__efBridges || {}; g.__efBridges[app] = b; refresh(); return b; })
          .catch(function (e) { state.error = e.message; console.warn('[EditFast] Claude bridge', e); refresh(); });
      } catch (e) { state.error = e.message; return Promise.resolve(null); }
    },
    info: function () { return { port: state.bridge && state.bridge.port, error: state.error, log: state.log.slice(), paused: state.paused, lastSeen: state.lastSeen }; },
    /** for tests: what the bridge reports, and a stand-in bridge */
    _event: onEvent,
    _setBridge: function (b) { state.bridge = b; },
    _testReset: function () { state.cc = null; state.ccAt = 0; state.chat = []; state.engine = null; state.client = undefined; state.authFailed = false; },
    /** the tab itself: clients + a chat with Claude right here (Claude Code on this machine), status, Claude Desktop */
    tab: function (app) {
      return {
        id: 'claude', icon: '✳', label: 'Claude', title: 'Claude',
        render: function (view) {
          state.app = state.app || app; state.view = view;
          var B = bundle(), C = chatMod(), K = clientsMod(), S = EF.services;
          var KEY = 'ef-claude-client-' + state.app;
          if (state.client === undefined) { try { state.client = localStorage.getItem(KEY) || null; } catch (e) { state.client = null; } if (state.client && K && !K.get(state.client)) state.client = null; loadConversation(); }
          var clientBar = h('div', { class: 'claude-clients' }), editBox = h('div'), setupBox = h('div'), chatBox = h('div', { class: 'chat claude-chat' }), logBox = h('div', { class: 'claude-log' }), statusBox = h('div', { class: 'claude-status' });
          var input = h('textarea', { class: 'grow claude-input', rows: 2 });
          var sendBtn, stopBtn, pauseBtn, chatCard;
          // Enter sends · Shift+Enter = new line
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

          function token() { return (S && S.settings && S.settings.keys && S.settings.keys.claudeToken) || ''; }
          function clientObj() { return state.client && K ? K.get(state.client) : null; }
          function loadConversation() {
            var rec = null;
            if (state.client && K) rec = K.session(state.client, state.app);
            else { try { rec = JSON.parse(localStorage.getItem('ef-claude-general-' + state.app) || 'null'); } catch (e) {} }
            rec = rec || { session: null, messages: [], seen: null };
            state.chat = rec.messages || []; state.sessionId = rec.session || null; state.seen = rec.seen || null; state.engine = null;
            if (state.bridge && state.bridge.setClient) state.bridge.setClient(state.client);
          }
          function saveConversation() {
            var rec = { session: state.engine ? state.engine.session : state.sessionId, messages: state.chat.filter(function (m) { return m.role !== 'tool' || m.status !== 'run'; }).slice(-200), seen: state.seen };
            state.sessionId = rec.session;
            if (state.client && K) K.saveSession(state.client, state.app, rec);
            else { try { localStorage.setItem('ef-claude-general-' + state.app, JSON.stringify(rec)); } catch (e) {} }
          }
          function pick(id) {
            if (state.engine && state.engine.busy) return UI.toast('استنى Claude يخلّص الأول', true);
            saveConversation();
            state.client = id || null; state.editing = false;
            try { if (state.client) localStorage.setItem(KEY, state.client); else localStorage.removeItem(KEY); } catch (e) {}
            loadConversation(); drawClients(); drawEdit(); drawChat();
          }

          function drawClients() {
            UI.empty(clientBar);
            var list = K ? K.list() : [];
            var sel = h('select', { class: 'grow claude-client-pick', onchange: function () { pick(sel.value || null); } });
            sel.appendChild(h('option', { value: '' }, 'من غير عميل (محادثة عامة)'));
            list.forEach(function (c) { var o = h('option', { value: c.id }, c.name + (c.memory ? ' · ' + c.memory + ' ملاحظة' : '')); if (c.id === state.client) o.selected = true; sel.appendChild(o); });
            clientBar.appendChild(UI.row(h('label', null, 'العميل'), sel,
              UI.btn('+ عميل', function () { state.adding = !state.adding; drawClients(); }, 'small'),
              state.client ? UI.btn('ملفه', function () { state.editing = !state.editing; drawEdit(); }, 'small') : null));
            if (state.adding) {
              var nm = h('input', { class: 'grow claude-new-client', placeholder: 'اسم العميل (مثلًا: مطعم الشيف، شركة النور العقارية)' });
              var add = function () { var n = nm.value.trim(); if (!n) return; var c = K.create(n); state.adding = false; pick(c.id); state.editing = true; drawEdit(); };
              nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
              clientBar.appendChild(UI.row(nm, UI.btn('أضف', add, 'primary')));
              setTimeout(function () { nm.focus(); }, 30);
            }
          }
          function drawEdit() {
            UI.empty(editBox);
            var c = clientObj();
            if (!c || !state.editing) return;
            var f = { name: h('input', { class: 'grow', value: c.name }), notes: h('textarea', { class: 'grow', rows: 3, placeholder: 'أي حاجة عن العميل: نوع المحتوى، الجمهور، حاجات بيحبها أو بيكرهها…' }), logo: h('input', { class: 'grow ltr', value: c.logo || '', placeholder: 'مسار اللوجو' }) };
            f.notes.value = c.notes || '';
            var st = {}, rows = [];
            Object.keys(K.STYLE_FIELDS).forEach(function (k) { st[k] = h('input', { class: 'grow', value: (c.style && c.style[k]) || '', placeholder: K.STYLE_FIELDS[k] }); rows.push(UI.row(h('label', null, K.STYLE_FIELDS[k].split(' (')[0]), st[k])); });
            var mem = h('div', { class: 'claude-memory' });
            (c.memory || []).forEach(function (m, i) { mem.appendChild(h('div', { class: 'claude-row ok' }, h('span', { class: 'ic' }, '•'), h('span', { class: 'nm' }, m.text), h('button', { type: 'button', class: 'chip', title: 'امسح', onclick: function () { K.forget(c.id, i); drawEdit(); drawClients(); } }, '✕'))); });
            if (!(c.memory || []).length) mem.appendChild(UI.hint('لسه مفيش — Claude بيكتب هنا كل ما تصحّحه أو تقول تفضيل للعميل ده.'));
            editBox.appendChild(UI.card('ملف ' + c.name,
              UI.row(h('label', null, 'الاسم'), f.name),
              rows,
              UI.row(h('label', null, 'اللوجو'), f.logo, UI.btn('اختار…', function () { var p = EF.pickFile && EF.pickFile('اللوجو', ['png', 'jpg', 'jpeg', 'svg', 'ai', 'psd']); if (p) f.logo.value = p; }, 'small')),
              UI.row(f.notes),
              h('h4', null, 'اللي Claude اتعلمه عن ذوقه'), mem,
              UI.row(UI.btn('احفظ', function () {
                var style = {}; Object.keys(st).forEach(function (k) { style[k] = st[k].value.trim(); });
                K.update(c.id, { name: f.name.value.trim() || c.name, notes: f.notes.value, logo: f.logo.value.trim(), style: style });
                state.editing = false; drawClients(); drawEdit(); UI.toast('اتحفظ ✓ — Claude هيقراه في الرسالة الجاية');
              }, 'primary'), (function () { var del = UI.btn('امسح العميل', function () { if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'متأكد؟ هيتمسح هو ومحادثاته — دوس تاني'; return; } K.remove(c.id); pick(null); }, 'small'); return del; })())));
          }

          function drawChat() {
            UI.empty(chatBox);
            state.chat.forEach(function (m) {
              if (m.role === 'tool') chatBox.appendChild(h('div', { class: 'msg tool' + (m.status === 'ok' ? ' ok' : m.status === 'err' ? ' fail' : ''), title: m.detail || '' }, m.label));
              else chatBox.appendChild(h('div', { class: 'msg ' + (m.role === 'user' ? 'user' : m.role === 'error' ? 'ai err' : 'ai') }, m.text));
            });
            if (state.engine && state.engine.busy) chatBox.appendChild(h('div', { class: 'msg tool' }, 'Claude بيفكّر…'));
            chatBox.scrollTop = chatBox.scrollHeight;
            if (sendBtn) sendBtn.disabled = !!(state.engine && state.engine.busy);
            if (stopBtn) stopBtn.style.display = state.engine && state.engine.busy ? '' : 'none';
            var c = clientObj();
            input.placeholder = (c ? 'لـ ' + c.name + ': ' : '') + (state.app === 'ae' ? 'قول لـ Claude عايز إيه في الأفتر… (Enter يبعت)' : 'قول لـ Claude عايز إيه في الفيديو… (Enter يبعت)');
            if (chatCard) { var t = chatCard.querySelector('h3'); if (t) t.textContent = c ? 'كلّم Claude — ' + c.name : 'كلّم Claude'; }
          }
          function drawSetup() {
            UI.empty(setupBox);
            var cs = state.cc;
            if (!cs) { setupBox.appendChild(UI.hint('بيدوّر على Claude Code…')); return; }
            if (cs.installed && cs.loggedIn && !state.authFailed) { setupBox.appendChild(h('div', { class: 'claude-st ok' }, h('b', null, '✓'), ' Claude Code ' + (cs.version || '') + (cs.method === 'token' ? ' متربط بتوكن ثابت' : ' متسجّل') + ' — اكتب وهو يشتغل هنا (باشتراكك، من غير مفتاح API)')); return; }
            if (!cs.installed) {
              setupBox.appendChild(UI.card('عشان تكلّم Claude هنا',
                h('div', { class: 'claude-st bad' }, h('b', null, '1'), ' ثبّت Claude Code (مرة واحدة — دقيقة)'),
                UI.row(UI.btn('ثبّت Claude Code', function () { term('install'); }, 'primary'), UI.btn('اتأكد تاني', function () { check(true); }, 'small')),
                UI.hint('بيفتح التيرمنال ويسطّب لوحده: ' + (C ? C.terminalCommand('install') : ''))));
              return;
            }
            // installed: link the account with a long-lived token (works from inside Adobe apps), or a normal login
            var tok = h('input', { class: 'grow ltr claude-token', type: 'password', placeholder: 'sk-ant-oat01-…', value: token() });
            var res = h('div', { class: 'hint' });
            setupBox.appendChild(UI.card(state.authFailed ? 'Claude محتاج تربط حسابك تاني' : 'اربط حسابك في Claude (مرة واحدة)',
              state.authFailed ? h('div', { class: 'claude-st bad' }, h('b', null, '✗'), ' تسجيل الدخول اللي في Claude Code انتهى أو مش واصل للبانل — التوكن الثابت بيحل ده نهائي (سنة كاملة).') : null,
              h('div', { class: 'claude-st wait' }, h('b', null, '1'), ' دوس "اعمل توكن" ← التيرمنال يفتح والمتصفح يطلب موافقة ← وافق'),
              h('div', { class: 'claude-st wait' }, h('b', null, '2'), ' هيطبعلك توكن بيبدأ بـ sk-ant-oat01 — انسخه والصقه هنا ودوس "احفظ واتأكد"'),
              UI.row(UI.btn('اعمل توكن', function () { term('token'); }, 'primary')),
              UI.row(tok, UI.btn('احفظ واتأكد', function () {
                var t = tok.value.trim();
                if (!C.isToken(t)) { res.textContent = 'ده مش شكل التوكن — لازم يبدأ بـ sk-ant-oat01-'; return; }
                S.saveSettings({ keys: { claudeToken: t } });
                res.textContent = 'بيجرّب…';
                return C.verify({ bin: cs.bin, token: t }).then(function (r) {
                  res.textContent = r.ok ? '✓ Claude رد: ' + r.message : '✗ ' + r.message;
                  if (r.ok) { state.authFailed = false; state.engine = null; check(true); }
                });
              }, 'small')),
              res,
              UI.hint('أو تسجيل دخول عادي: ' + (C ? C.terminalCommand('login') : '')),
              UI.row(UI.btn('سجّل دخول عادي', function () { term('login'); }, 'small'), UI.btn('اتأكد تاني', function () { state.authFailed = false; check(true); }, 'small'))));
          }
          function term(kind) { try { C.openTerminal(kind); UI.toast(kind === 'install' ? 'التيرمنال فتح وبيسطّب — لما يخلص دوس "اتأكد تاني"' : kind === 'token' ? 'التيرمنال فتح — وافق في المتصفح وانسخ التوكن اللي هيظهر' : 'التيرمنال فتح — كمّل تسجيل الدخول في المتصفح'); } catch (e) { UI.toast(e.message, true); } }
          function check(force) {
            if (!C) { state.cc = { installed: false }; return drawSetup(); }
            if (state.cc && !force && Date.now() - state.ccAt < 60000) return drawSetup();
            if (force) { state.cc = null; drawSetup(); }
            C.status({ token: token() }).then(function (r) { state.cc = r; state.ccAt = Date.now(); drawSetup(); }).catch(function () { state.cc = { installed: false }; drawSetup(); });
          }
          function send(textArg) {
            var text = (textArg || input.value).trim();
            if (!text) return;
            if (!state.bridge) return UI.toast('البانل لسه بيجهّز الاتصال — ثانية وجرّب', true);
            if (!state.cc || !state.cc.installed || !state.cc.loggedIn) { check(true); return UI.toast('ثبّت Claude Code واربط حسابك الأول (فوق)', true); }
            var c = clientObj();
            if (!state.engine || state.engine.bin !== state.cc.bin || state.engine.token !== (token() || null)) {
              state.engine = new C.ClaudeChat({ bin: state.cc.bin, app: state.app, mcp: EF.node('mcpBridge').mcpConfig(state.bridge), token: token() || null, client: c ? c.name : null, session: state.sessionId, onEvent: onChat });
            }
            if (state.engine.busy) return;
            if (state.bridge.setClient) state.bridge.setClient(state.client);
            // the client's profile goes with the message whenever it changed since Claude last read it
            var ctx = null;
            if (c && K) { var hs = K.hashOf(c); if (hs !== state.seen) { ctx = K.profileText(c); state.seen = hs; } }
            input.value = '';
            state.chat.push({ role: 'user', text: text });
            drawChat();
            state.engine.send(text, { context: ctx }).then(function (r) { if (r && r.is_error && state.authFailed) state.seen = null; saveConversation(); drawChat(); });
            drawChat();
          }
          function onChat(e) {
            if (e.type === 'text') state.chat.push({ role: 'ai', text: e.text });
            else if (e.type === 'tool') state.chat.push({ role: 'tool', id: e.id, label: e.label || label({ name: e.name, args: e.input }), status: 'run' });
            else if (e.type === 'tool_result') { var t = state.chat.filter(function (m) { return m.role === 'tool' && m.id === e.id; })[0]; if (t) { t.status = e.isError ? 'err' : 'ok'; t.detail = e.text; if (e.isError) state.chat.push({ role: 'error', text: '✗ ' + (e.text || 'الأداة فشلت') }); } }
            else if (e.type === 'auth') { state.authFailed = true; state.chat.push({ role: 'error', text: e.message }); if (state.view && state.view.isConnected) drawSetup(); }
            else if (e.type === 'error') state.chat.push({ role: 'error', text: e.message });
            else if (e.type === 'done' && clientsMod() && state.client) { drawClients(); if (state.editing) drawEdit(); }
            if (state.view && state.view.isConnected && EF.currentTab === 'claude') drawChat();
          }

          // layout: clients · setup · chat · status · Claude Desktop
          view.appendChild(UI.card('العملاء', clientBar, UI.hint('اختار العميل قبل ما تمنتج له: Claude يقرا ستايله (الكابشن، الإيقاع، الألوان…) ويكمّل محادثته من آخر مرة، وأي تصحيح تقوله يتحفظ في ذاكرة العميل ده.'), editBox));
          view.appendChild(setupBox);
          var ex = h('div', { class: 'chips claude-examples' });
          (EXAMPLES[state.app] || EXAMPLES.premiere).forEach(function (t) { ex.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { input.value = t; input.focus(); } }, t)); });
          view.appendChild(chatCard = UI.card('كلّم Claude', chatBox,
            UI.row(input),
            UI.row(sendBtn = UI.btn('ابعت', function () { send(); }, 'primary'),
              stopBtn = UI.btn('■ وقّف', function () { if (state.engine) state.engine.stop(); }, 'small'),
              UI.btn('محادثة جديدة', function () { if (state.engine) state.engine.reset(); state.engine = null; state.sessionId = null; state.seen = null; state.chat = []; saveConversation(); drawChat(); }, 'small')),
            UI.hint('Enter يبعت · Shift+Enter سطر جديد. Claude بيشتغل في ' + NAMES[state.app] + ' قدامك وانت شايف كل خطوة، وتقدر تكمّل معاه ("كبّر العنوان"، "رجّع اللي فات").'),
            ex));
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
          var cmdText = ''; try { cmdText = B ? B.claudeCodeCommand() : ''; } catch (e) {}
          var ds = null; try { ds = B && B.desktopStatus(); } catch (e2) {}
          view.appendChild(UI.card('أو من Claude Desktop (اختياري)',
            h('div', { class: 'claude-st ' + (ds && ds.installed ? 'ok' : 'wait') }, h('b', null, ds && ds.installed ? '✓' : '•'), ds && ds.installed ? ' EditFast متثبّت في Claude Desktop' : ' مش متثبّت في Claude Desktop'),
            UI.row(UI.btn('ثبّت في Claude Desktop', function () { UI.safe('بيجهّز', install); }, 'small')),
            UI.row(h('input', { class: 'grow ltr claude-cmd', readonly: 'readonly', value: cmdText }), UI.btn('انسخ', function () { copy(cmdText, 'اتنسخ — الصقه في التيرمنال'); }, 'small')),
            UI.hint('ده لو حابب تكلّم Claude من برنامج Claude Desktop أو من Claude Code في التيرمنال بدل الشات اللي فوق — نفس الأدوات، ونفس العميل اللي مختاره هنا.')));
          drawClients(); drawEdit(); check(false); drawChat(); state.draw();
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

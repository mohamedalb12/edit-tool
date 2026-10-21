/* تاب Claude: Claude Desktop / Claude Code بيمنتج هنا عن طريق MCP — الحالة، التثبيت، اللي بيعمله لايف، أمثلة، وإيقاف مؤقت. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { app: null, bridge: null, error: null, log: [], lastSeen: null, paused: false, view: null };
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
    /** for tests: what the bridge reports */
    _event: onEvent,
    /** the tab itself */
    tab: function (app) {
      return {
        id: 'claude', icon: '✳', label: 'Claude', title: 'Claude يمنتج هنا',
        render: function (view) {
          state.app = state.app || app; state.view = view;
          var B = bundle();
          var statusBox = h('div', { class: 'claude-status' }), logBox = h('div', { class: 'claude-log' }), pauseBtn;
          state.draw = function () {
            UI.empty(statusBox);
            var ds = null; try { ds = B && B.desktopStatus(); } catch (e) {}
            var rows = [
              [!!state.bridge, state.bridge ? NAMES[state.app] + ' جاهز لـ Claude' : 'البانل مش جاهز' + (state.error ? ': ' + state.error : '')],
              [ds ? ds.installed : null, !ds ? 'Claude Desktop: مش عارف أتأكد' : ds.installed ? 'EditFast متثبّت في Claude Desktop' : ds.app ? 'Claude Desktop موجود بس EditFast مش متثبّت فيه — دوس "ثبّت" تحت' : 'Claude Desktop مش متسطب (أو بتستخدم Claude Code)'],
              [state.lastSeen ? true : null, 'آخر مرة Claude كلّم البانل: ' + ago(state.lastSeen)]
            ];
            rows.forEach(function (r) { statusBox.appendChild(h('div', { class: 'claude-st ' + (r[0] === true ? 'ok' : r[0] === false ? 'bad' : 'wait') }, h('b', null, r[0] === true ? '✓' : r[0] === false ? '✗' : '•'), ' ', r[1])); });
            if (state.paused) statusBox.appendChild(h('div', { class: 'claude-st bad' }, h('b', null, '⏸'), ' Claude متوقّف مؤقتًا — مش هيقدر يعمل حاجة لحد ما تشغّله'));
            if (pauseBtn) pauseBtn.textContent = state.paused ? '▶ شغّل Claude تاني' : '⏸ وقّف Claude مؤقتًا';
            UI.empty(logBox);
            if (!state.log.length) logBox.appendChild(UI.hint('لسه Claude ماعملش حاجة. اكتبله في Claude Desktop أو Claude Code وهتشوف كل خطوة هنا.'));
            state.log.forEach(function (r) {
              var icon = r.status === 'run' ? '⏳' : r.status === 'ok' ? '✓' : r.status === 'blocked' ? '⏸' : '✗';
              logBox.appendChild(h('div', { class: 'claude-row ' + r.status },
                h('span', { class: 'ic' }, icon), h('span', { class: 'nm' }, r.label),
                h('span', { class: 'tm ltr' }, r.at.toTimeString().slice(0, 8) + (r.ms ? ' · ' + (r.ms / 1000).toFixed(1) + 's' : '')),
                r.error ? h('div', { class: 'hint err' }, r.error) : null));
            });
          };
          view.appendChild(UI.card('الحالة', statusBox,
            UI.row(pauseBtn = UI.btn('⏸ وقّف Claude مؤقتًا', function () { state.paused = !state.paused; if (state.bridge) state.bridge.pause(state.paused); state.draw(); }, 'small'),
              UI.btn('اتصل تاني', function () { EF.claude.start(state.app); }, 'small'))));
          var cmdText = ''; try { cmdText = B ? B.claudeCodeCommand() : ''; } catch (e) {}
          view.appendChild(UI.card('التثبيت (مرة واحدة)',
            UI.row(UI.btn('ثبّت في Claude Desktop', function () { UI.safe('بيجهّز', install); }, 'primary')),
            UI.hint('بيعمل ملف EditFast.mcpb في التنزيلات ويفتحه ← Claude Desktop يسألك Install ← دوس Install. مش محتاج مفتاح API، شغّال باشتراكك في Claude.'),
            UI.row(h('input', { class: 'grow ltr claude-cmd', readonly: 'readonly', value: cmdText }), UI.btn('انسخ', function () { copy(cmdText, 'اتنسخ — الصقه في التيرمنال'); }, 'small')),
            UI.hint('لـ Claude Code بدل Claude Desktop: الصق الأمر ده في التيرمنال مرة واحدة.'),
            UI.hint('مهم: البانل ده لازم يفضل مفتوح وانت شغّال مع Claude — ' + (state.app === 'ae' ? 'وممكن تفتح بانل EditFast في بريمير كمان و Claude يشتغل في الاتنين.' : 'وممكن تفتح EditFast Motion في الأفتر كمان و Claude يشتغل في الاتنين.'))));
          var ex = h('div', { class: 'chips claude-examples' });
          (EXAMPLES[state.app] || EXAMPLES.premiere).forEach(function (t) { ex.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { copy(t, 'اتنسخ — الصقه في Claude'); } }, t)); });
          view.appendChild(UI.card('جرّب تقوله', ex, UI.hint('دوس على أي جملة تتنسخ، والصقها في Claude. اكتب بالمصري عادي.')));
          view.appendChild(UI.card('Claude بيعمل إيه دلوقتي', logBox));
          state.draw();
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

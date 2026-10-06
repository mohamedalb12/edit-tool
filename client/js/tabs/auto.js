/* مونتاج تلقائي بضغطة — خطة تراجعها، تنفيذ خطوة بخطوة، وسجل بزرار تراجع. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { steps: null, status: {} };
  EF.tabs.push({
    id: 'auto', icon: '⚡', label: 'مونتاج تلقائي', title: 'مونتاج تلقائي بضغطة',
    render: function (view) {
      var S = EF.services;
      if (!state.steps) state.steps = S.autoEditSteps();
      var list = h('div', { class: 'list steps-list' }), hist = h('div', { class: 'list' });
      function drawSteps() {
        UI.empty(list);
        state.steps.forEach(function (st) {
          var s = state.status[st.id] || {};
          list.appendChild(h('div', { class: 'item step ' + (s.status || '') },
            h('input', { type: 'checkbox', checked: st.on, onchange: function (e) { st.on = e.target.checked; } }),
            h('span', { class: 'step-dot' }),
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, st.label, st.ai ? h('span', { class: 'ai-chip' }, 'AI') : null), s.detail ? h('div', { class: 'hint' }, s.detail) : null)));
        });
      }
      function drawHist() {
        UI.empty(hist);
        if (!S.history.length) { hist.appendChild(h('div', { class: 'item hint' }, 'لسه مفيش حاجة اتعملت.')); return; }
        var groups = [];
        S.history.forEach(function (e) { var g = groups[groups.length - 1]; if (g && g.group === e.group) g.n++; else groups.push({ group: e.group, n: 1, at: e.at }); });
        groups.slice(-12).reverse().forEach(function (g, i) {
          hist.appendChild(h('div', { class: 'item' }, h('span', { class: 't' }, new Date(g.at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })), h('span', { class: 'grow' }, g.group), h('span', { class: 'hint' }, g.n + ' خطوة')));
        });
      }
      S.onHistory = function () { if (document.body.contains(hist)) drawHist(); };
      var go = UI.btn('ابدأ المونتاج', function () {
        state.status = {}; drawSteps();
        UI.safe('بيمنتج', function () {
          return S.runAutoEdit(state.steps, function (ev) { state.status[ev.id] = ev; drawSteps(); })
            .then(function (res) { var ok = Object.keys(res).filter(function (k) { return res[k].ok; }).length, all = Object.keys(res).length; UI.toast('خلص ✓ — ' + ok + ' من ' + all + ' خطوة'); drawHist(); });
        }, go);
      }, 'primary');
      var undo = UI.btn('↶ رجّع آخر عملية', function () {
        UI.safe('بيرجّع', function () { return S.undoLast().then(function (r) { UI.toast(r.message, !!(r.manual && r.manual.length)); drawHist(); }); }, undo);
      });
      view.appendChild(UI.card('الخطة — راجعها قبل ما تبدأ', UI.hint('كل خطوة تقدر تشيلها. القص بيتعمل على نسخة من السيكوينس، وكل حاجة بتتسجل وتقدر ترجعها.'), list, UI.modelPicker('hook'), UI.row(go)));
      view.appendChild(UI.card('السجل', hist, UI.row(undo)));
      drawSteps(); drawHist();
    }
  });
})();

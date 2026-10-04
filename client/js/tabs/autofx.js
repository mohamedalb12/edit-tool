/* المؤثرات التلقائية — بتفهم الكلام. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'autofx', icon: '🎇', label: 'مؤثرات ذكية', title: 'المؤثرات التلقائية (AI)',
    render: function (view) {
      var S = EF.services, density = (S.settings.style && S.settings.style.sfx) || 'medium', list = [];
      var out = h('div'), prog = UI.progress();
      function draw() {
        UI.empty(out);
        if (!list.length) return;
        var box = h('div', { class: 'list', style: { maxHeight: '380px' } });
        list.forEach(function (e) {
          var prompt = e.type === 'sfx' ? h('input', { value: e.prompt, class: 'grow ltr', onchange: function (ev) { e.prompt = ev.target.value; } }) : h('span', { class: 'grow ltr' }, '🎥 ' + e.preset);
          box.appendChild(h('div', { class: 'item' },
            h('input', { type: 'checkbox', checked: e.on !== false, onchange: function (ev) { e.on = ev.target.checked; } }),
            h('span', { class: 't click', onclick: function () { S.setPlayhead(e.time); } }, UI.fmtTime(e.time)),
            h('div', { class: 'grow' }, prompt, h('div', { class: 'hint' }, e.reason || ''))));
        });
        out.appendChild(UI.card('الاقتراحات (' + list.length + ')', box, prog, UI.row(applyBtn)));
      }
      var suggest = UI.btn('اقرا الكلام واقترح', function () {
        UI.safe('بيقرا الكلام', function () { return S.autoEffectsSuggest({ density: density }).then(function (r) { list = r; draw(); if (!r.length) UI.toast('ملقاش لحظات تستاهل'); }); }, suggest);
      }, 'primary');
      var applyBtn = UI.btn('ولّد وطبّق المختار', function () {
        var chosen = list.filter(function (e) { return e.on !== false; });
        UI.safe('بيولّد المؤثرات', function () {
          return S.autoEffectsApply(chosen, function (p) { prog.set(p); }).then(function (r) {
            prog.set(1); UI.toast('اتطبّق ' + r.applied + (r.failed.length ? ' — فشل ' + r.failed.length + ': ' + r.failed[0].error : ''), !!r.failed.length);
          });
        }, applyBtn);
      }, 'primary');
      view.appendChild(UI.card(null,
        UI.hint('بيقرا التفريغ ويفهم بيحصل إيه (نكتة، مفاجأة، رقم مهم، انتقال…) ويقترح صوت أو حركة مناسبة لكل لحظة. مش بيدوّر على قمم صوت.'),
        UI.modelPicker('auto_effects'),
        UI.row(h('label', null, 'الكثافة'), UI.seg([{ value: 'low', label: 'قليل' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'كتير' }], density, function (v) { density = v; })),
        UI.row(suggest)));
      view.appendChild(out);
    }
  });
})();

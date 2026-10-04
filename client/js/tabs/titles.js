/* التايتلات المتحركة — 25 قالب. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'titles', icon: '🔤', label: 'تايتلات', title: 'تايتلات متحركة (25)',
    render: function (view) {
      var S = EF.services, T = window.EFTitles, dur = 3;
      var text = h('input', { placeholder: 'النص (اختياري — تقدر تعدّله بعدين من Essential Graphics)', class: 'grow' });
      var base = S.findBaseMogrt ? S.findBaseMogrt() : null;
      var grid = h('div', { class: 'grid' }), stops = [];
      T.TEMPLATES.forEach(function (t) {
        var cv = h('canvas');
        var tile = h('div', { class: 'tile',
          onmouseenter: function () { stops.push(EF.previewScene(cv, T.toScene(t.id, text.value || null, S.settings.style, { duration: 2.2 }))); },
          onmouseleave: function () { while (stops.length) stops.pop()(); EF.previewScene(cv, T.toScene(t.id, text.value || null, S.settings.style, { duration: 2.2 }), { once: true }); },
          onclick: function () { UI.safe('بينزّل التايتل', function () { return S.addTitle({ template: t.id, text: text.value.trim() || undefined, duration: dur }).then(function (r) { UI.toast(r.editable ? t.name + ' ✓ — عدّل النص من Essential Graphics' : r.note, !r.editable); }); }); }
        }, h('div', { class: 'thumb' }, cv), h('div', { class: 'name' }, t.name));
        grid.appendChild(tile);
        setTimeout(function () { var stop = EF.previewScene(cv, Object.assign(T.toScene(t.id, null, S.settings.style, { duration: 2.2 })), { once: true }); }, 0);
      });
      view.appendChild(UI.card(null, UI.row(text), UI.field('المدة', UI.slider(1, 10, 0.5, dur, function (v) { return v + 's'; }, function (v) { dur = v; })),
        base ? UI.hint('MOGRT الأساسي: ' + base.split(/[\\/]/).pop()) : h('p', { class: 'hint warn' }, 'مش لاقي MOGRT أساسي — التايتلات هتنزل كفيديو شفاف. حدد ملف .mogrt من الإعدادات عشان تبقى قابلة للتعديل من Essential Graphics.'),
        UI.hint('اختار قالب وينزل عند رأس التشغيل. حط الماوس تشوف الحركة.')));
      view.appendChild(grid);
    }
  });
})();

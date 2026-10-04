/* تنظيم المشروع — أوفلاين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'organize', icon: '🗂️', label: 'تنظيم', title: 'تنظيم المشروع (أوفلاين)',
    render: function (view) {
      var S = EF.services, plan = null, out = h('div');
      function draw() {
        UI.empty(out); if (!plan) return;
        if (!plan.moves.length) { out.appendChild(UI.card(null, h('p', { class: 'ok' }, 'المشروع متنظّم بالفعل ✓'))); return; }
        var groups = {};
        plan.moves.forEach(function (m) { (groups[m.to] = groups[m.to] || []).push(m); });
        var box = h('div');
        Object.keys(groups).sort().forEach(function (g) {
          var l = h('div', { class: 'list', style: { maxHeight: '160px' } });
          groups[g].forEach(function (m) { l.appendChild(h('div', { class: 'item' }, h('span', { class: 'grow' }, m.name), h('span', { class: 'hint' }, 'من: ' + m.from))); });
          box.appendChild(h('h3', null, '📁 ' + g + ' (' + groups[g].length + ')')); box.appendChild(l);
        });
        var apply = UI.btn('نفّذ الخطة', function () {
          UI.safe('بينظّم', function () { return S.organizeApply(plan).then(function (r) { UI.toast('اتنقل ' + r.moved + (r.failed.length ? ' — فشل ' + r.failed.length : '') + ' ✓'); plan = null; draw(); }); }, apply);
        }, 'primary');
        out.appendChild(UI.card('الخطة: ' + plan.moves.length + ' عنصر هيتنقل', box, UI.row(apply)));
      }
      var scan = UI.btn('امسح المشروع', function () { UI.safe('بيمسح', function () { return S.organizePlan().then(function (p) { plan = p; draw(); }); }, scan); }, 'primary');
      view.appendChild(UI.card(null, UI.hint('بيرتّب كل حاجة في مجلدات بالنوع (فيديو، صوت/موسيقى، صوت/مؤثرات، صور، جرافيك، كابشن، سيكوينسات). بيوريك الخطة الأول قبل ما يلمس حاجة.'), UI.row(scan)));
      view.appendChild(out);
    }
  });
})();

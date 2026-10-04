/* بحث في الكلام + فصول يوتيوب + ماركرز على الإيقاع. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'search', icon: '🔎', label: 'بحث وماركرز', title: 'بحث وماركرز',
    render: function (view) {
      var S = EF.services, res = h('div', { class: 'list' }), chap = h('div'), every = 1;
      var q = h('input', { placeholder: 'دوّر على أي كلمة اتقالت…', class: 'grow' });
      function doSearch() {
        if (!q.value.trim()) return;
        UI.safe('بيدوّر', function () {
          return S.search(q.value).then(function (hits) {
            UI.empty(res);
            if (!hits.length) res.appendChild(h('div', { class: 'item hint' }, 'ملقيتش حاجة'));
            hits.forEach(function (x) { res.appendChild(h('div', { class: 'item click', onclick: function () { S.setPlayhead(x.start); } }, h('span', { class: 't' }, UI.fmtTime(x.start)), h('span', { class: 'grow' }, x.context))); });
            if (hits.length) S.setPlayhead(hits[0].start);
          });
        });
      }
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
      function chapters(offline) {
        UI.safe('بيطلّع الفصول', function () {
          return S.chapters({ addMarkers: false, offline: offline }).then(function (r) {
            UI.empty(chap);
            var ta = h('textarea', { class: 'ltr', rows: Math.min(14, r.chapters.length + 1), style: { direction: 'rtl' } }, r.youtube);
            chap.appendChild(ta);
            chap.appendChild(UI.row(UI.btn('انسخ', function () { ta.select(); document.execCommand('copy'); UI.toast('اتنسخ ✓'); }, 'small'),
              UI.btn('حطهم ماركرز', function () { UI.safe('بيحط', function () { return S.addMarkers(r.chapters.map(function (c) { return { time: c.time, name: c.title, color: 3 }; })).then(function () { UI.toast('اتحطوا ✓'); }); }); }, 'small')));
          });
        });
      }
      var beatBtn = UI.btn('حط ماركرز على الإيقاع', function () {
        UI.safe('بيسمع الموسيقى', function () { return S.beatMarkers({ every: every }).then(function (r) { UI.toast(r.markers + ' ماركر — ' + r.bpm + ' BPM ✓'); }); }, beatBtn);
      }, 'primary');
      view.appendChild(UI.card('دوّر في الكلام', UI.row(q, UI.btn('دوّر', doSearch, 'primary')), res));
      view.appendChild(UI.card('فصول يوتيوب', UI.modelPicker('chapters'), UI.row(UI.btn('طلّع الفصول (AI)', function () { chapters(false); }, 'primary'), UI.btn('أوفلاين', function () { chapters(true); })), chap));
      view.appendChild(UI.card('ماركرز على الإيقاع (أوفلاين)', UI.hint('بيحلل آخر تراك صوت فيه موسيقى ويحط ماركر على كل بيت.'),
        UI.field('كل', UI.seg([{ value: 1, label: 'بيت' }, { value: 2, label: '2' }, { value: 4, label: '4 (بار)' }], 1, function (v) { every = v; })), UI.row(beatBtn)));
    }
  });
})();

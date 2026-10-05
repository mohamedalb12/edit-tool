/* القص السريع — أوفلاين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'quickcut', icon: '✂️', label: 'قص سريع', title: 'القص السريع (أوفلاين)',
    render: function (view) {
      var S = EF.services, q = Object.assign({}, S.settings.quickCut), last = null;
      var silence = EF.node('silence');
      var paramsTxt = h('span', { class: 'hint ltr' });
      function updParams() { var p = silence.sensitivityToParams(q.sensitivity); paramsTxt.textContent = p.thresholdDb + ' dB · ≥ ' + p.minSilence + 's'; }
      var result = h('div');
      var trackSel = h('select'); trackSel.appendChild(h('option', { value: '' }, 'تلقائي'));
      S.seq().then(function (s) { s.audio.forEach(function (t) { trackSel.appendChild(h('option', { value: t.index }, 'A' + (t.index + 1) + ' (' + t.clips.length + ')')); }); }).catch(function () {});
      function save() { S.saveSettings({ quickCut: q }); }
      function opts() { return { sensitivity: q.sensitivity, padding: q.padding, trackIndex: trackSel.value === '' ? undefined : +trackSel.value, onCopy: q.onCopy, crossfadeFrames: q.crossfade ? q.crossfadeFrames : 0 }; }
      var analyze = UI.btn('حلّل السكتات', function () {
        UI.safe('بيسمع الصوت', function () {
          return S.quickCutAnalyze(opts()).then(function (r) {
            last = r; UI.empty(result);
            result.appendChild(UI.card(null, h('div', { class: 'stats' },
              h('div', { class: 'stat' }, UI.countUp(h('b'), r.cuts.length), h('span', null, 'سكتة')),
              h('div', { class: 'stat' }, UI.countUp(h('b'), r.removedSeconds, function (v) { return v.toFixed(1); }), h('span', null, 'ثانية هتتشال')))));
            var list = h('div', { class: 'list' });
            r.cuts.slice(0, 300).forEach(function (c) {
              list.appendChild(h('div', { class: 'item click', onclick: function () { S.setPlayhead(c.start); } }, h('span', { class: 't' }, UI.fmtTime(c.start)), h('span', null, (c.end - c.start).toFixed(2) + 's')));
            });
            result.appendChild(list);
          });
        }, analyze);
      });
      var apply = UI.btn('قص وقفّل الفراغات', function () {
        UI.safe('بيقص', function () {
          var o = opts(); if (last) o.cuts = last.cuts;
          return S.quickCut(o).then(function (r) { UI.toast('اتشال ' + (r.removedSeconds || 0) + ' ثانية في ' + (r.ranges || 0) + ' قصة' + (r.sequence ? ' — ' + r.sequence : '')); last = null; UI.empty(result); });
        }, apply);
      }, 'primary');
      q.crossfade = q.crossfadeFrames > 0;
      view.appendChild(UI.card('الإعدادات',
        UI.field('الحساسية', UI.slider(1, 10, 1, q.sensitivity, function (v) { return v + '/10'; }, function (v) { q.sensitivity = v; updParams(); save(); })),
        UI.row(h('label'), paramsTxt),
        UI.field('هامش الكلام', UI.slider(0, 0.3, 0.01, q.padding, function (v) { return Math.round(v * 1000) + 'ms'; }, function (v) { q.padding = v; save(); })),
        UI.row(h('label', null, 'انتقال صوتي'), h('input', { type: 'checkbox', checked: q.crossfade, onchange: function (e) { q.crossfade = e.target.checked; if (!q.crossfade) q.crossfadeFrames = 0; else if (!q.crossfadeFrames) q.crossfadeFrames = 2; save(); } }),
          h('input', { type: 'number', min: 1, max: 12, value: q.crossfadeFrames || 2, style: { width: '60px' }, onchange: function (e) { q.crossfadeFrames = +e.target.value; save(); } }), 'فريم (Constant Power)'),
        UI.row(h('label', null, 'على نسخة'), h('input', { type: 'checkbox', checked: q.onCopy, onchange: function (e) { q.onCopy = e.target.checked; save(); } }), h('span', { class: 'hint' }, 'يعمل نسخة من السيكوينس ويقص فيها')),
        UI.field('تراك الصوت', trackSel),
        UI.row(analyze, apply)));
      view.appendChild(result);
      updParams();
    }
  });
})();

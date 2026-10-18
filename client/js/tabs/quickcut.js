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
      var keepBox = h('div', { class: 'row keep-tracks' });
      q.keepAudio = q.keepAudio || []; q.mode = q.mode || 'remove';
      S.seq().then(function (s) {
        s.audio.forEach(function (t) {
          trackSel.appendChild(h('option', { value: t.index }, 'A' + (t.index + 1) + ' (' + t.clips.length + ')'));
          if (!t.clips.length) return;
          keepBox.appendChild(h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: q.keepAudio.indexOf(t.index) >= 0, onchange: function (e) {
            q.keepAudio = q.keepAudio.filter(function (x) { return x !== t.index; }); if (e.target.checked) q.keepAudio.push(t.index); save();
          } }), ' A' + (t.index + 1)));
        });
      }).catch(function () {});
      function save() { S.saveSettings({ quickCut: q }); }
      function opts() { return { sensitivity: q.sensitivity, padding: q.padding, trackIndex: trackSel.value === '' ? undefined : +trackSel.value, onCopy: q.onCopy, crossfadeFrames: q.crossfade ? q.crossfadeFrames : 0, keepAudio: q.keepAudio, mode: q.mode }; }
      var analyze = UI.btn('حلّل السكتات', function () {
        UI.safe('بيسمع الصوت', function () {
          return S.quickCutAnalyze(opts()).then(function (r) {
            last = r; UI.empty(result);
            result.appendChild(UI.card(null, h('div', { class: 'stats' },
              h('div', { class: 'stat' }, UI.countUp(h('b'), r.cuts.length), h('span', null, 'سكتة')),
              h('div', { class: 'stat' }, UI.countUp(h('b'), r.removedSeconds, function (v) { return v.toFixed(1); }), h('span', null, 'ثانية هتتشال')))));
            var list = h('div', { class: 'list' });
            r.cuts.slice(0, 300).forEach(function (c) {
              // tick off a silence you want to keep (a dramatic pause, a laugh)
              var row = h('div', { class: 'item click', onclick: function () { S.setPlayhead(c.start).catch(function () {}); } },
                h('input', { type: 'checkbox', checked: true, title: 'شيل العلامة لو عايز تسيب السكتة دي', onclick: function (e) { e.stopPropagation(); c.skip = !e.target.checked; row.classList.toggle('off', !!c.skip); } }),
                h('span', { class: 't' }, UI.fmtTime(c.start)), h('span', null, (c.end - c.start).toFixed(2) + 's'));
              list.appendChild(row);
            });
            result.appendChild(list);
          });
        }, analyze);
      });
      var cutProg = UI.progress();
      var apply = UI.btn('نفّذ', function () {
        UI.safe(q.mode === 'markers' ? 'بيحط ماركرز' : 'بيقص', function () {
          var o = opts(); if (last) o.cuts = last.cuts.filter(function (c) { return !c.skip; });
          o.onProgress = function (p) { cutProg.set(p); };
          return S.quickCut(o).then(function (r) {
            cutProg.set(1);
            UI.toast(q.mode === 'markers' ? (r.markers || 0) + ' ماركر أحمر على السكتات ✓ — راجعها وبعدين اختار "قص" ونفّذ' : 'اتشال ' + (r.removedSeconds || 0) + ' ثانية في ' + (r.ranges || 0) + ' قصة' + (r.sequence ? ' — ' + r.sequence : ''));
            last = null; UI.empty(result);
          });
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
        UI.field('ماتقصّش', keepBox), UI.hint('علّم تراك المزيكا هنا: الفيديو والكلام يتقصّوا والمزيكا تفضل ماشية من غير تقطيع.'),
        UI.field('الطريقة', UI.seg([{ value: 'remove', label: 'قص وقفّل الفراغات' }, { value: 'markers', label: 'ماركرز بس (أراجع الأول)' }], q.mode, function (v) { q.mode = v; save(); })),
        UI.row(analyze, apply), cutProg));
      view.appendChild(result);
      // ——— كلمات الحشو: اممم / آآآ / uh (+ يعني و بص لو عايز) ———
      var F = EF.node('fillers'), extra = (S.settings.fillerExtra || []).slice(), fRes = h('div'), fLast = null;
      var optBox = h('div', { class: 'chips' });
      F.OPTIONAL.forEach(function (w) {
        optBox.appendChild(h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: extra.indexOf(w) >= 0, onchange: function (e) {
          extra = extra.filter(function (x) { return x !== w; }); if (e.target.checked) extra.push(w); S.saveSettings({ fillerExtra: extra });
        } }), ' ' + w));
      });
      var fFind = UI.btn('دوّر على الحشو', function () {
        UI.safe('بيدوّر', function () {
          return S.findFillers({ extra: extra }).then(function (list) {
            fLast = list; UI.empty(fRes);
            if (!list.length) { fRes.appendChild(UI.hint('مفيش حشو ✓ (لو متأكد إن فيه، فرّغ تاني: التفريغ الجديد بيحتفظ بـ "اممم" و"آآ")')); return; }
            var secs = list.reduce(function (a, x) { return a + x.end - x.start; }, 0), l = h('div', { class: 'list' });
            list.forEach(function (x) {
              var row = h('div', { class: 'item click', onclick: function () { S.setPlayhead(x.start).catch(function () {}); } },
                h('input', { type: 'checkbox', checked: true, onclick: function (e) { e.stopPropagation(); x.skip = !e.target.checked; row.classList.toggle('off', !!x.skip); } }),
                h('span', { class: 't' }, UI.fmtTime(x.start)), h('bdi', { class: 'grow' }, x.text), h('span', { class: 'hint' }, x.kind === 'sound' ? 'صوت' : 'كلمة'));
              l.appendChild(row);
            });
            fRes.appendChild(h('div', { class: 'hint' }, list.length + ' مكان · ' + secs.toFixed(1) + ' ثانية'));
            fRes.appendChild(l);
          });
        }, fFind);
      });
      var fCut = UI.btn('شيل المعلّم', function () {
        if (!fLast) return UI.toast('دوّر الأول', true);
        UI.safe('بيقص الحشو', function () {
          return S.cutRanges({ ranges: fLast.filter(function (x) { return !x.skip; }), mode: q.mode }).then(function (r) {
            UI.toast(q.mode === 'markers' ? (r.markers || 0) + ' ماركر ✓' : 'اتشال ' + (r.ranges || 0) + ' حشو ✓ — على نسخة: ' + (r.sequence || '')); fLast = null; UI.empty(fRes);
          });
        }, fCut);
      }, 'primary');
      view.appendChild(UI.card('كلمات الحشو (اممم، آآآ…)', UI.hint('بيلاقي أصوات التردد من التفريغ ويشيلها بنفس طريقة القص (على نسخة، والمزيكا ماتتقصّش). علّم كلمات زي "يعني" لو بتقولها كتير كحشو.'),
        optBox, UI.row(fFind, fCut), fRes));
      updParams();
    }
  });
})();

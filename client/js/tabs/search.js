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
      // ——— باقة النشر: عناوين + وصف بالفصول + تاجات ———
      function copyText(t) { var ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = t; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); if (!ok && navigator.clipboard) navigator.clipboard.writeText(t); UI.toast('اتنسخ ✓'); }
      var pack = h('div');
      var packBtn = UI.btn('اعمل باقة النشر', function () {
        UI.safe('بيكتب باقة النشر', function () {
          return S.youtubePack({}).then(function (r) {
            UI.empty(pack);
            if (r.titles.length) {
              var tl = h('div', { class: 'list' });
              r.titles.forEach(function (t) { tl.appendChild(h('div', { class: 'item click', title: 'دوس تنسخ', onclick: function () { copyText(t); } }, h('bdi', { class: 'grow' }, t), h('span', { class: 'hint' }, t.length + ' حرف'))); });
              pack.appendChild(h('h4', null, 'عناوين (دوس تنسخ)')); pack.appendChild(tl);
            }
            var desc = h('textarea', { rows: 8, class: 'yt-desc' }); desc.value = r.description;
            pack.appendChild(h('h4', null, 'الوصف')); pack.appendChild(desc);
            pack.appendChild(UI.row(UI.btn('انسخ الوصف', function () { copyText(desc.value); }, 'small'), r.tags.length ? UI.btn('انسخ التاجات (' + r.tags.length + ')', function () { copyText(r.tags.join(', ')); }, 'small') : null));
            if (!r.ai) pack.appendChild(UI.hint('من غير مفتاح OpenRouter: الوصف فيه الفصول بس. حط المفتاح من الإعدادات للعناوين والتاجات.'));
          });
        }, packBtn);
      }, 'primary');
      view.appendChild(UI.card('باقة النشر على يوتيوب', UI.hint('5 عناوين + وصف بلهجة الفيديو + فصول جاهزة + تاجات — كله من كلام الفيديو.'), UI.row(packBtn), pack));
      // ——— بيب على كلام معيّن (شتيمة، اسم، رقم تليفون…) ———
      var bl = h('input', { class: 'grow', placeholder: 'الكلمات مفصولة بفاصلة… مثلاً: اسم الشركة, رقم', value: (S.settings.bleepWords || []).join(', ') });
      var bMode = 'beep';
      var bBtn = UI.btn('نفّذ', function () {
        var list = bl.value.split(/[,،\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (!list.length) return UI.toast('اكتب الكلمات الأول', true);
        S.saveSettings({ bleepWords: list });
        UI.safe('بيدوّر', function () { return S.bleepWords({ list: list, mode: bMode }).then(function (r) { UI.toast(r.hits ? r.hits + ' مكان ✓' + (bMode === 'markers' ? ' (ماركرز)' : '') : 'مالقيتش الكلمات دي في الكلام'); }); }, bBtn);
      }, 'primary');
      view.appendChild(UI.card('بيب على كلام', UI.hint('بيلاقي الكلمات في التفريغ: "بيب" بيكتم الصوت تحتها ويحط صفارة على تراك لوحده، "كتم" بيكتم بس، "ماركرز" يعلّمها تراجعها.'),
        bl, UI.field('الطريقة', UI.seg([{ value: 'beep', label: 'بيب' }, { value: 'mute', label: 'كتم' }, { value: 'markers', label: 'ماركرز' }], bMode, function (v) { bMode = v; })), UI.row(bBtn)));
      view.appendChild(UI.card('ماركرز على الإيقاع (أوفلاين)', UI.hint('بيحلل آخر تراك صوت فيه موسيقى ويحط ماركر على كل بيت.'),
        UI.field('كل', UI.seg([{ value: 1, label: 'بيت' }, { value: 2, label: '2' }, { value: 4, label: '4 (بار)' }], 1, function (v) { every = v; })), UI.row(beatBtn)));
      // ——— مونتاج على البيت: الكليبات تتقص على الإيقاع ———
      var mt = { every: 2, track: 0, stretch: false };
      var mtBtn = UI.btn('قص المونتاج على البيت', function () {
        UI.safe('بيقص على البيت', function () {
          return S.beatMontage({ every: mt.every, track: mt.track, stretch: mt.stretch }).then(function (r) {
            UI.toast(r.laid + ' كليب على البيت (' + Math.round(r.bpm) + ' BPM) ✓ — ' + r.sequence + (r.left ? ' · ' + r.left + ' كليب مالحقش الموسيقى' : ''));
          });
        }, mtBtn);
      }, 'primary');
      view.appendChild(UI.card('مونتاج على البيت',
        UI.hint('حط الكليبات بالترتيب على تراك فيديو والموسيقى على تراك صوت: بيعمل نسخة من السيكوينس وكل قطعة بتقع على بيت بالظبط. كل كليب بيبدأ من نفس الـ In بتاعه.'),
        UI.field('كل كليب', UI.seg([{ value: 1, label: 'بيت' }, { value: 2, label: '2 بيت' }, { value: 4, label: 'بار (4)' }, { value: 8, label: '8' }], mt.every, function (v) { mt.every = v; })),
        UI.field('تراك الفيديو', UI.slider(1, 6, 1, 1, function (v) { return 'V' + v; }, function (v) { mt.track = v - 1; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: false, onchange: function (e) { mt.stretch = e.target.checked; } }), ' الكليب القصير ياخد العدد كامل (من الميديا اللي بعده)')),
        UI.row(mtBtn)));
    }
  });
})();

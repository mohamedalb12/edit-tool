/* تفريغ الكلام + الكابشن. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'transcribe', icon: '📝', label: 'تفريغ وكابشن', title: 'تفريغ الكلام والكابشن',
    render: function (view) {
      var S = EF.services, tr = EF.node('transcribe'), c = Object.assign({}, S.settings.captions);
      var words = h('div', { class: 'words' }), prog = h('span', { class: 'hint' });
      function drawWords() {
        UI.empty(words);
        if (!S.transcript) { words.appendChild(h('span', { class: 'hint' }, 'لسه مفيش تفريغ.')); return; }
        S.transcript.words.forEach(function (w) { words.appendChild(h('span', { title: UI.fmtTime(w.start), onclick: function () { S.setPlayhead(w.start); } }, w.text)); words.appendChild(document.createTextNode(' ')); });
      }
      var dialect = UI.select(tr.DIALECTS.map(function (d) { return { value: d.id, label: d.label }; }), S.settings.dialect, function (v) { S.saveSettings({ dialect: v }); });
      var go = UI.btn('فرّغ الكلام', function () {
        UI.safe('بيفرّغ', function () { return S.transcribe({ dialect: dialect.value, onProgress: function (m) { prog.textContent = m; } }).then(function (t) { prog.textContent = t.words.length + ' كلمة ✓'; drawWords(); }); }, go);
      }, 'primary');
      function saveC() { S.saveSettings({ captions: c }); }
      var cap = UI.btn('نزّل SRT عادي', function () {
        UI.safe('بيعمل الكابشن', function () { return S.addCaptions(c).then(function (r) { UI.toast(r.cues + ' كارت كابشن ✓ — عدّلهم من تبويب Text'); }); }, cap);
      }, 'primary');
      var exportBtn = UI.btn('احفظ SRT', function () {
        UI.safe('بيحفظ', function () {
          var dir = EF.pickFolder('فين أحفظ الـ SRT؟'); if (!dir) return;
          return S.exportSrt(dir, c).then(function (f) { UI.toast('اتحفظ ' + f); });
        });
      });
      view.appendChild(UI.card('التفريغ (أوفلاين بـ Whisper)', UI.field('اللهجة', dialect), UI.modelPicker('spellfix'),
        UI.hint('التوقيت لكل كلمة. بعد التفريغ النص بيتصلّح إملائيًا تلقائي (قواعد أوفلاين + الموديل لو فيه مفتاح).'),
        UI.row(go, prog), words));
      // ——— كابشن متحرك ———
      var CS = window.EFCaptions, st = Object.assign({ style: 'bold', position: 'bottom', size: 0.068 }, S.settings.captionStyle || {});
      function saveSt() { S.saveSettings({ captionStyle: st }); }
      var sample = { start: 0, end: 2.6, words: [{ text: 'المونتاج', start: 0, end: 0.6 }, { text: 'بقى', start: 0.6, end: 1.0 }, { text: 'أسرع', start: 1.0, end: 1.6 }, { text: 'بكتير', start: 1.6, end: 2.4 }] };
      var styleGrid = h('div', { class: 'grid cap-grid' }), timers = [];
      CS.STYLES.forEach(function (sty) {
        var cv = h('canvas'); cv.width = 384; cv.height = 216;
        var tile = h('div', { class: 'tile' + (st.style === sty.id ? ' on' : ''), 'data-style': sty.id, onclick: function () {
          st.style = sty.id; saveSt(); Array.prototype.forEach.call(styleGrid.children, function (x) { x.classList.toggle('on', x === tile); });
        } }, h('div', { class: 'thumb', style: { background: 'linear-gradient(135deg,#2b2540,#5b3b86)' } }, cv), h('div', { class: 'name' }, sty.name));
        styleGrid.appendChild(tile);
        var ctx = cv.getContext('2d'), t0 = performance.now();
        (function loop(now) {
          if (!document.body.contains(cv)) return;
          var t = ((now - t0) / 1000) % 3;
          CS.draw(ctx, sample, Math.min(t, 2.55), Object.assign({}, st, { style: sty.id, position: 'center', size: 0.13 }), 384, 216);
          requestAnimationFrame(loop);
        })(t0);
      });
      var capProg = UI.progress();
      var animBtn = UI.btn('نزّل كابشن متحرك', function () {
        UI.safe('بيرندر الكابشن', function () {
          return S.addAnimatedCaptions(Object.assign({}, c, { style: st, onProgress: function (p) { capProg.set(p); UI.status('كابشن ' + Math.round(p * 100) + '%', 'busy'); } }))
            .then(function (r) { capProg.set(1); UI.toast(r.clips + ' كارت متحرك ✓'); });
        }, animBtn);
      }, 'primary');
      var lang = UI.select(['English', 'French', 'Spanish', 'German', 'Turkish', 'Arabic (MSA)'].map(function (l) { return { value: l, label: l }; }), 'English');
      var trBtn = UI.btn('ترجم الكابشن', function () {
        UI.safe('بيترجم', function () { return S.translateCaptions({ lang: lang.value }).then(function (r) { UI.toast(r.cues + ' سطر بالـ' + r.lang + ' ✓'); }); }, trBtn);
      });
      view.appendChild(UI.card('كابشن متحرك',
        UI.hint('متزامن مع كل كلمة وبينزل كليبات شفافة فوق الفيديو. الألوان بتاخد من ذوقك.'),
        styleGrid,
        UI.row(h('label', null, 'المكان'), UI.seg([{ value: 'bottom', label: 'تحت' }, { value: 'center', label: 'النص' }, { value: 'top', label: 'فوق' }], st.position, function (v) { st.position = v; saveSt(); })),
        UI.field('الحجم', UI.slider(0.04, 0.12, 0.002, st.size, function (v) { return Math.round(v * 1000) / 10 + '%'; }, function (v) { st.size = v; saveSt(); })),
        UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: st.accent || '#FFD84D', oninput: function (e) { st.accent = e.target.value; saveSt(); } }), 'الكلمة', h('input', { type: 'color', value: st.box || '#7C3AED', oninput: function (e) { st.box = e.target.value; saveSt(); } }), 'البوكس'),
        capProg, UI.row(animBtn), UI.row(h('label', null, 'ترجمة'), lang, trBtn)));

      view.appendChild(UI.card('الكابشن (SRT)',
        UI.field('عدد الكلمات', UI.slider(1, 10, 1, c.maxWords, function (v) { return v + ' كلمات'; }, function (v) { c.maxWords = v; saveC(); })),
        UI.field('أقصى مدة', UI.slider(0.5, 6, 0.1, c.maxDuration, function (v) { return v.toFixed(1) + 's'; }, function (v) { c.maxDuration = v; saveC(); })),
        UI.row(h('label', null, 'كلمة في الكارت'), h('input', { type: 'checkbox', checked: c.singleWord, onchange: function (e) { c.singleWord = e.target.checked; saveC(); } })),
        UI.row(cap, exportBtn)));
      drawWords();
    }
  });
})();

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
        var ctx = cv.getContext('2d'), t0 = performance.now(), seen = false;
        requestAnimationFrame(function loop(now) {
          // the tile isn't on the page yet on the first call: keep going until it was shown and then removed
          if (cv.isConnected) seen = true; else if (seen) return;
          var t = ((now - t0) / 1000) % 3;
          CS.draw(ctx, sample, Math.min(t, 2.55), Object.assign({}, st, { style: sty.id, position: 'center', size: 0.13 }), 384, 216);
          requestAnimationFrame(loop);
        });
      });
      // ——— حركة الكلام: دخول كل كلمة + منحنى السرعة + السرعة ———
      ['anim', 'ease', 'strength', 'animDur', 'distance', 'timing', 'wordGap', 'exit', 'exitDur'].forEach(function (k) { if (st[k] === undefined) st[k] = CS.DEFAULTS[k]; });
      var animGrid = h('div', { class: 'grid cap-grid anim-grid' });
      CS.ANIMS.forEach(function (an) {
        var cv = h('canvas'); cv.width = 384; cv.height = 216;
        var tile = h('div', { class: 'tile' + (st.anim === an.id ? ' on' : ''), 'data-anim': an.id, onclick: function () {
          st.anim = an.id; saveSt(); Array.prototype.forEach.call(animGrid.children, function (x) { x.classList.toggle('on', x === tile); });
        } }, h('div', { class: 'thumb', style: { background: 'linear-gradient(135deg,#1f2a44,#4b2f7a)' } }, cv), h('div', { class: 'name' }, an.name));
        animGrid.appendChild(tile);
        var ctx = cv.getContext('2d'), t0 = performance.now(), seen = false;
        requestAnimationFrame(function loop(now) {
          // the tile isn't on the page yet on the first call: keep going until it was shown and then removed
          if (cv.isConnected) seen = true; else if (seen) return;
          var t = ((now - t0) / 1000) % 3;
          CS.draw(ctx, sample, Math.min(t, 2.55), Object.assign({}, st, { anim: an.id, position: 'center', size: 0.13 }), 384, 216);
          requestAnimationFrame(loop);
        });
      });
      // the speed curve: what "fast at the start, slow at the end" looks like
      var curve = h('canvas', { class: 'ease-curve', width: 220, height: 120 });
      function drawCurve() {
        var g = curve.getContext('2d'), W = curve.width, H = curve.height, pad = 12;
        g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
        g.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
        var grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#22D3EE'); grad.addColorStop(1, '#E879F9');
        g.strokeStyle = grad; g.lineWidth = 3; g.beginPath();
        for (var i = 0; i <= 60; i++) { var x = i / 60, y = CS.ease(st.ease, x, st.strength); var px = pad + x * (W - pad * 2), py = H - pad - y * (H - pad * 2); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '10px sans-serif'; g.fillText('الوقت ←', W - 60, H - 2); g.fillText('المسافة', 2, 10);
      }
      var gapField = UI.field('سرعة ظهور الكلام', UI.slider(0.04, 0.6, 0.01, st.wordGap, function (v) { return Math.round(1 / v * 10) / 10 + ' كلمة/ث'; }, function (v) { st.wordGap = v; saveSt(); }));
      function showGap() { gapField.style.display = st.timing === 'cascade' ? '' : 'none'; }
      var animCard = UI.card('حركة الكلام',
        UI.hint('كل كلمة بتدخل بالحركة اللي تختارها (مثلًا نازلة من فوق) على منحنى سرعة: سريع في الأول وبطيء في الآخر — وانت بتتحكم في السرعة.'),
        animGrid,
        UI.field('زي استايل', UI.select([{ value: '', label: '— اختار باقة جاهزة —' }].concat(S.stylePacks().map(function (p) { return { value: p.id, label: p.label + ' (' + p.captions.style + ' + ' + p.captions.anim + ')' }; })), '', function (v) {
          var p = S.stylePacks().find(function (x) { return x.id === v; }); if (!p) return;
          Object.assign(st, p.captions); saveSt(); EF.show('transcribe'); UI.toast('كابشن ' + p.label + ' ✓');
        })),
        UI.field('منحنى السرعة', UI.seg(CS.EASES.map(function (e) { return { value: e.id, label: e.name }; }), st.ease, function (v) { st.ease = v; saveSt(); drawCurve(); })),
        h('div', { class: 'row ease-row' }, curve, h('div', { class: 'grow' },
          UI.field('قوة المنحنى', UI.slider(1, 8, 0.5, st.strength, function (v) { return v + 'x'; }, function (v) { st.strength = v; saveSt(); drawCurve(); })),
          UI.field('مدة دخول الكلمة', UI.slider(0.08, 1.2, 0.02, st.animDur, function (v) { return v.toFixed(2) + 's'; }, function (v) { st.animDur = v; saveSt(); })),
          UI.field('المسافة', UI.slider(0.3, 4, 0.1, st.distance, function (v) { return v + 'x'; }, function (v) { st.distance = v; saveSt(); })))),
        UI.field('التوقيت', UI.seg([{ value: 'sync', label: 'مع الكلام' }, { value: 'cascade', label: 'ورا بعض بسرعتي' }, { value: 'line', label: 'السطر مرة واحدة' }], st.timing, function (v) { st.timing = v; saveSt(); showGap(); })),
        gapField,
        UI.field('الخروج', UI.seg(CS.EXITS.map(function (e) { return { value: e.id, label: e.name }; }), st.exit, function (v) { st.exit = v; saveSt(); })),
        UI.field('مدة الخروج', UI.slider(0.08, 0.8, 0.02, st.exitDur, function (v) { return v.toFixed(2) + 's'; }, function (v) { st.exitDur = v; saveSt(); })));
      drawCurve(); showGap();
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
      view.appendChild(animCard);

      view.appendChild(UI.card('الكابشن (SRT)',
        UI.field('عدد الكلمات', UI.slider(1, 10, 1, c.maxWords, function (v) { return v + ' كلمات'; }, function (v) { c.maxWords = v; saveC(); })),
        UI.field('أقصى مدة', UI.slider(0.5, 6, 0.1, c.maxDuration, function (v) { return v.toFixed(1) + 's'; }, function (v) { c.maxDuration = v; saveC(); })),
        UI.row(h('label', null, 'كلمة في الكارت'), h('input', { type: 'checkbox', checked: c.singleWord, onchange: function (e) { c.singleWord = e.target.checked; saveC(); } })),
        UI.row(cap, exportBtn)));
      drawWords();
    }
  });
})();

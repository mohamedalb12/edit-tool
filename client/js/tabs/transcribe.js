/* تفريغ الكلام + الكابشن. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'transcribe', icon: '📝', label: 'تفريغ وكابشن', title: 'تفريغ الكلام والكابشن',
    render: function (view) {
      var S = EF.services, tr = EF.node('transcribe'), c = Object.assign({}, S.settings.captions);
      var words = h('div', { class: 'words' }), prog = h('span', { class: 'hint' }), cutMode = false, struck = {};
      function drawWords() {
        UI.empty(words);
        if (!S.transcript) { words.appendChild(h('span', { class: 'hint' }, 'لسه مفيش تفريغ.')); return; }
        // click = go there; double-click = fix the word (the fix goes into captions, search and everything else)
        S.transcript.words.forEach(function (w) {
          var idx = S.transcript.words.indexOf(w);
          var sp = h('span', { class: struck[idx] ? 'struck' : '', title: UI.fmtTime(w.start) + ' — دبل كليك تصحّح الكلمة', onclick: function () {
            if (sp.isContentEditable) return;
            if (cutMode) { struck[idx] = !struck[idx]; sp.classList.toggle('struck', !!struck[idx]); cutInfo(); return; }
            S.setPlayhead(w.start).catch(function () {});
          },
            ondblclick: function () { sp.contentEditable = 'true'; sp.focus(); },
            onblur: function () { sp.contentEditable = 'false'; var v = sp.textContent.trim(); if (v && v !== w.text) { w.text = v; sp.classList.add('fixed'); UI.toast('اتصلحت: ' + v); } else sp.textContent = w.text; },
            onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } if (e.key === 'Escape') { sp.textContent = w.text; sp.blur(); } } }, w.text);
          words.appendChild(sp); words.appendChild(document.createTextNode(' '));
        });
      }
      // which audio track has the speech (music on A1 + voice on A2 is common)
      var trackSel = UI.select([{ value: '', label: 'تلقائي (أول تراك فيه صوت)' }], S.settings.speechTrack === null || S.settings.speechTrack === undefined ? '' : String(S.settings.speechTrack), function (v) { S.saveSettings({ speechTrack: v === '' ? null : +v }); S.transcript = null; });
      Promise.resolve().then(function () { return S.seq(); }).then(function (seq) {
        (seq.audio || []).forEach(function (t, i) {
          var secs = t.clips.reduce(function (a, c) { return a + (c.end - c.start); }, 0);
          trackSel.appendChild(h('option', { value: String(i) }, (t.name || 'A' + (i + 1)) + (t.clips.length ? ' — ' + UI.fmtTime(secs) + (t.clips.some(function (c) { return !c.mediaPath; }) ? ' (Nested/Multicam)' : '') : ' — فاضي')));
        });
        if (S.settings.speechTrack !== null && S.settings.speechTrack !== undefined) trackSel.value = String(S.settings.speechTrack);
      }).catch(function () {});
      var dialect = UI.select(tr.DIALECTS.map(function (d) { return { value: d.id, label: d.label }; }), S.settings.dialect, function (v) { S.saveSettings({ dialect: v }); });
      var go = UI.btn('فرّغ الكلام', function () {
        UI.safe('بيفرّغ', function () { return S.transcribe({ dialect: dialect.value, onProgress: function (m) { prog.textContent = m; } }).then(function (t) { prog.textContent = t.words.length + ' كلمة ✓'; drawWords(); }); }, go);
      }, 'primary');
      function saveC() { S.saveSettings({ captions: c }); }
      var cap = UI.btn('كابشن بريمير', function () {
        UI.safe('بيعمل الكابشن', function () { return S.addCaptions(c).then(function (r) { UI.toast(r.cues + ' كارت كابشن ✓ — عدّلهم من Essential Graphics أو Text'); }); }, cap);
      }, 'primary');
      var exportBtn = UI.btn('احفظ SRT', function () {
        UI.safe('بيحفظ', function () {
          var dir = EF.pickFolder('فين أحفظ الـ SRT؟'); if (!dir) return;
          return S.exportSrt(dir, c).then(function (f) { UI.toast('اتحفظ ' + f); });
        });
      });
      // ——— القص بالكلام: علّم الكلام اللي عايز تشيله في النص وهو يتشال من التايملين ———
      var cutTxt = h('span', { class: 'hint' });
      function ranges() {
        var W = S.transcript ? S.transcript.words : [], out = [], i = 0;
        while (i < W.length) {
          if (!struck[i]) { i++; continue; }
          var j = i; while (j + 1 < W.length && struck[j + 1]) j++;
          var a = Math.max(W[i].start - 0.02, i > 0 ? W[i - 1].end : 0), b = Math.min(W[j].end + 0.02, j + 1 < W.length ? W[j + 1].start : W[j].end + 0.02);
          out.push({ start: a, end: b });
          i = j + 1;
        }
        return out;
      }
      function cutInfo() { var r = ranges(), secs = r.reduce(function (x, y) { return x + y.end - y.start; }, 0); cutTxt.textContent = r.length ? r.length + ' جزء · ' + secs.toFixed(1) + ' ثانية هتتشال' : ''; }
      var modeBtn = UI.btn('✂ القص بالكلام', function () {
        cutMode = !cutMode; modeBtn.classList.toggle('primary', cutMode); words.classList.toggle('cut-mode', cutMode);
        UI.toast(cutMode ? 'دوس على الكلام اللي عايز تشيله (بيتشطب)، وبعدين "قص المشطوب"' : 'رجعت لوضع التنقّل');
      }, 'small');
      var doCut = UI.btn('قص المشطوب', function () {
        var r = ranges(); if (!r.length) return UI.toast('اشطب كلام الأول', true);
        UI.safe('بيقص', function () { return S.cutRanges({ ranges: r }).then(function (x) { UI.toast('اتشال ' + (x.ranges || 0) + ' جزء ✓ على نسخة: ' + (x.sequence || '')); struck = {}; cutInfo(); S.transcript = null; drawWords(); }); }, doCut);
      }, 'small');
      view.appendChild(UI.card('التفريغ (أوفلاين بـ Whisper)', UI.field('اللهجة', dialect), UI.field('تراك الكلام', trackSel), UI.modelPicker('spellfix'),
        UI.hint('التوقيت لكل كلمة. كل ملف بيتفرّغ مرة واحدة بس حتى لو اتقص لحتت. دوس على كلمة تروح لها، ودبل كليك تصحّحها قبل الكابشن. "القص بالكلام": اشطب الكلام اللي مش عايزه وهو يتشال من التايملين.'),
        UI.row(go, prog), UI.row(modeBtn, doCut, cutTxt), words));
      // ——— كابشن عادي: من غير أي أنيميشن ———
      var stillBtn = UI.btn('ثابت بالشكل اللي تحت', function () {
        UI.safe('بيعمل الكابشن', function () {
          return S.addAnimatedCaptions(Object.assign({}, c, { style: Object.assign({}, st, { still: true }), onProgress: function (p) { stillProg.set(p); } }))
            .then(function (r) { stillProg.set(1); UI.toast(r.clips + ' كارت كابشن ✓ على تراك واحد'); });
        }, stillBtn);
      });
      var stillProg = UI.progress();
      var arGuide = h('details', { class: 'ar-guide' }, h('summary', null, 'العربي ظاهر حروف مفككة أو بالعكس؟'),
        h('ol', null,
          h('li', null, 'في بريمير: Settings (أو Preferences) ← Graphics ← Text Engine'),
          h('li', null, 'اختار "South Asian and Middle Eastern" واقفل بريمير وافتحه تاني'),
          h('li', null, 'في Essential Graphics اختار للكابشن خط عربي (Cairo أو Tajawal أو Noto Naskh Arabic) واعمله Paragraph: Right')));
      // ——— التزامن: الكابشن بدري أو متأخر عن الصوت ———
      c.offset = +(c.offset || 0);
      var syncTxt = h('span', { class: 'hint' });
      var syncSlider = UI.slider(-1.5, 1.5, 0.05, c.offset, function (v) { return v === 0 ? 'مظبوط' : (v > 0 ? 'أتأخر ' : 'أقدّم ') + Math.abs(v).toFixed(2) + 's'; }, function (v) { c.offset = v; saveC(); });
      var syncBtn = UI.btn('اضبط التزامن تلقائي', function () {
        UI.safe('بيقيس التزامن من الصوت', function () {
          return S.captionSync({ apply: true }).then(function (r) {
            if (!r.confident) { syncTxt.textContent = 'مقدرتش أقيس كويس (' + r.matched + ' من ' + r.phrases + ' جملة) — حرّك الشريط بإيدك'; return; }
            c.offset = r.offset; S.settings.captions.offset = r.offset; saveC();
            var inp = syncWrap.querySelector('input[type=range]'); if (inp) { inp.value = r.offset; inp.dispatchEvent(new Event('input')); }
            syncTxt.textContent = r.offset === 0 ? 'الكابشن مظبوط مع الصوت ✓' : 'اتظبط: ' + (r.offset > 0 ? 'أتأخر ' : 'أقدّم ') + Math.abs(r.offset).toFixed(2) + 's (اتقاس على ' + r.matched + ' جملة) ✓ — نزّل الكابشن تاني';
          });
        }, syncBtn);
      }, 'small');
      var syncWrap = h('div', null, UI.field('تزامن الكابشن', syncSlider), UI.row(syncBtn, syncTxt));
      view.appendChild(UI.card('كابشن عادي (من غير أنيميشن)', syncWrap,
        UI.hint('"كابشن بريمير" بينزل تراك كابشن عادي جوه بريمير: تعدّل الكلام والخط والمكان من Essential Graphics ومن غير رندر. "ثابت بالشكل" بينزل نفس الكابشن بشكل الاستايل اللي مختاره تحت، من غير حركة.'),
        UI.field('عدد الكلمات', UI.slider(1, 10, 1, c.maxWords, function (v) { return v + ' كلمات'; }, function (v) { c.maxWords = v; saveC(); })),
        UI.field('أقصى مدة', UI.slider(0.5, 6, 0.1, c.maxDuration, function (v) { return v.toFixed(1) + 's'; }, function (v) { c.maxDuration = v; saveC(); })),
        UI.row(h('label', null, 'كلمة في الكارت'), h('input', { type: 'checkbox', checked: c.singleWord, onchange: function (e) { c.singleWord = e.target.checked; saveC(); } })),
        stillProg, UI.row(cap, stillBtn, exportBtn), arGuide));
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
          return S.addAnimatedCaptions(Object.assign({}, c, { style: Object.assign({}, st, { still: false }), onProgress: function (p) { capProg.set(p); UI.status('كابشن ' + Math.round(p * 100) + '%', 'busy'); } }))
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
        capProg, UI.row(animBtn), UI.row(h('label', null, 'ترجمة'), lang, trBtn), UI.modelPicker('translate')));
      view.appendChild(animCard);
      drawWords();
    }
  });
})();

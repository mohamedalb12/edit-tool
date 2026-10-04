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
      var cap = UI.btn('نزّل الكابشن على التايملين', function () {
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
      view.appendChild(UI.card('الكابشن',
        UI.field('عدد الكلمات', UI.slider(1, 10, 1, c.maxWords, function (v) { return v + ' كلمات'; }, function (v) { c.maxWords = v; saveC(); })),
        UI.field('أقصى مدة', UI.slider(0.5, 6, 0.1, c.maxDuration, function (v) { return v.toFixed(1) + 's'; }, function (v) { c.maxDuration = v; saveC(); })),
        UI.row(h('label', null, 'كلمة في الكارت'), h('input', { type: 'checkbox', checked: c.singleWord, onchange: function (e) { c.singleWord = e.target.checked; saveC(); } })),
        UI.row(cap, exportBtn)));
      drawWords();
    }
  });
})();

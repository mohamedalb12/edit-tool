/* الإعدادات: المفاتيح، البرامج المحلية، والموديلات لكل ميزة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'settings', icon: '⚙️', label: 'الإعدادات', title: 'الإعدادات',
    render: function (view) {
      var S = EF.services, st = S.settings, OR = EF.node('openrouter'), DL = EF.node('downloader');
      function keyInput(k, label, url) {
        var i = h('input', { type: 'password', value: st.keys[k] || '', class: 'grow ltr', placeholder: label, onchange: function () { var keys = {}; keys[k] = i.value.trim(); S.saveSettings({ keys: keys }); UI.toast('اتحفظ ✓'); } });
        var r = UI.row(h('label', null, label), i, UI.btn('إظهار', function () { i.type = i.type === 'password' ? 'text' : 'password'; }, 'small'), url ? UI.btn('هات مفتاح', function () { EF.openUrl(url); }, 'small') : null);
        r.classList.add('stack'); return r;
      }
      function pathInput(k, label, folder) {
        var i = h('input', { value: st.paths[k] || '', class: 'grow ltr', placeholder: 'تلقائي', onchange: function () { var p = {}; p[k] = i.value.trim(); S.saveSettings({ paths: p }); status(); } });
        var r = UI.row(h('label', null, label), i, UI.btn('اختار…', function () { var f = folder ? EF.pickFolder(label) : EF.pickFile(label); if (f) { i.value = f; i.onchange(); } }, 'small'));
        r.classList.add('stack'); return r;
      }
      var stBox = h('div', { class: 'kv' });
      function status() {
        S.reload(); UI.empty(stBox);
        var t = S.tools, wm = S.settings.paths.whisperModel;
        [['ffmpeg', t.ffmpeg], ['ffprobe', t.ffprobe], ['whisper.cpp', t.whisper], ['موديل Whisper', S.fileExists(wm) ? wm : null], ['MOGRT أساسي', S.findBaseMogrt()]].forEach(function (x) {
          stBox.appendChild(h('span', null, x[0])); stBox.appendChild(h('span', { class: (x[1] ? 'ok' : 'err') + ' ltr' }, x[1] || 'مش موجود'));
        });
      }

      // whisper model download
      var wsel = UI.select(DL.WHISPER_MODELS.map(function (m) { return { value: m.id, label: m.label }; }), 'large-v3-turbo');
      var prog = UI.progress();
      var dlBtn = UI.btn('حمّل الموديل (مرة واحدة)', function () {
        UI.safe('بيحمّل موديل Whisper', function () {
          var dest = EF.node('config').dataDir() + '/models/ggml-' + wsel.value + '.bin';
          return DL.download(DL.whisperUrl(wsel.value), dest, { onProgress: function (p) { prog.set(p); UI.status('بيحمّل ' + Math.round(p * 100) + '%', 'busy'); } })
            .then(function () { S.saveSettings({ paths: { whisperModel: dest } }); UI.toast('الموديل جاهز ✓'); status(); });
        }, dlBtn);
      });

      // models
      var modelsBox = h('div');
      function drawModels() {
        UI.empty(modelsBox);
        var def = h('input', { list: 'ef-models', class: 'grow ltr', value: S.settings.defaultModel || '', placeholder: 'الافتراضي لكل ميزة', onchange: function () { S.saveSettings({ defaultModel: def.value.trim() }); drawModels(); } });
        modelsBox.appendChild(h('div', { class: 'row stack' }, h('label', null, 'موديل عام'), def));
        OR.FEATURES.forEach(function (f) { modelsBox.appendChild(h('div', { class: 'row stack' }, h('span', { class: 'hint' }, f.label))); modelsBox.lastChild.appendChild(UI.modelPicker(f.id).lastChild); });
      }
      var loadBtn = UI.btn('حمّل قائمة الموديلات من OpenRouter', function () {
        UI.safe('بيجيب الموديلات', function () { return S.llm.listModels().then(function (ms) { localStorage.setItem('ef-models', JSON.stringify(ms)); UI.fillModels(ms); UI.toast(ms.length + ' موديل ✓'); }); }, loadBtn);
      });
      var testBtn = UI.btn('جرّب المفتاح', function () {
        UI.safe('بيجرّب', function () { return S.llm.text({ model: S.model('sfx_translate'), user: 'رد بكلمة واحدة: تمام', maxTokens: 20 }).then(function (t) { UI.toast('شغّال ✓ — ' + t); }); }, testBtn);
      }, 'small');

      view.appendChild(UI.card('المفاتيح', UI.hint('بتتحفظ على جهازك بس (~/.editfast). كل الذكاء الاصطناعي بيعدّي من OpenRouter بمفتاحك.'),
        keyInput('openrouter', 'OpenRouter', 'https://openrouter.ai/keys'), UI.row(testBtn),
        keyInput('elevenlabs', 'ElevenLabs (SFX)', 'https://elevenlabs.io/app/settings/api-keys'),
        keyInput('pexels', 'Pexels', 'https://www.pexels.com/api/'), keyInput('pixabay', 'Pixabay', 'https://pixabay.com/api/docs/')));
      var testBox = h('div', { class: 'list', style: { display: 'none' } });
      var testAll = UI.btn('اختبر كل الموديلات', function () {
        UI.empty(testBox); testBox.style.display = '';
        UI.safe('بيختبر الموديلات', function () {
          return S.testModels({ onResult: function (r) {
            testBox.appendChild(h('div', { class: 'item mtest ' + (r.ok ? 'pass' : 'fail') },
              h('span', { class: 'badge-dot' }),
              h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, r.label), h('div', { class: 'hint ltr' }, r.model + (r.listed === false ? '  ⚠ مش موجود في قائمة OpenRouter' : ''))),
              h('div', { class: 'hint ltr', style: { textAlign: 'left', maxWidth: '42%', whiteSpace: 'normal' } }, r.ok ? (r.ms + 'ms' + (r.tools === true ? ' · tools ✓' : r.tools === false ? ' · tools ✗' : '') + (r.vision === true ? ' · بيشوف صور ✓' : r.vision === false && r.tools !== null ? ' · مابيشوفش صور' : '')) : (r.error || 'فشل'))));
          } }).then(function (all) { var ok = all.filter(function (r) { return r.ok; }).length; UI.toast(ok + ' من ' + all.length + ' موديل شغّالين' + (ok < all.length ? ' — غيّر اللي فشل' : ' ✓'), ok < all.length); });
        }, testAll);
      }, 'primary');
      view.appendChild(UI.card('الموديلات لكل ميزة', UI.hint('اختار الموديل اللي يشغّل كل ميزة. اكتب أي ID من OpenRouter أو حمّل القائمة.'), UI.row(loadBtn, testAll), testBox, modelsBox));
      view.appendChild(UI.card('البرامج المحلية (أوفلاين)', pathInput('ffmpeg', 'ffmpeg'), pathInput('whisper', 'whisper.cpp'), pathInput('whisperModel', 'موديل Whisper'),
        UI.row(wsel, dlBtn), prog, pathInput('baseMogrt', 'MOGRT أساسي للتايتلات'), pathInput('node', 'Node.js (للمشاهد Pro)'), pathInput('chrome', 'Chrome للـ Remotion (اختياري)'), stBox));
      drawModels(); status();
    }
  });
})();

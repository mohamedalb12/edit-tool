/* الإعدادات: المفاتيح، البرامج المحلية، والموديلات لكل ميزة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'settings', icon: '⚙️', label: 'الإعدادات', title: 'الإعدادات',
    render: function (view) {
      var S = EF.services, st = S.settings, OR = EF.node('openrouter'), DL = EF.node('downloader');
      // a quick sanity check per key (the most common mix-up: pasting ElevenLabs' "Key ID" instead of the sk_ key)
      var KEY_CHECK = {
        openrouter: function (v) { return /^sk-or-/.test(v) ? '' : 'مفتاح OpenRouter بيبدأ بـ sk-or-'; },
        elevenlabs: function (v) { return /^sk_/.test(v) ? '' : 'ده شكله الـ Key ID — المفتاح الحقيقي بيبدأ بـ sk_ وبيظهر مرة واحدة لما تعمله'; }
      };
      function keyInput(k, label, url) {
        var warn = h('div', { class: 'hint err key-warn' });
        function check() { var v = i.value.trim(); warn.textContent = v && KEY_CHECK[k] ? KEY_CHECK[k](v) : ''; }
        var i = h('input', { type: 'password', value: st.keys[k] || '', class: 'grow ltr', placeholder: label, onchange: function () { var keys = {}; keys[k] = i.value.trim(); S.saveSettings({ keys: keys }); check(); UI.toast(warn.textContent ? '⚠ ' + warn.textContent : 'اتحفظ ✓', !!warn.textContent); } });
        var r = UI.row(h('label', null, label), i, UI.btn('إظهار', function () { i.type = i.type === 'password' ? 'text' : 'password'; }, 'small'), url ? UI.btn('هات مفتاح', function () { EF.openUrl(url); }, 'small') : null);
        r.classList.add('stack'); check();
        return h('div', null, r, warn);
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

      // models: one searchable picker per AI feature (+ a general default), test results show next to each
      var modelsBox = h('div');
      function drawModels() {
        UI.empty(modelsBox);
        modelsBox.appendChild(h('div', { class: 'row stack' }, h('label', null, 'موديل عام لكل الميزات (اختياري)'), UI.modelPicker('__default', { bare: true, onChange: function () { UI.refreshPickers(); } })));
        OR.FEATURES.forEach(function (f) { modelsBox.appendChild(h('div', { class: 'row stack' }, h('label', null, f.label), UI.modelPicker(f.id, { bare: true }))); });
      }
      var listInfo = h('span', { class: 'hint' }, (EF.modelList || []).length + ' موديل في القائمة');
      var loadBtn = UI.btn('حدّث قائمة الموديلات', function () {
        UI.safe('بيجيب الموديلات', function () { return UI.ensureModels(true).then(function (ms) { listInfo.textContent = ms.length + ' موديل في القائمة'; UI.toast(ms.length + ' موديل ✓'); }); }, loadBtn);
      });
      var testBtn = UI.btn('جرّب المفتاح', function () {
        UI.safe('بيجرّب', function () { return S.llm.text({ model: S.model('sfx_translate'), user: 'رد بكلمة واحدة: تمام', maxTokens: 20 }).then(function (t) { UI.toast('شغّال ✓ — ' + t); }); }, testBtn);
      }, 'small');

      view.appendChild(UI.card('المفاتيح', UI.hint('بتتحفظ على جهازك بس (~/.editfast). كل الذكاء الاصطناعي بيعدّي من OpenRouter بمفتاحك.'),
        keyInput('openrouter', 'OpenRouter', 'https://openrouter.ai/keys'), UI.row(testBtn),
        keyInput('elevenlabs', 'ElevenLabs (SFX)', 'https://elevenlabs.io/app/settings/api-keys'),
        keyInput('pexels', 'Pexels', 'https://www.pexels.com/api/'), keyInput('pixabay', 'Pixabay', 'https://pixabay.com/api/docs/'),
        keyInput('google', 'Google Custom Search (بحث الصور)', 'https://developers.google.com/custom-search/v1/introduction'), keyInput('googleCx', 'Google Search Engine ID (cx)', 'https://programmablesearchengine.google.com/')));
      var testBox = h('div', { class: 'list', style: { display: 'none' } });
      var testAll = UI.btn('اختبر كل الموديلات', function () {
        UI.empty(testBox); testBox.style.display = '';
        UI.safe('بيختبر الموديلات', function () {
          return S.testModels({ onResult: function (r) {
            EF.modelTests = EF.modelTests || {}; EF.modelTests[r.feature] = r; UI.refreshPickers();
            testBox.appendChild(h('div', { class: 'item mtest ' + (r.ok ? 'pass' : 'fail') },
              h('span', { class: 'badge-dot' }),
              h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, r.label), h('div', { class: 'hint ltr' }, r.model + (r.listed === false ? '  ⚠ مش موجود في قائمة OpenRouter' : ''))),
              h('div', { class: 'hint ltr', style: { textAlign: 'left', maxWidth: '42%', whiteSpace: 'normal' } }, r.ok ? (r.ms + 'ms' + (r.tools === true ? ' · tools ✓' : r.tools === false ? ' · tools ✗' : '') + (r.vision === true ? ' · بيشوف صور ✓' : r.vision === false && r.tools !== null ? ' · مابيشوفش صور' : '')) : (r.error || 'فشل'))));
          } }).then(function (all) { var ok = all.filter(function (r) { return r.ok; }).length; UI.toast(ok + ' من ' + all.length + ' موديل شغّالين' + (ok < all.length ? ' — غيّر اللي فشل' : ' ✓'), ok < all.length); });
        }, testAll);
      }, 'primary');
      view.appendChild(UI.card('الموديلات لكل ميزة', UI.hint('دوس على أي خانة تظهرلك كل موديلات OpenRouter (بتدوّر بالاسم، وجنب كل موديل سعره لكل مليون توكن وهل بيستخدم أدوات 🛠 وبيشوف صور 👁). النقطة جنب الخانة بتخضر لما تختبرها.'),
        UI.row(testAll, loadBtn, listInfo), testBox, modelsBox));
      view.appendChild(UI.card('البرامج المحلية (أوفلاين)', pathInput('ffmpeg', 'ffmpeg'), pathInput('whisper', 'whisper.cpp'), pathInput('whisperModel', 'موديل Whisper'),
        UI.row(wsel, dlBtn), prog, pathInput('baseMogrt', 'MOGRT أساسي للتايتلات'), pathInput('node', 'Node.js (للمشاهد Pro)'), pathInput('chrome', 'Chrome للـ Remotion (اختياري)'), pathInput('ytdlp', 'yt-dlp (التحميل من اللينكات)'), stBox));
      // ——— التحديثات ———
      var ver = S.version ? S.version() : '';
      var lastChk = h('span', { class: 'hint' }, S.settings.lastUpdateCheck ? 'آخر فحص: ' + new Date(S.settings.lastUpdateCheck).toLocaleString('ar-EG') : '');
      var chk = UI.btn('دوّر على تحديث', function () { UI.safe('بيدوّر', function () { return EF.updates.check(true); }, chk); }, 'primary');
      var rb = UI.btn('رجّع النسخة اللي فاتت', function () {
        UI.safe('بيرجّع', function () { return Promise.resolve(S.rollbackUpdate()).then(function (r) { UI.toast('رجعت لـ ' + r.version + ' — بيعيد التشغيل'); setTimeout(function () { EF.updates.reload(); }, 900); }); }, rb);
      }, 'small');
      var src = h('input', { class: 'grow ltr', placeholder: 'مصدر التحديثات (فاضي = الافتراضي على GitHub)', value: S.settings.updateUrl || '', onchange: function (e) { S.saveSettings({ updateUrl: e.target.value.trim() }); } });
      view.appendChild(UI.card('التحديثات',
        UI.row(h('span', null, 'النسخة الحالية '), h('b', { class: 'ltr' }, ver), h('span', { class: 'spacer' }), lastChk),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: S.settings.autoUpdate !== false, onchange: function (e) { S.saveSettings({ autoUpdate: e.target.checked }); } }), ' حدّث لوحده أول ما تنزل نسخة جديدة')),
        UI.row(chk, rb), src,
        UI.hint('الإضافة بتدوّر على تحديث أول ما تفتح وكل 6 ساعات. التحديث بيتأكد من سلامة الملف، وبياخد نسخة احتياطية، ومش بيلمس محرك المشاهد ولا إعداداتك.')));
      drawModels(); status();
    }
  });
})();

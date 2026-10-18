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

      // ——— الفحص: أول حاجة تعملها لو حاجة مش شغالة ———
      var PROBE = { qe: 'أوامر بريمير الداخلية (QE)', bin: 'عمل فولدر في المشروع', 'import': 'استيراد فيديو (مسار عربي)', importStill: 'استيراد صورة', importSrt: 'استيراد ملف كابشن', newSequence: 'عمل سيكوينس جديدة', settings: 'قراءة إعدادات السيكوينس', addTrack: 'إضافة تراك', placeStill: 'وضع كليب بمدة مضبوطة', clipEnd: 'تعديل طول كليب', markers: 'الماركرز بالألوان', razor: 'القص (Razor)', rippleDelete: 'الحذف وسحب اللي بعده', transform: 'إضافة Transform وكي فريم', audioTransition: 'انتقال الصوت', captions: 'تراك كابشن بريمير', clone: 'نسخ السيكوينس', cleanup: 'مسح سيكوينس التجربة' };
      var TOOLS = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper.cpp', whisperModel: 'موديل Whisper', ytdlp: 'yt-dlp', deno: 'deno (ليوتيوب)', node: 'Node.js', proEngine: 'محرك الجرافيك' };
      var READY = { captions: 'الكابشن بالشكل', nativeCaptions: 'كابشن بريمير', cut: 'القص', audio: 'الصوت', motion: 'الحركة', download: 'التحميل', reels: 'ريلز', graphics: 'الجرافيك', ai: 'الذكاء الاصطناعي', markers: 'الماركرز والتعديلات' };
      var diagBox = h('div', { class: 'diag-res' }), diagStep = h('span', { class: 'hint' });
      function line(ok, name, detail, untested) { return h('div', { class: 'diag-line' + (ok ? ' ok' : untested ? ' wait' : ' bad') }, h('span', { class: 'dot' }), h('span', { class: 'grow' }, name), detail ? h('span', { class: 'hint ltr' }, detail) : null); }
      function drawDiag(r) {
        UI.empty(diagBox); if (!r) return;
        var bad = Object.keys(r.ready).filter(function (k) { return !r.ready[k].ok; });
        diagBox.appendChild(h('div', { class: 'diag-sum' + (bad.length ? ' bad' : ' ok') }, bad.length ? bad.length + ' أدوات مش هتشتغل عندك دلوقتي — السبب جنب كل واحدة' : 'كل حاجة جاهزة ✓'));
        Object.keys(READY).forEach(function (k) { var v = r.ready[k]; if (v) diagBox.appendChild(line(v.ok, READY[k], v.ok ? 'جاهزة' : v.why, v.untested)); });
        var det = h('details', { class: 'diag-det' }, h('summary', null, 'التفاصيل'));
        if (r.premiere && r.premiere.error) det.appendChild(line(false, 'بريمير', r.premiere.error));
        if (r.premiere && r.premiere.env) det.appendChild(h('div', { class: 'hint ltr' }, (r.premiere.env.app || '') + ' ' + (r.premiere.env.version || '') + ' · ' + (r.premiere.env.os || '') + ' · Node ' + (r.panel.node || '')));
        ((r.premiere && r.premiere.probes) || []).forEach(function (p) { det.appendChild(line(p.ok, PROBE[p.id] || p.id, (p.detail || '') + ' · ' + p.ms + 'ms', /^skipped/.test(p.detail || ''))); });
        Object.keys(r.tools).forEach(function (k) { det.appendChild(line(r.tools[k].ok, TOOLS[k] || k, r.tools[k].detail)); });
        Object.keys(r.network).forEach(function (k) { det.appendChild(line(r.network[k].ok, 'النت: ' + k, r.network[k].detail)); });
        diagBox.appendChild(det);
      }
      var runDiag = UI.btn('افحص بريمير بتاعي', function () {
        UI.safe('بيفحص', function () { return S.selfTest({ onStep: function (m) { diagStep.textContent = m; } }).then(function (r) { diagStep.textContent = ''; drawDiag(r); }); }, runDiag);
      }, 'primary');
      var report = UI.btn('انسخ تقرير المشكلة', function () {
        var txt = S.diagnosticReport(), ta = h('textarea', { class: 'ltr', style: { position: 'fixed', opacity: 0 } }, txt);
        ta.value = txt; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        if (!ok && navigator.clipboard) navigator.clipboard.writeText(txt);
        UI.toast('التقرير اتنسخ ✓ — الصقه في رسالة وابعتهولي (مفيهوش مفاتيحك)');
      });
      var diagCard = UI.card('الفحص', UI.hint('بيجرّب كل أمر الإضافة بتستخدمه على سيكوينس تجربة (وبيمسحها بعدها)، وبيدوّر على البرامج والنت. لو أداة مش شغالة هيقولك ليه. لو حاجة وقعت معاك دوس "انسخ تقرير المشكلة" وابعتهولي.'),
        UI.row(runDiag, report, diagStep), diagBox);
      diagCard.id = 'diag';
      view.appendChild(diagCard);
      if (S.lastSelfTest) drawDiag(S.lastSelfTest);
      view.appendChild(UI.card('المفاتيح', UI.hint('بتتحفظ على جهازك بس (~/.editfast). كل الذكاء الاصطناعي بيعدّي من OpenRouter بمفتاحك.'),
        keyInput('openrouter', 'OpenRouter', 'https://openrouter.ai/keys'), UI.row(testBtn),
        keyInput('elevenlabs', 'ElevenLabs (SFX)', 'https://elevenlabs.io/app/settings/api-keys'),
        keyInput('pexels', 'Pexels', 'https://www.pexels.com/api/'), keyInput('pixabay', 'Pixabay', 'https://pixabay.com/api/docs/')));
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
        UI.row(testAll, loadBtn, listInfo), testBox, h('details', { class: 'adv' }, h('summary', null, 'متقدّم: موديل لكل ميزة (13)'), modelsBox)));
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

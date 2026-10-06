/* مؤثرات صوتية بالذكاء الاصطناعي. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var history = [];
  EF.tabs.push({
    id: 'sfx', icon: '🔊', label: 'مؤثر صوتي', title: 'مؤثرات صوتية (AI)',
    render: function (view) {
      var S = EF.services, dur = 0, infl = 0.4;
      var prompt = h('textarea', { placeholder: 'اوصف الصوت… مثلاً: ووش سريع وبعده خبطة تقيلة' });
      var en = h('textarea', { placeholder: 'English prompt (اختياري — بيتملى بالترجمة)', class: 'ltr', rows: 2 });
      var hist = h('div', { class: 'list' });
      function drawHist() {
        UI.empty(hist);
        history.forEach(function (x) {
          var audio = h('audio', { src: EF.fileUrl(x.file), preload: 'none' });
          hist.appendChild(h('div', { class: 'item' },
            UI.btn('▶', function () { audio.currentTime = 0; audio.play(); }, 'small'),
            h('span', { class: 'grow ltr' }, x.prompt), audio,
            UI.btn('حط عند رأس التشغيل', function () { UI.safe('بيحط الصوت', function () { return S.seq().then(function (s) { return S.host('placeFile', { path: x.file, time: s.playhead, kind: 'audio', track: -1, bin: 'EditFast/SFX' }); }).then(function () { UI.toast('اتحط ✓'); }); }); }, 'small')));
        });
      }
      var tr = UI.btn('ترجم للإنجليزي', function () {
        UI.safe('بيترجم', function () { return S.translateSfx(prompt.value).then(function (t) { en.value = t; }); }, tr);
      });
      var gen = UI.btn('ولّد الصوت', function () {
        var text = en.value.trim() || prompt.value.trim();
        if (!text) return UI.toast('اكتب وصف الصوت', true);
        UI.safe('بيولّد الصوت', function () {
          return S.generateSfx({ prompt: text, translate: !en.value.trim(), duration: dur || undefined, influence: infl }).then(function (r) {
            history.unshift({ file: r.file, prompt: r.prompt }); drawHist();
            new Audio(EF.fileUrl(r.file)).play().catch(function () {});
          });
        }, gen);
      }, 'primary');
      view.appendChild(UI.card(null, prompt, UI.row(tr, h('span', { class: 'hint' }, 'الترجمة بتطلّع نتيجة أدق')), en,
        UI.modelPicker('sfx_translate'),
        UI.field('المدة', UI.slider(0, 22, 0.5, 0, function (v) { return v ? v + 's' : 'تلقائي'; }, function (v) { dur = v; })),
        UI.field('الالتزام بالوصف', UI.slider(0, 1, 0.05, infl, function (v) { return Math.round(v * 100) + '%'; }, function (v) { infl = v; })),
        UI.row(gen), UI.hint('التوليد بيتم بـ ElevenLabs بمفتاحك. الأصوات بتتحفظ على جهازك وبتتكرر من الكاش من غير تكلفة.')));
      view.appendChild(UI.card('اللي ولّدته', hist));
      drawHist();

      // trendy pack: synthesized on this machine — free, offline, no rights issues
      var pack = h('div', { class: 'sfx-pack' });
      S.sfxPackList().forEach(function (x) {
        var play = h('button', { type: 'button', class: 'sfx-play', title: 'اسمع' }, '▶');
        play.addEventListener('click', function (e) { e.stopPropagation(); try { new Audio(EF.fileUrl(S.sfxPackFile(x.id))).play().catch(function () {}); } catch (err) { UI.toast(err.message, true); } });
        pack.appendChild(h('div', { class: 'sfx-item', title: x.tags + ' — دوس تحطه عند رأس التشغيل', onclick: function () {
          UI.safe('بيحط ' + x.label, function () { return S.placeSfx({ id: x.id }).then(function (r) { UI.toast(x.label + ' على A' + (r.track + 1) + ' ✓'); }); });
        } }, play, h('span', null, x.label)));
      });
      var inst = UI.btn('ضيف الباقة لمكتبتي', function () { UI.safe('بيجهّز الباقة', function () { return S.sfxPackInstall().then(function (r) { UI.toast(r.files + ' مؤثر اتضافوا للمكتبة ✓'); }); }, inst); }, 'small');
      view.appendChild(UI.card('مؤثرات ترند — مجانية وأوفلاين', pack, UI.row(inst), UI.hint('بتتولّد على جهازك بالكود (ووش، رايزر، إمباكت، بوب، جليتش، كاميرا، كاشير…) من غير نت ولا حقوق.')));

      // AI music
      var mPrompt = h('textarea', { rows: 2, placeholder: 'اوصف المزيكا… مثلاً: لو-فاي هادية للفلوج، أو إلكترونيك حماسي للإعلان' });
      var mSec = 30, mInst = true, mBox = h('div', { class: 'list' });
      var mGo = UI.btn('ولّد المزيكا', function () {
        if (!mPrompt.value.trim()) return UI.toast('اوصف المزيكا', true);
        UI.safe('بيولّد المزيكا', function () {
          return S.generateMusic({ prompt: mPrompt.value, seconds: mSec, instrumental: mInst }).then(function (r) {
            var a = h('audio', { src: EF.fileUrl(r.file), controls: true, style: { width: '100%' } });
            mBox.insertBefore(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'hint ltr' }, r.prompt), a),
              UI.btn('حطها', function () { UI.safe('بيحط المزيكا', function () { return S.seq().then(function (s) { return S.host('placeFile', { path: r.file, time: s.playhead, kind: 'audio', track: -1, duration: mSec, bin: 'EditFast/Music' }); }).then(function () { UI.toast('المزيكا نزلت ✓'); }); }); }, 'small')), mBox.firstChild);
          });
        }, mGo);
      }, 'primary');
      view.appendChild(UI.card('مزيكا بالذكاء الاصطناعي', mPrompt,
        UI.field('المدة', UI.slider(10, 180, 5, mSec, function (v) { return v + 's'; }, function (v) { mSec = v; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: mInst, onchange: function (e) { mInst = e.target.checked; } }), ' من غير غُنا')),
        UI.row(mGo), mBox, UI.hint('ElevenLabs Music بمفتاحك. الوصف بالعربي بيتترجم تلقائي.')));
    }
  });
})();

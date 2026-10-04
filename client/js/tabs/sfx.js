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
    }
  });
})();

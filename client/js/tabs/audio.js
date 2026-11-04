/* الصوت: تنضيف + توطية الموسيقى تحت الكلام. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'audio', icon: '🎚', label: 'الصوت', title: 'تنضيف الصوت وتوطية الموسيقى',
    render: function (view) {
      var S = EF.services, strength = 'medium', loud = -16, duck = -12, mode = 'studio', prog = UI.progress(), reportBox = h('div', { class: 'audio-report' });
      var voiceSel = h('select'), musicSel = h('select');
      S.audioTracksGuess().then(function (g) {
        g.seq.audio.forEach(function (t) {
          var lab = 'A' + (t.index + 1) + ' (' + t.clips.length + ')';
          voiceSel.appendChild(h('option', { value: t.index, selected: t.index === g.voice }, lab));
          musicSel.appendChild(h('option', { value: t.index, selected: t.index === g.music }, lab));
        });
      }).catch(function () {});
      function drawReport(r) {
        UI.empty(reportBox);
        if (!r) return;
        var row = function (label, a, b, unit) { return h('div', { class: 'kv-row' }, h('span', null, label), h('b', { class: 'ltr' }, (a === null ? '—' : a) + unit + '  ←  ' + (b === null ? '—' : b) + unit)); };
        reportBox.appendChild(h('div', { class: 'kv' },
          row('العلو (Loudness)', r.before.lufs, r.after.lufs, ' LUFS'),
          row('أعلى قمة (True Peak)', r.before.truePeak, r.after.truePeak, ' dBTP'),
          row('مستوى الدوشة', r.before.noiseFloor, r.after.noiseFloor, ' dB')));
        if (r.found && r.found.length) reportBox.appendChild(UI.hint('لقيت واتعالج: ' + r.found.join('، ')));
      }
      var clean = UI.btn('نضّف الصوت', function () {
        UI.safe('بينضّف الصوت', function () { return S.cleanAudio({ track: +voiceSel.value, strength: strength, loudness: loud, mode: mode, onProgress: function (p) { prog.set(p); } }).then(function (r) { prog.set(1); drawReport(r.report); UI.toast(r.clips + ' كليب اتنضّف ✓ — الأصلي اتكتم (A' + (r.track + 1) + ')'); }); }, clean);
      }, 'primary');
      var duckBtn = UI.btn('وطّي الموسيقى تحت الكلام', function () {
        UI.safe('بيسمع الكلام', function () { return S.duckMusic({ voiceTrack: +voiceSel.value, musicTrack: +musicSel.value, duckDb: duck }).then(function (r) { UI.toast(r.speech + ' جملة — ' + r.keys + ' كي فريم على الموسيقى ✓'); }); }, duckBtn);
      }, 'primary');
      view.appendChild(UI.card('صوت استوديو (زي Auphonic، أوفلاين)',
        UI.hint('بيسمع نوع الدوشة الأول ويختار العلاج: وزن الكهربا 50/60Hz بيتشال بدقة، دوشة الشارع والتكييف بموديل AI (RNNoise)، والوش الثابت والكيبورد بفلتر FFT. وبعدين يوحّد الكلام العالي والواطي (Leveler) ويظبط العلو على الهدف. النسخة النضيفة بتنزل على تراك جديد والأصلي بيتكتم.'),
        UI.field('تراك الكلام', voiceSel),
        UI.row(h('label', null, 'الطريقة'), UI.seg([{ value: 'studio', label: 'استوديو (تلقائي)' }, { value: 'classic', label: 'عادي' }], mode, function (v) { mode = v; })),
        UI.row(h('label', null, 'القوة'), UI.seg([{ value: 'light', label: 'خفيف' }, { value: 'medium', label: 'متوسط' }, { value: 'strong', label: 'قوي' }], strength, function (v) { strength = v; })),
        UI.row(h('label', null, 'العلو'), UI.seg([{ value: -14, label: 'يوتيوب -14' }, { value: -16, label: 'بودكاست -16' }, { value: -23, label: 'تلفزيون -23' }], loud, function (v) { loud = v; })),
        prog, UI.row(clean), reportBox));
      var sepStep = h('div', { class: 'hint' });
      view.appendChild(UI.card('فصل الصوت عن المزيكا',
        UI.hint('الكلام لوحده على تراك والمزيكا لوحدها على تراك تاني (موديل Demucs على fal.ai، حوالي 0.04$ للدقيقة)، والتراك الأصلي بيتكتم. حلو للفيديوهات اللي المزيكا فيها مدموجة مع الكلام.'),
        UI.row(UI.btn('افصل الصوت عن المزيكا', function () {
          UI.safe('بيفصل الصوت', function () { return S.separateAudio({ track: +voiceSel.value, onProgress: function (p, m) { prog.set(p); if (m) sepStep.textContent = m; } }).then(function (r) { prog.set(1); sepStep.textContent = 'الكلام: A' + (r.voiceTrack + 1) + ' · المزيكا: A' + (r.musicTrack + 1) + (r.cost ? ' · تقريبًا ' + r.cost + '$' : ''); UI.toast('اتفصلوا ✓'); }); });
        }, 'small')), sepStep));
      view.appendChild(UI.card('توطية الموسيقى (Auto Ducking)',
        UI.hint('بيعرف أماكن الكلام ويحط كي فريمز على Volume الموسيقى: بتوطى وقت الكلام وترجع في السكوت بنعومة.'),
        UI.field('تراك الموسيقى', musicSel),
        UI.field('قد إيه', UI.slider(-24, -3, 1, duck, function (v) { return v + ' dB'; }, function (v) { duck = v; })),
        UI.row(duckBtn)));
    }
  });
})();

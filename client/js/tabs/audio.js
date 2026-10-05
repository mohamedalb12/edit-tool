/* الصوت: تنضيف + توطية الموسيقى تحت الكلام. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'audio', icon: '🎚', label: 'الصوت', title: 'تنضيف الصوت وتوطية الموسيقى',
    render: function (view) {
      var S = EF.services, strength = 'medium', loud = -16, duck = -12, prog = UI.progress();
      var voiceSel = h('select'), musicSel = h('select');
      S.audioTracksGuess().then(function (g) {
        g.seq.audio.forEach(function (t) {
          var lab = 'A' + (t.index + 1) + ' (' + t.clips.length + ')';
          voiceSel.appendChild(h('option', { value: t.index, selected: t.index === g.voice }, lab));
          musicSel.appendChild(h('option', { value: t.index, selected: t.index === g.music }, lab));
        });
      }).catch(function () {});
      var clean = UI.btn('نضّف الصوت', function () {
        UI.safe('بينضّف الصوت', function () { return S.cleanAudio({ track: +voiceSel.value, strength: strength, loudness: loud, onProgress: function (p) { prog.set(p); } }).then(function (r) { prog.set(1); UI.toast(r.clips + ' كليب اتنضّف ✓ — الأصلي اتكتم (A' + (r.track + 1) + ')'); }); }, clean);
      }, 'primary');
      var duckBtn = UI.btn('وطّي الموسيقى تحت الكلام', function () {
        UI.safe('بيسمع الكلام', function () { return S.duckMusic({ voiceTrack: +voiceSel.value, musicTrack: +musicSel.value, duckDb: duck }).then(function (r) { UI.toast(r.speech + ' جملة — ' + r.keys + ' كي فريم على الموسيقى ✓'); }); }, duckBtn);
      }, 'primary');
      view.appendChild(UI.card('تنضيف الصوت (أوفلاين)',
        UI.hint('بيشيل الدوشة والرمبل والسين الحادة، وبيضغط الصوت ويوحّد علوّه. النسخة النضيفة بتنزل على تراك جديد والأصلي بيتكتم (تقدر ترجعه).'),
        UI.field('تراك الكلام', voiceSel),
        UI.row(h('label', null, 'القوة'), UI.seg([{ value: 'light', label: 'خفيف' }, { value: 'medium', label: 'متوسط' }, { value: 'strong', label: 'قوي' }], strength, function (v) { strength = v; })),
        UI.row(h('label', null, 'العلو'), UI.seg([{ value: -14, label: 'يوتيوب -14' }, { value: -16, label: 'بودكاست -16' }, { value: -23, label: 'تلفزيون -23' }], loud, function (v) { loud = v; })),
        prog, UI.row(clean)));
      view.appendChild(UI.card('توطية الموسيقى (Auto Ducking)',
        UI.hint('بيعرف أماكن الكلام ويحط كي فريمز على Volume الموسيقى: بتوطى وقت الكلام وترجع في السكوت بنعومة.'),
        UI.field('تراك الموسيقى', musicSel),
        UI.field('قد إيه', UI.slider(-24, -3, 1, duck, function (v) { return v + ' dB'; }, function (v) { duck = v; })),
        UI.row(duckBtn)));
    }
  });
})();

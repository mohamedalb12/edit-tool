/* EditFast Motion — أدوات ذكية: فصل الصوت عن المزيكا، تتبّع الوش، إضاءة بعد التصوير، سلو موشن وحركة ناعمة، قص على الإيقاع. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs = EF.tabs || [];
  function S() { return EF.services; }
  function ok(t) { UI.toast(t); }
  function action(label, busy, fn, kind) { var b = UI.btn(label, function () { UI.safe(busy, fn, b); }, kind || 'small'); return b; }

  EF.tabs.push({
    id: 'smart', label: 'أدوات ذكية', title: 'أدوات ذكية',
    render: function (view) {
      // فصل الصوت عن المزيكا
      var stStep = h('div', { class: 'hint smart-step' });
      view.appendChild(UI.card('فصل الصوت عن المزيكا',
        UI.hint('اختار لير الفيديو أو الصوت: الكلام بيطلع على لير لوحده والمزيكا على لير تاني، والصوت الأصلي بيتقفل. بموديل Demucs على fal.ai (حوالي 0.04$ للدقيقة).'),
        UI.row(action('افصل الصوت', 'بيفصل الصوت', function () {
          return S().separateAudio({ onStep: function (m) { stStep.textContent = m; } }).then(function (r) { stStep.textContent = (r.layers || []).join(' · ') + (r.cost ? ' · تقريبًا ' + r.cost + '$' : ''); ok('الكلام والمزيكا اتفصلوا ✓'); });
        }, 'primary')), stStep));

      // تتبّع الوش
      var fcStep = h('div', { class: 'hint smart-step' });
      view.appendChild(UI.card('تتبّع الوش',
        UI.hint('اختار لير الفيديو ومعاه النص أو الصورة اللي عايزها تمشي مع الوش: بيلاقي الوش في كل فريم (على جهازك، من غير نت) ويعمل Null "EF Face" بيتحرك ويكبر ويصغر معاه، والليرز المختارة متربطة بيه. بيبدأ من مكان رأس التشغيل.'),
        UI.row(action('تتبّع الوش', 'بيتتبّع الوش', function () {
          return S().faceTrack({ onStep: function (m) { fcStep.textContent = m; } }).then(function (r) { fcStep.textContent = r.found + ' / ' + r.frames + ' فريم لقى فيهم الوش' + (r.attached ? ' · ' + r.attached + ' لير متربط' : ''); ok('الوش اتتبّع ✓'); });
        }, 'primary')), fcStep));

      // إضاءة بعد التصوير
      var lt = { intensity: 0.8, glow: 35, color: '#ffd9a8', softness: 60 };
      var col = h('input', { type: 'color', value: lt.color, onchange: function () { lt.color = col.value; } });
      view.appendChild(UI.card('إضاءة بعد التصوير',
        UI.hint('بقعة نور ناعمة على الشخص أو المنتج: Exposure + لون دافي جوه دايرة ناعمة الحواف. كل حاجة سلايدر على "EF Light Controls". لو فيه تتبّع وش، النور بيمشي مع الوش لوحده.'),
        UI.row(h('label', null, 'القوة'), UI.slider(0, 3, 0.1, lt.intensity, function (v) { return v.toFixed(1) + ' stop'; }, function (v) { lt.intensity = v; })),
        UI.row(h('label', null, 'اللون'), UI.slider(0, 100, 1, lt.glow, function (v) { return Math.round(v) + '%'; }, function (v) { lt.glow = v; }), col),
        UI.row(h('label', null, 'النعومة'), UI.slider(0, 100, 1, lt.softness, function (v) { return Math.round(v) + '%'; }, function (v) { lt.softness = v; })),
        UI.row(action('ضيف الإضاءة', 'بيضيف الإضاءة', function () {
          return S().relight({ intensity: lt.intensity, glow: lt.glow, color: lt.color, softness: lt.softness }).then(function (r) { ok(r.follows ? 'الإضاءة اتضافت وماشية مع الوش ✓' : 'الإضاءة اتضافت ✓ — حرّك "' + r.name + '" لمكان الشخص'); });
        }, 'primary'))));

      // سلو موشن وحركة ناعمة
      var sm = { speed: 50, blend: 'pixel' };
      view.appendChild(UI.card('سلو موشن وحركة ناعمة',
        UI.hint('على الليرز المختارة: الفيديو بيتبطّأ بالـ Time Remap، والفريمات اللي في النص بتتولّد بـ Pixel Motion (من غير تقطيع)، وMotion Blur سينمائي.'),
        UI.row(h('label', null, 'السرعة'), UI.seg([{ value: 25, label: '25%' }, { value: 50, label: '50%' }, { value: 75, label: '75%' }, { value: 100, label: 'عادي (بلر بس)' }], sm.speed, function (v) { sm.speed = v; })),
        UI.row(h('label', null, 'النعومة'), UI.seg([{ value: 'pixel', label: 'Pixel Motion (الأنعم)' }, { value: 'mix', label: 'Frame Mix (أسرع)' }], sm.blend, function (v) { sm.blend = v; })),
        UI.row(action('طبّق', 'بيطبّق', function () {
          return S().slowMotion({ speed: sm.speed, blend: sm.blend, motionBlur: true }).then(function (r) { ok((r.remapped ? r.remapped + ' فيديو اتبطّأ · ' : '') + 'Motion Blur اتفعّل ✓'); });
        }, 'primary'))));

      // قص على الإيقاع
      var bt = { every: 2 };
      var btStep = h('div', { class: 'hint smart-step' });
      view.appendChild(UI.card('قص على إيقاع المزيكا',
        UI.hint('اختار لير المزيكا والليرز اللي عايزها تتقطع: بيلاقي البيت ويحط ماركرز على كل ضربة، وكل لير بيبدأ على ضربة ويخلص على اللي بعدها.'),
        UI.row(h('label', null, 'كل'), UI.seg([{ value: 1, label: 'ضربة' }, { value: 2, label: '2' }, { value: 4, label: '4' }, { value: 8, label: '8' }], bt.every, function (v) { bt.every = v; })),
        UI.row(action('ماركرز بس', 'بيسمع المزيكا', function () { return S().beatCut({ every: bt.every, cut: false }).then(function (r) { btStep.textContent = r.markers + ' ماركر' + (r.bpm ? ' · ' + r.bpm + ' BPM' : ''); }); }),
          action('قطّع على البيت', 'بيقطّع', function () { return S().beatCut({ every: bt.every, cut: true }).then(function (r) { btStep.textContent = r.markers + ' ماركر · ' + r.cut + ' لير اتقطّع' + (r.bpm ? ' · ' + r.bpm + ' BPM' : ''); ok('اتقطّع على الإيقاع ✓'); }); }, 'primary')),
        btStep));

      view.appendChild(UI.card('وكمان',
        UI.hint('كابشن تلقائي من الصوت: تاب المونتير ← كلام متحرك · قص الشخص من الفيديو: تاب مؤثرات ← روتو · تتبّع أي حاجة غير الوش: تاب تراكينج.')));
    }
  });
})();

/* ريلز وشورتس: تحويل طولي بتتبّع الوش + مقاطع شورتس من الفيديو الطويل. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { ratio: '9:16', shorts: null, reframe: true, captions: true };
  EF.tabs.push({
    id: 'reels', icon: '📱', label: 'ريلز وشورتس', title: 'ريلز وشورتس',
    render: function (view) {
      var S = EF.services, prog = UI.progress(), now = h('span', { class: 'hint' });
      var go = UI.btn('حوّل السيكوينس لريلز', function () {
        UI.safe('بيتتبّع الوش ويقص', function () {
          return S.makeReels({ ratio: state.ratio, onProgress: function (p, name) { prog.set(p); now.textContent = (name ? name + ' — ' : '') + Math.round(p * 100) + '%'; } })
            .then(function (r) { prog.set(1); UI.toast('اتعملت "' + r.name + '" ✓'); });
        }, go);
      }, 'primary');
      var shortsBox = h('div');
      function drawShorts() {
        UI.empty(shortsBox);
        if (!state.shorts) return;
        if (!state.shorts.length) { shortsBox.appendChild(UI.hint('ملقاش مقاطع تنفع.')); return; }
        state.shorts.forEach(function (sh, i) {
          var b = UI.btn('اعمل الشورت', function () {
            UI.safe('بيعمل الشورت', function () { return S.makeShort(sh, { reframe: state.reframe, captions: state.captions, ratio: state.ratio, onProgress: function (p) { prog.set(p); } }).then(function (r) { UI.toast('"' + r.sequence + '" جاهز ✓ (' + r.length + 's)'); }); }, b);
          }, 'primary small');
          shortsBox.appendChild(h('div', { class: 'item short' },
            h('div', { class: 'score' }, String(sh.score || '')),
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 800 } }, sh.title), h('div', { class: 'hint' }, UI.fmtTime(sh.start) + ' → ' + UI.fmtTime(sh.end) + ' · ' + Math.round(sh.end - sh.start) + 's' + (sh.reason ? ' · ' + sh.reason : ''))),
            UI.btn('▶', function () { S.setPlayhead(sh.start); }, 'small'), b));
        });
      }
      var count = 3;
      var find = UI.btn('دوّر على أقوى المقاطع', function () {
        UI.safe('بيدوّر على شورتس', function () { return S.findShorts({ count: count }).then(function (r) { state.shorts = r; drawShorts(); }); }, find);
      }, 'primary');
      view.appendChild(UI.card('تحويل طولي بتتبّع الوش',
        UI.hint('بيحلل الفيديو أوفلاين ويلاقي وش اللي بيتكلم، والكاميرا بتتبعه بنعومة (من غير رعشة) وبتقطع مع تغيير اللقطة. بيعمل سيكوينس جديدة بنفس التوقيت.'),
        UI.row(h('label', null, 'المقاس'), UI.seg([{ value: '9:16', label: '9:16 ريلز' }, { value: '4:5', label: '4:5 بوست' }, { value: '1:1', label: '1:1' }], state.ratio, function (v) { state.ratio = v; })),
        prog, UI.row(go, now)));
      view.appendChild(UI.card('شورتس من الفيديو الطويل',
        UI.hint('الذكاء الاصطناعي بيقرا الكلام ويختار أقوى مقاطع (20-60 ثانية) بتبدأ بهوك وبتخلص بفكرة كاملة.'),
        UI.field('العدد', UI.slider(1, 8, 1, count, function (v) { return v + ' مقاطع'; }, function (v) { count = v; })),
        UI.row(h('label', null, 'تحويل طولي'), h('input', { type: 'checkbox', checked: state.reframe, onchange: function (e) { state.reframe = e.target.checked; } }), h('label', null, 'كابشن'), h('input', { type: 'checkbox', checked: state.captions, onchange: function (e) { state.captions = e.target.checked; } })),
        UI.modelPicker('shorts'), UI.row(find), h('div', { class: 'list' }, shortsBox)));
      drawShorts();
    }
  });
})();

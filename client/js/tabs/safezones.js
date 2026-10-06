/* المناطق الآمنة: ريلز / تيك توك / شورتس — معاينة على الكادر + فحص الوشوش والكابشن + دليل على التايملين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { platform: 'tiktok', result: null, frame: null };
  EF.tabs.push({
    id: 'safezones', label: 'منطقة آمنة', title: 'المناطق الآمنة — ريلز · تيك توك · شورتس',
    render: function (view) {
      var S = EF.services;
      var canvas = h('canvas', { class: 'sz-canvas', width: 270, height: 480 }), res = h('div'), warn = h('div');
      var img = new Image();
      function paint() {
        var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        if (img.complete && img.naturalWidth) { var s = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * s, hh = img.naturalHeight * s; ctx.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh); }
        else { var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a1d4f'); g.addColorStop(1, '#0d0b18'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
        EF.drawSafeZones(ctx, W, H, o.platform);
        var r = o.result; if (!r) return;
        // caption block where EditFast puts captions
        ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect(W * 0.08, H * (r.captionY - 0.045), W * 0.84, H * 0.09); ctx.setLineDash([]);
      }
      img.onload = paint;
      function loadFrame() {
        S.seq().then(function (s) {
          warn.textContent = s.height > s.width ? '' : '⚠ السيكوينس دي أفقية (' + s.width + 'x' + s.height + ') — المناطق الآمنة للفيديو الطولي 9:16. استخدم "ريلز" الأول.';
          return S.lookAtFrames({ times: [s.playhead], width: 360 });
        }).then(function (fr) { if (fr && fr[0]) { img.src = 'data:image/jpeg;base64,' + fr[0].b64; } }).catch(function () { paint(); });
      }

      function drawResult() {
        UI.empty(res);
        var r = o.result; if (!r) return;
        var list = h('div', { class: 'list' });
        r.issues.forEach(function (i) {
          list.appendChild(h('div', { class: 'item' + (i.time !== null ? ' click' : ''), onclick: function () { if (i.time !== null) S.setPlayhead(i.time).then(loadFrame); } },
            h('span', { class: 't' }, i.time !== null ? UI.fmtTime(i.time) : '—'), h('span', null, { face: '🙂', caption: '💬', text: '🔤' }[i.kind] || '•'), h('span', { class: 'grow' }, i.text)));
        });
        if (!r.issues.length) list.appendChild(h('div', { class: 'item' }, h('span', null, '✓'), h('span', null, 'كله في المنطقة الآمنة')));
        var fix = UI.btn('انقل الكابشن للمكان الآمن', function () { var y = S.safeCaptions({ platform: o.platform }).y; o.result.captionY = y; paint(); UI.toast('الكابشن الجاي هينزل عند ' + Math.round(y * 100) + '% من الطول ✓'); }, 'small');
        var marks = UI.btn('حط ماركرز على المشاكل', function () { UI.safe('بيحط ماركرز', function () { return S.safeZoneCheck({ platform: o.platform, addMarkers: true }).then(function () { UI.toast('اتحطت ✓'); }); }, marks); }, 'small');
        res.appendChild(UI.card('النتيجة: ' + r.score + '% من الوقت الوش في الأمان', list, UI.row(fix, marks)));
      }

      var check = UI.btn('افحص الفيديو', function () {
        UI.safe('بيفحص الوشوش والكابشن', function () { return S.safeZoneCheck({ platform: o.platform }).then(function (r) { o.result = r; drawResult(); paint(); }); }, check);
      }, 'primary');
      var guide = UI.btn('حط الدليل على التايملين', function () {
        UI.safe('بيحط الدليل', function () { return S.safeZoneGuide({ platform: o.platform }).then(function (r) { UI.toast('الدليل على V' + (r.track + 1) + ' — اقفله أو امسحه قبل التصدير (أو تراجع)'); }); }, guide);
      });
      view.appendChild(UI.card(null,
        UI.seg([{ value: 'tiktok', label: 'تيك توك' }, { value: 'reels', label: 'ريلز' }, { value: 'shorts', label: 'شورتس' }, { value: 'all', label: 'الكل' }], o.platform, function (v) { o.platform = v; paint(); if (o.result) check.click(); }),
        warn, h('div', { class: 'sz-wrap' }, canvas),
        UI.row(check, guide, UI.btn('حدّث الكادر', loadFrame, 'small')),
        UI.hint('الأحمر = زراير وكابشن المنصة بتغطيه. الأخضر = المكان الآمن للوش والنص. الفحص بيدوّر على الوشوش أوفلاين في كل ثانية ويقارن مكان الكابشن.')));
      view.appendChild(res);
      paint(); loadFrame(); drawResult();
    }
  });
})();

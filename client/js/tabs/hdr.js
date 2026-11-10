/* HDR → SDR: الفوتيج المتصوّر HDR (موبايل / كاميرا) يبقى Rec.709 بنفس الألوان والجودة، ويتبدّل في المشروع لوحده. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var st = { look: 'natural', codec: 'prores', brightness: 0, saturation: 1, replace: true, list: null, picked: {} };

  EF.tabs.push({
    id: 'hdr', icon: '☀', label: 'HDR لـ SDR', title: 'تحويل HDR لـ SDR',
    render: function (view) {
      var S = EF.services;
      var listBox = h('div', { class: 'list hdr-list' }), prevBox = h('div', { class: 'hdr-preview' }), step = h('div', { class: 'hint hdr-step' });
      var bar = UI.progress();
      function files() { return Object.keys(st.picked).filter(function (f) { return st.picked[f]; }); }
      function drawList() {
        UI.empty(listBox);
        if (!st.list) { listBox.appendChild(UI.hint('دوس "دوّر في السيكوينس" أو اختار ملفات.')); return; }
        if (!st.list.length) { listBox.appendChild(UI.hint('مفيش فيديوهات في السيكوينس.')); return; }
        st.list.forEach(function (it) {
          var cb = h('input', { type: 'checkbox', class: 'hdr-pick', disabled: !it.hdr });
          cb.checked = !!st.picked[it.file];
          cb.addEventListener('change', function () { st.picked[it.file] = cb.checked; });
          listBox.appendChild(h('label', { class: 'item hdr-item' + (it.hdr ? ' is-hdr' : '') }, cb,
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, it.name), h('div', { class: 'hint ltr' }, it.file)),
            h('span', { class: 'badge-hdr' }, it.label + (it.uses ? ' · ' + it.uses + '×' : ''))));
        });
      }
      function setList(l) { st.list = l; st.picked = {}; l.forEach(function (it) { if (it.hdr) st.picked[it.file] = true; }); drawList(); }

      var scan = UI.btn('دوّر في السيكوينس', function () {
        UI.safe('بيدوّر على HDR', function () { return S.hdrScan().then(function (l) { setList(l); var n = l.filter(function (x) { return x.hdr; }).length; step.textContent = n ? n + ' فيديو HDR من ' + l.length : 'مفيش HDR في السيكوينس دي ✓'; }); }, scan);
      }, 'primary');
      var pick = UI.btn('اختار ملفات…', function () {
        var fs = EF.pickFiles ? EF.pickFiles('فيديوهات HDR', ['mov', 'mp4', 'm4v', 'mxf', 'mkv', 'hevc']) : [];
        if (!fs.length) return;
        setList(fs.map(function (f) { return { file: f, name: f.split(/[\\/]/).pop(), hdr: 'unknown', label: 'هيتشاف وقت التحويل', uses: 0 }; }));
      }, 'small');

      var preview = UI.btn('شوف قبل وبعد', function () {
        var f = files()[0]; if (!f) return UI.toast('اختار فيديو HDR الأول', true);
        UI.safe('بيعمل معاينة', function () {
          return S.hdrPreview({ file: f, t: 1, look: st.look, brightness: st.brightness, saturation: st.saturation }).then(function (r) {
            UI.empty(prevBox);
            prevBox.appendChild(h('div', { class: 'hdr-pair' },
              h('figure', null, h('img', { src: 'data:image/jpeg;base64,' + r.after, alt: 'بعد' }), h('figcaption', null, 'بعد التحويل (SDR)')),
              h('figure', { class: 'naive' }, h('img', { src: 'data:image/jpeg;base64,' + r.naive, alt: 'من غير تحويل' }), h('figcaption', null, 'لو اتحط زي ما هو (باهت)'))));
          });
        }, preview);
      }, 'small');

      var go = UI.btn('حوّل لـ SDR', function () {
        var fs = files(); if (!fs.length) return UI.toast('اختار فيديو HDR الأول', true);
        UI.safe('بيحوّل HDR لـ SDR', function () {
          bar.set(0);
          return S.hdrConvert({ files: fs, codec: st.codec, look: st.look, brightness: st.brightness, saturation: st.saturation, replace: st.replace,
            onProgress: function (p, name) { bar.set(p); step.textContent = 'بيحوّل ' + name + ' ' + Math.round(p * 100) + '%'; } }).then(function (r) {
            bar.set(1);
            step.textContent = (r.done.length ? '✓ ' + r.done.length + ' فيديو اتحوّل' + (st.replace ? ' واتبدّل في المشروع' : '') + ': ' + r.done.map(function (d) { return d.out.split(/[\\/]/).pop(); }).join('، ') : '') +
              (r.failed.length ? (r.done.length ? ' · ' : '') + '✗ ' + r.failed.map(function (x) { return x.file.split(/[\\/]/).pop() + ': ' + x.error; }).join(' | ') : '');
            UI.toast(r.failed.length ? 'فيه ملفات ماتحوّلتش — شوف تحت' : 'اتحوّل لـ SDR ✓', !!r.failed.length);
          });
        }, go);
      }, 'primary');

      var rep = h('input', { type: 'checkbox', class: 'hdr-replace' }); rep.checked = st.replace;
      rep.addEventListener('change', function () { st.replace = rep.checked; });

      view.appendChild(UI.card('HDR لـ SDR بنفس الألوان',
        UI.hint('الفيديو اللي اتصوّر HDR (آيفون / أندرويد / كاميرا: HLG أو HDR10 أو Dolby Vision) بيطلع باهت أو محروق في سيكوينس عادية. هنا بيتحوّل لـ Rec.709 صح: الألوان والضل زي ما اتصوّروا، والإضاءة العالية بتتضغط بنعومة بدل ما تتحرق، و10-bit من غير banding. الملف الأصلي مابيتلمسش، والنسخة بتتحفظ جنبه باسم ‎…_SDR.'),
        UI.row(scan, pick), listBox,
        UI.row(h('label', null, 'الشكل'), UI.seg([{ value: 'natural', label: 'طبيعي' }, { value: 'soft', label: 'هايلايت أنعم' }, { value: 'filmic', label: 'سينمائي' }], st.look, function (v) { st.look = v; })),
        UI.row(h('label', null, 'الإضاءة'), UI.slider(-1, 1, 0.1, st.brightness, function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' stop'; }, function (v) { st.brightness = v; })),
        UI.row(h('label', null, 'التشبّع'), UI.slider(0.8, 1.3, 0.01, st.saturation, function (v) { return Math.round(v * 100) + '%'; }, function (v) { st.saturation = v; })),
        UI.row(h('label', null, 'الملف'), UI.seg([{ value: 'prores', label: 'ProRes 422 HQ' }, { value: 'hevc', label: 'HEVC 10-bit' }, { value: 'h264', label: 'H.264' }], st.codec, function (v) { st.codec = v; })),
        UI.row(h('label', { class: 'hdr-replace-l' }, rep, ' بدّله في المشروع (كل مكان الكليب متحط فيه)')),
        UI.row(preview, go), bar, step, prevBox,
        UI.hint('ProRes 422 HQ أعلى جودة وأخف في المونتاج (حجمه كبير). HEVC أصغر بكتير بنفس الجودة تقريبًا. لو السيكوينس نفسها HDR (Rec.2100) مش محتاج تحوّل.')));
      drawList();
    }
  });
})();

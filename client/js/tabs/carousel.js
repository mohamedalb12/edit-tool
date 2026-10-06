/* كاروسيل ثري دي: من 2 لـ 10 صور/فيديوهات، معاينة حية في اللوحة، والرندر بـ Remotion كمنتج واحد على التايملين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { files: [], layout: 'ring', speed: 1, direction: 'left', tilt: 10, radius: 1, cardSize: 1, aspect: '4:5', reflection: true, glow: true, rounded: 26, title: '', background: 'studio', duration: 6 };
  var ASPECT = { '4:5': 0.8, '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '3:4': 0.75 };
  var COLORS = ['#7C5CFF', '#22D3EE', '#F472B6', '#FBBF24', '#34D399', '#F97316', '#60A5FA', '#E879F9', '#A3E635', '#FB7185'];

  EF.tabs.push({
    id: 'carousel', label: 'كاروسيل 3D', title: 'كاروسيل ثري دي',
    render: function (view) {
      var S = EF.services;
      var stage = h('div', { class: 'c3d-stage' }), ring = h('div', { class: 'c3d-ring' }); stage.appendChild(ring);
      var list = h('div', { class: 'chips' }), prog = UI.progress(), still = h('div', { class: 'pro-preview' });
      var raf = null, t0 = performance.now();

      function cards() {
        UI.empty(ring);
        var n = Math.max(2, o.files.length || 6), items = [];
        for (var i = 0; i < n; i++) {
          var f = o.files[i];
          var c = h('div', { class: 'c3d-card' + (o.glow ? ' glow' : '') + (o.reflection ? ' refl' : '') });
          if (f && /\.(jpe?g|png|webp|gif)$/i.test(f)) c.appendChild(h('img', { src: EF.fileUrl(f) }));
          else if (f) c.appendChild(h('video', { src: EF.fileUrl(f), muted: true, autoplay: true, loop: true }));
          else c.style.background = 'linear-gradient(135deg,' + COLORS[i % 10] + ',' + COLORS[(i + 3) % 10] + ')';
          ring.appendChild(c); items.push(c);
        }
        return items;
      }
      var items = cards();

      // same math as the Remotion component, at panel size
      function frame(now) {
        if (!document.body.contains(stage)) { cancelAnimationFrame(raf); return; }
        var W = stage.clientWidth || 320, H = stage.clientHeight || 180, n = items.length, t = (now - t0) / 1000;
        var ar = ASPECT[o.aspect] || 0.8, base = Math.min(W, H) * 0.5 * o.cardSize, cw = ar >= 1 ? base * 1.45 : base * ar * 1.25, ch = cw / ar;
        var dir = o.direction === 'right' ? -1 : 1, rr = o.rounded * (cw / 400);
        stage.style.perspective = Math.max(W, H) * 1.6 + 'px';
        items.forEach(function (c) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; c.style.marginLeft = -cw / 2 + 'px'; c.style.marginTop = -ch / 2 + 'px'; c.style.borderRadius = rr + 'px'; });
        if (o.layout === 'coverflow' || o.layout === 'stack') {
          var dur = o.duration, per = Math.max(0.6, dur / Math.max(1, n - 0.6)) / Math.max(0.2, o.speed);
          var raw = (t % (per * n)) / per, k = Math.floor(raw), f = raw - k, e = Math.max(0, Math.min(1, (f - 0.35) / 0.65)); e = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
          var pos = Math.min(n - 1, k + e);
          ring.style.transform = 'rotateX(' + (-o.tilt * 0.4) + 'deg)';
          items.forEach(function (c, i) {
            var d = (i - pos) * dir, tr, z, op = 1, light = 1;
            if (o.layout === 'stack') {
              var gone = Math.max(0, Math.min(1, -d)), behind = Math.max(0, d);
              tr = 'translate3d(' + (gone * -cw * 1.6 * dir) + 'px,' + (behind * -ch * 0.06) + 'px,' + (-behind * cw * 0.28 + gone * cw * 0.3) + 'px) rotateY(' + (gone * -50 * dir) + 'deg) rotateZ(' + (behind * 3 * (i % 2 ? 1 : -1) + gone * -14 * dir) + 'deg)';
              z = gone > 0 ? 100 : 50 - behind; op = 1 - Math.max(0, Math.min(1, (gone - 0.55) / 0.45)); light = 1 - Math.min(0.5, behind * 0.18);
            } else {
              var ad = Math.abs(d), sg = d < 0 ? -1 : d > 0 ? 1 : 0;
              tr = 'translate3d(' + sg * (Math.min(ad, 1) * cw * 0.72 + Math.max(0, ad - 1) * cw * 0.34) + 'px,0,' + (-Math.min(ad, 1) * cw * 0.55 - Math.max(0, ad - 1) * cw * 0.12) + 'px) rotateY(' + (-sg * Math.min(ad, 1) * 58) + 'deg)';
              z = 50 - Math.round(ad * 10); op = ad > 3.2 ? 0 : 1; light = 1 - Math.min(0.55, ad * 0.28);
            }
            c.style.transform = tr; c.style.zIndex = z; c.style.opacity = op; c.style.filter = 'brightness(' + light + ')';
          });
        } else {
          var step = 360 / n, R = Math.max(cw * 0.75, (cw * 1.18 * n) / (2 * Math.PI)) * o.radius, deg = t * 32 * o.speed * dir;
          var helix = o.layout === 'helix', rise = helix ? ch * 0.2 : 0;
          var sc = Math.min(1, (W * 1.05) / (R * 2 + cw));
          ring.style.transform = 'scale(' + sc + ') translateZ(' + (-R) + 'px) rotateX(' + (-o.tilt) + 'deg) rotateY(' + (-deg) + 'deg)';
          items.forEach(function (c, i) {
            var a = i * step - deg, facing = Math.cos(a * Math.PI / 180);
            c.style.transform = 'translateY(' + (helix ? (i - (n - 1) / 2) * rise : 0) + 'px) rotateY(' + (i * step) + 'deg) translateZ(' + R + 'px)';
            c.style.filter = 'brightness(' + (0.4 + 0.6 * (facing + 1) / 2) + ')'; c.style.opacity = 1; c.style.zIndex = '';
          });
        }
        stage.className = 'c3d-stage bg-' + o.background;
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      function drawFiles() {
        UI.empty(list);
        o.files.forEach(function (f, i) { list.appendChild(h('span', { class: 'chip', title: f }, (i + 1) + '. ' + f.split(/[\\/]/).pop().slice(0, 22), h('b', { class: 'x', onclick: function () { o.files.splice(i, 1); drawFiles(); items = cards(); } }, ' ×'))); });
        if (!o.files.length) list.appendChild(h('span', { class: 'hint' }, 'مفيش ملفات — هياخد 8 لقطات من الفيديو تلقائي'));
      }
      var pick = UI.btn('ضيف صور/فيديوهات', function () {
        var fs = EF.pickFiles('اختار من 2 لـ 10', ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'm4v']);
        if (!fs || !fs.length) return;
        o.files = o.files.concat(fs).slice(0, 10); drawFiles(); items = cards();
      });
      var fromTl = UI.btn('لقطات من الفيديو', function () {
        UI.safe('بياخد لقطات', function () { return S.sceneFrames({ count: 8 }).then(function (fr) { o.files = fr.map(function (x) { return x.file; }); drawFiles(); items = cards(); }); }, fromTl);
      });
      function set(k) { return function (v) { o[k] = v; if (k === 'glow' || k === 'reflection') items = cards(); }; }
      function cb(k, label) { return h('label', null, h('input', { type: 'checkbox', checked: o[k], onchange: function (e) { set(k)(e.target.checked); } }), ' ' + label); }
      var title = h('input', { class: 'grow', placeholder: 'عنوان تحت الكاروسيل (اختياري)', value: o.title, oninput: function (e) { o.title = e.target.value; } });

      var go = UI.btn('ارندر وحطه على التايملين', function () {
        prog.set(0);
        UI.safe('Remotion بيرندر الكاروسيل', function () {
          return S.carousel3D(Object.assign({}, o, { onProgress: function (p, st) { prog.set(p); UI.status(st === 'bundling' ? 'بيجهّز المحرك…' : 'رندر ' + Math.round(p * 100) + '%', 'busy'); } }))
            .then(function (r) { prog.set(1); UI.toast('الكاروسيل نزل على V' + (r.track + 1) + ' كلقطة واحدة ✓'); });
        }, go);
      }, 'primary');
      var prev = UI.btn('صورة بجودة الرندر', function () {
        UI.safe('بيعاين', function () { return S.carousel3D(Object.assign({}, o, { preview: true })).then(function (r) { UI.empty(still).appendChild(h('img', { src: EF.fileUrl(r.file) + '?' + Date.now() })); }); }, prev);
      });

      view.appendChild(UI.card(null, stage,
        UI.seg([{ value: 'ring', label: 'دايري' }, { value: 'coverflow', label: 'كوفر فلو' }, { value: 'helix', label: 'لولبي' }, { value: 'stack', label: 'كوتشينة' }], o.layout, set('layout'))));
      view.appendChild(UI.card('الملفات (2-10)', UI.row(pick, fromTl), list));
      view.appendChild(UI.card('الحركة',
        UI.field('السرعة', UI.slider(0, 3, 0.1, o.speed, function (v) { return v + 'x'; }, set('speed'))),
        UI.field('الاتجاه', UI.seg([{ value: 'left', label: 'شمال' }, { value: 'right', label: 'يمين' }], o.direction, set('direction'))),
        UI.field('ميل الكاميرا', UI.slider(-30, 40, 1, o.tilt, function (v) { return v + '°'; }, set('tilt'))),
        UI.field('العمق', UI.slider(0.5, 2, 0.05, o.radius, function (v) { return v + 'x'; }, set('radius'))),
        UI.field('حجم الكروت', UI.slider(0.4, 1.8, 0.05, o.cardSize, function (v) { return v + 'x'; }, set('cardSize'))),
        UI.field('تدوير الحواف', UI.slider(0, 80, 1, o.rounded, function (v) { return v + 'px'; }, set('rounded'))),
        UI.field('النسبة', UI.seg(['4:5', '16:9', '9:16', '1:1'].map(function (a) { return { value: a, label: a }; }), o.aspect, set('aspect'))),
        UI.row(cb('reflection', 'انعكاس'), cb('glow', 'توهج')),
        UI.field('الخلفية', UI.seg([{ value: 'studio', label: 'استوديو' }, { value: 'mesh', label: 'ميش' }, { value: 'particles', label: 'جزيئات' }, { value: 'transparent', label: 'شفاف' }], o.background, set('background'))),
        UI.field('المدة', UI.slider(2, 20, 0.5, o.duration, function (v) { return v + 's'; }, set('duration'))),
        title));
      view.appendChild(UI.card(null, still, prog, UI.row(prev, go), UI.hint('بيترندر بـ Remotion على جهازك ويتحط كلقطة واحدة (الشفاف ProRes 4444 فوق الفيديو).')));
      drawFiles();
    }
  });
})();

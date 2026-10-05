/* ليكود جلاس — الستايل المشهور: زجاج سايل بيكسر ويغبّش الفيديو اللي تحته. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { params: null, bg: 'frame' };
  EF.tabs.push({
    id: 'glass', icon: '💧', label: 'ليكود جلاس', title: 'Liquid Glass — زجاج سايل',
    render: function (view) {
      var S = EF.services, LG = window.EFLiquid, PW = 480, PH = 270;
      var P = state.params || LG.normalize({ preset: 'pill' });
      state.params = P;
      var stage = h('canvas', { class: 'glass-stage' });
      var renderer = null, srcImg = null, raf = 0, t0 = performance.now();
      try { renderer = LG.createRenderer(document.createElement('canvas'), PW, PH); } catch (e) { renderer = null; }
      var sctx = stage.getContext('2d'); stage.width = PW; stage.height = PH;
      var demo = EF.glassDemoBackground(PW, PH);

      function bgImage() { return state.bg === 'frame' && srcImg ? srcImg : demo; }
      function paint(t) {
        if (!renderer) return;
        renderer.render(bgImage(), t, false);
        sctx.clearRect(0, 0, PW, PH);
        sctx.drawImage(bgImage(), 0, 0, PW, PH);
        sctx.drawImage(renderer.gl.canvas, 0, 0, PW, PH);
      }
      function loop(now) {
        if (!document.body.contains(stage)) { cancelAnimationFrame(raf); return; }
        var t = ((now - t0) / 1000) % (P.duration + 0.8);
        paint(Math.min(t, P.duration));
        raf = requestAnimationFrame(loop);
      }
      function apply(patch, replay) {
        Object.assign(P, patch); P = state.params = LG.normalize(P);
        if (renderer) renderer.setParams(P);
        if (replay) t0 = performance.now();
      }
      function loadFrame() {
        return S.glassFrame().then(function (file) {
          if (!file) { state.bg = 'demo'; UI.toast('مفيش فيديو تحت رأس التشغيل — بعرض خلفية تجريبية'); return; }
          var img = new Image(); img.onload = function () { srcImg = img; state.bg = 'frame'; }; img.src = EF.fileUrl(file);
        }).catch(function () { state.bg = 'demo'; });
      }

      // presets
      var grid = h('div', { class: 'grid' });
      LG.PRESETS.forEach(function (pr) {
        var cv = h('canvas'); cv.width = 240; cv.height = 135;
        var tile = h('div', { class: 'tile' + (P.preset === pr.id ? ' on' : ''), 'data-preset': pr.id, onclick: function () {
          Array.prototype.forEach.call(grid.children, function (x) { x.classList.remove('on'); }); tile.classList.add('on');
          P = state.params = LG.normalize({ preset: pr.id, label: pr.label, text: pr.text }); if (renderer) renderer.setParams(P); t0 = performance.now(); syncControls();
        } }, h('div', { class: 'thumb' }, cv), h('div', { class: 'name' }, pr.name));
        grid.appendChild(tile);
        if (renderer) { renderer.setParams({ preset: pr.id }); renderer.render(demo, 2.5, false); var c2 = cv.getContext('2d'); c2.drawImage(demo, 0, 0, 240, 135); c2.drawImage(renderer.gl.canvas, 0, 0, 240, 135); }
      });
      if (renderer) renderer.setParams(P);

      // controls
      var ctl = h('div');
      function syncControls() {
        UI.empty(ctl);
        var labelInp = h('input', { class: 'grow', value: P.shape === 'text' ? P.text : (P.label || ''), placeholder: P.shape === 'text' ? 'النص الزجاج' : 'نص على الزجاج (اختياري)' });
        labelInp.addEventListener('input', function () { apply(P.shape === 'text' ? { text: labelInp.value || ' ' } : { label: labelInp.value }); });
        var tint = h('input', { type: 'color', value: P.tint, oninput: function (e) { apply({ tint: e.target.value }); } });
        function sl(label, key, min, max, step, fmt) { return UI.field(label, UI.slider(min, max, step, P[key], fmt || function (v) { return (+v).toFixed(step < 1 ? 2 : 0); }, function (v) { var o = {}; o[key] = v; apply(o); })); }
        ctl.appendChild(UI.card('الشكل والنص',
          UI.row(labelInp),
          UI.field('الشكل', UI.select([{ value: 'pill', label: 'كبسولة' }, { value: 'rect', label: 'مستطيل' }, { value: 'circle', label: 'دايرة' }, { value: 'ring', label: 'إطار' }, { value: 'text', label: 'نص زجاج' }], P.shape, function (v) { apply({ shape: v }); syncControls(); })),
          sl('أفقي', 'x', 0, 1, 0.01), sl('رأسي', 'y', 0, 1, 0.01),
          P.shape === 'text' ? sl('حجم النص', 'textSize', 0.05, 0.5, 0.01) : sl('العرض', 'w', 0.05, 1, 0.01),
          P.shape === 'text' ? null : sl('الارتفاع', 'h', 0.04, 1, 0.01),
          P.shape === 'rect' || P.shape === 'ring' ? sl('الاستدارة', 'radius', 0, 1, 0.01) : null));
        ctl.appendChild(UI.card('الزجاج',
          sl('التغبيش', 'blur', 0, 40, 1), sl('الانكسار', 'refract', 0, 4, 0.05), sl('ألوان الحواف', 'chroma', 0, 3, 0.05),
          sl('التكبير', 'zoom', 0.6, 2.5, 0.05), sl('اللمعة', 'spec', 0, 2.5, 0.05), sl('الظل', 'shadow', 0, 1, 0.05), sl('حركة السايل', 'wobble', 0, 5, 0.1),
          UI.row(h('label', null, 'لون الزجاج'), tint, UI.slider(0, 1, 0.01, P.tintAmount, function (v) { return Math.round(v * 100) + '%'; }, function (v) { apply({ tintAmount: v }); }))));
        ctl.appendChild(UI.card('الحركة',
          UI.field('دخول', UI.select(LG.ANIMS_IN.map(function (a) { return { value: a, label: { liquid: 'سايل', pop: 'بوب', drop: 'نازل', slide: 'سلايد', fade: 'ظهور', none: 'من غير' }[a] }; }), P.animIn, function (v) { apply({ animIn: v }, true); })),
          UI.field('خروج', UI.select(LG.ANIMS_OUT.map(function (a) { return { value: a, label: { fade: 'اختفاء', shrink: 'انكماش', liquid: 'سايل', none: 'من غير' }[a] }; }), P.animOut, function (v) { apply({ animOut: v }, true); })),
          sl('المدة', 'duration', 1, 20, 0.5, function (v) { return v + 's'; })));
      }
      syncControls();

      var prog = UI.progress();
      var go = UI.btn('حط الزجاج على الفيديو', function () {
        UI.safe('بيعمل الليكود جلاس', function () {
          return S.liquidGlass({ params: P, onProgress: function (p) { prog.set(p); UI.status('Liquid Glass ' + Math.round(p * 100) + '%', 'busy'); } })
            .then(function (r) { prog.set(1); UI.toast('الزجاج اتحط على V' + (r.track + 1) + (r.source ? ' فوق "' + r.source + '"' : '') + ' ✓'); });
        }, go);
      }, 'primary');

      view.appendChild(UI.card(null,
        h('div', { class: 'stage-wrap' }, stage, h('div', { class: 'stage-glint' })),
        UI.row(UI.seg([{ value: 'frame', label: 'الفريم الحالي' }, { value: 'demo', label: 'خلفية تجريبية' }], state.bg, function (v) { state.bg = v; if (v === 'frame' && !srcImg) loadFrame(); }),
          h('span', { class: 'spacer' }), UI.btn('↻ إعادة الحركة', function () { t0 = performance.now(); }, 'small')),
        UI.hint('الزجاج بيكسر ويغبّش الفيديو اللي تحت رأس التشغيل فعلًا (مش صورة ثابتة) وبينزل طبقة شفافة فوقه بالظبط — أوفلاين على جهازك.'),
        prog, UI.row(go)));
      view.appendChild(UI.card('الستايلات', grid));
      view.appendChild(ctl);
      if (!renderer) view.insertBefore(UI.card(null, h('p', { class: 'err' }, 'WebGL مش متاح في اللوحة — الليكود جلاس محتاج كارت شاشة.')), view.firstChild);
      if (state.bg === 'frame') loadFrame();
      raf = requestAnimationFrame(loop);
    }
  });
})();

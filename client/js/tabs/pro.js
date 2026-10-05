/* مشاهد Pro — Remotion: المخرج الذكي بيصمم، وانت تعدّل وتعاين وتنزّل. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { spec: null, brief: '', overlay: false, duration: 6 };
  EF.tabs.push({
    id: 'pro', icon: '🎞', label: 'مشاهد Pro', title: 'مشاهد Pro — Remotion',
    render: function (view) {
      var S = EF.services, PRO = EF.node('proScene'), CAT = PRO.CATALOG;
      var eng = S.proEngine ? S.proEngine() : { installed: false };
      var specBox = h('div'), previewBox = h('div', { class: 'pro-preview' }), prog = UI.progress();

      // engine status
      var engCard = UI.card(null);
      function drawEngine() {
        UI.empty(engCard);
        if (eng.installed && eng.node) { engCard.appendChild(h('div', { class: 'row' }, h('span', { class: 'badge-dot ok-dot' }), h('span', null, 'محرك Remotion جاهز'), h('span', { class: 'spacer' }), h('span', { class: 'hint ltr' }, eng.node))); return; }
        var log = h('pre', { class: 'hint ltr', style: { maxHeight: '90px', overflow: 'auto', margin: 0 } });
        var inst = UI.btn('ثبّت المحرك (مرة واحدة)', function () {
          UI.safe('بيثبّت Remotion', function () { return S.installProEngine(function (l) { log.textContent = (log.textContent + l).slice(-2000); log.scrollTop = 1e9; }).then(function (e) { eng = e; drawEngine(); UI.toast('المحرك اتثبّت ✓'); }); }, inst);
        }, 'primary');
        engCard.appendChild(h('div', { class: 'row' }, h('span', { class: 'badge-dot err-dot' }), h('span', null, !eng.node ? 'محتاج Node.js على الجهاز (المثبّت بيثبّته)' : 'المحرك محتاج يتثبّت مرة واحدة (نت ~200MB)')));
        if (eng.node) engCard.appendChild(UI.row(inst)); engCard.appendChild(log);
      }
      drawEngine();

      // brief
      var brief = h('textarea', { placeholder: 'اوصف المشهد… مثلاً: "افتتاحية لقناة بتشرح مونتاج، اسم القناة EditFast وبعدين 3 نقاط هنتعلمها وفي الآخر اشترك"', rows: 3 }, state.brief);
      brief.addEventListener('input', function () { state.brief = brief.value; });
      var design = UI.btn('صمّم المشهد بالذكاء الاصطناعي', function () {
        UI.safe('المخرج بيصمم', function () { return S.designProScene({ brief: brief.value, duration: state.duration, transparent: state.overlay }).then(function (spec) { state.spec = spec; drawSpec(); UI.toast(spec.elements.length + ' عناصر — راجعهم وعاين'); }); }, design);
      }, 'primary');

      function propInput(el, key, def) {
        var t = def[0], v = el.props[key];
        if (t === 'boolean') return h('input', { type: 'checkbox', checked: !!v, onchange: function (e) { el.props[key] = e.target.checked; } });
        if (t.indexOf('enum:') === 0) return UI.select(t.slice(5).split('|').map(function (o) { return { value: o, label: o }; }), v, function (x) { el.props[key] = x; });
        if (t === 'bars') return h('input', { class: 'grow', value: (v || []).map(function (b) { return b.label + ':' + b.value; }).join('، '), placeholder: 'يناير:40، فبراير:65', onchange: function (e) { el.props[key] = e.target.value.split(/[،,]/).map(function (p) { var a = p.split(':'); return { label: (a[0] || '').trim(), value: +a[1] || 0 }; }).filter(function (b) { return b.label; }); } });
        if (t === 'string[]') return h('input', { class: 'grow', value: (v || []).join('، '), onchange: function (e) { el.props[key] = e.target.value.split(/[،,]/).map(function (x) { return x.trim(); }).filter(Boolean); } });
        return h('input', { class: 'grow', type: t === 'number' ? 'number' : 'text', value: v == null ? '' : v, onchange: function (e) { el.props[key] = t === 'number' ? +e.target.value : e.target.value; } });
      }

      function drawSpec() {
        UI.empty(specBox);
        if (!state.spec) return;
        var sp = state.spec;
        var bgSel = UI.select(PRO.BACKGROUNDS.map(function (b) { return { value: b, label: { mesh: 'ميش ناعم', gradient: 'تدرج', grid: 'جريد تقني', particles: 'جزيئات', spotlight: 'سبوت لايت', solid: 'لون واحد', transparent: 'شفاف (فوق الفيديو)' }[b] }; }), sp.background.type, function (v) { sp.background = { type: v }; });
        specBox.appendChild(UI.card('المشهد (' + sp.duration + ' ثانية)', UI.field('الخلفية', bgSel)));
        sp.elements.forEach(function (el, i) {
          var def = CAT[el.type].props;
          var card = UI.card((i + 1) + '. ' + CAT[el.type].label,
            h('div', { class: 'row' }, h('label', null, 'من/مدة'),
              h('input', { type: 'number', step: 0.1, value: el.from, style: { width: '70px' }, onchange: function (e) { el.from = +e.target.value; } }),
              h('input', { type: 'number', step: 0.1, value: el.duration, style: { width: '70px' }, onchange: function (e) { el.duration = +e.target.value; } }),
              UI.select(PRO.POSITIONS.map(function (p) { return { value: p, label: p }; }), el.position || 'center', function (v) { el.position = v; }),
              h('span', { class: 'spacer' }), UI.btn('شيل', function () { sp.elements.splice(i, 1); drawSpec(); }, 'small danger')));
          Object.keys(def).forEach(function (k) { card.appendChild(h('div', { class: 'row' }, h('label', null, def[k][2]), propInput(el, k, def[k]))); });
          specBox.appendChild(card);
        });
        var prev = UI.btn('معاينة', function () {
          UI.safe('بيعاين', function () { return S.renderProScene({ spec: state.spec, preview: true }).then(function (r) { UI.empty(previewBox).appendChild(h('img', { src: EF.fileUrl(r.file) + '?' + Date.now() })); }); }, prev);
        });
        var go = UI.btn('ارندر وحطه على التايملين', function () {
          UI.safe('Remotion بيرندر', function () {
            return S.renderProScene({ spec: state.spec, onProgress: function (p, st) { prog.set(p); UI.status(st === 'bundling' ? 'بيجهّز المحرك…' : 'رندر ' + Math.round(p * 100) + '%', 'busy'); } })
              .then(function (r) { prog.set(1); UI.toast('المشهد نزل على V' + (r.track + 1) + ' ✓'); });
          }, go);
        }, 'primary');
        specBox.appendChild(UI.card(null, previewBox, prog, UI.row(prev, go)));
      }

      // gallery
      var gal = h('div', { class: 'grid' });
      Object.keys(CAT).forEach(function (type) {
        gal.appendChild(h('div', { class: 'tile', 'data-type': type, onclick: function () {
          var props = {}; Object.keys(CAT[type].props).forEach(function (k) { props[k] = CAT[type].props[k][1]; });
          if (!state.spec) state.spec = { width: 1920, height: 1080, fps: 30, duration: 5, theme: {}, background: { type: state.overlay ? 'transparent' : 'mesh' }, elements: [] };
          var end = state.spec.elements.reduce(function (m, e) { return Math.max(m, e.from + e.duration); }, 0);
          var from = state.spec.elements.length ? Math.max(0, end - 0.3) : 0;
          state.spec.elements.push({ type: type, from: +from.toFixed(2), duration: 3.5, props: props });
          state.spec.duration = Math.max(state.spec.duration, from + 3.5);
          drawSpec(); UI.toast(CAT[type].label + ' اتضاف');
        } }, h('div', { class: 'thumb' }, h('img', { src: '../assets/pro/' + type + '.jpg', loading: 'lazy' })), h('div', { class: 'name' }, CAT[type].label)));
      });

      view.appendChild(engCard);
      view.appendChild(UI.card('المخرج الذكي', brief,
        UI.field('المدة', UI.slider(2, 30, 0.5, state.duration, function (v) { return v + 's'; }, function (v) { state.duration = v; })),
        UI.row(h('label', null, 'فوق الفيديو'), h('input', { type: 'checkbox', checked: state.overlay, onchange: function (e) { state.overlay = e.target.checked; } }), h('span', { class: 'hint' }, 'خلفية شفافة')),
        UI.modelPicker('scene'), UI.row(design)));
      view.appendChild(specBox);
      view.appendChild(UI.card('المكوّنات — دوس تضيف للمشهد', gal));
      drawSpec();
    }
  });
})();

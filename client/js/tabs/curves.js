/* محرر المنحنيات. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'curves', icon: '〰️', label: 'منحنيات', title: 'محرر المنحنيات',
    render: function (view) {
      var S = EF.services, C = window.EFCurves, data = null, sel = 0, easing = 'expoOut', bez = [0.16, 1, 0.3, 1];
      var canvas = h('canvas', { class: 'curve' }), editor = h('canvas', { class: 'curve', style: { height: '200px', maxWidth: '260px' } });
      var propsBox = h('div'), bezTxt = h('span', { class: 'pill ltr' });
      function curEase() { return easing === 'custom' ? bez : easing; }

      function drawCurve() {
        var ctx = canvas.getContext('2d'), W = canvas.width = canvas.clientWidth * 2 || 600, H = canvas.height = 340;
        ctx.clearRect(0, 0, W, H);
        if (!data || !data.props[sel]) { ctx.fillStyle = '#9a9aa8'; ctx.font = '26px sans-serif'; ctx.fillText('select a clip → Read', 20, 60); return; }
        var p = data.props[sel], keys = p.keys.map(function (k) { return { t: k.t, v: Array.isArray(k.v) ? k.v[0] : k.v }; });
        var before = C.sample(keys, 'linear', 200), after = C.sample(keys, curEase(), 200);
        var all = before.concat(after), t0 = keys[0].t, t1 = keys[keys.length - 1].t || t0 + 1;
        var vmin = Math.min.apply(null, all.map(function (x) { return x.v; })), vmax = Math.max.apply(null, all.map(function (x) { return x.v; }));
        if (vmax === vmin) { vmax += 1; vmin -= 1; }
        function X(t) { return 20 + (t - t0) / ((t1 - t0) || 1) * (W - 40); } function Y(v) { return H - 20 - (v - vmin) / (vmax - vmin) * (H - 40); }
        function line(pts, color, w) { ctx.beginPath(); pts.forEach(function (q, i) { (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(q.t), Y(q.v)); }); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }
        line(before, '#55556a', 2); line(after, '#9d85ff', 4);
        keys.forEach(function (k) { ctx.fillStyle = '#ffd84d'; ctx.fillRect(X(k.t) - 6, Y(k.v) - 6, 12, 12); });
      }

      function drawEditor() {
        var ctx = editor.getContext('2d'), W = editor.width = 400, H = editor.height = 400, pad = 60;
        ctx.clearRect(0, 0, W, H);
        function X(x) { return pad + x * (W - 2 * pad); } function Y(y) { return H - pad - y * (H - 2 * pad); }
        ctx.strokeStyle = '#3a3a44'; ctx.strokeRect(X(0), Y(1), X(1) - X(0), Y(0) - Y(1));
        var f = C.getEasing(curEase());
        ctx.beginPath(); for (var i = 0; i <= 100; i++) { var x = i / 100; (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(f(x))); }
        ctx.strokeStyle = '#9d85ff'; ctx.lineWidth = 5; ctx.stroke();
        var b = Array.isArray(curEase()) ? curEase() : (f.bezier || null);
        if (b) {
          ctx.lineWidth = 2; ctx.strokeStyle = '#ffd84d';
          ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(b[0]), Y(b[1])); ctx.moveTo(X(1), Y(1)); ctx.lineTo(X(b[2]), Y(b[3])); ctx.stroke();
          [[b[0], b[1]], [b[2], b[3]]].forEach(function (p) { ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 12, 0, 7); ctx.fill(); });
          bezTxt.textContent = 'cubic-bezier(' + b.map(function (v) { return (+v).toFixed(2); }).join(', ') + ')';
        } else bezTxt.textContent = easing;
      }
      // drag bezier handles
      var drag = -1;
      function toUnit(e) { var r = editor.getBoundingClientRect(), sx = 400 / r.width, sy = 400 / r.height; return [((e.clientX - r.left) * sx - 60) / 280, 1 - ((e.clientY - r.top) * sy - 60) / 280]; }
      editor.addEventListener('mousedown', function (e) {
        if (easing !== 'custom') { var f = C.getEasing(easing); if (!f.bezier) return; bez = f.bezier.slice(); easing = 'custom'; }
        var u = toUnit(e), d1 = Math.hypot(u[0] - bez[0], u[1] - bez[1]), d2 = Math.hypot(u[0] - bez[2], u[1] - bez[3]);
        drag = d1 < d2 ? 0 : 2;
      });
      window.addEventListener('mousemove', function (e) { if (drag < 0) return; var u = toUnit(e); bez[drag] = Math.min(1, Math.max(0, u[0])); bez[drag + 1] = Math.max(-1, Math.min(2, u[1])); drawEditor(); drawCurve(); });
      window.addEventListener('mouseup', function () { drag = -1; });

      function drawProps() {
        UI.empty(propsBox);
        if (!data) return;
        if (!data.props.length) { propsBox.appendChild(UI.hint('الكليب ده مفيهوش كي فريمز.')); return; }
        propsBox.appendChild(UI.select(data.props.map(function (p, i) { return { value: i, label: p.component + ' › ' + p.prop + ' (' + p.keys.length + ')' }; }), sel, function (v) { sel = +v; drawCurve(); }));
      }
      var read = UI.btn('اقرا الكليب المختار', function () { UI.safe('بيقرا الكي فريمز', function () { return S.curvesRead().then(function (d) { data = d; sel = 0; drawProps(); drawCurve(); }); }, read); }, 'primary');
      var apply = UI.btn('طبّق على الخاصية دي', function () {
        if (!data || !data.props[sel]) return UI.toast('اقرا كليب الأول', true);
        UI.safe('بيكتب المنحنى', function () { return S.curvesApply({ prop: data.props[sel], easing: curEase() }).then(function (r) { UI.toast('اتكتب ' + r.written + ' كي فريم ✓'); return S.curvesRead().then(function (d) { data = d; drawCurve(); }); }); }, apply);
      }, 'primary');
      var applyAll = UI.btn('طبّق على كل الخصائص', function () {
        if (!data) return;
        UI.safe('بيكتب المنحنيات', function () {
          return data.props.reduce(function (p, prop) { return p.then(function () { return S.curvesApply({ prop: prop, easing: curEase() }); }); }, Promise.resolve())
            .then(function () { UI.toast('اتطبّق على ' + data.props.length + ' خاصية ✓'); return S.curvesRead().then(function (d) { data = d; drawCurve(); }); });
        }, applyAll);
      });
      var presets = h('div', { class: 'chips' });
      Object.keys(C.PRESETS).forEach(function (k) { presets.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { easing = k; drawEditor(); drawCurve(); } }, C.PRESETS[k].label)); });
      view.appendChild(UI.card(null, UI.hint('بيقرا الكي فريمز اللي على الكليب ويوريهالك كمنحنى. اختار شكل الحركة وهو بيعيد كتابة الحركة كلها (فريم بفريم) من غير ما تلمس كل كي فريم لوحده.'), UI.row(read), propsBox, canvas));
      view.appendChild(UI.card('شكل الحركة', presets, h('div', { style: { display: 'flex', justifyContent: 'center' } }, editor), UI.row(bezTxt, h('span', { class: 'hint' }, 'اسحب النقط الصفرا')), UI.row(apply, applyAll)));
      setTimeout(function () { drawEditor(); drawCurve(); }, 0);
    }
  });
})();

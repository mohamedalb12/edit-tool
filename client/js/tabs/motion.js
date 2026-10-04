/* قوالب الحركة — 28 قالب × 3 مستويات. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var level = 2;
  var KINDS = [{ k: 'in', label: 'دخول (أول الكليب)' }, { k: 'out', label: 'خروج (آخر الكليب)' }, { k: 'emphasis', label: 'تأكيد (عند رأس التشغيل)' }];
  function interp(keys, t) {
    if (!keys || !keys.length) return null;
    if (t <= keys[0].t) return keys[0].v;
    for (var i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1].t) { var a = keys[i], b = keys[i + 1], u = (t - a.t) / ((b.t - a.t) || 1); return Array.isArray(a.v) ? a.v.map(function (x, j) { return x + (b.v[j] - x) * u; }) : a.v + (b.v - a.v) * u; }
    return keys[keys.length - 1].v;
  }
  EF.tabs.push({
    id: 'motion', icon: '🎬', label: 'حركة', title: 'قوالب الحركة (28)',
    render: function (view) {
      var S = EF.services, M = window.EFMotion, useSel = true;
      var grids = h('div');
      function draw() {
        UI.empty(grids);
        KINDS.forEach(function (K) {
          var g = h('div', { class: 'grid' });
          M.PRESETS.filter(function (p) { return p.kind === K.k; }).forEach(function (p) {
            var box = h('div', { style: { width: '34%', height: '40%', background: 'var(--accent)', borderRadius: '4px', position: 'absolute', left: '33%', top: '30%' } });
            var thumb = h('div', { class: 'thumb', style: { position: 'relative' } }, box);
            var raf = null;
            function play() {
              var gen = M.generate(p.id, level, { fps: 30 }), start = performance.now();
              (function f(now) {
                var t = ((now - start) / 1000) % (gen.duration + 0.5);
                var sc = interp(gen.props.scale, t), pos = interp(gen.props.pos, t), rot = interp(gen.props.rotation, t), op = interp(gen.props.opacity, t), sk = interp(gen.props.skew, t);
                box.style.transform = 'translate(' + ((pos ? pos[0] : 0) * 100 * 2.9) + '%,' + ((pos ? pos[1] : 0) * 100 * 2.5) + '%) scale(' + ((sc === null ? 100 : sc) / 100) + ') rotate(' + (rot || 0) + 'deg) skewX(' + (sk || 0) + 'deg)';
                box.style.opacity = op === null ? 1 : op / 100;
                raf = requestAnimationFrame(f);
              })(start);
            }
            g.appendChild(h('div', { class: 'tile', onmouseenter: play, onmouseleave: function () { cancelAnimationFrame(raf); box.style.transform = ''; box.style.opacity = 1; },
              onclick: function () { UI.safe('بيكتب الكي فريمز', function () { return S.applyMotion({ preset: p.id, level: level, useSelection: useSel }).then(function (r) { UI.toast(p.name + ' ✓ — ' + r.keys + ' كي فريم على ' + r.component); }); }); }
            }, thumb, h('div', { class: 'name' }, p.name)));
          });
          grids.appendChild(UI.card(K.label, g));
        });
      }
      view.appendChild(UI.card(null,
        UI.row(h('label', null, 'القوة'), UI.seg([{ value: 1, label: 'هادي' }, { value: 2, label: 'متوسط' }, { value: 3, label: 'قوي' }], level, function (v) { level = v; })),
        UI.row(h('label', null, 'على الكليب المختار'), h('input', { type: 'checkbox', checked: useSel, onchange: function (e) { useSel = e.target.checked; } }), h('span', { class: 'hint' }, 'غير كده: الكليب اللي عند رأس التشغيل')),
        UI.hint('بيكتب كي فريمز حقيقية على Transform — افتح Effect Controls وعدّلها زي ما انت عايز. حط الماوس على القالب تشوف الحركة.')));
      view.appendChild(grids);
      draw();
    }
  });
})();

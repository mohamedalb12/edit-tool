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
            var box = h('div', { style: { width: '34%', height: '40%', background: 'var(--grad)', borderRadius: '6px', boxShadow: '0 0 18px rgba(217,70,239,.7)', position: 'absolute', left: '33%', top: '30%' } });
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
      // ——— زووم تلقائي من الصوت (من غير AI) ———
      var az = { density: 'medium', style: 'jump', scale: 115, track: 0 };
      try { Object.assign(az, JSON.parse(localStorage.getItem('ef-autozoom') || '{}')); } catch (e) {}
      function azSave() { try { localStorage.setItem('ef-autozoom', JSON.stringify(az)); } catch (e) {} }
      var azProg = UI.progress(), azTxt = h('span', { class: 'hint' });
      function azRun(mode, btn) {
        azProg.set(0);
        UI.safe(mode === 'markers' ? 'بيعلّم أماكن الزووم' : 'بيعمل زووم', function () {
          return S.autoZoom({ density: az.density, style: az.style, scale: az.scale, track: az.track, mode: mode, onProgress: function (p) { azProg.set(p); } }).then(function (r) {
            azProg.set(1);
            azTxt.textContent = (mode === 'markers' ? r.zooms + ' ماركر بنفسجي (من ' + r.phrases + ' جملة) — شوفهم وبعدين دوس "اعمل الزووم"' : r.zooms + ' زووم ✓ (من ' + r.phrases + ' جملة) — تراجع من سجل EditFast لو مش عاجبك');
            UI.toast(azTxt.textContent);
          });
        }, btn);
      }
      var azGo = UI.btn('اعمل الزووم', function () { azRun('apply', azGo); }, 'primary');
      var azMark = UI.btn('علّم الأماكن بس', function () { azRun('markers', azMark); }, 'small');
      view.appendChild(UI.card('زووم تلقائي من الصوت',
        UI.hint('بيسمع صوتك ويلاقي الجمل اللي بتأكد فيها (صوتك أعلى من العادي) ويعمل عليها زووم — من غير AI ومن غير تفريغ، ومجاني. أول جملة في الفيديو بتفضل واسعة، ومفيش زوومين ورا بعض.'),
        UI.row(h('label', null, 'الشكل'), UI.seg([{ value: 'jump', label: 'قطع (يوتيوب)' }, { value: 'smooth', label: 'دفعة ناعمة' }, { value: 'punch', label: 'بانش' }], az.style, function (v) { az.style = v; azSave(); })),
        UI.row(h('label', null, 'الكمية'), UI.seg([{ value: 'low', label: 'قليل' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'كتير' }], az.density, function (v) { az.density = v; azSave(); })),
        UI.field('قوة الزووم', UI.slider(105, 140, 1, az.scale, function (v) { return v + '%'; }, function (v) { az.scale = v; azSave(); })),
        UI.field('تراك الفيديو', UI.slider(1, 6, 1, az.track + 1, function (v) { return 'V' + v; }, function (v) { az.track = v - 1; azSave(); })),
        azProg, UI.row(azGo, azMark, azTxt)));
      view.appendChild(grids);
      draw();
    }
  });
})();

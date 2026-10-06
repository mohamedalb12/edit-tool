/* مكتبة الأيقونات: سوشيال، مونتاج، عربيات، عقارات، أماكن… وتتضاف بحركة جاهزة (رسم، بوب، نطّة…). */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { cat: 'emoji-reactions', q: '', sel: null, anim: 'pop', badge: 'none', color: '', bg: '', size: 1, label: '', duration: 3, position: 'center', count: 3 };

  function svgEl(icon, color) {
    var span = document.createElement('span');
    var stroke = icon.mode === 'stroke', full = icon.mode === 'color';
    span.innerHTML = '<svg viewBox="' + (icon.viewBox || '0 0 24 24') + '" width="100%" height="100%" fill="' + (stroke || full ? 'none' : (color || icon.color || '#fff')) + '" stroke="' + (stroke ? (color || 'currentColor') : 'none') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon.svg + '</svg>';
    return span.firstChild;
  }

  EF.tabs.push({
    id: 'icons', label: 'أيقونات', title: 'مكتبة الأيقونات المتحركة',
    render: function (view) {
      var S = EF.services, data = S.iconsData();
      var grid = h('div', { class: 'icon-grid' }), opts = h('div'), prog = UI.progress();

      function draw() {
        UI.empty(grid);
        var list = S.iconSearch(o.q, o.q ? '' : o.cat).slice(0, 240);
        list.forEach(function (ic) {
          grid.appendChild(h('button', { type: 'button', class: 'icon-cell' + (o.sel && o.sel.id === ic.id ? ' on' : '') + (ic.mode === 'stroke' ? ' draw' : ' wob'), title: ic.name + (ic.ar ? ' — ' + ic.ar : ''),
            onclick: function () { o.sel = ic; o.color = ''; draw(); drawOpts(); } }, svgEl(ic)));
        });
        if (!list.length) grid.appendChild(h('p', { class: 'hint' }, 'مفيش أيقونة بالاسم ده — جرّب بالإنجليزي (car, home, heart…)'));
      }

      function drawOpts() {
        UI.empty(opts);
        var ic = o.sel; if (!ic) return;
        function mk() {
          var n = h('div', { class: 'icon-preview a-' + o.anim + ' b-' + o.badge + (ic.mode === 'color' ? ' full' : '') }, svgEl(ic, o.badge === 'ios' && ic.mode !== 'color' ? '#fff' : o.color));
          var base = o.bg || (ic.mode === 'fill' ? ic.color : '#8B5CF6');
          if (o.badge === 'ios') n.style.background = 'linear-gradient(180deg, color-mix(in srgb, ' + base + ' 70%, white), ' + base + ' 55%, color-mix(in srgb, ' + base + ' 82%, black))';
          else if (o.badge === 'circle' || o.badge === 'square') n.style.background = 'linear-gradient(135deg,' + base + ', #EC4899)';
          if (o.anim === 'notify') n.appendChild(h('span', { class: 'ios-dot' }, String(o.count)));
          return n;
        }
        var big = mk();
        function re() { var n = mk(); big.replaceWith(n); big = n; }
        var color = h('input', { type: 'color', value: o.color || (ic.mode === 'fill' ? ic.color : '#ffffff'), oninput: function (e) { o.color = e.target.value; re(); } });
        var bgc = h('input', { type: 'color', value: o.bg || (ic.mode === 'fill' ? ic.color : '#8B5CF6'), title: 'لون خلفية الأيقونة', oninput: function (e) { o.bg = e.target.value; re(); } });
        var label = h('input', { class: 'grow', placeholder: 'كلمة تحت الأيقونة (اختياري)', value: o.label, oninput: function (e) { o.label = e.target.value; } });
        var add = UI.btn('حطها على التايملين', function () {
          prog.set(0);
          UI.safe('بيرندر الأيقونة', function () {
            return S.addIcon({ id: ic.id, anim: o.anim, badge: o.badge, color: o.color || undefined, bg: o.bg || undefined, count: o.count, size: o.size, label: o.label, duration: o.duration, position: o.position, onProgress: function (p) { prog.set(p); } })
              .then(function (r) { prog.set(1); UI.toast(ic.name + ' نزلت على V' + (r.track + 1) + ' ✓'); });
          }, add);
        }, 'primary');
        opts.appendChild(UI.card(ic.name + (ic.ar ? ' — ' + ic.ar : ''), big,
          UI.field('الحركة', UI.seg([{ value: 'draw', label: 'رسم' }, { value: 'pop', label: 'بوب' }, { value: 'bounce', label: 'نطّة' }, { value: 'open', label: 'فتحة آيفون' }, { value: 'jiggle', label: 'رعشة آيفون' }, { value: 'float', label: 'طفو' }, { value: 'notify', label: 'إشعار 🔴' }, { value: 'spin', label: 'لف' }, { value: 'pulse', label: 'نبض' }, { value: 'shake', label: 'هزّة' }, { value: 'slide', label: 'طلوع' }], o.anim, function (v) { o.anim = v; re(); })),
          UI.field('الخلفية', UI.seg([{ value: 'none', label: 'من غير' }, { value: 'ios', label: ' آيفون' }, { value: 'circle', label: 'دايرة' }, { value: 'square', label: 'مربع' }, { value: 'glass', label: 'زجاج' }], o.badge, function (v) { o.badge = v; re(); })),
          UI.row(h('label', null, 'اللون'), color, h('label', null, 'الخلفية'), bgc, h('span', { class: 'spacer' }), UI.select(['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight'].map(function (p) { return { value: p, label: { center: 'النص', top: 'فوق', bottom: 'تحت', left: 'شمال', right: 'يمين', topLeft: 'فوق شمال', topRight: 'فوق يمين' }[p] }; }), o.position, function (v) { o.position = v; })),
          UI.field('الحجم', UI.slider(0.3, 2.5, 0.05, o.size, function (v) { return v + 'x'; }, function (v) { o.size = v; })),
          UI.field('المدة', UI.slider(1, 10, 0.5, o.duration, function (v) { return v + 's'; }, function (v) { o.duration = v; })),
          label, prog, UI.row(add)));
      }

      var search = h('input', { class: 'grow', placeholder: 'دوّر… (عربية، بيت، لايك، car, home)', value: o.q, oninput: function (e) { o.q = e.target.value; draw(); } });
      var chips = h('div', { class: 'chips' });
      data.categories.forEach(function (c) {
        chips.appendChild(h('button', { type: 'button', class: 'chip' + (o.cat === c.id ? ' on' : ''), onclick: function () { o.cat = c.id; o.q = ''; search.value = ''; Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove('on'); }); this.classList.add('on'); draw(); } }, c.label));
      });
      view.appendChild(UI.card(null, UI.row(search), chips, UI.hint(data.icons.length + ' أيقونة: إيموجي ملوّنة فلات (زي الموبايل)، شعارات المنصات، وأيقونات خطية. بتنزل شفافة فوق الفيديو بالحركة اللي تختارها — وخلفية "آيفون" بتخليها زي أيقونة تطبيق.')));
      view.appendChild(opts);
      view.appendChild(grid);
      draw(); drawOpts();
    }
  });
})();

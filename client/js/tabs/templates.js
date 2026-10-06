/* مكتبة القوالب: معاينة متحركة + تعديل النص + إضافة مباشرة للتايملين + مفضلة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { cat: 'all', q: '', sel: null, values: {}, dur: 0 };
  EF.tabs.push({
    id: 'templates', label: 'القوالب', title: 'مكتبة القوالب',
    render: function (view) {
      var S = EF.services, data = S.templatesList(), favs = S.favorites('templates');
      var grid = h('div', { class: 'grid tpl-grid' }), editor = h('div', { class: 'tpl-editor' }), prog = UI.progress();

      function tile(t) {
        var thumb = h('div', { class: 'thumb' }, h('img', { src: '../assets/templates/' + t.id + '.jpg', loading: 'lazy', alt: '' }));
        var vid = null, fav = favs.indexOf(t.id) >= 0;
        var star = h('button', { type: 'button', class: 'star' + (fav ? ' on' : ''), title: 'مفضلة', onclick: function (e) {
          e.stopPropagation(); favs = S.toggleFavorite('templates', t.id); star.classList.toggle('on', favs.indexOf(t.id) >= 0); if (state.cat === 'fav') draw();
        } }, '★');
        return h('div', { class: 'tile' + (state.sel && state.sel.id === t.id ? ' on' : ''), 'data-id': t.id, title: t.label,
          // the poster stays in place and the video plays on top of it (swapping nodes under the pointer re-fires mouseenter)
          onmouseenter: function () { if (vid) return; vid = h('video', { class: 'tpl-vid', src: '../assets/templates/' + t.id + '.mp4', muted: true, autoplay: true, loop: true, playsinline: true }); thumb.appendChild(vid); },
          onmouseleave: function () { if (vid) { vid.pause(); vid.remove(); vid = null; } },
          onclick: function () { state.sel = t; state.values = {}; state.dur = t.duration; draw(); drawEditor(); editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        }, star, t.overlay ? h('span', { class: 'badge' }, 'فوق الفيديو') : null, thumb, h('div', { class: 'name' }, t.label));
      }

      function draw() {
        UI.empty(grid);
        var q = state.q.trim();
        data.items.filter(function (t) {
          if (state.cat === 'fav') return favs.indexOf(t.id) >= 0;
          return (state.cat === 'all' || t.cat === state.cat) && (!q || t.label.indexOf(q) >= 0 || t.fields.some(function (f) { return f.value.indexOf(q) >= 0; }));
        }).forEach(function (t) { grid.appendChild(tile(t)); });
        if (!grid.children.length) grid.appendChild(h('p', { class: 'hint' }, state.cat === 'fav' ? 'دوس ★ على أي قالب يتحفظ هنا' : 'مفيش نتايج'));
      }

      function drawEditor() {
        UI.empty(editor);
        var t = state.sel; if (!t) return;
        var card = UI.card(t.label);
        t.fields.forEach(function (f) {
          var key = f.el + '.' + f.key;
          var inp = h('input', { class: 'grow', value: state.values[key] !== undefined ? state.values[key] : f.value, oninput: function (e) { state.values[key] = e.target.value; } });
          card.appendChild(UI.field(f.label, inp));
        });
        card.appendChild(UI.field('المدة', UI.slider(1.5, 15, 0.5, state.dur || t.duration, function (v) { return v + 's'; }, function (v) { state.dur = v; })));
        if (t.media) card.appendChild(UI.hint('القالب ده بياخد ' + (t.media > 1 ? t.media + ' لقطات' : 'لقطة') + ' من الفيديو حوالين رأس التشغيل تلقائي.'));
        var box = h('div', { class: 'pro-preview' });
        var prev = UI.btn('معاينة', function () {
          UI.safe('بيعاين', function () { return S.addTemplate({ id: t.id, values: state.values, duration: state.dur, preview: true }).then(function (r) { UI.empty(box).appendChild(h('img', { src: EF.fileUrl(r.file) + '?' + Date.now() })); }); }, prev);
        });
        var add = UI.btn('حطه على التايملين', function () {
          prog.set(0);
          UI.safe('Remotion بيرندر القالب', function () {
            return S.addTemplate({ id: t.id, values: state.values, duration: state.dur, onProgress: function (p, st) { prog.set(p); UI.status(st === 'bundling' ? 'بيجهّز المحرك…' : 'رندر ' + Math.round(p * 100) + '%', 'busy'); } })
              .then(function (r) { prog.set(1); UI.toast(t.label + ' نزل على V' + (r.track + 1) + ' ✓'); });
          }, add);
        }, 'primary');
        card.appendChild(box); card.appendChild(prog); card.appendChild(UI.row(prev, add));
        editor.appendChild(card);
      }

      var search = h('input', { class: 'grow', placeholder: 'دوّر في القوالب…', value: state.q, oninput: function (e) { state.q = e.target.value; draw(); } });
      var cats = [{ value: 'all', label: 'الكل' }, { value: 'fav', label: '★ المفضلة' }].concat(data.cats.map(function (c) { return { value: c.id, label: c.label }; }));
      view.appendChild(UI.card(null, UI.row(search), UI.seg(cats, state.cat, function (v) { state.cat = v; draw(); }),
        UI.hint('عدّي بالماوس على أي قالب تشوف الحركة. دوس عليه تعدّل النص وتحطه على التايملين (Remotion على جهازك).')));
      view.appendChild(editor);
      view.appendChild(grid);
      draw(); drawEditor();
    }
  });
})();

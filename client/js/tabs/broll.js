/* مكتبة B-Roll. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var last = null;
  EF.tabs.push({
    id: 'broll', icon: '🎞️', label: 'B-Roll', title: 'مكتبة B-Roll',
    render: function (view) {
      var S = EF.services, type = 'video', dur = 4;
      var src = { pexels: !!S.settings.keys.pexels, pixabay: !!S.settings.keys.pixabay, local: !!(S.settings.libraryDirs || []).length };
      var q = h('input', { placeholder: 'دوّر على لقطة… (عربي أو إنجليزي)', class: 'grow' }), info = h('span', { class: 'hint' });
      var grid = h('div', { class: 'grid' });
      function draw(r) {
        UI.empty(grid);
        info.textContent = r.results.length + ' نتيجة' + (r.query !== q.value ? ' — بحث: ' + r.query : '') + (r.errors.length ? ' — ' + r.errors.join(' · ') : '');
        r.results.forEach(function (it) {
          var thumb = h('div', { class: 'thumb' }, it.thumb ? h('img', { src: EF.fileUrl(it.thumb), loading: 'lazy' }) : h('span', null, '🎞️'));
          var vid = null;
          grid.appendChild(h('div', { class: 'tile', title: (it.author ? '© ' + it.author + ' — ' : '') + 'دوس تحطها عند رأس التشغيل',
            onmouseenter: function () { if (!vid && it.type === 'video' && it.preview) { vid = h('video', { src: EF.fileUrl(it.preview), muted: true, autoplay: true, loop: true }); UI.empty(thumb).appendChild(vid); } },
            onmouseleave: function () { if (vid) { vid.pause(); UI.empty(thumb).appendChild(it.thumb ? h('img', { src: EF.fileUrl(it.thumb) }) : h('span', null, '🎞️')); vid = null; } },
            onclick: function () { UI.safe('بيحمّل ويحط اللقطة', function () { return S.brollPlace({ item: it, duration: dur }).then(function (r) { UI.toast('اتحطت على V' + (r.track + 1) + ' ✓'); }); }); }
          }, h('span', { class: 'badge' }, it.source + (it.duration ? ' · ' + Math.round(it.duration) + 's' : '')), thumb));
        });
      }
      function go() {
        if (!q.value.trim()) return;
        var sources = Object.keys(src).filter(function (k) { return src[k]; });
        if (!sources.length) return UI.toast('فعّل مصدر واحد على الأقل (وحط مفتاحه من الإعدادات)', true);
        UI.safe('بيدوّر', function () { return S.brollSearch({ q: q.value, type: type, sources: sources }).then(function (r) { last = r; draw(r); }); });
      }
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      function cb(k, label) { return h('label', null, h('input', { type: 'checkbox', checked: src[k], onchange: function (e) { src[k] = e.target.checked; } }), ' ' + label); }
      view.appendChild(UI.card(null, UI.row(q, UI.btn('دوّر', go, 'primary')),
        UI.row(UI.seg([{ value: 'video', label: 'فيديو' }, { value: 'photo', label: 'صور' }], type, function (v) { type = v; }), cb('pexels', 'Pexels'), cb('pixabay', 'Pixabay'), cb('local', 'فولدراتي')),
        UI.field('مدة اللقطة', UI.slider(1, 15, 0.5, dur, function (v) { return v + 's'; }, function (v) { dur = v; })),
        UI.modelPicker('broll'), UI.hint('البحث بالعربي بيتحوّل لكلمات إنجليزي عشان النتايج تبقى أدق. اللقطة بتتحمّل لوحدها وتنزل على أول تراك فاضي فوق الفيديو.'), info));
      view.appendChild(grid);
      if (last) draw(last);
    }
  });
})();

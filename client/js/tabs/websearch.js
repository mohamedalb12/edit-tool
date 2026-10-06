/* بحث النت جوه الأداة: صور/فيديو/صوت مجانية + Google + بنترست (لينك) — النتايج متنظّمة وتنزل على المشروع بضغطة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { q: '', type: 'image', src: null, filter: 'all', shape: 'all', last: null, sel: null };
  var NAMES = { openverse: 'Openverse', commons: 'Wikimedia', google: 'Google', pexels: 'Pexels', pixabay: 'Pixabay' };
  EF.tabs.push({
    id: 'websearch', label: 'بحث النت', title: 'بحث في النت (Google · Pinterest · مجاني)',
    render: function (view) {
      var S = EF.services, k = S.settings.keys;
      o.src = o.src || { openverse: true, commons: true, google: !!(k.google && k.googleCx), pexels: !!k.pexels, pixabay: !!k.pixabay };
      var grid = h('div', { class: 'grid' }), info = h('span', { class: 'hint' }), filters = h('div', { class: 'chips' }), bar = h('div');
      var q = h('input', { class: 'grow', placeholder: 'دوّر على صورة/فيديو/صوت…', value: o.q, oninput: function (e) { o.q = e.target.value; } });

      function shapeOf(r) { if (!r.width || !r.height) return 'all'; var a = r.width / r.height; return a > 1.15 ? 'wide' : a < 0.87 ? 'tall' : 'square'; }
      function draw() {
        UI.empty(grid); UI.empty(filters);
        var r = o.last; if (!r) return;
        var by = {}; r.results.forEach(function (x) { by[x.source] = (by[x.source] || 0) + 1; });
        [['all', 'الكل (' + r.results.length + ')']].concat(Object.keys(by).map(function (s) { return [s, (NAMES[s] || s) + ' (' + by[s] + ')']; })).forEach(function (f) {
          filters.appendChild(h('button', { type: 'button', class: 'chip' + (o.filter === f[0] ? ' on' : ''), onclick: function () { o.filter = f[0]; draw(); } }, f[1]));
        });
        [['all', 'كل الأشكال'], ['wide', 'أفقي'], ['tall', 'طولي'], ['square', 'مربع']].forEach(function (f) {
          filters.appendChild(h('button', { type: 'button', class: 'chip' + (o.shape === f[0] ? ' on' : ''), onclick: function () { o.shape = f[0]; draw(); } }, f[1]));
        });
        info.textContent = r.errors.length ? 'مصادر ماردّتش: ' + r.errors.map(function (e) { return (NAMES[e.source] || e.source) + ' (' + e.error + ')'; }).join(' · ') : '';
        r.results.filter(function (x) { return (o.filter === 'all' || x.source === o.filter) && (o.shape === 'all' || shapeOf(x) === o.shape); }).forEach(function (it) {
          var thumb = h('div', { class: 'thumb' }, it.type === 'audio' ? h('span', null, '🎵') : h('img', { src: EF.fileUrl(it.thumb), loading: 'lazy', alt: '' }));
          grid.appendChild(h('div', { class: 'tile' + (o.sel && o.sel.id === it.id ? ' on' : ''), title: (it.title || '') + (it.credit ? ' — ' + it.credit : '') + (it.license ? ' · ' + it.license : ''),
            onclick: function () { o.sel = it; draw(); drawBar(); } },
            h('span', { class: 'badge' }, (NAMES[it.source] || it.source) + (it.type === 'video' ? ' · فيديو' : '')), thumb, h('div', { class: 'sub' }, it.license || '')));
        });
      }
      function drawBar() {
        UI.empty(bar);
        var it = o.sel; if (!it) return;
        var place = UI.btn('حطها على التايملين', function () { UI.safe('بيحمّل', function () { return S.webImport({ item: it, place: true }).then(function (r) { UI.toast('اتحطت على V' + (r.placed.track + 1) + ' ✓'); }); }, place); }, 'primary');
        var imp = UI.btn('ضيفها للمشروع بس', function () { UI.safe('بيحمّل', function () { return S.webImport({ item: it, place: false }).then(function () { UI.toast('اتضافت لـ EditFast/Web ✓'); }); }, imp); });
        bar.appendChild(UI.card(null, h('div', { class: 'name' }, h('bdi', null, it.title || it.url.split('/').pop())), h('div', { class: 'hint' }, [it.credit, it.license, it.width ? it.width + 'x' + it.height : ''].filter(Boolean).join(' · ')),
          UI.row(place, imp, it.page ? UI.btn('المصدر', function () { EF.openUrl(it.page); }, 'small') : null)));
      }
      function go() {
        if (!o.q.trim()) return;
        var sources = Object.keys(o.src).filter(function (s) { return o.src[s]; });
        if (!sources.length) return UI.toast('فعّل مصدر واحد على الأقل', true);
        o.sel = null; drawBar();
        UI.safe('بيدوّر', function () { return S.webSearch({ q: o.q, type: o.type, sources: sources }).then(function (r) { o.last = r; o.filter = 'all'; draw(); }); });
      }
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      function cb(s) { return h('label', { title: s === 'google' && !(k.google && k.googleCx) ? 'محتاج مفتاح Google + cx من الإعدادات' : '' }, h('input', { type: 'checkbox', checked: o.src[s], onchange: function (e) { o.src[s] = e.target.checked; } }), ' ' + NAMES[s]); }

      var link = h('input', { class: 'grow ltr', placeholder: 'الصق لينك صورة/فيديو أو Pin من Pinterest' });
      var imp = UI.btn('نزّل اللينك', function () {
        var u = link.value.trim(); if (!u) return;
        UI.safe('بيحمّل', function () { return S.webImport({ url: u, place: true }).then(function () { UI.toast('اتحط على التايملين ✓'); link.value = ''; }); }, imp);
      });
      view.appendChild(UI.card(null, UI.row(q, UI.btn('دوّر', go, 'primary')),
        UI.seg([{ value: 'image', label: 'صور' }, { value: 'video', label: 'فيديو' }, { value: 'audio', label: 'صوت' }], o.type, function (v) { o.type = v; }),
        UI.row(cb('openverse'), cb('commons'), cb('google'), cb('pexels'), cb('pixabay')),
        UI.row(UI.btn('افتح في Google', function () { if (o.q.trim()) EF.openUrl(S.webSearchPage('google', o.q)); }, 'small'), UI.btn('افتح في Pinterest', function () { if (o.q.trim()) EF.openUrl(S.webSearchPage('pinterest', o.q)); }, 'small')),
        UI.hint('Openverse وWikimedia مجانيين ومن غير مفتاح (رخص Creative Commons). Google جوه الأداة محتاج مفتاح Custom Search مجاني (100 بحث/يوم). Pinterest مالوش بحث مفتوح: افتحه في المتصفح والصق لينك الـ Pin هنا.')));
      view.appendChild(UI.card('من لينك', UI.row(link, imp)));
      view.appendChild(bar);
      view.appendChild(h('div', null, filters, info));
      view.appendChild(grid);
      draw(); drawBar();
    }
  });
})();

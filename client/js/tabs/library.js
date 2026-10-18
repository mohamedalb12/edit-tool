/* مكتبتي: كل الساوند إفكتس والترانزيشنز والأوفرلايز واللقطات والجرافيك بتوعك في مكان واحد —
 * صور مصغّرة لكل حاجة، مفضلة وأخيرة وتاجات، تسحب على التايملين أو تحط عند رأس التشغيل أو على كل الماركرز. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var CAT_ICON = { sfx: '🔊', music: '🎵', transitions: '🔀', overlays: '✨', footage: '🎞', graphics: '🅰', images: '🖼', presets: '🎛' };
  var SUB_NAME = { whoosh: 'ووش', impact: 'ضربات', pop: 'بوب وكليك', riser: 'رايزر', glitch: 'جليتش', ui: 'إشعارات', camera: 'كاميرا', typing: 'كتابة', transition: 'انتقال', funny: 'كوميدي', other: 'تاني', video: 'فيديو', image: 'صورة', mogrt: 'MOGRT', preset: 'بريسيت' };
  // remembered between visits (per panel session; the choice of category also survives a reload)
  var o = { cat: '', special: '', sub: '', q: '', sort: 'new', size: 2, sel: null };
  try { var saved = JSON.parse(localStorage.getItem('ef-lib') || 'null'); if (saved) { o.cat = saved.cat || ''; o.special = saved.special || ''; o.sort = saved.sort || 'new'; o.size = saved.size || 2; } } catch (e) {}
  function remember() { try { localStorage.setItem('ef-lib', JSON.stringify({ cat: o.cat, special: o.special, sort: o.sort, size: o.size })); } catch (e) {} }
  var thumbs = {}; // id → file path (or false when none)

  EF.tabs.push({
    id: 'library', icon: '📚', label: 'مكتبتي', title: 'مكتبتي',
    render: function (view) {
      var S = EF.services, A = new Audio(), stats = S.libraryStats ? S.libraryStats() : { cats: {}, subs: {}, total: 0, fav: 0, dirs: S.settings.libraryDirs || [], categories: [] };
      var grid = h('div', { class: 'lib-grid s' + o.size }), count = h('span', { class: 'hint' }), prog = UI.progress(), details = h('div', { class: 'lib-details' });
      var catBox = h('div', { class: 'chips lib-cats' }), subBox = h('div', { class: 'chips lib-subs' }), dirBox = h('div', { class: 'chips lib-dirs' });
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); loadThumb(en.target); } });
      }, { rootMargin: '200px' }) : null;

      function refreshStats() { if (S.libraryStats) stats = S.libraryStats(); drawCats(); drawDirs(); }
      function chip(label, on, fn, extra) { return h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), onclick: fn }, label, extra != null ? h('span', { class: 'n' }, String(extra)) : null); }
      function drawCats() {
        UI.empty(catBox);
        catBox.appendChild(chip('الكل', !o.cat && !o.special, function () { o.cat = ''; o.special = ''; o.sub = ''; remember(); drawCats(); draw(); }, stats.total));
        catBox.appendChild(chip('⭐ المفضلة', o.special === 'fav', function () { o.special = 'fav'; o.cat = ''; o.sub = ''; remember(); drawCats(); draw(); }, stats.fav));
        catBox.appendChild(chip('🕘 الأخيرة', o.special === 'recent', function () { o.special = 'recent'; o.cat = ''; o.sub = ''; remember(); drawCats(); draw(); }));
        (stats.categories || []).forEach(function (c) {
          var n = stats.cats[c.id] || 0; if (!n && o.cat !== c.id) return;
          catBox.appendChild(chip((CAT_ICON[c.id] || '') + ' ' + c.label, o.cat === c.id, function () { o.cat = c.id; o.special = ''; o.sub = ''; remember(); drawCats(); draw(); }, n));
        });
        UI.empty(subBox);
        if (!o.cat) return;
        var subs = Object.keys(stats.subs).filter(function (k) { return k.indexOf(o.cat + '/') === 0 && k.split('/')[1]; });
        if (subs.length < 2) return;
        subBox.appendChild(chip('كله', !o.sub, function () { o.sub = ''; drawCats(); draw(); }));
        subs.sort(function (a, b) { return stats.subs[b] - stats.subs[a]; }).forEach(function (k) {
          var sub = k.split('/')[1];
          subBox.appendChild(chip(SUB_NAME[sub] || sub, o.sub === sub, function () { o.sub = sub; drawCats(); draw(); }, stats.subs[k]));
        });
      }
      function drawDirs() {
        UI.empty(dirBox);
        (stats.dirs || []).forEach(function (d) {
          dirBox.appendChild(h('span', { class: 'chip dir ltr', title: d }, '📁 ' + d.split(/[\\/]/).filter(Boolean).pop(),
            h('button', { type: 'button', class: 'x', title: 'شيل الفولدر ده من المكتبة (الملفات مش هتتمسح)', onclick: function () {
              if (!S.libraryRemoveDir) return;
              var r = S.libraryRemoveDir(d); UI.toast('اتشال من المكتبة — فاضل ' + r.total + ' عنصر'); refreshStats(); draw();
            } }, '✕')));
        });
      }

      function loadThumb(tile) {
        var id = tile.dataset.id, box = tile.querySelector('.thumb');
        if (!S.libraryThumb || thumbs[id] === false) return;
        var put = function (f) { if (!f) return; var isWave = /\.png$/.test(f) && tile.dataset.kind === 'audio'; var img = h('img', { src: EF.fileUrl(f), class: isWave ? 'wave' : '' }); var old = box.querySelector('.ph'); if (old) old.replaceWith(img); else box.insertBefore(img, box.firstChild); };
        if (thumbs[id]) return put(thumbs[id]);
        Promise.resolve(S.libraryThumb(id)).then(function (f) { thumbs[id] = f || false; put(f); }).catch(function () { thumbs[id] = false; });
      }

      function place(it, at) {
        return UI.safe(at === 'markers' ? 'بيحط على الماركرز' : 'بيحط', function () {
          return S.libraryPlace({ id: it.id, at: at || 'playhead' }).then(function (r) { UI.toast(it.name + (r && r.placed > 1 ? ' على ' + r.placed + ' ماركر ✓' : ' اتحط ✓')); refreshStats(); });
        });
      }

      function tileFor(it) {
        var audio = it.category === 'sfx' || it.category === 'music' || /^(wav|mp3|aif|aiff|m4a|aac|flac|ogg)$/.test(it.ext);
        var browserVideo = /^(mp4|webm|m4v)$/.test(it.ext), img = /^(png|jpe?g|gif|webp)$/.test(it.ext);
        var thumb = h('div', { class: 'thumb' });
        if (img) thumb.appendChild(h('img', { src: EF.fileUrl(it.path), loading: 'lazy' }));
        else thumb.appendChild(h('span', { class: 'ph' }, CAT_ICON[it.category] || '📄'));
        var fav = h('button', { type: 'button', class: 'fav' + (it.fav ? ' on' : ''), title: it.fav ? 'شيل من المفضلة' : 'ضيف للمفضلة', onclick: function (e) {
          e.stopPropagation(); it.fav = !it.fav; if (S.libraryUpdate) S.libraryUpdate({ id: it.id, fav: it.fav }); fav.classList.toggle('on', it.fav); fav.textContent = it.fav ? '★' : '☆'; refreshStats();
        } }, it.fav ? '★' : '☆');
        var put = h('button', { type: 'button', class: 'put', title: 'حطه عند رأس التشغيل', onclick: function (e) { e.stopPropagation(); place(it); } }, '＋');
        var tile = h('div', { class: 'lib-tile' + (o.sel === it.id ? ' on' : ''), draggable: 'true', 'data-id': it.id, 'data-kind': audio ? 'audio' : 'video', tabindex: 0,
          title: it.name + (it.duration ? ' · ' + it.duration.toFixed(1) + 's' : '') + '\nدوس تختار · دبل كليك تحطه · اسحبه على التايملين',
          onclick: function () { o.sel = it.id; Array.prototype.forEach.call(grid.children, function (x) { x.classList.toggle('on', x === tile); }); drawDetails(it); },
          ondblclick: function () { place(it); },
          onkeydown: function (e) { if (e.key === 'Enter') place(it); },
          onmouseenter: function () {
            if (audio) { A.src = EF.fileUrl(it.path); A.currentTime = 0; A.play().catch(function () {}); return; }
            if (browserVideo && !thumb.querySelector('video')) { var v = h('video', { src: EF.fileUrl(it.path), muted: true, loop: true, playsinline: true }); v.muted = true; thumb.appendChild(v); v.play().catch(function () {}); }
          },
          onmouseleave: function () { A.pause(); var v = thumb.querySelector('video'); if (v) v.remove(); }
        }, thumb, fav, put,
          h('div', { class: 'meta' }, h('div', { class: 'name' }, h('bdi', null, it.name)),
            h('div', { class: 'sub' }, (SUB_NAME[it.sub] || it.sub || it.ext) + (it.duration ? ' · ' + (it.duration < 60 ? it.duration.toFixed(1) + 's' : UI.fmtTime(it.duration)) : '') + (it.uses ? ' · ' + it.uses + '×' : ''))));
        // drag straight onto Premiere's timeline/project (CEP file drag), or anywhere that takes a file
        tile.addEventListener('dragstart', function (e) {
          try {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('com.adobe.cep.dnd.file.0', it.path);
            e.dataTransfer.setData('text/uri-list', EF.fileUrl(it.path));
            e.dataTransfer.setData('text/plain', it.path);
          } catch (err) {}
        });
        if (io) io.observe(tile); else loadThumb(tile);
        return tile;
      }

      function draw() {
        UI.empty(grid);
        var items = S.librarySearch({ q: o.q, category: o.cat, sub: o.sub, special: o.special, sort: o.sort });
        count.textContent = items.length + ' عنصر';
        if (!items.length) {
          grid.appendChild(h('div', { class: 'lib-empty' }, stats.total
            ? (o.special === 'fav' ? 'لسه مفيش مفضلة — دوس ☆ على أي حاجة' : o.special === 'recent' ? 'لسه ماحطّتش حاجة من المكتبة' : 'مفيش حاجة بالاسم ده')
            : 'المكتبة فاضية — ارمي فولدر الساوند إفكتس والترانزيشنز بتوعك فوق'));
          return;
        }
        items.slice(0, 600).forEach(function (it) { grid.appendChild(tileFor(it)); });
        if (items.length > 600) grid.appendChild(h('div', { class: 'lib-empty' }, 'ظاهر أول 600 — دوّر أو اختار قسم'));
      }

      function drawDetails(it) {
        UI.empty(details);
        var tags = h('input', { class: 'grow', placeholder: 'تاجات مفصولة بفاصلة (هتلاقيها بالبحث)', value: (it.tags || []).join('، ') });
        tags.addEventListener('change', function () { if (S.libraryUpdate) { var r = S.libraryUpdate({ id: it.id, tags: tags.value }); it.tags = r.tags; UI.toast('التاجات اتحفظت ✓'); } });
        var audio = it.category === 'sfx' || it.category === 'music';
        details.appendChild(UI.card(null,
          h('div', { class: 'row' }, h('b', { class: 'grow' }, h('bdi', null, it.name)), h('span', { class: 'hint ltr' }, it.ext.toUpperCase() + (it.width ? ' · ' + it.width + '×' + it.height : '') + (it.duration ? ' · ' + it.duration.toFixed(2) + 's' : '') + (it.alpha ? ' · شفاف' : ''))),
          h('div', { class: 'hint ltr lib-path' }, it.path),
          UI.row(tags),
          UI.row(UI.btn('حط عند رأس التشغيل', function () { place(it); }, 'primary small'),
            UI.btn(audio ? 'على كل الماركرز' : 'على كل الماركرز', function () { place(it, 'markers'); }, 'small'),
            UI.btn('عند الـ In', function () { place(it, 'in'); }, 'small'),
            S.libraryReveal ? UI.btn('افتح مكانه', function () { S.libraryReveal(it.id); }, 'small') : null),
          it.ext === 'prfpset' ? UI.hint('البريسيت بيتحط بالسحب: اسحبه من هنا على الكليب في التايملين.') : null));
      }

      function addDirs(dirs) {
        if (!dirs.length) return;
        prog.set(0);
        UI.safe('بيرتّب المكتبة', function () {
          return S.libraryAdd(dirs, function (p) { prog.set(p); }).then(function (r) { prog.set(1); UI.toast('اتضاف ' + r.added + ' جديد — الإجمالي ' + r.total); refreshStats(); draw(); });
        });
      }
      var drop = h('div', { class: 'drop lib-drop' }, 'ارمي فولدر أو ملفات هنا — بتترتّب لوحدها (ساوند، مزيكا، ترانزيشنز، أوفرلايز، لقطات، جرافيك…)', ' ',
        UI.btn('اختار فولدر', function () { var d = EF.pickFolder('فولدر المكتبة'); if (d) addDirs([d]); }, 'small'));
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        addDirs(Array.prototype.map.call(e.dataTransfer.files || [], function (f) { return f.path; }).filter(Boolean));
      });
      var rescan = UI.btn('حدّث', function () {
        prog.set(0);
        UI.safe('بيحدّث المكتبة', function () {
          var p = S.libraryRescan ? S.libraryRescan(function (x) { prog.set(x); }) : S.libraryAdd(S.settings.libraryDirs || []);
          return p.then(function (r) { prog.set(1); UI.toast('المكتبة اتحدّثت ✓ — ' + r.total + ' عنصر (' + r.added + ' جديد)'); refreshStats(); draw(); });
        }, rescan);
      }, 'small');
      var search = h('input', { class: 'grow', placeholder: 'دوّر… (whoosh، light leak، تاج…)', value: o.q, oninput: function () { o.q = search.value; draw(); } });
      var sort = UI.select([{ value: 'new', label: 'الأحدث' }, { value: 'used', label: 'الأكتر استخدامًا' }, { value: 'name', label: 'بالاسم' }, { value: 'dur', label: 'الأقصر' }], o.sort, function (v) { o.sort = v; remember(); draw(); });
      var size = h('input', { type: 'range', min: 1, max: 3, step: 1, value: o.size, title: 'حجم الصور', oninput: function (e) { o.size = +e.target.value; grid.className = 'lib-grid s' + o.size; remember(); } });

      view.appendChild(UI.card(null, drop, UI.row(dirBox, h('span', { class: 'spacer' }), rescan), prog));
      view.appendChild(UI.card(null, catBox, subBox, UI.row(search), UI.row(sort, h('span', { class: 'hint' }, 'الحجم'), size, h('span', { class: 'spacer' }), count),
        UI.hint('حط الماوس تسمع/تشوف · دبل كليك أو ＋ يحط عند رأس التشغيل · اسحب على التايملين · ☆ للمفضلة · دوس على أي حاجة لخيارات أكتر (على كل الماركرز، تاجات، مكانه على الجهاز).')));
      view.appendChild(details); // fixed height: picking an item never moves the grid under the mouse
      view.appendChild(grid);
      details.appendChild(h('div', { class: 'lib-hint' }, 'دوس على أي حاجة هنا تحت تشوف خياراتها (على كل الماركرز، تاجات، مكانها على الجهاز)'));
      drawCats(); drawDirs(); draw();
    }
  });
})();

/* مكتبتك الخاصة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var CATS = [{ value: 'sfx', label: '🔊 ساوند إفكتس' }, { value: 'transitions', label: '🔀 ترانزيشنز' }, { value: 'overlays', label: '✨ أوفرلايز' }, { value: 'music', label: '🎵 موسيقى' }];
  var cur = 'sfx';
  EF.tabs.push({
    id: 'library', icon: '📚', label: 'مكتبتي', title: 'المكتبة الخاصة بيك',
    render: function (view) {
      var S = EF.services, q = '', grid = h('div', { class: 'grid' }), count = h('span', { class: 'hint' });
      var hoverAudio = new Audio();
      function draw() {
        UI.empty(grid);
        var items = S.librarySearch({ q: q, category: cur });
        count.textContent = items.length + ' عنصر';
        items.slice(0, 400).forEach(function (it) {
          var thumb = h('div', { class: 'thumb' });
          var isVid = /^(mov|mp4|webm|m4v|mkv|avi|mxf)$/.test(it.ext), isImg = /^(png|jpe?g|gif|webp)$/.test(it.ext);
          if (isImg) thumb.appendChild(h('img', { src: EF.fileUrl(it.path), loading: 'lazy' }));
          else if (isVid) thumb.appendChild(h('video', { src: EF.fileUrl(it.path), muted: true, preload: 'metadata', loop: true }));
          else thumb.appendChild(h('span', { style: { fontSize: '22px' } }, it.category === 'music' ? '🎵' : '🔊'));
          var tile = h('div', { class: 'tile', title: it.path + '\nدوس مرتين عشان تحطه عند رأس التشغيل',
            onmouseenter: function () { var v = thumb.querySelector('video'); if (v) v.play().catch(function () {}); else if (!isImg) { hoverAudio.src = EF.fileUrl(it.path); hoverAudio.play().catch(function () {}); } },
            onmouseleave: function () { var v = thumb.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } hoverAudio.pause(); },
            ondblclick: function () { UI.safe('بيحط', function () { return S.seq().then(function (s) { return S.libraryPlace({ id: it.id, time: s.playhead }); }).then(function () { UI.toast('اتحط ✓'); }); }); }
          }, it.sub ? h('span', { class: 'badge' }, it.sub) : null, thumb, h('div', { class: 'name' }, it.name), it.duration ? h('div', { class: 'sub ltr' }, it.duration.toFixed(1) + 's') : null);
          grid.appendChild(tile);
        });
      }
      function addDirs(dirs) {
        if (!dirs.length) return;
        UI.safe('بيرتّب المكتبة', function () { return S.libraryAdd(dirs).then(function (r) { UI.toast('اتضاف ' + r.added + ' — الإجمالي ' + r.total); draw(); }); });
      }
      var drop = h('div', { class: 'drop' }, 'ارمي الفولدر هنا (أو الملفات) — بيترتّب لوحده حسب نوعه', h('br'), UI.btn('اختار فولدر', function () { var d = EF.pickFolder('فولدر المكتبة'); if (d) addDirs([d]); }, 'small'));
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        var paths = Array.prototype.map.call(e.dataTransfer.files || [], function (f) { return f.path; }).filter(Boolean);
        addDirs(paths);
      });
      var search = h('input', { placeholder: 'دوّر… (whoosh, light leak…)', class: 'grow', oninput: function () { q = search.value; draw(); } });
      view.appendChild(UI.card(null, drop, UI.row(UI.seg(CATS, cur, function (v) { cur = v; draw(); })), UI.row(search, count),
        UI.hint('حط الماوس على أي حاجة تسمعها أو تشوفها. دوس مرتين تنزل عند رأس التشغيل.'),
        UI.row(UI.btn('حدّث المكتبة', function () { addDirs(S.settings.libraryDirs || []); }, 'small'))));
      view.appendChild(grid);
      draw();
    }
  });
})();

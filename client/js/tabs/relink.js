/* EditFast Link: يلاقي الملفات الناقصة ويربطها تاني واحد واحد. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { dirs: [], scan: null };
  EF.tabs.push({
    id: 'relink', label: 'ربط الملفات', title: 'EditFast Link — ربط الملفات الناقصة',
    render: function (view) {
      var S = EF.services;
      var dirs = h('div', { class: 'chips' }), out = h('div'), prog = UI.progress();
      function drawDirs() {
        UI.empty(dirs);
        o.dirs.forEach(function (d, i) { dirs.appendChild(h('span', { class: 'chip', title: d }, d.split(/[\\/]/).filter(Boolean).pop() || d, h('b', { class: 'x', onclick: function () { o.dirs.splice(i, 1); drawDirs(); } }, ' ×'))); });
        if (!o.dirs.length) dirs.appendChild(h('span', { class: 'hint' }, 'هيدوّر تلقائي في فولدر المشروع ومكان الملفات القديم والفولدرات المعتادة والهاردات الخارجية'));
      }
      function draw() {
        UI.empty(out);
        var r = o.scan; if (!r) return;
        if (!r.items.length) { out.appendChild(UI.card(null, h('div', { class: 'row' }, h('span', { class: 'badge-dot ok-dot' }), h('span', null, 'مفيش ملفات ناقصة في المشروع ✓')))); return; }
        var found = r.items.filter(function (i) { return i.target || i.match; }).length;
        var list = h('div', { class: 'list relink-list' });
        r.items.forEach(function (it) {
          if (it.use === undefined) it.use = !!(it.match && it.match.score >= 0.8);
          var target = it.target || (it.match && it.match.path);
          var st = h('span', { class: 'rl-st ' + (it.state || (target ? 'found' : 'missing')) }, it.state === 'done' ? '✓' : it.state === 'fail' ? '✕' : target ? '●' : '?');
          var pick = UI.btn('اختار', function () { var f = EF.pickFile('فين ' + it.name + '؟'); if (f) { it.target = f; it.use = true; draw(); } }, 'small');
          list.appendChild(h('div', { class: 'item' },
            h('input', { type: 'checkbox', checked: !!it.use && !!target, disabled: !target, onchange: function (e) { it.use = e.target.checked; } }), st,
            h('div', { class: 'grow' }, h('div', { class: 'name' }, h('bdi', null, it.name)),
              h('div', { class: 'hint ltr', title: target || it.path }, target ? '→ ' + target : 'مش لاقيه — ' + it.path),
              it.match && !it.target ? h('div', { class: 'hint' }, it.match.reason + ' · ' + Math.round(it.match.score * 100) + '%' + (it.match.others ? ' · فيه ' + it.match.others + ' نسخ تانية' : '')) : null),
            pick));
        });
        var apply = UI.btn('اربط المختار (واحد واحد)', function () {
          var sel = r.items.filter(function (i) { return i.use && (i.target || i.match); });
          if (!sel.length) return UI.toast('مفيش حاجة مختارة', true);
          prog.set(0);
          UI.safe('بيربط الملفات', function () {
            var i = 0;
            function next() {
              if (i >= sel.length) return Promise.resolve();
              var it = sel[i++];
              return S.relinkApply([it]).then(function (res) { it.state = res.done ? 'done' : 'fail'; prog.set(i / sel.length); draw(); UI.status('اتربط ' + i + ' من ' + sel.length, 'busy'); return next(); });
            }
            return next().then(function () { UI.toast('خلص: ' + sel.filter(function (x) { return x.state === 'done'; }).length + ' ملف اتربط ✓'); });
          }, apply);
        }, 'primary');
        out.appendChild(UI.card(r.items.length + ' ملف ناقص — لقينا ' + found, list, prog, UI.row(apply),
          UI.hint('دوّر في ' + r.searched.length + ' فولدر (' + r.indexed + ' ملف ميديا). الأخضر اتلقى بنفس الاسم؛ راجع الأصفر قبل ما تربطه.')));
      }
      var add = UI.btn('ضيف فولدر', function () { var d = EF.pickFolder('فين ممكن تكون الملفات؟'); if (d) { o.dirs.push(d); drawDirs(); } }, 'small');
      var scan = UI.btn('دوّر على الملفات الناقصة', function () {
        UI.safe('بيدوّر', function () { return S.relinkScan({ dirs: o.dirs, onProgress: function (n) { UI.status('اتفحص ' + n + ' ملف…', 'busy'); } }).then(function (r) { o.scan = r; draw(); }); }, scan);
      }, 'primary');
      view.appendChild(UI.card(null, UI.row(scan, add), dirs, UI.hint('بيلاقي كل ملف Media Offline في المشروع (فيديو، صور، صوت) ويدوّر عليه بالاسم — حتى لو اتغيّر امتداده أو اتنقل لفولدر أو هارد تاني — ويربطه تاني من غير ما يبوّظ القص.')));
      view.appendChild(out);
      drawDirs(); draw();
    }
  });
})();

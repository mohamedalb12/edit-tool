/* صانع الثامبنيل. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var state = { cands: null, sel: 0, o: { title: '', highlight: '', style: 'bold', side: 'left', emoji: '', accent: '#FFD84D', box: '#E11D48' }, ideas: null };
  EF.tabs.push({
    id: 'thumb', icon: '🖼', label: 'ثامبنيل', title: 'صانع الثامبنيل',
    render: function (view) {
      var S = EF.services, T = window.EFThumb, o = state.o;
      var stage = h('canvas', { class: 'thumb-stage' }); stage.width = 1280; stage.height = 720;
      var ctx = stage.getContext('2d'), img = null;
      function paint() { T.draw(ctx, img, o, 1280, 720); }
      function useCand(i) {
        state.sel = i; var c = state.cands && state.cands[i]; if (!c) { img = null; paint(); return; }
        var im = new Image(); im.onload = function () { img = im; paint(); }; im.src = EF.fileUrl(c.image);
        Array.prototype.forEach.call(grid.children, function (x, j) { x.classList.toggle('on', j === i); });
      }
      var grid = h('div', { class: 'grid' });
      function drawCands() {
        UI.empty(grid);
        (state.cands || []).forEach(function (c, i) {
          grid.appendChild(h('div', { class: 'tile' + (i === state.sel ? ' on' : ''), onclick: function () { useCand(i); } }, h('div', { class: 'thumb' }, h('img', { src: EF.fileUrl(c.image) })), h('div', { class: 'sub ltr' }, UI.fmtTime(c.time) + ' · ' + c.score.toFixed(2))));
        });
      }
      var find = UI.btn('لاقي أحلى فريمات', function () {
        UI.safe('بيدوّر على أحلى فريمات', function () { return S.thumbnailCandidates({ count: 8 }).then(function (c) { state.cands = c; drawCands(); useCand(0); }); }, find);
      }, 'primary');
      var ideasBox = h('div', { class: 'chips' });
      function drawIdeas() {
        UI.empty(ideasBox);
        (state.ideas || []).forEach(function (t) { ideasBox.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { o.title = t.text; o.highlight = t.highlight || ''; titleInp.value = o.title; hlInp.value = o.highlight; paint(); } }, t.text)); });
      }
      var ideas = UI.btn('اقترح عناوين (AI)', function () {
        UI.safe('بيفكّر في عناوين', function () { return S.thumbnailIdeas({ candidates: state.cands || [] }).then(function (r) { state.ideas = r.titles; drawIdeas(); if (state.cands && r.best >= 0 && r.best < state.cands.length) useCand(r.best); }); }, ideas);
      });
      var titleInp = h('input', { class: 'grow', value: o.title, placeholder: 'عنوان الثامبنيل', oninput: function () { o.title = titleInp.value; paint(); } });
      var hlInp = h('input', { value: o.highlight, placeholder: 'كلمة تتلوّن', style: { width: '120px' }, oninput: function () { o.highlight = hlInp.value; paint(); } });
      var save = UI.btn('احفظ الثامبنيل PNG', function () {
        UI.safe('بيحفظ', function () { return S.saveThumbnail(stage.toDataURL('image/png').split(',')[1], o.title || 'thumbnail').then(function (f) { UI.toast('اتحفظ ✓ ' + f.split(/[\\/]/).slice(-2).join('/')); }); }, save);
      }, 'primary');
      view.appendChild(UI.card(null, h('div', { class: 'stage-wrap' }, stage), UI.row(titleInp, hlInp), ideasBox,
        UI.row(h('label', null, 'الستايل'), UI.seg(T.STYLES.map(function (s) { return { value: s.id, label: s.name }; }), o.style, function (v) { o.style = v; paint(); })),
        UI.row(h('label', null, 'مكان النص'), UI.seg([{ value: 'left', label: 'شمال' }, { value: 'center', label: 'تحت' }, { value: 'right', label: 'يمين' }], o.side, function (v) { o.side = v; paint(); })),
        UI.row(h('label', null, 'ألوان'), h('input', { type: 'color', value: o.accent, oninput: function (e) { o.accent = e.target.value; paint(); } }), h('input', { type: 'color', value: o.box, oninput: function (e) { o.box = e.target.value; paint(); } }),
          h('input', { value: o.emoji, placeholder: 'إيموجي 😱', style: { width: '90px' }, oninput: function (e) { o.emoji = e.target.value; paint(); } })),
        UI.row(save, ideas)));
      view.appendChild(UI.card('أحلى فريمات (حدة + إضاءة + لقطات)', UI.row(find), grid));
      drawCands(); drawIdeas();
      if (state.cands) useCand(state.sel); else paint();
      if (document.fonts) document.fonts.ready.then(paint);
    }
  });
})();

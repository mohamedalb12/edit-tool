/* قوالبي: القوالب اللي اتعملت في أفتر (EditFast Motion) — تختار، تكتب الكلام وتغيّر الألوان والحركة، وتحطه. + الريندرات اللي جاية من أفتر. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs.push({
    id: 'mytemplates', icon: '🎬', label: 'قوالبي', title: 'قوالبي من أفتر',
    render: function (view) {
      var S = EF.services, grid = h('div', { class: 'tpl-grid list' }), form = h('div', { class: 'mgt-fields' }), sel = null, dur = 5;
      function drawForm() {
        UI.empty(form);
        if (!sel) { form.appendChild(UI.hint('اختار قالب من تحت.')); return; }
        var fields;
        try { fields = S.templateFields(sel.path); } catch (e) { form.appendChild(h('div', { class: 'hint err' }, e.message)); return; }
        var values = {};
        form.appendChild(h('div', { class: 'row' }, h('b', { class: 'grow' }, h('bdi', null, sel.name)), h('span', { class: 'hint' }, fields.length + ' خانة')));
        fields.forEach(function (f) {
          var input;
          if (f.type === 'text') input = h('input', { class: 'grow', value: f.value || '', oninput: function (e) { values[f.name] = { name: f.name, type: f.type, value: e.target.value }; } });
          else if (f.type === 'color') input = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(f.value) ? f.value : '#f97316', oninput: function (e) { values[f.name] = { name: f.name, type: f.type, value: e.target.value }; } });
          else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!f.value, onchange: function (e) { values[f.name] = { name: f.name, type: f.type, value: e.target.checked }; } });
          else {
            var lo = isFinite(f.min) ? f.min : 0, hi = isFinite(f.max) ? f.max : Math.max(200, (+f.value || 0) * 2);
            input = UI.slider(lo, hi, (hi - lo) > 20 ? 1 : 0.1, +f.value || 0, function (v) { return String(Math.round(v * 10) / 10); }, function (v) { values[f.name] = { name: f.name, type: f.type, value: v }; });
          }
          form.appendChild(UI.field(f.name, input));
        });
        form.appendChild(UI.field('المدة', UI.slider(1, 20, 0.5, dur, function (v) { return v + 's'; }, function (v) { dur = v; })));
        var put = UI.btn('حطه عند رأس التشغيل', function () {
          UI.safe('بيحط القالب', function () {
            var list = Object.keys(values).map(function (k) { return values[k]; });
            return S.placeTemplate({ path: sel.path, values: list, duration: dur }).then(function (r) { UI.toast(sel.name + ' اتحط ✓' + (r.params ? ' — ' + r.params + ' خانة اتظبطت' : '')); });
          }, put);
        }, 'primary');
        form.appendChild(UI.row(put));
        form.appendChild(UI.hint('بعد ما يتحط تقدر تعدّل نفس الخانات من Essential Graphics في بريمير.'));
      }
      function drawGrid() {
        UI.empty(grid);
        var list = S.myTemplates ? S.myTemplates() : [];
        if (!list.length) { grid.appendChild(UI.hint('لسه مفيش قوالب — في أفتر افتح Window ← Extensions ← EditFast Motion، واعمل الحاجة وأحفظها كقالب.')); return; }
        list.forEach(function (t) {
          grid.appendChild(h('div', { class: 'item tpl click' + (sel && sel.path === t.path ? ' on' : ''), 'data-path': t.path, onclick: function () { sel = t; drawGrid(); drawForm(); } },
            t.thumb ? h('img', { src: EF.fileUrl(t.thumb), alt: '' }) : h('span', { class: 'ph' }, '🎬'),
            h('div', { class: 'grow' }, h('b', null, h('bdi', null, t.name)), h('div', { class: 'hint' }, t.external ? 'MOGRT في فولدر القوالب' : ((t.fields || []).map(function (f) { return f.name; }).slice(0, 4).join('، ') || '')))));
        });
      }
      view.appendChild(UI.card('القوالب', UI.hint('القوالب اللي حفظتها من أفتر بتظهر هنا لوحدها (وفي Essential Graphics كمان).'), grid));
      view.appendChild(UI.card('قبل ما يتحط', form));
      // ——— renders sent from After Effects ———
      var hand = h('div', { class: 'list' });
      function drawHand() {
        UI.empty(hand);
        var list = S.handoffList ? S.handoffList() : [];
        if (!list.length) { hand.appendChild(UI.hint('اللي ترندره من EditFast Motion ← الروتين بيظهر هنا.')); return; }
        list.forEach(function (x) {
          hand.appendChild(h('div', { class: 'item' }, h('span', { class: 'grow' }, h('bdi', null, x.name)), h('span', { class: 'hint ltr' }, x.file.split(/[\\/]/).pop()),
            UI.btn('حطه', function () { UI.safe('بيحط', function () { return S.placeHandoff(x.file).then(function () { UI.toast(x.name + ' ✓'); }); }); }, 'small')));
        });
      }
      view.appendChild(UI.card('من أفتر', hand));
      drawGrid(); drawForm(); drawHand();
    }
  });
})();

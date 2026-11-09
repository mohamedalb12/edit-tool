/* تاب السكيلز: ارفع فيديوهات مرجعية ← الإضافة تحللهم على جهازك ← "سكيل" (إيقاع، زووم، فلاشات، ألوان، بيت) تطبّقه أو Claude يشتغل بيه. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var APP = window.EF_APP === 'ae' ? 'ae' : 'premiere';
  var state = { files: [], name: '', editing: null };
  var ZOOM = { jump: 'بانش سريع', smooth: 'دخول ناعم' }, DENS = { low: 'قليل', medium: 'متوسط', high: 'كتير' };

  function S() { return EF.services; }
  function base(p) { return String(p).split(/[\\/]/).pop(); }

  EF.tabs = EF.tabs || [];
  EF.tabs.push({
    id: 'skills', icon: '✦', label: 'سكيلز', title: 'سكيلز من فيديوهات مرجعية',
    render: function (view) {
      var listBox = h('div', { class: 'skills-list' }), step = h('div', { class: 'hint skill-step' }), filesBox = h('div', { class: 'chips skill-files' });
      var name = h('input', { class: 'grow skill-name', value: state.name, placeholder: 'اسم السكيل (مثلًا: ريلز سريعة، بودكاست هادي، إعلان عقارات)', oninput: function () { state.name = name.value; } });

      function drawFiles() {
        UI.empty(filesBox);
        if (!state.files.length) { filesBox.appendChild(UI.hint('لسه مااخترتش فيديوهات — من 1 لـ 12، أحسن 3–5 من نفس الستايل.')); return; }
        state.files.forEach(function (f, i) {
          filesBox.appendChild(h('span', { class: 'chip' }, base(f), h('button', { type: 'button', class: 'chip-x', title: 'شيله', onclick: function () { state.files.splice(i, 1); drawFiles(); } }, '✕')));
        });
      }
      var make = UI.btn('حلّل واعمل السكيل', function () {
        if (!state.files.length) return UI.toast('اختار الفيديوهات الأول', true);
        UI.safe('بيحلل الفيديوهات', function () {
          step.textContent = 'بيبدأ…';
          return S().skillCreate({ name: state.name.trim() || 'سكيل ' + (S().skills().length + 1), files: state.files.slice(), onStep: function (m) { step.textContent = m; } }).then(function (s) {
            state.files = []; state.name = ''; name.value = ''; drawFiles();
            step.textContent = '✓ السكيل "' + s.name + '" جاهز — ' + s.settings.pace + ' · ' + ZOOM[s.settings.zoom.style];
            UI.toast('السكيل اتعمل ✓'); drawList();
          });
        }, make);
      }, 'primary');

      view.appendChild(UI.card('اعمل سكيل من فيديوهات',
        UI.hint('ارفع فيديوهات عاجبك ستايلها: الإضافة بتحللهم على جهازك (من غير نت ولا فلوس) وتطلع منهم سكيل — سرعة القطع، الزووم (بانش ولا ناعم وبكام في المية)، الحركة، الفلاشات، الألوان والجريد، وهل القطع ماشي على البيت. وبعدين تطبّقه على شغلك أو Claude يمنتج بيه.'),
        UI.row(h('label', null, 'الاسم'), name),
        UI.row(UI.btn('اختار الفيديوهات…', function () {
          var picked = EF.pickFiles ? EF.pickFiles('فيديوهات مرجعية', ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mxf']) : [];
          picked.forEach(function (f) { if (state.files.indexOf(f) < 0 && state.files.length < 12) state.files.push(f); });
          drawFiles();
        }, 'small')),
        filesBox, UI.row(make), step));

      function stat(label, value) { return h('div', { class: 'skill-stat' }, h('span', { class: 'hint' }, label), h('b', null, value)); }
      function skillCard(item) {
        var s = S().skillGet(item.id);
        if (!s) return null;
        var active = S().settings.activeSkill === s.id, g = s.settings || {}, t = s.stats || {};
        var notes = h('textarea', { class: 'grow skill-notes', rows: 3, placeholder: 'الكابشن، الكلام المتحرك، الترانزيشنز، الجرافيك… (Claude بيكتبها لوحده لما يبص على المرجع، أو اكتبها انت)' });
        notes.value = s.notes || '';
        var res = h('div', { class: 'hint skill-res' });
        var del = UI.btn('امسح', function () { if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'متأكد؟ دوس تاني'; return; } S().skillRemove(s.id); drawList(); }, 'small');
        var sheet = (s.refs || []).map(function (r) { return r.sheet; }).filter(Boolean)[0];
        var buttons = [
          active ? h('span', { class: 'badge skill-active' }, '✓ المختار') : UI.btn('استخدمه', function () { S().setActiveSkill(s.id); UI.toast('"' + s.name + '" بقى السكيل المختار — Claude هيشتغل بيه'); drawList(); }, 'primary')
        ];
        if (APP === 'premiere') buttons.push(UI.btn('طبّقه على السيكوينس', function (e) {
          UI.safe('بيطبّق السكيل', function () {
            return S().skillApply({ id: s.id }).then(function (r) {
              res.textContent = '✓ ' + [r.beat ? 'اتقطّع على البيت' : null, r.zoom ? (r.zoom.zooms || 0) + ' زووم' : null].filter(Boolean).join(' · ');
              UI.toast('السكيل اتطبّق ✓');
            });
          }, e.currentTarget);
        }, 'small'));
        buttons.push(UI.btn('وصف بالصور (AI)', function (e) {
          UI.safe('بيبص على المرجع', function () { return S().skillDescribe(s.id).then(function (n) { notes.value = n.notes; res.textContent = '✓ اتكتب وصف الستايل'; }); }, e.currentTarget);
        }, 'small'), del);
        return UI.card(s.name,
          s.stats ? h('div', { class: 'skill-stats' },
            stat('الإيقاع', g.pace + ' · ' + t.shotAvg + ' ث للقطة'),
            stat('القطع', t.cutsPerMin + ' في الدقيقة'),
            stat('الزووم', ZOOM[g.zoom.style] + ' · ' + DENS[g.zoom.density] + ' · ' + g.zoom.scale + '%'),
            stat('الحركة', g.motion),
            stat('الترانزيشن', g.flashes),
            stat('المزيكا', g.beat.on ? 'على البيت · كل ' + g.beat.every + ' · ' + g.beat.bpm + ' BPM' : (g.beat.bpm ? g.beat.bpm + ' BPM · مش على البيت' : 'مفيش بيت واضح')),
            stat('الجريد', g.grade.join('، '))) : UI.hint('لسه ماتحللش'),
          g.colors && g.colors.length ? h('div', { class: 'chips skill-palette' }, g.colors.map(function (c) { return h('span', { class: 'swatch', title: c, style: { background: c } }); })) : null,
          sheet ? h('img', { class: 'skill-sheet', src: EF.fileUrl(sheet), alt: 'فريمات من المرجع' }) : null,
          UI.hint('من ' + s.refs.length + ' فيديو: ' + s.refs.map(function (r) { return r.name; }).join('، ')),
          UI.row(notes, UI.btn('احفظ', function () { S().skillUpdate(s.id, { notes: notes.value }); UI.toast('اتحفظ ✓'); }, 'small')),
          UI.row.apply(UI, buttons), res);
      }
      function drawList() {
        UI.empty(listBox);
        var all = S().skills();
        if (!all.length) { listBox.appendChild(UI.card('السكيلز بتاعتك', UI.hint('لسه مفيش — اعمل أول سكيل من فوق.'))); return; }
        all.forEach(function (it) { var c = skillCard(it); if (c) listBox.appendChild(c); });
      }
      view.appendChild(listBox);
      view.appendChild(UI.hint('السكيل المختار Claude بيقراه لوحده في تاب Claude (ويبص على صور المرجع)، فقوله "منتج بالسكيل ده" وخلاص.'));
      drawFiles(); drawList();
    }
  });
})();

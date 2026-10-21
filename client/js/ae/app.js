/* EditFast Motion (After Effects): تشغيل اللوحة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.GROUPS = [
    { id: 'templates', label: 'قوالبي', title: 'قوالبي (لبريمير)', icon: 'templates', members: ['templates'] },
    { id: 'director', label: 'المونتير', title: 'المونتير الذكي', icon: 'auto', members: ['director'] },
    { id: 'estate', label: 'عقارات', title: 'إبراز مبنى (عقارات)', icon: 'templates', members: ['estate'] },
    { id: 'studio', label: 'لوجو و3D', title: 'لوجو، مورف، وثري دي', icon: 'cube', members: ['studio'] },
    { id: 'track', label: 'تراكينج', title: 'تراكينج', icon: 'reels', members: ['track'] },
    { id: 'character', label: 'كاراكتر', title: 'كاراكتر أنيميشن', icon: 'agent', members: ['character'] },
    { id: 'fx', label: 'مؤثرات', title: 'ترانزيشنز وسايل وفيزيا', icon: 'autofx', members: ['fx'] },
    { id: 'info', label: 'إنفوجرافيك', title: 'عدّادات وإنفوجرافيك', icon: 'thumb', members: ['info'] },
    { id: 'motion', label: 'الحركة', title: 'الحركة', icon: 'motion', members: ['motion'] },
    { id: 'text', label: 'الكلام', title: 'الكلام والأشكال', icon: 'titles', members: ['text'] },
    { id: 'expr', label: 'إكسبريشن', title: 'إكسبريشنز بضغطة', icon: 'code', members: ['expr'] },
    { id: '3d', label: 'ثري دي', title: 'ثري دي', icon: 'cube', members: ['3d'] },
    { id: 'routine', label: 'الروتين', title: 'الروتين', icon: 'render', members: ['routine'] },
    { id: 'ai', label: 'المساعد', title: 'مساعد الموشن', icon: 'agent', members: ['ai'] },
    { id: 'library', label: 'مكتبتي', title: 'مكتبتي', icon: 'library', members: ['library'] },
    { id: 'settings', label: 'الإعدادات', title: 'الإعدادات', icon: 'settings', members: ['settings'] }
  ];
  function show(id) {
    var tab = EF.tabs.find(function (t) { return t.id === id; }) || EF.tabs[0];
    EF.currentTab = tab.id;
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('active', b.dataset.id === tab.id); });
    UI.wordFx(document.getElementById('tab-title'), tab.title, { step: 70 });
    var view = UI.empty(document.getElementById('view'));
    try { tab.render(view); } catch (e) { view.appendChild(UI.card('خطأ', h('pre', { class: 'err ltr' }, e.stack || e.message))); console.error(e); }
    try { localStorage.setItem('ef-ae-tab', tab.id); } catch (e2) {}
  }
  EF.show = show;

  /** ⌘K in After Effects: screens + every motion preset, curve, expression, 3D move */
  EF.paletteItems = function () {
    var S = EF.services, out = [], A = function (id, icon, label, kw, fn, busy) { out.push({ id: id, icon: icon, label: label, kw: kw, run: function () { return UI.safe(busy || label, fn); } }); };
    EF.GROUPS.forEach(function (g) { out.push({ id: 'go:' + g.id, icon: '↗', label: g.title, kw: g.id, run: function () { show(g.id); } }); });
    (window.EFMotion ? window.EFMotion.PRESETS : []).forEach(function (p) { A('mo:' + p.id, '🎬', 'حركة: ' + p.name, p.id.replace(/-/g, ' ') + ' motion', function () { return S.applyMotion({ preset: p.id, level: 2 }).then(function () { UI.toast(p.name + ' ✓'); }); }); });
    var C = window.EFCurves; if (C) Object.keys(C.PRESETS).forEach(function (k) { if (!C.PRESETS[k].fn.bezier) return; A('ez:' + k, '〰', 'منحنى: ' + C.PRESETS[k].label, k + ' ease curve', function () { return S.applyEase({ curve: k }).then(function () { UI.toast('✓'); }); }); });
    [['wiggle', 'Wiggle'], ['bounce', 'Bounce'], ['loopCycle', 'Loop'], ['autoFade', 'فيد تلقائي'], ['float', 'طفو'], ['spin', 'لف'], ['typewriter', 'آلة كاتبة']].forEach(function (x) {
      A('ex:' + x[0], '⌁', 'إكسبريشن: ' + x[1], x[0] + ' expression', function () { return S.addExpression({ kind: x[0] }).then(function () { UI.toast(x[1] + ' ✓'); }); });
    });
    [['push', 'كاميرا داخلة'], ['orbit', 'كاميرا بتلف'], ['dolly', 'كاميرا ماشية'], ['float', 'كاميرا في الإيد']].forEach(function (x) {
      A('cam:' + x[0], '🎥', x[1], x[0] + ' camera 3d كاميرا', function () { return S.cameraRig({ kind: x[0] }).then(function () { UI.toast('✓'); }); });
    });
    A('null', '◎', 'نل كنترولر للمختار', 'null parent نل', function () { return S.nullController({}).then(function () { UI.toast('✓'); }); });
    A('anchor', '✛', 'الأنكر في النص', 'anchor center أنكر', function () { return S.anchor({ where: 'c' }).then(function () { UI.toast('✓'); }); });
    A('stagger', '⋰', 'ستاجر 3 فريم', 'stagger offset ستاجر', function () { return S.stagger({ frames: 3 }).then(function () { UI.toast('✓'); }); });
    A('render', '⏺', 'ريندر الكومب لبريمير', 'render ريندر', function () { return S.render({}).then(function () { UI.toast('✓'); }); });
    A('director', '🎬', 'المونتير الذكي: وصّف مشهد', 'ai director scene مشهد مونتير', function () { show('director'); });
    A('logo', '✒', 'أنيميشن لوجو من صورة / SVG', 'logo trace svg لوجو', function () { show('studio'); });
    A('morph', '◐', 'مورف بين الليرز المختارة', 'morph shape مورف', function () { return S.morph({}).then(function (r) { UI.toast('مورف ' + r.stages + ' أشكال ✓'); }); });
    A('photo3d', '🧊', 'صورة → ثري دي', '3d photo parallax ثري دي صورة', function () { show('studio'); });
    A('track', '⌖', 'تراكينج', 'track tracking corner pin stabilize تراك ثبت', function () { show('track'); });
    A('char', '🧍', 'كاراكتر متريّج', 'character rig rubberhose duik كاراكتر ريج', function () { show('character'); });
    A('explode', '✂', 'فصّل الشيب لليرز', 'explode shape layers فصل', function () { return S.explodeShapes().then(function (r) { UI.toast(r.layers + ' ✓'); }); });
    A('colors', '🎨', 'كنترول واحد لكل الألوان', 'color controller palette ألوان', function () { return S.colorRig().then(function (r) { UI.toast(r.colors.length + ' لون ✓'); }); });
    A('estate', '🏢', 'إبراز مبنى (عقارات)', 'real estate building highlight عقارات مبنى ابراز تلوين', function () { show('estate'); });
    A('counter', '🔢', 'عدّاد أرقام', 'counter number عداد رقم دولار نسبة', function () { show('info'); });
    A('chart', '📊', 'رسم بياني / تايملاين', 'chart graph infographic رسم بياني انفوجرافيك تايملاين', function () { show('info'); });
    A('trans', '🔀', 'ترانزيشن بين اللقطات', 'transition zoom whip glitch ترانزيشن', function () { show('fx'); });
    A('liquid', '💧', 'أشكال سايلة', 'liquid blob wave سايل بلوب موج', function () { show('fx'); });
    A('phys', '🧲', 'فيزيا (تقع وتتنطط)', 'physics gravity bounce فيزيا جاذبية', function () { return S.physics({}).then(function (r) { UI.toast(r.bodies + ' ✓'); }); });
    A('roto', '✂', 'روتو: افصل الشخص', 'roto mask background remove روتو فصل خلفية', function () { show('studio'); });
    A('sizes', '📐', 'ريندر كل المقاسات', 'render sizes 9:16 reels مقاسات', function () { return S.multiFormat({}).then(function (r) { UI.toast(r.comps.length + ' ✓'); }); });
    A('kinetic', '💬', 'كلام متحرك مع الصوت', 'kinetic typography captions كلام صوت', function () { show('director'); });
    A('save', '💾', 'احفظ الكومب كقالب', 'template mogrt قالب', function () { show('templates'); });
    return out;
  };

  function boot() {
    try { EF.services = EF.test && EF.test.services ? EF.test.services : new (EF.node('aeServices').AEServices)({ host: EF.host, log: function (m) { console.log('[EditFast Motion]', m); } }); } catch (err) { return failed(err); }
    var nav = document.getElementById('nav');
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) { el.appendChild(UI.icon(el.getAttribute('data-icon'))); });
    EF.GROUPS.forEach(function (g) {
      nav.appendChild(h('button', { type: 'button', 'data-id': g.id, title: g.title, onclick: function () { show(g.id); } }, h('span', { class: 'ic' }, UI.icon(g.icon)), g.label));
    });
    var st = document.getElementById('status'); if (st) { st.style.cursor = 'pointer'; st.addEventListener('click', function () { if (EF.aeError) { UI.toast(EF.aeError, true); EF.connect(); } }); }
    var pb = document.getElementById('pal-btn'); if (pb) pb.addEventListener('click', function () { if (EF.palette) EF.palette.open(); });
    var first = null; try { first = localStorage.getItem('ef-ae-tab'); } catch (e) {}
    show(first || 'templates');
    EF.connect();
    if (EF.claude && !EF.test) EF.claude.start('ae');
  }
  /** load the AE script and say hello; the status pill shows why when it fails (and retries on click) */
  EF.connect = function () {
    UI.status('بيتصل بالأفتر…', 'busy');
    return EF.loadHostScript().then(function () { return EF.host('ping', {}); }).then(function (r) {
      EF.aeInfo = r; EF.aeError = null;
      UI.status('متصل بـ ' + (r.app || 'After Effects') + (r.version ? ' ' + String(r.version).split('x')[0] : ''));
      if (r.canWrite === false) UI.toast('فعّل في الأفتر: Settings ← Scripting & Expressions ← "Allow Scripts to Write Files and Access Network" — عشان حفظ القوالب والريندر', true);
      return r;
    }).catch(function (e) {
      EF.aeError = (e && e.message) || String(e);
      UI.status('مش متصل بالأفتر — دوس هنا', 'err');
      console.warn(e);
      // is AE's script engine answering at all? (tells "our script" apart from "scripting blocked")
      if (EF.isCEP) EF.evalScript('app.version').then(function (v) { EF.aeError += ' — [محرك السكريبت: ' + (v && v !== 'EvalScript error.' ? 'شغال، AE ' + v : 'مش بيرد') + ' · ' + EF.extRoot + ']'; });
    });
  };
  function failed(err) {
    var v = document.getElementById('view');
    v.appendChild(UI.card('EditFast Motion مااشتغلش', h('p', null, 'Node.js جوه اللوحة مااشتغلش. اقفل الأفتر وافتحه تاني، ولو فضل كده شغّل المثبّت تاني.'), h('pre', { class: 'err ltr' }, String(err && err.stack || err))));
  }
  boot();
})();

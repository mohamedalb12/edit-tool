/* EditFast Motion (After Effects): الشاشات. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs = EF.tabs || [];
  function S() { return EF.services; }
  function ok(t) { UI.toast(t); }
  function chips(list, cls) { var b = h('div', { class: 'chips ' + (cls || '') }); list.forEach(function (x) { b.appendChild(x); }); return b; }
  function action(label, busy, fn, kind) { var b = UI.btn(label, function () { UI.safe(busy, fn, b); }, kind || 'small'); return b; }

  /* ——— قوالبي: احفظ الكومب كقالب لبريمير + القوالب اللي اتعملت ——— */
  EF.tabs.push({
    id: 'templates', label: 'قوالبي', title: 'قوالبي (لبريمير)',
    render: function (view) {
      var M = EF.node('mogrt'), ed = { text: true, colors: true, motion: true }, scanBox = h('div'), listBox = h('div', { class: 'tpl-list' });
      var name = h('input', { class: 'grow', placeholder: 'اسم القالب (مثلًا: تايتل برتقالي)' });
      var edBox = h('div', { class: 'ed-pick' }), preBox = h('div', { class: 'chips' });
      function drawEd() {
        UI.empty(edBox);
        M.EDITABLE.forEach(function (e) {
          edBox.appendChild(h('label', { class: 'ed-item' + (ed[e.id] ? ' on' : ''), title: e.hint },
            h('input', { type: 'checkbox', checked: !!ed[e.id], onchange: function (ev) { ed[e.id] = ev.target.checked; drawEd(); } }),
            h('b', null, e.label), h('span', { class: 'hint' }, e.hint)));
        });
      }
      M.PRESETS.forEach(function (p) {
        preBox.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { ed = Object.assign({}, p.editable); drawEd(); } }, p.label));
      });
      var scan = action('اقرا الكومب', 'بيقرا الكومب', function () {
        return S().templateScan().then(function (r) {
          UI.empty(scanBox);
          if (!name.value) name.value = r.comp;
          var sw = h('span', { class: 'swatches' }); r.colors.slice(0, 10).forEach(function (c) { sw.appendChild(h('i', { style: { background: c }, title: c })); });
          scanBox.appendChild(h('div', { class: 'hint' }, r.layers + ' لير · ' + r.texts.length + ' كلام · ' + r.colors.length + ' لون · ' + r.animated + ' حاجة متحركة' + (r.controls ? ' · ' + r.controls + ' كنترول بتاعك' : '') + ' · ' + r.duration.toFixed(1) + 's ', sw));
          // suggest the choices that make sense for what's in the comp
          ed = { text: r.texts.length > 0, colors: r.colors.length > 0, motion: r.animated > 0, transform: false, controls: r.controls > 0, media: false };
          drawEd();
        });
      });
      var saveBtn = UI.btn('احفظ كقالب لبريمير', function () {
        UI.safe('بيعمل القالب', function () {
          return S().templateSave({ name: name.value, editable: ed }).then(function (t) {
            ok('القالب "' + t.name + '" جاهز في بريمير ✓ — ' + t.fields.length + ' خانة تتعدّل');
            drawList();
          });
        }, saveBtn);
      }, 'primary');
      view.appendChild(UI.card('احفظ الكومب كقالب',
        UI.hint('بيعمل نسخة من الكومب (الأصل مابيتلمسش) ويطلّعها MOGRT في فولدر قوالب بريمير — تلاقيه في Essential Graphics وفي EditFast ← جرافيك ← قوالبي. قولّي إيه اللي يتعدّل في بريمير:'),
        UI.row(name, scan), scanBox, preBox, edBox, UI.row(saveBtn)));
      function drawList() {
        UI.empty(listBox);
        var list = S().templates();
        if (!list.length) { listBox.appendChild(UI.hint('لسه مفيش قوالب — اعمل حاجة حلوة واحفظها من فوق.')); return; }
        list.forEach(function (t) {
          listBox.appendChild(h('div', { class: 'item tpl' + (t.exists ? '' : ' off') },
            t.thumb ? h('img', { src: EF.fileUrl(t.thumb), alt: '' }) : h('span', { class: 'ph' }, '🎬'),
            h('div', { class: 'grow' }, h('b', null, h('bdi', null, t.name)), h('div', { class: 'hint' }, (t.fields || []).map(function (f) { return f.name; }).slice(0, 5).join('، ') || 'من غير خانات')),
            action('افتحه', 'بيفتح الكومب', function () { return S().templateOpen(t.id).then(function () { ok('اتفتح — عدّل وبعدين دوس "حدّث"'); }); }),
            action('حدّث', 'بيحدّث القالب', function () { return S().templateUpdate(t.id).then(function () { ok('اتحدّث في بريمير ✓'); drawList(); }); }),
            h('button', { type: 'button', class: 'x', title: 'شيله من القايمة (الملف بيفضل)', onclick: function () { S().templateRemove(t.id); drawList(); } }, '✕')));
        });
      }
      view.appendChild(UI.card('القوالب اللي عملتها', listBox));
      drawEd(); drawList();
    }
  });

  /* ——— الحركة: قوالب الحركة + المنحنيات + ستاجر/أنكر/نل ——— */
  EF.tabs.push({
    id: 'motion', label: 'الحركة', title: 'الحركة',
    render: function (view) {
      var Mo = window.EFMotion, C = window.EFCurves, level = 2;
      var KINDS = [{ k: 'in', label: 'دخول' }, { k: 'out', label: 'خروج' }, { k: 'emphasis', label: 'تأكيد (عند المؤشر)' }];
      var grids = h('div');
      KINDS.forEach(function (K) {
        var g = h('div', { class: 'chips mo-grid' });
        Mo.PRESETS.filter(function (p) { return p.kind === K.k; }).forEach(function (p) {
          g.appendChild(h('button', { type: 'button', class: 'chip', 'data-preset': p.id, onclick: function () {
            UI.safe('بيحط الحركة', function () { return S().applyMotion({ preset: p.id, level: level }).then(function (r) { ok(p.name + ' على ' + r.layers + ' لير ✓'); }); });
          } }, p.name));
        });
        grids.appendChild(h('div', null, h('div', { class: 'hint' }, K.label), g));
      });
      view.appendChild(UI.card('حركة جاهزة على الليرز المختارة',
        UI.row(h('label', null, 'القوة'), UI.seg([{ value: 1, label: 'هادي' }, { value: 2, label: 'متوسط' }, { value: 3, label: 'قوي' }], level, function (v) { level = v; })),
        grids, UI.hint('بيكتب كي فريمز حقيقية بمنحنى ناعم على Position / Scale / Rotation / Opacity — عدّلها براحتك في الـ Graph Editor.')));
      var eg = h('div', { class: 'chips ease-grid' });
      Object.keys(C.PRESETS).forEach(function (k) {
        var fn = C.PRESETS[k].fn; if (!fn.bezier) return;
        var b = fn.bezier, svg = '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M4 36 C' + (4 + b[0] * 32) + ' ' + (36 - b[1] * 32) + ' ' + (4 + b[2] * 32) + ' ' + (36 - b[3] * 32) + ' 36 4" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
        var btn = h('button', { type: 'button', class: 'chip ease', 'data-ease': k, onclick: function () {
          UI.safe('بيطبّق المنحنى', function () { return S().applyEase({ curve: k }).then(function (r) { ok(C.PRESETS[k].label + ' على ' + r.segments + ' جزء ✓'); }); });
        } });
        btn.innerHTML = svg; btn.appendChild(h('span', null, C.PRESETS[k].label));
        eg.appendChild(btn);
      });
      var x1 = 0.25, y1 = 0.1, x2 = 0.25, y2 = 1;
      var custom = h('input', { class: 'ltr', value: '0.25, 0.1, 0.25, 1', title: 'cubic-bezier' });
      view.appendChild(UI.card('منحنيات (زي Flow)',
        UI.hint('اختار الكي فريمز (أو الخاصية كلها) في التايملاين ودوس منحنى: بيظبط الـ Influence والسرعة بالظبط زي cubic-bezier.'),
        eg, UI.row(h('label', null, 'منحنى بإيدك'), custom, action('طبّق', 'بيطبّق', function () {
          var v = custom.value.split(',').map(Number);
          if (v.length !== 4 || v.some(isNaN)) throw new Error('اكتب 4 أرقام زي 0.25, 0.1, 0.25, 1');
          return S().applyEase({ bezier: v }).then(function (r) { ok(r.segments + ' جزء ✓'); });
        }))));
      var frames = 3, order = 'down';
      var anchors = h('div', { class: 'anchor-grid' });
      ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'].forEach(function (w) {
        anchors.appendChild(h('button', { type: 'button', 'data-anchor': w, onclick: function () { UI.safe('بيحرّك الأنكر', function () { return S().anchor({ where: w }).then(function (r) { ok('الأنكر اتنقل في ' + r.layers + ' لير ✓'); }); }); } }));
      });
      view.appendChild(UI.card('ترتيب وتحكّم',
        UI.field('ورا بعض كل', UI.slider(1, 20, 1, frames, function (v) { return v + ' فريم'; }, function (v) { frames = v; })),
        UI.row(UI.seg([{ value: 'down', label: 'من فوق لتحت' }, { value: 'up', label: 'من تحت لفوق' }, { value: 'random', label: 'عشوائي' }], order, function (v) { order = v; }),
          action('ستاجر', 'بيرتّب', function () { return S().stagger({ frames: frames, order: order }).then(function (r) { ok(r.layers + ' لير ورا بعض ✓'); }); }, 'primary small')),
        UI.row(h('div', null, h('div', { class: 'hint' }, 'الأنكر بوينت (من غير ما اللير يتحرك)'), anchors),
          action('نل كنترولر للمختار', 'بيعمل نل', function () { return S().nullController({}).then(function (r) { ok('"' + r.name + '" ماسك ' + r.layers + ' لير ✓'); }); }))));
    }
  });

  /* ——— الكلام والأشكال: أنيميشن كلام + لوور ثيرد + أشكال ——— */
  EF.tabs.push({
    id: 'text', label: 'الكلام', title: 'الكلام والأشكال',
    render: function (view) {
      var o = { by: 'chars', duration: 1, start: 'in' };
      var pres = [['fadeUp', 'طالع وظاهر'], ['typewriter', 'آلة كاتبة'], ['blurIn', 'من ضباب'], ['scalePop', 'بوب'], ['slideIn', 'داخل من الجنب'], ['tracking', 'مسافات بتقفل']];
      var g = chips(pres.map(function (p) { return h('button', { type: 'button', class: 'chip', 'data-text': p[0], onclick: function () {
        UI.safe('بيعمل أنيميشن', function () { return S().textAnimate({ preset: p[0], by: o.by, duration: o.duration, start: o.start }).then(function (r) { ok(p[1] + ' على ' + r.layers + ' لير ✓'); }); });
      } }, p[1]); }));
      view.appendChild(UI.card('أنيميشن للكلام (Text Animators)',
        UI.row(h('label', null, 'بيظهر'), UI.seg([{ value: 'chars', label: 'حرف حرف' }, { value: 'words', label: 'كلمة كلمة' }, { value: 'lines', label: 'سطر سطر' }], o.by, function (v) { o.by = v; })),
        UI.field('المدة', UI.slider(0.2, 4, 0.1, o.duration, function (v) { return v.toFixed(1) + 's'; }, function (v) { o.duration = v; })),
        UI.row(h('label', null, 'يبدأ'), UI.seg([{ value: 'in', label: 'من أول اللير' }, { value: 'now', label: 'عند المؤشر' }], o.start, function (v) { o.start = v; })),
        g, UI.hint('بيضيف Text Animator حقيقي (Range Selector بكي فريمز) — بيشتغل مع العربي والإنجليزي.')));
      var lt = { name: '', title: '', color: '#EA580C', accent: '#FBBF24', side: 'left', duration: 5 };
      var nm = h('input', { class: 'grow', placeholder: 'الاسم' }), tt = h('input', { class: 'grow', placeholder: 'المسمّى / الوصف' });
      view.appendChild(UI.card('لوور ثيرد في ثانية',
        UI.row(nm), UI.row(tt),
        UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: lt.color, oninput: function (e) { lt.color = e.target.value; } }), h('input', { type: 'color', value: lt.accent, oninput: function (e) { lt.accent = e.target.value; } }),
          UI.seg([{ value: 'left', label: 'شمال' }, { value: 'right', label: 'يمين' }], lt.side, function (v) { lt.side = v; })),
        UI.field('المدة', UI.slider(2, 12, 0.5, lt.duration, function (v) { return v + 's'; }, function (v) { lt.duration = v; })),
        UI.row(action('اعمل اللوور ثيرد', 'بيعمل لوور ثيرد', function () {
          return S().lowerThird({ name: nm.value || 'الاسم', title: tt.value || 'المسمّى', color: lt.color, accent: lt.accent, side: lt.side, duration: lt.duration }).then(function () { ok('اللوور ثيرد اتعمل عند المؤشر ✓ — لو عجبك احفظه كقالب'); });
        }, 'primary')), UI.hint('ليرز عادية تتعدّل (بار + خط + اسم + مسمّى) بحركة دخول وخروج.')));
      var shp = { color: '#F97316' };
      view.appendChild(UI.card('أشكال',
        UI.row(h('label', null, 'اللون'), h('input', { type: 'color', value: shp.color, oninput: function (e) { shp.color = e.target.value; } })),
        chips([['box', 'بوكس'], ['circle', 'دايرة'], ['ring', 'حلقة'], ['line', 'خط']].map(function (k) {
          return h('button', { type: 'button', class: 'chip', onclick: function () { UI.safe('بيعمل شكل', function () { return S().addShape({ kind: k[0], color: shp.color }).then(function () { ok(k[1] + ' ✓'); }); }); } }, k[1]);
        }))));
    }
  });

  /* ——— إكسبريشنز بضغطة ——— */
  EF.tabs.push({
    id: 'expr', label: 'إكسبريشن', title: 'إكسبريشنز بضغطة',
    render: function (view) {
      var list = [['wiggle', 'Wiggle (اهتزاز)', 'بسلايدرز للسرعة والقوة'], ['bounce', 'Bounce (ارتداد)', 'بعد آخر كي فريم يرتد ويهدى'], ['loopCycle', 'Loop', 'يكرر الكي فريمز'], ['loopPingpong', 'رايح جاي', 'يكرر رايح جاي'],
        ['autoFade', 'فيد تلقائي', 'ظهور واختفاء مع أول وآخر اللير'], ['float', 'طفو', 'طالع نازل بهدوء'], ['spin', 'لف مستمر', 'درجات في الثانية'], ['flicker', 'فليكر', 'رعشة في الشفافية'], ['typewriter', 'آلة كاتبة', 'للكلام: حرف حرف بسرعة']];
      var g = h('div', { class: 'list' });
      list.forEach(function (x) {
        g.appendChild(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, x[1]), h('div', { class: 'hint' }, x[2])),
          action('حط', 'بيحط الإكسبريشن', function () { return S().addExpression({ kind: x[0] }).then(function (r) { ok(x[1] + ' على ' + r.applied + ' خاصية ✓' + (r.skipped ? ' (' + r.skipped + ' من غير كي فريمز اتسابت)' : '')); }); }, 'primary small')));
      });
      view.appendChild(UI.card(null, UI.hint('اختار الخاصية في التايملاين (أو اللير كله) ودوس "حط". كل إكسبريشن بيضيف سلايدرز على اللير تتحكم فيها من غير ما تكتب كود.'), g));
    }
  });

  /* ——— ثري دي ——— */
  EF.tabs.push({
    id: '3d', label: 'ثري دي', title: 'ثري دي',
    render: function (view) {
      var o = { duration: 5, amount: 1, depth: 300, extrude: 40 };
      view.appendChild(UI.card('كاميرا جاهزة',
        UI.field('المدة', UI.slider(1, 20, 0.5, o.duration, function (v) { return v + 's'; }, function (v) { o.duration = v; })),
        UI.field('القوة', UI.slider(0.2, 3, 0.1, o.amount, function (v) { return v.toFixed(1) + 'x'; }, function (v) { o.amount = v; })),
        chips([['push', 'دخول بطيء'], ['orbit', 'لف حوالين'], ['dolly', 'ماشية جنب'], ['float', 'كاميرا في الإيد']].map(function (k) {
          return h('button', { type: 'button', class: 'chip', 'data-cam': k[0], onclick: function () { UI.safe('بيعمل كاميرا', function () { return S().cameraRig({ kind: k[0], duration: o.duration, amount: o.amount }).then(function () { ok('الكاميرا جاهزة ✓ (الحركة على "EF Camera Rig")'); }); }); } }, k[1]);
        })), UI.hint('كاميرا على نل (Rig): الحركة على النل، والكاميرا نفسها سهلة تظبطها. الليرز لازم تبقى 3D عشان تتأثر.')));
      view.appendChild(UI.card('عمق (بارالاكس)',
        UI.field('المسافة بين الليرز', UI.slider(50, 1500, 10, o.depth, function (v) { return v + 'px'; }, function (v) { o.depth = v; })),
        UI.row(action('وزّع المختار في العمق', 'بيعمل عمق', function () { return S().parallax({ depth: o.depth }).then(function (r) { ok(r.layers + ' لير في العمق ✓ — حرّك الكاميرا تشوف البارالاكس'); }); }, 'primary small'),
          action('إضاءة جاهزة', 'بيعمل إضاءة', function () { return S().lightRig().then(function (r) { ok('إضاءة + ظلال على ' + r.casting + ' لير ✓'); }); })),
        UI.hint('كل لير بيتكبّر على قد بعده عشان يفضل بنفس الحجم قدام الكاميرا.')));
      view.appendChild(UI.card('كلام وأشكال ثري دي',
        UI.field('السُمك', UI.slider(5, 300, 5, o.extrude, function (v) { return v + 'px'; }, function (v) { o.extrude = v; })),
        UI.row(action('اعمل المختار ثري دي', 'بيعمل ثري دي', function () { return S().extrude({ depth: o.extrude }).then(function (r) { ok(r.layers + ' لير ثري دي ✓ (' + r.renderer + ')'); }); }, 'primary small')),
        UI.hint('بيشغّل Advanced 3D (أو Cinema 4D) ويدّي الكلام/الأشكال سُمك حقيقي.')));
    }
  });

  /* ——— الروتين: ريندر لبريمير، تنضيف، ألوان ——— */
  EF.tabs.push({
    id: 'routine', label: 'الروتين', title: 'الروتين',
    render: function (view) {
      var r = { template: 'h264', ame: false };
      view.appendChild(UI.card('ريندر وابعته لبريمير',
        UI.row(UI.seg([{ value: 'h264', label: 'MP4 عادي' }, { value: 'alpha', label: 'شفاف (ProRes 4444)' }, { value: 'prores', label: 'ProRes' }], r.template, function (v) { r.template = v; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', onchange: function (e) { r.ame = e.target.checked; } }), ' من Media Encoder (الأفتر يفضل فاضي)')),
        UI.row(action('ريندر الكومب', 'بيرندر', function () { return S().render(r).then(function (x) { ok((x.ame ? 'اتبعت لـ Media Encoder' : 'اترندر') + ' ✓ — هتلاقيه في بريمير: جرافيك ← قوالبي ← من أفتر'); }); }, 'primary')),
        UI.hint('بيتحفظ في "EditFast Renders" جنب المشروع.')));
      var pal = h('div'), map = {};
      view.appendChild(UI.card('بدّل الألوان في الكومب كله',
        UI.row(action('اقرا الألوان', 'بيقرا الألوان', function () {
          return S().paletteRead().then(function (res) {
            UI.empty(pal); map = {};
            if (!res.colors.length) { pal.appendChild(UI.hint('مفيش ألوان أشكال أو كلام هنا.')); return; }
            res.colors.slice(0, 12).forEach(function (c) {
              pal.appendChild(h('div', { class: 'item' }, h('i', { class: 'sw', style: { background: c.hex } }), h('span', { class: 'ltr grow' }, c.hex + ' ×' + c.count),
                h('input', { type: 'color', value: c.hex, oninput: function (e) { map[c.hex] = e.target.value; } })));
            });
          });
        }), action('طبّق', 'بيغيّر الألوان', function () { return S().paletteApply(map).then(function (x) { ok(x.changed + ' لون اتغيّر ✓'); }); }, 'primary small')), pal));
      view.appendChild(UI.card('نضّف المشروع',
        UI.row(action('شيل اللي مش مستخدم ورتّب', 'بينضّف', function () { return S().cleanup({ removeUnused: true, organize: true }).then(function (x) { ok('اتشال ' + x.removed + ' ملف واترتّب ' + x.moved + ' ✓'); }); }, 'primary small')),
        UI.hint('الفوتيج اللي مش مستخدم بيطلع من المشروع (الملفات على الجهاز مابتتمسحش)، والباقي بيتقسم فولدرات: Comps / Footage / Audio / Images / Solids.')));
    }
  });

  /* ——— مساعد الموشن ——— */
  EF.tabs.push({
    id: 'ai', label: 'المساعد', title: 'مساعد الموشن',
    render: function (view) {
      var q = h('textarea', { rows: 3, placeholder: 'مثلًا: اعمل لوور ثيرد باسم أحمد محمد بلون برتقالي، وبعدين خلّي الكلام المختار يظهر كلمة كلمة، وكاميرا داخلة بهدوء' });
      var plan = null, box = h('div');
      function draw() {
        UI.empty(box); if (!plan) return;
        if (!plan.steps.length) { box.appendChild(UI.hint(plan.note || 'مافهمتش أعمل إيه — وصّف أكتر')); return; }
        var l = h('div', { class: 'list' });
        plan.steps.forEach(function (s, i) { l.appendChild(h('div', { class: 'item' }, h('span', { class: 't' }, String(i + 1)), h('b', { class: 'ltr' }, s.action), h('span', { class: 'grow hint' }, s.why))); });
        box.appendChild(l);
        if (plan.note) box.appendChild(UI.hint(plan.note));
        box.appendChild(UI.row(action('نفّذ', 'بينفّذ', function () { return S().aiRun(plan.steps).then(function (r) { ok(r.done.length + ' خطوة اتعملت' + (r.failed.length ? ' — ' + r.failed.length + ' مانفعتش: ' + r.failed[0].error : '') + ' ✓'); plan = null; draw(); }); }, 'primary')));
      }
      view.appendChild(UI.card('قول عايز إيه',
        UI.hint('اكتب الحركة اللي في دماغك: بيحوّلها لخطوات من أدوات EditFast وتشوفها قبل ما تتنفّذ. كل خطوة Undo لوحدها (Ctrl+Z).'),
        q, UI.modelPicker('motion_ai'),
        UI.row(action('اعمل الخطة', 'بيفكّر', function () { return S().aiPlan(q.value).then(function (r) { plan = r; draw(); }); }, 'primary')), box));
    }
  });

  /* ——— المونتير الذكي: وصف / ريفرانس → مشهد بليرز وكي فريمز، ومونتاج لوحده ——— */
  var chat = [], refs = [], where = 'auto', review = true, lib = { id: null, p: {} }, ed = { files: [], music: null, style: 'energetic', ratio: '16:9', duration: 0, brief: '' };
  function base(f) { return String(f).split(/[\\/]/).pop(); }
  function summary(r) {
    var x = r && r.result || r || {};
    var t = x.layers !== undefined ? x.layers + ' لير' + (x.keys ? ' · ' + x.keys + ' كي فريم' : '') + (x.comp ? ' في "' + x.comp + '"' : '') : x.done !== undefined ? x.done + ' تعديل' + (x.missing && x.missing.length ? ' (مش لاقي: ' + x.missing.join('، ') + ')' : '') : '';
    var w = (x.warnings || []).concat(x.skipped || []);
    return t + (w.length ? ' — ⚠ اتساب: ' + w.slice(0, 3).join('، ') + (w.length > 3 ? ' (+' + (w.length - 3) + ')' : '') : '');
  }
  EF.tabs.push({
    id: 'director', label: 'المونتير', title: 'المونتير الذكي',
    render: function (view) {
      var log = h('div', { class: 'chat' }), q = h('textarea', { rows: 3, placeholder: 'مثلًا: إنترو 5 ثواني، لوجو بيلف ويظهر بجلو برتقالي، تحته اسم القناة حرف حرف، وخلفية غامقة فيها دواير بتتحرك ببطء' });
      var refBox = h('div', { class: 'chips' }), live = h('p', { class: 'hint' });
      function drawLog() {
        UI.empty(log);
        if (!chat.length) log.appendChild(UI.hint('وصّف المشهد بالمصري — بيبني ليرز وكي فريمز حقيقية في كومب جديد، وبعدها قولّه "كبّر العنوان" أو "خلّيها أبطأ" أو "غيّر اللون لأزرق" ويعدّل على نفس الليرز.'));
        chat.forEach(function (m) {
          log.appendChild(h('div', { class: 'msg ' + m.who }, h('div', null, m.text), m.ref ? h('div', { class: 'hint' }, '🔍 ' + m.ref) : null, m.info ? h('div', { class: 'hint' }, m.info) : null));
        });
        log.scrollTop = log.scrollHeight;
      }
      function drawRefs() {
        UI.empty(refBox);
        refs.forEach(function (f, i) { refBox.appendChild(h('span', { class: 'chip' }, h('bdi', null, base(f)), h('button', { type: 'button', class: 'x', onclick: function () { refs.splice(i, 1); drawRefs(); } }, '×'))); });
      }
      var send = action('ابعت', 'المونتير بيشتغل', function () {
        var text = q.value.trim();
        if (!text && !refs.length) throw new Error('اكتب المشهد اللي عايزه');
        chat.push({ who: 'user', text: text || 'اعمل زي الريفرانس', info: refs.length ? '📎 ' + refs.map(base).join('، ') : '' });
        drawLog();
        var r0 = refs.slice();
        return S().director({ message: text, refs: r0, where: where, review: review, onStep: function (m) { live.textContent = m; } }).then(function (r) {
          live.textContent = '';
          var rv = r.review || {};
          chat.push({ who: 'ai', text: r.say || (r.action === 'edit' ? 'عدّلت ✓' : 'المشهد جاهز ✓'), ref: r.reference, info: summary(r) + (rv.fixed ? ' · 🔁 راجع وصلّح ' + rv.fixed + ': ' + (rv.say || '') : rv.ok && rv.say ? ' · ✓ ' + rv.say : '') });
          q.value = ''; refs = []; drawRefs(); drawLog();
          ok(r.action === 'edit' ? 'اتعدّل ✓' : 'المشهد اتبنى ✓');
        }, function (e) { live.textContent = ''; chat.push({ who: 'ai', text: '✗ ' + e.message }); drawLog(); throw e; });
      }, 'primary');
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send.click(); });
      view.appendChild(UI.card('قولّه المشهد',
        log, live, q, refBox,
        UI.row(UI.seg([{ value: 'auto', label: 'هو يقرر' }, { value: 'new', label: 'كومب جديد' }, { value: 'here', label: 'في الكومب المفتوح' }], where, function (v) { where = v; }),
          UI.btn('📎 ريفرانس', function () { var f = EF.pickFiles('صور أو فيديو ريفرانس', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm', 'mkv']); if (f && f.length) { refs = refs.concat(f).slice(0, 6); drawRefs(); } }, 'small')),
        UI.row(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: review, 'data-review': '1', onchange: function (e) { review = e.target.checked; } }), ' يراجع شغله ويصلّحه (بيشوف فريمات من اللي عمله)')),
        UI.modelPicker('motion_ai'),
        UI.row(send, UI.btn('محادثة جديدة', function () { chat = []; S().directorReset(); drawLog(); }, 'small ghost')),
        UI.hint('بيعمل: كلام وأشكال وأيقونات SVG وخطوط بتترسم (Trim Paths) وماسكات وTrack Matte وجرادينت وRepeater وMorph وبري كومب وparticles وكاميرا ثري دي وأي إفكت متسطب (حتى البلاجنز زي Saber). الريفرانس: صورة أو فيديو (بياخد منه 8 لقطات بتوقيتها وإيقاع القطعات) — بيحلّل الألوان والخط والتكوين والحركة ويعمل مشهد قريب منه. كل مشهد أو تعديل Undo واحد (Ctrl+Z). الـ AI بيكتب وصف المشهد بس — الإضافة هي اللي بتبني الليرز، ومفيش كود بيتشغّل.')));
      drawLog(); drawRefs();

      // pro scenes, ready to customise
      var grid = h('div', { class: 'chips' }), fields = h('div');
      function drawFields() {
        UI.empty(fields);
        var sc = S().sceneLibrary().filter(function (x) { return x.id === lib.id; })[0];
        if (!sc) return;
        var lab = { title: 'الكلام', subtitle: 'السطر التاني', color: 'اللون', file: 'لوجو' };
        sc.fields.forEach(function (f) {
          if (f === 'color') fields.appendChild(UI.field(lab[f], h('input', { type: 'color', value: lib.p.color || '#f97316', oninput: function (e) { lib.p.color = e.target.value; } })));
          else if (f === 'file') fields.appendChild(UI.row(UI.btn(lib.p.file ? base(lib.p.file) : 'اختار لوجو (اختياري)', function () { var x = EF.pickFile('اللوجو', ['png', 'svg', 'ai', 'psd', 'jpg']); if (x) { lib.p.file = x; drawFields(); } }, 'small')));
          else fields.appendChild(UI.field(lab[f], h('input', { class: 'grow', 'data-f': f, value: lib.p[f] || '', oninput: function (e) { lib.p[f] = e.target.value; } })));
        });
        fields.appendChild(UI.row(action('اعمل المشهد', 'بيبني المشهد', function () { return S().libraryScene(lib.id, lib.p).then(function (r) { ok(sc.name + ' — ' + summary(r) + ' ✓'); }); }, 'primary')));
      }
      S().sceneLibrary().forEach(function (sc) {
        grid.appendChild(h('button', { type: 'button', class: 'chip', 'data-scene': sc.id, onclick: function () { lib = { id: sc.id, p: {} }; Array.prototype.forEach.call(grid.children, function (b) { b.classList.toggle('on', b.dataset.scene === sc.id); }); drawFields(); } }, sc.name));
      });
      view.appendChild(UI.card('مشاهد احترافية جاهزة', UI.hint('اختار مشهد، اكتب كلامك ولونك — بيتبني ليرز عادية بحركة متظبطة تعدّل عليها.'), grid, fields));

      // the whole edit, alone
      var info = h('p', { class: 'hint' }), stepTxt = h('p', { class: 'hint' });
      function drawInfo() { info.textContent = (ed.files.length ? ed.files.length + ' ملف' : 'مفيش فيديوهات') + ' · ' + (ed.music ? '🎵 ' + base(ed.music) : 'من غير مزيكا'); }
      var brief = h('input', { class: 'grow', placeholder: 'البريف (اختياري): إعلان لمطعم، كلام حماسي، اسم البراند…', value: ed.brief, oninput: function (e) { ed.brief = e.target.value; } });
      view.appendChild(UI.card('منتج الفيديو لوحده',
        UI.hint('اختار اللقطات والمزيكا والستايل: بيشوف اللقطات ويرتبها ويختار أحلى لحظة في كل واحدة، يقطع على البيت، ويحط ترانزيشن وزووم وعناوين — كله ليرز في كومب جديد تعدّل عليها.'),
        UI.row(UI.btn('اختار الفيديوهات/الصور', function () { var f = EF.pickFiles('اللقطات', ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'png', 'jpg', 'jpeg']); if (f && f.length) { ed.files = f; drawInfo(); } }, 'small'),
          UI.btn('🎵 مزيكا', function () { var f = EF.pickFile('المزيكا', ['mp3', 'wav', 'm4a', 'aac']); if (f) { ed.music = f; drawInfo(); } }, 'small')), info,
        UI.row(h('label', null, 'الستايل'), UI.seg(S().editStyles().map(function (x) { return { value: x.id, label: x.name }; }), ed.style, function (v) { ed.style = v; })),
        UI.row(h('label', null, 'المقاس'), UI.seg([{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' }], ed.ratio, function (v) { ed.ratio = v; })),
        UI.field('المدة', UI.slider(0, 120, 5, ed.duration, function (v) { return v ? v + 's' : 'زي المزيكا'; }, function (v) { ed.duration = v; })),
        UI.row(brief),
        UI.row(action('منتج', 'بيمنتج', function () {
          return S().autoEdit({ files: ed.files, music: ed.music, style: ed.style, ratio: ed.ratio, duration: ed.duration, brief: ed.brief, onStep: function (m) { stepTxt.textContent = m; } }).then(function (r) {
            stepTxt.textContent = r.cuts + ' قطع' + (r.bpm ? ' على ' + Math.round(r.bpm) + ' BPM' : '') + (r.note ? ' — ' + r.note : '');
            ok('المونتاج جاهز في "' + r.comp + '" ✓');
          });
        }, 'primary')), stepTxt));
      drawInfo();
    }
  });

  /* ——— مكتبتي (نفس مكتبة بريمير) ——— */
  EF.tabs.push({
    id: 'library', label: 'مكتبتي', title: 'مكتبتي',
    render: function (view) {
      var q = h('input', { class: 'grow', placeholder: 'دوّر… (whoosh، light leak، overlay)' }), list = h('div', { class: 'list' });
      function draw() {
        UI.empty(list);
        var items = S().librarySearch({ q: q.value }).filter(function (x) { return x.ext !== 'mogrt' && x.ext !== 'prfpset'; }).slice(0, 200);
        if (!items.length) { list.appendChild(UI.hint('المكتبة فاضية أو مفيش حاجة بالاسم ده — المكتبة واحدة مع بريمير، ضيف فولداتك من هناك.')); return; }
        items.forEach(function (it) {
          list.appendChild(h('div', { class: 'item click', ondblclick: function () { place(it); } }, h('span', { class: 'grow' }, h('bdi', null, it.name)), h('span', { class: 'hint ltr' }, it.ext + (it.duration ? ' · ' + it.duration.toFixed(1) + 's' : '')),
            UI.btn('＋', function () { place(it); }, 'small')));
        });
      }
      function place(it) { UI.safe('بيحط', function () { return S().libraryPlace({ id: it.id }).then(function () { ok(it.name + ' اتحط ✓'); }); }); }
      q.addEventListener('input', draw);
      view.appendChild(UI.card(null, UI.row(q), UI.hint('دبل كليك أو ＋ يحطه في الكومب عند المؤشر.'), list));
      draw();
    }
  });

  /* ——— الإعدادات ——— */
  EF.tabs.push({
    id: 'settings', label: 'الإعدادات', title: 'الإعدادات',
    render: function (view) {
      var key = h('input', { class: 'grow ltr', type: 'password', value: S().settings.keys.openrouter || '', placeholder: 'sk-or-…' });
      var out = h('pre', { class: 'ltr hint' });
      view.appendChild(UI.card('مفتاح OpenRouter (لمساعد الموشن)', UI.row(key, action('احفظ', 'بيحفظ', function () { S().saveSettings({ keys: { openrouter: key.value.trim() } }); ok('اتحفظ ✓ (نفس مفتاح بريمير)'); })),
        UI.hint('المفاتيح والمكتبة والإعدادات واحدة مع EditFast في بريمير.')));
      var conn = h('div', { class: 'hint' });
      function drawConn() {
        UI.empty(conn);
        conn.appendChild(h('div', null, 'السكريبت: ', h('b', { class: 'ltr' }, EF.hostLoaded === true ? 'اتحمّل ✓' : EF.hostLoaded ? String(EF.hostLoaded) : 'لسه')));
        if (EF.aeError) conn.appendChild(h('div', { class: 'err' }, EF.aeError));
        if (EF.aeInfo) conn.appendChild(h('div', null, 'After Effects ' + EF.aeInfo.version + (EF.aeInfo.canWrite === false ? ' — ⚠️ فعّل "Allow Scripts to Write Files and Access Network"' : ' — الكتابة مسموحة ✓')));
      }
      drawConn();
      view.appendChild(UI.card('الاتصال بالأفتر', conn, UI.row(action('اتصل تاني', 'بيتصل', function () { return EF.connect().then(drawConn); })),
        UI.hint('لو مش متصل: اقفل اللوحة وافتحها، واتأكد إن Settings ← Scripting & Expressions ← "Allow Scripts to Write Files and Access Network" متعلّمة.')));
      view.appendChild(UI.card('فحص الأفتر', UI.row(action('افحص', 'بيفحص', function () { return S().selfTest().then(function (r) { out.textContent = JSON.stringify(r, null, 1); }); })), out,
        UI.hint('فولدر القوالب: ' + S().templatesDir())));
    }
  });
})();

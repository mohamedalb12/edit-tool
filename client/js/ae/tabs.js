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
        ['autoFade', 'فيد تلقائي', 'ظهور واختفاء مع أول وآخر اللير'], ['float', 'طفو', 'طالع نازل بهدوء'], ['spin', 'لف مستمر', 'درجات في الثانية'], ['flicker', 'فليكر', 'رعشة في الشفافية'], ['typewriter', 'آلة كاتبة', 'للكلام: حرف حرف بسرعة'], ['squash', 'Squash & Stretch', 'بيتمط ويتكبس مع سرعة الحركة'], ['pendulum', 'بندول', 'بيتمرجح ويهدى (لافتات، حاجات متعلقة)']];
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
      var r = { template: 'h264', ame: false }, gap = 0;
      var al = h('div', { class: 'chips' });
      [['left', '⇤ شمال'], ['hcenter', '↔ نص'], ['right', 'يمين ⇥'], ['top', '⤒ فوق'], ['vcenter', '↕ نص'], ['bottom', 'تحت ⤓'], ['distH', 'وزّع أفقي'], ['distV', 'وزّع رأسي']].forEach(function (x) {
        al.appendChild(h('button', { type: 'button', class: 'chip', 'data-align': x[0], onclick: function () { UI.safe('بيحاذي', function () { return S().alignLayers({ mode: x[0], to: /^dist/.test(x[0]) ? 'selection' : alignTo }).then(function (q) { ok(q.layers + ' لير ✓'); }); }); } }, x[1]));
      });
      var alignTo = 'comp';
      view.appendChild(UI.card('أدوات الشغل اليومي',
        UI.row(h('label', null, 'حاذي على'), UI.seg([{ value: 'comp', label: 'الكومب' }, { value: 'selection', label: 'المختار' }], alignTo, function (v) { alignTo = v; })), al,
        UI.field('ورا بعض في الوقت', UI.slider(-30, 30, 1, gap, function (v) { return (v > 0 ? '+' : '') + v + ' فريم'; }, function (v) { gap = v; })),
        UI.row(action('رتّبهم ورا بعض', 'بيرتّب', function () { return S().sequenceLayers({ gap: gap }).then(function (q) { ok(q.layers + ' لير ورا بعض ✓'); }); }),
          action('فصّل الشيب لليرز', 'بيفصل', function () { return S().explodeShapes().then(function (q) { ok(q.layers + ' لير جديد ✓ (الأصلي اتقفل)'); }); }),
          action('كنترول واحد لكل الألوان', 'بيربط الألوان', function () { return S().colorRig().then(function (q) { ok(q.colors.length + ' لون على "EF Colors" — غيّر اللون مرة يتغيّر في ' + q.linked + ' مكان ✓'); }); })),
        UI.hint('زي Motion Tools وExplode Shape Layers وRay Dynamic Color: محاذاة، توزيع، ترتيب في الوقت، تفصيل جروبات الشيب، ولوحة ألوان واحدة للكومب كله.')));
      var mf = { sizes: ['16:9', '9:16', '1:1'], fit: 'blur', render: true };
      var sizeBox = h('div', { class: 'chips' });
      ['16:9', '9:16', '1:1', '4:5', '4:3'].forEach(function (z) { sizeBox.appendChild(h('button', { type: 'button', class: 'chip' + (mf.sizes.indexOf(z) >= 0 ? ' on' : ''), 'data-size': z, onclick: function (e) { var i = mf.sizes.indexOf(z); if (i >= 0) mf.sizes.splice(i, 1); else mf.sizes.push(z); e.currentTarget.classList.toggle('on', i < 0); } }, z)); });
      view.appendChild(UI.card('ريندر كل المقاسات بضغطة',
        UI.hint('الكومب المفتوح بيتعمل منه كومب لكل مقاس، وبيترندروا كلهم ورا بعض ويروحوا لبريمير.'), sizeBox,
        UI.row(h('label', null, 'المحتوى'), UI.seg([{ value: 'blur', label: 'كامل فوق خلفية بلور' }, { value: 'fill', label: 'يملا الكادر' }, { value: 'fit', label: 'كامل بحواف' }], mf.fit, function (v) { mf.fit = v; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: true, onchange: function (e) { mf.render = e.target.checked; } }), ' رندر على طول')),
        UI.row(action('اعمل المقاسات', 'بيعمل المقاسات', function () { return S().multiFormat(mf).then(function (r) { ok(r.comps.length + ' مقاس ✓' + (mf.render ? ' — في EditFast Renders' : '')); }); }, 'primary'))));
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
  var drawFavs = function () {};
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
          log.appendChild(h('div', { class: 'msg ' + m.who }, h('div', null, m.text), m.ref ? h('div', { class: 'hint' }, '🔍 ' + m.ref) : null, m.info ? h('div', { class: 'hint' }, m.info) : null,
            m.canFav ? h('button', { type: 'button', class: 'fav-btn' + (m.faved ? ' on' : ''), title: 'عجبني — احفظه في ستايلي', onclick: function () { if (m.faved) return; try { S().favSave({ prompt: m.prompt }); m.faved = true; drawLog(); drawFavs(); ok('اتحفظ في ستايلك ✓ — المونتير هيقلّده بعد كده'); } catch (e) { UI.toast(e.message, true); } } }, m.faved ? '❤ اتحفظ' : '♡ عجبني') : null));
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
          chat.push({ who: 'ai', canFav: r.action !== 'edit', prompt: text, text: r.say || (r.action === 'edit' ? 'عدّلت ✓' : 'المشهد جاهز ✓'), ref: r.reference, info: summary(r) + (rv.fixed ? ' · 🔁 راجع وصلّح ' + rv.fixed + ': ' + (rv.say || '') : rv.ok && rv.say ? ' · ✓ ' + rv.say : '') });
          q.value = ''; refs = []; drawRefs(); drawLog();
          ok(r.action === 'edit' ? 'اتعدّل ✓' : 'المشهد اتبنى ✓');
        }, function (e) { live.textContent = ''; chat.push({ who: 'ai', text: '✗ ' + e.message }); drawLog(); throw e; });
      }, 'primary');
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send.click(); });
      view.appendChild(UI.card('قولّه المشهد',
        log, live, q, refBox,
        UI.row(UI.seg([{ value: 'auto', label: 'هو يقرر' }, { value: 'new', label: 'كومب جديد' }, { value: 'here', label: 'في الكومب المفتوح' }], where, function (v) { where = v; }),
          UI.btn('🔗 لينك', function () { var u = window.prompt('لينك يوتيوب / إنستجرام / تيك توك للريفرانس'); if (u && /^https?:\/\//.test(u.trim())) { refs = refs.concat([u.trim()]).slice(0, 6); drawRefs(); } }, 'small'),
          UI.btn('📎 ريفرانس', function () { var f = EF.pickFiles('صور أو فيديو ريفرانس', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm', 'mkv']); if (f && f.length) { refs = refs.concat(f).slice(0, 6); drawRefs(); } }, 'small')),
        UI.row(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: review, 'data-review': '1', onchange: function (e) { review = e.target.checked; } }), ' يراجع شغله ويصلّحه (بيشوف فريمات من اللي عمله)')),
        UI.modelPicker('motion_ai'),
        UI.row(send, UI.btn('محادثة جديدة', function () { chat = []; S().directorReset(); drawLog(); }, 'small ghost')),
        UI.hint('بيعمل: كلام وأشكال وأيقونات SVG وخطوط بتترسم (Trim Paths) وماسكات وTrack Matte وجرادينت وRepeater وMorph وبري كومب وparticles وكاميرا ثري دي وأي إفكت متسطب (حتى البلاجنز زي Saber). الريفرانس: صورة أو فيديو (بياخد منه 8 لقطات بتوقيتها وإيقاع القطعات) — بيحلّل الألوان والخط والتكوين والحركة ويعمل مشهد قريب منه. كل مشهد أو تعديل Undo واحد (Ctrl+Z). الـ AI بيكتب وصف المشهد بس — الإضافة هي اللي بتبني الليرز، ومفيش كود بيتشغّل.')));
      drawLog(); drawRefs();

      // pro scenes, ready to customise
      var grid, fields = h('div');
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
      var scenes = S().sceneLibrary();
      grid = previewGrid('scene', scenes, lib.id, function (id) { lib = { id: id, p: {} }; drawFields(); });
      Array.prototype.forEach.call(grid.children, function (b, i) { b.setAttribute('data-scene', scenes[i].id); });
      view.appendChild(UI.card('مشاهد احترافية جاهزة', UI.hint('اختار مشهد، اكتب كلامك ولونك — بيتبني ليرز عادية بحركة متظبطة تعدّل عليها. عدّي بالماوس على أي مشهد تشوف حركته.'), grid, fields,
        UI.row(previewButton('scene', scenes.map(function (x) { return x.id; }), function () { EF.show('director'); }))));
      if (lib.id) drawFields();

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

      // your style: scenes you liked (the director imitates them)
      var favBox = h('div', { class: 'list' });
      drawFavs = function () {
        UI.empty(favBox);
        var list = S().favList();
        if (!list.length) { favBox.appendChild(UI.hint('دوس "♡ عجبني" على أي مشهد عمله المونتير وهيتحفظ هنا — وبعد كده المونتير بيقلّد ستايلك (الألوان، الخطوط، الحركة) في كل مشهد جديد.')); return; }
        list.forEach(function (f) {
          favBox.appendChild(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, f.name), h('div', { class: 'hint' }, f.summary)),
            UI.btn('اعمل زيه', function () { UI.safe('بيبني', function () { return S().favUse(f.id).then(function () { ok('✓'); }); }); }, 'small'),
            UI.btn('×', function () { S().favRemove(f.id); drawFavs(); }, 'small ghost')));
        });
      };
      view.appendChild(UI.card('ستايلي (المونتير بيتعلّم منه)', favBox));
      drawFavs();

      var kn = { style: 'pop', color: '#ffffff', accent: '#f97316', upper: false }, knStep = h('p', { class: 'hint' });
      var kstyles = S().kitInfo().kinetic;
      view.appendChild(UI.card('كلام متحرك مع الصوت (Kinetic Typography)',
        UI.hint('اختار صوت أو فيديو فيه كلام: بيتفرّغ على جهازك (Whisper) وكل كلمة بتظهر في نفس لحظة ما بتتقال — عربي من اليمين، والكلمة الحالية ممكن تنوّر.'),
        UI.row(UI.seg(kstyles.map(function (x) { return { value: x.id, label: x.name }; }), kn.style, function (v) { kn.style = v; })),
        UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: kn.color, oninput: function (e) { kn.color = e.target.value; } }), h('input', { type: 'color', value: kn.accent, oninput: function (e) { kn.accent = e.target.value; } })),
        UI.row(action('اختار الصوت واعمله', 'بيفرّغ ويعمل الكلام', function () { var f = EF.pickFile('الصوت / الفيديو', ['wav', 'mp3', 'm4a', 'aac', 'mp4', 'mov']); if (!f) return Promise.resolve(); return S().kinetic({ audio: f, style: kn.style, color: kn.color, accent: kn.accent, onStep: function (m) { knStep.textContent = m; } }).then(function (r) { knStep.textContent = r.words + ' كلمة'; ok('الكلام اتحرّك مع الصوت ✓'); }); }, 'primary')), knStep));

      var va = { brief: '', captions: 'highlight' }, vaStep = h('p', { class: 'hint' });
      view.appendChild(UI.card('صوتك ← فيديو أنيميشن',
        UI.hint('سجّل الإعلان أو الفكرة بصوتك (أو اختار ملف): بيسمعه، ويعمل لكل جملة مشهد بيوضّحها (أيقونات، أرقام، رسوم، كاراكتر…) على توقيت كلامك بالظبط، والكابشن متحرك تحت، وصوتك تحتهم.'),
        h('input', { class: 'grow', placeholder: 'البريف (اختياري): ستايل، ألوان البراند، نوع الجمهور…', oninput: function (e) { va.brief = e.target.value; } }),
        UI.row(h('label', null, 'الكابشن'), UI.seg([{ value: 'highlight', label: 'الكلمة بتنوّر' }, { value: 'pop', label: 'كلمة كلمة' }, { value: '', label: 'من غير' }], va.captions, function (v) { va.captions = v; })),
        UI.row(action('اختار التسجيل واعمل الفيديو', 'بيعمل الفيديو من صوتك', function () { var f = EF.pickFile('التسجيل', ['wav', 'mp3', 'm4a', 'aac', 'mp4', 'mov']); if (!f) return Promise.resolve(); return S().voiceAd({ audio: f, brief: va.brief, captions: va.captions, onStep: function (m) { vaStep.textContent = m; } }).then(function (r) { vaStep.textContent = r.sentences + ' جملة' + (r.say ? ' — ' + r.say : ''); ok('الفيديو اتبنى على صوتك ✓'); }); }, 'primary')), vaStep));
    }
  });

  /* ——— لوجو وثري دي: تتبّع اللوجو، أنيميشن، SVG، مورف، صورة → ثري دي ——— */
  var lg = { file: null, style: 'draw', colors: 0, detail: 3, duration: 5 }, mo = { files: [], dur: 1, hold: 0.6, loop: false }, p3 = { file: null, depthFile: null, slices: 5, move: 'push', strength: 1 };
  EF.tabs.push({
    id: 'studio', label: 'لوجو و3D', title: 'لوجو، مورف، وثري دي',
    render: function (view) {
      var lgInfo = h('p', { class: 'hint' }, lg.file ? base(lg.file) : 'SVG أو PNG / JPG (بيترسم مسارات لوحده)');
      var styles = h('div', { class: 'chips' });
      S().logoStyles().forEach(function (st) { styles.appendChild(h('button', { type: 'button', class: 'chip' + (lg.style === st.id ? ' on' : ''), 'data-style': st.id, title: st.name, onclick: function () { lg.style = st.id; Array.prototype.forEach.call(styles.children, function (b) { b.classList.toggle('on', b.dataset.style === st.id); }); } }, st.name)); });
      view.appendChild(UI.card('أنيميشن لوجو (من أي صورة أو SVG)',
        UI.hint('بيحوّل اللوجو لمسارات حقيقية (Image Trace) بألوانها، وبعدين يحرّكه: يترسم بخط ويتملي، نيون، الأجزاء تتبني، أو ثري دي مجسّم بكاميرا وإضاءة.'),
        UI.row(UI.btn('اختار اللوجو', function () { var f = EF.pickFile('اللوجو', ['svg', 'png', 'jpg', 'jpeg', 'webp']); if (f) { lg.file = f; lgInfo.textContent = base(f); } }, 'small')), lgInfo, styles,
        UI.field('الألوان', UI.slider(0, 8, 1, lg.colors, function (v) { return v ? v + ' ألوان' : 'تلقائي'; }, function (v) { lg.colors = v; })),
        UI.field('التفاصيل', UI.slider(1, 5, 1, lg.detail, function (v) { return ['', 'قليلة', 'ناعمة', 'متوسطة', 'كتير', 'كل حاجة'][v]; }, function (v) { lg.detail = v; })),
        UI.field('المدة', UI.slider(2, 15, 0.5, lg.duration, function (v) { return v + 's'; }, function (v) { lg.duration = v; })),
        UI.row(action('حرّك اللوجو', 'بيحوّل ويحرّك', function () { return S().logoAnimate({ file: lg.file, style: lg.style, colors: lg.colors, detail: lg.detail, duration: lg.duration }).then(function (r) { ok(r.parts + ' جزء · ' + r.paths + ' مسار' + (r.source === 'trace' ? ' (اتعمله Trace)' : '') + ' ✓'); }); }, 'primary'),
          action('حطه شكل ثابت هنا', 'بيحوّل', function () { return S().vectorImport({ file: lg.file, colors: lg.colors, detail: lg.detail }).then(function (r) { ok('اتحط ' + r.layers + ' لير أشكال ✓'); }); }))));

      var moInfo = h('p', { class: 'hint' });
      function moDraw() { moInfo.textContent = mo.files.length ? mo.files.map(base).join(' ← ') : 'من غير ملفات: بيعمل مورف بين الليرز المختارة (أشكال أو كلام) بترتيب اختيارك'; }
      view.appendChild(UI.card('مورف (شكل يتحوّل لشكل)',
        UI.hint('اختار ليرين أو أكتر (أشكال، أيقونات، أو كلام — الكلام بيتحوّل Outlines لوحده) أو لوجوهات من ملفات: بيظبط عدد النقط ويقابلها عشان التحوّل يبقى ناعم، والألوان كمان.'),
        UI.row(UI.btn('من ملفات…', function () { var f = EF.pickFiles('الأشكال بالترتيب', ['svg', 'png', 'jpg', 'jpeg']); if (f && f.length) { mo.files = f; moDraw(); } }, 'small'), UI.btn('من الليرز المختارة', function () { mo.files = []; moDraw(); }, 'small ghost')), moInfo,
        UI.field('مدة التحوّل', UI.slider(0.2, 4, 0.1, mo.dur, function (v) { return v.toFixed(1) + 's'; }, function (v) { mo.dur = v; })),
        UI.field('يثبت قد إيه', UI.slider(0, 4, 0.1, mo.hold, function (v) { return v.toFixed(1) + 's'; }, function (v) { mo.hold = v; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: mo.loop, onchange: function (e) { mo.loop = e.target.checked; } }), ' يرجع لأول شكل (لوب)')),
        UI.row(action('اعمل المورف', 'بيعمل مورف', function () { return S().morph({ files: mo.files, dur: mo.dur, hold: mo.hold, loop: mo.loop }).then(function (r) { ok('مورف ' + r.stages + ' أشكال · ' + r.paths + ' مسار × ' + r.points + ' نقطة ✓'); }); }, 'primary'))));
      moDraw();

      var p3Info = h('p', { class: 'hint' }, p3.file ? base(p3.file) : 'مفيش صورة'), p3Step = h('p', { class: 'hint' });
      view.appendChild(UI.card('صورة → ثري دي',
        UI.hint('صورة عادية تبقى لقطة ثري دي: بيحسب العمق، يقطّعها طبقات بعمقها، ويحطها في 3D بكاميرا بتتحرك (زي 3D Photo). العمق: من fal.ai لو حطيت مفتاحه (أدق)، أو ملف عمق عندك، أو تقدير بالـ AI للموضوع الأساسي.'),
        UI.row(UI.btn('اختار الصورة', function () { var f = EF.pickFile('الصورة', ['jpg', 'jpeg', 'png', 'webp']); if (f) { p3.file = f; p3Info.textContent = base(f); } }, 'small'), UI.btn('ملف عمق (اختياري)', function () { var f = EF.pickFile('خريطة العمق (أبيض = قريب)', ['png', 'jpg']); if (f) { p3.depthFile = f; p3Info.textContent = base(p3.file || '') + ' + ' + base(f); } }, 'small ghost')), p3Info,
        UI.row(h('label', null, 'الحركة'), UI.seg([{ value: 'push', label: 'داخلة' }, { value: 'orbit', label: 'بتلف' }, { value: 'rise', label: 'طالعة' }, { value: 'float', label: 'طافية' }], p3.move, function (v) { p3.move = v; })),
        UI.field('الطبقات', UI.slider(2, 8, 1, p3.slices, function (v) { return v; }, function (v) { p3.slices = v; })),
        UI.field('العمق', UI.slider(0.3, 2.5, 0.1, p3.strength, function (v) { return v.toFixed(1) + 'x'; }, function (v) { p3.strength = v; })),
        UI.row(action('اعملها ثري دي', 'بيعمل الثري دي', function () { return S().photo3D({ file: p3.file, depthFile: p3.depthFile, slices: p3.slices, move: p3.move, strength: p3.strength, onStep: function (m) { p3Step.textContent = m; } }).then(function (r) { p3Step.textContent = r.slices + ' طبقات · العمق: ' + r.depth; ok('اللقطة الثري دي جاهزة ✓'); }); }, 'primary'),
          action('موديل ثري دي حقيقي (fal.ai)', 'بيعمل الموديل', function () { return S().imageTo3DModel({ file: p3.file, onStep: function (m) { p3Step.textContent = m; } }).then(function (r) { p3Step.textContent = base(r.file); ok('الموديل اتحط في كومب ثري دي ✓ (محتاج AE 2024+)'); }); })), p3Step));
      var rotoStep = h('p', { class: 'hint' }), ro = { mode: 'ai', seconds: 10 };
      view.appendChild(UI.card('روتو: افصل الشخص عن الخلفية',
        UI.hint('اختار لير الفيديو وحط المؤشر على البداية. بالـ AI (fal.ai): ماسك لكل فريم ← نسخة من الفيديو مقصوص فيها الشخص فوق الأصل — حط كلام أو جرافيك بينهم يبان "ورا" الشخص. أو Green / Blue Screen بـ Keylight.'),
        UI.row(UI.seg([{ value: 'ai', label: 'AI (أي خلفية)' }, { value: 'green', label: 'Green Screen' }, { value: 'blue', label: 'Blue Screen' }], ro.mode, function (v) { ro.mode = v; })),
        UI.field('لحد', UI.slider(1, 60, 1, ro.seconds, function (v) { return v + 's'; }, function (v) { ro.seconds = v; })),
        UI.row(action('افصل', 'بيعمل روتو', function () { return S().roto({ mode: ro.mode, seconds: ro.seconds, onStep: function (m) { rotoStep.textContent = m; } }).then(function (r) { rotoStep.textContent = r.frames ? r.frames + ' فريم ✓' : ''; ok(r.cutout ? 'الشخص مقصوص في "' + r.cutout + '" ✓' : 'Keylight اتحط ✓'); }); }, 'primary')), rotoStep,
        UI.hint('الـ AI بيتحاسب على كل فريم في fal.ai — جرّب على ثواني قليلة الأول.')));
      var gen = { prompt: '', kind: 'image', ratio: '16:9', removeBg: false }, genStep = h('p', { class: 'hint' });
      view.appendChild(UI.card('صورة / فيديو بالـ AI (fal.ai)',
        h('textarea', { rows: 2, placeholder: 'مثلاً: خلفية أبستراكت برتقالي غامق بإضاءة سينمائية، أو كوباية قهوة على خلفية بيضا', oninput: function (e) { gen.prompt = e.target.value; } }),
        UI.row(UI.seg([{ value: 'image', label: 'صورة' }, { value: 'video', label: 'فيديو (5 ث)' }], gen.kind, function (v) { gen.kind = v; }), UI.seg([{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }], gen.ratio, function (v) { gen.ratio = v; })),
        UI.row(h('label', null, h('input', { type: 'checkbox', onchange: function (e) { gen.removeBg = e.target.checked; } }), ' شيل الخلفية (عنصر PNG)')),
        UI.row(action('اعمل', 'بيولّد', function () { return S().genMedia({ prompt: gen.prompt, kind: gen.kind, ratio: gen.ratio, removeBg: gen.removeBg, onStep: function (m) { genStep.textContent = m; } }).then(function (r) { genStep.textContent = base(r.file); ok('اتحط في الكومب ✓'); }); }, 'primary')), genStep));
    }
  });

  /* ——— تراكينج ——— */
  var tk = { points: [], mode: 'attach', text: '', duration: 0, what: '' };
  EF.tabs.push({
    id: 'track', label: 'تراكينج', title: 'تراكينج',
    render: function (view) {
      var stage = h('div', { class: 'track-stage' }), img = h('img', { alt: '' }), dots = h('div', { class: 'track-dots' }), info = h('p', { class: 'hint' }), step = h('p', { class: 'hint' });
      stage.appendChild(img); stage.appendChild(dots);
      function drawDots() {
        UI.empty(dots);
        tk.points.forEach(function (p, i) { var d = h('span', { class: 'track-dot', title: 'شيل', onclick: function (e) { e.stopPropagation(); tk.points.splice(i, 1); drawDots(); } }, String(i + 1)); d.style.left = (p[0] * 100) + '%'; d.style.top = (p[1] * 100) + '%'; dots.appendChild(d); });
        info.textContent = tk.points.length ? tk.points.length + ' نقطة — ' + (tk.points.length === 1 ? 'مكان بس' : tk.points.length === 4 ? '4 أركان (Corner Pin)' : 'مكان + سكيل + لف') : 'دوس على الصورة عشان تحط نقطة (1 = مكان، 2 = + سكيل ولف، 4 = أركان شاشة)';
      }
      stage.addEventListener('click', function (e) { var r = stage.getBoundingClientRect(); if (!img.src || tk.points.length >= 4) return; tk.points.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]); drawDots(); });
      var load = action('هات الفريم', 'بيجيب الفريم', function () { return S().trackFrame().then(function (r) { img.src = 'data:image/jpeg;base64,' + r.b64; stage.classList.add('on'); tk.points = []; drawDots(); step.textContent = r.src.layer.name + (r.src.others.length ? ' · مختار معاه: ' + r.src.others.map(function (o) { return o.name; }).join('، ') : ''); }); });
      var what = h('input', { class: 'grow', placeholder: 'أو قول عايز تتبّع إيه: الوش، الموبايل، اللافتة…', value: tk.what, oninput: function (e) { tk.what = e.target.value; } });
      var txt = h('input', { class: 'grow', placeholder: 'كلام يمشي مع الحاجة (اختياري)', value: tk.text, oninput: function (e) { tk.text = e.target.value; } });
      view.appendChild(UI.card('تتبّع حاجة في الفيديو',
        UI.hint('اختار لير الفيديو (ومعاه الليرز اللي عايزها تمشي مع الحركة، أو الصورة اللي هتتحط على الشاشة)، حط المؤشر على أول فريم، ودوس "هات الفريم".'),
        UI.row(load), stage, info,
        UI.row(what, action('دوّر عليها بالـ AI', 'بيدوّر', function () { return S().trackFind(tk.what, { corners: tk.mode === 'pin' }).then(function (r) { tk.points = r.points; drawDots(); }); })),
        UI.row(h('label', null, 'بعدها'), UI.seg([{ value: 'attach', label: 'ليرز تمشي معاها' }, { value: 'pin', label: 'شاشة (Corner Pin)' }, { value: 'stabilize', label: 'ثبّت الفيديو' }], tk.mode, function (v) { tk.mode = v; })),
        UI.row(txt),
        UI.field('لحد', UI.slider(0, 30, 0.5, tk.duration, function (v) { return v ? v + 's' : 'آخر اللير'; }, function (v) { tk.duration = v; })),
        UI.row(action('حط على السطح (أرض / حيطة / شاشة)', 'بيحط على السطح', function () {
          var f = EF.pickFile('صورة أو فيديو يتحط على السطح (أو Cancel واكتب كلام فوق)', ['png', 'jpg', 'jpeg', 'mp4', 'mov']);
          return S().surfacePlace({ points: tk.points, file: f || null, text: f ? '' : tk.text, onStep: function (m) { step.textContent = m; } }).then(function (r) { step.textContent = r.frames + ' فريم'; ok('اتلزق على السطح ✓ (عدّل المحتوى جوه "' + r.pinned + '")'); });
        }), action('3D Camera Tracker', 'بيشغّل تراكر الكاميرا', function () { return S().trackCamera().then(function () { ok('الأفتر بيحلّل في الخلفية — بعد ما يخلص: اختار نقط ← كليك يمين ← Create Solid and Camera'); }); })),
        UI.row(action('تراك', 'بيتتبّع', function () { return S().track({ points: tk.points, mode: tk.mode, text: tk.text, duration: tk.duration, onStep: function (m) { step.textContent = m; } }).then(function (r) { step.textContent = r.frames + ' فريم' + (r.lost !== null ? ' — ⚠ التتبّع ضاع عند ' + r.lost + 's من البداية (حط نقطة أوضح وكمّل من هناك)' : ' ✓'); ok('التراكينج خلص ✓'); }); }, 'primary')), step));
      drawDots();
    }
  });

  /* ——— كاراكتر ——— */
  var ch = { name: 'Ali', action: 'walk', colors: { skin: '#f2c29b', shirt: '#f97316', pants: '#1e293b', hair: '#2b1a10' }, walkAcross: false, ik: true, react: 30, link: 'scale' };
  EF.tabs.push({
    id: 'character', label: 'كاراكتر', title: 'كاراكتر أنيميشن',
    render: function (view) {
      var nm = h('input', { class: 'grow', value: ch.name, placeholder: 'اسم الكاراكتر', oninput: function (e) { ch.name = e.target.value; } });
      var acts = h('div', { class: 'chips' });
      S().characterActions().forEach(function (a) { acts.appendChild(h('button', { type: 'button', class: 'chip' + (ch.action === a.id ? ' on' : ''), 'data-act': a.id, onclick: function () { ch.action = a.id; Array.prototype.forEach.call(acts.children, function (b) { b.classList.toggle('on', b.dataset.act === a.id); }); } }, a.name)); });
      var cols = h('div', { class: 'row' });
      [['skin', 'البشرة'], ['shirt', 'التيشيرت'], ['pants', 'البنطلون'], ['hair', 'الشعر']].forEach(function (c) { cols.appendChild(h('label', { title: c[1] }, c[1] + ' ', h('input', { type: 'color', value: ch.colors[c[0]], oninput: function (e) { ch.colors[c[0]] = e.target.value; } }))); });
      view.appendChild(UI.card('كاراكتر جاهز ومتريّج (زي RubberHose)',
        UI.hint('شخصية فلات بأطراف مطاطية بتتحرك لوحدها. كل حاجة سلايدرز على "<الاسم> Ctrl": Walk، Speed، Stride، Arm Swing، Wave، Talk، Jump، Look… وحرّك "<الاسم> Root" عشان يمشي في الكادر.'),
        UI.row(nm), acts, cols,
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: ch.walkAcross, onchange: function (e) { ch.walkAcross = e.target.checked; } }), ' يعدّي الكادر من الشمال لليمين')),
        UI.row(action('ضيف الكاراكتر', 'بيعمل الكاراكتر', function () { return S().characterAdd({ name: ch.name || 'Character', action: ch.action, colors: ch.colors, walkAcross: ch.walkAcross }).then(function (r) { ok(r.layers + ' لير متريّجين ✓'); }); }, 'primary'))));
      view.appendChild(UI.card('ريج للكاراكتر بتاعك (زي Duik)',
        UI.hint('سمّي الليرز (من فوتوشوب / إليستريتور): head / body / arm L upper / arm L lower / hand L / leg R / shin R / foot R … (أو راس، جسم، دراع شمال، رجل يمين). بيحط الأنكر في المفاصل من غير ما حاجة تتحرك، يربطهم ببعض، ويضيف كنترولر بسلايدرز للمشي والتنفّس والرمش والكلام.'),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: ch.ik, onchange: function (e) { ch.ik = e.target.checked; } }), ' IK للإيدين والرجلين (حرّك نل الإيد والدراع يتبعه)')),
        UI.row(action('اعمل الريج', 'بيعمل الريج', function () { return S().characterRig({ ik: ch.ik }).then(function (r) { ok(r.layers + ' جزء · ' + r.expressions + ' إكسبريشن' + (r.ik ? ' · ' + r.ik + ' IK' : '') + ' ✓'); }); }, 'primary'))));
      view.appendChild(UI.card('ليب سينك وصوت',
        UI.hint('ليب سينك: بيسمع الصوت ويحرّك سلايدر "Mouth" بتاع الكاراكتر فريم فريم. Audio React: أي لير مختار ينبض مع المزيكا (سلايدر Level على "EF Audio").'),
        UI.row(action('ليب سينك من ملف صوت', 'بيعمل ليب سينك', function () { var f = EF.pickFile('الصوت', ['wav', 'mp3', 'm4a', 'aac']); if (!f) return Promise.resolve(); return S().lipSync({ audio: f }).then(function (r) { ok('ليب سينك ' + r.frames + ' فريم على ' + r.ctrl + ' ✓'); }); })),
        UI.row(h('label', null, 'المختار'), UI.seg([{ value: 'scale', label: 'يكبر ويصغر' }, { value: 'opacity', label: 'ينوّر' }], ch.link, function (v) { ch.link = v; })),
        UI.field('القوة', UI.slider(5, 100, 5, ch.react, function (v) { return v + '%'; }, function (v) { ch.react = v; })),
        UI.row(action('Audio React', 'بيسمع المزيكا', function () { var f = EF.pickFile('المزيكا', ['wav', 'mp3', 'm4a', 'aac']); if (!f) return Promise.resolve(); return S().audioReact({ audio: f, amount: ch.react, link: ch.link }).then(function (r) { ok(r.frames + ' فريم · ' + r.linked + ' لير بينبض ✓'); }); }))));
    }
  });

  /* ——— معاينات متحركة: فريمات اتعملت في الأفتر مرة واتحفظت ——— */
  function previewTile(kind, id, label, onPick, isOn) {
    var frames = S().previewList ? S().previewList(kind, id) : [], img = null, k = 0, timer = null;
    var tile = h('button', { type: 'button', class: 'pv-tile' + (isOn ? ' on' : ''), 'data-pv': kind + ':' + id, title: label, onclick: function () { onPick(id, tile); } });
    if (frames.length) { img = h('img', { src: EF.fileUrl(frames[Math.min(3, frames.length - 1)]), alt: '' }); tile.appendChild(img); }
    else tile.appendChild(h('span', { class: 'pv-ph' }, '▶'));
    tile.appendChild(h('span', { class: 'pv-name' }, label));
    if (frames.length > 1) {
      tile.addEventListener('mouseenter', function () { timer = setInterval(function () { k = (k + 1) % frames.length; img.src = EF.fileUrl(frames[k]); }, 160); });
      tile.addEventListener('mouseleave', function () { clearInterval(timer); img.src = EF.fileUrl(frames[Math.min(3, frames.length - 1)]); });
    }
    return tile;
  }
  function previewGrid(kind, list, current, onPick) {
    var g = h('div', { class: 'pv-grid' });
    list.forEach(function (x) { g.appendChild(previewTile(kind, x.id, x.name, function (id, tile) { Array.prototype.forEach.call(g.children, function (b) { b.classList.toggle('on', b === tile); }); onPick(id); }, x.id === current)); });
    return g;
  }
  function previewButton(kind, ids, redraw) {
    return UI.btn('🎞 اعمل المعاينات', function () { UI.safe('بيعمل المعاينات في الأفتر', function () { return S().previewMake({ kind: kind, ids: ids, onStep: function (m) { UI.status('معاينة: ' + m, 'busy'); } }).then(function (r) { UI.status('جاهز'); ok(r.made ? r.made + ' معاينة ✓' : 'المعاينات موجودة'); redraw(); }); }); }, 'small ghost');
  }

  /* ——— مؤثرات: ترانزيشنز، سايل، فيزيا ——— */
  var fxo = { trans: 'zoomIn', tDur: 0.6, c1: '#f97316', c2: '#fbbf24', liquid: 'blob-calm', lsize: 0, ph: { mode: 'drop', gravity: 1, bounce: 0.5, duration: 4 } };
  EF.tabs.push({
    id: 'fx', label: 'مؤثرات', title: 'ترانزيشنز وسايل وفيزيا',
    render: function (view) {
      var K = S().kitInfo();
      var tg = previewGrid('transition', K.transitions, fxo.trans, function (id) { fxo.trans = id; });
      view.appendChild(UI.card('ترانزيشنز بين اللقطات',
        UI.hint('اختار الكليبات (بترتيبها في الوقت) وهتتحط ترانزيشن على كل قطع بينهم — أو من غير اختيار: عند المؤشر. زووم وWhip ولفّة وجليتش ببلير Adjustment، وأشكال بتغطي الكادر وتكشف اللقطة الجاية.'),
        tg, UI.field('المدة', UI.slider(0.2, 2, 0.05, fxo.tDur, function (v) { return v.toFixed(2) + 's'; }, function (v) { fxo.tDur = v; })),
        UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: fxo.c1, oninput: function (e) { fxo.c1 = e.target.value; } }), h('input', { type: 'color', value: fxo.c2, oninput: function (e) { fxo.c2 = e.target.value; } })),
        UI.row(action('حط الترانزيشن', 'بيحط ترانزيشنز', function () { return S().transitionApply({ kind: fxo.trans, duration: fxo.tDur, color: fxo.c1, color2: fxo.c2 }).then(function (r) { ok('ترانزيشن على ' + r.cuts + ' قطع ✓'); }); }, 'primary'), previewButton('transition', K.transitions.map(function (x) { return x.id; }), function () { EF.show('fx'); }))));
      var lg = previewGrid('liquid', K.liquid, fxo.liquid, function (id) { fxo.liquid = id; });
      view.appendChild(UI.card('أشكال سايلة (Liquid)',
        UI.hint(K.liquid.length + ' شكل بيتحرك لوحده (لوب): بلوبات بتتشكّل، موج، مية بتملا، نقط لزجة، طرطشة، حبر، فقاعات… ليرز عادية تغيّر لونها وحجمها.'),
        lg, UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: fxo.c1, oninput: function (e) { fxo.c1 = e.target.value; } }), h('input', { type: 'color', value: fxo.c2, oninput: function (e) { fxo.c2 = e.target.value; } })),
        UI.field('الحجم', UI.slider(0, 600, 10, fxo.lsize, function (v) { return v ? v + 'px' : 'تلقائي'; }, function (v) { fxo.lsize = v; })),
        UI.row(action('ضيف الشكل', 'بيضيف', function () { return S().liquidAdd({ preset: fxo.liquid, color: fxo.c1, color2: fxo.c2, size: fxo.lsize || undefined }).then(function (r) { ok(r.layers + ' لير ✓'); }); }, 'primary'), previewButton('liquid', K.liquid.map(function (x) { return x.id; }), function () { EF.show('fx'); }))));
      view.appendChild(UI.card('فيزيا (زي Newton)',
        UI.hint('اختار ليرز (كلام، أشكال، صور) وهي تقع وتخبط في بعض وفي الأرض والحيطان وتتنطط وتتدحرج — بتتخبز كي فريمز تعدّلها. سمّي اللير "ball / circle / كورة" عشان يتدحرج كدايرة.'),
        UI.row(UI.seg(K.physics.map(function (x) { return { value: x.id, label: x.name }; }), fxo.ph.mode, function (v) { fxo.ph.mode = v; })),
        UI.field('الجاذبية', UI.slider(0.2, 3, 0.1, fxo.ph.gravity, function (v) { return v.toFixed(1) + 'x'; }, function (v) { fxo.ph.gravity = v; })),
        UI.field('النطّ', UI.slider(0, 0.95, 0.05, fxo.ph.bounce, function (v) { return Math.round(v * 100) + '%'; }, function (v) { fxo.ph.bounce = v; })),
        UI.field('المدة', UI.slider(1, 10, 0.5, fxo.ph.duration, function (v) { return v + 's'; }, function (v) { fxo.ph.duration = v; })),
        UI.row(action('شغّل الفيزيا', 'بيحسب الفيزيا', function () { return S().physics(fxo.ph).then(function (r) { ok(r.bodies + ' لير · ' + r.frames + ' فريم ✓'); }); }, 'primary'))));
    }
  });

  /* ——— إنفوجرافيك: عدّاد وأرقام، رسوم بيانية، تايملاين ——— */
  var cnt = { from: 0, to: 1500, duration: 2, format: 'number', currency: 'USD', decimals: 0, separator: ',', arabic: false, prefix: '', suffix: '', plus: false, style: 'plain', label: '', ease: 'expoOut', color: '#ffffff', accent: '#f97316', unitsArabic: false };
  var cht = { type: 'column', data: 'مصر, 120\nالسعودية, 85\nالإمارات, 60\nالكويت, 40', title: 'المبيعات', fmt: 'number' };
  EF.tabs.push({
    id: 'info', label: 'إنفوجرافيك', title: 'عدّادات وإنفوجرافيك',
    render: function (view) {
      var K = S().kitInfo(), sample = h('div', { class: 'cnt-sample ltr' });
      function opts() { var o = {}; for (var k in cnt) o[k] = cnt[k]; o.separator = cnt.separator === 'none' ? '' : cnt.separator === 'space' ? ' ' : cnt.separator; return o; }
      function drawSample() { var o = opts(); sample.textContent = S().formatNumber(cnt.from, o) + '  →  ' + S().formatNumber(cnt.to, o); }
      var num = function (k, ph) { return h('input', { type: 'number', class: 'grow ltr', value: cnt[k], placeholder: ph, oninput: function (e) { cnt[k] = +e.target.value; drawSample(); } }); };
      var txt = function (k, ph) { return h('input', { class: 'grow', value: cnt[k], placeholder: ph, oninput: function (e) { cnt[k] = e.target.value; drawSample(); } }); };
      var cur = h('select', { onchange: function (e) { cnt.currency = e.target.value; drawSample(); } }, K.currencies.map(function (c) { return h('option', { value: c, selected: c === cnt.currency }, c); }));
      var chk = function (k, label) { return h('label', null, h('input', { type: 'checkbox', checked: cnt[k], onchange: function (e) { cnt[k] = e.target.checked; drawSample(); } }), ' ' + label); };
      var sg = previewGrid('counter', K.counterStyles, cnt.style, function (id) { cnt.style = id; });
      view.appendChild(UI.card('عدّاد أرقام',
        sample,
        UI.row(h('label', null, 'من'), num('from'), h('label', null, 'لحد'), num('to')),
        UI.row(h('label', null, 'الشكل'), UI.seg(K.formats.map(function (x) { return { value: x.id, label: x.name }; }), cnt.format, function (v) { cnt.format = v; drawSample(); })),
        UI.row(h('label', null, 'العملة'), cur, h('label', null, 'كسور'), UI.seg([0, 1, 2, 3].map(function (n) { return { value: n, label: String(n) }; }), cnt.decimals, function (v) { cnt.decimals = v; drawSample(); })),
        UI.row(h('label', null, 'الفاصل'), UI.seg([{ value: ',', label: '1,000' }, { value: '.', label: '1.000' }, { value: 'space', label: '1 000' }, { value: 'none', label: '1000' }], cnt.separator, function (v) { cnt.separator = v; drawSample(); })),
        UI.row(txt('prefix', 'قبل الرقم (مثلاً: +، ~)'), txt('suffix', 'بعد الرقم (مثلاً: عميل، كجم)')),
        UI.row(chk('arabic', 'أرقام عربي ١٢٣'), chk('plus', 'علامة +'), chk('unitsArabic', 'ألف / مليون')),
        UI.row(h('label', null, 'الحركة'), UI.seg([{ value: 'expoOut', label: 'سريع وبيهدى' }, { value: 'easeInOut', label: 'ناعم' }, { value: 'linear', label: 'ثابت' }, { value: 'backOut', label: 'بيعدّي ويرجع' }], cnt.ease, function (v) { cnt.ease = v; })),
        UI.field('المدة', UI.slider(0.3, 10, 0.1, cnt.duration, function (v) { return v.toFixed(1) + 's'; }, function (v) { cnt.duration = v; })),
        sg, UI.row(txt('label', 'عنوان تحت الرقم (اختياري)')),
        UI.row(h('label', null, 'الألوان'), h('input', { type: 'color', value: cnt.color, oninput: function (e) { cnt.color = e.target.value; } }), h('input', { type: 'color', value: cnt.accent, oninput: function (e) { cnt.accent = e.target.value; } })),
        UI.row(action('ضيف العدّاد', 'بيضيف العدّاد', function () { return S().counterAdd(opts()).then(function (r) { ok('العدّاد اتحط (' + r.layers + ' لير) ✓ — الرقم سلايدر "Count" تقدر تكي فريمه'); }); }, 'primary'), previewButton('counter', K.counterStyles.map(function (x) { return x.id; }), function () { EF.show('info'); }))));
      drawSample();
      var data = h('textarea', { rows: 5, class: 'ltr-ok', oninput: function (e) { cht.data = e.target.value; } }, cht.data);
      var ttl = h('input', { class: 'grow', value: cht.title, placeholder: 'العنوان', oninput: function (e) { cht.title = e.target.value; } });
      var cg = previewGrid('chart', K.charts, cht.type, function (id) { cht.type = id; });
      view.appendChild(UI.card('رسوم بيانية وتايملاين',
        UI.hint('اكتب البيانات سطر سطر: "الاسم, الرقم" (أو الصق من إكسل). للتايملاين: "السنة, الحدث". الأعمدة بتطلع ورا بعض، الأرقام بتعدّ، الخطوط بتترسم.'),
        cg, UI.row(ttl), data,
        UI.row(h('label', null, 'الأرقام'), UI.seg([{ value: 'number', label: '1,250' }, { value: 'compact', label: '1.2K' }, { value: 'currency', label: '$' }, { value: 'percent', label: '%' }], cht.fmt, function (v) { cht.fmt = v; })),
        UI.row(action('اعمل الرسم', 'بيعمل الإنفوجرافيك', function () { return S().chartAdd({ type: cht.type, data: cht.data, title: cht.title, format: { format: cht.fmt, currency: cnt.currency, arabic: cnt.arabic } }).then(function (r) { ok(r.layers + ' لير ✓'); }); }, 'primary'), previewButton('chart', K.charts.map(function (x) { return x.id; }), function () { EF.show('info'); }))));
    }
  });

  /* ——— عقارات: إبراز مبنى أو أرض ——— */
  var re = { mode: 'manual', points: [], preset: 'blue-rest', restColor: '#1d4ed8', restOpacity: 70, bColor: '#f97316', bOpacity: 0, oColor: '#ffffff', oWidth: 4, feather: 6, seconds: 0, outline: true, title: '', price: '', currency: 'EGP', area: '', arabic: false };
  EF.tabs.push({
    id: 'estate', label: 'عقارات', title: 'إبراز مبنى (عقارات)',
    render: function (view) {
      var P = S().highlightPresets(), stage = h('div', { class: 'track-stage' }), img = h('img', { alt: '' }), svgNS = 'http://www.w3.org/2000/svg';
      var poly = document.createElementNS(svgNS, 'svg'); poly.setAttribute('class', 'hl-poly'); poly.setAttribute('viewBox', '0 0 100 100'); poly.setAttribute('preserveAspectRatio', 'none');
      var dots = h('div', { class: 'track-dots' }), info = h('p', { class: 'hint' }), step = h('p', { class: 'hint' });
      stage.appendChild(img); stage.appendChild(poly); stage.appendChild(dots);
      function draw() {
        UI.empty(dots); while (poly.firstChild) poly.removeChild(poly.firstChild);
        if (re.mode === 'manual' && re.points.length > 1) {
          var pg = document.createElementNS(svgNS, 'polygon');
          pg.setAttribute('points', re.points.map(function (p) { return (p[0] * 100) + ',' + (p[1] * 100); }).join(' '));
          poly.appendChild(pg);
        }
        re.points.forEach(function (p, i) { var d = h('span', { class: 'track-dot', title: 'شيل', onclick: function (e) { e.stopPropagation(); re.points.splice(i, 1); draw(); } }, String(i + 1)); d.style.left = (p[0] * 100) + '%'; d.style.top = (p[1] * 100) + '%'; dots.appendChild(d); });
        info.textContent = re.mode === 'ai' ? (re.points.length ? 'تمام — الـ AI هيحدّد المبنى اللي دوست عليه' : 'دوسة واحدة على المبنى') : (re.points.length < 3 ? 'دوس على أركان المبنى بالترتيب حواليه (3 نقط أو أكتر — الأركان الحادة أحسن)' : re.points.length + ' نقط ✓ — تقدر تزوّد أو تشيل');
      }
      stage.addEventListener('click', function (e) { if (!img.src) return; var r = stage.getBoundingClientRect(), p = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; if (re.mode === 'ai') re.points = [p]; else if (re.points.length < 16) re.points.push(p); draw(); });
      var load = action('هات الفريم', 'بيجيب الفريم', function () { return S().trackFrame().then(function (r) { img.src = 'data:image/jpeg;base64,' + r.b64; stage.classList.add('on'); re.points = []; draw(); step.textContent = r.src.layer.name; }); });
      var presets = h('div', { class: 'chips' });
      P.forEach(function (x) { presets.appendChild(h('button', { type: 'button', class: 'chip' + (re.preset === x.id ? ' on' : ''), 'data-preset': x.id, onclick: function () { re.preset = x.id; Array.prototype.forEach.call(presets.children, function (b) { b.classList.toggle('on', b.dataset.preset === x.id); }); applyPreset(x.id); } }, x.name)); });
      var DEF = { 'blue-rest': ['#1d4ed8', 70, '#f97316', 0, '#ffffff'], 'bw-rest': ['#ffffff', 100, '#f97316', 0, '#fbbf24'], gold: ['#0f172a', 55, '#fbbf24', 35, '#fde68a'], 'color-building': ['#1d4ed8', 0, '#f97316', 55, '#f97316'], focus: ['#0b0806', 0, '#f97316', 0, '#ffffff'] };
      var inRC, inRO, inBC, inBO, inOC;
      function applyPreset(id) { var d = DEF[id]; if (!d) return; re.restColor = d[0]; re.restOpacity = d[1]; re.bColor = d[2]; re.bOpacity = d[3]; re.oColor = d[4]; inRC.value = d[0]; inBC.value = d[2]; inOC.value = d[4]; inRO.set(d[1]); inBO.set(d[3]); }
      inRC = h('input', { type: 'color', value: re.restColor, oninput: function (e) { re.restColor = e.target.value; } });
      inBC = h('input', { type: 'color', value: re.bColor, oninput: function (e) { re.bColor = e.target.value; } });
      inOC = h('input', { type: 'color', value: re.oColor, oninput: function (e) { re.oColor = e.target.value; } });
      inRO = UI.slider(0, 100, 1, re.restOpacity, function (v) { return v + '%'; }, function (v) { re.restOpacity = v; });
      inBO = UI.slider(0, 100, 1, re.bOpacity, function (v) { return v ? v + '%' : 'طبيعي'; }, function (v) { re.bOpacity = v; });
      if (!inRO.set) inRO.set = function (v) { var i = inRO.querySelector('input'); if (i) { i.value = v; i.dispatchEvent(new Event('input')); } };
      if (!inBO.set) inBO.set = function (v) { var i = inBO.querySelector('input'); if (i) { i.value = v; i.dispatchEvent(new Event('input')); } };
      var cur = h('select', { onchange: function (e) { re.currency = e.target.value; } }, ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'USD', 'EUR'].map(function (c) { return h('option', { value: c, selected: c === re.currency }, c); }));
      var inp = function (k, ph, type) { return h('input', { class: 'grow', type: type || 'text', placeholder: ph, value: re[k], oninput: function (e) { re[k] = e.target.value; } }); };
      view.appendChild(UI.card('إبراز مبنى أو أرض',
        UI.hint('اختار لير الفيديو، حط المؤشر على أول فريم، وهات الفريم. "بإيدك": دوس على أركان المبنى حواليه — الحدود بتتتبّع بالمنظور (شغال من غير أي مفتاح). "AI": دوسة واحدة على المبنى ويتحدّد في كل فريم حتى لو حاجة عدّت قدّامه (fal.ai).'),
        UI.row(load, UI.seg([{ value: 'manual', label: 'بإيدك (نقط حواليه)' }, { value: 'ai', label: 'AI (دوسة واحدة)' }], re.mode, function (v) { re.mode = v; re.points = re.points.slice(0, v === 'ai' ? 1 : 16); draw(); })),
        stage, info,
        presets,
        UI.row(h('label', null, 'الباقي'), inRC), UI.field('تلوين الباقي', inRO),
        UI.row(h('label', null, 'المبنى'), inBC), UI.field('تلوين المبنى', inBO),
        UI.row(h('label', null, 'الإطار'), inOC, h('label', null, h('input', { type: 'checkbox', checked: re.outline, onchange: function (e) { re.outline = e.target.checked; } }), ' خط حوالين المبنى (بإيدك)')),
        UI.field('نعومة الحواف', UI.slider(0, 40, 1, re.feather, function (v) { return v + 'px'; }, function (v) { re.feather = v; })),
        UI.field('لحد', UI.slider(0, 60, 1, re.seconds, function (v) { return v ? v + 's' : 'آخر اللير'; }, function (v) { re.seconds = v; })),
        UI.hint('كارت معلومات بيمشي مع المبنى (اختياري):'),
        UI.row(inp('title', 'اسم المشروع')), UI.row(inp('price', 'السعر', 'number'), cur, inp('area', 'المساحة م²', 'number')),
        UI.row(h('label', null, h('input', { type: 'checkbox', onchange: function (e) { re.arabic = e.target.checked; } }), ' أرقام عربي')),
        UI.row(action('أبرز المبنى', 'بيبرز المبنى', function () {
          return S().highlight({ points: re.points, mode: re.mode, preset: re.preset, seconds: re.seconds, outline: re.outline,
            look: { rest: { color: re.restColor, opacity: re.restOpacity }, building: { color: re.bColor, opacity: re.bOpacity }, outline: { color: re.oColor }, feather: re.feather },
            label: re.title || re.price || re.area ? { title: re.title, price: re.price, currency: re.currency, area: re.area, arabic: re.arabic } : null,
            onStep: function (m) { step.textContent = m; } }).then(function (r) { step.textContent = r.frames + ' فريم ✓'; ok('اتبرز ✓ — كل الألوان والأوباسيتي سلايدرز على "' + r.controls + '" تعدّلها وانت شايف'); });
        }, 'primary')), step));
      draw();
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
      var gq = h('input', { class: 'grow ltr', type: 'password', value: S().settings.keys.groq || '', placeholder: 'gsk_…' });
      view.appendChild(UI.card('مفتاح Groq (تفريغ الكلام)', UI.row(gq, action('احفظ', 'بيحفظ', function () { S().saveSettings({ keys: { groq: gq.value.trim() } }); ok('اتحفظ ✓ (نفس مفتاح بريمير)'); }), UI.btn('هات مفتاح', function () { EF.openUrl('https://console.groq.com/keys'); }, 'small')),
        UI.hint('للكلام المتحرك مع الصوت و"صوتك ← فيديو": أدق بكتير من التفريغ على الجهاز.')));
      var fal = h('input', { class: 'grow ltr', type: 'password', value: S().settings.keys.fal || '', placeholder: 'fal key' });
      view.appendChild(UI.card('مفتاح fal.ai (اختياري)', UI.row(fal, action('احفظ', 'بيحفظ', function () { S().saveSettings({ keys: { fal: fal.value.trim() } }); ok('اتحفظ ✓'); })),
        UI.hint('لعمق أدق في "صورة → ثري دي" ولعمل موديل ثري دي حقيقي من صورة. من غيره الأدوات بتشتغل بالتقدير.')));
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
      var ftStep = h('div', { class: 'hint' }), ftRep = h('textarea', { class: 'ltr ft-report', rows: 10, readonly: 'readonly', style: 'display:none' }), ftCopy = h('div', { style: 'display:none' });
      ftCopy.appendChild(UI.row(action('انسخ التقرير', 'بينسخ', function () { ftRep.select(); try { document.execCommand('copy'); ok('اتنسخ ✓ — ابعته في الشات'); } catch (e) {} return Promise.resolve(); })));
      view.insertBefore(UI.card('اختبر كل الأدوات', UI.row(action('اختبر كل الأدوات', 'بيختبر كل أداة', function () {
        ftStep.textContent = 'بيبدأ…';
        return S().fullTest({ onStep: function (m) { ftStep.textContent = m; } }).then(function (r) {
          ftStep.textContent = r.fail ? '✗ ' + r.fail + ' من ' + r.total + ' فيهم مشكلة — انسخ التقرير وابعته' : '✓ كل الأدوات شغالة (' + r.total + ')';
          ftRep.value = r.report; ftRep.style.display = ''; ftCopy.style.display = '';
        });
      }, 'primary')), ftStep, ftRep, ftCopy,
        UI.hint('بيشغّل كل أداة بجد في الأفتر ده على كومبات تجربة (لوجو، صورة، فيديو، صوت بيتعملوا لوحدهم)، والأفتر نفسه بيفحص كل إكسبريشن، وبعدين بيمسح كل اللي عمله ويرجّعك للكومب بتاعك. مفيش AI ولا فلوس بتتصرف. بياخد دقيقة أو اتنين.')), view.firstChild);
      view.appendChild(UI.card('فحص الأفتر', UI.row(action('افحص', 'بيفحص', function () { return S().selfTest().then(function (r) { out.textContent = JSON.stringify(r, null, 1); }); })), out,
        UI.hint('فولدر القوالب: ' + S().templatesDir())));
    }
  });
})();

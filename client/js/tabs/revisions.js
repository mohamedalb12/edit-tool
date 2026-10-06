/* تعديلات العميل: الصق الرسالة ← مهام بالوقت ← علّم اللي خلص ← رسالة للعميل بالعامية المصرية. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { data: null, roundId: null, draft: '', client: '' };
  var TYPE_ICON = { cut: '✂️', text: '🔤', music: '🎵', sfx: '🔊', color: '🎨', graphics: '✨', speed: '⏩', other: '📝' };
  function fmt(t) { t = Math.round(t); return Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); }

  EF.tabs.push({
    id: 'revisions', label: 'التعديلات', title: 'تعديلات العميل',
    render: function (view) {
      var S = EF.services;
      var box = h('div'), msgBox = h('div');
      var txt = h('textarea', { rows: 5, placeholder: 'الصق رسالة العميل هنا زي ما هي… مثلاً:\n- شيل الجزء اللي عند 1:20\n- المزيكا عالية شوية\n- غيّر لون العنوان للأحمر', value: o.draft, oninput: function (e) { o.draft = e.target.value; } });
      var name = h('input', { class: 'grow', placeholder: 'اسم العميل (اختياري)', value: o.client, oninput: function (e) { o.client = e.target.value; } });

      function round() { return o.data && o.data.rounds.find(function (r) { return r.id === o.roundId; }); }
      function draw() {
        UI.empty(box);
        var r = round(); if (!r) return;
        var done = r.items.filter(function (x) { return x.done; }).length, n = r.items.length;
        var bar = UI.progress(); bar.set(n ? done / n : 0);
        var list = h('div', { class: 'rev-list' });
        r.items.forEach(function (it, i) {
          var row = h('div', { class: 'rev-item' + (it.done ? ' done' : '') },
            h('button', { type: 'button', class: 'rev-check', title: it.done ? 'رجّعها مش متعملة' : 'علّم إنها اتعملت', onclick: function () {
              UI.safe('بيحفظ', function () { return S.revisionsToggle({ roundId: r.id, itemId: it.id }).then(function (nr) { o.data.rounds = o.data.rounds.map(function (x) { return x.id === nr.id ? nr : x; }); draw(); if (nr.items.every(function (x) { return x.done; })) UI.toast('كل التعديلات خلصت 🎉 — اكتب الرسالة للعميل'); }); });
            } }, it.done ? '✓' : ''),
            h('span', { class: 'rev-type', title: it.type }, TYPE_ICON[it.type] || '📝'),
            h('div', { class: 'grow' }, h('div', { class: 'rev-text' }, (i + 1) + '. ' + it.text), it.note ? h('div', { class: 'hint' }, '❓ ' + it.note) : null),
            it.time != null ? h('button', { type: 'button', class: 'chip rev-time ltr', title: 'روح للوقت ده', onclick: function () { S.setPlayhead(it.time); } }, fmt(it.time) + (it.timeEnd != null ? '–' + fmt(it.timeEnd) : '')) : null);
          list.appendChild(row);
        });
        var marks = UI.btn('حط ماركرز على الأوقات', function () { UI.safe('بيحط ماركرز', function () { return S.revisionsMarkers({ roundId: r.id }).then(function (x) { UI.toast(x.added + ' ماركر ✓'); }); }, marks); }, 'small');
        var msg = UI.btn('اكتب رسالة للعميل', function () {
          UI.safe('بيكتب الرسالة', function () { return S.revisionsMessage({ roundId: r.id }).then(function (m) { r.message = m.text; drawMsg(r, m.warning); }); }, msg);
        }, 'primary');
        var rounds = o.data.rounds.length > 1 ? UI.select(o.data.rounds.map(function (x, k) { return { value: x.id, label: 'جولة ' + (k + 1) + ' — ' + new Date(x.at).toLocaleDateString('ar-EG') + (x.client ? ' — ' + x.client : '') }; }), r.id, function (v) { o.roundId = v; draw(); drawMsg(round()); }) : null;
        box.appendChild(UI.card('المهام — ' + done + ' من ' + n, rounds, bar, list, UI.row(msg, marks)));
      }
      function drawMsg(r, warning) {
        UI.empty(msgBox);
        if (!r || !r.message) return;
        var area = h('textarea', { rows: 8, class: 'rev-msg', value: r.message });
        var copy = UI.btn('انسخ الرسالة', function () {
          area.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
          if (!ok && navigator.clipboard) navigator.clipboard.writeText(area.value);
          UI.toast('اتنسخت ✓ — ابعتها للعميل');
        }, 'primary');
        msgBox.appendChild(UI.card('الرسالة للعميل', warning ? h('div', { class: 'hint err' }, 'اتكتبت من غير ذكاء اصطناعي: ' + warning) : null, area, UI.row(copy)));
      }

      var split = UI.btn('قسّمها لمهام', function () {
        UI.safe('بيقسّم التعديلات', function () {
          return S.revisionsSplit({ text: o.draft, client: o.client }).then(function (res) {
            return S.revisionsLoad().then(function (d) { o.data = d; o.roundId = res.round.id; o.draft = ''; txt.value = ''; draw(); drawMsg(null);
              UI.toast(res.round.items.length + ' مهمة' + (res.ai ? '' : ' (اتقسمت من غير ذكاء اصطناعي)')); if (res.warning) UI.toast('الذكاء الاصطناعي مارجعش: ' + res.warning, true); });
          });
        }, split);
      }, 'primary');

      view.appendChild(UI.card('رسالة العميل', txt, name, UI.modelPicker('revisions'), UI.row(split),
        UI.hint('بيقسّم الرسالة لمهام واضحة وبيطلّع الأوقات المذكورة (تدوس عليها تروح للمكان). كل جولة تعديلات بتتحفظ مع المشروع. لو مفيش رصيد AI بيقسّمها برضه من غير ذكاء اصطناعي.')));
      view.appendChild(box);
      view.appendChild(msgBox);
      UI.safe('بيحمّل', function () { return S.revisionsLoad().then(function (d) { o.data = d; if (!o.roundId && d.rounds.length) o.roundId = d.rounds[d.rounds.length - 1].id; draw(); drawMsg(round()); }); });
    }
  });
})();

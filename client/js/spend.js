/* عدّاد الصرف: كام اتصرف على الذكاء الاصطناعي النهارده والشهر ده، ولكل موديل، وتنبيه لو عدّيت حد تحطه. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var pill = null, pop = null, timer = null, last = null;
  function C() { return UI.costLib(); }
  function money(x) { var c = C(); return c ? c.fmt(x || 0) : '$' + (x || 0).toFixed(2); }

  function paint(s) {
    if (!pill) return;
    last = s;
    pill.textContent = '';
    pill.appendChild(h('span', { class: 'lbl' }, '💲'));
    pill.appendChild(h('b', null, s.today ? money(s.today) : '0'));
    pill.classList.toggle('warn', alertOn(s));
    pill.title = 'صرف الذكاء الاصطناعي: النهارده ' + money(s.today) + ' (' + s.todayCalls + ' طلب) · الشهر ده ' + money(s.month);
    if (pop) drawPop();
  }
  function limit() { var v = +(EF.services.settings.spendAlert || 0); return v > 0 ? v : 0; }
  function alertOn(s) { return limit() > 0 && s.today >= limit(); }

  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var S = EF.services; if (!S || !S.spendSummary) return;
      Promise.resolve().then(function () { return S.spendSummary(); }).then(function (s) {
        paint(s);
        if (alertOn(s)) {
          var key = 'ef-spend-warned', today = new Date().toDateString(), was = null;
          try { was = localStorage.getItem(key); } catch (e) {}
          if (was !== today) { UI.toast('صرفت ' + money(s.today) + ' النهارده — عدّيت الحد اللي حطيته (' + money(limit()) + ')', true); try { localStorage.setItem(key, today); } catch (e2) {} }
        }
      }).catch(function () {});
    }, 120);
  }

  function drawPop() {
    var s = last; if (!s) return;
    UI.empty(pop);
    var max = Math.max.apply(null, s.last7.map(function (d) { return d.cost; }).concat([0.0001]));
    var bars = h('div', { class: 'sp-bars ltr' });
    s.last7.forEach(function (d, i) {
      bars.appendChild(h('div', { class: 'sp-bar' + (i === 6 ? ' now' : ''), title: d.day + ': ' + money(d.cost) },
        h('i', { style: { height: Math.max(3, d.cost / max * 46) + 'px' } }), h('span', null, d.day.slice(8))));
    });
    var models = h('div', { class: 'sp-models' });
    if (!s.byModel.length) models.appendChild(h('div', { class: 'hint' }, 'لسه ماستخدمتش ذكاء اصطناعي النهارده'));
    s.byModel.forEach(function (m) { models.appendChild(h('div', { class: 'sp-model' }, h('span', { class: 'grow ltr' }, m.id), h('span', { class: 'hint' }, m.calls + ' طلب'), h('b', { class: 'ltr' }, money(m.cost)))); });
    var lim = h('input', { type: 'number', min: 0, step: 0.5, class: 'ltr sp-limit', value: limit() || '', placeholder: 'من غير', onchange: function (e) { EF.services.saveSettings({ spendAlert: +e.target.value || 0 }); UI.toast(+e.target.value ? 'هنبهك لو عدّيت $' + e.target.value + ' في اليوم ✓' : 'التنبيه اتقفل'); refresh(); } });
    pop.appendChild(h('div', { class: 'sp-head' },
      h('div', null, h('div', { class: 'hint' }, 'النهارده'), h('div', { class: 'sp-big ltr' }, money(s.today)), h('div', { class: 'hint' }, s.todayCalls + ' طلب')),
      h('div', null, h('div', { class: 'hint' }, 'الشهر ده'), h('div', { class: 'sp-mid ltr' }, money(s.month)), h('div', { class: 'hint' }, s.monthCalls + ' طلب'))));
    pop.appendChild(bars);
    pop.appendChild(h('h4', null, 'النهارده حسب الموديل'));
    pop.appendChild(models);
    pop.appendChild(h('div', { class: 'row' }, h('label', null, 'نبهني لو صرفت في اليوم أكتر من $'), lim));
    pop.appendChild(UI.hint('الرقم من OpenRouter نفسه لكل طلب (أو محسوب من سعر الموديل). جنب كل ميزة AI فيه تقدير قبل ما تدوس 💲.'));
    pop.appendChild(h('div', { class: 'row' }, UI.btn('صفحة الصرف على OpenRouter', function () { EF.openUrl('https://openrouter.ai/activity'); }, 'small'), UI.btn('اشحن رصيد', function () { EF.openUrl('https://openrouter.ai/settings/credits'); }, 'small')));
  }

  function toggle(e) {
    if (e) e.stopPropagation();
    if (pop) { pop.remove(); pop = null; return; }
    pop = h('div', { class: 'spend-pop', onclick: function (ev) { ev.stopPropagation(); } });
    document.getElementById('main').appendChild(pop);
    drawPop(); refresh();
  }
  document.addEventListener('click', function () { if (pop) { pop.remove(); pop = null; } });

  EF.spend = {
    boot: function () {
      var bar = document.getElementById('topbar'), st = document.getElementById('status');
      pill = h('button', { type: 'button', id: 'spend', class: 'pill spend', onclick: toggle });
      bar.insertBefore(pill, st);
      if (EF.services) EF.services.onSpend = refresh;
      refresh();
    },
    refresh: refresh, toggle: toggle
  };
})();

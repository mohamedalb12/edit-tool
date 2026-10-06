/* التحديثات: لما تنزل نسخة جديدة من EditFast بتظهر فوق في اللوحة وبتتحدث لوحدها (أو بضغطة). */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var U = EF.updates = { busy: false, timer: null, reload: function () { location.reload(); } };

  function bar() {
    var b = document.getElementById('update-bar');
    if (!b) { b = h('div', { id: 'update-bar', class: 'update-bar', role: 'status' }); var main = document.getElementById('main'); main.insertBefore(b, document.getElementById('view')); }
    return UI.empty(b);
  }
  function hide() { var b = document.getElementById('update-bar'); if (b) b.remove(); clearInterval(U.timer); }
  function firstLine(t) { return String(t || '').split(/\r?\n/).filter(Boolean)[0] || ''; }

  /** show "new version" with an automatic countdown (autoUpdate on) or a button */
  U.offer = function (r) {
    var S = EF.services, b = bar(), info = r.info;
    var msg = h('div', { class: 'grow' }, h('b', null, '✨ تحديث جديد ' + info.version), h('span', { class: 'hint' }, ' (عندك ' + r.current + ')'), firstLine(info.notes) ? h('div', { class: 'hint' }, firstLine(info.notes)) : null);
    var go = UI.btn('حدّث دلوقتي', function () { U.install(info); }, 'small primary');
    var later = UI.btn('بعدين', function () { hide(); }, 'small');
    b.appendChild(h('div', { class: 'row' }, msg, go, later));
    if (S.settings.autoUpdate !== false) {
      var n = 8, cd = h('div', { class: 'hint' }, 'هيتحدّث لوحده خلال ' + n + ' ثواني…');
      b.appendChild(cd);
      U.timer = setInterval(function () { n--; cd.textContent = 'هيتحدّث لوحده خلال ' + n + ' ثواني…'; if (n <= 0) { clearInterval(U.timer); U.install(info); } }, 1000);
    }
  };

  U.install = function (info) {
    if (U.busy) return; U.busy = true; clearInterval(U.timer);
    var S = EF.services, b = bar(), prog = UI.progress(), st = h('div', { class: 'hint' }, 'بيحمّل التحديث…');
    b.appendChild(h('div', null, h('b', null, 'بيتحدّث لـ ' + info.version), st, prog));
    return S.applyUpdate(info, function (p, phase) {
      prog.set(p); st.textContent = { download: 'بيحمّل التحديث… ' + Math.round(p * 100) + '%', backup: 'بياخد نسخة احتياطية…', engine: 'بيحدّث محرك المشاهد…', done: 'خلص — بيعيد تشغيل اللوحة' }[phase] || st.textContent;
    }).then(function () {
      st.textContent = 'اتحدّث ✓ — بيعيد تشغيل اللوحة'; prog.set(1);
      setTimeout(function () { U.reload(); }, 900);
    }, function (e) {
      U.busy = false; UI.empty(b).appendChild(h('div', { class: 'row' }, h('span', { class: 'grow err' }, 'التحديث فشل: ' + e.message + ' — النسخة الحالية سليمة'), UI.btn('قفل', hide, 'small')));
    });
  };

  /** quiet check (boot / every 6h); manual=true reports "you're up to date" */
  U.check = function (manual) {
    var S = EF.services;
    if (!S.checkUpdate) return Promise.resolve(null);
    return S.checkUpdate().then(function (r) {
      if (r.available) U.offer(r); else if (manual) UI.toast(r.latest ? 'عندك آخر نسخة (' + r.current + ') ✓' : 'مقدرتش أوصل لسيرفر التحديثات', !r.latest);
      return r;
    }, function (e) { if (manual) UI.toast('مقدرتش أدوّر على تحديث: ' + e.message, true); return null; });
  };

  U.boot = function () {
    var S = EF.services, lu = S.settings.lastUpdate;
    // just updated: say what changed once
    if (lu && !lu.seen) {
      var b = bar();
      b.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', null, '✓ اتحدّثت لـ ' + lu.version), lu.notes ? h('div', { class: 'hint' }, firstLine(lu.notes)) : null), UI.btn('تمام', hide, 'small')));
      S.saveSettings({ lastUpdate: Object.assign({}, lu, { seen: true }) });
      setTimeout(hide, 12000);
    }
    setTimeout(function () { U.check(false); }, 4000);
    setInterval(function () { U.check(false); }, 6 * 3600 * 1000);
  };
})();

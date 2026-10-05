/* تشغيل اللوحة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var current = null;

  function show(id) {
    var tab = EF.tabs.find(function (t) { return t.id === id; }) || EF.tabs[0];
    current = tab.id;
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('active', b.dataset.id === tab.id); });
    UI.wordFx(document.getElementById('tab-title'), tab.title, { step: 70 });
    var view = UI.empty(document.getElementById('view'));
    try { tab.render(view); } catch (e) { view.appendChild(UI.card('خطأ', h('pre', { class: 'err ltr' }, e.stack || e.message))); console.error(e); }
    try { localStorage.setItem('ef-tab', tab.id); } catch (e2) {}
  }
  EF.show = show;

  function boot() {
    var Services = EF.test && EF.test.Services ? EF.test.Services : EF.node('services').Services;
    EF.services = EF.test && EF.test.services ? EF.test.services : new Services({
      host: EF.host,
      renderScene: function (spec, out, ffmpeg) { return EF.renderScene(spec, out, ffmpeg); },
      log: function (m) { console.log('[EditFast]', m); }
    });
    var nav = document.getElementById('nav');
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) { el.appendChild(UI.icon(el.getAttribute('data-icon'))); });
    var sw = document.querySelector('#splash .word'); if (sw) { var txt = sw.textContent; sw.textContent = ''; txt.split('').forEach(function (c, i) { sw.appendChild(h('span', { class: 'ch', style: { animationDelay: (i * 55) + 'ms' } }, c)); }); }
    setTimeout(function () { var sp = document.getElementById('splash'); if (sp) { sp.classList.add('hide'); setTimeout(function () { sp.remove(); }, 700); } }, 650);
    EF.tabs.forEach(function (t) {
      nav.appendChild(h('button', { type: 'button', 'data-id': t.id, title: t.title, onclick: function () { show(t.id); } }, h('span', { class: 'ic' }, UI.icon(t.id)), t.label));
    });
    try { var ms = JSON.parse(localStorage.getItem('ef-models') || 'null'); UI.fillModels(ms || EF.node('openrouter').FALLBACK_MODELS); } catch (e) {}
    var first = null; try { first = localStorage.getItem('ef-tab'); } catch (e3) {}
    show(first || 'agent');
    EF.loadHostScript().then(function () { return EF.host('ping', {}); }).then(function (r) { UI.status('متصل بـ ' + (r.app || 'Premiere')); }).catch(function (e) { UI.status('مش متصل ببريمير', 'err'); console.warn(e); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

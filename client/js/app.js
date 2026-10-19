/* تشغيل اللوحة. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var current = null;

  /*
   * 11 tools instead of 28 tabs: each tool groups the screens that do related jobs, with a small switcher on top.
   * EF.show(id) still opens any screen by its own id (the tool around it opens with it selected).
   */
  EF.GROUPS = [
    { id: 'agent', label: 'المونتير', title: 'المونتير الذكي', members: ['agent', 'auto', 'autofx'], names: { agent: 'شات', auto: 'مونتاج تلقائي', autofx: 'مؤثرات على الكلام' } },
    { id: 'transcribe', label: 'كابشن', title: 'التفريغ والكابشن', members: ['transcribe', 'search'], names: { transcribe: 'تفريغ وكابشن', search: 'بحث وفصول وماركرز' } },
    { id: 'quickcut', label: 'القص', title: 'القص', members: ['quickcut', 'multicam'], names: { quickcut: 'سكتات وتكرار', multicam: 'مالتي كام' } },
    { id: 'audio', label: 'الصوت', title: 'الصوت', members: ['audio'] },
    { id: 'reels', label: 'ريلز', title: 'ريلز وشورتس', members: ['reels', 'safezones'], names: { reels: 'ريلز وشورتس', safezones: 'المنطقة الآمنة' } },
    { id: 'motion', label: 'الحركة', title: 'الحركة', members: ['motion', 'curves'], names: { motion: 'قوالب الحركة', curves: 'المنحنيات' } },
    { id: 'templates', label: 'جرافيك', title: 'الجرافيك', members: ['templates', 'mytemplates', 'titles', 'icons', 'carousel', 'glass', 'thumb', 'pro'], names: { templates: 'القوالب', mytemplates: 'قوالبي من أفتر', titles: 'تايتلات', icons: 'أيقونات', carousel: 'كاروسيل 3D', glass: 'ليكويد جلاس', thumb: 'ثامبنيل', pro: 'مشاهد AI (متقدّم)' } },
    { id: 'library', label: 'مكتبتي', title: 'مكتبتي', members: ['library'] },
    { id: 'download', label: 'ميديا', title: 'الميديا', members: ['download', 'broll', 'websearch', 'sfx'], names: { download: 'تحميل', broll: 'B-Roll', websearch: 'بحث النت', sfx: 'مؤثرات صوتية' } },
    { id: 'revisions', label: 'التعديلات', title: 'تعديلات العميل', members: ['revisions'] },
    { id: 'relink', label: 'الملفات', title: 'الملفات والمشروع', members: ['relink', 'organize'], names: { relink: 'ربط الناقص', organize: 'تنظيم المشروع' } },
    { id: 'settings', label: 'الإعدادات', title: 'الإعداد والفحص', members: ['settings'] }
  ];
  function groupOf(id) {
    return EF.GROUPS.find(function (g) { return g.id === id; }) || EF.GROUPS.find(function (g) { return g.members.indexOf(id) >= 0; });
  }
  function lastMember(g) { var m = null; try { m = localStorage.getItem('ef-sub-' + g.id); } catch (e) {} return g.members.indexOf(m) >= 0 ? m : g.members[0]; }

  function show(id) {
    var g = groupOf(id) || EF.GROUPS[0];
    var member = g.members.indexOf(id) >= 0 && id !== g.id ? id : (id === g.id && g.members.indexOf(id) >= 0 && !EF._fromNav ? id : lastMember(g));
    var tab = EF.tabs.find(function (t) { return t.id === member; }) || EF.tabs.find(function (t) { return t.id === g.members[0]; });
    if (!tab) return;
    current = tab.id; EF.currentTab = tab.id;
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('active', b.dataset.id === g.id); });
    UI.wordFx(document.getElementById('tab-title'), g.members.length > 1 ? g.title + ' · ' + ((g.names && g.names[tab.id]) || tab.label) : tab.title, { step: 70 });
    var view = UI.empty(document.getElementById('view'));
    if (g.members.length > 1) {
      var sub = h('div', { class: 'subnav' });
      g.members.forEach(function (m) {
        var t = EF.tabs.find(function (x) { return x.id === m; }); if (!t) return;
        sub.appendChild(h('button', { type: 'button', class: 'chip' + (m === tab.id ? ' on' : ''), 'data-sub': m, onclick: function () { show(m); } }, (g.names && g.names[m]) || t.label));
      });
      view.appendChild(sub);
    }
    try { tab.render(view); } catch (e) { view.appendChild(UI.card('خطأ', h('pre', { class: 'err ltr' }, e.stack || e.message))); console.error(e); }
    try { localStorage.setItem('ef-tab', tab.id); localStorage.setItem('ef-sub-' + g.id, tab.id); } catch (e2) {}
  }
  EF.show = show;

  function boot() {
    var Services;
    try { Services = EF.test && EF.test.Services ? EF.test.Services : EF.node('services').Services; } catch (err) { return bootFailed(err); }
    try { EF.services = EF.test && EF.test.services ? EF.test.services : new Services({
      host: EF.host,
      renderScene: function (spec, out, ffmpeg) { return EF.renderScene(spec, out, ffmpeg); },
      renderGlass: function (job) { return EF.renderGlass(job); },
      analyzeFaces: function (job) { return EF.analyzeFaces(job); },
      renderCaptions: function (job) { return EF.renderCaptionClips(job); },
      renderOverlay: function (job) { return EF.renderSafeOverlay(job); },
      log: function (m) { console.log('[EditFast]', m); }
    }); } catch (err2) { return bootFailed(err2); }
    var nav = document.getElementById('nav');
    var pb = document.getElementById('pal-btn'); if (pb) pb.addEventListener('click', function () { if (EF.palette) EF.palette.open(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) { el.appendChild(UI.icon(el.getAttribute('data-icon'))); });
    var sw = document.querySelector('#splash .word'); if (sw) { var txt = sw.textContent; sw.textContent = ''; txt.split('').forEach(function (c, i) { sw.appendChild(h('span', { class: 'ch', style: { animationDelay: (i * 55) + 'ms' } }, c)); }); }
    setTimeout(function () { var sp = document.getElementById('splash'); if (sp) { sp.classList.add('hide'); setTimeout(function () { sp.remove(); }, 700); } }, 650);
    EF.GROUPS.forEach(function (g) {
      nav.appendChild(h('button', { type: 'button', 'data-id': g.id, title: g.title, onclick: function () { EF._fromNav = true; show(g.id); EF._fromNav = false; } }, h('span', { class: 'ic' }, UI.icon(g.id)), g.label));
    });
    try { var mc = JSON.parse(localStorage.getItem('ef-models-v2') || 'null'); UI.fillModels(mc && mc.list ? mc.list : EF.node('openrouter').FALLBACK_MODELS); } catch (e) {}
    setTimeout(function () { UI.ensureModels().catch(function () {}); }, 1500);
    var first = null; try { first = localStorage.getItem('ef-tab'); } catch (e3) {}
    show(first || 'agent');
    if (EF.updates) EF.updates.boot();
    if (EF.spend) EF.spend.boot();
    EF.loadHostScript().then(function () { return EF.host('ping', {}); }).then(function (r) { UI.status('متصل بـ ' + (r.app || 'Premiere')); }).catch(function (e) { UI.status('مش متصل ببريمير', 'err'); console.warn(e); });
  }
  /** Node didn't start inside the panel: say why and what to do instead of a blank panel */
  function bootFailed(err) {
    var v = document.getElementById('view'), sp = document.getElementById('splash'); if (sp) sp.remove();
    var node = typeof process !== 'undefined' && process.versions ? process.versions.node : 'مش متاح';
    UI.empty(v).appendChild(UI.card('الإضافة مااشتغلتش',
      UI.hint('الجزء اللي بيشغّل الأدوات (Node.js جوه بريمير) مافتحش. جرّب: اقفل بريمير خالص وافتحه تاني. لو فضلت كده، شغّل ملف التثبيت تاني (install-mac.command) وابعتلي النص اللي تحت.'),
      h('pre', { class: 'err ltr' }, 'EditFast boot error\nNode: ' + node + '\n' + ((err && err.stack) || err))));
    UI.status('الإضافة مااشتغلتش', 'err');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

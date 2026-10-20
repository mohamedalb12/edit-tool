/* مربع الأوامر (زي Excalibur): ⌘K / Ctrl+K — اكتب اسم أي أداة أو أمر أو إفكت بريمير ونفّذه من غير ماوس. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  // Arabic / slang words people type → the English effect names Premiere uses
  var ALIAS = {
    'بلور': 'blur', 'تغبيش': 'blur', 'ضبابي': 'blur', 'لون': 'lumetri color', 'الوان': 'lumetri color', 'ألوان': 'lumetri color', 'كلر': 'lumetri color',
    'ابيض واسود': 'black & white', 'أبيض وأسود': 'black & white', 'شارب': 'sharpen', 'حدة': 'sharpen', 'قص': 'crop', 'كروب': 'crop',
    'ترانزيشن': 'dissolve', 'ديزولف': 'dissolve', 'اسود': 'dip to black', 'فيد': 'dip to black', 'ضوضاء': 'denoise', 'دوشة': 'denoise', 'نويز': 'denoise',
    'ايكولايزر': 'equalizer', 'ليميتر': 'limiter', 'صدى': 'reverb', 'زووم': 'zoom', 'هزة': 'shake', 'ميرور': 'mirror', 'جلو': 'glow'
  };
  var fx = null, box = null;
  // Premiere and After Effects keep their own lists
  function key(k) { return 'ef-pal-' + k + (EF.app === 'ae' ? '-ae' : ''); }

  function norm(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').trim(); }
  function load(k) { try { return JSON.parse(localStorage.getItem(key(k)) || '[]'); } catch (e) { return []; } }
  function recent() { return load('recent'); }
  function favs() { return load('fav'); }
  function remember(id) { try { var r = recent().filter(function (x) { return x !== id; }); r.unshift(id); localStorage.setItem(key('recent'), JSON.stringify(r.slice(0, 12))); } catch (e) {} }
  function toggleFav(id) { try { var f = favs(), i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); localStorage.setItem(key('fav'), JSON.stringify(f.slice(0, 30))); } catch (e) {} }

  /** everything the palette can do: screens, EditFast actions, motion presets, and Premiere's own effects */
  function items() {
    if (EF.paletteItems) return EF.paletteItems(); // After Effects: its own tools
    var S = EF.services, out = [];
    (EF.GROUPS || []).forEach(function (g) {
      g.members.forEach(function (m) {
        var t = EF.tabs.find(function (x) { return x.id === m; }); if (!t) return;
        out.push({ id: 'go:' + m, icon: '↗', label: g.title + (g.members.length > 1 ? ' · ' + ((g.names && g.names[m]) || t.label) : ''), kw: m + ' ' + t.label + ' ' + t.title, run: function () { EF.show(m); } });
      });
    });
    var A = function (id, label, kw, fn, busy) { out.push({ id: 'do:' + id, icon: '⚡', label: label, kw: kw, run: function () { return UI.safe(busy || label, fn); } }); };
    A('autozoom', 'زووم تلقائي من الصوت', 'zoom auto punch زووم تلقائي', function () { return S.autoZoom({}).then(function (r) { UI.toast(r.zooms + ' زووم ✓'); }); });
    A('captions', 'نزّل كابشن بريمير', 'captions subtitles srt كابشن ترجمة', function () { return S.addCaptions({}).then(function (r) { UI.toast(r.cues + ' كابشن ✓'); }); });
    A('beats', 'ماركرز على البيت', 'beat music markers بيت ايقاع موسيقى', function () { return S.beatMarkers({}).then(function (r) { UI.toast(r.markers + ' ماركر — ' + r.bpm + ' BPM ✓'); }); });
    A('formats', 'اعمل كل المقاسات (16:9 + 4:5 + 9:16)', 'formats reels vertical مقاسات ريلز طولي', function () { return S.makeFormats({}).then(function (r) { UI.toast(r.sequences.length + ' سيكوينس ✓'); }); });
    A('undo', 'رجّع آخر حاجة عملتها EditFast', 'undo تراجع رجوع', function () { return S.undoLast().then(function (r) { UI.toast(r.message); }); });
    A('stopdl', 'وقف التحميل', 'stop download cancel وقف تحميل', function () { var r = S.downloadCancel(); UI.toast(r.stopped ? 'بيوقف…' : 'مفيش تحميل شغال'); });
    var M = window.EFMotion;
    if (M && M.PRESETS) M.PRESETS.forEach(function (p) {
      out.push({ id: 'mo:' + p.id, icon: '🎬', label: 'حركة: ' + p.name, kw: p.id.replace(/-/g, ' ') + ' motion حركة', run: function () {
        return UI.safe('بيحط الحركة', function () { return S.applyMotion({ preset: p.id, level: 2, useSelection: true }).then(function () { UI.toast(p.name + ' ✓'); }); });
      } });
    });
    if (fx) {
      var add = function (list, kind, icon, word) {
        (list || []).forEach(function (n) {
          out.push({ id: kind + ':' + n, icon: icon, label: word + n, kw: n + ' ' + kind, ltr: true, run: function () {
            return UI.safe('بيحط ' + n, function () { return S.applyEffect({ name: n, kind: kind }).then(function (r) { UI.toast(n + ' اتحط على ' + r.applied + ' كليب ✓'); }); });
          } });
        });
      };
      add(fx.video, 'video', '✨', 'إفكت: '); add(fx.transitions, 'transition', '🔀', 'ترانزيشن: '); add(fx.audio, 'audio', '🔊', 'صوت: ');
    }
    return out;
  }

  /** every word typed must be found (Arabic words also through ALIAS); earlier / whole-word hits rank first */
  function rank(list, q) {
    var r = recent(), fv = favs();
    q = norm(q);
    if (!q) {
      // ⭐ favourites, then 🕘 recent, then the main actions
      var byId = {}; list.forEach(function (x) { byId[x.id] = x; });
      var seen = {}, out = [];
      var take = function (x, section) { if (x && !seen[x.id]) { seen[x.id] = 1; out.push(Object.assign({}, x, { section: section })); } };
      fv.forEach(function (id) { take(byId[id], 'fav'); });
      r.forEach(function (id) { take(byId[id], 'recent'); });
      list.filter(function (x) { return x.id.indexOf('do:') === 0; }).forEach(function (x) { take(x, 'all'); });
      return out.slice(0, 50);
    }
    var aliasHit = null; Object.keys(ALIAS).forEach(function (k) { if (q.indexOf(norm(k)) >= 0) aliasHit = ALIAS[k]; });
    var words = q.split(/\s+/);
    return list.map(function (x) {
      var hay = norm(x.label + ' ' + x.kw), score = 0;
      var all = words.every(function (w) { return hay.indexOf(w) >= 0; });
      if (all) { score = 10; if (norm(x.label).indexOf(q) === 0) score += 8; else if (norm(x.label).indexOf(q) >= 0) score += 4; }
      if (aliasHit && hay.indexOf(aliasHit) >= 0) score = Math.max(score, 9);
      if (!score) return null;
      var ri = r.indexOf(x.id); if (ri >= 0) score += 6 - Math.min(5, ri);
      if (fv.indexOf(x.id) >= 0) score += 7;
      if (x.id.indexOf('do:') === 0 || x.id.indexOf('go:') === 0) score += 1;
      return { x: x, s: score };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s || a.x.label.length - b.x.label.length; }).slice(0, 40).map(function (o) { return o.x; });
  }

  function close() { if (box) { box.remove(); box = null; } }
  function open() {
    if (box) return close();
    var S = EF.services; if (!S) return;
    var input = h('input', { class: 'pal-in', placeholder: 'اكتب أداة أو أمر أو إفكت… (blur، كابشن، زووم، Cross Dissolve)', autocomplete: 'off', spellcheck: false });
    var list = h('div', { class: 'pal-list' }), hint = h('div', { class: 'pal-hint' }, '↑↓ تختار · Enter تنفّذ · ☆ / Ctrl+D مفضلة · Esc تقفل');
    var all = items(), shown = [], sel = 0;
    function draw() {
      shown = rank(all, input.value); sel = Math.min(sel, Math.max(0, shown.length - 1));
      UI.empty(list);
      if (!shown.length) list.appendChild(h('div', { class: 'pal-empty' }, fx ? 'مفيش حاجة بالاسم ده' : 'مفيش حاجة بالاسم ده — لسه بيحمّل إفكتات بريمير…'));
      var fv = favs(), last = null;
      shown.forEach(function (x, i) {
        if (x.section && x.section !== last) { last = x.section; list.appendChild(h('div', { class: 'pal-sec' }, { fav: '⭐ المفضلة', recent: '🕘 آخر حاجات', all: 'كل الأدوات' }[x.section])); }
        var on = fv.indexOf(x.id) >= 0;
        list.appendChild(h('button', { type: 'button', class: 'pal-item' + (i === sel ? ' on' : ''), 'data-id': x.id, onmouseenter: function () { sel = i; mark(); }, onclick: function () { pick(i); } },
          h('span', { class: 'pal-ic' }, x.icon), h('span', { class: 'grow' + (x.ltr ? ' ltr' : '') }, h('bdi', null, x.label)),
          h('span', { class: 'pal-star' + (on ? ' on' : ''), title: on ? 'شيل من المفضلة' : 'ضيف للمفضلة (Ctrl+D)', onclick: function (e) { e.stopPropagation(); toggleFav(x.id); draw(); } }, on ? '★' : '☆')));
      });
    }
    function mark() { Array.prototype.forEach.call(list.querySelectorAll('.pal-item'), function (c, i) { c.classList.toggle('on', i === sel); if (i === sel && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); }); }
    function pick(i) { var x = shown[i]; if (!x) return; remember(x.id); close(); x.run(); }
    input.addEventListener('input', function () { sel = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(sel); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { if (shown[sel]) { toggleFav(shown[sel].id); draw(); } e.preventDefault(); }
    });
    box = h('div', { class: 'pal-back', onclick: function (e) { if (e.target === box) close(); } }, h('div', { class: 'pal' }, input, list, hint));
    document.body.appendChild(box);
    draw(); input.focus();
    // Premiere's effect names: asked once, then the list redraws with them
    if (!fx && S.effectList && !EF.paletteItems) Promise.resolve().then(function () { return S.effectList(); }).then(function (r) { fx = r; all = items(); if (box) draw(); }).catch(function () { fx = { video: [], audio: [], transitions: [] }; });
  }
  EF.palette = { open: open, close: close, rank: rank, items: items, toggleFav: toggleFav, favs: favs };
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); open(); }
  });
})();

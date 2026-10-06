/* أدوات واجهة صغيرة مشتركة بين التابات. */
(function () {
  var EF = window.EF;
  var UI = EF.ui = {};

  // stroke icons (24×24) — one per tool
  var ICONS = {
    logo: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" fill="#fff" stroke="none"/>',
    agent: '<path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 17l-1.9-5.3L5 9.8l5.1-1.9z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    quickcut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
    autofx: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
    sfx: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    transcribe: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h4M14 15h3M7 11h10"/>',
    multicam: '<rect x="2" y="6" width="13" height="12" rx="2.5"/><path d="M15 10.5l6-3.5v10l-6-3.5z"/>',
    organize: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    curves: '<path d="M3 20C9 20 8 4 14 4s5 8 7 8"/><circle cx="3" cy="20" r="1.4"/><circle cx="21" cy="12" r="1.4"/>',
    library: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    motion: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    titles: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    glass: '<path d="M12 2.8s6.4 7 6.4 11.3a6.4 6.4 0 0 1-12.8 0C5.6 9.8 12 2.8 12 2.8z"/><path d="M9.2 14.6a3 3 0 0 0 2.6 2.8"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.5-4.5"/>',
    broll: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.8"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
    pro: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/><path d="M6 2.5l2 2.5M12 2.5v2.5M18 2.5l-2 2.5"/>',
    auto: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
    reels: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><circle cx="12" cy="10" r="2.6"/><path d="M8.8 16.5a3.6 3.6 0 0 1 6.4 0"/>',
    audio: '<path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="15" r="2"/>',
    thumb: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M6 15.5h7M6 12h5"/><path d="M15 9.5l3.5 2-3.5 2z" fill="currentColor"/>',
    revisions: '<rect x="5" y="3.5" width="14" height="18" rx="2.5"/><path d="M9 3.5V2.5h6v1"/><path d="M8.5 10.5l1.8 1.8 3.5-3.5M8.5 16.5h7"/>',
    templates: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5l1.1 2.3 2.4.35-1.75 1.7.4 2.4-2.15-1.15-2.15 1.15.4-2.4-1.75-1.7 2.4-.35z"/>',
    carousel: '<rect x="8" y="5" width="8" height="12" rx="1.6"/><path d="M5.5 7v8M18.5 7v8M3 8.5v5M21 8.5v5"/><path d="M5 20.5c4.5 1.6 9.5 1.6 14 0"/>',
    icons: '<circle cx="7.5" cy="7.5" r="3.5"/><path d="M16.5 3.5l4 7h-8z"/><rect x="4" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14.2l1.1 2.2 2.4.4-1.7 1.7.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.7 2.4-.4z"/>',
    download: '<path d="M12 3v12M7 10.5l5 5 5-5"/><path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17"/>',
    websearch: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/>',
    safezones: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><rect x="8.5" y="6" width="7" height="9" rx="1" stroke-dasharray="2 1.6"/><path d="M8.5 18h4"/>',
    relink: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'
  };
  UI.icon = function (name) {
    var span = document.createElement('span');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.agent) + '</svg>';
    return span.firstChild;
  };

  // ripple on every button press
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('button.btn');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    var s = document.createElement('span'); s.className = 'ripple';
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(s); setTimeout(function () { s.remove(); }, 650);
  });

  UI.h = function (tag, attrs) {
    var el = document.createElement(tag), i, k, kids = Array.prototype.slice.call(arguments, 2);
    attrs = attrs || {};
    for (k in attrs) {
      if (!attrs.hasOwnProperty(k) || attrs[k] === undefined || attrs[k] === null || attrs[k] === false) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k in el && typeof el[k] !== 'function' && k !== 'list') el[k] = attrs[k];
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (function add(list) {
      // own counter per level: a shared one made nested (and empty) child arrays loop forever
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) { add(c); continue; }
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(kids);
    return el;
  };
  var h = UI.h;

  /** Word-by-word reveal (Arabic letters must stay joined, so we animate whole words). */
  UI.wordFx = function (el, text, opts) {
    opts = opts || {};
    var step = opts.step || 45, i = 0;
    var AR = /[\u0600-\u06FF]/;
    // tokens = words and spaces; consecutive non-Arabic words (e.g. "EditFast AI") stay in ONE isolated LTR span,
    // otherwise inline-block words would be re-ordered by the RTL bidi algorithm
    var tokens = String(text).split(/(\s+)/).filter(function (t) { return t !== ''; }), runs = [];
    tokens.forEach(function (t) {
      var last = runs[runs.length - 1];
      var latin = !AR.test(t) && /[A-Za-z0-9]/.test(t);
      if (latin && last && last.latin) { last.text += (last.pendingSpace || '') + t; last.pendingSpace = ''; return; }
      if (/^\s+$/.test(t)) { if (last && last.latin) { last.pendingSpace = t; return; } runs.push({ space: true, text: t }); return; }
      if (last && last.latin && last.pendingSpace) { runs.push({ space: true, text: last.pendingSpace }); last.pendingSpace = ''; }
      runs.push({ text: t, latin: latin });
    });
    el.textContent = '';
    el.classList.add('wordfx');
    runs.forEach(function (r) {
      if (r.space) { el.appendChild(document.createTextNode(r.text)); return; }
      var sp = document.createElement('span'); sp.className = 'w' + (r.latin ? ' lat' : ''); sp.textContent = r.text;
      sp.style.animationDelay = Math.min(i++, 60) * step + 'ms';
      el.appendChild(sp);
      if (r.pendingSpace) el.appendChild(document.createTextNode(r.pendingSpace));
    });
    return el;
  };

  /** Animated number counter. */
  UI.countUp = function (el, to, fmt, ms) {
    fmt = fmt || function (v) { return Math.round(v); }; ms = ms || 700;
    var t0 = performance.now(), from = 0;
    (function f(now) { var u = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - u, 3); el.textContent = fmt(from + (to - from) * e); if (u < 1) requestAnimationFrame(f); })(t0);
    return el;
  };

  // liquid glass: the specular highlight follows the pointer
  var raf = 0, lastEv = null;
  document.addEventListener('pointermove', function (e) {
    lastEv = e; if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var el = lastEv.target.closest && lastEv.target.closest('.card, .tile, button.btn, .msg, #nav button, .chip');
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (lastEv.clientX - r.left) + 'px');
      el.style.setProperty('--my', (lastEv.clientY - r.top) + 'px');
    });
  });

  UI.card = function (title) { return h('div', { class: 'card' }, title ? UI.wordFx(h('h3'), title, { step: 60 }) : null, Array.prototype.slice.call(arguments, 1)); };
  UI.row = function () { return h('div', { class: 'row' }, Array.prototype.slice.call(arguments)); };
  UI.field = function (label, input) { return h('div', { class: 'row' }, h('label', null, label), input); };
  UI.hint = function (t) { return h('p', { class: 'hint' }, t); };
  UI.btn = function (label, onclick, cls) { return h('button', { class: 'btn ' + (cls || ''), onclick: onclick, type: 'button' }, label); };

  UI.seg = function (options, value, onchange) {
    var wrap = h('div', { class: 'seg' });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: o.value === value ? 'on' : '', onclick: function () {
        Array.prototype.forEach.call(wrap.children, function (x) { x.className = ''; });
        b.className = 'on'; onchange(o.value);
      } }, o.label);
      wrap.appendChild(b);
    });
    return wrap;
  };

  UI.select = function (options, value, onchange) {
    var s = h('select', { onchange: function () { onchange && onchange(s.value); } });
    options.forEach(function (o) { var op = h('option', { value: o.value }, o.label); if (String(o.value) === String(value)) op.selected = true; s.appendChild(op); });
    return s;
  };

  UI.slider = function (min, max, step, value, fmt, onchange) {
    var out = h('span', { class: 'pill ltr' }, fmt(value));
    function fill() { r.style.setProperty('--p', ((+r.value - min) / ((max - min) || 1) * 100) + '%'); }
    var r = h('input', { type: 'range', min: min, max: max, step: step, value: value, class: 'grow filled', oninput: function () { out.textContent = fmt(+r.value); fill(); onchange && onchange(+r.value); } });
    fill();
    return h('div', { class: 'row grow', style: { margin: 0 } }, r, out);
  };

  UI.progress = function () { var bar = h('div'); var p = h('div', { class: 'progress' }, bar); p.set = function (v) { bar.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; }; return p; };

  UI.fmtTime = function (s) {
    s = Math.max(0, s || 0);
    var m = Math.floor(s / 60), sec = (s - m * 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1);
  };

  var toastTimer;
  UI.toast = function (msg, isErr) {
    var t = document.getElementById('toast');
    UI.wordFx(t, msg, { step: 25 }); t.className = 'show wordfx' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, isErr ? 6000 : 3000);
  };

  UI.status = function (msg, kind) {
    var s = document.getElementById('status');
    s.textContent = msg || 'جاهز'; s.className = 'pill' + (kind ? ' ' + kind : '');
  };

  /** Run an async job with busy status + error toast. */
  UI.run = function (label, fn, btn) {
    UI.status(label + '…', 'busy');
    if (btn) btn.disabled = true;
    return Promise.resolve().then(fn).then(function (r) { UI.status('جاهز'); return r; }, function (e) {
      var msg = (e && e.message) || String(e);
      UI.status('خطأ', 'err'); UI.toast(msg, true); console.error(e); throw e;
    }).finally(function () { if (btn) btn.disabled = false; });
  };
  UI.safe = function (label, fn, btn) { return UI.run(label, fn, btn).catch(function () {}); };

  /**
   * مختار الموديل لأي ميزة: قائمة بتدوّر فيها (الـ datalist بتاعة المتصفح مابتظهرش جوه بريمير، فدي معمولة بإيدنا).
   * feature = id الميزة، أو '__default' للموديل العام.
   */
  UI.modelPicker = function (feature, opts) {
    opts = opts || {};
    var S = EF.services;
    function current() { return feature === '__default' ? (S.settings.defaultModel || '') : (S.settings.models[feature] || ''); }
    function effective() { return feature === '__default' ? (S.settings.defaultModel || '') : S.model(feature); }
    var inp = h('input', { class: 'grow ltr mp-input', value: effective(), placeholder: feature === '__default' ? 'من غير (كل ميزة بموديلها)' : '', title: 'دوّر بالاسم أو اكتب أي ID من OpenRouter', autocomplete: 'off', spellcheck: false });
    var tag = h('span', { class: 'mp-tag' });
    var dot = h('span', { class: 'mp-dot', title: '' });
    var list = h('div', { class: 'mp-list', style: { display: 'none' } });
    var wrap = h('div', { class: 'mp' }, h('div', { class: 'mp-row' }, dot, inp, tag), list);
    function paintTag() {
      tag.textContent = current() ? 'متغيّر' : 'افتراضي'; tag.className = 'mp-tag' + (current() ? ' on' : '');
      var t = (EF.modelTests || {})[feature];
      dot.className = 'mp-dot' + (t ? (t.ok ? ' ok' : ' bad') : ''); dot.title = t ? (t.ok ? 'شغّال ✓ ' + t.ms + 'ms' : (t.error || 'فشل')) : 'لسه ماتجرّبش';
    }
    function save(id) {
      id = String(id || '').trim();
      if (feature === '__default') S.saveSettings({ defaultModel: id });
      else { var models = Object.assign({}, S.settings.models); if (id) models[feature] = id; else delete models[feature]; S.saveSettings({ models: models }); }
      inp.value = effective(); paintTag(); hideList();
      if (opts.onChange) opts.onChange(id);
      UI.toast(id ? 'الموديل: ' + id + ' ✓' : 'رجع للافتراضي: ' + (effective() || '—'));
    }
    function hideList() { list.style.display = 'none'; }
    function fmt(p) { return p == null || isNaN(p) ? '' : (p < 0.01 ? 'مجاني' : '$' + (p >= 10 ? Math.round(p) : p.toFixed(2))); }
    function showList(e) {
      UI.empty(list);
      // just opened → show everything; filter only once the user types
      var q = e && e.type === 'input' ? inp.value.trim().toLowerCase() : '', all = EF.modelList || [];
      var exact = all.some(function (m) { return m.id === inp.value.trim(); });
      var hits = all.filter(function (m) { return !q || exact || (m.id + ' ' + (m.name || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 80);
      if (!all.length) list.appendChild(h('div', { class: 'mp-empty' }, 'بيجيب قائمة الموديلات…'));
      else if (!hits.length) list.appendChild(h('div', { class: 'mp-empty' }, 'مفيش موديل بالاسم ده — Enter يحفظه زي ما هو'));
      hits.forEach(function (m) {
        list.appendChild(h('div', { class: 'mp-item' + (m.id === effective() ? ' on' : ''), onmousedown: function (e) { e.preventDefault(); save(m.id); } },
          h('div', { class: 'grow' }, h('div', { class: 'mp-name' }, m.name || m.id), h('div', { class: 'mp-id ltr' }, m.id)),
          h('div', { class: 'mp-meta ltr' }, (m.tools ? '🛠 ' : '') + (m.vision ? '👁 ' : '') + (m.price ? fmt(m.price.in) + '/' + fmt(m.price.out) : ''))));
      });
      if (current()) list.appendChild(h('div', { class: 'mp-item reset', onmousedown: function (e) { e.preventDefault(); save(''); } }, '↺ رجّع الافتراضي'));
      list.style.display = '';
    }
    inp.addEventListener('focus', function () { inp.select(); var re = function () { if (document.activeElement === inp) showList(); }; UI.ensureModels().then(re, re); showList(); });
    inp.addEventListener('input', showList);
    inp.addEventListener('blur', function () { setTimeout(function () { hideList(); if (inp.value.trim() !== effective()) inp.value = effective(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = list.querySelector('.mp-item:not(.reset)'); var v = inp.value.trim(); save(first && !(EF.modelList || []).some(function (m) { return m.id === v; }) && v && first.querySelector('.mp-id').textContent.toLowerCase().indexOf(v.toLowerCase()) >= 0 ? first.querySelector('.mp-id').textContent : v); inp.blur(); }
      if (e.key === 'Escape') { inp.blur(); }
    });
    wrap.refresh = function () { inp.value = effective(); paintTag(); };
    (UI._pickers = UI._pickers || []).push(wrap);
    paintTag();
    return opts.bare ? wrap : h('div', { class: 'row' }, h('label', null, 'الموديل'), wrap);
  };
  UI.refreshPickers = function () { (UI._pickers || []).forEach(function (p) { if (document.body.contains(p)) p.refresh(); }); };

  UI.fillModels = function (models) {
    EF.modelList = models || [];
    var dl = document.getElementById('ef-models'); if (!dl) return; dl.innerHTML = '';
    EF.modelList.forEach(function (m) { dl.appendChild(h('option', { value: m.id }, m.name || m.id)); });
  };
  /** OpenRouter's model list is public: fetch it once a day (no key needed) */
  UI.ensureModels = function (force) {
    var cache = null; try { cache = JSON.parse(localStorage.getItem('ef-models-v2') || 'null'); } catch (e) {}
    if (!force && cache && cache.at > Date.now() - 86400000 && cache.list && cache.list.length) { if (!EF.modelList || EF.modelList.length < cache.list.length) UI.fillModels(cache.list); return Promise.resolve(cache.list); }
    if (UI._loadingModels) return UI._loadingModels;
    UI._loadingModels = EF.services.llm.listModels().then(function (ms) {
      try { localStorage.setItem('ef-models-v2', JSON.stringify({ at: Date.now(), list: ms })); } catch (e) {}
      UI.fillModels(ms); UI._loadingModels = null; return ms;
    }, function (e) { UI._loadingModels = null; if (!EF.modelList || !EF.modelList.length) UI.fillModels(EF.node('openrouter').FALLBACK_MODELS); throw e; });
    return UI._loadingModels;
  };

  UI.empty = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
})();

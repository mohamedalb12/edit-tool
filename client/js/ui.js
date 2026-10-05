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
    search: '<circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.5-4.5"/>',
    broll: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.8"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
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
      for (i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) { add(c); continue; }
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(kids);
    return el;
  };
  var h = UI.h;

  UI.card = function (title) { return h('div', { class: 'card' }, title ? h('h3', null, title) : null, Array.prototype.slice.call(arguments, 1)); };
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
    t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
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

  /** مختار الموديل لأي ميزة ذكاء اصطناعي — بيتحفظ في الإعدادات. */
  UI.modelPicker = function (feature) {
    var S = EF.services, cur = S.settings.models[feature] || '';
    var def = S.model(feature);
    var inp = h('input', { list: 'ef-models', class: 'grow ltr', placeholder: def, value: cur, title: 'أي موديل من OpenRouter' });
    inp.addEventListener('change', function () {
      var models = Object.assign({}, S.settings.models); models[feature] = inp.value.trim();
      if (!models[feature]) delete models[feature];
      S.saveSettings({ models: models }); UI.toast('اتحفظ الموديل: ' + S.model(feature));
    });
    return h('div', { class: 'row' }, h('label', null, 'الموديل'), inp);
  };

  UI.fillModels = function (models) {
    var dl = document.getElementById('ef-models'); dl.innerHTML = '';
    models.forEach(function (m) { dl.appendChild(h('option', { value: m.id }, m.name || m.id)); });
  };

  UI.empty = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
})();

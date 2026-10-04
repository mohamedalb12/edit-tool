/* أدوات واجهة صغيرة مشتركة بين التابات. */
(function () {
  var EF = window.EF;
  var UI = EF.ui = {};

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
    var r = h('input', { type: 'range', min: min, max: max, step: step, value: value, class: 'grow', oninput: function () { out.textContent = fmt(+r.value); onchange && onchange(+r.value); } });
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
    return h('div', { class: 'row' }, h('label', null, '🤖 الموديل'), inp);
  };

  UI.fillModels = function (models) {
    var dl = document.getElementById('ef-models'); dl.innerHTML = '';
    models.forEach(function (m) { dl.appendChild(h('option', { value: m.id }, m.name || m.id)); });
  };

  UI.empty = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
})();

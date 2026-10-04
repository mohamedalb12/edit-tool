/* الجسر بين اللوحة وبريمير و Node.js. في وضع التجربة (برّه بريمير) بيستخدم window.EF_TEST. */
(function () {
  var EF = window.EF = window.EF || {};
  EF.isCEP = !!window.__adobe_cep__;
  EF.test = window.EF_TEST || null;

  function decodePath(p) {
    p = decodeURIComponent(p);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows: /C:/...
    return p;
  }
  // client/index.html → extension root
  EF.extRoot = decodePath(location.pathname).replace(/\/client\/[^/]*$/, '');

  EF.node = function (mod) {
    if (EF.test && EF.test.node) return EF.test.node(mod);
    if (typeof require !== 'function') throw new Error('Node.js مش متاح');
    return require(EF.extRoot + '/core/' + mod + '.js');
  };

  EF.evalScript = function (script) {
    return new Promise(function (resolve) { window.__adobe_cep__.evalScript(script, resolve); });
  };

  EF.host = function (name, args) {
    if (EF.test && EF.test.host) return EF.test.host(name, args);
    // non-ASCII (Arabic text, paths) is \u-escaped: evalScript can garble raw UTF-8 on some Premiere builds
    var payload = JSON.stringify(JSON.stringify(args || {})).replace(/[\u007f-\uffff]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
    return EF.evalScript('ef_call(' + JSON.stringify(name) + ',' + payload + ')').then(function (res) {
      var r;
      try { r = JSON.parse(res); } catch (e) { throw new Error('رد غريب من بريمير: ' + String(res).slice(0, 200)); }
      if (!r.ok) throw new Error(r.error || 'خطأ في بريمير');
      return r.data;
    });
  };

  EF.loadHostScript = function () {
    if (!EF.isCEP) return Promise.resolve();
    var p = (EF.extRoot + '/host/host.jsx').replace(/\\/g, '/');
    return EF.evalScript('$.evalFile("' + p + '")');
  };

  EF.pickFolder = function (title) {
    if (EF.test && EF.test.pickFolder) return EF.test.pickFolder();
    var r = window.cep.fs.showOpenDialogEx(false, true, title || 'اختار فولدر', '');
    return r && r.data && r.data[0] || null;
  };
  EF.pickFile = function (title, types) {
    if (EF.test && EF.test.pickFile) return EF.test.pickFile();
    var r = window.cep.fs.showOpenDialogEx(false, false, title || 'اختار ملف', '', types || []);
    return r && r.data && r.data[0] || null;
  };
  EF.openUrl = function (url) {
    if (EF.isCEP && window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(url); else window.open(url, '_blank');
  };
  EF.fileUrl = function (p) {
    if (!p) return '';
    if (/^https?:|^data:|^blob:/.test(p)) return p;
    p = String(p).replace(/\\/g, '/');
    return 'file://' + (p.charAt(0) === '/' ? '' : '/') + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
  };
})();

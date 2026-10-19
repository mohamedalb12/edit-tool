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
  // the same panel code runs in Premiere (host/host.jsx) and After Effects (host/ae.jsx)
  EF.app = window.EF_APP || 'premiere';
  EF.hostScript = EF.app === 'ae' ? 'host/ae.jsx' : 'host/host.jsx';
  EF.appName = EF.app === 'ae' ? 'أفتر إفكتس' : 'بريمير';

  EF.node = function (mod) {
    if (EF.test && EF.test.node) return EF.test.node(mod);
    if (typeof require !== 'function') throw new Error('Node.js مش متاح');
    return require(EF.extRoot + '/core/' + mod + '.js');
  };

  EF.evalScript = function (script) {
    return new Promise(function (resolve) { window.__adobe_cep__.evalScript(script, resolve); });
  };

  // host calls that can legitimately take minutes (cuts, many clips, keyframes); everything else answers in seconds
  var LONG = { removeRanges: 1, multicamApply: 1, placeFiles: 1, buildLayeredScene: 1, applyKeyframes: 1, setVolumeKeys: 1, createSequenceFromClips: 1, relinkApply: 1, selfTest: 1, organizeApply: 1, createCaptions: 1 };
  EF.hostLoaded = null; // null = not tried, true, or the load error text

  EF.host = function (name, args) {
    if (EF.test && EF.test.host) return EF.test.host(name, args);
    // non-ASCII (Arabic text, paths) is \u-escaped: evalScript can garble raw UTF-8 on some Premiere builds
    var payload = JSON.stringify(JSON.stringify(args || {})).replace(/[\u007f-\uffff]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
    var ms = LONG[name] ? 20 * 60000 : 3 * 60000, timer;
    var call = EF.evalScript('ef_call(' + JSON.stringify(name) + ',' + payload + ')').then(function (res) {
      clearTimeout(timer);
      var r;
      try { r = JSON.parse(res); } catch (e) {
        var why = EF.hostLoaded && EF.hostLoaded !== true ? ' — سكريبت الإضافة جوه بريمير ماتحمّلش: ' + EF.hostLoaded : (String(res) === 'EvalScript error.' ? ' — سكريبت الإضافة جوه بريمير مش شغال؛ اقفل اللوحة وافتحها تاني، ولو فضل كده شغّل "افحص بريمير بتاعي" من الإعدادات' : '');
        throw hostErr(name, 'رد غريب من بريمير: ' + String(res).slice(0, 160) + why);
      }
      if (!r.ok) throw hostErr(name, (r.error || 'خطأ في بريمير'), r.line);
      return r.data;
    });
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(hostErr(name, 'بريمير مارجّعش رد بعد ' + Math.round(ms / 60000) + ' دقيقة — ممكن يكون فيه رسالة مفتوحة في بريمير مستنياك، أو العملية تقيلة. بُص على بريمير.')); }, ms);
    });
    return Promise.race([call, timeout]);
  };
  function hostErr(fn, msg, line) {
    var e = new Error(msg);
    e.hostFn = fn; e.hostLine = line;
    return e;
  }

  /** load host.jsx and report a readable reason when it fails (syntax error, wrong path, ExtendScript off) */
  EF.loadHostScript = function () {
    if (!EF.isCEP) return Promise.resolve();
    var p = (EF.extRoot + '/' + EF.hostScript).replace(/\\/g, '/');
    return EF.evalScript('(function(){try{$.evalFile("' + p + '");return typeof ef_call==="function"?"ok":"ef_call missing";}catch(e){return "ERR "+e.message+" (line "+e.line+")";}})()').then(function (r) {
      EF.hostLoaded = r === 'ok' ? true : String(r || 'no answer');
      if (EF.hostLoaded !== true) throw new Error('سكريبت الإضافة جوه بريمير ماتحمّلش: ' + EF.hostLoaded);
      return true;
    });
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
  EF.pickFiles = function (title, types) {
    if (EF.test && EF.test.pickFiles) return EF.test.pickFiles();
    var r = window.cep.fs.showOpenDialogEx(true, false, title || 'اختار ملفات', '', types || []);
    return (r && r.data) || [];
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

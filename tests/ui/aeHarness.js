/* After Effects panel (client/ae.html) in the browser: fake AE services that record every call. */
(function () {
  var cache = {};
  var builtins = { fs: {}, path: { join: function () { return Array.prototype.join.call(arguments, '/'); }, basename: function (p) { return String(p).split('/').pop(); }, dirname: function (p) { return String(p).split('/').slice(0, -1).join('/'); }, extname: function (p) { var m = /\.[^./]+$/.exec(p); return m ? m[0] : ''; } }, os: { homedir: function () { return '/home/test'; } }, child_process: {}, http: {}, https: {}, url: { URL: URL }, zlib: {} };
  function load(name) {
    if (builtins[name]) return builtins[name];
    var file = name.replace(/^\.\//, '').replace(/\.js$/, '');
    if (cache[file]) return cache[file].exports;
    var xhr = new XMLHttpRequest(); xhr.open('GET', '/core/' + file + '.js', false); xhr.send();
    if (xhr.status !== 200) throw new Error('cannot load ' + file);
    var module = { exports: {} }; cache[file] = module;
    new Function('module', 'exports', 'require', '__dirname', 'process', 'Buffer', xhr.responseText)(module, module.exports, load, '/core', { platform: 'linux', env: {} }, undefined);
    return module.exports;
  }

  var calls = window.__calls = [];
  function rec(name, args, result) { calls.push({ name: name, args: args }); return Promise.resolve(typeof result === 'function' ? result(args) : result); }
  var settings = { keys: { openrouter: 'sk-or-test' }, paths: {}, models: {}, defaultModel: '', libraryDirs: [] };
  var tpls = [{ id: 't1', name: 'تايتل برتقالي', path: '/mgt/EditFast/تايتل برتقالي.mogrt', thumb: null, exists: true, fields: [{ name: 'الكلام', type: 'text' }, { name: 'لون 1', type: 'color' }, { name: 'سرعة الحركة %', type: 'slider' }] }];
  var S = {
    settings: settings,
    model: function (f) { return settings.models[f] || 'anthropic/claude-sonnet-5.5'; },
    saveSettings: function (p) { calls.push({ name: 'saveSettings', args: p }); for (var k in p) settings[k] = p[k]; return settings; },
    templatesDir: function () { return '/mgt/EditFast'; },
    templates: function () { return tpls; },
    templateScan: function () { return rec('templateScan', null, { comp: 'Title Card', duration: 6, width: 1920, height: 1080, texts: ['أهلا بيكم'], colors: ['#f97316', '#ffffff'], animated: 3, layers: 4, media: 0, controls: 0 }); },
    templateSave: function (o) { return rec('templateSave', o, { id: 't2', name: o.name, fields: [{ name: 'الكلام', type: 'text' }, { name: 'سرعة الحركة %', type: 'slider' }] }); },
    templateUpdate: function (id) { return rec('templateUpdate', id, tpls[0]); },
    templateOpen: function (id) { return rec('templateOpen', id, { compName: 'x' }); },
    templateRemove: function (id) { calls.push({ name: 'templateRemove', args: id }); tpls = tpls.filter(function (t) { return t.id !== id; }); return { removed: 1 }; },
    applyMotion: function (o) { return rec('applyMotion', o, { layers: 2, keys: 4 }); },
    applyEase: function (o) { return rec('applyEase', o, { segments: 3 }); },
    stagger: function (o) { return rec('stagger', o, { layers: 3, step: o.frames }); },
    anchor: function (o) { return rec('anchor', o, { layers: 1 }); },
    nullController: function (o) { return rec('nullController', o, { name: 'EF Controller', layers: 2 }); },
    addExpression: function (o) { return rec('addExpression', o, { applied: 1, skipped: 0 }); },
    textAnimate: function (o) { return rec('textAnimate', o, { layers: 1 }); },
    addShape: function (o) { return rec('addShape', o, { name: 'EF box' }); },
    lowerThird: function (o) { return rec('lowerThird', o, { layers: 4 }); },
    cameraRig: function (o) { return rec('cameraRig', o, { camera: 'EF Camera' }); },
    parallax: function (o) { return rec('parallax', o, { layers: 3, depth: 600 }); },
    lightRig: function () { return rec('lightRig', null, { lights: 2, casting: 3 }); },
    extrude: function (o) { return rec('extrude', o, { layers: 1, renderer: 'ADBE Advanced 3d' }); },
    render: function (o) { return rec('render', o, { path: '/p/EditFast Renders/Title Card.mp4', ame: !!o.ame }); },
    cleanup: function (o) { return rec('cleanup', o, { removed: 2, moved: 5 }); },
    paletteRead: function () { return rec('paletteRead', null, { colors: [{ hex: '#f97316', count: 3 }, { hex: '#ffffff', count: 1 }] }); },
    paletteApply: function (m) { return rec('paletteApply', m, { changed: 3 }); },
    librarySearch: function () { return [{ id: 'l1', name: 'whoosh fast', ext: 'wav', duration: 0.8 }, { id: 'l2', name: 'light leak', ext: 'mov', duration: 3 }]; },
    libraryPlace: function (o) { return rec('libraryPlace', o, { name: 'x' }); },
    aiPlan: function (q) { return rec('aiPlan', q, { steps: [{ action: 'lowerThird', args: { name: 'أحمد' }, why: 'اسم' }, { action: 'cameraRig', args: { kind: 'push' }, why: 'كاميرا' }], note: '' }); },
    aiRun: function (steps) { return rec('aiRun', steps, { done: steps.map(function (s) { return s.action; }), failed: [] }); },
    selfTest: function () { return rec('selfTest', null, { version: '25.0', mogrtExport: true }); }
  };
  window.EF_TEST = { node: load, services: S, host: function (n, a) { return rec('host:' + n, a, n === 'ping' ? { app: 'After Effects (test)' } : {}); } };
})();

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
    extrude: function (o) { return rec('extrude', o, { layers: 1, renderer: 'ADBE Calder' }); },
    render: function (o) { return rec('render', o, { path: '/p/EditFast Renders/Title Card.mp4', ame: !!o.ame }); },
    cleanup: function (o) { return rec('cleanup', o, { removed: 2, moved: 5 }); },
    paletteRead: function () { return rec('paletteRead', null, { colors: [{ hex: '#f97316', count: 3 }, { hex: '#ffffff', count: 1 }] }); },
    paletteApply: function (m) { return rec('paletteApply', m, { changed: 3 }); },
    librarySearch: function () { return [{ id: 'l1', name: 'whoosh fast', ext: 'wav', duration: 0.8 }, { id: 'l2', name: 'light leak', ext: 'mov', duration: 3 }]; },
    libraryPlace: function (o) { return rec('libraryPlace', o, { name: 'x' }); },
    aiPlan: function (q) { return rec('aiPlan', q, { steps: [{ action: 'lowerThird', args: { name: 'أحمد' }, why: 'اسم' }, { action: 'cameraRig', args: { kind: 'push' }, why: 'كاميرا' }], note: '' }); },
    aiRun: function (steps) { return rec('aiRun', steps, { done: steps.map(function (s) { return s.action; }), failed: [] }); },
    sceneLibrary: function () { return [{ id: 'kinetic-title', name: 'عنوان كاينتك', fields: ['title', 'subtitle', 'color'] }, { id: 'logo-reveal', name: 'ظهور لوجو', fields: ['title', 'color', 'file'] }]; },
    editStyles: function () { return [{ id: 'energetic', name: 'سريع وحماسي' }, { id: 'cinematic', name: 'سينمائي' }]; },
    director: function (o) { o.onStep && o.onStep('بيصمّم المشهد…'); return rec('director', { message: o.message, refs: o.refs, where: o.where, review: o.review }, { action: 'build', say: 'تمام', reference: o.refs.length ? 'برتقالي وخط عريض' : '', result: { layers: 4, keys: 12, comp: 'Intro', warnings: [], skipped: ['VIDEOCOPILOT 3DSaber'] }, review: { ok: false, fixed: 1, say: 'كبّرت الكلام' } }); },
    directorReset: function () { calls.push({ name: 'directorReset' }); return true; },
    libraryScene: function (id, p) { return rec('libraryScene', { id: id, p: p }, { layers: 4, keys: 9, comp: 'Kinetic Title', warnings: [] }); },
    autoEdit: function (o) { o.onStep && o.onStep('بيبني'); return rec('autoEdit', { files: o.files, music: o.music, style: o.style, ratio: o.ratio, brief: o.brief }, { comp: 'EditFast Edit', cuts: 16, bpm: 120, note: '' }); },
    logoStyles: function () { return [{ id: 'draw', name: 'بيترسم' }, { id: 'neon', name: 'نيون' }, { id: '3d', name: 'ثري دي' }]; },
    logoAnimate: function (o) { return rec('logoAnimate', o, { parts: 2, paths: 3, source: 'trace', layers: 5 }); },
    vectorImport: function (o) { return rec('vectorImport', o, { layers: 2 }); },
    morph: function (o) { return rec('morph', o, { stages: 2, paths: 1, points: 48 }); },
    photo3D: function (o) { o.onStep && o.onStep('بيقطّع'); return rec('photo3D', { file: o.file, move: o.move, slices: o.slices }, { slices: 5, depth: 'تقدير' }); },
    imageTo3DModel: function (o) { return rec('imageTo3DModel', { file: o.file }, { file: '/m/x.glb' }); },
    trackFrame: function () { return rec('trackFrame', null, { b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', src: { layer: { name: 'shot.mp4' }, others: [{ name: 'Logo' }] }, time: 0 }); },
    trackFind: function (w, o) { return rec('trackFind', { what: w, corners: o.corners }, { points: [[0.5, 0.5]] }); },
    track: function (o) { o.onStep && o.onStep('بيتتبّع'); return rec('track', { points: o.points, mode: o.mode, text: o.text }, { frames: 50, lost: null, keys: 50 }); },
    characterActions: function () { return [{ id: 'walk', name: 'ماشي' }, { id: 'wave', name: 'بيسلّم' }]; },
    characterAdd: function (o) { return rec('characterAdd', { name: o.name, action: o.action, walkAcross: o.walkAcross }, { layers: 28 }); },
    characterRig: function (o) { return rec('characterRig', o, { layers: 8, expressions: 12, ik: 2 }); },
    lipSync: function (o) { return rec('lipSync', o, { frames: 90, ctrl: 'Ali Ctrl' }); },
    audioReact: function (o) { return rec('audioReact', o, { frames: 90, linked: 1 }); },
    alignLayers: function (o) { return rec('alignLayers', o, { layers: 3 }); },
    sequenceLayers: function (o) { return rec('sequenceLayers', o, { layers: 3 }); },
    explodeShapes: function () { return rec('explodeShapes', null, { layers: 3 }); },
    colorRig: function () { return rec('colorRig', null, { colors: ['#f97316'], linked: 4 }); },
    kitInfo: function () { return { formats: [{ id: 'number', name: 'رقم' }, { id: 'currency', name: 'فلوس' }, { id: 'percent', name: 'نسبة %' }, { id: 'compact', name: 'مختصر' }, { id: 'time', name: 'وقت' }], currencies: ['USD', 'EGP', 'SAR'], counterStyles: [{ id: 'plain', name: 'رقم بس' }, { id: 'ring', name: 'دايرة' }], charts: [{ id: 'column', name: 'أعمدة' }, { id: 'donut', name: 'دونات' }], liquid: [{ id: 'blob-calm', name: 'بلوب هادي' }, { id: 'water-fill', name: 'مية' }], transitions: [{ id: 'zoomIn', name: 'زووم' }, { id: 'glitch', name: 'جليتش' }], physics: [{ id: 'drop', name: 'بتقع' }, { id: 'explode', name: 'بتتفرتك' }], kinetic: [{ id: 'pop', name: 'كلمة كلمة' }, { id: 'highlight', name: 'بتنوّر' }] }; },
    formatNumber: function (v, o) { var n = Number(v).toFixed(o.decimals || 0).replace(/\B(?=(\d{3})+(?!\d))/g, o.separator === undefined ? ',' : o.separator); return (o.format === 'currency' ? '$' : '') + n + (o.format === 'percent' ? '%' : ''); },
    counterAdd: function (o) { return rec('counterAdd', { from: o.from, to: o.to, format: o.format, currency: o.currency, style: o.style, separator: o.separator, arabic: o.arabic }, { layers: 3 }); },
    chartAdd: function (o) { return rec('chartAdd', { type: o.type, title: o.title, data: o.data, format: o.format.format }, { layers: 12 }); },
    liquidAdd: function (o) { return rec('liquidAdd', { preset: o.preset }, { layers: 1 }); },
    transitionApply: function (o) { return rec('transitionApply', { kind: o.kind, duration: o.duration }, { cuts: 2 }); },
    physics: function (o) { return rec('physics', { mode: o.mode }, { bodies: 3, frames: 120 }); },
    previewList: function () { return []; },
    previewMake: function (o) { return rec('previewMake', { kind: o.kind, n: o.ids.length }, { made: o.ids.length }); },
    roto: function (o) { return rec('roto', { mode: o.mode, seconds: o.seconds }, o.mode === 'ai' ? { cutout: 'Person (EF Cutout)', frames: 100 } : { keyed: 'Clip' }); },
    genMedia: function (o) { return rec('genMedia', { prompt: o.prompt, kind: o.kind, removeBg: o.removeBg }, { file: '/gen/x.png' }); },
    surfacePlace: function (o) { return rec('surfacePlace', { n: o.points.length, file: o.file }, { pinned: 'EF Surface', frames: 25 }); },
    trackCamera: function () { return rec('trackCamera', null, { layer: 'Clip' }); },
    multiFormat: function (o) { return rec('multiFormat', { sizes: o.sizes.slice(), fit: o.fit }, { comps: o.sizes.map(function (z) { return { size: z }; }) }); },
    favList: function () { return window.__favs || []; },
    favSave: function (o) { calls.push({ name: 'favSave', args: o }); window.__favs = [{ id: 'f1', name: o.prompt, summary: 'ألوان: #f97316' }]; return { id: 'f1' }; },
    favRemove: function (id) { calls.push({ name: 'favRemove', args: id }); window.__favs = []; return { count: 0 }; },
    favUse: function (id) { return rec('favUse', id, {}); },
    kinetic: function (o) { return rec('kinetic', { audio: o.audio, style: o.style }, { words: 12 }); },
    voiceAd: function (o) { return rec('voiceAd', { audio: o.audio, brief: o.brief, captions: o.captions }, { sentences: 4, say: '' }); },
    highlightPresets: function () { return [{ id: 'blue-rest', name: 'الباقي أزرق والمبنى طبيعي' }, { id: 'bw-rest', name: 'الباقي أبيض وأسود' }, { id: 'gold', name: 'ذهبي' }, { id: 'color-building', name: 'المبنى ملوّن' }, { id: 'focus', name: 'غامق ومبلّر' }]; },
    highlight: function (o) { o.onStep && o.onStep('بيتتبّع'); return rec('highlight', { n: o.points.length, mode: o.mode, preset: o.preset, look: o.look, label: o.label }, { frames: 50, controls: 'EF Highlight 1 Controls', mode: o.mode }); },
    selfTest: function () { return rec('selfTest', null, { version: '25.0', mogrtExport: true }); },
    fullTest: function (o) { o.onStep('(1/2) لوجو · Logo PNG 3d'); return rec('fullTest', {}, { ok: 1, fail: 1, total: 2, report: 'EditFast Motion — اختبار كل الأدوات\n✗ لوجو · Logo PNG 3d → renderer', results: [] }); }
  };
  window.EF_TEST = { node: load, services: S, host: function (n, a) { return rec('host:' + n, a, n === 'ping' ? { app: 'After Effects (test)' } : {}); } };
})();

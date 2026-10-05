/* Injected into the page before the panel boots (browser, not Node).
 * - EF_TEST.node(): tiny CommonJS loader for /core modules (Node built-ins stubbed)
 * - EF_TEST.services: fake services that record every call and return realistic data */
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
  var settings = {
    keys: { openrouter: 'sk-or-test', elevenlabs: 'el', pexels: 'px', pixabay: '' }, paths: { ffmpeg: '', whisper: '', whisperModel: '', baseMogrt: '' },
    models: {}, defaultModel: '', agentLevel: 'strong', dialect: 'egyptian', style: null,
    quickCut: { sensitivity: 5, padding: 0.08, minSilence: 0.35, crossfadeFrames: 2, onCopy: true }, captions: { maxWords: 4, maxDuration: 2.5, singleWord: false }, libraryDirs: ['/lib']
  };
  var seq = { name: 'Main', id: 's1', fps: 25, width: 1920, height: 1080, duration: 30, playhead: 2, markers: [{ time: 4, name: 'm' }],
    video: [{ index: 0, name: 'V1', clips: [{ name: 'talk', start: 0, end: 30, inPoint: 0, mediaPath: '/m/talk.mp4' }] }, { index: 1, name: 'V2', clips: [{ name: 'camB', start: 0, end: 30 }] }],
    audio: [{ index: 0, name: 'A1', clips: [{ name: 'talk', start: 0, end: 30 }] }, { index: 1, name: 'A2', clips: [{ name: 'camB', start: 0, end: 30 }] }] };
  var words = 'إزيكم يا جماعة النهارده هنتكلم عن المونتاج السريع'.split(' ').map(function (w, i) { return { text: w, start: i * 0.5, end: i * 0.5 + 0.4 }; });
  var agentScript = [];

  var S = {
    settings: settings, transcript: null,
    model: function (f) { return settings.models[f] || settings.defaultModel || 'anthropic/claude-sonnet-5.5'; },
    saveSettings: function (p) { calls.push({ name: 'saveSettings', args: p }); for (var k in p) { if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && settings[k] && typeof settings[k] === 'object') Object.assign(settings[k], p[k]); else settings[k] = p[k]; } return settings; },
    reload: function () { return settings; }, tools: { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe', whisper: null },
    fileExists: function () { return false; }, findBaseMogrt: function () { return null; },
    host: function (n, a) { return rec('host:' + n, a, { track: 1 }); },
    seq: function () { return Promise.resolve(seq); },
    setPlayhead: function (t) { return rec('setPlayhead', t, {}); },
    quickCutAnalyze: function (o) { return rec('quickCutAnalyze', o, { cuts: [{ start: 1, end: 1.6 }, { start: 5, end: 6.2 }], removedSeconds: 1.8 }); },
    quickCut: function (o) { return rec('quickCut', o, { removedSeconds: 1.8, ranges: 2, sequence: 'Main - EditFast قص' }); },
    autoEffectsSuggest: function (o) { return rec('autoEffectsSuggest', o, [{ time: 1.2, type: 'sfx', prompt: 'whoosh', reason: 'انتقال' }, { time: 3, type: 'motion', preset: 'punch-in', reason: 'تأكيد' }]); },
    autoEffectsApply: function (l, p) { if (p) p(0.5); return rec('autoEffectsApply', l, { applied: l.length, failed: [] }); },
    translateSfx: function (t) { return rec('translateSfx', t, 'fast whoosh then heavy impact'); },
    generateSfx: function (o) { return rec('generateSfx', o, { file: '/cache/sfx.mp3', prompt: o.prompt }); },
    transcribe: function (o) { S.transcript = { words: words }; if (o.onProgress) o.onProgress('تفريغ 50%'); return rec('transcribe', { dialect: o.dialect }, S.transcript); },
    addCaptions: function (o) { return rec('addCaptions', o, { cues: 3 }); },
    exportSrt: function (d, o) { return rec('exportSrt', d, d + '/captions.srt'); },
    multicamAnalyze: function (o) { return rec('multicamAnalyze', o, { plan: [{ start: 0, end: 4, trackIndex: 0 }, { start: 4, end: 9, trackIndex: 1 }], tracks: [0, 1], summary: { cuts: 1 } }); },
    multicamApply: function (o) { return rec('multicamApply', o, { switches: 1, sequence: 'Main - مالتي كام' }); },
    organizePlan: function () { return rec('organizePlan', null, { moves: [{ nodeId: '1', name: 'a.mp4', from: '(الأساسي)', to: 'فيديو' }, { nodeId: '2', name: 'b.wav', from: '(الأساسي)', to: 'صوت' }], bins: ['فيديو', 'صوت'] }); },
    organizeApply: function (p) { return rec('organizeApply', p, { moved: 2, failed: [] }); },
    curvesRead: function () { return rec('curvesRead', null, { clip: 'talk', props: [{ component: 'Transform', prop: 'Scale', componentIndex: 2, propIndex: 3, keys: [{ t: 1, v: 100 }, { t: 2, v: 150 }] }] }); },
    curvesApply: function (o) { return rec('curvesApply', o, { written: 26 }); },
    librarySearch: function (q) { calls.push({ name: 'librarySearch', args: q }); return [{ id: 'l1', name: 'whoosh fast', category: 'sfx', sub: 'whoosh', ext: 'wav', path: '/lib/whoosh.wav', duration: 1.2 }].filter(function (x) { return !q.category || x.category === q.category; }); },
    libraryAdd: function (d) { return rec('libraryAdd', d, { added: 1, total: 1 }); },
    libraryPlace: function (o) { return rec('libraryPlace', o, { track: 1 }); },
    applyMotion: function (o) { return rec('applyMotion', o, { keys: 12, component: 'Transform' }); },
    addTitle: function (o) { return rec('addTitle', o, { editable: true, mode: 'mogrt' }); },
    search: function (q) { return rec('search', q, [{ start: 3, end: 3.4, context: 'النهارده هنتكلم عن المونتاج' }]); },
    chapters: function (o) { return rec('chapters', o, { chapters: [{ time: 0, title: 'المقدمة' }, { time: 60, title: 'الفكرة' }], youtube: '00:00 المقدمة\n01:00 الفكرة' }); },
    addMarkers: function (m) { return rec('addMarkers', m, { added: m.length }); },
    beatMarkers: function (o) { return rec('beatMarkers', o, { bpm: 120, markers: 32 }); },
    brollSearch: function (o) { return rec('brollSearch', o, { query: 'city night', results: [{ id: 'pexels-v-1', source: 'pexels', type: 'video', thumb: '', preview: '', url: 'https://x/v.mp4', duration: 8 }], errors: [] }); },
    brollPlace: function (o) { return rec('brollPlace', { id: o.item.id, duration: o.duration }, { track: 2 }); },
    askUser: function (q, o) { return S.askUserImpl ? S.askUserImpl(q, o) : Promise.resolve('تمام'); },
    saveStyle: function (st) { settings.style = st; return rec('saveStyle', st, st); },
    glassFrame: function () { return rec('glassFrame', null, null); },
    liquidGlass: function (o) { if (o.onProgress) o.onProgress(0.5); return rec('liquidGlass', { params: o.params }, { track: 2, source: 'talk', duration: 4 }); },
    sequenceSnapshot: function () { return rec('sequenceSnapshot', null, 'السيكوينس: "Main" | رأس التشغيل عند 0:02.0'); },
    testModels: function (o) {
      var res = [{ feature: 'agent_strong', label: 'المونتير الذكي — قوي', model: 'anthropic/claude-sonnet-5.5', ok: true, ms: 840, tools: true, listed: true },
        { feature: 'chapters', label: 'فصول يوتيوب', model: 'bad/model', ok: false, ms: 120, tools: null, listed: false, error: 'OpenRouter 404: No endpoints' }];
      res.forEach(function (r) { if (o && o.onResult) o.onResult(r); });
      return rec('testModels', null, res);
    },
    projectState: function () { return rec('projectState', null, { sequence: 'Main' }); },
    llm: {
      chat: function (req) { calls.push({ name: 'llm.chat', args: { model: req.model, n: req.messages.length } }); return Promise.resolve(agentScript.shift() || { content: 'تمام ✓' }); },
      listModels: function () { return rec('listModels', null, [{ id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5' }, { id: 'openai/gpt-5', name: 'GPT-5' }]); },
      text: function () { return rec('llm.text', null, 'تمام'); }
    }
  };
  window.EF_TEST = {
    node: load, services: S,
    host: function (n, a) { return rec('host:' + n, a, n === 'ping' ? { app: 'Premiere Pro (test)' } : {}); },
    pickFolder: function () { return '/picked/folder'; }, pickFile: function () { return '/picked/file.mogrt'; },
    setAgentScript: function (s) { agentScript = s; }
  };
})();

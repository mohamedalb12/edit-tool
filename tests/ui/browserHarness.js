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
    keys: { openrouter: 'sk-or-test', elevenlabs: 'sk_el', pexels: 'px', pixabay: '' }, paths: { ffmpeg: '', whisper: '', whisperModel: '', baseMogrt: '' },
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
    history: [],
    proEngine: function () { return { installed: true, node: '/usr/bin/node', root: '/x/remotion' }; },
    designProScene: function (o) { return rec('designProScene', o, { width: 1920, height: 1080, fps: 30, duration: 6, theme: {}, background: { type: 'mesh' }, elements: [{ type: 'kineticTitle', from: 0, duration: 3, props: { text: 'أهلا', style: 'rise', highlight: [] } }, { type: 'cta', from: 2.8, duration: 3, position: 'bottom', props: { text: 'اشترك', sub: '' } }] }); },
    renderProScene: function (o) { return rec('renderProScene', { preview: !!o.preview, elements: o.spec.elements.length, bg: o.spec.background.type }, o.preview ? { file: '/tmp/prev.png', spec: o.spec } : { track: 1, file: '/tmp/pro.mp4', spec: o.spec, layered: true, layers: 3 }); },
    installProEngine: function () { return rec('installProEngine', null, { installed: true, node: '/usr/bin/node' }); },
    autoEditSteps: function () { return [{ id: 'transcribe', label: 'تفريغ الكلام', on: true }, { id: 'silences', label: 'شيل السكتات', on: true }, { id: 'hook', label: 'هوك', on: true, ai: true }, { id: 'broll', label: 'B-Roll', on: false, ai: true }]; },
    runAutoEdit: function (steps, onStep) {
      calls.push({ name: 'runAutoEdit', args: steps.filter(function (s) { return s.on; }).map(function (s) { return s.id; }) });
      var res = {};
      steps.forEach(function (st) { if (!st.on) { onStep({ id: st.id, status: 'skip' }); return; } onStep({ id: st.id, status: 'run' }); onStep({ id: st.id, status: 'ok', detail: 'تمام' }); res[st.id] = { ok: true }; });
      S.history.push({ id: 1, at: Date.now(), op: 'removeRanges', group: 'مونتاج تلقائي' });
      return Promise.resolve(res);
    },
    undoLast: function () { S.history.pop(); return rec('undoLast', null, { undone: 1, message: 'اترجع ✓', manual: [] }); },
    makeReels: function (o) { if (o.onProgress) o.onProgress(1, 'talk'); return rec('makeReels', { ratio: o.ratio }, { name: 'Main - ريلز ' + o.ratio }); },
    findShorts: function (o) { return rec('findShorts', o, [{ start: 12, end: 48, title: 'أقوى لحظة', score: 9, reason: 'هوك قوي' }]); },
    makeShort: function (sh, o) { return rec('makeShort', { title: sh.title, reframe: o.reframe, captions: o.captions }, { sequence: 'Short - ' + sh.title, length: 36 }); },
    audioTracksGuess: function () { return Promise.resolve({ voice: 0, music: 1, seq: seq }); },
    cleanAudio: function (o) { if (o.onProgress) o.onProgress(1); return rec('cleanAudio', { track: o.track, strength: o.strength, loudness: o.loudness }, { clips: 1, track: 0 }); },
    duckMusic: function (o) { return rec('duckMusic', o, { speech: 4, keys: 16 }); },
    thumbnailCandidates: function () { return rec('thumbnailCandidates', null, [{ time: 6.5, score: 2.4, image: '/tests/fixtures/face.png' }, { time: 1, score: 1.2, image: '/tests/fixtures/face.png' }]); },
    thumbnailIdeas: function () { return rec('thumbnailIdeas', null, { titles: [{ text: 'السر اللي محدش قالهولك', highlight: 'السر' }], best: 0 }); },
    saveThumbnail: function (b64, name) { return rec('saveThumbnail', { bytes: b64.length, name: name }, '/proj/EditFast Thumbnails/x.png'); },
    addAnimatedCaptions: function (o) { if (o.onProgress) o.onProgress(1); return rec('addAnimatedCaptions', { style: o.style.style, position: o.style.position, anim: o.style.anim, ease: o.style.ease, timing: o.style.timing, animDur: o.style.animDur, wordGap: o.style.wordGap, still: !!o.style.still }, { clips: 5, cues: 5 }); },
    translateCaptions: function (o) { return rec('translateCaptions', o, { cues: 5, lang: o.lang }); },
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
    // ——— new batch: templates, carousel, icons, sfx pack, downloads, web search, safe zones, relink, styles ———
    // ——— client revisions ———
    _rev: { project: '', rounds: [] },
    // ——— spend counter ———
    _spend: [],
    spendSummary: function () {
      var t = 0, by = {}; S._spend.forEach(function (x) { t += x.cost; (by[x.model] = by[x.model] || { id: x.model, cost: 0, calls: 0 }).cost += x.cost; by[x.model].calls++; });
      var d = new Date(), last7 = []; for (var i = 6; i >= 0; i--) { var x = new Date(d); x.setDate(d.getDate() - i); last7.push({ day: x.toISOString().slice(0, 10), cost: i === 0 ? t : i * 0.03 }); }
      return Promise.resolve({ today: t, todayCalls: S._spend.length, month: t + 1.2, monthCalls: S._spend.length + 40, byModel: Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.cost - a.cost; }), last7: last7 });
    },
    revisionsLoad: function () { return rec('revisionsLoad', null, JSON.parse(JSON.stringify(S._rev))); },
    revisionsSplit: function (o) { var R = load('revisions'); var round = { id: 'round-1', at: Date.now(), client: o.client, raw: o.text, items: R.splitOffline(o.text) }; S._rev.rounds.push(round); return rec('revisionsSplit', { text: o.text, client: o.client }, { round: round, ai: false, warning: '' }); },
    revisionsToggle: function (o) { var r = S._rev.rounds.find(function (x) { return x.id === o.roundId; }); var it = r.items.find(function (x) { return x.id === o.itemId; }); it.done = !it.done; return rec('revisionsToggle', o, JSON.parse(JSON.stringify(r))); },
    revisionsMarkers: function (o) { return rec('revisionsMarkers', o, { added: 2 }); },
    revisionsMessage: function (o) { var r = S._rev.rounds.find(function (x) { return x.id === o.roundId; }); var t = load('revisions').messageOffline(r.items, { name: r.client }); r.message = t; return rec('revisionsMessage', o, { text: t, warning: '' }); },
    // ——— updates + editable scenes ———
    version: function () { return '1.2.0'; },
    checkUpdate: function () { var avail = !!window.__updateAvailable; return rec('checkUpdate', null, { current: '1.2.0', latest: avail ? '1.3.0' : '1.2.0', available: avail, info: avail ? { version: '1.3.0', url: 'https://x/EditFast-1.3.0.zip', notes: 'مشاهد لايرز + تحديث تلقائي' } : null, errors: [] }); },
    applyUpdate: function (info, p) { if (p) { p(0.5, 'download'); p(1, 'done'); } return rec('applyUpdate', info.version, { version: info.version, previous: '1.2.0' }); },
    rollbackUpdate: function () { calls.push({ name: 'rollbackUpdate' }); return { version: '1.1.0' }; },
    sceneAt: function () { return rec('sceneAt', null, { id: 'abcd1234', layered: true, sequenceId: 'seq-9', spec: { width: 1920, height: 1080, fps: 30, duration: 4, theme: {}, background: { type: 'mesh' }, elements: [{ type: 'kineticTitle', from: 0, duration: 4, props: { text: 'عنوان قديم', style: 'rise', highlight: [] } }] }, clip: { track: 1, start: 6, end: 10, name: 'EF Scene abcd1234' } }); },
    replaceScene: function (o) { if (o.onProgress) o.onProgress(1); return rec('replaceScene', { id: o.scene.id, text: o.spec.elements[0].props.text }, { track: 1, start: 6, layered: true, layers: 2 }); },
    editSceneAI: function (o) { return rec('editSceneAI', o, { replaced: 'abcd1234', track: 1, start: 6 }); },
    stylePacks: function () { return load('stylePacks').list(); },
    styleEdit: function (o) { if (o.onStep) { o.onStep('بيخطط', 0.2); o.onStep('خلص', 1); } return rec('styleEdit', { style: o.style, count: o.count, brief: o.brief }, { style: o.style, label: load('stylePacks').get(o.style).label, scenes: [{ time: 3, duration: 3, overlay: false, elements: ['collage'] }, { time: 12, duration: 4, overlay: true, elements: ['cutoutTitle'] }] }); },
    templatesList: function () { var T = load('templates'); return { cats: T.CATS, items: T.TEMPLATES.map(function (t) { return { id: t.id, cat: t.cat, label: t.label, overlay: t.overlay, duration: t.spec.duration, fields: T.fields(t), media: T.mediaNeed(t) }; }) }; },
    favorites: function (k) { return (settings.favorites && settings.favorites[k]) || []; },
    toggleFavorite: function (k, id) { settings.favorites = settings.favorites || {}; var l = settings.favorites[k] || []; settings.favorites[k] = l.indexOf(id) >= 0 ? l.filter(function (x) { return x !== id; }) : l.concat([id]); calls.push({ name: 'toggleFavorite', args: id }); return settings.favorites[k]; },
    addTemplate: function (o) { if (o.onProgress) o.onProgress(1); return rec('addTemplate', { id: o.id, values: o.values, preview: !!o.preview, duration: o.duration }, o.preview ? { file: '/tmp/tpl.png' } : { track: 2, start: 2, end: 6 }); },
    sceneFrames: function (o) { return rec('sceneFrames', o, [{ file: '/tests/fixtures/face.png', time: 1 }, { file: '/tests/fixtures/face.png', time: 5 }]); },
    carousel3D: function (o) { if (o.onProgress) o.onProgress(1); return rec('carousel3D', { files: o.files.length, layout: o.layout, speed: o.speed, tilt: o.tilt, background: o.background, preview: !!o.preview, title: o.title }, o.preview ? { file: '/tmp/c.png' } : { track: 1, start: 2, end: 8 }); },
    iconsData: function () { if (!S._icons) { var x = new XMLHttpRequest(); x.open('GET', '/client/vendor/icons/icons.json', false); x.send(); S._icons = JSON.parse(x.responseText); } return S._icons; },
    iconSearch: function (q, cat) { var t = String(q || '').toLowerCase(); return S.iconsData().icons.filter(function (i) { return (!cat || i.cat === cat) && (!t || i.name.toLowerCase().indexOf(t) >= 0 || (i.ar || '').indexOf(t) >= 0); }); },
    addIcon: function (o) { return rec('addIcon', { id: o.id, anim: o.anim, badge: o.badge, label: o.label, bg: o.bg, count: o.count }, { track: 2, start: 2 }); },
    sfxPackList: function () { return [{ id: 'whoosh', label: 'ووش', tags: 'transition' }, { id: 'impact', label: 'إمباكت', tags: 'hit' }, { id: 'pop', label: 'بوب', tags: 'pop' }]; },
    sfxPackFile: function (id) { return '/tmp/' + id + '.wav'; },
    placeSfx: function (o) { return rec('placeSfx', o, { track: 1 }); },
    sfxPackInstall: function () { return rec('sfxPackInstall', null, { files: 30 }); },
    generateMusic: function (o) { return rec('generateMusic', { prompt: o.prompt, seconds: o.seconds, instrumental: o.instrumental }, { file: '/tmp/music.mp3', prompt: 'lofi chill' }); },
    ytdlpBin: function () { return settings.paths.ytdlp === 'none' ? null : '/usr/bin/yt-dlp'; },
    downloadInfo: function (u) { return rec('downloadInfo', u, { id: 'abc', title: 'فيديو تجربة', duration: 212, thumbnail: '', uploader: 'EditFast', heights: [1080, 720, 480], platform: { id: 'youtube', label: 'يوتيوب' } }); },
    downloadMedia: function (o) { if (o.onProgress) o.onProgress(0.5); return rec('downloadMedia', { url: o.url, quality: o.quality, start: o.start, end: o.end, place: o.place }, { file: '/proj/EditFast Media/Downloads/x.mp4', type: 'video', placed: { track: 0 } }); },
    webSearch: function (o) { return rec('webSearch', { q: o.q, type: o.type, sources: o.sources }, { q: o.q, results: [{ id: 'openverse-1', source: 'openverse', type: 'photo', title: 'Cairo tower', url: 'https://x/1.jpg', thumb: '/tests/fixtures/face.png', width: 1600, height: 900, license: 'CC BY 2.0', credit: 'someone', page: 'https://x' }, { id: 'commons-2', source: 'commons', type: 'photo', title: 'Nile', url: 'https://x/2.jpg', thumb: '/tests/fixtures/face.png', width: 800, height: 1200, license: 'CC BY-SA 4.0' }], errors: [{ source: 'google', error: 'no key' }] }); },
    webSearchPage: function (e, q) { return 'https://' + e + '.test/?q=' + encodeURIComponent(q); },
    webImport: function (o) { return rec('webImport', { id: o.item ? o.item.id : null, url: o.url, place: o.place }, { file: '/proj/x.jpg', placed: { track: 2 } }); },
    lookAtFrames: function (o) { return rec('lookAtFrames', o, []); },
    safeZoneCheck: function (o) { return rec('safeZoneCheck', o, { platform: o.platform, vertical: false, score: 75, captionY: 0.8, faces: 8, issues: [{ kind: 'face', time: 4, text: 'الوش قريب من يمين (زراير المنصة)' }, { kind: 'caption', time: null, text: 'الكابشن تحت تحت — هيتغطّى' }] }); },
    safeZoneGuide: function (o) { return rec('safeZoneGuide', o, { track: 3 }); },
    safeCaptions: function (o) { calls.push({ name: 'safeCaptions', args: o }); return { y: 0.73 }; },
    relinkScan: function (o) { return rec('relinkScan', { dirs: o.dirs }, { items: [{ id: 'n1', name: 'talk.mp4', path: '/old/talk.mp4', match: { path: '/new/talk.mp4', score: 0.99, reason: 'نفس الاسم', others: 0 } }, { id: 'n2', name: 'music.wav', path: '/old/music.wav', match: null }], searched: ['/new'], indexed: 120 }); },
    relinkApply: function (items) { return rec('relinkApply', items.map(function (i) { return i.id; }), { done: items.length, failed: [] }); },
    llm: {
      chat: function (req) { calls.push({ name: 'llm.chat', args: { model: req.model, n: req.messages.length } }); return Promise.resolve(agentScript.shift() || { content: 'تمام ✓' }); },
      listModels: function () { return rec('listModels', null, [{ id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5' }, { id: 'openai/gpt-5', name: 'GPT-5' }]); },
      text: function () { return rec('llm.text', null, 'تمام'); }
    }
  };
  window.EF_TEST = {
    node: load, services: S,
    host: function (n, a) { return rec('host:' + n, a, n === 'ping' ? { app: 'Premiere Pro (test)' } : {}); },
    pickFolder: function () { return '/picked/folder'; }, pickFile: function () { return '/picked/file.mogrt'; }, pickFiles: function () { return ['/tests/fixtures/face.png', '/tests/fixtures/face.png', '/tests/fixtures/face.png']; }, writeFile: function () {},
    setAgentScript: function (s) { agentScript = s; },
    spend: function (model, cost) { S._spend.push({ model: model, cost: cost }); if (S.onSpend) S.onSpend(cost); }
  };
})();

'use strict';
// طبقة الخدمات: بتربط الموديولات (أوفلاين/أونلاين) بسكريبت بريمير. اللوحة والوكيل الذكي الاتنين بيستخدموها.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const ff = require('./ffmpeg');
const silence = require('./silence');
const transcribeMod = require('./transcribe');
const captions = require('./captions');
const repeats = require('./repeats');
const searchMod = require('./search');
const chaptersMod = require('./chapters');
const beats = require('./beats');
const multicam = require('./multicam');
const organize = require('./organize');
const curves = require('./curves');
const motion = require('./motionPresets');
const titles = require('./titles');
const library = require('./library');
const broll = require('./broll');
const sfx = require('./sfx');
const autoFx = require('./autoEffects');
const { OpenRouter, modelFor } = require('./openrouter');
const { hash } = require('./util');
const { nodeFetch } = require('./http');

class Services {
  /**
   * host(name, args) → Promise<data>   (calls host/host.jsx via CEP evalScript)
   * renderScene(spec, outPath) → Promise<path>   (canvas renderer living in the panel)
   * askUser(question, options) → Promise<string>
   */
  constructor({ host, renderScene, askUser, fetchImpl, log } = {}) {
    this.host = host;
    this.renderSceneImpl = renderScene;
    this.askUserImpl = askUser;
    this.fetch = fetchImpl || nodeFetch; // Node HTTP: no CORS problems inside Premiere
    this.log = log || (() => {});
    this.reload();
    this.transcript = null; // { seqId, words (timeline time), dialect }
    this.brollCache = new Map();
  }

  reload() {
    this.settings = config.load();
    this.tools = ff.resolveTools(this.settings);
    this.llm = new OpenRouter({ apiKey: this.settings.keys.openrouter, fetchImpl: this.fetch });
    return this.settings;
  }

  saveSettings(patch) { config.update(patch); return this.reload(); }
  model(feature) { return modelFor(feature, this.settings); }
  fileExists(p) { return !!p && fs.existsSync(p); }
  ffmpeg() { return ff.requireTool(this.tools.ffmpeg, 'ffmpeg'); }

  /* ---------- project ---------- */
  async seq() { return this.host('sequenceInfo', {}); }

  async projectState() {
    const s = await this.seq();
    const brief = t => ({ index: t.index, name: t.name, locked: t.locked, clips: t.clips.map(c => ({ name: c.name, start: +c.start.toFixed(2), end: +c.end.toFixed(2), disabled: c.disabled || undefined })) });
    return {
      sequence: s.name, duration: +s.duration.toFixed(2), fps: s.fps, size: `${s.width}x${s.height}`, playhead: +s.playhead.toFixed(2),
      video: s.video.map(brief), audio: s.audio.map(brief),
      transcript: this.transcript && this.transcript.seqId === s.id ? { words: this.transcript.words.length } : null,
      style: this.settings.style || null
    };
  }

  async setPlayhead(t) { return this.host('setPlayhead', { time: +t }); }
  async askUser(q, options) { if (!this.askUserImpl) return 'كمّل باللي تشوفه مناسب'; return this.askUserImpl(q, options); }
  async saveStyle(style) { this.saveSettings({ style: { ...(this.settings.style || {}), ...style } }); return this.settings.style; }

  /** audio clips used for analysis: the given audio track, or the first track that has clips */
  async audioClips(trackIndex) {
    const s = await this.seq();
    let tr = trackIndex !== undefined && trackIndex !== null ? s.audio[trackIndex] : s.audio.find(t => t.clips.length);
    if (!tr || !tr.clips.length) {
      tr = s.video.find(t => t.clips.length); // video-only media (audio inside the file)
      if (!tr) throw new Error('السيكوينس فاضية.');
    }
    return { seq: s, clips: tr.clips.filter(c => c.mediaPath && !c.disabled) };
  }

  /* ---------- القص السريع ---------- */
  async quickCutAnalyze({ sensitivity, padding, minSilence, trackIndex } = {}) {
    const q = this.settings.quickCut;
    const { clips } = await this.audioClips(trackIndex);
    return silence.analyzeClips(this.ffmpeg(), clips, { sensitivity: sensitivity ?? q.sensitivity, padding: padding ?? q.padding, minSilence: minSilence || undefined });
  }

  async quickCut(opts = {}) {
    const q = this.settings.quickCut;
    const res = opts.cuts ? { cuts: opts.cuts } : await this.quickCutAnalyze(opts);
    if (!res.cuts.length) return { removed: 0, message: 'مفيش سكتات تستاهل تتشال' };
    const crossfade = opts.crossfade === false ? 0 : (opts.crossfadeFrames ?? q.crossfadeFrames);
    const s = await this.seq();
    const out = await this.host('removeRanges', { ranges: res.cuts, clone: opts.onCopy ?? q.onCopy, cloneName: `${s.name} - EditFast قص`, crossfadeFrames: crossfade });
    this.transcript = null; // timeline changed
    return { ...out, removedSeconds: +res.cuts.reduce((a, c) => a + c.end - c.start, 0).toFixed(2) };
  }

  /* ---------- التفريغ ---------- */
  async transcribe({ dialect, trackIndex, onProgress } = {}) {
    const d = dialect || this.settings.dialect;
    const { seq, clips } = await this.audioClips(trackIndex);
    const all = [];
    for (const clip of clips) {
      const r = await transcribeMod.transcribe({
        ffmpeg: this.ffmpeg(), whisper: this.tools.whisper, model: this.settings.paths.whisperModel,
        file: clip.mediaPath, start: clip.inPoint, duration: clip.end - clip.start, dialectId: d,
        cacheDir: config.cacheDir('transcripts'), llm: this.settings.keys.openrouter ? this.llm : null,
        spellModel: this.settings.keys.openrouter ? this.model('spellfix') : null, onProgress
      });
      all.push(...transcribeMod.wordsToTimeline(r.words, clip));
    }
    all.sort((a, b) => a.start - b.start);
    this.transcript = { seqId: seq.id, words: all, dialect: d };
    return this.transcript;
  }

  async ensureTranscript() {
    const s = await this.seq();
    if (this.transcript && this.transcript.seqId === s.id) return this.transcript;
    return this.transcribe({});
  }

  async transcriptSentences(from, to) {
    const t = await this.ensureTranscript();
    return transcribeMod.sentences(t.words)
      .filter(s => (from === undefined || s.end >= from) && (to === undefined || s.start <= to))
      .map(s => ({ start: +s.start.toFixed(2), end: +s.end.toFixed(2), text: s.text }));
  }

  /* ---------- الكابشن ---------- */
  async addCaptions(opts = {}) {
    const c = { ...this.settings.captions, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
    const t = await this.ensureTranscript();
    const cues = captions.buildCues(t.words, c);
    const file = path.join(config.cacheDir('captions'), `captions-${hash(JSON.stringify(cues))}.srt`);
    fs.writeFileSync(file, '\ufeff' + captions.toSRT(cues), 'utf8');
    await this.host('createCaptions', { srtPath: file, start: 0 });
    return { cues: cues.length, file };
  }

  async exportSrt(dir, opts = {}) {
    const t = await this.ensureTranscript();
    const file = path.join(dir, 'captions.srt');
    fs.writeFileSync(file, '\ufeff' + captions.toSRT(captions.buildCues(t.words, { ...this.settings.captions, ...opts })), 'utf8');
    return file;
  }

  /* ---------- التكرار والهوك ---------- */
  async removeRepeats({ dryRun = false } = {}) {
    const t = await this.ensureTranscript();
    const r = repeats.findRepeats(t.words);
    if (dryRun || !r.cuts.length) return { found: r.details.length, details: r.details.slice(0, 40) };
    const s = await this.seq();
    const out = await this.host('removeRanges', { ranges: r.cuts, clone: true, cloneName: `${s.name} - EditFast بدون تكرار`, crossfadeFrames: this.settings.quickCut.crossfadeFrames });
    this.transcript = null;
    return { ...out, found: r.details.length };
  }

  async makeHook({ start, end, title }) {
    if (!(end > start)) throw new Error('حدد بداية ونهاية الهوك');
    const s = await this.seq();
    const out = await this.host('makeHook', { start, end, cloneName: `${s.name} - EditFast هوك` });
    if (title) { try { await this.addTitle({ template: 'hook-flash', text: title, time: 0, duration: Math.min(3, end - start) }); } catch (_) {} }
    this.transcript = null;
    return out;
  }

  /* ---------- قوالب الحركة ---------- */
  async applyMotion({ preset, level = 2, time, track, useSelection = false }) {
    const s = await this.seq();
    const g = motion.generate(preset, level, { fps: Math.min(60, Math.round(s.fps || 30)) });
    return this.host('applyKeyframes', { time: time ?? s.playhead, track, mode: g.kind === 'emphasis' ? 'at' : g.kind, duration: g.duration, props: g.props, interpolation: g.interpolation, useSelection });
  }

  /* ---------- التايتلات ---------- */
  findBaseMogrt() {
    const p = this.settings.paths.baseMogrt;
    if (p && fs.existsSync(p)) return p;
    const roots = [];
    if (process.platform === 'win32') {
      const pf = process.env.ProgramFiles || 'C:\\Program Files';
      try { for (const d of fs.readdirSync(path.join(pf, 'Adobe'))) if (/Premiere Pro/i.test(d)) roots.push(path.join(pf, 'Adobe', d, 'Essential Graphics')); } catch (_) {}
      roots.push(path.join(process.env.APPDATA || '', 'Adobe', 'Common', 'Motion Graphics Templates'));
    } else {
      try { for (const d of fs.readdirSync('/Applications')) if (/Premiere Pro/i.test(d)) { const app = fs.readdirSync(path.join('/Applications', d)).find(x => x.endsWith('.app')); if (app) roots.push(path.join('/Applications', d, app, 'Contents', 'Essential Graphics')); } } catch (_) {}
      roots.push(path.join(require('os').homedir(), 'Library', 'Application Support', 'Adobe', 'Common', 'Motion Graphics Templates'));
    }
    const found = [];
    for (const r of roots) { try { library.walk(r).filter(f => f.toLowerCase().endsWith('.mogrt')).forEach(f => found.push(f)); } catch (_) {} }
    const pick = found.find(f => /basic title|title|عنوان/i.test(path.basename(f))) || found[0];
    return pick || null;
  }

  async addTitle({ template, text, time, duration = 3 }) {
    const s = await this.seq();
    const t = titles.get(template);
    const at = time ?? s.playhead;
    const base = this.findBaseMogrt();
    if (base) {
      const placed = await this.host('importMGT', { path: base, time: at, duration, text: text || t.text || 'اكتب العنوان هنا', font: this.settings.style && this.settings.style.font });
      // animate the graphic clip itself: in → out (+ optional emphasis)
      const fps = Math.round(s.fps || 30);
      const gin = motion.generate(t.in, 2, { fps }); const gout = motion.generate(t.out, 2, { fps });
      await this.host('applyKeyframes', { time: at + 0.01, track: placed.track, mode: 'in', duration: gin.duration, props: gin.props, interpolation: gin.interpolation });
      await this.host('applyKeyframes', { time: at + 0.01, track: placed.track, mode: 'out', duration: gout.duration, props: gout.props, interpolation: gout.interpolation, clear: false });
      if (t.emphasis) { const ge = motion.generate(t.emphasis, 2, { fps }); await this.host('applyKeyframes', { time: at + gin.duration + 0.1, track: placed.track, mode: 'at', duration: ge.duration, props: ge.props, interpolation: ge.interpolation, clear: false }); }
      return { ...placed, mode: 'mogrt', editable: true };
    }
    // fallback: render with the scene engine (not editable in Essential Graphics)
    const spec = titles.toScene(template, text, this.settings.style, { duration, width: s.width, height: s.height });
    const r = await this.buildScene({ spec, time: at });
    return { ...r, mode: 'rendered', editable: false, note: 'مفيش MOGRT أساسي — اتعمل التايتل كفيديو شفاف. حدد ملف MOGRT من الإعدادات عشان يبقى قابل للتعديل من Essential Graphics.' };
  }

  /* ---------- المشاهد المتحركة ---------- */
  async buildScene({ spec, time }) {
    if (!this.renderSceneImpl) throw new Error('محرك المشاهد مش متاح هنا');
    const s = await this.seq();
    const full = { width: s.width, height: s.height, fps: Math.round(s.fps) || 30, ...spec, style: { ...(this.settings.style || {}), ...(spec.style || {}) } };
    const transparent = full.background && full.background.type === 'transparent';
    const out = path.join(config.cacheDir('scenes'), `scene-${hash(JSON.stringify(full))}.${transparent ? 'mov' : 'mp4'}`);
    if (!fs.existsSync(out)) await this.renderSceneImpl(full, out, this.ffmpeg());
    const placed = await this.host('placeFile', { path: out, time: time ?? s.playhead, kind: 'video', track: -1, bin: 'EditFast/Scenes' });
    return { ...placed, file: out };
  }

  /* ---------- المؤثرات الصوتية ---------- */
  async translateSfx(text) { return sfx.translatePrompt(this.llm, this.model('sfx_translate'), text); }

  async generateSfx({ prompt, translate = true, duration, influence, time, place = false }) {
    let p = prompt;
    if (translate && this.settings.keys.openrouter) p = await this.translateSfx(prompt);
    const r = await sfx.generate({ apiKey: this.settings.keys.elevenlabs, text: p, durationSeconds: duration, promptInfluence: influence ?? 0.4, outDir: config.cacheDir('sfx'), fetchImpl: this.fetch });
    let placed = null;
    if (place) placed = await this.host('placeFile', { path: r.file, time, kind: 'audio', track: -1, bin: 'EditFast/SFX' });
    return { ...r, prompt: p, placed };
  }

  /* ---------- المؤثرات التلقائية ---------- */
  async autoEffectsSuggest({ density = 'medium' } = {}) {
    const t = await this.ensureTranscript();
    return autoFx.suggest(this.llm, this.model('auto_effects'), t.words, { density, style: this.settings.style });
  }

  async autoEffectsApply(list, onProgress) {
    const done = [], failed = [];
    for (const [i, e] of list.entries()) {
      onProgress && onProgress(i / list.length, e);
      try {
        if (e.type === 'sfx') await this.generateSfx({ prompt: e.prompt, translate: false, duration: e.duration, time: e.time, place: true });
        else await this.applyMotion({ preset: e.preset, level: (this.settings.style && +this.settings.style.motion) || 2, time: e.time });
        done.push(e);
      } catch (err) { failed.push({ ...e, error: err.message }); }
    }
    return { applied: done.length, failed };
  }

  async autoEffects({ density, apply = true } = {}) {
    const list = await this.autoEffectsSuggest({ density });
    if (!apply) return { suggestions: list };
    return { suggestions: list.length, ...(await this.autoEffectsApply(list)) };
  }

  /* ---------- بحث وماركرز ---------- */
  async search(q) { const t = await this.ensureTranscript(); return searchMod.searchWords(t.words, q); }
  async addMarkers(markers) { return this.host('addMarkers', { markers }); }

  async chapters({ addMarkers = false, offline = false } = {}) {
    const t = await this.ensureTranscript();
    const sents = transcribeMod.sentences(t.words);
    let list;
    if (!offline && this.settings.keys.openrouter) { try { list = await chaptersMod.aiChapters(this.llm, this.model('chapters'), sents); } catch (e) { this.log('chapters AI failed: ' + e.message); } }
    if (!list) list = chaptersMod.offlineChapters(sents);
    if (addMarkers) await this.addMarkers(list.map(c => ({ time: c.time, name: c.title, comment: 'EditFast chapter', color: 3 })));
    return { chapters: list, youtube: chaptersMod.formatYouTube(list) };
  }

  async beatMarkers({ trackIndex, every = 1 } = {}) {
    const s = await this.seq();
    const tr = trackIndex !== undefined ? s.audio[trackIndex] : s.audio.slice().reverse().find(t => t.clips.length);
    if (!tr || !tr.clips.length) throw new Error('حط الموسيقى على تراك صوت الأول');
    const markers = []; let bpm = 0;
    for (const c of tr.clips) {
      const r = await beats.detect(this.ffmpeg(), c.mediaPath, { start: c.inPoint, duration: c.end - c.start, every });
      bpm = r.bpm;
      r.beats.forEach((b, i) => markers.push({ time: +(c.start + b).toFixed(3), name: `Beat ${i + 1}`, color: 5 }));
    }
    await this.addMarkers(markers);
    return { bpm, markers: markers.length };
  }

  /* ---------- المالتي كام ---------- */
  async multicamAnalyze({ audioTracks, videoTracks, minShot = 2, wideTrack = -1 } = {}) {
    const s = await this.seq();
    const aIdx = audioTracks && audioTracks.length ? audioTracks : s.audio.filter(t => t.clips.length).map(t => t.index);
    if (aIdx.length < 2) throw new Error('محتاج على الأقل تراكين صوت (صوت كل كاميرا على تراك).');
    const vIdx = videoTracks && videoTracks.length ? videoTracks : aIdx.map((_, i) => i);
    const cams = aIdx.map((ai, i) => {
      const c = s.audio[ai].clips[0];
      return { ...c, trackIndex: vIdx[i] };
    });
    const wideIndex = wideTrack >= 0 ? vIdx.indexOf(wideTrack) : -1;
    const plan = await multicam.analyze(this.ffmpeg(), cams, { minShot, wideIndex });
    return { plan, tracks: vIdx, summary: multicam.summarize(plan, vIdx.map(v => `V${v + 1}`)) };
  }

  async multicamApply({ plan, tracks, clone = true }) {
    const s = await this.seq();
    return this.host('multicamApply', { plan, tracks, clone, cloneName: `${s.name} - EditFast مالتي كام` });
  }

  /* ---------- تنظيم المشروع ---------- */
  async organizePlan() { const r = await this.host('scanProject', {}); return organize.plan(r.items); }
  async organizeApply(plan) { return this.host('organize', { moves: plan.moves }); }

  /* ---------- المنحنيات ---------- */
  async curvesRead() { return this.host('readKeyframes', {}); }
  async curvesApply({ prop, easing, fps }) {
    const s = await this.seq();
    const keys = prop.keys.map(k => ({ t: k.t, v: k.v }));
    const baked = curves.bake(keys, easing, { fps: fps || Math.round(s.fps) || 30 });
    return this.host('writeKeyframes', { componentIndex: prop.componentIndex, propIndex: prop.propIndex, from: keys[0].t, to: keys[keys.length - 1].t, keys: baked });
  }

  /* ---------- المكتبة ---------- */
  libraryItems() { return library.loadIndex(config.dataDir()); }
  librarySearch(q) { return library.search(this.libraryItems(), q); }
  async libraryAdd(dirs, onProgress) {
    const probe = this.tools.ffprobe ? f => ff.probe(this.tools.ffprobe, f) : null;
    const items = await library.scan(dirs, { probe, onProgress });
    const merged = library.mergeIndex(this.libraryItems(), items);
    library.saveIndex(config.dataDir(), merged);
    const known = new Set(this.settings.libraryDirs || []);
    dirs.forEach(d => known.add(d));
    this.saveSettings({ libraryDirs: Array.from(known) });
    return { added: items.length, total: merged.length };
  }
  async libraryPlace({ id, time }) {
    const it = this.libraryItems().find(x => x.id === id);
    if (!it) throw new Error('العنصر مش في المكتبة');
    const kind = (it.category === 'sfx' || it.category === 'music') ? 'audio' : 'video';
    return this.host('placeFile', { path: it.path, time, kind, track: -1, bin: 'EditFast/Library/' + it.category });
  }

  /* ---------- B-Roll ---------- */
  async brollSearch({ q, type = 'video', sources, compact = false }) {
    const query = await broll.keywords(this.settings.keys.openrouter ? this.llm : null, this.model('broll'), q);
    const src = sources || ['pexels', 'pixabay', 'local'].filter(x => x === 'local' ? (this.settings.libraryDirs || []).length : this.settings.keys[x]);
    const r = await broll.search({ sources: src, q: query, type, keys: this.settings.keys, dirs: this.settings.libraryDirs, fetchImpl: this.fetch });
    r.results.forEach(x => this.brollCache.set(x.id, x));
    if (compact) return { query, results: r.results.slice(0, 12).map(x => ({ id: x.id, source: x.source, type: x.type, duration: x.duration, size: x.width ? `${x.width}x${x.height}` : '' })), errors: r.errors };
    return { query, ...r };
  }

  async brollPlace({ id, item, time, duration }) {
    const it = item || this.brollCache.get(id);
    if (!it) throw new Error('اللقطة مش موجودة في نتايج البحث');
    const file = await broll.download(it, config.cacheDir('broll'), { fetchImpl: this.fetch });
    const s = await this.seq();
    return this.host('placeFile', { path: file, time: time ?? s.playhead, kind: 'video', track: -1, duration: duration || (it.type === 'photo' ? 4 : Math.min(it.duration || 5, 6)), bin: 'EditFast/B-Roll' });
  }
}

module.exports = { Services };

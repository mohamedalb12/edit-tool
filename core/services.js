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
const vision = require('./vision');

class Services {
  /**
   * host(name, args) → Promise<data>   (calls host/host.jsx via CEP evalScript)
   * renderScene(spec, outPath) → Promise<path>   (canvas renderer living in the panel)
   * askUser(question, options) → Promise<string>
   */
  constructor({ host, renderScene, renderGlass, analyzeFaces, renderCaptions, renderOverlay, askUser, fetchImpl, log } = {}) {
    // every call that changes the timeline goes through here so it lands in the history (and can be undone)
    this.hostRaw = host;
    this.history = [];
    this.host = (name, args) => this.recordedHost(name, args);
    this.renderSceneImpl = renderScene;
    this.renderGlassImpl = renderGlass;
    this.analyzeFacesImpl = analyzeFaces;
    this.renderCaptionsImpl = renderCaptions;
    this.renderOverlayImpl = renderOverlay;
    this.webCache = new Map();
    this.askUserImpl = askUser;
    this.fetch = fetchImpl || nodeFetch; // Node HTTP: no CORS problems inside Premiere
    this.log = log || (() => {});
    this.reload();
    this.transcript = null; // { seqId, words (timeline time), dialect }
    this.brollCache = new Map();
  }

  /* ---------- السجل والتراجع ---------- */
  /** Group the timeline changes of one user-level action under a label. */
  async op(label, fn) {
    const prev = this._opLabel; this._opLabel = this._opLabel || label;
    try { return await fn(); } finally { this._opLabel = prev; }
  }

  async recordedHost(name, args) {
    const SEQ_OPS = { removeRanges: 1, multicamApply: 1, makeHook: 1 };
    const willClone = SEQ_OPS[name] && args && args.clone !== false && (name !== 'removeRanges' || args.clone);
    let before = null;
    if (willClone) { try { before = await this.hostRaw('activeSequenceId', {}); } catch (_) {} }
    const r = await this.hostRaw(name, args);
    const LABELS = { buildLayeredScene: 'مشهد لايرز', placeFile: 'حط ملف', importMGT: 'تايتل', addMarkers: 'ماركرز', removeRanges: 'قص', multicamApply: 'مالتي كام', makeHook: 'هوك', applyKeyframes: 'حركة', writeKeyframes: 'منحنى', createCaptions: 'كابشن', organize: 'تنظيم', setVolumeKeys: 'صوت', muteTrack: 'كتم تراك' };
    if (!LABELS[name]) return r;
    const e = { id: this.history.length + 1, at: Date.now(), op: name, group: this._opLabel || LABELS[name], undo: null };
    if (name === 'placeFile' || name === 'importMGT') e.undo = { kind: 'removeClip', args: { kind: args.kind || 'video', track: r.track, start: r.start, path: args.path } };
    else if (name === 'buildLayeredScene') e.undo = { kind: 'removeClip', args: { kind: 'video', track: r.track, start: r.start, path: '' } };
    else if (name === 'addMarkers') e.undo = { kind: 'removeMarkers', args: { markers: args.markers.map(m => ({ time: m.time, name: m.name })) } };
    else if (willClone && before && before.id) e.undo = { kind: 'openSequence', args: { id: before.id }, note: `رجوع لـ "${before.name}"` };
    else if (name === 'muteTrack') e.undo = { kind: 'muteTrack', args: { track: args.track, mute: !args.mute } };
    this.history.push(e);
    if (this.onHistory) this.onHistory(this.history);
    return r;
  }

  /** Undo the last action (all its recorded steps). Returns what could / couldn't be undone. */
  async undoLast() {
    if (!this.history.length) return { undone: 0, message: 'مفيش حاجة أرجعها' };
    const last = this.history[this.history.length - 1];
    const group = []; while (this.history.length && this.history[this.history.length - 1].group === last.group && this.history[this.history.length - 1].at >= last.at - 10 * 60000) group.push(this.history.pop());
    let undone = 0; const manual = [];
    // a sequence switch undoes everything that happened inside the copy → do it last, skip the rest
    const seqUndo = group.filter(e => e.undo && e.undo.kind === 'openSequence').pop();
    for (const e of group) {
      if (seqUndo && e !== seqUndo) { undone++; continue; }
      if (!e.undo) { manual.push(e.op); continue; }
      try { if (e.undo.kind.startsWith('svc:')) await this[e.undo.kind.slice(4)](e.undo.args); else await this.hostRaw(e.undo.kind, e.undo.args); undone++; } catch (err) { manual.push(e.op); }
    }
    if (this.onHistory) this.onHistory(this.history);
    return { undone, group: last.group, manual: Array.from(new Set(manual)), message: manual.length ? 'جزء اترجع؛ الباقي (' + Array.from(new Set(manual)).join('، ') + ') رجّعه بـ Ctrl+Z في بريمير' : 'اترجع ✓' };
  }

  /* ---------- المونتاج التلقائي بضغطة ---------- */
  autoEditSteps() {
    const has = k => typeof this[k] === 'function';
    return [
      { id: 'transcribe', label: 'تفريغ الكلام', on: true },
      { id: 'repeats', label: 'شيل التكرار وإعادات التيك', on: true },
      { id: 'silences', label: 'شيل السكتات', on: true },
      { id: 'hook', label: 'هوك قوي في الأول (الذكاء الاصطناعي يختار)', on: true, ai: true },
      { id: 'cleanAudio', label: 'تنضيف الصوت', on: has('cleanAudio') },
      { id: 'zooms', label: 'زووم وحركة على اللحظات المهمة', on: true, ai: true },
      { id: 'broll', label: 'B-Roll على الكلام', on: !!(this.settings.keys.pexels || this.settings.keys.pixabay), ai: true },
      { id: 'sfx', label: 'مؤثرات صوتية على الكلمة', on: !!this.settings.keys.elevenlabs, ai: true },
      { id: 'duck', label: 'توطية الموسيقى تحت الكلام', on: has('duckMusic') },
      { id: 'captions', label: 'كابشن متحرك', on: true },
      { id: 'chapters', label: 'فصول يوتيوب (ماركرز)', on: false, ai: true }
    ].filter(s => s.id !== 'cleanAudio' || has('cleanAudio')).filter(s => s.id !== 'duck' || has('duckMusic'));
  }

  async pickHook() {
    const t = await this.ensureTranscript();
    const sents = transcribeMod.sentences(t.words);
    const res = await this.llm.json({ model: this.model('hook'), system: 'أنت مونتير يوتيوب. اختار أقوى جملة أو جملتين متتاليتين (من 3 لـ 8 ثواني) تشد المشاهد من أول ثانية: سؤال، مفاجأة، نتيجة، رقم. رجّع {"start":ثواني,"end":ثواني,"reason":"..."}', user: sents.map(x => `[${x.start.toFixed(1)}-${x.end.toFixed(1)}] ${x.text}`).join('\n') });
    const start = +res.start, end = +res.end;
    if (!(end > start) || end - start > 12) throw new Error('الموديل اختار هوك مش منطقي');
    return { start, end, reason: res.reason };
  }

  async brollMoments(max = 4) {
    const t = await this.ensureTranscript();
    const sents = transcribeMod.sentences(t.words);
    const res = await this.llm.json({ model: this.model('broll'), system: `اختار لحد ${max} لحظات في الفيديو B-Roll هيخدم فيها الكلام (حاجة ملموسة بتتوصف). لكل لحظة اكتب query إنجليزي قصير لموقع فيديوهات ستوك. رجّع {"moments":[{"time":ثواني,"duration":3,"query":"..."}]}`, user: sents.map(x => `[${x.start.toFixed(1)}] ${x.text}`).join('\n') });
    return (res.moments || []).filter(m => isFinite(m.time) && m.query).slice(0, max);
  }

  /**
   * Run the approved plan step by step. onStep({id, status: 'run'|'ok'|'skip'|'fail', detail})
   */
  async runAutoEdit(steps, onStep) {
    const say = (id, status, detail) => onStep && onStep({ id, status, detail });
    const results = {};
    return this.op('مونتاج تلقائي', async () => {
      for (const st of steps) {
        if (!st.on) { say(st.id, 'skip'); continue; }
        say(st.id, 'run');
        try {
          let d;
          switch (st.id) {
            case 'transcribe': d = (await this.transcribe({})).words.length + ' كلمة'; break;
            case 'repeats': { const r = await this.removeRepeats(); d = (r.found || 0) + ' تكرار'; break; }
            case 'silences': { const r = await this.quickCut({}); d = (r.removedSeconds || 0) + ' ثانية'; break; }
            case 'hook': { const h = await this.pickHook(); await this.makeHook(h); d = `${h.start.toFixed(1)}–${h.end.toFixed(1)}s`; break; }
            case 'cleanAudio': { const r = await this.cleanAudio({}); d = r.clips + ' كليب'; break; }
            case 'zooms': { const list = (await this.autoEffectsSuggest({ density: 'medium' })).filter(e => e.type === 'motion'); const r = await this.autoEffectsApply(list); d = r.applied + ' حركة'; break; }
            case 'broll': { const ms = await this.brollMoments(); let n = 0; for (const m of ms) { try { const r = await this.brollSearch({ q: m.query, type: 'video' }); if (r.results[0]) { await this.brollPlace({ item: r.results[0], time: m.time, duration: m.duration || 3 }); n++; } } catch (_) {} } d = n + ' لقطة'; break; }
            case 'sfx': { const list = (await this.autoEffectsSuggest({ density: 'medium' })).filter(e => e.type === 'sfx'); const r = await this.autoEffectsApply(list); d = r.applied + ' مؤثر'; break; }
            case 'duck': { const r = await this.duckMusic({}); d = r.keys + ' نقطة'; break; }
            case 'captions': { const r = this.addAnimatedCaptions ? await this.addAnimatedCaptions({}) : await this.addCaptions({}); d = (r.cues || r.clips || 0) + ' كارت'; break; }
            case 'chapters': { const r = await this.chapters({ addMarkers: true }); d = r.chapters.length + ' فصل'; break; }
            default: d = '';
          }
          results[st.id] = { ok: true, detail: d }; say(st.id, 'ok', d);
        } catch (e) { results[st.id] = { ok: false, error: e.message }; say(st.id, 'fail', e.message); }
      }
      return results;
    });
  }

  reload() {
    this.settings = config.load();
    this.tools = ff.resolveTools(this.settings);
    this.llm = new OpenRouter({ apiKey: this.settings.keys.openrouter, fetchImpl: this.fetch, onUsage: (model, u) => this.recordSpend(model, u) });
    return this.settings;
  }

  /* ---------- كام اتصرف ---------- */
  recordSpend(model, usage) {
    const C = require('./cost');
    const cost = C.costOfUsage(usage, model, require('./openrouter').catalog.list);
    C.record(config.dataDir(), { model, cost, tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) });
    if (this.onSpend) this.onSpend(cost);
    return cost;
  }
  spendSummary() { return require('./cost').summary(config.dataDir()); }
  /** estimated cost of one run of an AI feature with the model it will use now */
  costEstimate(feature, { minutes } = {}) { const C = require('./cost'); return C.estimate(feature, this.model(feature), require('./openrouter').catalog.list, { minutes }); }

  saveSettings(patch) { config.update(patch); return this.reload(); }
  model(feature) { return modelFor(feature, this.settings); }
  fileExists(p) { return !!p && fs.existsSync(p); }
  ffmpeg() { return ff.requireTool(this.tools.ffmpeg, 'ffmpeg'); }

  /* ---------- project ---------- */
  async seq() { return this.host('sequenceInfo', {}); }

  async projectState() {
    const s = await this.seq();
    const brief = t => ({ index: t.index, name: t.name, locked: t.locked, clips: t.clips.map(c => ({ name: c.name, start: +c.start.toFixed(2), end: +c.end.toFixed(2), disabled: c.disabled || undefined, selected: c.selected || undefined, effects: c.effects && c.effects.length ? c.effects : undefined })) });
    return {
      sequence: s.name, duration: +s.duration.toFixed(2), fps: s.fps, size: `${s.width}x${s.height}`, playhead: +s.playhead.toFixed(2),
      video: s.video.map(brief), audio: s.audio.map(brief), markers: (s.markers || []).map(m => ({ time: +m.time.toFixed(2), name: m.name, comment: m.comment || undefined })),
      transcript: this.transcript && this.transcript.seqId === s.id ? { words: this.transcript.words.length } : null,
      style: this.settings.style || null
    };
  }

  /**
   * Live, compact text picture of the sequence that the AI editor gets with every message:
   * tracks/clips, playhead, selection, markers, effects and the transcript (closest to the playhead first).
   */
  async sequenceSnapshot({ maxChars = 9000 } = {}) {
    const s = await this.seq();
    const T = sec => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), r = sec - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
    const L = [];
    L.push(`السيكوينس: "${s.name}" | المدة ${T(s.duration)} | ${Math.round(s.fps * 100) / 100}fps | ${s.width}x${s.height} | رأس التشغيل عند ${T(s.playhead)}`);
    const under = [];
    const sel = [];
    const track = (t, kind) => {
      const tag = (kind === 'video' ? 'V' : 'A') + (t.index + 1);
      if (!t.clips.length) return;
      const parts = t.clips.slice(0, 30).map(c => {
        if (c.start <= s.playhead && s.playhead < c.end) under.push(`${tag} "${c.name}"`);
        if (c.selected) sel.push(`${tag} "${c.name}" (${T(c.start)}–${T(c.end)})`);
        return `"${c.name}" ${T(c.start)}–${T(c.end)}${c.disabled ? ' [مقفول]' : ''}${c.effects && c.effects.length ? ' {' + c.effects.join('، ') + '}' : ''}`;
      });
      L.push(`${tag}${t.locked ? ' (مقفول)' : ''}: ${parts.join(' | ')}${t.clips.length > 30 ? ` …(+${t.clips.length - 30})` : ''}`);
    };
    s.video.slice().reverse().forEach(t => track(t, 'video'));
    s.audio.forEach(t => track(t, 'audio'));
    L.push(`تحت رأس التشغيل: ${under.length ? under.join('، ') : 'مفيش'}`);
    if (sel.length) L.push(`المختار: ${sel.join('، ')}`);
    if (this._shotCache && this._shotCache.size) { const sh = await this.shots().catch(() => []); if (sh.length > 1) L.push(`تغيير لقطات (${sh.length}): ` + sh.slice(0, 40).map(T).join(' | ')); }
    if (s.markers && s.markers.length) L.push(`ماركرز (${s.markers.length}): ` + s.markers.slice(0, 40).map(m => `${T(m.time)} ${m.name || ''}`.trim()).join(' | '));
    const have = this.transcript && this.transcript.seqId === s.id;
    if (!have) L.push('التفريغ: لسه مفيش تفريغ للسيكوينس دي (استخدم transcribe لو محتاج تعرف الكلام).');
    else {
      const sents = transcribeMod.sentences(this.transcript.words);
      L.push(`التفريغ (${this.transcript.words.length} كلمة، ${sents.length} جملة):`);
      const budget = maxChars - L.join('\n').length - 200;
      // closest sentences to the playhead first, then put them back in time order
      const order = sents.map((x, i) => ({ i, d: x.end < s.playhead ? s.playhead - x.end : Math.max(0, x.start - s.playhead) })).sort((a, b) => a.d - b.d);
      const keep = new Set(); let used = 0;
      for (const o of order) { const line = sents[o.i].text.length + 20; if (used + line > budget) break; keep.add(o.i); used += line; }
      let gap = false;
      sents.forEach((x, i) => {
        if (keep.has(i)) { L.push(`[${T(x.start)}–${T(x.end)}] ${x.text}`); gap = false; }
        else if (!gap) { L.push('…'); gap = true; }
      });
    }
    return L.join('\n');
  }

  /* ---------- عين المونتير ---------- */
  /** topmost picture at timeline time t → { file, srcTime } */
  pictureAt(seq, t, skip) {
    for (let i = seq.video.length - 1; i >= 0; i--) {
      const c = seq.video[i].clips.find(c => c.start <= t + 1e-3 && t < c.end - 1e-3 && !c.disabled && c.mediaPath && !(skip && skip.test(c.mediaPath)));
      if (c) return { file: c.mediaPath, srcTime: c.inPoint + (t - c.start), clip: c.name, track: i };
    }
    return null;
  }

  /** JPEG frames of the sequence at timeline times (default: evenly spread / shot starts). */
  async lookAtFrames({ times, count = 6, width = 512 } = {}) {
    const s = await this.seq();
    let ts = Array.isArray(times) && times.length ? times.slice(0, 12) : null;
    if (!ts) {
      const shots = await this.shots().catch(() => []);
      ts = shots.length >= 2 ? shots.slice(0, count).map(x => x + 0.4) : Array.from({ length: count }, (_, i) => (s.duration * (i + 0.5)) / count);
    }
    const frames = [];
    for (const t of ts) {
      const p = this.pictureAt(s, t);
      if (!p) continue;
      try { frames.push({ time: +t.toFixed(2), clip: p.clip, b64: await vision.frameJpeg(this.ffmpeg(), p.file, p.srcTime, { width }) }); } catch (_) {}
    }
    return frames;
  }

  /** Shot changes on the timeline (offline scene detection, cached per clip). */
  async shots() {
    const s = await this.seq();
    this._shotCache = this._shotCache || new Map();
    const out = [];
    for (const tr of s.video) for (const c of tr.clips) {
      if (!c.mediaPath || c.disabled || /[\\/](glass|pro|scene)-[0-9a-f]+\.(mov|mp4)$/i.test(c.mediaPath)) continue;
      const key = `${c.mediaPath}|${c.inPoint}|${c.end - c.start}`;
      if (!this._shotCache.has(key)) this._shotCache.set(key, await vision.detectShots(this.ffmpeg(), c.mediaPath, { start: c.inPoint, duration: c.end - c.start }).catch(() => []));
      out.push(c.start, ...this._shotCache.get(key).map(t => c.start + (t - c.inPoint)));
    }
    return Array.from(new Set(out.map(t => +t.toFixed(2)))).sort((a, b) => a - b);
  }

  /** Check every AI feature's model on OpenRouter: answers? (and for the editor: can it call tools?) */
  async testModels({ features, onResult } = {}) {
    const { FEATURES } = require('./openrouter');
    const list = (features || FEATURES.map(f => f.id)).map(id => FEATURES.find(f => f.id === id)).filter(Boolean);
    let catalog = null, info = new Map();
    try { const ms = await this.llm.listModels(); ms.forEach(m => info.set(m.id, m)); catalog = new Set(ms.map(m => m.id)); } catch (_) {}
    const tool = { type: 'function', function: { name: 'set_playhead', description: 'Move the playhead', parameters: { type: 'object', properties: { time: { type: 'number' } }, required: ['time'] } } };
    const out = [];
    for (const f of list) {
      const model = this.model(f.id), t0 = Date.now();
      const r = { feature: f.id, label: f.label, model, ok: false, ms: 0, tools: null, listed: catalog ? catalog.has(model) : null, vision: info.has(model) ? info.get(model).vision : null };
      try {
        if (f.tools) {
          const m = await this.llm.chat({ model, maxTokens: 300, tools: [tool], messages: [{ role: 'system', content: 'You are a video editor assistant. Use the tool.' }, { role: 'user', content: 'Move the playhead to 12 seconds.' }] });
          const call = (m.tool_calls || [])[0];
          r.tools = !!(call && call.function && call.function.name === 'set_playhead');
          r.ok = r.tools || !!m.content;
          r.reply = call ? `set_playhead(${call.function.arguments})` : String(m.content || '').slice(0, 80);
        } else {
          const txt = await this.llm.text({ model, user: 'رد بكلمة واحدة بس: تمام', maxTokens: 30 });
          r.ok = !!txt; r.reply = txt.slice(0, 80);
        }
      } catch (e) { r.error = e.message; }
      r.ms = Date.now() - t0;
      out.push(r); if (onResult) onResult(r);
    }
    return out;
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

  /** Animated, word-synced captions rendered as transparent clips on a track above the video. */
  async addAnimatedCaptions({ style, onProgress, ...opts } = {}) {
    if (!this.renderCaptionsImpl) return this.addCaptions(opts);
    const t = await this.ensureTranscript();
    const s = await this.seq();
    const st = { ...(this.settings.captionStyle || {}), ...(style || {}) };
    if (this.settings.style) { st.accent = st.accent || this.settings.style.accent; st.box = st.box || this.settings.style.primary; }
    const c = { ...this.settings.captions, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)), keepWords: true };
    if (st.style === 'bold' && !opts.maxWords) c.maxWords = Math.min(c.maxWords || 4, 3);
    const cues = captions.buildCues(t.words, c);
    if (!cues.length) throw new Error('مفيش كلام اتفرّغ');
    const key = hash(JSON.stringify({ cues, st, w: s.width, h: s.height, fps: s.fps }));
    const clips = await this.renderCaptionsImpl({ cues, width: s.width, height: s.height, fps: Math.round(s.fps) || 30, style: st, outDir: config.cacheDir('captions'), ffmpeg: this.ffmpeg(), hash: key, onProgress });
    const top = s.video.reduce((m, tr, i) => (tr.clips.length ? i : m), 0);
    await this.op('كابشن متحرك', async () => {
      for (const cl of clips) await this.host('placeFile', { path: cl.file, time: cl.start, kind: 'video', track: -1, minTrack: top + 1, duration: +(cl.end - cl.start).toFixed(3), bin: 'EditFast/Captions' });
    });
    return { cues: cues.length, clips: clips.length, style: st.style || 'bold' };
  }

  /** Translate the captions (timing kept) and add them as another caption track. */
  async translateCaptions({ lang = 'English', place = true } = {}) {
    const t = await this.ensureTranscript();
    const cues = captions.buildCues(t.words, this.settings.captions);
    const out = [];
    for (let i = 0; i < cues.length; i += 60) {
      const part = cues.slice(i, i + 60);
      const res = await this.llm.json({ model: this.model('translate'), system: `Translate each subtitle line to ${lang}. Keep it short and natural for subtitles, keep the meaning, keep the order. Return {"lines":[...]} with exactly the same number of lines.`, user: JSON.stringify(part.map(c => c.text)) });
      const lines = Array.isArray(res.lines) && res.lines.length === part.length ? res.lines : part.map(c => c.text);
      part.forEach((c, j) => out.push({ ...c, text: String(lines[j] || c.text) }));
    }
    const file = path.join(config.cacheDir('captions'), `captions-${lang.toLowerCase().replace(/[^a-z]+/g, '-')}-${hash(JSON.stringify(out))}.srt`);
    fs.writeFileSync(file, '\ufeff' + captions.toSRT(out), 'utf8');
    if (place) await this.host('createCaptions', { srtPath: file, start: 0 });
    return { cues: out.length, file, lang };
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

  /* ---------- Liquid Glass ---------- */
  /** The picture the glass sits on: topmost enabled video clip at time t (our own glass renders are skipped). */
  async glassSource(time) {
    const s = await this.seq();
    const t = time ?? s.playhead;
    for (let i = s.video.length - 1; i >= 0; i--) {
      const c = s.video[i].clips.find(c => c.start <= t + 1e-3 && t < c.end - 1e-3 && !c.disabled && c.mediaPath && !/[\\/]glass-[0-9a-f]+\.mov$/i.test(c.mediaPath));
      if (c) return { seq: s, t, clip: c, track: i, srcStart: c.inPoint + (t - c.start), maxDur: c.end - t };
    }
    return { seq: s, t, clip: null, track: -1 };
  }

  /** Still of the current frame (for the panel preview). */
  async glassFrame(time) {
    const g = await this.glassSource(time);
    if (!g.clip) return null;
    const out = path.join(config.cacheDir('glass'), `frame-${hash(g.clip.mediaPath + '|' + g.srcStart.toFixed(2))}.jpg`);
    if (!fs.existsSync(out)) await ff.run(this.ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, g.srcStart)), '-i', g.clip.mediaPath, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', out]);
    return out;
  }

  async liquidGlass({ params = {}, time, onProgress } = {}) {
    if (!this.renderGlassImpl) throw new Error('محرك الليكود جلاس مش متاح هنا');
    const LG = require('./liquidGlass');
    const P = LG.normalize(params);
    const g = await this.glassSource(time);
    const s = g.seq;
    let src = null, dur = P.duration;
    if (g.clip) { dur = Math.min(dur, g.maxDur); src = { mediaPath: g.clip.mediaPath, start: g.srcStart, duration: dur }; }
    P.duration = +dur.toFixed(3);
    const fps = Math.round(s.fps) || 30, width = s.width, height = s.height;
    const out = path.join(config.cacheDir('glass'), `glass-${hash(JSON.stringify({ P, src, width, height, fps }))}.mov`);
    if (!fs.existsSync(out)) await this.renderGlassImpl({ src, width, height, fps, params: P, out, ffmpeg: this.ffmpeg(), onProgress });
    const placed = await this.host('placeFile', { path: out, time: g.t, kind: 'video', track: -1, minTrack: g.track + 1, duration: P.duration, bin: 'EditFast/Liquid Glass' });
    return { ...placed, file: out, source: g.clip ? g.clip.name : null, duration: P.duration };
  }

  /* ---------- مشاهد Pro (Remotion) ---------- */
  proEngine() {
    const pro = require('./proScene');
    const info = pro.engineInfo();
    const node = ff.findBinary('node', this.settings.paths.node);
    return { ...info, node, npm: ff.findBinary(['npm'], this.settings.paths.npm, node ? [path.dirname(node)] : []) };
  }

  /** npm install inside remotion/ (one time, online) */
  async installProEngine(onLine) {
    const e = this.proEngine();
    if (!e.npm) throw new Error('مش لاقي npm — ثبّت Node.js (المثبّت بيعمله) وجرب تاني.');
    // its own npm cache: a root-owned ~/.npm (EACCES, old npm bug) can't break the engine install
    const cache = path.join(config.dataDir(), 'npm-cache'); fs.mkdirSync(cache, { recursive: true });
    await ff.run(e.npm, ['install', '--no-audit', '--no-fund', '--omit=dev', '--cache', cache], { spawn: { cwd: e.root, shell: process.platform === 'win32' }, onStderr: onLine, onStdout: d => onLine && onLine(String(d)) });
    return this.proEngine();
  }

  async designProScene({ brief, duration, transparent = false, style, frames } = {}) {
    if (!brief || !String(brief).trim()) throw new Error('اكتب وصف المشهد');
    const pro = require('./proScene');
    const packs = require('./stylePacks');
    const styleId = packs.get(style) ? style : packs.detect(style || brief);
    const s = await this.seq().catch(() => ({ width: 1920, height: 1080, fps: 30 }));
    // collage / 3D / cinematic scenes look best built from the editor's own shots
    const wantFrames = frames !== undefined ? frames : ['collage', '3d', 'cinematic'].includes(styleId);
    const media = wantFrames ? await this.sceneFrames({ count: 6 }).catch(() => []) : [];
    const raw = await pro.direct(this.llm, this.model('scene'), brief, { style: this.settings.style, duration, transparent, styleId, media });
    return pro.normalize(raw, { width: s.width, height: s.height, fps: Math.round(s.fps) || 30, style: this.settings.style, media: media.map(m => m.file) });
  }

  async renderProScene({ spec, time, preview = false, onProgress, layered, track, minTrack: forceMin }) {
    const pro = require('./proScene');
    const s = await this.seq().catch(() => null);
    // components that show photos (collage, 3D carousel…) but got none: use stills from the editor's own video
    const PHOTO = ['collage', 'polaroid', 'carousel3D', 'card3D', 'mediaFull'];
    const wants = (spec.elements || []).filter(e => PHOTO.includes(e.type) && !(e.props && Array.isArray(e.props.media) && e.props.media.length));
    if (wants.length && s && s.duration) {
      const frames = (await this.sceneFrames({ count: 6, around: time ?? s.playhead, spread: 30 }).catch(() => [])).map(f => f.file);
      if (frames.length) spec = { ...spec, elements: spec.elements.map(e => (wants.includes(e) ? { ...e, props: { ...(e.props || {}), media: frames } } : e)) };
    }
    const full = pro.normalize(spec, { width: s ? s.width : 1920, height: s ? s.height : 1080, fps: s ? Math.round(s.fps) || 30 : 30, style: this.settings.style });
    const e = this.proEngine();
    const transparent = full.background.type === 'transparent';
    const id = hash(JSON.stringify(full)).slice(0, 8);
    // editable layers (a nested sequence) whenever there's more than one thing in the scene
    const useLayers = !preview && !!s && (layered !== undefined ? layered : this.settings.layeredScenes !== false) && (full.elements.length > 1 || !transparent);
    if (useLayers) return this.renderLayeredScene({ full, id, s, time, onProgress, track, forceMin });
    const ext = preview ? 'png' : (transparent ? 'mov' : 'mp4');
    const out = path.join(config.cacheDir('pro'), `pro-${hash(JSON.stringify(full) + (preview ? '|still' : ''))}.${ext}`);
    if (!fs.existsSync(out)) {
      const spec2 = preview ? { ...full, width: Math.round(full.width / 2), height: Math.round(full.height / 2) } : full;
      await pro.render({ node: e.node, spec: spec2, out, still: preview, browserExecutable: this.settings.paths.chrome || undefined, onProgress });
    }
    if (preview || !s) return { file: out, spec: full };
    let minTrack = forceMin || 1;
    if (transparent && !forceMin) { const g = await this.glassSource(time); minTrack = g.track + 1; }
    const placed = await this.host('placeFile', { path: out, time: time ?? s.playhead, kind: 'video', track: track ?? -1, minTrack, duration: full.duration, bin: 'EditFast/Pro Scenes' });
    require('./sceneRegistry').register({ id, spec: full, layered: false, file: out, duration: full.duration });
    return { ...placed, id, layered: false, file: out, spec: full };
  }

  /** Render every layer of a scene (one Remotion run) and nest them as a sequence on the timeline. */
  async renderLayeredScene({ full, id, s, time, onProgress, track, forceMin }) {
    const pro = require('./proScene');
    const e = this.proEngine();
    const L = pro.layers(full);
    const dir = config.cacheDir('pro');
    const files = L.map(l => path.join(dir, `layer-${hash(JSON.stringify(l.spec))}.${(l.spec.background || {}).type === 'transparent' ? 'mov' : 'mp4'}`));
    const todo = L.map((l, i) => ({ spec: l.spec, out: files[i] })).filter(j => !fs.existsSync(j.out));
    if (todo.length) await pro.render({ node: e.node, batch: todo, browserExecutable: this.settings.paths.chrome || undefined, onProgress });
    let minTrack = forceMin || 1;
    if (full.background.type === 'transparent' && !forceMin) { const g = await this.glassSource(time); minTrack = g.track + 1; }
    if (track !== undefined && track >= 0) minTrack = track;
    const name = `EF Scene ${id}`;
    const placed = await this.host('buildLayeredScene', { name, time: time ?? s.playhead, minTrack, duration: full.duration, bin: 'EditFast/Pro Scenes',
      layers: L.map((l, i) => ({ path: files[i], start: l.from, duration: l.duration, name: l.name })) });
    require('./sceneRegistry').register({ id, spec: full, layered: true, sequenceId: placed.sequenceId, layers: L.map((l, i) => ({ name: l.name, kind: l.kind, file: files[i] })), duration: full.duration });
    return { ...placed, id, layered: true, layers: L.length, spec: full };
  }

  /** The scene under the selection (or the playhead): its spec + where it sits. */
  async sceneAt({ time } = {}) {
    const R = require('./sceneRegistry');
    const s = await this.seq();
    const t = time ?? s.playhead;
    const hits = [];
    s.video.forEach((tr, ti) => tr.clips.forEach(c => { if (c.selected || (c.start <= t + 1e-3 && t < c.end - 1e-3)) hits.push({ ...c, track: ti }); }));
    hits.sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0) || b.track - a.track);
    for (const c of hits) { const entry = R.forClip(c); if (entry) return { ...entry, clip: { track: c.track, start: c.start, end: c.end, name: c.name, mediaPath: c.mediaPath } }; }
    return null;
  }

  /** Re-render an edited scene and put it back exactly where the old one was (undo brings the old one back). */
  async replaceScene({ scene, spec, onProgress }) {
    const sc = scene || await this.sceneAt();
    if (!sc) throw new Error('مفيش مشهد من EditFast عند رأس التشغيل أو مختار — اختار المشهد على التايملين');
    const { track, start } = sc.clip;
    await this.hostRaw('removeClip', { kind: 'video', track, start, path: '' });
    const r = await this.op('تعديل مشهد', () => this.renderProScene({ spec, time: start, track, minTrack: track, layered: sc.layered, onProgress }));
    // replace the generic "remove the new clip" undo with one that also restores the old scene
    const last = this.history[this.history.length - 1];
    if (last) last.undo = { kind: 'svc:restoreScene', args: { track: r.track, start: r.start, old: { layered: sc.layered, sequenceId: sc.sequenceId, file: sc.file, duration: sc.duration, track, start } } };
    return { ...r, replaced: sc.id };
  }

  async restoreScene({ track, start, old }) {
    await this.hostRaw('removeClip', { kind: 'video', track, start, path: '' });
    if (old.layered && old.sequenceId) return this.hostRaw('placeSequence', { id: old.sequenceId, time: old.start, track: old.track, duration: old.duration });
    return this.hostRaw('placeFile', { path: old.file, time: old.start, kind: 'video', track: old.track, duration: old.duration, bin: 'EditFast/Pro Scenes' });
  }

  /** "خلّي العنوان أكبر وغيّر اللون للأحمر" → the AI edits the scene's spec, then it's re-rendered in place. */
  async editSceneAI({ instruction, onProgress }) {
    const pro = require('./proScene');
    const sc = await this.sceneAt();
    if (!sc) throw new Error('مفيش مشهد من EditFast عند رأس التشغيل أو مختار');
    // long icon paths stay out of the prompt (cheaper) and come back untouched
    const svgs = sc.spec.elements.map(e => e.props && e.props.svg);
    const lite = { ...sc.spec, elements: sc.spec.elements.map(e => (e.props && e.props.svg ? { ...e, props: { ...e.props, svg: '[icon]' } } : e)) };
    const next = await this.llm.json({ model: this.model('scene'), system: pro.DIRECTOR_SYSTEM(sc.spec.style), maxTokens: 4000,
      user: `ده مشهد موجود:
${JSON.stringify(lite)}

عدّله حسب طلب المونتير وبس (سيب الباقي زي ما هو): ${instruction}
رجّع المشهد كله بنفس الشكل.` });
    (next.elements || []).forEach((e, i) => { if (e && e.props && e.props.svg === '[icon]') e.props.svg = svgs[i] || ''; });
    if (sc.spec.style && !next.style) next.style = sc.spec.style;
    const spec = pro.normalize(next, { width: sc.spec.width, height: sc.spec.height, fps: sc.spec.fps });
    return this.replaceScene({ scene: sc, spec, onProgress });
  }

  /* ---------- ريلز وشورتس ---------- */
  async reframeClip({ clip, ratio = '9:16', onProgress }) {
    if (!this.analyzeFacesImpl) throw new Error('تتبّع الوش مش متاح هنا');
    const reframe = require('./reframe');
    const info = await ff.probe(ff.requireTool(this.tools.ffprobe, 'ffprobe'), clip.mediaPath);
    const duration = clip.end - clip.start;
    const out = path.join(config.cacheDir('reels'), `reel-${hash(clip.mediaPath + '|' + clip.inPoint + '|' + duration + '|' + ratio)}.mp4`);
    if (fs.existsSync(out)) return out;
    const samples = await this.analyzeFacesImpl({ ffmpeg: this.ffmpeg(), file: clip.mediaPath, start: clip.inPoint, duration, srcW: info.width, srcH: info.height, fps: 3, onProgress: p => onProgress && onProgress(p * 0.7) });
    const shots = (await vision.detectShots(this.ffmpeg(), clip.mediaPath, { start: clip.inPoint, duration }).catch(() => [])).map(t => t - clip.inPoint);
    const planRes = reframe.plan(samples, { srcW: info.width, srcH: info.height, ratio, shots });
    await reframe.render(this.ffmpeg(), { file: clip.mediaPath, start: clip.inPoint, duration, srcW: info.width, srcH: info.height, planRes, ratio, out });
    onProgress && onProgress(1);
    return out;
  }

  /** Reframe every clip on V1 and build a new vertical sequence from them (same timing). */
  async makeReels({ ratio = '9:16', onProgress } = {}) {
    const s = await this.seq();
    const clips = (s.video[0] ? s.video[0].clips : []).filter(c => c.mediaPath && !c.disabled);
    if (!clips.length) throw new Error('مفيش كليبات على V1');
    const t0 = clips[0].start, items = [];
    for (let i = 0; i < clips.length; i++) {
      const file = await this.reframeClip({ clip: clips[i], ratio, onProgress: p => onProgress && onProgress((i + p) / clips.length, clips[i].name) });
      items.push({ path: file, time: +(clips[i].start - t0).toFixed(3) });
    }
    return this.op('ريلز', () => this.host('createSequenceFromClips', { name: `${s.name} - ريلز ${ratio}`, items, bin: 'EditFast/Reels' }));
  }

  async findShorts({ count = 3, min = 20, max = 60 } = {}) {
    const t = await this.ensureTranscript();
    const sents = transcribeMod.sentences(t.words);
    const res = await this.llm.json({ model: this.model('shorts'), system: `أنت صانع شورتس/ريلز محترف. من التفريغ ده اختار أقوى ${count} مقاطع منفصلة، كل مقطع من ${min} لـ ${max} ثانية، بيبدأ بهوك وبيخلص بفكرة كاملة. رجّع {"shorts":[{"start":ثواني,"end":ثواني,"title":"عنوان جذاب قصير","score":1-10,"reason":"ليه"}]}`, user: sents.map(x => `[${x.start.toFixed(1)}-${x.end.toFixed(1)}] ${x.text}`).join('\n'), maxTokens: 3000 });
    const out = [];
    for (const sh of (res.shorts || []).sort((a, b) => (b.score || 0) - (a.score || 0))) {
      const a = +sh.start, b = +sh.end;
      if (!(b > a) || b - a < min * 0.6 || b - a > max * 1.3) continue;
      if (out.some(o => a < o.end && b > o.start)) continue;
      out.push({ start: a, end: b, title: String(sh.title || 'Short').slice(0, 60), score: +sh.score || 0, reason: sh.reason || '' });
    }
    return out.slice(0, count);
  }

  async makeShort({ start, end, title = 'Short' }, { reframe = true, captions = true, ratio = '9:16', onProgress } = {}) {
    const s = await this.seq();
    return this.op('شورت: ' + title, async () => {
      const ranges = []; if (start > 0.05) ranges.push({ start: 0, end: start }); if (end < s.duration - 0.05) ranges.push({ start: end, end: s.duration });
      const r = await this.host('removeRanges', { ranges, clone: true, cloneName: `Short - ${title}`, crossfadeFrames: 0 });
      this.transcript = null;
      let reel = null;
      if (reframe) reel = await this.makeReels({ ratio, onProgress });
      if (captions) { try { if (this.addAnimatedCaptions) await this.addAnimatedCaptions({}); else await this.addCaptions({}); } catch (e) { this.log('captions: ' + e.message); } }
      return { sequence: reel ? reel.name : r.sequence, length: +(end - start).toFixed(1) };
    });
  }

  /* ---------- الصوت ---------- */
  /** voice track = the audio track with the most speech-like clips (default A1); music = another track with long clips */
  async audioTracksGuess() {
    const s = await this.seq();
    const used = s.audio.filter(t => t.clips.length);
    const isMusic = t => t.clips.some(c => /music|song|bgm|موسيقى|اغنية|أغنية/i.test(c.name + ' ' + c.mediaPath));
    const voice = used.find(t => !isMusic(t)) || used[0];
    const music = used.find(t => t !== voice && isMusic(t)) || used.find(t => t !== voice);
    return { voice: voice ? voice.index : 0, music: music ? music.index : -1, seq: s };
  }

  async cleanAudio({ track, strength = 'medium', loudness = -16, onProgress } = {}) {
    const audio = require('./audioTools');
    const g = await this.audioTracksGuess();
    const ti = track ?? g.voice, tr = g.seq.audio[ti];
    if (!tr || !tr.clips.length) throw new Error('مفيش صوت على التراك ده');
    const clips = tr.clips.filter(c => c.mediaPath && !c.disabled);
    const files = [];
    for (const [i, c] of clips.entries()) {
      const out = path.join(config.cacheDir('audio'), `clean-${hash(c.mediaPath + '|' + c.inPoint + '|' + (c.end - c.start) + '|' + strength + '|' + loudness)}.wav`);
      if (!fs.existsSync(out)) await audio.cleanFile(this.ffmpeg(), { file: c.mediaPath, start: c.inPoint, duration: c.end - c.start, out, strength, loudness });
      files.push({ file: out, start: c.start, end: c.end });
      onProgress && onProgress((i + 1) / clips.length);
    }
    return this.op('تنضيف الصوت', async () => {
      for (const f of files) await this.host('placeFile', { path: f.file, time: f.start, kind: 'audio', track: -1, minTrack: ti + 1, duration: +(f.end - f.start).toFixed(3), bin: 'EditFast/Audio' });
      await this.host('muteTrack', { track: ti, mute: true });   // the original stays on the timeline, just muted
      return { clips: files.length, track: ti, strength };
    });
  }

  async duckMusic({ voiceTrack, musicTrack, duckDb = -12, attack = 0.25, release = 0.6 } = {}) {
    const audio = require('./audioTools');
    const g = await this.audioTracksGuess();
    const v = voiceTrack ?? g.voice, m = musicTrack ?? g.music;
    if (m < 0 || !g.seq.audio[m] || !g.seq.audio[m].clips.length) throw new Error('مش لاقي تراك موسيقى — حط الموسيقى على تراك صوت لوحدها');
    const speech = await audio.voiceActivity(this.ffmpeg(), g.seq.audio[v].clips.filter(c => c.mediaPath && !c.disabled));
    let keys = 0;
    await this.op('توطية الموسيقى', async () => {
      for (const c of g.seq.audio[m].clips) {
        const k = audio.duckKeys(speech, c, { duckDb, attack, release });
        if (!k.length) continue;
        await this.host('setVolumeKeys', { track: m, clipStart: c.start, keys: k });
        keys += k.length;
      }
    });
    return { keys, speech: speech.length, voiceTrack: v, musicTrack: m, duckDb };
  }

  /* ---------- الثامبنيل ---------- */
  /** Best-looking frames: sample shots + an even spread, score sharpness/exposure/contrast offline. */
  async thumbnailCandidates({ count = 8, samples = 24 } = {}) {
    const T = require('./thumbnail');
    const s = await this.seq();
    const shots = await this.shots().catch(() => []);
    const times = Array.from(new Set([...shots.map(t => t + 0.5), ...Array.from({ length: samples }, (_, i) => s.duration * (i + 0.5) / samples)].map(t => +t.toFixed(2)))).filter(t => t < s.duration).sort((a, b) => a - b);
    const scored = [];
    for (const t of times) {
      const p = this.pictureAt(s, t); if (!p) continue;
      try {
        const { stdout } = await ff.run(this.ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, p.srcTime)), '-i', p.file, '-frames:v', '1', '-vf', 'scale=160:90:force_original_aspect_ratio=disable,format=gray', '-f', 'rawvideo', '-']);
        const st = T.frameStats(new Uint8Array(stdout), 160, 90);
        scored.push({ time: t, file: p.file, srcTime: p.srcTime, score: T.score(st), stats: st });
      } catch (_) {}
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of scored) { if (picked.every(p => Math.abs(p.time - c.time) > s.duration / (count * 2.5))) picked.push(c); if (picked.length >= count) break; }
    for (const c of picked) {
      c.image = path.join(config.cacheDir('thumbnails'), `cand-${hash(c.file + '|' + c.srcTime.toFixed(2))}.jpg`);
      if (!fs.existsSync(c.image)) await ff.run(this.ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, c.srcTime)), '-i', c.file, '-frames:v', '1', '-q:v', '2', c.image]);
    }
    return picked;
  }

  /** AI: catchy titles from the transcript (and, if the model can see, which candidate frame is best). */
  async thumbnailIdeas({ candidates = [] } = {}) {
    const t = await this.ensureTranscript().catch(() => null);
    const text = t ? transcribeMod.sentences(t.words).map(x => x.text).join(' ').slice(0, 6000) : '';
    const msgs = [{ role: 'system', content: 'أنت خبير ثامبنيلز يوتيوب. اقترح 5 عناوين للثامبنيل (2-5 كلمات، قوية وفضولية، بنفس لغة/لهجة الفيديو) ولكل عنوان كلمة واحدة تتلوّن. لو فيه صور، اختار أحلى فريم (فيه وش واضح وتعبير قوي). رجّع JSON: {"titles":[{"text":"...","highlight":"..."}],"best":رقم الصورة من 0}' },
      { role: 'user', content: [{ type: 'text', text: 'كلام الفيديو: ' + (text || '(مفيش تفريغ)') }].concat(candidates.slice(0, 6).map(c => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(c.image).toString('base64') } }))) }];
    let m;
    try { m = await this.llm.chat({ model: this.model('thumbnail'), messages: msgs, maxTokens: 800, jsonMode: true }); }
    catch (e) { if (candidates.length) { msgs[1].content = msgs[1].content.slice(0, 1); m = await this.llm.chat({ model: this.model('thumbnail'), messages: msgs, maxTokens: 800 }); } else throw e; }
    const j = require('./util').extractJson(m.content);
    return { titles: (j.titles || []).filter(x => x && x.text).slice(0, 6), best: Number.isInteger(j.best) ? j.best : 0 };
  }

  /** Save the rendered PNG (base64) next to the project and import it. */
  async saveThumbnail(b64, name = 'thumbnail') {
    let dir = config.cacheDir('thumbnails');
    try { const p = await this.host('projectPath', {}); if (p && p.path) { dir = path.join(path.dirname(p.path), 'EditFast Thumbnails'); fs.mkdirSync(dir, { recursive: true }); } } catch (_) {}
    const file = path.join(dir, `${name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40) || 'thumbnail'}-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    try { await this.host('importFiles', { paths: [file], bin: 'EditFast/Thumbnails' }); } catch (_) {}
    return file;
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
        if (e.type === 'sfx') await this.placeBestSfx({ prompt: e.prompt, duration: e.duration, time: e.time });
        else await this.applyMotion({ preset: e.preset, level: (this.settings.style && +this.settings.style.motion) || 2, time: e.time });
        done.push(e);
      } catch (err) { failed.push({ ...e, error: err.message }); }
    }
    return { applied: done.length, failed };
  }

  /**
   * A sound for a moment: your own library first, then the offline trendy pack, and ElevenLabs only when
   * nothing local fits (and a key is set) — so auto effects work without any paid key.
   */
  async placeBestSfx({ prompt, duration, time }) {
    const lib = this.libraryItems().filter(x => x.category === 'sfx');
    if (lib.length) {
      const hit = library.search(lib, { q: String(prompt || '').split(/\s+/).slice(0, 2).join(' '), category: 'sfx' })[0];
      if (hit) return { source: 'library', ...(await this.host('placeFile', { path: hit.path, time, kind: 'audio', track: -1, bin: 'EditFast/SFX' })) };
    }
    const id = require('./sfxPack').match(prompt);
    if (id) return { source: 'pack', id, ...(await this.placeSfx({ id, time })) };
    if (this.settings.keys.elevenlabs) return { source: 'ai', ...(await this.generateSfx({ prompt, translate: false, duration, time, place: true })) };
    return { source: 'pack', id: 'whoosh', ...(await this.placeSfx({ id: 'whoosh', time })) };
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

  /* ---------- لقطات من السيكونس للمشاهد (كولاج/ثري دي) ---------- */
  /** JPEG stills from the timeline → [{file, time}] (around the playhead, or spread over the whole sequence). */
  async sceneFrames({ count = 6, around, spread, width = 1280 } = {}) {
    const s = await this.seq();
    if (!s.duration) return [];
    let from = 0, to = s.duration;
    if (around !== undefined || spread) { const c = around ?? s.playhead, w = spread || 20; from = Math.max(0, c - w / 2); to = Math.min(s.duration, c + w / 2); }
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = from + ((to - from) * (i + 0.5)) / count;
      // look through our own overlays (pro scenes, glass, captions, guides) to the footage underneath
      const p = this.pictureAt(s, t, /[\\/](glass|pro|scene|caption|safe)[^\\/]*\.(mov|mp4|png)$/i);
      if (!p) continue;
      const file = path.join(config.cacheDir('frames'), `f-${hash(p.file + '|' + p.srcTime.toFixed(2) + '|' + width)}.jpg`);
      if (!fs.existsSync(file)) {
        try { fs.writeFileSync(file, Buffer.from(await vision.frameJpeg(this.ffmpeg(), p.file, p.srcTime, { width }), 'base64')); } catch (_) { continue; }
      }
      out.push({ file, time: +t.toFixed(2) });
    }
    return out;
  }

  /* ---------- مونتاج بالاستايل (كولاج، ثري دي، نيون…) ---------- */
  stylePacks() { return require('./stylePacks').list(); }

  /**
   * The AI plans `count` scenes in the chosen style across the video (one request), Remotion renders them,
   * and they land on the timeline above the footage.
   */
  async styleEdit({ style, brief = '', count = 3, captions = false, onStep } = {}) {
    const packs = require('./stylePacks'), pro = require('./proScene');
    const id = packs.get(style) ? style : packs.detect(style || brief);
    if (!id) throw new Error('اختار استايل: ' + packs.list().map(p => p.label).join('، '));
    const pack = packs.get(id);
    const s = await this.seq();
    if (!s.duration) throw new Error('السيكونس فاضية');
    const step = (m, p) => onStep && onStep(m, p);
    step('بيجهّز لقطات من الفيديو', 0.05);
    const frames = await this.sceneFrames({ count: Math.min(12, Math.max(6, count * 3)) }).catch(() => []);
    let said = [];
    try { said = (await this.transcriptSentences()).slice(0, 80); } catch (_) {}
    const n = Math.max(1, Math.min(8, Math.round(count)));
    const user = [
      `اعمل ${n} مشاهد بالاستايل ده موزّعين على الفيديو (مدته ${s.duration.toFixed(1)} ثانية، ${s.width}x${s.height}).`,
      brief ? `طلب المونتير: ${brief}` : '',
      said.length ? 'الكلام بالتوقيت:\n' + said.map(x => `[${x.start}-${x.end}] ${x.text}`).join('\n') : 'مفيش تفريغ — وزّع المشاهد بالتساوي.',
      pro.mediaText(frames),
      'رجّع: {"scenes":[{"time":ثانية البداية على التايملين,"overlay":true لو فوق الفيديو بخلفية شفافة أو false لو مشهد كامل بيقطع,"spec":{...مواصفات المشهد زي ما فوق}}]}',
      'قواعد: المشهد الكامل 2-4 ثواني والـ overlay من 3 لـ 5 ثواني. ماتحطش مشهدين في نفس الوقت. اختار لحظات فيها كلام مهم أو تغيير. استخدم اللقطات القريبة من وقت المشهد.'
    ].filter(Boolean).join('\n');
    step('المخرج الذكي بيخطط المشاهد', 0.15);
    const plan = await this.llm.json({ model: this.model('scene'), system: pro.DIRECTOR_SYSTEM(id), user, maxTokens: 6000 });
    const scenes = (Array.isArray(plan.scenes) ? plan.scenes : []).slice(0, n).filter(x => x && x.spec);
    if (!scenes.length) throw new Error('المخرج مارجّعش مشاهد — جرّب تاني أو غيّر الموديل');
    const placed = [];
    await this.op('مونتاج بستايل ' + pack.label, async () => {
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const spec = { ...sc.spec, style: id };
        if (sc.overlay) spec.background = { type: 'transparent' };
        const full = pro.normalize(spec, { width: s.width, height: s.height, fps: Math.round(s.fps) || 30, media: frames.map(f => f.file) });
        const time = Math.max(0, Math.min(s.duration - 0.5, +sc.time || 0));
        step(`Remotion بيرندر المشهد ${i + 1} من ${scenes.length}`, 0.2 + (0.8 * i) / scenes.length);
        const r = await this.renderProScene({ spec: full, time, onProgress: p => step(`رندر المشهد ${i + 1}: ${Math.round(p * 100)}%`, 0.2 + (0.8 * (i + p)) / scenes.length) });
        placed.push({ time, duration: full.duration, overlay: !!sc.overlay, elements: full.elements.map(e => e.type), track: r.track, file: r.file });
      }
    });
    // captions that match the look (e.g. Hormozi = yellow pop, noir = soft fade)
    let cap = null;
    if (captions && this.transcript && this.renderCaptionsImpl) {
      step('كابشن بنفس الاستايل', 0.97);
      cap = await this.addAnimatedCaptions({ style: { ...pack.captions } }).catch(e => ({ error: e.message }));
    }
    step('خلص', 1);
    return { style: id, label: pack.label, scenes: placed, captions: cap };
  }

  /* ---------- مكتبة القوالب ---------- */
  templatesList() {
    const T = require('./templates');
    return { cats: T.CATS, items: T.TEMPLATES.map(t => ({ id: t.id, cat: t.cat, label: t.label, overlay: t.overlay, duration: t.spec.duration, fields: T.fields(t), media: T.mediaNeed(t) })) };
  }

  async addTemplate({ id, values, time, duration, media, preview = false, onProgress } = {}) {
    const T = require('./templates');
    const tpl = T.get(id); if (!tpl) throw new Error('القالب مش موجود: ' + id);
    let files = Array.isArray(media) ? media : null;
    const need = T.mediaNeed(tpl);
    if (need && !files) files = (await this.sceneFrames({ count: need, spread: need > 1 ? 30 : 4 }).catch(() => [])).map(f => f.file);
    const spec = T.fill(tpl, { values, media: files || [], duration });
    return this.renderProScene({ spec, time, preview, onProgress });
  }

  favorites(kind) { return ((this.settings.favorites || {})[kind]) || []; }
  toggleFavorite(kind, id) {
    const fav = { ...(this.settings.favorites || {}) }; const list = new Set(fav[kind] || []);
    if (list.has(id)) list.delete(id); else list.add(id);
    fav[kind] = Array.from(list); this.saveSettings({ favorites: fav });
    return fav[kind];
  }

  /* ---------- كاروسيل ثري دي ---------- */
  async carousel3D({ files = [], layout = 'ring', speed = 1, direction = 'left', tilt = 10, radius = 1, cardSize = 1, aspect = '4:5', reflection = true, glow = true, rounded = 26, title = '', background = 'studio', duration = 6, time, preview = false, onProgress } = {}) {
    let media = (files || []).filter(f => f && fs.existsSync(f));
    if (!media.length) media = (await this.sceneFrames({ count: 8 })).map(f => f.file);
    if (media.length < 2) throw new Error('محتاج من 2 لـ 10 صور أو فيديوهات');
    if (media.length > 10) media = media.slice(0, 10);
    const bg = require('./proScene').BACKGROUNDS.includes(background) ? background : 'studio';
    const spec = { style: '3d', duration, background: { type: bg }, grain: false, elements: [{ type: 'carousel3D', from: 0, duration, props: { media, layout, speed, direction, tilt, radius, cardSize, aspect, reflection, glow, rounded, title } }] };
    return this.renderProScene({ spec, time, preview, onProgress });
  }

  /* ---------- مكتبة الأيقونات ---------- */
  iconsData() {
    if (!this._icons) this._icons = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'client', 'vendor', 'icons', 'icons.json'), 'utf8'));
    return this._icons;
  }
  iconSearch(q = '', cat = '') {
    const d = this.iconsData(), t = String(q).trim().toLowerCase();
    return d.icons.filter(i => (!cat || i.cat === cat) && (!t || i.name.toLowerCase().includes(t) || (i.ar || '').includes(t) || i.id.includes(t)));
  }
  async addIcon({ id, anim = 'draw', color, bg, size = 1, badge = 'none', label = '', duration = 3, position = 'center', glow = true, count = 3, time, onProgress } = {}) {
    const icon = this.iconsData().icons.find(i => i.id === id || i.id === 'l-' + id || i.id === 'b-' + id);
    if (!icon) throw new Error('الأيقونة مش موجودة: ' + id);
    const spec = { duration, background: { type: 'transparent' }, elements: [{ type: 'icon', from: 0, duration, position, props: { svg: icon.svg, mode: icon.mode, viewBox: icon.viewBox || '0 0 24 24', anim: icon.mode === 'color' && anim === 'draw' ? 'pop' : anim, color: color || (icon.mode === 'fill' && badge !== 'ios' ? icon.color : ''), bg: bg || (badge === 'ios' && icon.mode === 'fill' ? icon.color : ''), size, badge, label, glow, count } }] };
    return this.renderProScene({ spec, time, onProgress });
  }

  /* ---------- مؤثرات ترند (أوفلاين) + مزيكا بالذكاء الاصطناعي ---------- */
  sfxPackList() { return require('./sfxPack').list(); }
  sfxPackDir() { return path.join(config.dataDir(), 'sfx-pack'); }
  async sfxPackInstall(onProgress) {
    const files = require('./sfxPack').generate(this.sfxPackDir(), { onProgress });
    const r = await this.libraryAdd([this.sfxPackDir()]).catch(() => null);
    return { files: files.length, library: r };
  }
  sfxPackFile(id) { return require('./sfxPack').generate(this.sfxPackDir(), { ids: [id] })[0].file; }
  async placeSfx({ id, time }) {
    const [f] = require('./sfxPack').generate(this.sfxPackDir(), { ids: [id] });
    const s = await this.seq();
    return this.host('placeFile', { path: f.file, time: time ?? s.playhead, kind: 'audio', track: -1, bin: 'EditFast/SFX' });
  }
  async generateMusic({ prompt, seconds = 30, instrumental = true, translate = true, place = false, time } = {}) {
    const text = translate && this.settings.keys.openrouter ? await sfx.translatePrompt(this.llm, this.model('sfx_translate'), prompt) : prompt;
    const r = await sfx.generateMusic({ apiKey: this.settings.keys.elevenlabs, prompt: text, seconds, instrumental, outDir: config.cacheDir('music'), fetchImpl: this.fetch });
    let placed = null;
    if (place) { const s = await this.seq(); placed = await this.host('placeFile', { path: r.file, time: time ?? s.playhead, kind: 'audio', track: -1, duration: seconds, bin: 'EditFast/Music' }); }
    return { ...r, prompt: text, placed };
  }

  /* ---------- مكان حفظ الملفات اللي بتتحمّل ---------- */
  async projectMediaDir(name) {
    let p = '';
    try { p = (await this.hostRaw('projectPath', {})).path || ''; } catch (_) {}
    const dir = p ? path.join(path.dirname(p), 'EditFast Media', name) : config.cacheDir(name.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /* ---------- تحميل من يوتيوب/إنستجرام/تيك توك ---------- */
  ytdlpBin() { return ff.findBinary(['yt-dlp', 'yt-dlp_macos'], this.settings.paths.ytdlp); }
  async downloadInfo(url) { return require('./ytdlp').info(this.ytdlpBin(), url); }
  async downloadMedia({ url, quality = '1080', start, end, place = true, time, onProgress } = {}) {
    const Y = require('./ytdlp'), W = require('./websearch');
    const pf = Y.platformOf(url);
    if (!pf) throw new Error('اللينك مش صح');
    const dir = await this.projectMediaDir('Downloads');
    let file, type = quality === 'audio' ? 'audio' : 'video';
    const cut = Y.parseTime(start) !== null || Y.parseTime(end) !== null;
    try {
      try {
        file = (await Y.download(this.ytdlpBin(), { url, quality, start, end, outDir: dir, ffmpeg: this.tools.ffmpeg }, onProgress)).file;
      } catch (e1) {
        // cutting while downloading fails on some sites/ffmpeg builds (e.g. "ffmpeg exited with code 8"):
        // download the whole thing and cut it exactly here instead
        if (!cut) throw e1;
        onProgress && onProgress(0, 'full');
        const full = (await Y.download(this.ytdlpBin(), { url, quality, outDir: dir, ffmpeg: this.tools.ffmpeg, sections: false }, onProgress)).file;
        const a = Y.parseTime(start) || 0, b = Y.parseTime(end);
        const out = full.replace(/(\.[^.]+)$/, `-${a}-${b === null ? 'end' : b}${quality === 'audio' ? '.mp3' : '.mp4'}`);
        file = (await Y.trim(this.ffmpeg(), full, { start, end, audioOnly: quality === 'audio', out })).file;
        try { fs.unlinkSync(full); } catch (_) {}
      }
    } catch (e) {
      // Pinterest photo pins aren't videos: grab the picture itself
      if (pf.id !== 'pinterest') throw e;
      const m = await W.pinterestMedia(url, { fetchImpl: this.fetch });
      file = await W.downloadUrl(m.url, dir, { fetchImpl: this.fetch, name: m.title || 'pinterest' }); type = m.type;
    }
    if (/\.(jpe?g|png|webp|gif)$/i.test(file)) type = 'photo';
    let placed = null;
    if (place) {
      const s = await this.seq();
      const dur = type === 'photo' ? 5 : undefined;
      placed = await this.host('placeFile', { path: file, time: time ?? s.playhead, kind: type === 'audio' ? 'audio' : 'video', track: -1, duration: dur, bin: 'EditFast/Downloads' });
    }
    return { file, type, platform: pf, placed };
  }

  /* ---------- بحث النت (صور/فيديو/صوت) ---------- */
  async webSearch({ q, sources, type = 'image' } = {}) {
    const W = require('./websearch');
    const k = this.settings.keys;
    const src = sources || ['openverse', 'commons', ...(k.google && k.googleCx ? ['google'] : []), ...(k.pexels ? ['pexels'] : []), ...(k.pixabay ? ['pixabay'] : [])];
    const r = await W.search({ q, sources: src, type, keys: { google: k.google, googleCx: k.googleCx }, fetchImpl: this.fetch,
      brollSearch: async (s, t) => (await broll.search({ sources: [s], q, type: t, keys: k, fetchImpl: this.fetch })).results });
    r.results.forEach(x => this.webCache.set(x.id, x));
    return r;
  }
  webSearchPage(engine, q) { return require('./websearch').SEARCH_PAGES[engine](q); }
  async webImport({ id, item, url, place = true, time, duration } = {}) {
    const W = require('./websearch');
    let it = item || (id && this.webCache.get(id)) || (url ? { url, type: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|ogg|flac)(\?|$)/i.test(url) ? 'audio' : 'photo', source: 'url' } : null);
    if (!it) throw new Error('النتيجة مش موجودة');
    if (it.source === 'url' && /pinterest\.|pin\.it/i.test(it.url)) { const m = await W.pinterestMedia(it.url, { fetchImpl: this.fetch }); it = { ...it, url: m.url, type: m.type, title: m.title }; }
    let file;
    if (it.source === 'pexels' || it.source === 'pixabay') file = await broll.download(it, await this.projectMediaDir('Web'), { fetchImpl: this.fetch });
    else file = await W.downloadUrl(it.url, await this.projectMediaDir('Web'), { fetchImpl: this.fetch, name: it.title });
    let placed = null;
    if (place) {
      const s = await this.seq();
      const kind = it.type === 'audio' ? 'audio' : 'video';
      placed = await this.host('placeFile', { path: file, time: time ?? s.playhead, kind, track: -1, duration: duration || (it.type === 'photo' ? 5 : undefined), bin: 'EditFast/Web' });
    } else await this.hostRaw('importFiles', { paths: [file], bin: 'EditFast/Web' });
    return { file, placed, item: it };
  }

  /* ---------- المناطق الآمنة (ريلز/تيك توك/شورتس) ---------- */
  async safeZoneCheck({ platform = 'all', addMarkers = false, maxSeconds = 90, onProgress } = {}) {
    const SZ = require('./safeZones');
    const s = await this.seq();
    const vertical = s.height > s.width;
    const faces = [];
    if (this.analyzeFacesImpl) {
      const clips = (s.video[0] ? s.video[0].clips : []).filter(c => c.mediaPath && !c.disabled && !/\.(png|jpe?g)$/i.test(c.mediaPath));
      let budget = maxSeconds;
      for (const c of clips) {
        if (budget <= 0) break;
        const dur = Math.min(c.end - c.start, budget); budget -= dur;
        const info = await ff.probe(ff.requireTool(this.tools.ffprobe, 'ffprobe'), c.mediaPath).catch(() => null);
        if (!info || !info.width) continue;
        const samples = await this.analyzeFacesImpl({ ffmpeg: this.ffmpeg(), file: c.mediaPath, start: c.inPoint, duration: dur, srcW: info.width, srcH: info.height, fps: 1, onProgress: p => onProgress && onProgress(p) });
        for (const smp of samples) {
          const f = (smp.faces || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
          if (f) faces.push({ time: c.start + smp.t, box: SZ.faceToFrame(f, { srcW: info.width, srcH: info.height, seqW: s.width, seqH: s.height }) });
        }
      }
    }
    const cs = this.settings.captionStyle || {};
    const cy = typeof cs.y === 'number' ? cs.y : cs.position === 'top' ? 0.16 : cs.position === 'center' ? 0.5 : 0.8;
    const captionBox = { x: 0.08, y: cy - 0.045, w: 0.84, h: 0.09 };
    const r = SZ.check({ platform, faces, captionBox });
    if (addMarkers) {
      const marks = r.issues.filter(i => i.time !== null).map(i => ({ time: i.time, name: 'Safe zone', comment: i.text, color: 'red' }));
      if (marks.length) await this.host('addMarkers', { markers: marks });
    }
    return { ...r, vertical, faces: faces.length, captionY: cy };
  }

  /** Put the platform's UI guide (transparent PNG) on the top track — undo removes it. */
  async safeZoneGuide({ platform = 'tiktok' } = {}) {
    if (!this.renderOverlayImpl) throw new Error('رسم الدليل مش متاح هنا');
    const s = await this.seq();
    const out = path.join(config.cacheDir('guides'), `safe-${platform}-${s.width}x${s.height}.png`);
    if (!fs.existsSync(out)) await this.renderOverlayImpl({ platform, width: s.width, height: s.height, out });
    const top = s.video.reduce((m, tr, i) => (tr.clips.length ? i : m), 0);
    return this.op('دليل المنطقة الآمنة', () => this.host('placeFile', { path: out, time: 0, kind: 'video', track: -1, minTrack: top + 1, duration: Math.max(1, s.duration), bin: 'EditFast/Guides' }));
  }

  /** Move the animated captions just above the platform's bottom UI. */
  safeCaptions({ platform = 'all' } = {}) {
    const y = require('./safeZones').captionY(platform);
    this.saveSettings({ captionStyle: { ...(this.settings.captionStyle || {}), y } });
    return { y };
  }

  /* ---------- EditFast Link: ربط الملفات الناقصة ---------- */
  async relinkScan({ dirs = [], onProgress } = {}) {
    const R = require('./relink');
    const r = await this.hostRaw('listOffline', {});
    const items = r.items || [];
    if (!items.length) return { items: [], searched: [], indexed: 0 };
    let proj = ''; try { proj = (await this.hostRaw('projectPath', {})).path || ''; } catch (_) {}
    const searched = Array.from(new Set([...dirs, ...R.suggestDirs(items.map(i => i.path), proj)]));
    const index = R.buildIndex(searched, { onProgress });
    return { items: R.plan(items, index), searched, indexed: index.count };
  }
  async relinkApply(items, onProgress) {
    let done = 0; const failed = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], target = it.target || (it.match && it.match.path);
      if (!target) { onProgress && onProgress((i + 1) / items.length, it.name); continue; }
      try { await this.hostRaw('relinkMedia', { id: it.id, path: target }); done++; } catch (e) { failed.push({ name: it.name, error: e.message }); }
      onProgress && onProgress((i + 1) / items.length, it.name);
    }
    return { done, failed };
  }

  /* ---------- التحديث التلقائي ---------- */
  extRoot() { return this._extRoot || path.join(__dirname, '..'); }
  version() { return require('./updater').currentVersion(this.extRoot()); }
  async checkUpdate() {
    const U = require('./updater');
    const r = await U.check({ extRoot: this.extRoot(), sources: this.settings.updateUrl ? [this.settings.updateUrl] : null, fetchImpl: this.fetch });
    this.saveSettings({ lastUpdateCheck: Date.now() });
    return r;
  }
  async applyUpdate(info, onProgress) {
    const U = require('./updater');
    const r = await U.install({ info, extRoot: this.extRoot(), dataDir: config.dataDir(), fetchImpl: this.fetch, onProgress });
    // a new Remotion version → reinstall the engine now so scenes keep working after the reload
    if (r.engineChanged && this.proEngine().npm) { onProgress && onProgress(1, 'engine'); await this.installProEngine().catch(e => { r.engineError = e.message; }); }
    this.saveSettings({ lastUpdate: { version: r.version, previous: r.previous, notes: r.notes || '', at: Date.now(), seen: false } });
    return r;
  }
  rollbackUpdate() {
    const r = require('./updater').rollback({ extRoot: this.extRoot(), dataDir: config.dataDir() });
    this.saveSettings({ lastUpdate: { version: r.version, notes: 'رجعت للنسخة ' + r.version, at: Date.now(), seen: false } });
    return r;
  }

  /* ---------- تعديلات العميل ---------- */
  async revisionsProject() { try { return (await this.hostRaw('projectPath', {})).path || ''; } catch (_) { return ''; } }
  async revisionsLoad() { const R = require('./revisions'); return R.load(config.dataDir(), await this.revisionsProject()); }
  async revisionsSave(data) { const R = require('./revisions'); return R.save(config.dataDir(), await this.revisionsProject(), data); }
  /** split the client's message into tasks (AI, or offline if there's no key / no credits) → new round */
  async revisionsSplit({ text, client = '' }) {
    const R = require('./revisions');
    if (!text || !String(text).trim()) throw new Error('الصق رسالة التعديلات الأول');
    let items, ai = false, warning = '';
    if (this.settings.keys.openrouter) {
      let duration; try { duration = (await this.seq()).duration; } catch (_) {}
      try { items = await R.splitAI(this.llm, this.model('revisions'), text, { duration }); ai = true; } catch (e) { warning = e.message; }
    }
    if (!items || !items.length) items = R.splitOffline(text);
    const data = await this.revisionsLoad();
    data.rounds.push({ id: 'round-' + Date.now(), at: Date.now(), client, raw: text, items });
    await this.revisionsSave(data);
    return { round: data.rounds[data.rounds.length - 1], ai, warning };
  }
  async revisionsToggle({ roundId, itemId, done }) {
    const data = await this.revisionsLoad();
    const r = data.rounds.find(x => x.id === roundId); if (!r) throw new Error('الجولة مش موجودة');
    const it = r.items.find(x => x.id === itemId); if (it) { it.done = done === undefined ? !it.done : !!done; it.doneAt = it.done ? Date.now() : null; }
    await this.revisionsSave(data);
    return r;
  }
  async revisionsMarkers({ roundId }) {
    const data = await this.revisionsLoad(); const r = data.rounds.find(x => x.id === roundId);
    const marks = (r ? r.items : []).filter(x => x.time != null).map((x, i) => ({ time: x.time, name: `تعديل ${i + 1}`, comment: x.text, color: 'yellow' }));
    if (!marks.length) throw new Error('مفيش أوقات في التعديلات دي');
    await this.host('addMarkers', { markers: marks });
    return { added: marks.length };
  }
  /** the message for the client in Egyptian Arabic */
  async revisionsMessage({ roundId }) {
    const R = require('./revisions');
    const data = await this.revisionsLoad(); const r = data.rounds.find(x => x.id === roundId);
    if (!r) throw new Error('الجولة مش موجودة');
    let text = null, warning = '';
    if (this.settings.keys.openrouter) { try { text = await R.messageAI(this.llm, this.model('revisions'), r.items, { name: r.client }); } catch (e) { warning = e.message; } }
    if (!text) text = R.messageOffline(r.items, { name: r.client });
    r.message = text; await this.revisionsSave(data);
    return { text, warning };
  }
}

module.exports = { Services };

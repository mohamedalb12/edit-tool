'use strict';
// EditFast Motion (After Effects): كل اللي اللوحة بتطلبه من الأفتر، والقوالب اللي بتروح لبريمير.
// المكتبة والإعدادات والمفاتيح نفس بتاعة بريمير (نفس فولدر ~/.editfast).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const library = require('./library');
const mogrt = require('./mogrt');
const motion = require('./motionPresets');
const curves = require('./curves');
const { OpenRouter, modelFor } = require('./openrouter');
const { nodeFetch } = require('./http');
const aeScene = require('./aeScene');
const ff = require('./ffmpeg');
const vision = require('./vision');
const beats = require('./beats');
const { extractJson } = require('./util');
const logoFx = require('./logoFx');
const photo3d = require('./photo3d');
const track = require('./track');
const character = require('./character');
const STILL = /\.(png|jpe?g|webp|bmp|tiff?|gif|psd)$/i;

/** AI steps the motion assistant may run (name → what it does, for the prompt) */
const AI_ACTIONS = {
  lowerThird: 'لوور ثيرد: {name, title, color(#hex), accent(#hex), side: left|right, duration}',
  addShape: 'شكل: {kind: box|circle|ring|line, color(#hex)}',
  textAnimate: 'أنيميشن للكلام المختار: {preset: fadeUp|typewriter|blurIn|scalePop|slideIn|tracking, by: chars|words|lines, duration}',
  motion: 'حركة جاهزة على المختار: {preset: ' + motion.PRESETS.map(p => p.id).join('|') + ', level: 1|2|3}',
  ease: 'منحنى على الكي فريمز المختارة: {curve: ' + Object.keys(curves.PRESETS).filter(k => curves.PRESETS[k].fn.bezier).join('|') + '}',
  expression: 'إكسبريشن على المختار: {kind: wiggle|loopCycle|loopPingpong|bounce|autoFade|flicker|spin|float|typewriter}',
  stagger: 'ورا بعض: {frames, order: down|up|random}',
  anchor: 'الأنكر: {where: tl|t|tr|l|c|r|bl|b|br}',
  nullController: 'نل يمسك المختار: {}',
  cameraRig: 'كاميرا: {kind: push|orbit|dolly|float, duration, amount}',
  parallax: 'عمق للمختار: {depth}',
  lightRig: 'إضاءة: {}',
  extrude: 'ثري دي للكلام/الأشكال: {depth}'
};

class AEServices {
  constructor({ host, fetchImpl, log } = {}) {
    this.hostRaw = host;
    this.host = host;
    this.fetch = fetchImpl || nodeFetch;
    this.log = log || (() => {});
    this.history = [];
    this.reload();
  }
  reload() {
    this.settings = config.load();
    this.llm = new OpenRouter({ apiKey: this.settings.keys.openrouter, fetchImpl: this.fetch });
    return this.settings;
  }
  saveSettings(patch) { config.update(patch); return this.reload(); }
  model(feature) { return modelFor(feature, this.settings); }
  logError(entry) { return require('./log').append(config.dataDir(), { app: 'ae', ...entry }); }

  /* ---------- الكومب ---------- */
  async compInfo() { return this.host('compInfo', {}); }

  /* ---------- القوالب ---------- */
  templatesDir() { return mogrt.premiereTemplatesDir({ override: this.settings.paths && this.settings.paths.mogrtDir }); }
  templates() {
    return mogrt.load(config.dataDir()).map(t => ({ ...t, exists: fs.existsSync(t.path) }));
  }
  async templateScan() { return this.host('templateScan', {}); }
  /**
   * Save the active comp as a template: the user picked what stays editable (text / colours / motion …).
   * The .mogrt goes to Premiere's templates folder, so Essential Graphics and EditFast in Premiere both see it.
   */
  async templateSave({ name, editable = {}, category = '' } = {}) {
    if (!name || !String(name).trim()) throw new Error('سمّي القالب');
    if (!Object.values(editable).some(Boolean)) throw new Error('اختار حاجة واحدة على الأقل تتعدّل في بريمير');
    const dir = this.templatesDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, mogrt.safeName(name) + '.mogrt');
    const thumbs = config.cacheDir('template-thumbs');
    const id = require('crypto').createHash('md5').update(file).digest('hex').slice(0, 12);
    const r = await this.host('templateSave', { name: String(name).trim(), path: file, editable, thumb: path.join(thumbs, id + '.png') });
    let fields = [];
    try { fields = mogrt.readDefinition(r.path).controls.map(c => ({ name: c.name, type: c.type })); } catch (_) {}
    const item = { id, name: String(name).trim(), category, path: r.path, editable, exposed: r.exposed, fields, project: r.project, compId: r.compId, compName: r.compName,
      duration: r.duration, width: r.width, height: r.height, thumb: r.thumb && fs.existsSync(r.thumb) ? r.thumb : mogrt.extractThumb(r.path, thumbs), created: Date.now(), updated: Date.now() };
    mogrt.upsert(config.dataDir(), item);
    this.registerWithPremiere(dir);
    return item;
  }
  /** after editing the template's comp in AE: export again to the same file (Premiere gets the new version) */
  async templateUpdate(id) {
    const t = this.templates().find(x => x.id === id);
    if (!t) throw new Error('القالب مش موجود');
    await this.host('templateUpdate', { compId: t.compId, compName: t.compName, path: t.path });
    let fields = t.fields;
    try { fields = mogrt.readDefinition(t.path).controls.map(c => ({ name: c.name, type: c.type })); } catch (_) {}
    const item = { ...t, fields, thumb: mogrt.extractThumb(t.path, config.cacheDir('template-thumbs')) || t.thumb, updated: Date.now() };
    delete item.exists;
    mogrt.upsert(config.dataDir(), item);
    return item;
  }
  async templateOpen(id) {
    const t = this.templates().find(x => x.id === id);
    if (!t) throw new Error('القالب مش موجود');
    return this.host('templateOpen', { project: t.project, compId: t.compId, compName: t.compName });
  }
  templateRemove(id, { deleteFile = false } = {}) {
    const list = mogrt.load(config.dataDir()), t = list.find(x => x.id === id);
    if (!t) return { removed: 0 };
    if (deleteFile) { try { fs.unlinkSync(t.path); } catch (_) {} }
    mogrt.save(config.dataDir(), list.filter(x => x.id !== id));
    return { removed: 1 };
  }
  /** Premiere's مكتبتي sees the templates folder too (graphics → MOGRT) */
  registerWithPremiere(dir) {
    const dirs = this.settings.libraryDirs || [];
    if (!dirs.includes(dir)) this.saveSettings({ libraryDirs: dirs.concat([dir]) });
  }

  /* ---------- الحركة ---------- */
  async applyMotion({ preset, level = 2, mode } = {}) {
    const info = await this.compInfo();
    const fps = info.comp ? Math.round(info.comp.fps) : 30;
    const g = motion.generate(preset, level, { fps });
    return this.host('applyMotion', { mode: mode || (g.kind === 'emphasis' ? 'at' : g.kind), duration: g.duration, props: g.props });
  }
  async applyEase({ curve, bezier } = {}) {
    const bz = bezier || (curves.PRESETS[curve] && curves.PRESETS[curve].fn.bezier);
    if (!bz) throw new Error('المنحنى ده مايتعملش Bezier — اختار واحد تاني');
    return this.host('applyEase', { bezier: bz });
  }
  stagger(o) { return this.host('stagger', o || {}); }
  anchor(o) { return this.host('anchor', o || {}); }
  nullController(o) { return this.host('nullController', o || {}); }
  addExpression(o) { return this.host('addExpression', o || {}); }
  textAnimate(o) { return this.host('textAnimate', o || {}); }
  addShape(o) { return this.host('addShape', o || {}); }
  lowerThird(o) { return this.host('lowerThird', o || {}); }

  /* ---------- ثري دي ---------- */
  cameraRig(o) { return this.host('cameraRig', o || {}); }
  parallax(o) { return this.host('parallax', o || {}); }
  lightRig() { return this.host('lightRig', {}); }
  extrude(o) { return this.host('extrude', o || {}); }

  /* ---------- الروتين ---------- */
  /** render the comp next to the project ("EditFast Renders") and hand it to Premiere (its "من أفتر" list) */
  async render({ template = 'h264', ame = false } = {}) {
    const info = await this.compInfo();
    if (!info.comp) throw new Error('افتح كومبوزيشن الأول');
    const base = info.project ? path.join(path.dirname(info.project), 'EditFast Renders') : config.cacheDir('renders');
    fs.mkdirSync(base, { recursive: true });
    const ext = template === 'h264' ? '.mp4' : '.mov';
    const out = path.join(base, mogrt.safeName(info.comp.name) + ext);
    const r = await this.host('render', { path: out, template, ame });
    this.handoff({ file: r.path, name: info.comp.name, ame });
    return r;
  }
  handoff(item) {
    const f = path.join(config.dataDir(), 'handoff.json');
    let list = []; try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
    list = [{ ...item, at: Date.now() }].concat(list.filter(x => x.file !== item.file)).slice(0, 40);
    fs.writeFileSync(f, JSON.stringify(list, null, 1));
  }
  cleanup(o) { return this.host('cleanup', o || { removeUnused: true, organize: true }); }
  paletteRead() { return this.host('paletteRead', {}); }
  paletteApply(map) { return this.host('paletteApply', { map }); }

  /* ---------- مكتبتي (نفس مكتبة بريمير) ---------- */
  libraryItems() { return library.loadIndex(config.dataDir()); }
  librarySearch(q) { return library.search(this.libraryItems(), q); }
  libraryStats() { return { ...library.stats(this.libraryItems()), categories: library.CATEGORIES }; }
  async libraryPlace({ id }) {
    const it = this.libraryItems().find(x => x.id === id);
    if (!it) throw new Error('العنصر مش في المكتبة');
    if (it.ext === 'prfpset') throw new Error('بريسيت بريمير مايشتغلش في الأفتر');
    if (it.ext === 'mogrt') throw new Error('الـ MOGRT بيتحط في بريمير — في الأفتر افتح مشروعه');
    return this.host('importToComp', { path: it.path });
  }

  /* ---------- مساعد الموشن ---------- */
  /**
   * "lower third باسمي وبعدين ابدأ الكلام حرف حرف" → steps from AI_ACTIONS, shown to the user, then run in order.
   */
  async aiPlan(request) {
    if (!this.settings.keys.openrouter) throw new Error('حط مفتاح OpenRouter من الإعدادات الأول');
    const info = await this.compInfo().catch(() => ({}));
    const comp = info.comp ? `الكومب: ${info.comp.name} ${info.comp.width}x${info.comp.height}، المختار: ${info.comp.selected.map(s => s.name + ' (' + s.type + ')').join('، ') || 'مفيش'}` : 'مفيش كومب مفتوح';
    const res = await this.llm.json({ model: this.model('motion_ai'), maxTokens: 1500,
      system: 'أنت مساعد موشن جرافيك جوه أفتر إفكتس. حوّل طلب المستخدم لخطوات من القايمة دي بس (اسم الخطوة: الباراميترز):\n' +
        Object.entries(AI_ACTIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
        '\nرجّع JSON: {"steps":[{"action":"…","args":{…},"why":"بالمصري في كلمتين"}],"note":"لو فيه حاجة مش هتتعمل قول"}',
      user: comp + '\nالطلب: ' + request });
    const steps = ((res && res.steps) || []).filter(s => s && AI_ACTIONS[s.action]).slice(0, 12).map(s => ({ action: s.action, args: s.args || {}, why: String(s.why || '').slice(0, 80) }));
    return { steps, note: res && res.note ? String(res.note).slice(0, 200) : '' };
  }
  async aiRun(steps, onStep) {
    const done = [], failed = [];
    for (const [i, s] of steps.entries()) {
      onStep && onStep(i, s);
      try {
        const a = s.args || {};
        if (s.action === 'motion') await this.applyMotion({ preset: a.preset, level: a.level || 2 });
        else if (s.action === 'ease') await this.applyEase({ curve: a.curve });
        else if (s.action === 'expression') await this.addExpression({ kind: a.kind });
        else await this.host(s.action, a);
        done.push(s.action);
      } catch (e) { failed.push({ action: s.action, error: e.message }); }
    }
    return { done, failed };
  }

  /* ---------- المونتير الذكي ---------- */
  tools() { return ff.resolveTools(this.settings); }
  ffmpeg() { const t = this.tools(); if (!t.ffmpeg) throw new Error('ffmpeg مش متسطب — نزّله أو حط مكانه من إعدادات بريمير'); return t.ffmpeg; }
  sceneLibrary() { return aeScene.SCENES.map(s => ({ id: s.id, name: s.name, fields: s.fields })); }
  editStyles() { return Object.keys(aeScene.STYLES).map(id => ({ id, name: aeScene.STYLES[id].name })); }
  async compSize() { const i = await this.compInfo().catch(() => ({})); return (i && i.comp) || {}; }
  /** a raw scene (from the AI, the library or the auto edit) → checked → real layers in AE */
  async sceneBuild(raw, { where } = {}) {
    const comp = await this.compSize();
    const r = Object.assign({}, raw, { comp: Object.assign({}, raw && raw.comp) });
    if (where === 'new') r.comp.create = true;
    if (where === 'here' && comp.width) r.comp.create = false;
    const { spec, warnings } = aeScene.normalize(r, comp);
    if (!spec.layers.length) throw new Error('المشهد طلع فاضي' + (warnings.length ? ': ' + warnings.slice(0, 3).join('، ') : ''));
    const res = await this.host('buildScene', { spec });
    return Object.assign({}, res, { warnings });
  }
  async libraryScene(id, params = {}, where) {
    const comp = await this.compSize();
    return this.sceneBuild(aeScene.buildLibrary(id, params, comp), { where });
  }
  /** the AI's edit ops → checked (same rules as a scene) → editScene in AE */
  async sceneEdit(ops, state) {
    const st = state || await this.host('sceneState', {});
    const comp = st.comp || {}, out = [], warnings = [];
    const one = raw => { const n = aeScene.normalize({ comp: { create: false }, layers: [raw] }, comp); warnings.push(...n.warnings); return n.spec.layers; };
    for (const op of (ops || []).slice(0, 60)) {
      if (!op || !op.op) continue;
      if (op.op === 'delete' && op.layer) out.push({ op: 'delete', layer: String(op.layer) });
      else if (op.op === 'retime') { const f = +op.factor; if (f > 0) out.push({ op: 'retime', factor: Math.min(5, Math.max(0.2, f)) }); }
      else if (op.op === 'comp') { const d = +op.duration; if (d > 0) out.push({ op: 'comp', duration: Math.min(600, d) }); }
      else if (op.op === 'add') { for (const L of one(op.layer || op.spec)) out.push({ op: 'add', spec: L }); }
      else if (op.op === 'replace' && op.layer) {
        const made = one(Object.assign({ name: op.layer }, op.spec || op.with || {}));
        if (made.length) { out.push({ op: 'replace', layer: String(op.layer), spec: made[0] }); for (const extra of made.slice(1)) out.push({ op: 'add', spec: extra }); }
      } else if (op.op === 'set' && op.layer) {
        const known = (st.layers || []).find(l => l.name === op.layer);
        const n = aeScene.normalizeLook(op.look, comp, { threeD: !!(known && known.threeD) });
        warnings.push(...n.warnings);
        out.push({ op: 'set', layer: String(op.layer), look: n.look });
      }
    }
    if (!out.length) throw new Error('مفيش تعديل يتعمل' + (warnings.length ? ': ' + warnings.slice(0, 3).join('، ') : ''));
    const r = await this.host('editScene', { ops: out });
    return Object.assign({}, r, { warnings });
  }
  /**
   * Frames of reference images / videos for the vision model. A video → evenly spaced moments (with their times, so
   * the motion between them reads) + its pacing (cuts per second) from shot detection.
   */
  async refFrames(files, { width = 512, perVideo = 8, max = 14 } = {}) {
    const ffmpeg = this.ffmpeg(), probe = this.tools().ffprobe, frames = [], notes = [];
    const list = (files || []).slice(0, 6), per = Math.max(2, Math.min(perVideo, Math.floor(max / Math.max(1, list.length))));
    for (const f of list) {
      if (frames.length >= max) break;
      const name = path.basename(f);
      if (STILL.test(f)) { frames.push({ label: name, time: 0, b64: await vision.frameJpeg(ffmpeg, f, 0, { width }) }); continue; }
      let dur = 0; try { dur = probe ? (await ff.probe(probe, f)).duration : 0; } catch (_) {}
      if (dur > 0) {
        try {
          const cuts = await vision.detectShots(ffmpeg, f, { duration: Math.min(dur, 120) });
          notes.push(`${name}: ${dur.toFixed(1)} ثانية، ${cuts.length} قطع (لقطة كل ${(dur / (cuts.length + 1)).toFixed(1)} ثانية تقريبًا)`);
        } catch (_) {}
      }
      const n = dur > 0 ? per : 1;
      for (let i = 0; i < n && frames.length < max; i++) {
        const t = dur > 0 ? dur * (i + 0.5) / n : 0;
        try { frames.push({ label: name + ' @' + t.toFixed(2) + 's', time: t, b64: await vision.frameJpeg(ffmpeg, f, t, { width }) }); } catch (_) {}
      }
    }
    if (files && files.length && !frames.length) throw new Error('مقدرتش أطلع صور من الريفرانس');
    frames.notes = notes;
    return frames;
  }
  async askJson(system, content, maxTokens = 16000, { history = true } = {}) {
    const messages = [{ role: 'system', content: system + '\nرد بـ JSON صالح فقط من غير أي كلام زيادة.' }, ...(history ? this.history.slice(-8) : []), { role: 'user', content }];
    let m;
    try { m = await this.llm.chat({ model: this.model('motion_ai'), messages, maxTokens, jsonMode: true }); }
    catch (e) { if (e.status === 400) m = await this.llm.chat({ model: this.model('motion_ai'), messages, maxTokens }); else throw e; }
    return extractJson(m.content) || {};
  }
  /** plugins installed in AE (Saber, Deep Glow, Particular…) — asked once per session */
  async plugins() {
    if (!this._plugins) { try { this._plugins = ((await this.host('effectsList', {})) || {}).effects || []; } catch (_) { this._plugins = []; } }
    return this._plugins;
  }
  /** PNG frames of what's in the active comp now (needs AE's "write files" permission) → [{label, b64, mime}] */
  async snapshot(n = 4) {
    const st = await this.host('sceneState', {});
    if (!st.comp) return [];
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'editfast-snap-'));
    const times = Array.from({ length: n }, (_, i) => +(st.comp.duration * (i + 0.6) / (n + 0.2)).toFixed(2));
    const r = await this.host('snapshot', { times, dir });
    const out = [];
    for (const [i, f] of (r.files || []).entries()) {
      for (let k = 0; k < 40 && !fs.existsSync(f); k++) await new Promise(res => setTimeout(res, 100)); // AE may write it a moment later
      try { out.push({ label: times[i] + 's', b64: fs.readFileSync(f).toString('base64'), mime: 'image/png' }); } catch (_) {}
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    return out;
  }
  sceneSystem(where, refCount, plugins) {
    return [
      'أنت مونتير ومصمم موشن جرافيك محترف جوه أفتر إفكتس. بتحوّل وصف المستخدم (بالمصري) لمشهد حقيقي بليرز وكي فريمز هو يقدر يعدّل عليها.',
      aeScene.designGuide(),
      'ردّك JSON بواحد من الأشكال دي:',
      '1) مشهد جديد: {"action":"build","say":"جملة بالمصري","scene":{…}}',
      '2) تعديل على الليرز الموجودة بأساميها بالظبط: {"action":"edit","say":"…","ops":[',
      '   {"op":"set","layer":"اسم","look":{"transform":{…},"keys":{…},"effects":[…],"expressions":{…},"masks":[…],"matte":{…},"text":"…","color":"#hex","size":90,"font":"…","textAnimator":{…}}},',
      '   {"op":"add","layer":{…لير كامل…}}, {"op":"replace","layer":"اسم","spec":{…اللير من جديد…}}, {"op":"delete","layer":"اسم"},',
      '   {"op":"retime","factor":1.5 (أكبر من 1 = أبطأ)}, {"op":"comp","duration":10}]}',
      '3) مشهد جاهز من المكتبة لو مناسب بالظبط: {"action":"library","say":"…","use":"id","params":{"title":"…","subtitle":"…","color":"#hex"}} — المكتبة: ' + aeScene.SCENES.map(s => s.id + ' (' + s.name + ')').join('، '),
      aeScene.promptDoc(),
      plugins && plugins.length ? 'بلاجنز متسطبة عند المستخدم (استخدمها بالـ match لو هتفرق، الباراميترز بأساميها الإنجليزي): ' + plugins.slice(0, 80).map(p => p.name + ' = ' + p.match).join('، ') : '',
      where === 'new' ? 'المستخدم عايز مشهد جديد في كومب جديد (build).' : where === 'here' ? 'المستخدم عايز المشهد جوه الكومب المفتوح: build مع comp.create=false، أو edit.' : 'لو بيطلب تغيير في اللي موجود استخدم edit، ولو حاجة جديدة build.',
      refCount ? 'المستخدم بعت ريفرانس (الصور تحت، بتوقيتها). حلّل: الألوان بالظبط (#hex)، الخط ووزنه وحجمه، التكوين والمسافات، الإيقاع (من التوقيتات وعدد القطعات)، شكل الحركة بين الفريمات، الإفكتات (جلو، بلور، جرين، particles…). واعمل مشهد قريب منه جداً بنفس الإحساس — لو فيه حاجة مش متاحة اعمل أقرب بديل. اكتب التحليل في "reference" بالمصري في سطرين.' : ''
    ].filter(Boolean).join('\n');
  }
  /**
   * The director: "اعمل إنترو بلوجو برتقالي بيلف" / "خلّي العنوان أكبر وأبطأ" / a reference image or video →
   * builds a new scene, edits the open one by layer names, or customises a library scene; then (review) looks at
   * frames of what it built and fixes what doesn't match. Remembers the chat. where: auto | new | here
   */
  async director({ message, refs = [], where = 'auto', review = true, onStep } = {}) {
    const step = m => { try { onStep && onStep(m); } catch (_) {} };
    if (!this.settings.keys.openrouter) throw new Error('حط مفتاح OpenRouter من الإعدادات الأول');
    if (!String(message || '').trim() && !refs.length) throw new Error('اكتب المشهد اللي عايزه');
    const state = await this.host('sceneState', {}).catch(() => ({ comp: null, layers: [] }));
    if (refs.length) step('بيحلّل الريفرانس…');
    const frames = refs.length ? await this.refFrames(refs) : [];
    const plugins = await this.plugins();
    const ctx = state.comp ? 'الكومب المفتوح: ' + JSON.stringify(state).slice(0, 8000) : 'مفيش كومب مفتوح.';
    const text = ctx + (frames.notes && frames.notes.length ? '\nالريفرانس: ' + frames.notes.join(' · ') : '') + (frames.length ? '\nصور الريفرانس بالترتيب: ' + frames.map((f, i) => '#' + (i + 1) + ' ' + f.label).join('، ') : '') + '\nالطلب: ' + (message || 'اعمل مشهد زي الريفرانس');
    step('بيصمّم المشهد…');
    const res = await this.askJson(this.sceneSystem(where, frames.length, plugins), frames.length ? vision.imageMessage(frames, text).content : text);
    this.history.push({ role: 'user', content: String(message || '').slice(0, 1500) + (frames.length ? ' [+ريفرانس]' : '') }, { role: 'assistant', content: JSON.stringify(res).slice(0, 6000) });
    this.history = this.history.slice(-12);
    const out = { action: res.action, say: String(res.say || '').slice(0, 500), reference: res.reference ? String(res.reference).slice(0, 800) : '' };
    step('بيبني الليرز…');
    if (res.action === 'edit') out.result = await this.sceneEdit(res.ops, state);
    else if (res.action === 'library') out.result = await this.libraryScene(res.use, res.params || {}, where);
    else if (res.scene) { out.action = 'build'; out.result = await this.sceneBuild(res.scene, { where }); }
    else throw new Error('الموديل مارجّعش مشهد — جرّب توصف تاني' + (out.say ? ': ' + out.say : ''));
    if (review) {
      try { out.review = await this.reviewScene({ message, frames, step }); } catch (e) { out.review = { skipped: e.message }; this.log('review: ' + e.message); }
    }
    return out;
  }
  /**
   * Self-review: frames of the built comp go back to the model next to the request (and the reference); it answers
   * {"ok":true} or edit ops that fix what's off (overlaps, unreadable text, empty frames, wrong colours…), applied once.
   */
  async reviewScene({ message, frames = [], step } = {}) {
    step && step('بيراجع شغله…');
    const shots = await this.snapshot(4);
    if (!shots.length) return { skipped: 'مفيش صور من الكومب' };
    const state = await this.host('sceneState', {});
    const content = [{ type: 'text', text: 'الطلب: ' + (message || 'زي الريفرانس') + '\nالكومب دلوقتي: ' + JSON.stringify(state).slice(0, 8000) + '\nالصور الجاية: ' + shots.map((s, i) => '#' + (i + 1) + ' عند ' + s.label).join('، ') + (frames.length ? ' — وبعدها الريفرانس' : '') }]
      .concat(shots.map(s => ({ type: 'image_url', image_url: { url: 'data:' + s.mime + ';base64,' + s.b64 } })))
      .concat(frames.slice(0, 6).map(f => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + f.b64 } })));
    const res = await this.askJson('أنت مدير فني (art director) بتراجع مشهد موشن اتعمل في أفتر. بص على الفريمات: كلام مقطوع أو طالع برّه الكادر أو مش مقروء، عناصر فوق بعض غلط، فريم فاضي، ألوان مش متناسقة أو بعيدة عن الطلب/الريفرانس، حركة ناقصة. لو كله تمام رجّع {"ok":true,"say":"…"}، لو لأ رجّع {"ok":false,"say":"اللي اتصلّح بالمصري","ops":[…]} بنفس شكل تعديلات المونتير (set/add/replace/delete) على أسامي الليرز بالظبط.\n' + aeScene.promptDoc(), content, 8000, { history: false });
    if (res.ok !== false || !Array.isArray(res.ops) || !res.ops.length) return { ok: true, say: String(res.say || '').slice(0, 300) };
    step && step('بيصلّح…');
    const r = await this.sceneEdit(res.ops, state);
    return { ok: false, fixed: r.done, say: String(res.say || '').slice(0, 300) };
  }
  directorReset() { this.history = []; return true; }
  /**
   * Edit the footage alone: clips (+ music) → a cut in a style, on the beat, with titles — as editable layers.
   * With a key the vision model picks the order, the best moment of each clip and the titles from the brief.
   */
  async autoEdit({ files = [], music = null, style = 'energetic', ratio = '16:9', duration = 0, brief = '', onStep } = {}) {
    const step = m => { try { onStep && onStep(m); } catch (_) {} };
    if (!files.length) throw new Error('اختار فيديوهات أو صور الأول');
    const ffmpeg = this.ffmpeg(), probe = this.tools().ffprobe;
    step('بقرا الفيديوهات…');
    const clips = [];
    for (const f of files.slice(0, 40)) {
      const still = STILL.test(f);
      let dur = 0; if (!still && probe) { try { dur = (await ff.probe(probe, f)).duration; } catch (_) {} }
      clips.push({ file: f, still, dur });
    }
    let plan = {};
    if (this.settings.keys.openrouter && (brief || clips.length > 1)) {
      step('بشوف اللقطات…');
      const frames = [];
      for (const [i, c] of clips.slice(0, 16).entries()) { try { frames.push({ label: '#' + i + ' ' + path.basename(c.file) + (c.dur ? ' (' + c.dur.toFixed(1) + 's)' : ''), time: 0, b64: await vision.frameJpeg(ffmpeg, c.file, c.dur * 0.4, { width: 384 }) }); } catch (_) {} }
      if (frames.length) {
        try {
          plan = await this.askJson('أنت مونتير محترف. بص على اللقطات (كل صورة من لقطة برقمها) ورتّبها لمونتاج حلو ستايله ' + ((aeScene.STYLES[style] || {}).name || style) + '. رجّع JSON: {"order":[أرقام اللقطات بالترتيب، ممكن تكرر أو تشيل],"best":{"رقم":ثانية أحلى لحظة},"titles":[{"text":"كلام قصير بالمصري أو زي البريف","at":ثانية,"dur":2.5}],"note":"سطر بالمصري"}',
            vision.imageMessage(frames, 'البريف: ' + (brief || 'مونتاج حلو من اللقطات دي') + (duration ? '، المدة ' + duration + ' ثانية' : '')).content, 1500);
        } catch (e) { this.log('autoEdit plan: ' + e.message); }
      }
    }
    if (plan.best) for (const k of Object.keys(plan.best)) if (clips[+k] && isFinite(+plan.best[k])) clips[+k].best = Math.max(0, Math.min(clips[+k].dur - 0.5, +plan.best[k]));
    let bt = [], bpm = 0;
    if (music) { step('بسمع المزيكا…'); const r = await beats.detect(ffmpeg, music); bt = r.beats; bpm = r.bpm; }
    const order = Array.isArray(plan.order) ? plan.order.map(Number).filter(i => clips[i]) : null;
    const { scene, cuts } = aeScene.montageScene({ clips, beats: bt, style, ratio, duration, music, titles: Array.isArray(plan.titles) ? plan.titles : [], order, name: 'EditFast Edit ' + ((aeScene.STYLES[style] || {}).name || '') });
    step('ببني المونتاج في الأفتر…');
    const r = await this.sceneBuild(scene, { where: 'new' });
    return Object.assign({}, r, { cuts: cuts.length, bpm, note: plan.note ? String(plan.note).slice(0, 200) : '' });
  }

  /* ---------- لوجوهات، فيكتور، مورف ---------- */
  logoStyles() { return Object.keys(logoFx.STYLES).map(id => ({ id, name: logoFx.STYLES[id] })); }
  async art(file, o = {}) { const t = this.tools(); return logoFx.loadArt(file, { ffmpeg: t.ffmpeg, ffprobe: t.ffprobe, colors: o.colors || 0, detail: o.detail || 3 }); }
  /** a logo / icon / image → traced (or read from SVG) → animated: draw | outline | neon | build | 3d | static */
  async logoAnimate({ file, style = 'draw', colors = 0, detail = 3, duration = 5, bg, color, fit = 0.6, where = 'new' } = {}) {
    if (!file) throw new Error('اختار اللوجو (SVG أو PNG / JPG)');
    const art = await this.art(file, { colors, detail });
    const cur = await this.compSize(), comp = { width: cur.width || 1920, height: cur.height || 1080 };
    const parts = logoFx.toParts(art, comp, { fit });
    const raw = logoFx.logoScene(parts, { style, duration, comp, bg: bg === undefined ? (style === 'neon' ? '#050302' : art.bg || '#0b0806') : bg, name: path.basename(file).replace(/\.\w+$/, '').slice(0, 30), color });
    if (where === 'here') { raw.comp.create = false; raw.layers = raw.layers.filter(l => l.type !== 'camera' && l.type !== 'light' || style === '3d'); }
    const r = await this.sceneBuild(raw, { where });
    return Object.assign({}, r, { parts: parts.length, source: art.source, paths: parts.reduce((n, p) => n + p.paths.length, 0) });
  }
  /** an SVG / image as editable shape layers in the open comp (Overlord-style) */
  vectorImport(o = {}) { return this.logoAnimate(Object.assign({ style: 'static', where: 'here', fit: 0.8 }, o)); }
  /**
   * Morph: the selected shape / text layers (in order), or 2+ logo / image files → one shape layer that turns
   * from each into the next (paths matched + aligned, colours too).
   */
  async morph({ files = [], dur = 1, hold = 0.6, loop = false, ease = 'easeInOut' } = {}) {
    let stages, comp, where = 'here';
    if (files.length >= 2) {
      const cur = await this.compSize(); comp = { width: cur.width || 1920, height: cur.height || 1080 }; where = cur.width ? 'here' : 'new';
      stages = [];
      for (const f of files.slice(0, 8)) {
        const parts = logoFx.toParts(await this.art(f), comp, { fit: 0.6 });
        stages.push({ name: path.basename(f), fill: parts[0].fill, paths: parts.flatMap(p => p.paths.map(q => ({ v: q.v.map(v => [v[0] + p.position[0], v[1] + p.position[1]]), i: q.i, o: q.o, c: q.c }))) });
      }
    } else {
      const r = await this.host('readShapes', {});
      comp = r.comp;
      stages = r.layers.map(L => ({ name: L.name, paths: logoFx.layerPaths(L), fill: L.fill, stroke: L.stroke, strokeWidth: L.strokeWidth }));
    }
    const m = logoFx.morphScene(stages, { comp, dur, hold, loop, where, ease, name: 'EF Morph' });
    const r = await this.sceneBuild(m.raw, { where });
    return Object.assign({}, r, { stages: stages.length, paths: m.paths, points: m.points });
  }

  /* ---------- صورة → ثري دي ---------- */
  async falRun(model, input) {
    const key = this.settings.keys.fal;
    if (!key) throw new Error('حط مفتاح fal.ai من الإعدادات (للعمق / الموديل الثري دي)');
    const res = await this.fetch('https://fal.run/' + model, { method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(input), timeout: 600000 });
    const txt = await res.text();
    if (!res.ok) throw new Error('fal.ai ' + res.status + ': ' + txt.slice(0, 200));
    return JSON.parse(txt);
  }
  static findUrl(o, re) {
    if (!o) return null;
    if (typeof o === 'string') return re.test(o) ? o : null;
    if (typeof o === 'object') for (const k of Object.keys(o)) { const u = AEServices.findUrl(o[k], re); if (u) return u; }
    return null;
  }
  dataUri(file) { const ext = path.extname(file).slice(1).toLowerCase(); return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext || 'png') + ';base64,' + fs.readFileSync(file).toString('base64'); }
  async download(url, file) { const res = await this.fetch(url, { timeout: 600000 }); if (!res.ok) throw new Error('التحميل وقف: ' + res.status); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); return file; }
  /**
   * A photo → a 3D parallax shot: depth (depth file | fal.ai | estimate with the subject from the vision model) →
   * depth slices as 3D layers + a moving camera. move: push | orbit | rise | float
   */
  async photo3D({ file, depthFile = null, depth = 'auto', slices = 5, move = 'push', strength = 1, duration = 6, onStep } = {}) {
    const step = m => { try { onStep && onStep(m); } catch (_) {} };
    if (!file) throw new Error('اختار الصورة');
    const ffmpeg = this.ffmpeg(), probe = this.tools().ffprobe;
    let W0 = 1920, H0 = 1080; try { const p = await ff.probe(probe, file); W0 = p.width; H0 = p.height; } catch (_) {}
    const s = Math.min(1, 1920 / Math.max(W0, H0)), w = Math.round(W0 * s / 2) * 2, h = Math.round(H0 * s / 2) * 2;
    step('بيقرا الصورة…');
    const rgba = await photo3d.decodeExact(ffmpeg, file, w, h);
    let d, how;
    const tmpDir = path.join(config.dataDir(), '3d-photo');
    if (depthFile) { d = photo3d.fromGray(await photo3d.decodeExact(ffmpeg, depthFile, w, h, { gray: true }), w, h); how = 'ملف العمق'; }
    else if ((depth === 'fal' || depth === 'auto') && this.settings.keys.fal) {
      step('بيحسب العمق (fal.ai)…');
      const r = await this.falRun('fal-ai/imageutils/depth', { image_url: this.dataUri(file) });
      const url = AEServices.findUrl(r, /^https?:|^data:image/);
      if (!url) throw new Error('fal.ai مارجّعش خريطة عمق');
      const df = path.join(tmpDir, 'depth-' + Date.now() + '.png');
      if (/^data:/.test(url)) fs.writeFileSync(df, Buffer.from(url.split(',')[1], 'base64')); else await this.download(url, df);
      d = photo3d.fromGray(await photo3d.decodeExact(ffmpeg, df, w, h, { gray: true }), w, h); how = 'fal.ai';
    } else {
      let subject = null;
      if (this.settings.keys.openrouter) {
        step('بيدوّر على الموضوع الأساسي…');
        try {
          const b64 = await vision.frameJpeg(ffmpeg, file, 0, { width: 512 });
          const r = await this.askJson('حدد العنصر الأساسي (الأقرب للكاميرا) في الصورة. رجّع JSON: {"x":0-1,"y":0-1,"w":0-1,"h":0-1} (مربع حواليه، نسبة من الصورة)', vision.imageMessage([{ label: 'الصورة', time: 0, b64 }], 'الصورة').content, 300, { history: false });
          if (isFinite(+r.x) && isFinite(+r.w) && +r.w > 0) subject = { x: +r.x, y: +r.y, w: +r.w, h: +r.h };
        } catch (e) { this.log('photo3D subject: ' + e.message); }
      }
      d = photo3d.guessDepth(w, h, subject); how = subject ? 'تقدير + الموضوع الأساسي' : 'تقدير';
    }
    step('بيقطّع الصورة لطبقات…');
    const parts = photo3d.slices(rgba, d, w, h, Math.max(2, Math.min(8, slices)));
    const files = await photo3d.writeSlices(ffmpeg, parts, w, h, tmpDir, path.basename(file).replace(/\.\w+$/, '').replace(/[^\w؀-ۿ-]+/g, '_').slice(0, 30) + '-' + Date.now().toString(36));
    const raw = photo3d.photoScene(files, { width: w, height: h, duration, move, strength, name: '3D ' + path.basename(file).slice(0, 30) });
    step('ببني المشهد…');
    const r = await this.sceneBuild(raw, { where: 'new' });
    return Object.assign({}, r, { slices: files.length, depth: how });
  }
  /** a picture → a real 3D model (.glb) via fal.ai, imported into a 3D comp with camera + lights (AE 2024+) */
  async imageTo3DModel({ file, model = 'fal-ai/trellis', onStep } = {}) {
    if (!file) throw new Error('اختار الصورة');
    onStep && onStep('بيعمل الموديل الثري دي (دقيقة أو اتنين)…');
    const r = await this.falRun(model, { image_url: this.dataUri(file) });
    const url = AEServices.findUrl(r, /\.(glb|gltf)(\?|$)/i);
    if (!url) throw new Error('fal.ai مارجّعش ملف .glb');
    const out = path.join(config.dataDir(), '3d-models', path.basename(file).replace(/\.\w+$/, '') + '-' + Date.now().toString(36) + '.glb');
    await this.download(url, out);
    onStep && onStep('بيحطه في الأفتر…');
    const raw = { comp: { create: true, name: '3D Model', duration: 8, bg: '#0b0806', renderer: '3d' }, layers: [
      { type: 'camera', name: 'Camera', camera: { zoom: 2200 }, transform: { position: ['50%', '50%', -2200] }, keys: { position: [[0, ['40%', '45%', -2400], 'easeInOut'], [8, ['60%', '50%', -1900]]] } },
      { type: 'light', name: 'Key', lightType: 'point', light: { intensity: 120 }, transform: { position: ['30%', '20%', -900] } },
      { type: 'light', name: 'Ambient', lightType: 'ambient', light: { intensity: 40 } },
      { type: 'footage', name: 'Model', file: out, cover: false, threeD: true, expressions: { rotationY: 'time*25' } }
    ] };
    const b = await this.sceneBuild(raw, { where: 'new' });
    return Object.assign({}, b, { file: out });
  }

  /* ---------- تراكينج ---------- */
  /** the footage to track + a picture of the current frame to click points on */
  async trackFrame() {
    const src = await this.host('trackSource', {});
    const t = Math.max(0, src.comp.time - src.layer.startTime);
    const b64 = await vision.frameJpeg(this.ffmpeg(), src.layer.file, t, { width: 960 });
    return { src, b64, time: t };
  }
  /** "الوش" / "الموبايل" → where it is in the frame (normalised), from the vision model; corners for a screen */
  async trackFind(what, { corners = false } = {}) {
    if (!this.settings.keys.openrouter) throw new Error('حط مفتاح OpenRouter الأول');
    const { b64 } = await this.trackFrame();
    const r = await this.askJson(corners
      ? 'حدد الـ 4 أركان بتوع "' + what + '" في الصورة (شاشة / لوحة / ورقة). رجّع JSON: {"points":[[x,y] فوق-شمال، فوق-يمين، تحت-يمين، تحت-شمال]} الأرقام 0-1 من عرض وطول الصورة.'
      : 'حدد نقطة واضحة فيها تفاصيل (مش مساحة سادة) على "' + what + '" في الصورة تنفع للتراكينج. رجّع JSON: {"points":[[x,y]]} الأرقام 0-1 من عرض وطول الصورة. لو عايز نقطتين (للسكيل واللف) حط نقطتين متباعدتين على نفس الحاجة.',
      vision.imageMessage([{ label: 'الفريم', time: 0, b64 }], 'الفريم').content, 400, { history: false });
    const pts = (r.points || []).filter(p => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])).map(p => [Math.min(1, Math.max(0, +p[0])), Math.min(1, Math.max(0, +p[1]))]);
    if (!pts.length) throw new Error('مالقيتش "' + what + '" في الفريم');
    return { points: pts.slice(0, 4) };
  }
  /**
   * Track from the comp time. points: normalised [x,y] on the frame (1 = position, 2 = + scale & rotation, 4 = corner pin).
   * mode: attach (null + parent the other selected layers / a new text) | pin (Corner Pin on a selected layer) | stabilize
   */
  async track({ points = [], mode = 'attach', duration = 0, text = '', onStep } = {}) {
    const step = m => { try { onStep && onStep(m); } catch (_) {} };
    if (!points.length) throw new Error('حط نقطة (أو أكتر) على الفريم الأول');
    if (mode === 'pin' && points.length !== 4) throw new Error('الـ Corner Pin محتاج 4 نقط (الأركان)');
    const src = await this.host('trackSource', {}), L = src.layer, C = src.comp;
    const start = Math.max(0, C.time - L.startTime), dur = Math.max(0.2, Math.min(60, duration || (L.outPoint - C.time), C.duration - C.time));
    step('بيقرا الفريمات…');
    const fr = await track.frames(this.ffmpeg(), L.file, { start, duration: dur, fps: Math.round(C.fps) || 30, width: 640, srcW: L.srcW, srcH: L.srcH });
    if (fr.frames.length < 2) throw new Error('الفيديو قصير قوي من المكان ده');
    step('بيتتبّع ' + fr.frames.length + ' فريم…');
    const tracks = points.map(p => track.trackPoint(fr.frames, fr.w, fr.h, [p[0] * fr.w, p[1] * fr.h]));
    const lost = Math.min(...tracks.map(t => { const k = track.lostAt(t); return k < 0 ? Infinity : k; }));
    const n = isFinite(lost) ? Math.max(2, lost) : fr.frames.length;
    const times = [], src2 = i => tracks.map(t => [t[i].x / fr.scale, t[i].y / fr.scale]);
    for (let i = 0; i < n; i++) times.push(+(C.time + i / fr.fps).toFixed(4));
    const comp = pt => track.toComp(pt, L);
    const a = { name: 'EF Track ' + (points.length > 1 ? points.length + 'pt' : '') + ' ' + L.name, times };
    if (mode === 'stabilize') {
      a.stabilize = L.name;
      a.anchor = times.map((_, i) => src2(i)[0]);
      if (points.length >= 2) { const sim = track.similarity(tracks[0].slice(0, n), tracks[1].slice(0, n)); const s0 = (L.scale || [100])[0]; a.anchor = sim.map(q => [q.x / fr.scale, q.y / fr.scale]); a.stabScale = sim.map(q => s0 * 100 / q.scale); a.stabRotation = sim.map(q => (L.rotation || 0) - q.rotation); }
    } else if (mode === 'pin') {
      const target = (src.others || [])[0];
      if (!target) throw new Error('اختار مع الفيديو اللير اللي هيتحط على الشاشة (الصورة / الفيديو الجديد)');
      const inv = q => { const an = target.anchor || [0, 0], po = target.position || [0, 0], sc = target.scale || [100, 100], r = -(target.rotation || 0) * Math.PI / 180; const x = q[0] - po[0], y = q[1] - po[1]; return [(x * Math.cos(r) - y * Math.sin(r)) * 100 / sc[0] + an[0], (x * Math.sin(r) + y * Math.cos(r)) * 100 / sc[1] + an[1]]; };
      a.pin = target.name;
      a.corners = times.map((_, i) => src2(i).map(q => inv(comp(q))));
    } else {
      if (points.length >= 2) {
        const sim = track.similarity(tracks[0].slice(0, n), tracks[1].slice(0, n));
        a.position = sim.map(q => comp([q.x / fr.scale, q.y / fr.scale])); a.scale = sim.map(q => q.scale); a.rotation = sim.map(q => q.rotation);
      } else a.position = times.map((_, i) => comp(src2(i)[0]));
      a.attach = (src.others || []).map(o => o.name);
      if (text) {
        const tname = 'Tracked Text';
        await this.sceneEdit([{ op: 'add', layer: { type: 'text', name: tname, text, size: Math.round(C.height * 0.05), transform: { position: [a.position[0][0], a.position[0][1] - C.height * 0.08] }, effects: [{ name: 'shadow', params: { opacity: 60, distance: 4, softness: 12 } }] } }]);
        a.attach.push(tname);
      }
    }
    step('بيكتب الكي فريمز…');
    const r = await this.host('applyTrack', a);
    return Object.assign({}, r, { frames: n, of: fr.frames.length, lost: isFinite(lost) ? +(lost / fr.fps).toFixed(2) : null });
  }

  /* ---------- كاراكتر ---------- */
  characterActions() { return Object.keys(character.ACTIONS).map(id => ({ id, name: character.ACTIONS[id] })); }
  /** a flat rubber-hose character, rigged with sliders, in the open comp (or a new one) */
  async characterAdd({ name = 'Character', action = 'walk', colors = {}, height = 0, walkAcross = false, where = 'auto' } = {}) {
    const comp = await this.compSize();
    const raw = { comp: { create: !comp.width || where === 'new', name: name + ' — ' + (character.ACTIONS[action] || action), duration: 8, bg: '#fff7ed' }, layers: [{ type: 'character', name, action, colors, height: height || undefined, walkAcross }] };
    return this.sceneBuild(raw, { where: comp.width && where !== 'new' ? 'here' : 'new' });
  }
  /** rig the user's own character layers (PSD / AI pieces named head, body, arm L…): joints, parents, walk/idle sliders, IK */
  async characterRig({ ik = false } = {}) {
    const info = await this.host('rigInfo', {});
    const plan = character.rigPlan(info.layers, { ik });
    const r = await this.host('rigApply', { plan });
    return Object.assign({}, r, { roles: plan.layers.map(l => l.role + (l.side ? ' ' + l.side : '') + ' ← ' + l.name) });
  }
  /** lip sync: the voice's loudness per frame → the "Mouth" slider of a character controller (+ the audio in the comp) */
  async lipSync({ audio, ctrl } = {}) {
    if (!audio) throw new Error('اختار ملف الصوت');
    const st = await this.host('sceneState', {});
    if (!st.comp) throw new Error('افتح الكومب اللي فيه الكاراكتر');
    const target = ctrl || ((st.layers || []).find(l => / Ctrl$|^EF Character$/.test(l.name)) || {}).name;
    if (!target) throw new Error('مالقيتش كنترولر كاراكتر (اعمل كاراكتر أو ريج الأول)');
    const fps = Math.round(st.comp.fps) || 30, rate = 16000;
    const pcm = await ff.decodePCM(this.ffmpeg(), audio, { rate, duration: Math.max(1, st.comp.duration - st.comp.time) });
    const curve = character.mouthCurve(pcm, rate, fps);
    const keys = curve.slice(0, 6000).map((v, i) => [st.comp.time + i / fps, v, 'linear']);
    const r = await this.sceneEdit([
      { op: 'set', layer: target, look: { effects: [{ name: 'slider', label: 'Mouth' }], keys: { 'fx:Mouth.value': keys } } },
      { op: 'add', layer: { type: 'footage', name: 'Voice', file: audio, start: st.comp.time, cover: false } }
    ], st);
    return Object.assign({}, r, { frames: keys.length, ctrl: target });
  }

  /* ---------- أدوات الشغل اليومي (زي Motion Tools / Explode Shape Layers / Ray Dynamic Color) ---------- */
  explodeShapes() { return this.host('explodeShapes', {}); }
  alignLayers(o) { return this.host('alignLayers', o || {}); }
  sequenceLayers(o) { return this.host('sequenceLayers', o || {}); }
  colorRig() { return this.host('colorRig', {}); }
  /** music / voice loudness → "EF Audio" null with a Level slider (0–100) keyed per frame; the selected layers pulse with it */
  async audioReact({ audio, amount = 30, link = 'scale' } = {}) {
    if (!audio) throw new Error('اختار ملف الصوت');
    const st = await this.host('sceneState', {}), info = await this.compInfo();
    if (!st.comp) throw new Error('افتح كومب الأول');
    const fps = Math.round(st.comp.fps) || 30, rate = 16000;
    const pcm = await ff.decodePCM(this.ffmpeg(), audio, { rate, duration: Math.max(1, st.comp.duration - st.comp.time) });
    const curve = character.mouthCurve(pcm, rate, fps, { floor: 3, attack: 0.9, release: 0.35 });
    const keys = curve.slice(0, 6000).map((v, i) => [st.comp.time + i / fps, v, 'linear']);
    const level = 'thisComp.layer("EF Audio").effect("Level")("Slider")';
    const ex = { scale: `var l=${level}/100*${+amount / 100};mul(value,1+l)`, opacity: `var l=${level};Math.min(100,value*(0.4+l/100*0.6))`, glow: '' }[link];
    const ops = [{ op: 'add', layer: { type: 'null', name: 'EF Audio', effects: [{ name: 'slider', label: 'Level' }], keys: { 'fx:Level.value': keys } } }, { op: 'add', layer: { type: 'footage', name: 'Audio', file: audio, start: st.comp.time, cover: false } }];
    for (const s of ((info.comp && info.comp.selected) || []).slice(0, 30)) if (ex) ops.push({ op: 'set', layer: s.name, look: { expressions: { [link]: ex } } });
    const r = await this.sceneEdit(ops, st);
    return Object.assign({}, r, { frames: keys.length, linked: Math.max(0, ops.length - 2) });
  }

  async selfTest() { return this.host('selfTest', {}); }
}

module.exports = { AEServices, AI_ACTIONS };

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
    for (const op of (ops || []).slice(0, 40)) {
      if (!op || !op.op) continue;
      if (op.op === 'delete' && op.layer) out.push({ op: 'delete', layer: String(op.layer) });
      else if (op.op === 'retime') { const f = +op.factor; if (f > 0) out.push({ op: 'retime', factor: Math.min(5, Math.max(0.2, f)) }); }
      else if (op.op === 'add') {
        const n = aeScene.normalize({ comp: { create: false }, layers: [op.layer || op.spec] }, comp);
        warnings.push(...n.warnings);
        if (n.spec.layers[0]) out.push({ op: 'add', spec: n.spec.layers[0] });
      } else if (op.op === 'set' && op.layer) {
        const look = op.look || {}, known = (st.layers || []).find(l => l.name === op.layer);
        const n = aeScene.normalize({ comp: { create: false }, layers: [{ type: 'null', name: op.layer, threeD: known && known.threeD, transform: look.transform, keys: look.keys, effects: look.effects, expressions: look.expressions }] }, comp);
        warnings.push(...n.warnings);
        const L = n.spec.layers[0], o = { transform: L.transform, keys: L.keys, effects: L.effects, expressions: L.expressions };
        if (look.text !== undefined) o.text = String(look.text).slice(0, 400);
        if (look.color) o.color = aeScene.hex(look.color);
        if (+look.size > 0) o.size = Math.min(1000, Math.max(4, +look.size));
        out.push({ op: 'set', layer: String(op.layer), look: o });
      }
    }
    if (!out.length) throw new Error('مفيش تعديل يتعمل' + (warnings.length ? ': ' + warnings.slice(0, 3).join('، ') : ''));
    const r = await this.host('editScene', { ops: out });
    return Object.assign({}, r, { warnings });
  }
  /** frames of reference images / videos for the vision model (a video → 4 moments) */
  async refFrames(files, { width = 512, perVideo = 4, max = 10 } = {}) {
    const ffmpeg = this.ffmpeg(), probe = this.tools().ffprobe, frames = [];
    for (const f of (files || []).slice(0, 6)) {
      if (frames.length >= max) break;
      const name = path.basename(f);
      if (STILL.test(f)) { frames.push({ label: name, time: 0, b64: await vision.frameJpeg(ffmpeg, f, 0, { width }) }); continue; }
      let dur = 0; try { dur = probe ? (await ff.probe(probe, f)).duration : 0; } catch (_) {}
      const n = dur > 0 ? perVideo : 1;
      for (let i = 0; i < n && frames.length < max; i++) {
        const t = dur > 0 ? dur * (i + 0.5) / n : 0;
        try { frames.push({ label: name + ' @' + t.toFixed(1) + 's', time: t, b64: await vision.frameJpeg(ffmpeg, f, t, { width }) }); } catch (_) {}
      }
    }
    if (files && files.length && !frames.length) throw new Error('مقدرتش أطلع صور من الريفرانس');
    return frames;
  }
  async askJson(system, content, maxTokens = 8000) {
    const messages = [{ role: 'system', content: system + '\nرد بـ JSON صالح فقط من غير أي كلام زيادة.' }, ...this.history.slice(-8), { role: 'user', content }];
    let m;
    try { m = await this.llm.chat({ model: this.model('motion_ai'), messages, maxTokens, jsonMode: true }); }
    catch (e) { if (e.status === 400) m = await this.llm.chat({ model: this.model('motion_ai'), messages, maxTokens }); else throw e; }
    return extractJson(m.content) || {};
  }
  /**
   * The director: "اعمل إنترو بلوجو برتقالي بيلف" / "خلّي العنوان أكبر وأبطأ" / a reference image or video →
   * builds a new scene, edits the open one by layer names, or customises a library scene. Remembers the chat.
   * where: auto | new | here
   */
  async director({ message, refs = [], where = 'auto' }) {
    if (!this.settings.keys.openrouter) throw new Error('حط مفتاح OpenRouter من الإعدادات الأول');
    if (!String(message || '').trim() && !refs.length) throw new Error('اكتب المشهد اللي عايزه');
    const state = await this.host('sceneState', {}).catch(() => ({ comp: null, layers: [] }));
    const frames = refs.length ? await this.refFrames(refs) : [];
    const sys = [
      'أنت مونتير ومصمم موشن جرافيك محترف جوه أفتر إفكتس. بتحوّل وصف المستخدم (بالمصري) لمشهد حقيقي بليرز وكي فريمز هو يقدر يعدّل عليها.',
      'ردّك JSON بواحد من الأشكال دي:',
      '1) مشهد جديد: {"action":"build","say":"جملة بالمصري","scene":{…}}',
      '2) تعديل على الليرز الموجودة بأساميها بالظبط: {"action":"edit","say":"…","ops":[{"op":"set","layer":"اسم اللير","look":{"transform":{…},"keys":{…},"effects":[…],"expressions":{…},"text":"…","color":"#hex","size":90}},{"op":"add","layer":{…لير كامل بنفس شكل المشهد…}},{"op":"delete","layer":"اسم"},{"op":"retime","factor":1.5 (أكبر من 1 = أبطأ)}]}',
      '3) مشهد جاهز من المكتبة لو مناسب: {"action":"library","say":"…","use":"id","params":{"title":"…","subtitle":"…","color":"#hex"}} — المكتبة: ' + aeScene.SCENES.map(s => s.id + ' (' + s.name + ')').join('، '),
      aeScene.promptDoc(),
      where === 'new' ? 'المستخدم عايز مشهد جديد في كومب جديد (build).' : where === 'here' ? 'المستخدم عايز المشهد جوه الكومب المفتوح: build مع comp.create=false، أو edit.' : 'لو بيطلب تغيير في اللي موجود استخدم edit، ولو حاجة جديدة build.',
      frames.length ? 'المستخدم بعت ريفرانس (الصور تحت). حلّل: الألوان بالظبط (#hex)، الخط ووزنه، التكوين والمسافات، الإيقاع وشكل الحركة المتوقع، الإفكتات (جلو، بلور، جرين…). واعمل مشهد قريب منه جداً بنفس الإحساس، واكتب التحليل في "reference" بالمصري في سطرين.' : ''
    ].filter(Boolean).join('\n');
    const ctx = state.comp ? 'الكومب المفتوح: ' + JSON.stringify(state).slice(0, 6000) : 'مفيش كومب مفتوح.';
    const text = ctx + '\nالطلب: ' + (message || 'اعمل مشهد زي الريفرانس');
    const res = await this.askJson(sys, frames.length ? vision.imageMessage(frames, text).content : text);
    this.history.push({ role: 'user', content: String(message || '').slice(0, 1500) + (frames.length ? ' [+ريفرانس]' : '') }, { role: 'assistant', content: JSON.stringify(res).slice(0, 4000) });
    this.history = this.history.slice(-12);
    const out = { action: res.action, say: String(res.say || '').slice(0, 400), reference: res.reference ? String(res.reference).slice(0, 600) : '' };
    if (res.action === 'edit') out.result = await this.sceneEdit(res.ops, state);
    else if (res.action === 'library') out.result = await this.libraryScene(res.use, res.params || {}, where);
    else if (res.scene) { out.action = 'build'; out.result = await this.sceneBuild(res.scene, { where }); }
    else throw new Error('الموديل مارجّعش مشهد — جرّب توصف تاني' + (out.say ? ': ' + out.say : ''));
    return out;
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

  async selfTest() { return this.host('selfTest', {}); }
}

module.exports = { AEServices, AI_ACTIONS };

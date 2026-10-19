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

  async selfTest() { return this.host('selfTest', {}); }
}

module.exports = { AEServices, AI_ACTIONS };

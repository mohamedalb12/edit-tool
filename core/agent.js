'use strict';
// EditFast AI — مونتير ذكي جوه اللوحة. شغّال بـ OpenRouter بالموديل اللي تختاره، وأدواته هي أدوات الإضافة بس.
const motion = require('./motionPresets');
const titles = require('./titles');
const scene = require('./scene');

const LEVELS = {
  strong: { label: 'قوي', feature: 'agent_strong', maxSteps: 24 },
  max: { label: 'قوي جدًا', feature: 'agent_max', maxSteps: 48, review: true }
};

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

const TOOLS = [
  fn('get_project_state', 'حالة السيكوينس الحالية: الاسم والمدة والتراكات والكليبات ورأس التشغيل وهل فيه تفريغ.'),
  fn('ask_user', 'اسأل المونتير سؤال قصير لما تحتاج قرار منه (مثلًا ذوقه أو تأكيد قبل تغيير كبير). استخدمه بقلة.', {
    question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, ['question']),
  fn('save_style', 'احفظ ذوق المونتير (يتسأل مرة واحدة بس).', {
    style: { type: 'object', description: 'primary, accent, text, background (ألوان hex), font, pace (calm|medium|fast), captions (word|short|sentence), sfx (low|medium|high), motion (1|2|3), notes' } }, ['style']),
  fn('transcribe', 'فرّغ كلام السيكوينس بتوقيت لكل كلمة (أوفلاين). لازم قبل الكابشن والتكرار والهوك.', {
    dialect: { type: 'string', enum: ['egyptian', 'gulf', 'levantine', 'iraqi', 'maghrebi', 'msa', 'english'] } }),
  fn('get_transcript', 'هات التفريغ (جمل بتوقيتها) لفترة معينة أو للكل.', { from: { type: 'number' }, to: { type: 'number' } }),
  fn('remove_silences', 'شيل السكتات وقفل الفراغات (على نسخة من السيكوينس افتراضيًا).', {
    sensitivity: { type: 'number', description: '1..10 (أعلى = يقص أكتر)' }, crossfade: { type: 'boolean' } }),
  fn('remove_repeats', 'شيل التكرار وإعادات التيك والتهتهة من التفريغ.', { dry_run: { type: 'boolean' } }),
  fn('make_hook', 'خد جزء قوي من الفيديو وحطه في البداية كهوك (بيتعمل سيكوينس جديدة).', {
    start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string', description: 'نص اختياري يظهر على الهوك' } }, ['start', 'end']),
  fn('add_captions', 'نزّل كابشن SRT على التايملين من التفريغ.', {
    max_words: { type: 'number' }, max_duration: { type: 'number' }, single_word: { type: 'boolean' } }),
  fn('apply_motion', 'طبّق قالب حركة (كي فريمز على Transform) على الكليب اللي عند وقت معين.', {
    preset: { type: 'string', enum: motion.PRESETS.map(p => p.id) }, level: { type: 'number', enum: [1, 2, 3] }, time: { type: 'number' }, track: { type: 'number' } }, ['preset', 'time']),
  fn('add_title', 'نزّل تايتل متحرك جاهز عند وقت معين.', {
    template: { type: 'string', enum: titles.TEMPLATES.map(t => t.id) }, text: { type: 'string' }, time: { type: 'number' }, duration: { type: 'number' } }, ['template', 'text']),
  fn('build_scene', 'ابني مشهد متحرك (موشن جرافيك) بستايل المونتير وحطه على التايملين. layers: نصوص وأشكال بحركات دخول/خروج.', {
    time: { type: 'number' },
    spec: { type: 'object', description: 'duration (ث), background {type: solid|gradient|transparent, colors[]}, layers[{type:text|shape, text, x,y (0..1), size (نسبة من الارتفاع), color (hex أو primary|accent|text), box, underline, shape (rect|circle|line), w,h, in/out (' + scene.ANIMS.join('|') + '), delay, inDur, outDur}]' } }, ['spec']),
  fn('generate_sfx', 'ولّد مؤثر صوتي من وصف وحطه على التايملين.', {
    prompt: { type: 'string', description: 'وصف بالإنجليزي' }, time: { type: 'number' }, duration: { type: 'number' } }, ['prompt', 'time']),
  fn('auto_effects', 'خلّي محرك المؤثرات التلقائية يقرا الكلام ويحط مؤثرات صوت وحركة مناسبة.', { density: { type: 'string', enum: ['low', 'medium', 'high'] } }),
  fn('add_markers', 'حط ماركرز.', { markers: { type: 'array', items: { type: 'object', properties: { time: { type: 'number' }, name: { type: 'string' }, comment: { type: 'string' } }, required: ['time', 'name'] } } }, ['markers']),
  fn('search_broll', 'دوّر على لقطات B-Roll (Pexels/Pixabay/محلي).', { query: { type: 'string' }, type: { type: 'string', enum: ['video', 'photo'] } }, ['query']),
  fn('place_broll', 'حط لقطة B-Roll من نتايج البحث على التايملين.', { id: { type: 'string' }, time: { type: 'number' }, duration: { type: 'number' } }, ['id', 'time']),
  fn('library_search', 'دوّر في مكتبة المونتير الخاصة (sfx | transitions | overlays | music).', { q: { type: 'string' }, category: { type: 'string', enum: ['sfx', 'transitions', 'overlays', 'music'] } }),
  fn('place_library_item', 'حط عنصر من مكتبة المونتير على التايملين.', { id: { type: 'string' }, time: { type: 'number' } }, ['id', 'time']),
  fn('chapters', 'طلّع فصول يوتيوب من الكلام وحطها ماركرز.'),
  fn('set_playhead', 'حرّك رأس التشغيل.', { time: { type: 'number' } }, ['time'])
];

function systemPrompt({ style, level }) {
  return [
    'أنت "EditFast AI"، مونتير فيديو محترف شغّال جوه إضافة EditFast في Adobe Premiere Pro.',
    'شغلتك الوحيدة هي مونتاج السيكوينس المفتوحة في المشروع ده باستخدام الأدوات المتاحة. لو اتطلب منك أي حاجة برّه المونتاج والمشروع ده، اعتذر بلطف في جملة ورجّع الكلام للمونتاج.',
    'اتكلم بالعامية المصرية باختصار. ماتشرحش كتير — اشتغل.',
    'طريقة شغلك:',
    '1) ابدأ دايمًا بـ get_project_state.',
    style ? `2) ذوق المونتير محفوظ: ${JSON.stringify(style)} — التزم بيه (الألوان والخط والإيقاع).`
      : '2) ذوق المونتير لسه مش محفوظ: اسأله مرة واحدة بس بـ ask_user (ألوانه، الخط، الإيقاع، شكل الكابشن، كمية المؤثرات) وبعدين save_style.',
    '3) قرر الفيديو ده محتاج إيه فعلًا: شيل التكرار والسكتات، ابدأ بهوك قوي لو الفيديو محتاج، مشاهد متحركة بستايله، كابشن ومؤثرات على الكلمة.',
    '4) لو المونتير طلب حاجة محددة ("ابني المشهد الفلاني" / "اعمل كذا") نفّذها هي بس من غير ما تعمل حاجات زيادة.',
    '5) العمليات اللي بتشيل أجزاء بتشتغل على نسخة من السيكوينس عشان الأصل يفضل سليم.',
    '6) الأوقات كلها بالثواني على تايملين السيكوينس.',
    level === 'max' ? '7) مستوى "قوي جدًا": خطط الأول بالتفصيل، نفّذ، وبعدين راجع النتيجة بـ get_project_state وصلّح أي حاجة ناقصة قبل ما تخلص.' : '7) مستوى "قوي": نفّذ بكفاءة.',
    'في الآخر اكتب ملخص قصير باللي اتعمل.'
  ].join('\n');
}

class EditFastAgent {
  /**
   * services: object with the tool implementations (see core/services.js)
   * llm: OpenRouter client, model: model id, events: {onText, onTool, onToolResult}
   */
  constructor({ llm, model, services, level = 'strong', events = {}, style = null }) {
    this.llm = llm; this.model = model; this.services = services; this.level = LEVELS[level] ? level : 'strong';
    this.events = events; this.style = style;
    this.messages = [{ role: 'system', content: systemPrompt({ style, level: this.level }) }];
    this.stopped = false;
  }

  stop() { this.stopped = true; }

  async callTool(name, args) {
    const s = this.services;
    switch (name) {
      case 'get_project_state': return s.projectState();
      case 'ask_user': return { answer: await s.askUser(args.question, args.options || []) };
      case 'save_style': this.style = await s.saveStyle(args.style); return { saved: true };
      case 'transcribe': { const t = await s.transcribe({ dialect: args.dialect }); return { words: t.words.length, duration: t.words.length ? t.words[t.words.length - 1].end : 0 }; }
      case 'get_transcript': return s.transcriptSentences(args.from, args.to);
      case 'remove_silences': return s.quickCut({ sensitivity: args.sensitivity, crossfade: args.crossfade !== false });
      case 'remove_repeats': return s.removeRepeats({ dryRun: !!args.dry_run });
      case 'make_hook': return s.makeHook(args);
      case 'add_captions': return s.addCaptions({ maxWords: args.max_words, maxDuration: args.max_duration, singleWord: args.single_word });
      case 'apply_motion': return s.applyMotion({ preset: args.preset, level: args.level || (this.style && +this.style.motion) || 2, time: args.time, track: args.track });
      case 'add_title': return s.addTitle({ template: args.template, text: args.text, time: args.time, duration: args.duration });
      case 'build_scene': return s.buildScene({ spec: args.spec, time: args.time });
      case 'generate_sfx': return s.generateSfx({ prompt: args.prompt, time: args.time, duration: args.duration, place: true });
      case 'auto_effects': return s.autoEffects({ density: args.density || (this.style && this.style.sfx) || 'medium', apply: true });
      case 'add_markers': return s.addMarkers(args.markers);
      case 'search_broll': return s.brollSearch({ q: args.query, type: args.type || 'video', compact: true });
      case 'place_broll': return s.brollPlace({ id: args.id, time: args.time, duration: args.duration });
      case 'library_search': return s.librarySearch({ q: args.q || '', category: args.category || '' }).slice(0, 30).map(x => ({ id: x.id, name: x.name, category: x.category, sub: x.sub }));
      case 'place_library_item': return s.libraryPlace({ id: args.id, time: args.time });
      case 'chapters': return s.chapters({ addMarkers: true });
      case 'set_playhead': return s.setPlayhead(args.time);
      default: throw new Error('أداة مش معروفة: ' + name);
    }
  }

  /** Send one user instruction and run the tool loop until the model answers in text. */
  async send(text) {
    this.stopped = false;
    this.messages.push({ role: 'user', content: text });
    const max = LEVELS[this.level].maxSteps;
    for (let step = 0; step < max; step++) {
      if (this.stopped) return { stopped: true };
      const msg = await this.llm.chat({ model: this.model, messages: this.messages, tools: TOOLS, maxTokens: 8000 });
      const calls = msg.tool_calls || [];
      this.messages.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (msg.content && this.events.onText) this.events.onText(msg.content, !calls.length);
      if (!calls.length) return { text: msg.content || '', steps: step + 1 };
      for (const call of calls) {
        let args = {};
        try { args = call.function.arguments ? JSON.parse(call.function.arguments) : {}; } catch (_) { args = {}; }
        if (this.events.onTool) this.events.onTool(call.function.name, args);
        let result;
        try { result = { ok: true, result: await this.callTool(call.function.name, args) }; }
        catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
        if (this.events.onToolResult) this.events.onToolResult(call.function.name, result);
        this.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 20000) });
        if (this.stopped) return { stopped: true };
      }
    }
    return { text: 'وصلت للحد الأقصى من الخطوات. قولّي أكمّل؟', steps: max };
  }
}

module.exports = { EditFastAgent, TOOLS, LEVELS, systemPrompt };

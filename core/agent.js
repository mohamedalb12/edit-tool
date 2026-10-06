'use strict';
// EditFast AI — مونتير ذكي جوه اللوحة. شغّال بـ OpenRouter بالموديل اللي تختاره، وأدواته هي أدوات الإضافة بس.
const motion = require('./motionPresets');
const titles = require('./titles');
const scene = require('./scene');
const glass = require('./liquidGlass');
const vision = require('./vision');
const packs = require('./stylePacks');
const templates = require('./templates');
const sfxPack = require('./sfxPack');
const captionStyles = require('./captionStyles');

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
  fn('look_at_frames', 'شوف صور من الفيديو نفسه (فريمات) عشان تحكم على الصورة: أحسن تيك، اللقطة مضلمة/مهزوزة، فين حد بيضحك، مكان الـ B-Roll، الألوان… الصور بتوصلك في الرسالة اللي بعدها.', {
    times: { type: 'array', items: { type: 'number' }, description: 'أوقات على التايملين (لحد 12). فاضي = عينة من اللقطات' }, count: { type: 'number' } }),
  fn('get_transcript', 'هات التفريغ (جمل بتوقيتها) لفترة معينة أو للكل.', { from: { type: 'number' }, to: { type: 'number' } }),
  fn('remove_silences', 'شيل السكتات وقفل الفراغات (على نسخة من السيكوينس افتراضيًا).', {
    sensitivity: { type: 'number', description: '1..10 (أعلى = يقص أكتر)' }, crossfade: { type: 'boolean' } }),
  fn('remove_repeats', 'شيل التكرار وإعادات التيك والتهتهة من التفريغ.', { dry_run: { type: 'boolean' } }),
  fn('make_hook', 'خد جزء قوي من الفيديو وحطه في البداية كهوك (بيتعمل سيكوينس جديدة).', {
    start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string', description: 'نص اختياري يظهر على الهوك' } }, ['start', 'end']),
  fn('add_captions', 'نزّل كابشن على التايملين من التفريغ. animated=true (الافتراضي) = كابشن متحرك متزامن مع كل كلمة بستايل؛ animated=false = SRT عادي يتعدّل من تبويب Text.', {
    max_words: { type: 'number' }, max_duration: { type: 'number' }, single_word: { type: 'boolean' }, animated: { type: 'boolean' },
    style: { type: 'string', enum: captionStyles.STYLES.map(x => x.id) }, position: { type: 'string', enum: ['bottom', 'center', 'top'] },
    anim: { type: 'string', enum: captionStyles.ANIMS.map(x => x.id), description: 'دخول كل كلمة: drop نازلة من فوق، slideStart من الجنب…' },
    ease: { type: 'string', enum: captionStyles.EASES.map(x => x.id), description: 'out = سريع في الأول وبطيء في الآخر' }, anim_speed: { type: 'number', description: 'مدة دخول الكلمة بالثواني (0.1-1.2)' },
    timing: { type: 'string', enum: ['sync', 'cascade', 'line'] }, word_gap: { type: 'number', description: 'للـ cascade: ثواني بين كل كلمة' }, exit: { type: 'string', enum: captionStyles.EXITS.map(x => x.id) } }),
  fn('translate_captions', 'ترجم الكابشن للغة تانية (بنفس التوقيت) كتراك كابشن جديد.', { lang: { type: 'string', description: 'مثلاً English, French' } }, ['lang']),
  fn('apply_motion', 'طبّق قالب حركة (كي فريمز على Transform) على الكليب اللي عند وقت معين.', {
    preset: { type: 'string', enum: motion.PRESETS.map(p => p.id) }, level: { type: 'number', enum: [1, 2, 3] }, time: { type: 'number' }, track: { type: 'number' } }, ['preset', 'time']),
  fn('add_title', 'نزّل تايتل متحرك جاهز عند وقت معين.', {
    template: { type: 'string', enum: titles.TEMPLATES.map(t => t.id) }, text: { type: 'string' }, time: { type: 'number' }, duration: { type: 'number' } }, ['template', 'text']),
  fn('build_scene', 'ابني مشهد متحرك (موشن جرافيك) بستايل المونتير وحطه على التايملين. layers: نصوص وأشكال بحركات دخول/خروج.', {
    time: { type: 'number' },
    spec: { type: 'object', description: 'duration (ث), background {type: solid|gradient|transparent, colors[]}, layers[{type:text|shape, text, x,y (0..1), size (نسبة من الارتفاع), color (hex أو primary|accent|text), box, underline, shape (rect|circle|line), w,h, in/out (' + scene.ANIMS.join('|') + '), delay, inDur, outDur}]' } }, ['spec']),
  fn('pro_scene', 'مشهد موشن جرافيك احترافي بمحرك Remotion (أقوى بكتير من build_scene): عناوين حركية، أرقام، رسوم، قوائم، لوور ثيرد، لوجو، اشترك، كولاج، كاروسيل ثري دي، نص ثري دي، محادثة، إشعار، متصفح… اكتب brief والمخرج هيصممه (ولو فيه style بيستخدم لقطات من الفيديو).', {
    brief: { type: 'string', description: 'وصف المشهد (المحتوى والإحساس)' }, spec: { type: 'object', description: 'اختياري: مواصفات جاهزة {duration, style, background:{type}, elements:[{type, from, duration, position, props}]}' },
    style: { type: 'string', enum: Object.keys(packs.PACKS) }, duration: { type: 'number' }, overlay: { type: 'boolean', description: 'true = خلفية شفافة فوق الفيديو' }, time: { type: 'number' } }),
  fn('edit_scene', 'عدّل مشهد EditFast موجود على التايملين (المختار أو اللي عند رأس التشغيل): تغيير نص، لون، توقيت، حركة، عنصر زيادة… وبيترندر تاني في نفس مكانه.', { instruction: { type: 'string', description: 'التعديل المطلوب' } }, ['instruction']),
  fn('style_edit', 'مونتاج بالاستايل: المخرج يخطط كذا مشهد بالاستايل المطلوب (' + packs.list().map(p => p.label).join('، ') + ') من كلام الفيديو ولقطاته، وRemotion يرندرها ويحطها على التايملين. طلب واحد للذكاء الاصطناعي لكل المشاهد.', {
    style: { type: 'string', enum: Object.keys(packs.PACKS) }, brief: { type: 'string', description: 'اللي المونتير عايزه (اختياري)' }, count: { type: 'number', description: 'عدد المشاهد 1-8' }, captions: { type: 'boolean', description: 'كابشن متحرك بنفس الاستايل' } }, ['style']),
  fn('add_template', 'حط قالب جاهز من مكتبة القوالب (نصوص، جلاس، واجهات، مشاهد، ثري دي، كولاج) بنصوصك.', {
    id: { type: 'string', enum: templates.TEMPLATES.map(t => t.id) }, values: { type: 'object', description: 'نصوص بالشكل {"0.text":"..."} (رقم العنصر.اسم الخاصية)' }, time: { type: 'number' }, duration: { type: 'number' } }, ['id']),
  fn('carousel_3d', 'كاروسيل ثري دي من لقطات الفيديو (أو ملفات): ring | coverflow | helix | stack.', {
    layout: { type: 'string', enum: ['ring', 'coverflow', 'helix', 'stack'] }, files: { type: 'array', items: { type: 'string' } }, speed: { type: 'number' }, title: { type: 'string' },
    background: { type: 'string', enum: ['studio', 'mesh', 'transparent', 'particles'] }, duration: { type: 'number' }, time: { type: 'number' } }),
  fn('add_icon', 'حط أيقونة متحركة (سوشيال، مونتاج، عربيات، عقارات، أماكن، بيزنس…). query بالعربي أو الإنجليزي.', {
    query: { type: 'string' }, anim: { type: 'string', enum: ['draw', 'pop', 'bounce', 'spin', 'pulse', 'shake', 'slide'] }, badge: { type: 'string', enum: ['none', 'circle', 'square', 'glass'] },
    label: { type: 'string' }, color: { type: 'string' }, position: { type: 'string', enum: ['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight'] }, time: { type: 'number' }, duration: { type: 'number' } }, ['query']),
  fn('place_trendy_sfx', 'حط مؤثر صوتي ترند من الباقة الأوفلاين (مجاني ومن غير نت).', { id: { type: 'string', enum: Object.keys(sfxPack.SOUNDS) }, time: { type: 'number' } }, ['id', 'time']),
  fn('generate_music', 'ولّد مزيكا خلفية بالذكاء الاصطناعي (ElevenLabs) وحطها على التايملين.', { prompt: { type: 'string' }, seconds: { type: 'number' }, time: { type: 'number' } }, ['prompt']),
  fn('download_video', 'نزّل فيديو/صوت من لينك (يوتيوب، إنستجرام، تيك توك، بنترست، X) بجودة وجزء معيّن وحطه على التايملين.', {
    url: { type: 'string' }, quality: { type: 'string', enum: ['best', '2160', '1080', '720', '480', 'audio'] }, start: { type: 'string', description: 'مثلاً 1:20' }, end: { type: 'string' }, time: { type: 'number' } }, ['url']),
  fn('web_media_search', 'دوّر في النت على صور/فيديو/صوت مجانية (Openverse, Wikimedia, Google لو متفعّل, Pexels, Pixabay).', { query: { type: 'string' }, type: { type: 'string', enum: ['image', 'video', 'audio'] } }, ['query']),
  fn('web_media_place', 'نزّل نتيجة من بحث النت وحطها على التايملين.', { id: { type: 'string' }, time: { type: 'number' }, duration: { type: 'number' } }, ['id']),
  fn('safe_zones_check', 'افحص المناطق الآمنة لريلز/تيك توك/شورتس: الوشوش والكابشن بعيد عن زراير المنصة؟', { platform: { type: 'string', enum: ['tiktok', 'reels', 'shorts', 'all'] }, add_markers: { type: 'boolean' } }),
  fn('relink_missing', 'دوّر على الملفات الناقصة (Media Offline) في الجهاز واربطها تاني.', { folders: { type: 'array', items: { type: 'string' } } }),
  fn('liquid_glass', 'حط عنصر Liquid Glass (زجاج سايل بيكسر ويغبّش الفيديو اللي تحته، الستايل المشهور) فوق الفيديو عند وقت معين.', {
    preset: { type: 'string', enum: glass.PRESETS.map(p => p.id) },
    label: { type: 'string', description: 'نص على الزجاج' }, text: { type: 'string', description: 'للـ glass-text: الكلمة نفسها زجاج' },
    x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
    tint: { type: 'string', description: 'لون hex' }, tint_amount: { type: 'number' }, blur: { type: 'number' }, refract: { type: 'number' },
    anim_in: { type: 'string', enum: glass.ANIMS_IN }, time: { type: 'number' }, duration: { type: 'number' } }, ['preset']),
  fn('generate_sfx', 'ولّد مؤثر صوتي من وصف وحطه على التايملين.', {
    prompt: { type: 'string', description: 'وصف بالإنجليزي' }, time: { type: 'number' }, duration: { type: 'number' } }, ['prompt', 'time']),
  fn('auto_effects', 'خلّي محرك المؤثرات التلقائية يقرا الكلام ويحط مؤثرات صوت وحركة مناسبة.', { density: { type: 'string', enum: ['low', 'medium', 'high'] } }),
  fn('add_markers', 'حط ماركرز.', { markers: { type: 'array', items: { type: 'object', properties: { time: { type: 'number' }, name: { type: 'string' }, comment: { type: 'string' } }, required: ['time', 'name'] } } }, ['markers']),
  fn('search_broll', 'دوّر على لقطات B-Roll (Pexels/Pixabay/محلي).', { query: { type: 'string' }, type: { type: 'string', enum: ['video', 'photo'] } }, ['query']),
  fn('place_broll', 'حط لقطة B-Roll من نتايج البحث على التايملين.', { id: { type: 'string' }, time: { type: 'number' }, duration: { type: 'number' } }, ['id', 'time']),
  fn('library_search', 'دوّر في مكتبة المونتير الخاصة (sfx | transitions | overlays | music).', { q: { type: 'string' }, category: { type: 'string', enum: ['sfx', 'transitions', 'overlays', 'music'] } }),
  fn('place_library_item', 'حط عنصر من مكتبة المونتير على التايملين.', { id: { type: 'string' }, time: { type: 'number' } }, ['id', 'time']),
  fn('auto_edit', 'مونتاج كامل بضغطة: تفريغ، تكرار، سكتات، هوك، تنضيف صوت، زووم، B-Roll، مؤثرات، توطية موسيقى، كابشن. اسأل المونتير الأول بـ ask_user لو هتعمل كل ده.', {
    skip: { type: 'array', items: { type: 'string' }, description: 'خطوات تتشال: transcribe, repeats, silences, hook, cleanAudio, zooms, broll, sfx, duck, captions, chapters' } }),
  fn('make_reels', 'حوّل السيكوينس لفيديو طولي (ريلز/تيك توك) والكاميرا بتتبع وش اللي بيتكلم (أوفلاين). بيعمل سيكوينس جديدة.', { ratio: { type: 'string', enum: ['9:16', '4:5', '1:1'] } }),
  fn('find_shorts', 'دوّر في الفيديو الطويل على أقوى مقاطع تنفع شورتس (20-60 ثانية).', { count: { type: 'number' } }),
  fn('make_short', 'اعمل شورت من مقطع: سيكوينس جديدة فيها المقطع بس، ومعاه تحويل طولي وكابشن.', { start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string' }, reframe: { type: 'boolean' }, captions: { type: 'boolean' } }, ['start', 'end']),
  fn('clean_audio', 'نضّف صوت الكلام أوفلاين (دوشة، رمبل، سين حادة، ضغط، علو صوت موحد) — النسخة النضيفة بتنزل على تراك جديد والأصلي بيتكتم.', { strength: { type: 'string', enum: ['light', 'medium', 'strong'] }, loudness: { type: 'number', description: 'LUFS (يوتيوب -14، بودكاست -16)' } }),
  fn('duck_music', 'وطّي الموسيقى تلقائي وقت الكلام وارفعها في السكوت (كي فريمز Volume).', { duck_db: { type: 'number', description: 'كام dB تتوطّى (افتراضي -12)' } }),
  fn('thumbnail_ideas', 'اقترح عناوين ثامبنيل وأحلى فريم للفيديو (المونتير يكمّل التصميم من تبويب الثامبنيل).'),
  fn('undo_last', 'رجّع آخر عملية عملتها (القص بيرجع للسيكوينس الأصلية، والحاجات اللي اتحطت بتتشال).'),
  fn('chapters', 'طلّع فصول يوتيوب من الكلام وحطها ماركرز.'),
  fn('set_playhead', 'حرّك رأس التشغيل.', { time: { type: 'number' } }, ['time'])
];

function systemPrompt({ style, level }) {
  return [
    'أنت "EditFast AI"، مونتير فيديو محترف شغّال جوه إضافة EditFast في Adobe Premiere Pro.',
    'شغلتك الوحيدة هي مونتاج السيكوينس المفتوحة في المشروع ده باستخدام الأدوات المتاحة. لو اتطلب منك أي حاجة برّه المونتاج والمشروع ده، اعتذر بلطف في جملة ورجّع الكلام للمونتاج.',
    'اتكلم بالعامية المصرية باختصار. ماتشرحش كتير — اشتغل.',
    'طريقة شغلك:',
    '1) كل رسالة من المونتير جاية ومعاها <sequence_now>: صورة حية من السيكوينس (التراكات والكليبات ورأس التشغيل والمختار والماركرز والمؤثرات والتفريغ). اعتمد عليها: لو سأل سؤال عن السيكوينس (فيه إيه، قال إيه عند دقيقة كذا، الكليب ده طوله قد إيه، فين الجزء اللي اتكلم فيه عن كذا) جاوب منها على طول من غير أدوات. لو محتاج تفاصيل أكتر استخدم get_project_state أو get_transcript. ماتعدّلش حاجة لما يكون بيسأل بس.',
    style ? `2) ذوق المونتير محفوظ: ${JSON.stringify(style)} — التزم بيه (الألوان والخط والإيقاع).`
      : '2) ذوق المونتير لسه مش محفوظ: اسأله مرة واحدة بس بـ ask_user (ألوانه، الخط، الإيقاع، شكل الكابشن، كمية المؤثرات) وبعدين save_style.',
    '3) قرر الفيديو ده محتاج إيه فعلًا: شيل التكرار والسكتات، ابدأ بهوك قوي لو الفيديو محتاج، مشاهد متحركة بستايله، كابشن ومؤثرات على الكلمة.',
    '3.2) عندك عين: look_at_frames بيوريك صور حقيقية من الفيديو. استخدمها لما القرار محتاج تشوف الصورة (أحسن تيك، جودة اللقطة، مكان مناسب للـ B-Roll أو للنص، سؤال عن اللي باين في الكادر).',
    '3.5) للمشاهد المتحركة استخدم pro_scene (Remotion) — جودته أعلى بكتير؛ build_scene بس لو pro_scene رجّع إنه مش متثبّت.',
    '3.55) المشاهد بتنزل لايرز (سيكونس جوه السيكونس) والمونتير يقدر يعدّل فيها. لو طلب تعديل في مشهد نازل قبل كده استخدم edit_scene (مش مشهد جديد).',
    '3.6) لو طلب استايل (كولاج آرت، ثري دي، نيون، مينيمال، سينمائي، بوب آرت، جلاس، واجهات سوشيال) للفيديو كله استخدم style_edit؛ لمشهد واحد pro_scene مع style. للقوالب الجاهزة add_template، للأيقونات add_icon، والمؤثرات الترند place_trendy_sfx (مجانية وأوفلاين).',
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

  /** Running token count for the conversation (cached = prompt tokens read from the provider's cache). */
  trackUsage(u) {
    if (!u) return;
    const t = this.usage = this.usage || { prompt: 0, completion: 0, cached: 0, cost: 0 };
    t.prompt += u.prompt_tokens || 0; t.completion += u.completion_tokens || 0;
    t.cached += (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
    if (typeof u.cost === 'number') t.cost += u.cost;
    if (this.events.onUsage) this.events.onUsage({ ...t });
  }

  async callTool(name, args) {
    const s = this.services;
    switch (name) {
      case 'get_project_state': return s.projectState();
      case 'ask_user': return { answer: await s.askUser(args.question, args.options || []) };
      case 'save_style': this.style = await s.saveStyle(args.style); return { saved: true };
      case 'transcribe': { const t = await s.transcribe({ dialect: args.dialect }); return { words: t.words.length, duration: t.words.length ? t.words[t.words.length - 1].end : 0 }; }
      case 'look_at_frames': {
        const frames = await s.lookAtFrames({ times: args.times, count: args.count || 6 });
        if (!frames.length) return { frames: 0, note: 'مفيش صورة عند الأوقات دي' };
        this.pendingImages = (this.pendingImages || []).concat(frames);
        return { frames: frames.length, times: frames.map(f => f.time), note: 'الصور جاية في الرسالة الجاية' };
      }
      case 'get_transcript': return s.transcriptSentences(args.from, args.to);
      case 'remove_silences': return s.quickCut({ sensitivity: args.sensitivity, crossfade: args.crossfade !== false });
      case 'remove_repeats': return s.removeRepeats({ dryRun: !!args.dry_run });
      case 'make_hook': return s.makeHook(args);
      case 'add_captions': {
        const o = { maxWords: args.max_words, maxDuration: args.max_duration, singleWord: args.single_word };
        if (args.animated === false) return s.addCaptions(o);
        const st = { style: args.style || (this.style && this.style.captionStyle) || 'bold', position: args.position, anim: args.anim, ease: args.ease, animDur: args.anim_speed, timing: args.timing, wordGap: args.word_gap, exit: args.exit };
        Object.keys(st).forEach(k => st[k] === undefined && delete st[k]);
        return s.addAnimatedCaptions({ ...o, style: st });
      }
      case 'translate_captions': return s.translateCaptions({ lang: args.lang });
      case 'apply_motion': return s.applyMotion({ preset: args.preset, level: args.level || (this.style && +this.style.motion) || 2, time: args.time, track: args.track });
      case 'add_title': return s.addTitle({ template: args.template, text: args.text, time: args.time, duration: args.duration });
      case 'build_scene': return s.buildScene({ spec: args.spec, time: args.time });
      case 'pro_scene': {
        const spec = args.spec && args.spec.elements ? { ...args.spec, style: args.spec.style || args.style } : await s.designProScene({ brief: args.brief || '', duration: args.duration, transparent: !!args.overlay, style: args.style });
        if (args.overlay) spec.background = { type: 'transparent' };
        const r = await s.renderProScene({ spec, time: args.time });
        return { track: r.track, start: r.start, end: r.end, elements: r.spec.elements.map(e => e.type) };
      }
      case 'liquid_glass': {
        const p = { preset: args.preset, label: args.label, text: args.text, x: args.x, y: args.y, w: args.w, h: args.h, tint: args.tint, tintAmount: args.tint_amount, blur: args.blur, refract: args.refract, animIn: args.anim_in, duration: args.duration };
        Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
        return s.liquidGlass({ params: p, time: args.time });
      }
      case 'generate_sfx': return s.generateSfx({ prompt: args.prompt, time: args.time, duration: args.duration, place: true });
      case 'auto_effects': return s.autoEffects({ density: args.density || (this.style && this.style.sfx) || 'medium', apply: true });
      case 'add_markers': return s.addMarkers(args.markers);
      case 'search_broll': return s.brollSearch({ q: args.query, type: args.type || 'video', compact: true });
      case 'place_broll': return s.brollPlace({ id: args.id, time: args.time, duration: args.duration });
      case 'library_search': return s.librarySearch({ q: args.q || '', category: args.category || '' }).slice(0, 30).map(x => ({ id: x.id, name: x.name, category: x.category, sub: x.sub }));
      case 'place_library_item': return s.libraryPlace({ id: args.id, time: args.time });
      case 'chapters': return s.chapters({ addMarkers: true });
      case 'auto_edit': { const skip = new Set(args.skip || []); return s.runAutoEdit(s.autoEditSteps().map(st => ({ ...st, on: st.on && !skip.has(st.id) }))); }
      case 'undo_last': return s.undoLast();
      case 'thumbnail_ideas': { const c = await s.thumbnailCandidates({ count: 6 }); const r = await s.thumbnailIdeas({ candidates: c }); return { titles: r.titles, bestFrameAt: c[r.best] ? c[r.best].time : null }; }
      case 'clean_audio': return s.cleanAudio({ strength: args.strength || 'medium', loudness: args.loudness ?? -16 });
      case 'duck_music': return s.duckMusic({ duckDb: args.duck_db ?? -12 });
      case 'make_reels': return s.makeReels({ ratio: args.ratio || '9:16' });
      case 'find_shorts': return s.findShorts({ count: args.count || 3 });
      case 'make_short': return s.makeShort({ start: args.start, end: args.end, title: args.title || 'Short' }, { reframe: args.reframe !== false, captions: args.captions !== false });
      case 'set_playhead': return s.setPlayhead(args.time);
      case 'edit_scene': { const r = await s.editSceneAI({ instruction: args.instruction }); return { replaced: r.replaced, track: r.track, start: r.start, layered: r.layered, elements: r.spec.elements.map(e => e.type) }; }
      case 'style_edit': { const r = await s.styleEdit({ style: args.style, brief: args.brief || '', count: args.count || 3, captions: !!args.captions }); return { style: r.label, scenes: r.scenes.map(x => ({ time: x.time, duration: x.duration, overlay: x.overlay, elements: x.elements })) }; }
      case 'add_template': { const r = await s.addTemplate({ id: args.id, values: args.values || {}, time: args.time, duration: args.duration }); return { track: r.track, start: r.start, end: r.end }; }
      case 'carousel_3d': { const r = await s.carousel3D({ files: args.files || [], layout: args.layout || 'ring', speed: args.speed ?? 1, title: args.title || '', background: args.background || 'studio', duration: args.duration || 6, time: args.time }); return { track: r.track, start: r.start, end: r.end }; }
      case 'add_icon': {
        const hit = s.iconSearch(args.query || '')[0];
        if (!hit) return { error: 'مفيش أيقونة بالاسم ده', examples: s.iconSearch('').slice(0, 20).map(i => i.name) };
        const r = await s.addIcon({ id: hit.id, anim: args.anim || 'draw', badge: args.badge || 'none', label: args.label || '', color: args.color, position: args.position || 'center', time: args.time, duration: args.duration || 3 });
        return { icon: hit.name, track: r.track, start: r.start };
      }
      case 'place_trendy_sfx': return s.placeSfx({ id: args.id, time: args.time });
      case 'generate_music': { const r = await s.generateMusic({ prompt: args.prompt, seconds: args.seconds || 30, place: true, time: args.time }); return { file: r.file, placed: r.placed }; }
      case 'download_video': { const r = await s.downloadMedia({ url: args.url, quality: args.quality || '1080', start: args.start, end: args.end, time: args.time }); return { file: r.file, type: r.type, placed: r.placed }; }
      case 'web_media_search': { const r = await s.webSearch({ q: args.query, type: args.type || 'image' }); return { results: r.results.slice(0, 15).map(x => ({ id: x.id, source: x.source, type: x.type, title: (x.title || '').slice(0, 60), size: x.width ? `${x.width}x${x.height}` : '', license: x.license })), errors: r.errors }; }
      case 'web_media_place': { const r = await s.webImport({ id: args.id, time: args.time, duration: args.duration }); return { file: r.file, placed: r.placed }; }
      case 'safe_zones_check': { const r = await s.safeZoneCheck({ platform: args.platform || 'all', addMarkers: !!args.add_markers }); return { vertical: r.vertical, score: r.score, issues: r.issues.slice(0, 12) }; }
      case 'relink_missing': {
        const r = await s.relinkScan({ dirs: args.folders || [] });
        const sure = r.items.filter(i => i.match && i.match.score >= 0.8);
        const done = sure.length ? await s.relinkApply(sure) : { done: 0, failed: [] };
        return { missing: r.items.length, relinked: done.done, needsReview: r.items.filter(i => !i.match || i.match.score < 0.8).map(i => i.name), failed: done.failed };
      }
      default: throw new Error('أداة مش معروفة: ' + name);
    }
  }

  /** Send one user instruction and run the tool loop until the model answers in text. */
  async send(text) {
    this.stopped = false;
    // every message carries a fresh picture of the sequence, so the editor always knows what's on the timeline
    let snap = '';
    if (this.services.sequenceSnapshot) { try { snap = await this.services.sequenceSnapshot(); } catch (e) { snap = 'مقدرتش أقرا السيكوينس: ' + e.message; } }
    this.messages.push({ role: 'user', content: snap ? `<sequence_now>\n${snap}\n</sequence_now>\n\n${text}` : text });
    const max = LEVELS[this.level].maxSteps;
    for (let step = 0; step < max; step++) {
      if (this.stopped) return { stopped: true };
      const msg = await this.llm.chat({ model: this.model, messages: this.messages, tools: TOOLS, maxTokens: 8000, cache: true });
      this.trackUsage(msg.usage);
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
      // frames the model asked to see go in right after the tool results (tool messages can only carry text)
      if (this.pendingImages && this.pendingImages.length) {
        this.messages.push(vision.imageMessage(this.pendingImages.map(f => ({ ...f, label: `${f.time.toFixed(1)}s (${f.clip})` }))));
        this.pendingImages = [];
      }
    }
    return { text: 'وصلت للحد الأقصى من الخطوات. قولّي أكمّل؟', steps: max };
  }
}

module.exports = { EditFastAgent, TOOLS, LEVELS, systemPrompt };

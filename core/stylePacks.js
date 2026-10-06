'use strict';
// باقات الاستايل: كل استايل (كولاج، ثري دي، نيون…) = ألوان + خلفية + مكوّنات مفضّلة + تعليمات للمخرج الذكي.
// المونتير بيختار الاستايل، والذكاء الاصطناعي بيصمم المشاهد بيه، وRemotion بيرندرها على الجهاز.

const PACKS = {
  collage: {
    label: 'كولاج آرت', en: 'Collage art', background: 'paper',
    theme: { primary: '#E63946', accent: '#FFD166', secondary: '#118AB2', text: '#1C1C1C', background: '#F3EADB' },
    components: ['collage', 'cutoutTitle', 'polaroid', 'scribble', 'highlight'],
    grain: true, vignette: false,
    captions: { style: 'highlighter', anim: 'pop', ease: 'back' },
    guide: 'استايل كولاج/سكرابوك: صور مقصوصة بحواف ورق ممزّق ولزق شفاف، عناوين بحروف مقصوصة من مجلات (cutoutTitle)، شخابيط بخط اليد (scribble) حوالين الحاجات المهمة، وخلفية ورق. استخدم collage مع لقطات من الفيديو (media) وعنوان قصير، وpolaroid للحظة واحدة مهمة. إيقاع مرح وسريع.'
  },
  '3d': {
    label: 'ثري دي', en: '3D', background: 'studio',
    theme: { primary: '#7C5CFF', accent: '#22D3EE', secondary: '#F472B6', text: '#FFFFFF', background: '#0B0B14' },
    components: ['carousel3D', 'card3D', 'cube3D', 'text3D', 'statCounter'],
    grain: false, vignette: true,
    captions: { style: 'bold', anim: 'zoomIn', ease: 'out' },
    guide: 'استايل ثري دي: عمق ومنظور وإضاءة استوديو. اعرض اللقطات في carousel3D (ring أو coverflow) أو card3D، استخدم text3D للعناوين القوية وcube3D لتبديل كلمات (سريع/سهل/ذكي). الكاميرا دايمًا بتتحرك بهدوء.'
  },
  neon: {
    label: 'نيون / سايبر', en: 'Neon cyber', background: 'grid',
    theme: { primary: '#00F0FF', accent: '#FF2BD6', secondary: '#7A5CFF', text: '#FFFFFF', background: '#05010F' },
    components: ['kineticTitle', 'highlight', 'statCounter', 'text3D', 'searchBar'],
    grain: true, vignette: true, sweep: true,
    captions: { style: 'neon', anim: 'glitch', ease: 'out' },
    guide: 'استايل نيون/سايبر: جريد تقني، ألوان مضيئة سماوي وبمبي، عناوين kineticTitle بحركة split أو blur، أرقام statCounter، إحساس تكنولوجي سريع.'
  },
  minimal: {
    label: 'مينيمال', en: 'Minimal', background: 'solid',
    theme: { primary: '#111111', accent: '#FF5A1F', secondary: '#888888', text: '#111111', background: '#F5F5F2' },
    components: ['kineticTitle', 'highlight', 'quote', 'list', 'lowerThird'],
    grain: false, vignette: false,
    captions: { style: 'minimal', anim: 'blur', ease: 'out', animDur: 0.5 },
    guide: 'استايل مينيمال (زي إعلانات أبل): مساحة فاضية كتير، عنصر واحد بس في الكادر، كلمات قليلة جدًا، حركة blur أو rise هادية، لون مميز واحد بس.'
  },
  cinematic: {
    label: 'سينمائي / وثائقي', en: 'Cinematic', background: 'spotlight',
    theme: { primary: '#C8A15A', accent: '#F2E3C6', secondary: '#7A5A2E', text: '#FFFFFF', background: '#080706' },
    components: ['quote', 'kineticTitle', 'lowerThird', 'mediaFull', 'statCounter'],
    grain: true, vignette: true, letterbox: true,
    captions: { style: 'lyric', anim: 'fade', ease: 'inOut', animDur: 0.6 },
    guide: 'استايل سينمائي وثائقي: شرايط سودا (letterbox)، ألوان دهبي ودافي، اقتباسات quote وعناوين kineticTitle بحركة blur بطيئة، mediaFull للقطات من الفيديو بزووم بطيء. إيقاع هادي ومؤثر.'
  },
  popart: {
    label: 'بوب آرت', en: 'Pop art', background: 'halftone',
    theme: { primary: '#FF3B6B', accent: '#FFE135', secondary: '#2B6CFF', text: '#111111', background: '#FFE135' },
    components: ['cutoutTitle', 'emojiBurst', 'scribble', 'polaroid', 'kineticTitle'],
    grain: false, vignette: false,
    captions: { style: 'beast', anim: 'bounce', ease: 'out' },
    guide: 'استايل بوب آرت/كوميكس: نقط هالفتون، ألوان صريحة (أصفر/بمبي/أزرق)، كلمات كبيرة مقصوصة، إيموجي وانفجارات، شخابيط burst وstar. طاقة عالية جدًا.'
  },
  glass: {
    label: 'ليكويد جلاس', en: 'Liquid glass', background: 'mesh',
    theme: { primary: '#8B5CF6', accent: '#FBBF24', secondary: '#EC4899', text: '#FFFFFF', background: '#0B0A12' },
    components: ['kineticTitle', 'notification', 'list', 'statCounter', 'card3D', 'lowerThird'],
    grain: true, vignette: true,
    captions: { style: 'gradient', anim: 'rise', ease: 'out' },
    guide: 'استايل ليكويد جلاس: كروت زجاج شفافة فوق ميش ناعم، إشعارات notification، قوائم list وأرقام، حركة ناعمة فاخرة.'
  },
  social: {
    label: 'سوشيال / واجهات', en: 'Social UI', background: 'gradient',
    theme: { primary: '#2563EB', accent: '#22C55E', secondary: '#A855F7', text: '#FFFFFF', background: '#0A0F1F' },
    components: ['chat', 'notification', 'searchBar', 'browser', 'socialPost', 'icon'],
    grain: false, vignette: true,
    captions: { style: 'box', anim: 'pop', ease: 'back' },
    guide: 'استايل واجهات السوشيال: محادثات chat، إشعارات notification، بحث searchBar، متصفح browser، بوستات socialPost وأيقونات icon. يحكي القصة كأنها بتحصل على الموبايل.'
  },
  hormozi: {
    label: 'هرموزي (بودكاست/بيزنس)', en: 'Hormozi', background: 'solid',
    theme: { primary: '#FFD400', accent: '#22FF66', secondary: '#FFFFFF', text: '#FFFFFF', background: '#0A0A0A' },
    components: ['kineticTitle', 'highlight', 'statCounter', 'emojiBurst', 'icon'],
    grain: false, vignette: true, captions: { style: 'hormozi', anim: 'pop', ease: 'back', animDur: 0.18 },
    guide: 'استايل هرموزي: كلام قوي مباشر، كل جملة مهمة بتتحول لعنوان كبير بكلمة ملوّنة (أصفر/أخضر) على خلفية سودا، أرقام بتعدّ، إيموجي صغيرة، إيقاع سريع جدًا (مشاهد 1.5-2.5 ثانية).'
  },
  beast: {
    label: 'مستر بيست (يوتيوب حماسي)', en: 'MrBeast', background: 'particles',
    theme: { primary: '#00C2FF', accent: '#FFE500', secondary: '#FF2D55', text: '#FFFFFF', background: '#0A1A3A' },
    components: ['text3D', 'statCounter', 'emojiBurst', 'cutoutTitle', 'kineticTitle', 'barChart'],
    grain: false, vignette: true, filter: 'vivid', captions: { style: 'beast', anim: 'bounce', ease: 'out' },
    guide: 'استايل مستر بيست: طاقة عالية، ألوان مشبّعة، أرقام وفلوس ضخمة (statCounter بـ $)، نص ثري دي، إيموجي وانفجارات، كل مشهد قصير ومليان حركة. التشويق والمبالغة.'
  },
  vhs: {
    label: 'ريترو VHS (أنالوج)', en: 'VHS retro', background: 'gradient',
    theme: { primary: '#2EC4B6', accent: '#FF3366', secondary: '#FFBF00', text: '#FFFFFF', background: '#141021' },
    components: ['kineticTitle', 'mediaFull', 'polaroid', 'quote'],
    grain: true, vignette: true, overlay: 'vhs', filter: 'faded', captions: { style: 'minimal', anim: 'letters', ease: 'linear' },
    guide: 'استايل VHS ريترو التسعينات: طبقة شريط فيديو (REC وتاريخ وخطوط)، ألوان باهتة ودافية، لقطات mediaFull بزووم بطيء، كتابة حرف حرف. حنين للماضي.'
  },
  noir: {
    label: 'فيلم أبيض وأسود', en: 'Film noir', background: 'spotlight',
    theme: { primary: '#E5E5E5', accent: '#FFFFFF', secondary: '#888888', text: '#FFFFFF', background: '#050505' },
    components: ['quote', 'kineticTitle', 'mediaFull', 'lowerThird'],
    grain: true, vignette: true, letterbox: true, filter: 'bw', captions: { style: 'lyric', anim: 'fade', ease: 'inOut', animDur: 0.7 },
    guide: 'استايل فيلم أبيض وأسود (نوار): كل حاجة رمادي بتباين عالي، شرايط سودا، اقتباسات وعناوين بحركة blur بطيئة، ظلال ودراما. هادي وغامض.'
  },
  kinetic: {
    label: 'كاينتك تايبوجرافي', en: 'Kinetic typography', background: 'solid',
    theme: { primary: '#FF4D00', accent: '#FFFFFF', secondary: '#FFB800', text: '#FFFFFF', background: '#111111' },
    components: ['kineticTitle', 'highlight', 'cube3D', 'text3D', 'cutoutTitle'],
    grain: false, vignette: false, captions: { style: 'bold', anim: 'drop', ease: 'out', animDur: 0.3 },
    guide: 'كاينتك تايبوجرافي: النص هو البطل. كل جملة مهمة بتتحول لكلام بيتحرك (split، rise، typewriter)، مكعب كلمات بيلف، نص ثري دي. مفيش صور تقريبًا. الإيقاع على الكلام بالظبط.'
  },
  anime: {
    label: 'أنمي / مانجا', en: 'Anime manga', background: 'speedlines',
    theme: { primary: '#FF2E63', accent: '#FFD500', secondary: '#08D9D6', text: '#111111', background: '#FFFFFF' },
    components: ['cutoutTitle', 'emojiBurst', 'scribble', 'polaroid', 'text3D'],
    grain: false, vignette: false, captions: { style: 'beast', anim: 'zoomIn', ease: 'back', animDur: 0.22 },
    guide: 'استايل أنمي/مانجا: خطوط سرعة من النص، كلمات كبيرة مقصوصة كأنها صوت (BOOM، واو)، شخابيط burst، ألوان صريحة. لحظات صدمة ومبالغة.'
  },
  vaporwave: {
    label: 'فيبرويف / سينثويف', en: 'Vaporwave synthwave', background: 'sunset',
    theme: { primary: '#FF3CF0', accent: '#00F0FF', secondary: '#FFE35A', text: '#FFFFFF', background: '#120428' },
    components: ['text3D', 'kineticTitle', 'card3D', 'carousel3D'],
    grain: true, vignette: true, overlay: 'scanlines', captions: { style: 'neon', anim: 'rise', ease: 'out' },
    guide: 'استايل فيبرويف/سينثويف الثمانينات: شمس مخططة وجريد نيون بنفسجي وبمبي، نص ثري دي لامع، كروت ثري دي. إحساس ريترو مستقبلي.'
  },
  magazine: {
    label: 'مجلة / إيديتوريال', en: 'Editorial magazine', background: 'paper',
    theme: { primary: '#D7263D', accent: '#111111', secondary: '#1B998B', text: '#111111', background: '#FAF7F0' },
    components: ['quote', 'collage', 'polaroid', 'list', 'kineticTitle'],
    grain: true, vignette: false, captions: { style: 'minimal', anim: 'slideStart', ease: 'out' },
    guide: 'استايل مجلة: خلفية ورق فاتحة، عناوين كبيرة سودا وكلمة حمرا، اقتباسات، صور مرتبة بأناقة. هادي وراقي ومنظم.'
  },
  explainer: {
    label: 'شرح / إنفوجرافيك', en: 'Explainer infographic', background: 'flat',
    theme: { primary: '#5B5BD6', accent: '#FFB020', secondary: '#20C997', text: '#FFFFFF', background: '#1E1B4B' },
    components: ['steps', 'barChart', 'statCounter', 'list', 'icon', 'highlight'],
    grain: false, vignette: false, captions: { style: 'box', anim: 'pop', ease: 'back' },
    guide: 'استايل شرح (زي Kurzgesagt): أشكال مسطحة ملونة، خطوات وأرقام ورسوم بيانية لكل معلومة، أيقونات. كل فكرة = مشهد واضح.'
  },
  tech: {
    label: 'ريفيو تقني', en: 'Tech review', background: 'solid',
    theme: { primary: '#FF2D2D', accent: '#FFFFFF', secondary: '#888888', text: '#FFFFFF', background: '#0B0B0B' },
    components: ['card3D', 'statCounter', 'lowerThird', 'kineticTitle', 'list'],
    grain: false, vignette: true, captions: { style: 'minimal', anim: 'blur', ease: 'out', animDur: 0.35 },
    guide: 'استايل ريفيو تقني (زي MKBHD): أسود نضيف ولون أحمر واحد، المنتج في card3D، المواصفات أرقام statCounter، مسافات كتير وحركة دقيقة.'
  },
  luxury: {
    label: 'فخم / لاكشري', en: 'Luxury', background: 'spotlight',
    theme: { primary: '#C9A227', accent: '#F5E6B8', secondary: '#7A5C12', text: '#F5E6B8', background: '#0A0806' },
    components: ['kineticTitle', 'quote', 'lowerThird', 'mediaFull', 'card3D'],
    grain: true, vignette: true, overlay: 'lightleak', captions: { style: 'lyric', anim: 'blur', ease: 'inOut', animDur: 0.8 },
    guide: 'استايل فخم (عقارات/موضة/عطور): أسود ودهبي، حركة بطيئة جدًا وناعمة، كلمات قليلة، لقطات بزووم بطيء ولمعة ضوء. هدوء وثقة.'
  },
  vlog: {
    label: 'فلوج / سفر', en: 'Vlog travel', background: 'paper',
    theme: { primary: '#FF6B35', accent: '#FFD23F', secondary: '#3BCEAC', text: '#1C1C1C', background: '#F7F3E8' },
    components: ['polaroid', 'collage', 'cutoutTitle', 'icon', 'scribble'],
    grain: true, vignette: false, filter: 'warm', captions: { style: 'bold', anim: 'slideStart', ease: 'out' },
    guide: 'استايل فلوج وسفر: بولارويد وصور مقصوصة، أسماء الأماكن بحروف مقصوصة، أيقونات لوكيشن وطيارة، شخابيط أسهم. خفيف ودافي وشخصي.'
  },
  news: {
    label: 'أخبار عاجلة', en: 'Breaking news', background: 'gradient',
    theme: { primary: '#C8102E', accent: '#FFFFFF', secondary: '#0A2463', text: '#FFFFFF', background: '#0A1A3A' },
    components: ['lowerThird', 'kineticTitle', 'notification', 'statCounter', 'browser'],
    grain: false, vignette: true, overlay: 'ticker', captions: { style: 'box', anim: 'slideStart', ease: 'out', animDur: 0.25 },
    guide: 'استايل الأخبار: شريط عاجل بيجري، لوور ثيرد للمتكلم، عناوين حمرا وبيضا، أرقام وإشعارات. جاد ومباشر. استخدم overlayText لنص الشريط.'
  },
  gaming: {
    label: 'جيمنج', en: 'Gaming esports', background: 'grid',
    theme: { primary: '#7CFF00', accent: '#B026FF', secondary: '#00E5FF', text: '#FFFFFF', background: '#05070A' },
    components: ['text3D', 'statCounter', 'emojiBurst', 'kineticTitle', 'cube3D'],
    grain: false, vignette: true, overlay: 'glitch', captions: { style: 'beast', anim: 'zoomIn', ease: 'out', animDur: 0.2 },
    guide: 'استايل جيمنج: أخضر نيون وبنفسجي، جليتش، نص ثري دي، عدّادات سكور، انفجارات. سريع ومتحمس.'
  },
  blueprint: {
    label: 'بلوبرينت / سبورة', en: 'Blueprint chalkboard', background: 'blueprint',
    theme: { primary: '#FFFFFF', accent: '#FFD166', secondary: '#9AD1FF', text: '#FFFFFF', background: '#0b3d91' },
    components: ['steps', 'scribble', 'list', 'barChart', 'icon'],
    grain: false, vignette: false, captions: { style: 'minimal', anim: 'letters', ease: 'linear' },
    guide: 'استايل بلوبرينت/سبورة تعليمي: خلفية رسم هندسي أزرق (أو chalkboard)، خطوات وقوائم، شخابيط بتترسم حوالين المهم، كتابة حرف حرف.'
  },
  grunge: {
    label: 'جرنج / هاند ميد', en: 'Grunge handmade', background: 'grunge',
    theme: { primary: '#E4572E', accent: '#F3F3F3', secondary: '#A8A8A8', text: '#F3F3F3', background: '#1B1A17' },
    components: ['cutoutTitle', 'scribble', 'polaroid', 'collage', 'quote'],
    grain: true, vignette: true, filter: 'faded', captions: { style: 'outline', anim: 'glitch', ease: 'out' },
    guide: 'استايل جرنج وهاند ميد: ملمس خشن، ورق محروق، حروف مقصوصة، شخابيط، صور مائلة. مش متلمّع — حقيقي وخام (ترند 2026: الأصالة أهم من البولش).'
  }
};

function get(id) { return PACKS[id] || null; }
function list() { return Object.entries(PACKS).map(([id, p]) => ({ id, label: p.label, en: p.en, background: p.background, components: p.components, captions: p.captions, theme: p.theme })); }

/** Guess a pack from free text ("عايزه كولاج", "3d style", "سينمائي"…). */
function detect(text) {
  const t = String(text || '').toLowerCase();
  const rules = [['hormozi', /هرموزي|hormozi|بودكاست|podcast/], ['beast', /بيست|beast|مستر ?بيست/], ['vhs', /vhs|في ?اتش ?اس|ريترو|retro|تسعينات|انالوج|أنالوج|analog/],
    ['noir', /ابيض واسود|أبيض وأسود|نوار|noir|black ?and ?white|b&w/], ['kinetic', /كاينتك|kinetic|تايبوجرافي|typography/], ['anime', /انمي|أنمي|مانجا|anime|manga/],
    ['vaporwave', /فيبر|vapor|سينث|synth|ثمانينات/], ['magazine', /مجل[ةه]|magazine|editorial|ايديتوريال/], ['explainer', /شرح|explainer|انفوجراف|إنفوجراف|infographic|kurzgesagt/],
    ['tech', /تقني|ريفيو|review|tech|mkbhd/], ['luxury', /فخم|لاكشري|luxury|عقارات|real ?estate/], ['vlog', /فلوج|vlog|سفر|travel|رحل[ةه]/], ['news', /أخبار|اخبار|عاجل|news/],
    ['gaming', /جيمنج|gaming|العاب|ألعاب|esports/], ['blueprint', /بلوبرينت|blueprint|سبور[ةه]|chalk/], ['grunge', /جرنج|grunge|هاند ?ميد|handmade/],
    ['collage', /كولاج|كولاچ|collage|scrapbook|سكراب|قصاقيص/], ['3d', /ثري ?دي|3d|ثلاثي|three/], ['neon', /نيون|سايبر|neon|cyber/], ['minimal', /مينيمال|minimal|بسيط|ابل|apple/],
    ['cinematic', /سينما|وثائقي|cinematic|documentary|فيلم/], ['popart', /بوب ?آرت|pop ?art|كوميك|comic/], ['glass', /جلاس|زجاج|glass/], ['social', /سوشيال|واجهات|موبايل|social|chat|شات/]];
  for (const [id, re] of rules) if (re.test(t)) return id;
  return null;
}

/** Director instructions for a pack (appended to the scene director's system prompt). */
function guideText(id) {
  const p = get(id);
  if (!p) return '';
  return [`الاستايل المطلوب: ${p.label} (${p.en}).`, p.guide, `المكوّنات المفضّلة للاستايل ده: ${p.components.join(', ')}.`, `الخلفية الافتراضية: ${p.background}${p.filter ? ` · filter: ${p.filter}` : ''}${p.overlay ? ` · overlay: ${p.overlay}` : ''}.`].join('\n');
}

module.exports = { PACKS, get, list, detect, guideText };

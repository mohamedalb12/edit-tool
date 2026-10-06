'use strict';
// باقات الاستايل: كل استايل (كولاج، ثري دي، نيون…) = ألوان + خلفية + مكوّنات مفضّلة + تعليمات للمخرج الذكي.
// المونتير بيختار الاستايل، والذكاء الاصطناعي بيصمم المشاهد بيه، وRemotion بيرندرها على الجهاز.

const PACKS = {
  collage: {
    label: 'كولاج آرت', en: 'Collage art', background: 'paper',
    theme: { primary: '#E63946', accent: '#FFD166', secondary: '#118AB2', text: '#1C1C1C', background: '#F3EADB' },
    components: ['collage', 'cutoutTitle', 'polaroid', 'scribble', 'highlight'],
    grain: true, vignette: false,
    guide: 'استايل كولاج/سكرابوك: صور مقصوصة بحواف ورق ممزّق ولزق شفاف، عناوين بحروف مقصوصة من مجلات (cutoutTitle)، شخابيط بخط اليد (scribble) حوالين الحاجات المهمة، وخلفية ورق. استخدم collage مع لقطات من الفيديو (media) وعنوان قصير، وpolaroid للحظة واحدة مهمة. إيقاع مرح وسريع.'
  },
  '3d': {
    label: 'ثري دي', en: '3D', background: 'studio',
    theme: { primary: '#7C5CFF', accent: '#22D3EE', secondary: '#F472B6', text: '#FFFFFF', background: '#0B0B14' },
    components: ['carousel3D', 'card3D', 'cube3D', 'text3D', 'statCounter'],
    grain: false, vignette: true,
    guide: 'استايل ثري دي: عمق ومنظور وإضاءة استوديو. اعرض اللقطات في carousel3D (ring أو coverflow) أو card3D، استخدم text3D للعناوين القوية وcube3D لتبديل كلمات (سريع/سهل/ذكي). الكاميرا دايمًا بتتحرك بهدوء.'
  },
  neon: {
    label: 'نيون / سايبر', en: 'Neon cyber', background: 'grid',
    theme: { primary: '#00F0FF', accent: '#FF2BD6', secondary: '#7A5CFF', text: '#FFFFFF', background: '#05010F' },
    components: ['kineticTitle', 'highlight', 'statCounter', 'text3D', 'searchBar'],
    grain: true, vignette: true, sweep: true,
    guide: 'استايل نيون/سايبر: جريد تقني، ألوان مضيئة سماوي وبمبي، عناوين kineticTitle بحركة split أو blur، أرقام statCounter، إحساس تكنولوجي سريع.'
  },
  minimal: {
    label: 'مينيمال', en: 'Minimal', background: 'solid',
    theme: { primary: '#111111', accent: '#FF5A1F', secondary: '#888888', text: '#111111', background: '#F5F5F2' },
    components: ['kineticTitle', 'highlight', 'quote', 'list', 'lowerThird'],
    grain: false, vignette: false,
    guide: 'استايل مينيمال (زي إعلانات أبل): مساحة فاضية كتير، عنصر واحد بس في الكادر، كلمات قليلة جدًا، حركة blur أو rise هادية، لون مميز واحد بس.'
  },
  cinematic: {
    label: 'سينمائي / وثائقي', en: 'Cinematic', background: 'spotlight',
    theme: { primary: '#C8A15A', accent: '#F2E3C6', secondary: '#7A5A2E', text: '#FFFFFF', background: '#080706' },
    components: ['quote', 'kineticTitle', 'lowerThird', 'mediaFull', 'statCounter'],
    grain: true, vignette: true, letterbox: true,
    guide: 'استايل سينمائي وثائقي: شرايط سودا (letterbox)، ألوان دهبي ودافي، اقتباسات quote وعناوين kineticTitle بحركة blur بطيئة، mediaFull للقطات من الفيديو بزووم بطيء. إيقاع هادي ومؤثر.'
  },
  popart: {
    label: 'بوب آرت', en: 'Pop art', background: 'halftone',
    theme: { primary: '#FF3B6B', accent: '#FFE135', secondary: '#2B6CFF', text: '#111111', background: '#FFE135' },
    components: ['cutoutTitle', 'emojiBurst', 'scribble', 'polaroid', 'kineticTitle'],
    grain: false, vignette: false,
    guide: 'استايل بوب آرت/كوميكس: نقط هالفتون، ألوان صريحة (أصفر/بمبي/أزرق)، كلمات كبيرة مقصوصة، إيموجي وانفجارات، شخابيط burst وstar. طاقة عالية جدًا.'
  },
  glass: {
    label: 'ليكويد جلاس', en: 'Liquid glass', background: 'mesh',
    theme: { primary: '#8B5CF6', accent: '#FBBF24', secondary: '#EC4899', text: '#FFFFFF', background: '#0B0A12' },
    components: ['kineticTitle', 'notification', 'list', 'statCounter', 'card3D', 'lowerThird'],
    grain: true, vignette: true,
    guide: 'استايل ليكويد جلاس: كروت زجاج شفافة فوق ميش ناعم، إشعارات notification، قوائم list وأرقام، حركة ناعمة فاخرة.'
  },
  social: {
    label: 'سوشيال / واجهات', en: 'Social UI', background: 'gradient',
    theme: { primary: '#2563EB', accent: '#22C55E', secondary: '#A855F7', text: '#FFFFFF', background: '#0A0F1F' },
    components: ['chat', 'notification', 'searchBar', 'browser', 'socialPost', 'icon'],
    grain: false, vignette: true,
    guide: 'استايل واجهات السوشيال: محادثات chat، إشعارات notification، بحث searchBar، متصفح browser، بوستات socialPost وأيقونات icon. يحكي القصة كأنها بتحصل على الموبايل.'
  }
};

function get(id) { return PACKS[id] || null; }
function list() { return Object.entries(PACKS).map(([id, p]) => ({ id, label: p.label, en: p.en, background: p.background, components: p.components })); }

/** Guess a pack from free text ("عايزه كولاج", "3d style", "سينمائي"…). */
function detect(text) {
  const t = String(text || '').toLowerCase();
  const rules = [['collage', /كولاج|كولاچ|collage|scrapbook|سكراب|قصاقيص/], ['3d', /ثري ?دي|3d|ثلاثي|three/], ['neon', /نيون|سايبر|neon|cyber/], ['minimal', /مينيمال|minimal|بسيط|ابل|apple/],
    ['cinematic', /سينما|وثائقي|cinematic|documentary|فيلم/], ['popart', /بوب ?آرت|pop ?art|كوميك|comic/], ['glass', /جلاس|زجاج|glass/], ['social', /سوشيال|واجهات|موبايل|social|chat|شات/]];
  for (const [id, re] of rules) if (re.test(t)) return id;
  return null;
}

/** Director instructions for a pack (appended to the scene director's system prompt). */
function guideText(id) {
  const p = get(id);
  if (!p) return '';
  return [`الاستايل المطلوب: ${p.label} (${p.en}).`, p.guide, `المكوّنات المفضّلة للاستايل ده: ${p.components.join(', ')}.`, `الخلفية الافتراضية: ${p.background}.`].join('\n');
}

module.exports = { PACKS, get, list, detect, guideText };

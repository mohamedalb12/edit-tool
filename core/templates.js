'use strict';
// مكتبة القوالب: نصوص متحركة، ليكويد جلاس، واجهات، ومشاهد جاهزة — كل قالب = مشهد Remotion بإعدادات جاهزة
// تعدّل نصوصه وتحطه على التايملين بضغطة. المعاينة المتحركة متخزنة في assets/templates/<id>.mp4
const CATS = [
  { id: 'text', label: 'نصوص متحركة' },
  { id: 'glass', label: 'ليكويد جلاس' },
  { id: 'ui', label: 'واجهات' },
  { id: 'scenes', label: 'مشاهد' },
  { id: '3d', label: 'ثري دي' },
  { id: 'collage', label: 'كولاج' }
];

const el = (type, props, extra = {}) => ({ type, from: 0, props, ...extra });
const T = (id, cat, label, spec, { overlay = false, duration = 4 } = {}) => ({ id, cat, label, overlay, spec: { duration, ...spec, background: overlay ? { type: 'transparent' } : spec.background } });

const TEMPLATES = [
  // نصوص (فوق الفيديو)
  T('t-rise', 'text', 'عنوان طالع', { elements: [el('kineticTitle', { text: 'عنوان قوي ومؤثر', subtitle: 'سطر صغير تحته', style: 'rise', highlight: ['قوي'] })] }, { overlay: true }),
  T('t-split', 'text', 'عنوان متقسّم', { elements: [el('kineticTitle', { text: 'الحلقة الجاية', style: 'split', highlight: ['الجاية'] })] }, { overlay: true }),
  T('t-blur', 'text', 'عنوان ضبابي', { style: 'minimal', elements: [el('kineticTitle', { text: 'بهدوء', subtitle: 'مينيمال', style: 'blur' })] }, { overlay: true }),
  T('t-type', 'text', 'آلة كاتبة', { elements: [el('kineticTitle', { text: 'بنكتب الحكاية', style: 'typewriter' })] }, { overlay: true }),
  T('t-highlight', 'text', 'تظليل كلمة', { elements: [el('highlight', { text: 'أهم حاجة في الفيديو ده', words: ['أهم'] })] }, { overlay: true }),
  T('t-cutout', 'text', 'حروف مقصوصة', { style: 'collage', elements: [el('cutoutTitle', { text: 'خبر عاجل' })] }, { overlay: true }),
  T('t-3d', 'text', 'نص ثري دي', { style: '3d', elements: [el('text3D', { text: 'EDITFAST' })] }, { overlay: true }),
  T('t-cube', 'text', 'مكعب كلمات', { style: '3d', elements: [el('cube3D', { prefix: 'المونتاج بقى', words: ['أسرع', 'أسهل', 'أذكى'] })] }, { overlay: true, duration: 5 }),
  T('t-quote', 'text', 'اقتباس', { elements: [el('quote', { text: 'كل لقطة بتحكي حكاية', author: 'EditFast' })] }, { overlay: true }),
  T('t-scribble', 'text', 'شخبطة حوالين كلمة', { style: 'collage', elements: [el('scribble', { kind: 'circle', text: 'مهم!' })] }, { overlay: true, duration: 3 }),
  T('t-emoji', 'text', 'إيموجي انفجار', { elements: [el('emojiBurst', { emoji: '🔥', text: 'جامد' })] }, { overlay: true, duration: 3 }),
  // ليكويد جلاس
  T('g-lower', 'glass', 'لوور ثيرد زجاج', { style: 'glass', elements: [el('lowerThird', { name: 'محمد أيمن', role: 'مونتير ومصمم موشن' }, { position: 'lowerThird' })] }, { overlay: true, duration: 5 }),
  T('g-notif', 'glass', 'إشعار زجاج', { style: 'glass', elements: [el('notification', { title: 'فيديو جديد نزل 🔥', text: 'دوس وشوف المونتاج الجديد' })] }, { overlay: true }),
  T('g-list', 'glass', 'قائمة زجاج', { style: 'glass', elements: [el('list', { title: 'هنتعلم إيه؟', items: ['قص السكوت', 'الترجمة', 'المؤثرات'] })] }, { overlay: true, duration: 5 }),
  T('g-stat', 'glass', 'رقم زجاج', { style: 'glass', elements: [el('statCounter', { value: 87, suffix: '%', label: 'وقت أقل في المونتاج', ring: true })] }, { overlay: true }),
  // واجهات
  T('u-search', 'ui', 'شريط بحث', { style: 'social', elements: [el('searchBar', { query: 'ازاي أمنتج أسرع', results: ['EditFast — مونتاج بالذكاء الاصطناعي', 'قص السكوت في ثانية'] })] }, { overlay: true, duration: 5 }),
  T('u-chat', 'ui', 'محادثة', { style: 'social', elements: [el('chat', { messages: ['عملت المونتاج إمتى؟', 'في 5 دقايق بس 😎', 'إزاي؟!', 'EditFast 🔥'] })] }, { overlay: true, duration: 6 }),
  T('u-browser', 'ui', 'متصفح', { style: 'social', elements: [el('browser', { url: 'editfast.app', title: 'أسرع مونتاج' })] }, { overlay: true, duration: 5 }),
  T('u-post', 'ui', 'بوست سوشيال', { style: 'social', elements: [el('socialPost', { name: 'EditFast', handle: '@editfast', text: 'المونتاج بقى أسهل بكتير 🔥', likes: 12500, platform: 'x' })] }, { overlay: true, duration: 5 }),
  T('u-cta', 'ui', 'اشترك وفعّل الجرس', { elements: [el('cta', { text: 'اشترك', sub: 'وفعّل الجرس عشان يوصلك كل جديد' })] }, { overlay: true, duration: 4 }),
  T('u-notif', 'ui', 'إشعار موبايل', { style: 'social', elements: [el('notification', { app: 'WhatsApp', icon: '💬', title: 'أحمد', text: 'الفيديو طلع تحفة 👏', time: 'الآن' })] }, { overlay: true }),
  // مشاهد كاملة
  T('s-logo', 'scenes', 'افتتاحية لوجو', { background: { type: 'particles' }, elements: [el('logoReveal', { text: 'EditFast', tagline: 'مونتاج أسرع بالذكاء الاصطناعي' })] }, { duration: 4 }),
  T('s-steps', 'scenes', 'خطوات', { background: { type: 'grid' }, elements: [el('steps', { title: 'إزاي تبدأ', steps: ['صوّر', 'نزّل', 'EditFast', 'انشر'] })] }, { duration: 5 }),
  T('s-chart', 'scenes', 'رسم بياني', { background: { type: 'mesh' }, elements: [el('barChart', { title: 'المشاهدات', bars: [{ label: 'يناير', value: 40 }, { label: 'فبراير', value: 65 }, { label: 'مارس', value: 90 }], unit: 'K' })] }, { duration: 5 }),
  T('s-cinematic', 'scenes', 'اقتباس سينمائي', { style: 'cinematic', elements: [el('mediaFull', { media: [], zoom: 'in' }), el('quote', { text: 'كل لقطة بتحكي حكاية', author: '' })] }, { duration: 5 }),
  T('s-popart', 'scenes', 'بوب آرت', { style: 'popart', elements: [el('cutoutTitle', { text: 'WOW!', size: 1.3 }, { position: 'top' }), el('emojiBurst', { emoji: '💥', text: 'مستوى تاني!' }, { from: 0.8, position: 'bottom' })] }, { duration: 3.5 }),
  T('s-neon', 'scenes', 'نيون', { style: 'neon', elements: [el('kineticTitle', { text: 'المستقبل هنا', style: 'split', highlight: ['المستقبل'] })] }, { duration: 4 }),
  // ثري دي
  T('d-ring', '3d', 'كاروسيل دايري', { style: '3d', elements: [el('carousel3D', { media: [], layout: 'ring', title: 'أفضل اللقطات' })] }, { duration: 6 }),
  T('d-coverflow', '3d', 'كوفر فلو', { style: '3d', elements: [el('carousel3D', { media: [], layout: 'coverflow', aspect: '16:9' })] }, { duration: 6 }),
  T('d-helix', '3d', 'لولب صاعد', { style: '3d', elements: [el('carousel3D', { media: [], layout: 'helix' })] }, { duration: 6 }),
  T('d-stack', '3d', 'كوتشينة بتتقلب', { style: '3d', elements: [el('carousel3D', { media: [], layout: 'stack' })] }, { duration: 5 }),
  T('d-card', '3d', 'كارت ثري دي', { style: '3d', elements: [el('card3D', { media: [], title: 'لقطة اليوم' })] }, { duration: 5 }),
  // كولاج
  T('c-collage', 'collage', 'كولاج صور', { style: 'collage', elements: [el('collage', { media: [], title: 'أحلى أيام', subtitle: 'صيف 2026' })] }, { duration: 5 }),
  T('c-polaroid', 'collage', 'بولارويد', { style: 'collage', elements: [el('polaroid', { media: [], caption: 'اللحظة دي' })] }, { duration: 4 }),
  T('c-scrap', 'collage', 'سكرابوك', { style: 'collage', elements: [el('collage', { media: [], title: 'رحلتنا', doodles: true }, { duration: 3 }), el('polaroid', { media: [], caption: 'وأحلى لحظة' }, { from: 2.8 })] }, { duration: 6 })
];

const MEDIA_TYPES = { collage: 4, polaroid: 1, carousel3D: 6, card3D: 1, mediaFull: 1, browser: 1 };

function get(id) { return TEMPLATES.find(t => t.id === id) || null; }

/** Editable text fields of a template: [{el, key, label, value, list}] */
function fields(tpl) {
  const { CATALOG } = require('./proScene');
  const out = [];
  tpl.spec.elements.forEach((e, i) => {
    const def = CATALOG[e.type].props;
    for (const [k, v] of Object.entries(e.props || {})) {
      const d = def[k]; if (!d) continue;
      if (d[0] === 'string' && typeof v === 'string' && v) out.push({ el: i, key: k, label: d[2], value: v });
      if (d[0] === 'string[]' && Array.isArray(v) && v.length) out.push({ el: i, key: k, label: d[2], value: v.join('، '), list: true });
    }
  });
  return out;
}

/** How many photos/frames the template wants (0 = none). */
function mediaNeed(tpl) {
  return tpl.spec.elements.reduce((n, e) => Math.max(n, MEDIA_TYPES[e.type] && Array.isArray(e.props.media) ? MEDIA_TYPES[e.type] : 0), 0);
}

/** A concrete spec: template + edited texts + media paths. */
function fill(tpl, { values = {}, media = [], duration } = {}) {
  const spec = JSON.parse(JSON.stringify(tpl.spec));
  for (const [k, v] of Object.entries(values)) {
    const [i, key] = k.split('.'); const e = spec.elements[+i]; if (!e) continue;
    const isList = Array.isArray(e.props[key]);
    e.props[key] = isList ? String(v).split(/[،,\n]/).map(x => x.trim()).filter(Boolean) : String(v);
  }
  spec.elements.forEach(e => { if (MEDIA_TYPES[e.type] && Array.isArray(e.props.media) && !e.props.media.length && media.length) e.props.media = media.slice(0, MEDIA_TYPES[e.type] === 1 ? 1 : 10); });
  if (duration) spec.duration = duration;
  return spec;
}

module.exports = { CATS, TEMPLATES, get, fields, mediaNeed, fill };

'use strict';
// EditFast Pro scenes (Remotion): كتالوج المكوّنات + تنظيف مواصفات المشهد + "مخرج المشاهد" بالذكاء الاصطناعي + تشغيل الرندر.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'lowerThird', 'lowerThirdRight', 'topLeft', 'topRight'];
const BACKGROUNDS = ['mesh', 'gradient', 'grid', 'particles', 'spotlight', 'paper', 'halftone', 'studio', 'speedlines', 'sunset', 'blueprint', 'chalkboard', 'grunge', 'flat', 'solid', 'transparent'];
const FILTERS = ['bw', 'sepia', 'warm', 'cool', 'vivid', 'faded'];
const OVERLAYS = ['vhs', 'glitch', 'scanlines', 'lightleak', 'ticker'];
const packs = require('./stylePacks');

// type → { label, props: {name: [type, default, description]} }
const CATALOG = {
  kineticTitle: { label: 'عنوان حركي', props: { text: ['string', 'عنوان قوي', 'العنوان'], subtitle: ['string', '', 'سطر صغير تحته'], style: ['enum:rise|scale|blur|split|typewriter', 'rise', 'نوع الحركة'], highlight: ['string[]', [], 'كلمات تتلوّن'], size: ['number', 1, 'حجم 0.6-1.4'] } },
  highlight: { label: 'تظليل كلمات', props: { text: ['string', 'الفكرة الأهم', 'الجملة'], words: ['string[]', [], 'الكلمات اللي تتظلل'] } },
  quote: { label: 'اقتباس', props: { text: ['string', 'اقتباس', 'الاقتباس'], author: ['string', '', 'القائل'] } },
  statCounter: { label: 'رقم/إحصائية', props: { value: ['number', 100, 'الرقم'], prefix: ['string', '', 'قبل الرقم مثل $'], suffix: ['string', '', 'بعد الرقم مثل % أو K'], label: ['string', '', 'الوصف'], ring: ['boolean', true, 'دايرة تقدم'] } },
  barChart: { label: 'رسم بياني', props: { title: ['string', '', 'العنوان'], bars: ['bars', [], '[{label,value}] من 2 لـ 6'], unit: ['string', '', 'الوحدة'] } },
  list: { label: 'قائمة نقاط', props: { title: ['string', '', 'العنوان'], items: ['string[]', [], 'النقاط 2-5'] } },
  steps: { label: 'خطوات', props: { title: ['string', '', 'العنوان'], steps: ['string[]', [], 'الخطوات 2-6'] } },
  lowerThird: { label: 'لوور ثيرد', props: { name: ['string', '', 'الاسم'], role: ['string', '', 'الوظيفة'] } },
  logoReveal: { label: 'ظهور لوجو/اسم قناة', props: { text: ['string', '', 'الاسم'], tagline: ['string', '', 'جملة تحته'] } },
  cta: { label: 'اشترك (CTA)', props: { text: ['string', 'اشترك', 'نص الزرار'], sub: ['string', '', 'سطر تحته'], color: ['string', '#FF2D55', 'لون الزرار'] } },
  socialPost: { label: 'بوست سوشيال', props: { name: ['string', '', 'الاسم'], handle: ['string', '', '@handle'], text: ['string', '', 'نص البوست'], likes: ['number', 1000, 'لايكات'], platform: ['enum:x|instagram', 'x', 'المنصة'] } },
  emojiBurst: { label: 'إيموجي انفجار', props: { emoji: ['string', '🔥', 'إيموجي'], text: ['string', '', 'جملة قصيرة'] } },
  // كولاج
  collage: { label: 'كولاج صور', full: true, props: { media: ['media[]', [], 'صور/لقطات 1-6 (@رقم من اللقطات المتاحة)'], title: ['string', '', 'عنوان مقصوص'], subtitle: ['string', '', 'سطر صغير'], doodles: ['boolean', true, 'شخابيط'] } },
  cutoutTitle: { label: 'عنوان حروف مقصوصة', props: { text: ['string', 'كولاج آرت', 'العنوان'], size: ['number', 1, 'حجم 0.6-1.4'] } },
  scribble: { label: 'شخبطة يد', props: { kind: ['enum:circle|underline|arrow|star|heart|zigzag|burst', 'circle', 'الشكل'], text: ['string', '', 'كلمة جوه/جنب الشخبطة'], color: ['string', '', 'لون hex'], size: ['number', 1, 'حجم'] } },
  polaroid: { label: 'صورة بولارويد', props: { media: ['media[]', [], 'صورة/لقطة واحدة'], caption: ['string', '', 'تعليق'], tilt: ['number', -4, 'ميل'], size: ['number', 1, 'الحجم 0.4-1.4 (صغّره لو معاه عنوان)'] } },
  // ثري دي
  carousel3D: { label: 'كاروسيل ثري دي', full: true, props: { media: ['media[]', [], '2-10 صور/فيديوهات'], layout: ['enum:ring|coverflow|helix|stack', 'ring', 'الشكل'], speed: ['number', 1, 'السرعة 0-3'], direction: ['enum:left|right', 'left', 'الاتجاه'], tilt: ['number', 10, 'ميل الكاميرا بالدرجات'], radius: ['number', 1, 'العمق/نصف القطر 0.5-2'], cardSize: ['number', 1, 'حجم الكروت'], aspect: ['enum:4:5|16:9|9:16|1:1|3:4', '4:5', 'نسبة الكارت'], reflection: ['boolean', true, 'انعكاس'], glow: ['boolean', true, 'توهج'], rounded: ['number', 26, 'تدوير الحواف'], title: ['string', '', 'عنوان تحت'] } },
  card3D: { label: 'كارت ثري دي', full: true, props: { media: ['media[]', [], 'صورة/لقطة'], title: ['string', '', 'العنوان'], subtitle: ['string', '', 'سطر تحته'], aspect: ['enum:16:9|4:5|9:16|1:1', '16:9', 'النسبة'] } },
  cube3D: { label: 'مكعب كلمات ثري دي', props: { words: ['string[]', ['سريع', 'سهل', 'ذكي', 'احترافي'], '2-4 كلمات على الأوجه'], prefix: ['string', '', 'كلمة ثابتة قبله'], media: ['media[]', [], 'صور بدل الكلمات (اختياري)'] } },
  text3D: { label: 'نص ثري دي', props: { text: ['string', 'ثري دي', 'النص'], depth: ['number', 14, 'العمق'], size: ['number', 1, 'الحجم'] } },
  mediaFull: { label: 'لقطة كاملة بزووم', full: true, props: { media: ['media[]', [], 'صورة/لقطة'], zoom: ['enum:in|out', 'in', 'زووم'], tilt3d: ['boolean', false, 'ميل ثري دي'], frameStyle: ['enum:none|rounded|paper', 'none', 'برواز'] } },
  // واجهات
  notification: { label: 'إشعار موبايل', props: { app: ['string', 'EditFast', 'اسم التطبيق'], title: ['string', 'فيديو جديد نزل', 'العنوان'], text: ['string', '', 'النص'], icon: ['string', '🔔', 'إيموجي'], time: ['string', 'الآن', 'الوقت'] } },
  searchBar: { label: 'شريط بحث', props: { query: ['string', 'ازاي أمنتج أسرع', 'اللي بيتكتب'], results: ['string[]', [], 'النتايج 0-4'], engine: ['string', 'Search', 'اسم المحرك'] } },
  chat: { label: 'محادثة', props: { messages: ['string[]', [], 'رسايل بالتبادل 2-6'] } },
  browser: { label: 'متصفح', props: { url: ['string', 'editfast.app', 'اللينك'], title: ['string', '', 'عنوان الصفحة'], media: ['media[]', [], 'صورة الصفحة'] } },
  icon: { label: 'أيقونة متحركة', props: { svg: ['svg', '', 'كود الأيقونة'], mode: ['enum:stroke|fill', 'stroke', 'نوعها'], anim: ['enum:draw|pop|bounce|spin|pulse|shake|slide', 'draw', 'الحركة'], color: ['string', '', 'لون hex'], size: ['number', 1, 'الحجم'], badge: ['enum:none|circle|square|glass', 'none', 'خلفية'], label: ['string', '', 'كلمة تحتها'], glow: ['boolean', true, 'توهج'] } }
};

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MEDIA_EXT = /\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm|mkv)$/i;
/** media refs: "@3" → the 4th available still/clip, or an absolute path to a photo/video on disk */
function resolveMedia(v, media) {
  const one = x => {
    if (typeof x === 'number' && media[x]) return media[x];
    const s = String(x || '').trim();
    const m = /^@(\d+)$/.exec(s);
    if (m) return media[+m[1]] || null;
    if (MEDIA_EXT.test(s) && (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('/'))) return s;
    return null;
  };
  return (Array.isArray(v) ? v : [v]).map(one).filter(Boolean).slice(0, 10);
}

function cleanProps(type, props, media = []) {
  const def = CATALOG[type].props, out = {};
  for (const [k, [t, d]] of Object.entries(def)) {
    let v = props && props[k];
    if (v === undefined || v === null || v === '') { if (d !== '' && !(Array.isArray(d) && !d.length)) out[k] = d; continue; }
    if (t === 'string') v = String(v).slice(0, 200);
    else if (t === 'number') v = num(v, d);
    else if (t === 'boolean') v = v === true || v === 'true';
    else if (t === 'string[]') v = (Array.isArray(v) ? v : String(v).split(/[،,\n]/)).map(x => String(x).trim()).filter(Boolean).slice(0, 8);
    else if (t === 'bars') v = (Array.isArray(v) ? v : []).map(b => ({ label: String((b && b.label) || '').slice(0, 30), value: num(b && b.value, 0) })).slice(0, 8);
    else if (t.startsWith('enum:')) { const opts = t.slice(5).split('|'); v = opts.includes(v) ? v : d; }
    else if (t === 'media[]') v = resolveMedia(v, media);
    else if (t === 'svg') v = String(v).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '').slice(0, 6000);
    out[k] = v;
  }
  return out;
}

/** Validate + fill a scene spec (AI output is never trusted as-is). */
function normalize(spec, { width = 1920, height = 1080, fps = 30, style, media = [] } = {}) {
  const s = spec || {};
  const duration = clamp(num(s.duration, 5), 1, 60);
  const pack = packs.get(s.style);
  const bgType = BACKGROUNDS.includes(s.background && s.background.type) ? s.background.type : (typeof s.background === 'string' && BACKGROUNDS.includes(s.background) ? s.background : (pack ? pack.background : 'mesh'));
  // the editor's saved style first, then valid colours from the spec (an invalid colour never wipes the style)
  const validTheme = t => Object.fromEntries(Object.entries(t || {}).filter(([k, v]) => v && (k === 'font' ? typeof v === 'string' : /^#[0-9a-f]{6}$/i.test(v))));
  // a chosen style pack beats the saved style (the editor asked for that look); the spec's own colours beat both
  const theme = { ...validTheme(style ? { primary: style.primary, accent: style.accent, text: style.text, background: style.background, font: style.font } : {}), ...(pack ? pack.theme : {}), ...validTheme(s.theme) };
  const elements = (Array.isArray(s.elements) ? s.elements : []).filter(e => e && CATALOG[e.type]).slice(0, 8).map(e => {
    const from = clamp(num(e.from, 0), 0, duration - 0.3);
    const el = { type: e.type, from: +from.toFixed(2), duration: +clamp(num(e.duration, duration - from), 0.3, duration - from).toFixed(2), props: cleanProps(e.type, e.props || {}, media) };
    if (POSITIONS.includes(e.position)) el.position = e.position;
    if (typeof e.x === 'number' && typeof e.y === 'number') { el.x = clamp(e.x, 0, 1); el.y = clamp(e.y, 0, 1); }
    return el;
  });
  if (!elements.length) throw new Error('المشهد فاضي — مفيش ولا عنصر معروف');
  const bg = { type: bgType };
  if (s.background && Array.isArray(s.background.colors)) bg.colors = s.background.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4);
  const flag = (k, d) => (s[k] === undefined ? (pack && pack[k] !== undefined ? !!pack[k] : d) : !!s[k]);
  const out = { width: Math.round(num(s.width, width)), height: Math.round(num(s.height, height)), fps: Math.round(num(s.fps, fps)), duration, theme, background: bg, elements, grain: flag('grain', true), vignette: flag('vignette', true), sweep: flag('sweep', false), letterbox: flag('letterbox', false) };
  const pick = (k, list) => { const v = s[k] !== undefined ? s[k] : pack && pack[k]; return list.includes(v) ? v : undefined; };
  const filter = pick('filter', FILTERS), overlay = pick('overlay', OVERLAYS);
  if (filter) out.filter = filter;
  if (overlay) { out.overlay = overlay; if (s.overlayText) out.overlayText = String(s.overlayText).slice(0, 80); }
  if (pack) out.style = s.style;
  return out;
}

// the icon component is placed from the icon library, not by the director (its svg is long)
function catalogText(only) {
  return Object.entries(CATALOG).filter(([k]) => k !== 'icon' && (!only || only.includes(k))).map(([k, c]) => `- ${k} (${c.label}${c.full ? '، ملو الكادر' : ''}): ` + Object.entries(c.props).map(([p, [t, , d]]) => `${p}:${t} — ${d}`).join('، ')).join('\n');
}

const DIRECTOR_SYSTEM = (styleId) => [
  'أنت مخرج موشن جرافيك محترف (مستوى استوديو) بتصمم مشاهد لمحرك Remotion عن طريق JSON بس.',
  'المكوّنات المتاحة (استخدم دي بس):', catalogText(),
  'media[]: لو فيه لقطات متاحة من الفيديو اكتب "@رقمها" (مثلاً ["@0","@3"]).',
  styleId ? packs.guideText(styleId) : '',
  `الخلفيات: ${BACKGROUNDS.join(' | ')} (transparent لو المشهد هيتحط فوق فيديو).`,
  `لون المشهد كله (اختياري) filter: ${FILTERS.join(' | ')}. طبقة لوك (اختياري) overlay: ${OVERLAYS.join(' | ')} + overlayText.`,
  `الأماكن position: ${POSITIONS.join(' | ')}.`,
  'قواعد الإخراج عشان المشهد يطلع جامد:',
  '1) عنصر أساسي واحد واضح في كل لحظة؛ ماتزحمش الكادر. لو فيه أكتر من عنصر مع بعض، حطهم في أماكن مختلفة (top/bottom) وصغّر الصورة (size 0.6).',
  '2) إيقاع: كل عنصر من 2.5 لـ 5 ثواني؛ العناصر تتبع بعض بتداخل بسيط (0.2-0.4 ثانية).',
  '3) الكلام قصير ومؤثر (3-7 كلمات للعناوين) وبنفس لغة/لهجة طلب المونتير.',
  '4) استخدم highlight لكلمة أو اتنين مهمين بس.',
  '5) الأرقام بتعمل وقع: لو فيه رقم استخدم statCounter أو barChart.',
  '6) اختار الخلفية حسب الإحساس: mesh (ناعم/فاخر)، grid (تقني)، particles (ملحمي)، spotlight (درامي)، gradient (بسيط).',
  '7) ألوان theme (primary, accent, secondary, text, background) hex بس — التزم بستايل المونتير لو موجود.',
  'رجّع JSON بالشكل: {"duration":ثواني,"background":{"type":"..."},"theme":{...},"elements":[{"type":"...","from":ثواني,"duration":ثواني,"position":"...","props":{...}}]}'
].filter(Boolean).join('\n');

function mediaText(media) {
  if (!media || !media.length) return '';
  return 'اللقطات المتاحة من الفيديو: ' + media.map((m, i) => `@${i}${m.time !== undefined ? ` (ثانية ${m.time})` : ''}${m.note ? ` ${m.note}` : ''}`).join('، ');
}

async function direct(llm, model, brief, { style, duration, transparent, styleId, media } = {}) {
  const user = [`الطلب: ${brief}`, duration ? `المدة المطلوبة: ${duration} ثانية` : '', transparent ? 'المشهد هيتحط فوق فيديو: الخلفية لازم transparent.' : '', style && !styleId ? `ستايل المونتير: ${JSON.stringify(style)}` : '', mediaText(media)].filter(Boolean).join('\n');
  const spec = await llm.json({ model, system: DIRECTOR_SYSTEM(styleId), user, maxTokens: 4000 });
  if (transparent) spec.background = { type: 'transparent' };
  if (duration) spec.duration = duration;
  if (styleId) spec.style = styleId;
  return spec;
}

/** Where the Remotion engine lives + is it installed? */
function engineInfo(root = path.join(__dirname, '..', 'remotion')) {
  const installed = fs.existsSync(path.join(root, 'node_modules', '@remotion', 'renderer'));
  return { root, installed, script: path.join(root, 'render.mjs') };
}

/** Run render.mjs with a system Node (Remotion needs real Node ≥ 18, not the CEP runtime). */
function render({ node, spec, out, still = false, frame, browserExecutable, gl, onProgress, root }) {
  const info = engineInfo(root);
  if (!info.installed) return Promise.reject(new Error('محرك المشاهد Pro مش متثبّت — شغّل المثبّت تاني أو "ثبّت المحرك" من الإعدادات.'));
  if (!node) return Promise.reject(new Error('محتاج Node.js على الجهاز عشان المشاهد Pro (المثبّت بيثبّته).'));
  const job = path.join(path.dirname(out), `job-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(job, JSON.stringify({ spec, out, still, frame, browserExecutable, gl }));
  return new Promise((resolve, reject) => {
    const child = spawn(node, [info.script, job], { cwd: info.root, windowsHide: true });
    let buf = '', err = '', done = null, failed = null;
    child.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const m = JSON.parse(line); if (m.progress !== undefined && onProgress) onProgress(m.progress); if (m.status && onProgress) onProgress(0, m.status); if (m.done) done = m.done; if (m.error) failed = m.error; } catch (_) {}
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => { try { fs.unlinkSync(job); } catch (_) {} if (done && code === 0) resolve(done); else reject(new Error('Remotion: ' + (failed || err.slice(-600) || 'exit ' + code))); });
  });
}

module.exports = { CATALOG, POSITIONS, BACKGROUNDS, FILTERS, OVERLAYS, normalize, cleanProps, resolveMedia, catalogText, mediaText, DIRECTOR_SYSTEM, direct, engineInfo, render };

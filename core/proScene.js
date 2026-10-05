'use strict';
// EditFast Pro scenes (Remotion): كتالوج المكوّنات + تنظيف مواصفات المشهد + "مخرج المشاهد" بالذكاء الاصطناعي + تشغيل الرندر.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'lowerThird', 'lowerThirdRight', 'topLeft', 'topRight'];
const BACKGROUNDS = ['mesh', 'gradient', 'grid', 'particles', 'spotlight', 'solid', 'transparent'];

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
  emojiBurst: { label: 'إيموجي انفجار', props: { emoji: ['string', '🔥', 'إيموجي'], text: ['string', '', 'جملة قصيرة'] } }
};

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function cleanProps(type, props) {
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
    out[k] = v;
  }
  return out;
}

/** Validate + fill a scene spec (AI output is never trusted as-is). */
function normalize(spec, { width = 1920, height = 1080, fps = 30, style } = {}) {
  const s = spec || {};
  const duration = clamp(num(s.duration, 5), 1, 60);
  const bgType = BACKGROUNDS.includes(s.background && s.background.type) ? s.background.type : (typeof s.background === 'string' && BACKGROUNDS.includes(s.background) ? s.background : 'mesh');
  // the editor's saved style first, then valid colours from the spec (an invalid colour never wipes the style)
  const validTheme = t => Object.fromEntries(Object.entries(t || {}).filter(([k, v]) => v && (k === 'font' ? typeof v === 'string' : /^#[0-9a-f]{6}$/i.test(v))));
  const theme = { ...validTheme(style ? { primary: style.primary, accent: style.accent, text: style.text, background: style.background, font: style.font } : {}), ...validTheme(s.theme) };
  const elements = (Array.isArray(s.elements) ? s.elements : []).filter(e => e && CATALOG[e.type]).slice(0, 8).map(e => {
    const from = clamp(num(e.from, 0), 0, duration - 0.3);
    const el = { type: e.type, from: +from.toFixed(2), duration: +clamp(num(e.duration, duration - from), 0.3, duration - from).toFixed(2), props: cleanProps(e.type, e.props || {}) };
    if (POSITIONS.includes(e.position)) el.position = e.position;
    if (typeof e.x === 'number' && typeof e.y === 'number') { el.x = clamp(e.x, 0, 1); el.y = clamp(e.y, 0, 1); }
    return el;
  });
  if (!elements.length) throw new Error('المشهد فاضي — مفيش ولا عنصر معروف');
  const bg = { type: bgType };
  if (s.background && Array.isArray(s.background.colors)) bg.colors = s.background.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4);
  return { width: Math.round(num(s.width, width)), height: Math.round(num(s.height, height)), fps: Math.round(num(s.fps, fps)), duration, theme, background: bg, elements, grain: s.grain !== false, vignette: s.vignette !== false, sweep: !!s.sweep };
}

function catalogText() {
  return Object.entries(CATALOG).map(([k, c]) => `- ${k} (${c.label}): ` + Object.entries(c.props).map(([p, [t, , d]]) => `${p}:${t} — ${d}`).join('، ')).join('\n');
}

const DIRECTOR_SYSTEM = () => [
  'أنت مخرج موشن جرافيك محترف (مستوى استوديو) بتصمم مشاهد لمحرك Remotion عن طريق JSON بس.',
  'المكوّنات المتاحة (استخدم دي بس):', catalogText(),
  `الخلفيات: ${BACKGROUNDS.join(' | ')} (transparent لو المشهد هيتحط فوق فيديو).`,
  `الأماكن position: ${POSITIONS.join(' | ')}.`,
  'قواعد الإخراج عشان المشهد يطلع جامد:',
  '1) عنصر أساسي واحد واضح في كل لحظة؛ ماتزحمش الكادر. لو فيه أكتر من عنصر مع بعض، حطهم في أماكن مختلفة.',
  '2) إيقاع: كل عنصر من 2.5 لـ 5 ثواني؛ العناصر تتبع بعض بتداخل بسيط (0.2-0.4 ثانية).',
  '3) الكلام قصير ومؤثر (3-7 كلمات للعناوين) وبنفس لغة/لهجة طلب المونتير.',
  '4) استخدم highlight لكلمة أو اتنين مهمين بس.',
  '5) الأرقام بتعمل وقع: لو فيه رقم استخدم statCounter أو barChart.',
  '6) اختار الخلفية حسب الإحساس: mesh (ناعم/فاخر)، grid (تقني)، particles (ملحمي)، spotlight (درامي)، gradient (بسيط).',
  '7) ألوان theme (primary, accent, secondary, text, background) hex بس — التزم بستايل المونتير لو موجود.',
  'رجّع JSON بالشكل: {"duration":ثواني,"background":{"type":"..."},"theme":{...},"elements":[{"type":"...","from":ثواني,"duration":ثواني,"position":"...","props":{...}}]}'
].join('\n');

async function direct(llm, model, brief, { style, duration, transparent } = {}) {
  const user = [`الطلب: ${brief}`, duration ? `المدة المطلوبة: ${duration} ثانية` : '', transparent ? 'المشهد هيتحط فوق فيديو: الخلفية لازم transparent.' : '', style ? `ستايل المونتير: ${JSON.stringify(style)}` : ''].filter(Boolean).join('\n');
  const spec = await llm.json({ model, system: DIRECTOR_SYSTEM(), user, maxTokens: 4000 });
  if (transparent) spec.background = { type: 'transparent' };
  if (duration) spec.duration = duration;
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

module.exports = { CATALOG, POSITIONS, BACKGROUNDS, normalize, cleanProps, catalogText, DIRECTOR_SYSTEM, direct, engineInfo, render };

'use strict';
// المونتير الذكي في أفتر: "وصف المشهد" اللي الـ AI بيكتبه (ليرز + كي فريمز + إفكتات + منحنيات) — بيتراجع هنا
// ويتحوّل لحاجة الأفتر يبنيها ليرز عادية تتعدّل. الـ AI عمره ما بيكتب كود بيتشغّل في الأفتر.
const curves = require('./curves');

/** effects the AI may use: friendly name → AE matchName + parameters (matchName of each param) */
const EFFECTS = {
  blur: { match: 'ADBE Gaussian Blur 2', params: { amount: 'ADBE Gaussian Blur 2-0001' } },
  glow: { match: 'ADBE Glo2', params: { threshold: 'ADBE Glo2-0002', radius: 'ADBE Glo2-0003', intensity: 'ADBE Glo2-0004' } },
  shadow: { match: 'ADBE Drop Shadow', params: { color: 'ADBE Drop Shadow-0001', opacity: 'ADBE Drop Shadow-0002', direction: 'ADBE Drop Shadow-0003', distance: 'ADBE Drop Shadow-0004', softness: 'ADBE Drop Shadow-0005' } },
  fill: { match: 'ADBE Fill', params: { color: 'ADBE Fill-0002' } },
  gradient: { match: 'ADBE Ramp', params: { start: 'ADBE Ramp-0001', startColor: 'ADBE Ramp-0002', end: 'ADBE Ramp-0003', endColor: 'ADBE Ramp-0004' } },
  tint: { match: 'ADBE Tint', params: { black: 'ADBE Tint-0001', white: 'ADBE Tint-0002', amount: 'ADBE Tint-0003' } },
  directionalBlur: { match: 'ADBE Motion Blur', params: { direction: 'ADBE Motion Blur-0001', length: 'ADBE Motion Blur-0002' } },
  displace: { match: 'ADBE Turbulent Displace', params: { amount: 'ADBE Turbulent Displace-0002', size: 'ADBE Turbulent Displace-0003' } },
  noise: { match: 'ADBE Noise', params: { amount: 'ADBE Noise-0001' } },
  lightSweep: { match: 'CC Light Sweep', params: {} },
  motionTile: { match: 'ADBE Tile', params: {} }
};
const TYPES = ['text', 'shape', 'solid', 'adjustment', 'null', 'footage', 'camera', 'light'];
const PROPS = ['position', 'scale', 'rotation', 'opacity', 'anchor', 'rotationX', 'rotationY'];
const BLEND = ['normal', 'add', 'screen', 'multiply', 'overlay', 'softLight', 'colorDodge'];
const EASES = Object.keys(curves.PRESETS).filter(k => curves.PRESETS[k].fn.bezier).concat(['hold', 'linear']);
// expressions: a few safe building blocks only (no file / system access ever reaches AE)
const BAD_EXPR = /system|callSystem|\$\.|File\(|Folder\(|eval\s*\(|app\./;

function hex(c, def = [1, 1, 1, 1]) {
  if (Array.isArray(c)) return [+c[0] || 0, +c[1] || 0, +c[2] || 0, c[3] === undefined ? 1 : +c[3]];
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return def;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
/** "50%" → pixels of the comp (x by width, y by height); numbers stay */
function px(v, axis, comp) {
  if (typeof v === 'string' && /%$/.test(v.trim())) return (parseFloat(v) / 100) * (axis === 1 ? comp.height : comp.width);
  const n = +v; return isFinite(n) ? n : 0;
}
function vec(v, comp, n = 2) {
  const a = Array.isArray(v) ? v : [v, v];
  const out = [];
  for (let i = 0; i < n; i++) out.push(px(a[i] === undefined ? (i === 2 ? 0 : a[0]) : a[i], i, comp));
  return out;
}
function propValue(name, v, comp, threeD) {
  if (name === 'position' || name === 'anchor') return vec(v, comp, threeD ? 3 : 2);
  if (name === 'scale') { const a = Array.isArray(v) ? v : [v, v, v]; return threeD ? [+a[0], +a[1], +(a[2] === undefined ? a[0] : a[2])] : [+a[0], +a[1]]; }
  if (name.indexOf('fx:') === 0) return Array.isArray(v) || /^#/.test(String(v)) ? (String(v).charAt(0) === '#' ? hex(v) : v.map(Number)) : +v;
  return +v;
}
function bz(ease) {
  if (Array.isArray(ease) && ease.length === 4) return ease.map(Number);
  const p = curves.PRESETS[ease];
  return p && p.fn.bezier ? p.fn.bezier : null;
}

/**
 * The AI's scene → what the AE host builds. Unknown things are dropped (never sent), numbers clamped,
 * colours → [r,g,b,a], "%" → pixels, eases → cubic-bezier. → { spec, warnings }
 */
function normalize(raw, compInfo = {}) {
  const warnings = [];
  const c = raw && raw.comp ? raw.comp : {};
  const comp = {
    create: !!(raw && raw.comp && (raw.comp.create !== false)) || !compInfo.width,
    name: String(c.name || 'EditFast Scene').slice(0, 60),
    width: Math.round(Math.min(7680, Math.max(64, +c.width || compInfo.width || 1920))),
    height: Math.round(Math.min(4320, Math.max(64, +c.height || compInfo.height || 1080))),
    fps: Math.min(120, Math.max(1, +c.fps || compInfo.fps || 30)),
    duration: Math.min(600, Math.max(0.5, +c.duration || compInfo.duration || 8)),
    bg: c.bg ? hex(c.bg) : null
  };
  const layers = [];
  let keyCount = 0;
  for (const L of (raw && raw.layers) || []) {
    if (layers.length >= 80) { warnings.push('أكتر من 80 لير — الباقي اتساب'); break; }
    if (!L || TYPES.indexOf(L.type) < 0) { warnings.push('نوع لير مش معروف: ' + (L && L.type)); continue; }
    const threeD = !!L.threeD || L.type === 'camera' || L.type === 'light';
    const o = { type: L.type, name: String(L.name || L.type).slice(0, 60), threeD, start: Math.max(0, +L.start || 0), end: L.end === undefined ? null : Math.max(0, +L.end) };
    if (L.parent) o.parent = String(L.parent);
    if (L.blend && BLEND.indexOf(L.blend) >= 0) o.blend = L.blend;
    if (L.motionBlur) o.motionBlur = true;
    if (L.type === 'text') {
      o.text = String(L.text === undefined ? 'نص' : L.text).slice(0, 400);
      o.size = Math.min(1000, Math.max(4, +L.size || 80)); o.color = hex(L.color || '#ffffff');
      if (L.font) o.font = String(L.font).slice(0, 80);
      o.align = ['left', 'center', 'right'].indexOf(L.align) >= 0 ? L.align : 'center';
      if (L.tracking) o.tracking = +L.tracking;
      if (L.stroke) { o.stroke = hex(L.stroke); o.strokeWidth = Math.min(50, +L.strokeWidth || 2); }
      // a number that counts up: 0 → to over duration (an expression on the Source Text)
      if (L.counter && isFinite(+L.counter.to)) o.counter = { to: +L.counter.to, from: +L.counter.from || 0, start: +L.counter.start || o.start, duration: Math.max(0.1, +L.counter.duration || 2) };
    }
    if (L.type === 'shape') {
      const s = L.shape || {};
      o.shape = { kind: ['rect', 'ellipse', 'star', 'polygon'].indexOf(s.kind) >= 0 ? s.kind : 'rect', size: vec(s.size || [400, 200], compInfo.width ? compInfo : comp), round: Math.max(0, +s.round || 0), points: Math.min(40, Math.max(3, +s.points || 5)) };
      if (s.fill !== null && s.fill !== false) o.shape.fill = hex(s.fill || '#f97316');
      if (s.stroke) { o.shape.stroke = hex(s.stroke); o.shape.strokeWidth = Math.min(200, +s.strokeWidth || 6); }
    }
    if (L.type === 'solid' || L.type === 'adjustment') o.color = hex(L.color || (L.type === 'adjustment' ? '#ffffff' : '#000000'));
    if (L.type === 'footage') {
      if (!L.file) { warnings.push('فوتيج من غير ملف'); continue; }
      o.file = String(L.file); o.srcIn = Math.max(0, +L.srcIn || 0); o.cover = L.cover !== false;
    }
    if (L.type === 'light') o.lightType = ['spot', 'point', 'parallel', 'ambient'].indexOf(L.lightType) >= 0 ? L.lightType : 'point';
    // still values
    o.transform = {};
    for (const p of PROPS) if (L.transform && L.transform[p] !== undefined) o.transform[p] = propValue(p, L.transform[p], comp, threeD);
    // effects with still parameters
    o.effects = [];
    for (const fx of L.effects || []) {
      const def = EFFECTS[fx && fx.name];
      if (!def) { warnings.push('إفكت مش متاح: ' + (fx && fx.name)); continue; }
      const params = {};
      for (const k of Object.keys(fx.params || {})) if (def.params[k]) params[def.params[k]] = propValue('fx:', fx.params[k], comp);
      o.effects.push({ name: fx.name, match: def.match, params });
    }
    // keyframes: { prop: [[t, value, ease], …] } or [{t, v, ease}]; effect params as "fx:glow.intensity"
    o.keys = {};
    for (const k of Object.keys(L.keys || {})) {
      let target = k;
      if (k.indexOf('fx:') === 0) {
        const [fxName, param] = k.slice(3).split('.');
        const def = EFFECTS[fxName];
        if (!def || !def.params[param]) { warnings.push('كي فريمز لإفكت مش معروف: ' + k); continue; }
        if (!o.effects.some(e => e.name === fxName)) o.effects.push({ name: fxName, match: def.match, params: {} });
        target = 'fx:' + def.match + '|' + def.params[param];
      } else if (PROPS.indexOf(k) < 0) { warnings.push('خاصية مش معروفة: ' + k); continue; }
      const list = (L.keys[k] || []).map(x => Array.isArray(x) ? { t: x[0], v: x[1], ease: x[2] } : x).filter(x => x && isFinite(+x.t));
      list.sort((a, b) => a.t - b.t);
      const keys = list.slice(0, 60).map(x => {
        const e = x.ease || 'easeInOut';
        return { t: Math.max(0, +x.t), v: propValue(k.indexOf('fx:') === 0 ? 'fx:' : k, x.v, comp, threeD), bz: e === 'hold' || e === 'linear' ? null : bz(e), hold: e === 'hold' };
      });
      if (keys.length) { o.keys[target] = keys; keyCount += keys.length; }
    }
    if (keyCount > 1500) { warnings.push('كي فريمز كتير قوي — اتقلّلت'); break; }
    if (L.textAnimator && L.type === 'text') o.textAnimator = { preset: String(L.textAnimator.preset || 'fadeUp'), by: L.textAnimator.by || 'chars', duration: +L.textAnimator.duration || 1, start: +L.textAnimator.start || o.start };
    o.expressions = {};
    for (const k of Object.keys(L.expressions || {})) {
      if (PROPS.indexOf(k) < 0) continue;
      const ex = String(L.expressions[k]).slice(0, 600);
      if (BAD_EXPR.test(ex)) { warnings.push('إكسبريشن اترفض'); continue; }
      o.expressions[k] = ex;
    }
    layers.push(o);
  }
  return { spec: { comp, layers }, warnings };
}

/** the scene language, as the AI is told it */
function promptDoc() {
  return [
    'اكتب المشهد JSON بالشكل ده بس:',
    '{"comp":{"create":true,"name":"…","width":1920,"height":1080,"fps":30,"duration":6,"bg":"#0b0806"},',
    ' "layers":[ // أول لير = فوق خالص',
    '  {"type":"text|shape|solid|adjustment|null|footage|camera|light","name":"…","start":0,"end":6,"parent":"اسم لير","threeD":false,"blend":"normal|add|screen|multiply|overlay","motionBlur":true,',
    '   "text":"…","size":120,"color":"#fff","font":"Cairo-Bold","align":"center","tracking":20,',
    '   "shape":{"kind":"rect|ellipse|star|polygon","size":[600,120],"round":30,"fill":"#f97316","stroke":"#fff","strokeWidth":4,"points":5},',
    '   "color":"#hex (للـ solid)", "file":"مسار (للـ footage)",',
    '   "transform":{"position":["50%","50%"],"scale":100,"rotation":0,"opacity":100,"anchor":[0,0]},',
    '   "keys":{"position":[[0,["50%","120%"],"expoOut"],[0.8,["50%","50%"]]],"scale":[[0,0,"backOut"],[0.5,100]],"opacity":[[0,0],[0.3,100]],"fx:glow.intensity":[[0,0],[1,3]]},',
    '   "effects":[{"name":"' + Object.keys(EFFECTS).join('|') + '","params":{…}}],',
    '   "textAnimator":{"preset":"fadeUp|typewriter|blurIn|scalePop|slideIn|tracking","by":"chars|words|lines","duration":1,"start":0},',
    '   "counter":{"to":250,"duration":2} (رقم بيعد — للـ text),',
    '   "expressions":{"position":"wiggle(1,8)"}}]}',
    'المنحنيات (آخر عنصر في كل كي): ' + EASES.join('، ') + '. المكان بالبكسل أو "%" من الكومب. الوقت بالثواني. الألوان #hex.',
    'باراميترز الإفكتات: ' + Object.entries(EFFECTS).map(([k, v]) => k + '(' + Object.keys(v.params).join(',') + ')').join('، '),
    'اعمل حركة احترافية: دخول بمنحنى expoOut/backOut، تأخير بسيط بين العناصر (stagger 0.05-0.15s)، حركة خفيفة مستمرة، خروج، ألوان متناسقة، مساحات وتباين واضح.'
  ].join('\n');
}

/* ======================= scene library: pro looks, ready to customise ======================= */
const W = c => c.width, H = c => c.height;
const SCENES = [
  { id: 'kinetic-title', name: 'عنوان كاينتك', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Kinetic Title', duration: 5, bg: '#0b0806' }, layers: [
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.13), color: '#ffffff', transform: { position: ['50%', '46%'] }, textAnimator: { preset: 'fadeUp', by: 'words', duration: 0.8, start: 0.2 }, keys: { scale: [[0.2, 112, 'expoOut'], [1.6, 100]] } },
    { type: 'text', name: 'Subtitle', text: p.subtitle || 'سطر تحت العنوان', size: Math.round(H(c) * 0.045), color: '#fed7aa', transform: { position: ['50%', '60%'] }, keys: { opacity: [[0.7, 0, 'easeOut'], [1.2, 100]], position: [[0.7, ['50%', '63%'], 'expoOut'], [1.3, ['50%', '60%']]] } },
    { type: 'shape', name: 'Underline', shape: { kind: 'rect', size: [W(c) * 0.3, 10], round: 5, fill: p.color || '#f97316' }, transform: { position: ['50%', '53.5%'] }, keys: { scale: [[0.5, [0, 100], 'expoOut'], [1.2, [100, 100]]] } },
    { type: 'shape', name: 'Glow Orb', shape: { kind: 'ellipse', size: [W(c) * 0.6, W(c) * 0.6], fill: p.color || '#ea580c' }, transform: { position: ['50%', '50%'], opacity: 18 }, effects: [{ name: 'blur', params: { amount: 220 } }], expressions: { scale: 'var s=100+Math.sin(time*1.2)*6;[s,s]' } }
  ] }) },
  { id: 'logo-reveal', name: 'ظهور لوجو', fields: ['title', 'color', 'file'], build: (p, c) => ({ comp: { create: true, name: 'Logo Reveal', duration: 5, bg: '#0a0705' }, layers: [
    p.file ? { type: 'footage', name: 'Logo', file: p.file, transform: { position: ['50%', '45%'] }, keys: { scale: [[0.3, 60, 'backOut'], [1.1, 100]], opacity: [[0.3, 0], [0.6, 100]], 'fx:glow.intensity': [[0.6, 2.5, 'easeOut'], [1.8, 0.4]] }, effects: [{ name: 'glow', params: { radius: 60, intensity: 0.4 } }] }
      : { type: 'shape', name: 'Logo Mark', shape: { kind: 'polygon', size: [220, 220], points: 6, fill: p.color || '#f97316' }, transform: { position: ['50%', '45%'] }, keys: { scale: [[0.3, 0, 'backOut'], [1.1, 100]], rotation: [[0.3, -90, 'expoOut'], [1.3, 0]] }, effects: [{ name: 'glow', params: { radius: 50, intensity: 1.2 } }] },
    { type: 'text', name: 'Brand', text: p.title || 'اسم البراند', size: Math.round(H(c) * 0.07), color: '#ffffff', tracking: 40, transform: { position: ['50%', '68%'] }, textAnimator: { preset: 'tracking', by: 'chars', duration: 1.2, start: 1 }, keys: { opacity: [[1, 0], [1.4, 100]] } },
    { type: 'shape', name: 'Flash', shape: { kind: 'ellipse', size: [W(c), W(c)], fill: '#fff7ed' }, blend: 'add', transform: { position: ['50%', '45%'] }, keys: { scale: [[0.9, 0, 'expoOut'], [1.3, 120]], opacity: [[0.9, 60], [1.5, 0]] } }
  ] }) },
  { id: 'social-intro', name: 'إنترو سوشيال', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Social Intro', duration: 4, bg: p.color || '#ea580c' }, layers: [
    { type: 'text', name: 'Hook', text: p.title || 'استنى للآخر!', size: Math.round(H(c) * 0.1), color: '#ffffff', transform: { position: ['50%', '45%'] }, textAnimator: { preset: 'scalePop', by: 'words', duration: 0.6, start: 0.15 }, effects: [{ name: 'shadow', params: { opacity: 60, distance: 12, softness: 20 } }] },
    { type: 'text', name: 'Handle', text: p.subtitle || '@yourname', size: Math.round(H(c) * 0.04), color: '#1f140c', transform: { position: ['50%', '58%'] }, keys: { opacity: [[0.6, 0], [0.9, 100]] } },
    { type: 'shape', name: 'Sweep', shape: { kind: 'rect', size: [W(c) * 1.2, H(c) * 0.35], fill: '#fbbf24' }, transform: { rotation: -8 }, keys: { position: [[0, ['-70%', '50%'], 'expoInOut'], [0.5, ['170%', '50%']]] } }
  ] }) },
  { id: 'quote-card', name: 'كارت اقتباس', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Quote', duration: 6, bg: '#120c08' }, layers: [
    { type: 'text', name: 'Quote Mark', text: '"', size: Math.round(H(c) * 0.3), color: p.color || '#f97316', transform: { position: ['50%', '30%'] }, keys: { opacity: [[0, 0], [0.4, 100]], scale: [[0, 140, 'expoOut'], [0.7, 100]] } },
    { type: 'text', name: 'Quote', text: p.title || 'الاقتباس هنا', size: Math.round(H(c) * 0.065), color: '#fff7ed', transform: { position: ['50%', '52%'] }, textAnimator: { preset: 'blurIn', by: 'words', duration: 1.6, start: 0.4 } },
    { type: 'text', name: 'Author', text: p.subtitle || '— الاسم', size: Math.round(H(c) * 0.035), color: '#fdba74', transform: { position: ['50%', '68%'] }, keys: { opacity: [[1.8, 0], [2.3, 100]] } }
  ] }) },
  { id: 'number-counter', name: 'عدّاد أرقام', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Counter', duration: 4, bg: '#0b0806' }, layers: [
    { type: 'text', name: 'Number', text: '0', size: Math.round(H(c) * 0.22), color: p.color || '#fb923c', transform: { position: ['50%', '48%'] }, keys: { scale: [[0, 80, 'backOut'], [0.5, 100]] }, counter: { to: +String(p.title || '100').replace(/[^\d.]/g, '') || 100, duration: 2 } },
    { type: 'text', name: 'Label', text: p.subtitle || 'عميل سعيد', size: Math.round(H(c) * 0.05), color: '#fff7ed', transform: { position: ['50%', '64%'] }, keys: { opacity: [[0.4, 0], [0.8, 100]] } }
  ] }) },
  { id: 'subscribe', name: 'زرار اشترك', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Subscribe', duration: 4 }, layers: [
    { type: 'text', name: 'Label', text: p.title || 'اشترك', size: Math.round(H(c) * 0.05), color: '#ffffff', parent: 'Button', transform: { position: [0, 18] } },
    { type: 'shape', name: 'Button', shape: { kind: 'rect', size: [W(c) * 0.22, H(c) * 0.09], round: 40, fill: p.color || '#ef4444' }, transform: { position: ['50%', '80%'] }, keys: { scale: [[0, 0, 'backOut'], [0.4, 100], [1.6, 100, 'easeInOut'], [1.75, 90, 'easeInOut'], [1.9, 100]], position: [[3.2, ['50%', '80%'], 'expoIn'], [3.7, ['50%', '120%']]] } }
  ] }) },
  { id: 'callout', name: 'كول آوت (سهم + كلام)', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: false }, layers: [
    { type: 'text', name: 'Callout Text', text: p.title || 'شوف هنا', size: Math.round(H(c) * 0.05), color: '#ffffff', transform: { position: ['70%', '30%'] }, textAnimator: { preset: 'slideIn', by: 'chars', duration: 0.6 } },
    { type: 'shape', name: 'Callout Line', shape: { kind: 'rect', size: [W(c) * 0.18, 6], round: 3, fill: p.color || '#f97316' }, transform: { position: ['58%', '38%'], rotation: 30 }, keys: { scale: [[0, [0, 100], 'expoOut'], [0.5, [100, 100]]] } },
    { type: 'shape', name: 'Callout Dot', shape: { kind: 'ellipse', size: [26, 26], fill: p.color || '#f97316' }, transform: { position: ['50%', '45%'] }, keys: { scale: [[0, 0, 'backOut'], [0.4, 100]] }, expressions: { opacity: '60+Math.sin(time*6)*40' } }
  ] }) },
  { id: 'split-reveal', name: 'فتح من النص', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Split Reveal', duration: 4, bg: '#fff7ed' }, layers: [
    { type: 'shape', name: 'Top', shape: { kind: 'rect', size: [W(c), H(c) / 2], fill: p.color || '#ea580c' }, keys: { position: [[0.6, ['50%', '25%'], 'expoInOut'], [1.4, ['50%', '-30%']]] } },
    { type: 'shape', name: 'Bottom', shape: { kind: 'rect', size: [W(c), H(c) / 2], fill: p.color || '#ea580c' }, keys: { position: [[0.6, ['50%', '75%'], 'expoInOut'], [1.4, ['50%', '130%']]] } },
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.12), color: '#1f140c', transform: { position: ['50%', '52%'] }, keys: { scale: [[0.9, 80, 'expoOut'], [1.8, 100]], opacity: [[0.9, 0], [1.2, 100]] } }
  ] }) },
  { id: 'glitch-title', name: 'عنوان جليتش', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Glitch Title', duration: 4, bg: '#050302' }, layers: [
    { type: 'text', name: 'Title', text: p.title || 'GLITCH', size: Math.round(H(c) * 0.15), color: '#ffffff', transform: { position: ['50%', '50%'] }, expressions: { position: 'seedRandom(Math.floor(time*12),true);var j=random()<0.15?random(-30,30):0;value+[j,0]' }, effects: [{ name: 'directionalBlur', params: { direction: 90, length: 0 } }], keys: { 'fx:directionalBlur.length': [[0, 60, 'expoOut'], [0.6, 0]], opacity: [[0, 0, 'hold'], [0.1, 100]] } },
    { type: 'text', name: 'Title Red', text: p.title || 'GLITCH', size: Math.round(H(c) * 0.15), color: p.color || '#f97316', blend: 'screen', transform: { position: ['50.4%', '50%'], opacity: 70 }, expressions: { position: 'value+[Math.sin(time*40)*4,0]' } }
  ] }) },
  { id: 'camera-cards', name: 'كروت ثري دي بكاميرا', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: '3D Cards', duration: 6, bg: '#0b0806' }, layers: [
    { type: 'camera', name: 'Camera', transform: { position: ['50%', '50%', -2200] }, keys: { position: [[0, ['50%', '50%', -2600], 'easeInOut'], [6, ['56%', '48%', -1800]]] } },
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.09), color: '#ffffff', threeD: true, transform: { position: ['50%', '50%', -200] }, textAnimator: { preset: 'fadeUp', by: 'words', duration: 0.8, start: 0.3 } },
    { type: 'shape', name: 'Card 1', threeD: true, shape: { kind: 'rect', size: [W(c) * 0.35, H(c) * 0.45], round: 30, fill: p.color || '#ea580c' }, transform: { position: ['30%', '50%', 400], rotationY: 25, opacity: 85 } },
    { type: 'shape', name: 'Card 2', threeD: true, shape: { kind: 'rect', size: [W(c) * 0.35, H(c) * 0.45], round: 30, fill: '#fbbf24' }, transform: { position: ['70%', '50%', 600], rotationY: -25, opacity: 85 } },
    { type: 'light', name: 'Key', lightType: 'point', transform: { position: ['30%', '20%', -800] } }
  ] }) }
];
/** a library scene with the user's words / colour → raw scene (then normalize) */
function buildLibrary(id, params = {}, compInfo = {}) {
  const s = SCENES.find(x => x.id === id);
  if (!s) throw new Error('المشهد مش موجود: ' + id);
  const c = { width: compInfo.width || 1920, height: compInfo.height || 1080 };
  return s.build(params, c);
}

/* ======================= auto edit: clips (+ music) → a cut on the beat, in a style ======================= */
const STYLES = {
  energetic: { name: 'سريع وحماسي', every: 1, cut: 0.7, punch: true, flash: true, text: 'scalePop' },
  cinematic: { name: 'سينمائي', every: 4, cut: 2.8, push: true, fade: 0.5, tint: 18, bars: true, text: 'blurIn' },
  vlog: { name: 'فلوج', every: 2, cut: 1.6, drift: true, text: 'fadeUp' },
  minimal: { name: 'هادي وبسيط', every: 2, cut: 2.2, fade: 0.25, text: 'tracking' }
};
const RATIOS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
/**
 * The cut as a raw scene (then normalize → buildScene): one footage layer per slot, slots on the music's beats
 * (every N beats by style) or a fixed length, clips in `order`, each use of a clip a new part of it.
 * clips: [{ file, dur, still, best }] · beats: seconds · titles: [{ text, at, dur }] → { scene, cuts }
 */
function montageScene({ clips = [], beats = [], style = 'energetic', ratio = '16:9', duration = 0, music = null, titles = [], order = null, name = 'EditFast Edit' } = {}) {
  if (!clips.length) throw new Error('اختار فيديوهات أو صور الأول');
  const S = STYLES[style] || STYLES.energetic, [W0, H0] = RATIOS[ratio] || RATIOS['16:9'];
  const seq = (order && order.length ? order : clips.map((_, i) => i)).filter(i => clips[i]);
  const b = beats.filter(t => t >= 0).sort((x, y) => x - y);
  let total = Math.min(300, +duration || (b.length > 4 ? b[b.length - 1] : seq.length * S.cut * 2));
  const slots = [];
  if (b.length > 4) {
    for (let k = 0; k + S.every < b.length && b[k] < total; k += S.every) slots.push({ start: b[k], dur: b[k + S.every] - b[k] });
    if (slots.length && slots[0].start > 0.05) { slots[0].dur += slots[0].start; slots[0].start = 0; }
  } else for (let t = 0; t < total - 0.1; t += S.cut) slots.push({ start: t, dur: Math.min(S.cut, total - t) });
  if (!slots.length) throw new Error('المزيكا قصيرة قوي — مفيش بيتس كفاية');
  total = Math.min(total, slots[slots.length - 1].start + slots[slots.length - 1].dur);
  const used = clips.map(c => Math.max(0, +c.best || 0));
  const cuts = slots.map((s, i) => {
    const ci = seq[i % seq.length], c = clips[ci], d = s.dur + (S.fade || 0);
    let srcIn = 0;
    if (!c.still && c.dur > 0) { srcIn = used[ci]; if (srcIn + d > c.dur) srcIn = Math.max(0, (c.dur - d) * ((i * 0.37) % 1)); used[ci] = srcIn + d; }
    return { clip: ci, file: c.file, still: !!c.still, start: +s.start.toFixed(3), dur: +d.toFixed(3), srcIn: +srcIn.toFixed(3) };
  });
  const layers = [];
  for (const t of titles.slice(0, 8)) {
    if (!t || !t.text) continue;
    const at = Math.max(0, Math.min(total - 0.5, +t.at || 0)), d = Math.max(1, +t.dur || 2.5);
    layers.push({ type: 'text', name: 'Title ' + (layers.length + 1), text: String(t.text).slice(0, 120), size: Math.round(Math.min(W0, H0) * 0.085), color: '#ffffff', start: at, end: Math.min(total, at + d),
      transform: { position: ['50%', ratio === '9:16' ? '72%' : '80%'] }, textAnimator: { preset: S.text, by: 'words', duration: 0.6, start: at },
      effects: [{ name: 'shadow', params: { opacity: 70, distance: 6, softness: 24 } }], keys: { opacity: [[d - 0.3, 100, 'easeIn'], [d, 0]] } });
  }
  if (S.bars) for (const y of ['5%', '95%']) layers.push({ type: 'shape', name: 'Bar ' + y, shape: { kind: 'rect', size: [W0 * 1.1, H0 * 0.1], fill: '#000000' }, transform: { position: ['50%', y] } });
  if (S.tint) layers.push({ type: 'adjustment', name: 'Grade', effects: [{ name: 'tint', params: { black: '#1a0f08', white: '#fff1e0', amount: S.tint } }, { name: 'noise', params: { amount: 2 } }] });
  for (let i = cuts.length - 1; i >= 0; i--) {
    const x = cuts[i], keys = {};
    if (S.punch) keys.scale = [[0, i % 2 ? 118 : 112, 'expoOut'], [0.35, 100]];
    if (S.push) keys.scale = [[0, 100, 'linear'], [x.dur, 108]];
    if (S.drift) keys.scale = [[0, i % 2 ? 104 : 100, 'linear'], [x.dur, i % 2 ? 100 : 104]];
    if (S.fade && i > 0) keys.opacity = [[0, 0, 'easeOut'], [S.fade, 100]];
    const L = { type: 'footage', name: 'Cut ' + (i + 1), file: x.file, start: x.start, end: +(x.start + x.dur).toFixed(3), srcIn: x.srcIn, keys };
    if (S.flash && i > 0) { L.effects = [{ name: 'directionalBlur', params: { direction: 90, length: 0 } }]; keys['fx:directionalBlur.length'] = [[0, 40, 'expoOut'], [0.2, 0]]; }
    layers.push(L);
  }
  if (music) layers.push({ type: 'footage', name: 'Music', file: music, start: 0, end: total, cover: false });
  return { scene: { comp: { create: true, name, width: W0, height: H0, fps: 30, duration: Math.max(1, +total.toFixed(2)), bg: '#000000' }, layers }, cuts };
}

module.exports = { EFFECTS, TYPES, PROPS, EASES, SCENES, STYLES, RATIOS, normalize, promptDoc, buildLibrary, montageScene, hex };

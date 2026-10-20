'use strict';
// عدة الموشن: عدّاد أرقام (عملات، نسبة، K/M، وقت، أرقام عربي)، إنفوجرافيك من جدول، أشكال سايلة (Liquid)، وترانزيشنز.
// كله بيطلع "وصف مشهد" عادي يتبني ليرز حقيقية تتعدّل — والعدّاد إكسبريشن على سلايدر "Count" تقدر تكي فريمه بإيدك.
const svg = require('./svgPath');

/* ======================= counter ======================= */
// one formatter, used here (preview / tests) and pasted as-is into the AE expression (ES3-safe)
const FORMAT_SRC = "function efDig(s,o){if(!o.arabic)return s;var d='٠١٢٣٤٥٦٧٨٩',r='';for(var i=0;i<s.length;i++){var c=s.charAt(i);r+=(c>='0'&&c<='9')?d.charAt(+c):(c==='%'?'٪':(c==='.'&&o.dec==='.'?'٫':c));}return r;}" +
  "function efFmt(v,o){var neg=v<0;v=Math.abs(v);var unit='',s,p;" +
  "if(o.format==='time'){var t=Math.round(v),h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;s=(h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x;return efDig((neg?'-':'')+o.prefix+s+o.suffix,o);}" +
  "if(o.format==='compact'){if(v>=1e9){v/=1e9;unit=o.units[2];}else if(v>=1e6){v/=1e6;unit=o.units[1];}else if(v>=1e3){v/=1e3;unit=o.units[0];}}" +
  "s=v.toFixed(o.decimals);if(o.trim&&s.indexOf('.')>=0){s=s.replace(/0+$/,'').replace(/\\.$/,'');}p=s.split('.');" +
  "while(p[0].length<o.pad)p[0]='0'+p[0];if(o.sep)p[0]=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,o.sep);" +
  "s=p.length>1?p[0]+o.dec+p[1]:p[0];return efDig((neg?'-':(o.plus&&v>0?'+':''))+o.prefix+s+unit+o.suffix,o);}";
const efFmt = new Function(FORMAT_SRC + ';return efFmt;')();

const CURRENCIES = {
  USD: { prefix: '$' }, EUR: { prefix: '€' }, GBP: { prefix: '£' }, JPY: { prefix: '¥', decimals: 0 }, INR: { prefix: '₹' }, BTC: { prefix: '₿' },
  EGP: { suffix: ' ج.م', en: ' EGP' }, SAR: { suffix: ' ر.س', en: ' SAR' }, AED: { suffix: ' د.إ', en: ' AED' }, KWD: { suffix: ' د.ك', en: ' KWD', decimals: 3 }, QAR: { suffix: ' ر.ق', en: ' QAR' }, MAD: { suffix: ' د.م', en: ' MAD' }
};
const FORMATS = { number: 'رقم عادي', currency: 'فلوس', percent: 'نسبة %', compact: 'مختصر (K / M / B)', time: 'وقت (د:ث)' };
/** the user's choices → the formatter's options */
function counterOptions(o = {}) {
  const f = FORMATS[o.format] ? o.format : 'number';
  const cur = CURRENCIES[o.currency] || null, ar = !!o.arabic;
  const out = { format: f, decimals: Math.max(0, Math.min(4, o.decimals === undefined ? (f === 'compact' ? 1 : f === 'currency' && cur && cur.decimals !== undefined ? cur.decimals : 0) : +o.decimals || 0)),
    sep: o.separator === undefined ? (ar ? '٬' : ',') : String(o.separator).slice(0, 2), dec: o.decimalMark || (ar ? '٫' : '.'),
    prefix: String(o.prefix || ''), suffix: String(o.suffix || ''), plus: !!o.plus, pad: Math.max(0, Math.min(9, +o.pad || 0)), trim: o.trimZeros !== false && f === 'compact',
    units: Array.isArray(o.units) && o.units.length === 3 ? o.units.map(String) : (o.unitsArabic ? [' ألف', ' مليون', ' مليار'] : ['K', 'M', 'B']), arabic: ar };
  if (f === 'currency' && cur && !o.prefix && !o.suffix) { out.prefix = cur.prefix || ''; out.suffix = ar ? cur.suffix || '' : cur.en || cur.suffix || ''; }
  if (f === 'currency' && o.symbol) { if (o.symbolAfter) out.suffix = ' ' + o.symbol; else out.prefix = o.symbol; }
  if (f === 'percent' && !o.suffix) out.suffix = '%';
  if (f === 'time') out.sep = '';
  return out;
}
/** loopOut("cycle") written out: AE 26 has no loopOut on shape Path properties ("loopOut is not a function") */
const PATH_LOOP = 'var n=numKeys;var a=n>1?key(1).time:0,d=n>1?key(n).time-a:0;d>0&&time>a+d?valueAtTime(a+(time-a)%d):value';
/** AE's Slider Control stops at ±1,000,000: the power of 10 a bigger number is divided by on the slider */
function sliderUnit(...vals) { const big = Math.max(0, ...vals.map(v => Math.abs(+v || 0))); return big > 999999 ? Math.pow(10, Math.ceil(Math.log10(big / 999999))) : 1; }
function formatNumber(v, o) { return efFmt(+v || 0, counterOptions(o)); }
/** the Source Text expression: the slider "Count" (on the same layer) formatted */
function counterExpr(o, { slider = 'Count', layer = null, unit = 1 } = {}) {
  const src = (layer ? 'thisComp.layer(' + JSON.stringify(layer) + ').effect(' + JSON.stringify(slider) + ')("Slider")' : 'effect(' + JSON.stringify(slider) + ')("Slider")') + (unit > 1 ? '*' + unit : '');
  return FORMAT_SRC + 'efFmt(' + src + ',' + JSON.stringify(counterOptions(o)) + ')';
}
const COUNTER_STYLES = { plain: 'رقم بس', ring: 'دايرة بتتملي', bar: 'بار بيتملي', card: 'كارت برقم وعنوان', slot: 'أرقام بتلف (Slot)' };
/**
 * A counter as scene layers: the number (slider "Count" keyed from → to, formatted live), optional ring / bar / label.
 * o: { name, from, to, duration, start, ease, format, currency, decimals, separator, arabic, prefix, suffix, plus, label, style, color, accent, size, position, max }
 */
function counterLayers(o = {}, comp = { width: 1920, height: 1080 }) {
  const N = String(o.name || 'Counter').slice(0, 30), from = +o.from || 0, to = o.to === undefined ? 100 : +o.to, d = Math.max(0.2, +o.duration || 2), t0 = +o.start || 0;
  const H = comp.height, size = +o.size || Math.round(H * 0.16), pos = o.position || ['50%', '46%'];
  const color = o.color || '#ffffff', accent = o.accent || '#f97316', style = COUNTER_STYLES[o.style] ? o.style : 'plain';
  const max = +o.max || (o.format === 'percent' ? 100 : Math.max(Math.abs(to), 1));
  const ease = o.ease || 'expoOut';
  // AE's Slider Control stops at ±1,000,000: bigger numbers ride the slider divided by 10ⁿ (the text multiplies back)
  const unit = sliderUnit(from, to);
  const num = { type: 'text', name: N, text: formatNumber(from, o), size, color, font: o.font, tracking: o.format === 'time' ? 20 : 0, start: o.layerStart, end: o.layerEnd,
    transform: { position: pos }, effects: [{ name: 'slider', label: 'Count', params: { value: from / unit } }],
    keys: { 'fx:Count.value': [[t0, from / unit, ease], [t0 + d, to / unit]] }, expressions: { text: counterExpr(o, { unit }) } };
  if (style === 'slot') { num.keys.position = undefined; num.effects.push({ name: 'directionalBlur', params: { direction: 0, length: 0 } }); num.keys['fx:directionalBlur.length'] = [[t0, 30, 'expoOut'], [t0 + d, 0]]; delete num.keys.position; }
  num.keys.scale = [[t0, 85, 'backOut'], [t0 + Math.min(0.6, d), 100]];
  const layers = [num];
  const link = 'thisComp.layer(' + JSON.stringify(N) + ').effect("Count")("Slider")' + (unit > 1 ? '*' + unit : '');
  if (o.label) layers.push({ type: 'text', name: N + ' Label', text: String(o.label).slice(0, 80), size: Math.round(size * 0.28), color: o.labelColor || '#fed7aa', transform: { position: [pos[0], typeof pos[1] === 'string' ? (parseFloat(pos[1]) + 15) + '%' : pos[1] + size * 0.9] }, textAnimators: [{ preset: 'fadeUp', by: 'words', duration: 0.6, start: t0 + 0.2 }] });
  if (style === 'ring') {
    const r = size * 1.6;
    layers.push({ type: 'shape', name: N + ' Ring', shape: { kind: 'ellipse', size: [r * 2, r * 2], fill: null, stroke: accent, strokeWidth: size * 0.14, lineCap: 'round', trim: { end: 0 } }, transform: { position: pos, rotation: 0 },
      expressions: { 'shape:trimEnd': `clamp((${link}-(${Math.min(from, 0)}))/${max}*100,0,100)` } },
    { type: 'shape', name: N + ' Track', shape: { kind: 'ellipse', size: [r * 2, r * 2], fill: null, stroke: '#ffffff', strokeWidth: size * 0.14 }, transform: { position: pos, opacity: 15 } });
  }
  if (style === 'bar') {
    const w = comp.width * 0.5, y = typeof pos[1] === 'string' ? (parseFloat(pos[1]) + 22) + '%' : pos[1] + size;
    layers.push({ type: 'shape', name: N + ' Bar', shape: { items: [{ kind: 'rect', size: [w, size * 0.16], round: size * 0.08, position: [w / 2, 0] }], fill: accent }, transform: { position: [typeof pos[0] === 'string' ? (parseFloat(pos[0]) - 25) + '%' : pos[0] - w / 2, y] },
      expressions: { scale: `[clamp(${link}/${max}*100,0,100),100]` } },
    { type: 'shape', name: N + ' Bar Track', shape: { kind: 'rect', size: [w, size * 0.16], round: size * 0.08, fill: '#ffffff' }, transform: { position: [pos[0], y], opacity: 15 } });
  }
  if (style === 'card') layers.push({ type: 'shape', name: N + ' Card', shape: { kind: 'rect', size: [size * 4.2, size * 2.2], round: size * 0.25, fill: accent }, transform: { position: [pos[0], typeof pos[1] === 'string' ? (parseFloat(pos[1]) + 6) + '%' : pos[1] + size * 0.4] }, keys: { scale: [[t0, 0, 'backOut'], [t0 + 0.5, 100]] } });
  return layers;
}

/* ======================= infographics ======================= */
const CHARTS = { column: 'أعمدة', bar: 'بارات أفقي', line: 'خط', area: 'خط بمساحة', pie: 'دايرة (Pie)', donut: 'دونات', progress: 'نسب تقدّم', timeline: 'تايملاين' };
const PALETTE = ['#f97316', '#fbbf24', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#94a3b8'];
/** "اسم, 120" / "اسم\t120" / "2019 | حدث" lines (or a JSON array) → [{ label, value, note }] */
function parseTable(text) {
  if (Array.isArray(text)) return text.map(r => ({ label: String(r.label || r.name || ''), value: +r.value || 0, note: r.note }));
  const t = String(text || '').trim();
  if (/^\[/.test(t)) { try { return parseTable(JSON.parse(t)); } catch (_) {} }
  return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/\t|\s*[,،|;]\s*/);
    const numIdx = parts.findIndex((p, i) => i > 0 && /^[-+]?[\d٠-٩.,]+%?$/.test(p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (numIdx > 0) return { label: parts.slice(0, numIdx).join(' '), value: +parts[numIdx].replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,%]/g, ''), note: parts.slice(numIdx + 1).join(' ') || undefined };
    return { label: parts[0], value: 0, note: parts.slice(1).join(' ') || undefined };
  }).slice(0, 30);
}
/**
 * A chart / timeline as a raw scene. o: { type, data (table text or rows), title, colors, format (counter options),
 * duration, bg, color (text) }
 */
function chartScene(o = {}, comp = { width: 1920, height: 1080 }) {
  const type = CHARTS[o.type] ? o.type : 'column', rows = parseTable(o.data);
  if (!rows.length) throw new Error('حط البيانات: كل سطر "الاسم, الرقم"');
  const W = comp.width, H = comp.height, cols = (o.colors && o.colors.length ? o.colors : PALETTE), txt = o.color || '#fff7ed';
  const dur = Math.max(3, +o.duration || 6), fmt = o.format || {}, n = rows.length, maxV = Math.max(...rows.map(r => Math.abs(r.value)), 1);
  const stag = Math.min(0.15, 1.5 / n), layers = [];
  const area = { x0: W * 0.12, x1: W * 0.9, y0: H * (o.title ? 0.24 : 0.12), y1: H * 0.8 };
  const label = (name, text, x, y, size, t, extra) => Object.assign({ type: 'text', name, text: String(text).slice(0, 60), size, color: txt, transform: { position: [x, y] }, keys: { opacity: [[t, 0, 'easeOut'], [t + 0.4, 100]] } }, extra || {});
  const valueText = (name, v, x, y, size, t) => { const u = sliderUnit(v); return { type: 'text', name, text: formatNumber(0, fmt), size, color: txt, transform: { position: [x, y] }, effects: [{ name: 'slider', label: 'Count', params: { value: 0 } }], keys: { 'fx:Count.value': [[t, 0, 'expoOut'], [t + 1.2, v / u]], opacity: [[t, 0], [t + 0.2, 100]] }, expressions: { text: counterExpr(fmt, { unit: u }) } }; };
  if (o.title) layers.push(label('Chart Title', o.title, '50%', H * 0.12, Math.round(H * 0.06), 0, { textAnimators: [{ preset: 'fadeUp', by: 'words', duration: 0.6, start: 0 }], keys: {} }));
  const fs = Math.round(H * 0.03);
  if (type === 'column' || type === 'bar') {
    const vert = type === 'column', span = vert ? area.x1 - area.x0 : area.y1 - area.y0, slot = span / n, thick = slot * 0.62, len = vert ? area.y1 - area.y0 - fs * 2 : area.x1 - area.x0 - W * 0.12;
    layers.push({ type: 'shape', name: 'Axis', shape: { path: vert ? `M${area.x0} ${area.y1} L${area.x1} ${area.y1}` : `M${area.x0} ${area.y0} L${area.x0} ${area.y1}`, fill: null, stroke: txt, strokeWidth: 3, trim: { end: 0 } }, transform: { position: vert ? [(area.x0 + area.x1) / 2, area.y1] : [area.x0, (area.y0 + area.y1) / 2], opacity: 60 }, keys: { 'shape:trimEnd': [[0, 0, 'expoOut'], [0.8, 100]] } });
    rows.forEach((r, i) => {
      const t = 0.3 + i * stag, l = Math.max(2, Math.abs(r.value) / maxV * len), c = cols[i % cols.length];
      const cx = vert ? area.x0 + slot * (i + 0.5) : area.x0, cy = vert ? area.y1 : area.y0 + slot * (i + 0.5);
      // the bar grows from its base: its layer sits on the base, the rect is offset to one side
      layers.push({ type: 'shape', name: 'Bar ' + (i + 1), shape: { items: [{ kind: 'rect', size: vert ? [thick, l] : [l, thick], round: Math.min(thick, l) * 0.18, position: vert ? [0, -l / 2] : [l / 2, 0] }], fill: c }, transform: { position: [cx, cy] },
        keys: { scale: [[t, vert ? [100, 0] : [0, 100], 'expoOut'], [t + 1.2, [100, 100]]] } });
      layers.push(valueText('Value ' + (i + 1), r.value, vert ? cx : cx + l + W * 0.05, vert ? cy - l - fs * 0.8 : cy + fs * 0.35, fs, t + 0.2));
      layers.push(label('Label ' + (i + 1), r.label, vert ? cx : area.x0 - W * 0.06, vert ? area.y1 + fs * 1.5 : cy + fs * 0.35, fs, t));
    });
  } else if (type === 'line' || type === 'area') {
    const pts = rows.map((r, i) => [area.x0 + (area.x1 - area.x0) * (n > 1 ? i / (n - 1) : 0.5), area.y1 - (r.value / maxV) * (area.y1 - area.y0 - fs * 2)]);
    const c = cols[0], drawEnd = 0.4 + Math.min(2, 0.25 * n);
    layers.push({ type: 'shape', name: 'Line', motionBlur: true, transform: { position: [0, 0] }, shape: { items: [{ paths: [svg.fromPoints(pts, { smooth: true })] }], fill: null, stroke: c, strokeWidth: Math.max(4, H * 0.006), lineCap: 'round', trim: { end: 0 } }, keys: { 'shape:trimEnd': [[0.4, 0, 'easeInOut'], [drawEnd, 100]] }, effects: [{ name: 'glow', params: { radius: 20, intensity: 0.6 } }] });
    if (type === 'area') {
      const poly = pts.concat([[pts[pts.length - 1][0], area.y1], [pts[0][0], area.y1]]);
      layers.push({ type: 'shape', name: 'Area', transform: { position: [0, 0], opacity: 30 }, shape: { items: [{ paths: [svg.fromPoints(poly, { closed: true })] }], fill: c }, effects: [{ name: 'linearWipe', params: { completion: 100, angle: 270, feather: 40 } }], keys: { 'fx:linearWipe.completion': [[0.4, 100, 'easeInOut'], [drawEnd, 0]] } });
    }
    pts.forEach((p, i) => {
      const t = 0.4 + (drawEnd - 0.4) * (n > 1 ? i / (n - 1) : 1);
      layers.push({ type: 'shape', name: 'Point ' + (i + 1), shape: { kind: 'ellipse', size: [fs * 0.9, fs * 0.9], fill: '#ffffff', stroke: c, strokeWidth: 4 }, transform: { position: p }, keys: { scale: [[t, 0, 'backOut'], [t + 0.4, 100]] } });
      layers.push(valueText('Value ' + (i + 1), rows[i].value, p[0], p[1] - fs * 1.1, fs, t));
      layers.push(label('Label ' + (i + 1), rows[i].label, p[0], area.y1 + fs * 1.5, fs, t));
    });
  } else if (type === 'pie' || type === 'donut') {
    const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1, R = Math.min(W, H) * 0.28, cx = W * 0.38, cy = (area.y0 + area.y1) / 2;
    const sw = type === 'donut' ? R * 0.42 : R, d = type === 'donut' ? R * 2 : R; // a pie = a stroke as wide as the radius on a half-size circle
    let acc = 0;
    rows.forEach((r, i) => {
      const a = acc / total * 100, b = (acc + Math.max(0, r.value)) / total * 100, t = 0.3 + i * stag * 2, c = cols[i % cols.length];
      acc += Math.max(0, r.value);
      layers.push({ type: 'shape', name: 'Slice ' + (i + 1), shape: { kind: 'ellipse', size: [d, d], fill: null, stroke: c, strokeWidth: sw, trim: { start: a, end: a } }, transform: { position: [cx, cy] },
        keys: { 'shape:trimEnd': [[t, a, 'expoOut'], [t + 1, b]] } });
      const ly = cy - (n - 1) * fs * 0.9 + i * fs * 1.8;
      layers.push({ type: 'shape', name: 'Key ' + (i + 1), shape: { kind: 'rect', size: [fs, fs], round: fs * 0.25, fill: c }, transform: { position: [W * 0.66, ly] }, keys: { scale: [[t, 0, 'backOut'], [t + 0.4, 100]] } });
      layers.push(label('Label ' + (i + 1), r.label, W * 0.72, ly + fs * 0.35, fs, t, { align: 'left' }));
      layers.push(Object.assign(valueText('Value ' + (i + 1), Math.round(r.value / total * 1000) / 10, W * 0.88, ly + fs * 0.35, fs, t), { expressions: { text: counterExpr(Object.assign({}, fmt, { format: 'percent', decimals: fmt.decimals || 0 })) } }));
    });
    if (type === 'donut') layers.push(valueText('Total', total, cx, cy + fs * 0.6, Math.round(fs * 2), 0.3));
  } else if (type === 'progress') {
    const rowH = Math.min(H * 0.12, (area.y1 - area.y0) / n), w = (area.x1 - area.x0) * 0.75;
    rows.forEach((r, i) => {
      const y = area.y0 + rowH * (i + 0.6), t = 0.3 + i * stag * 2, c = cols[i % cols.length], p = Math.max(0, Math.min(100, r.value));
      layers.push(label('Label ' + (i + 1), r.label, area.x0, y - rowH * 0.28, fs, t, { align: 'left' }));
      layers.push({ type: 'shape', name: 'Track ' + (i + 1), shape: { items: [{ kind: 'rect', size: [w, rowH * 0.22], round: rowH * 0.11, position: [w / 2, 0] }], fill: '#ffffff' }, transform: { position: [area.x0, y], opacity: 14 } });
      layers.push({ type: 'shape', name: 'Fill ' + (i + 1), shape: { items: [{ kind: 'rect', size: [w * p / 100, rowH * 0.22], round: rowH * 0.11, position: [w * p / 200, 0] }], fill: c }, transform: { position: [area.x0, y] }, keys: { scale: [[t, [0, 100], 'expoOut'], [t + 1.2, [100, 100]]] } });
      layers.push(Object.assign(valueText('Value ' + (i + 1), p, area.x0 + w + W * 0.05, y + fs * 0.35, fs, t), { expressions: { text: counterExpr(Object.assign({ format: 'percent' }, fmt, { format: 'percent' })) } }));
    });
  } else if (type === 'timeline') {
    const y = (area.y0 + area.y1) / 2, step = (area.x1 - area.x0) / Math.max(1, n - 1);
    layers.push({ type: 'shape', name: 'Timeline', shape: { path: `M${area.x0} ${y} L${area.x1} ${y}`, fill: null, stroke: txt, strokeWidth: 4, lineCap: 'round', trim: { end: 0 } }, transform: { position: [(area.x0 + area.x1) / 2, y], opacity: 70 }, keys: { 'shape:trimEnd': [[0.2, 0, 'easeInOut'], [0.2 + 0.4 * n, 100]] } });
    rows.forEach((r, i) => {
      const x = n > 1 ? area.x0 + step * i : (area.x0 + area.x1) / 2, t = 0.2 + 0.4 * i, up = i % 2 === 0, c = cols[i % cols.length];
      layers.push({ type: 'shape', name: 'Dot ' + (i + 1), shape: { kind: 'ellipse', size: [fs * 1.3, fs * 1.3], fill: c, stroke: '#ffffff', strokeWidth: 4 }, transform: { position: [x, y] }, keys: { scale: [[t, 0, 'backOut'], [t + 0.4, 100]] } });
      layers.push({ type: 'shape', name: 'Stem ' + (i + 1), shape: { path: `M0 0 L0 ${up ? -H * 0.08 : H * 0.08}`, fill: null, stroke: c, strokeWidth: 3, trim: { end: 0 } }, transform: { position: [x, y + (up ? -fs * 0.65 : fs * 0.65)] }, keys: { 'shape:trimEnd': [[t + 0.1, 0, 'expoOut'], [t + 0.5, 100]] } });
      layers.push(label('Year ' + (i + 1), r.label, x, y + (up ? -H * 0.11 : H * 0.14), Math.round(fs * 1.4), t + 0.2, { textAnimators: [{ preset: 'scalePop', by: 'chars', duration: 0.4, start: t + 0.2 }], keys: {} }));
      if (r.note || r.value) layers.push(label('Event ' + (i + 1), r.note || formatNumber(r.value, fmt), x, y + (up ? -H * 0.18 : H * 0.2), fs, t + 0.35));
    });
  }
  return { comp: { create: true, name: (o.title || CHARTS[type]).slice(0, 40), duration: dur, bg: o.bg || '#0b0806', width: W, height: H }, layers };
}

/* ======================= liquid shapes ======================= */
let SEED = 1;
const rnd = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };
/** a smooth random blob around 0,0 */
function blob(seed, r, { points = 8, irregular = 0.22 } = {}) {
  SEED = Math.max(1, Math.round(seed * 9973) % 2147483646);
  const pts = [];
  for (let i = 0; i < points; i++) { const a = i / points * Math.PI * 2, rr = r * (1 + (rnd() * 2 - 1) * irregular); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  // stronger handles than Catmull-Rom: liquid needs round, full curves
  const p = svg.fromPoints(pts, { closed: true, smooth: true }), k = 1.35;
  return { v: p.v, i: p.i.map(t => [t[0] * k, t[1] * k]), o: p.o.map(t => [t[0] * k, t[1] * k]), c: true };
}
/** keys that morph through blobs and back (loops) */
function blobKeys(seed, r, { count = 4, dur = 6, irregular = 0.22, points = 8 } = {}) {
  const shapes = []; for (let i = 0; i < count; i++) shapes.push(blob(seed + i * 7, r, { irregular, points }));
  return shapes.concat([shapes[0]]).map((s, i) => [i * dur / count, s, 'easeInOut']);
}
/** a sine wave path expression (open line, or filled down to `fillTo`) — moves forever */
function waveExpr(w, amp, waves, speed, { fillTo = null, phase = 0, n = 24 } = {}) {
  return `var n=${n},w=${w.toFixed(1)},a=${amp.toFixed(1)},k=${(Math.PI * 2 * waves / n).toFixed(5)},s=${speed},ph=${phase};var p=[],it=[],ot=[],dx=w/n/3;` +
    `for(var i=0;i<=n;i++){var x=-w/2+w*i/n,y=Math.sin(i*k+time*s+ph)*a,dy=Math.cos(i*k+time*s+ph)*a*k/3;p.push([x,y]);it.push([-dx,-dy]);ot.push([dx,dy]);}` +
    (fillTo === null ? 'createPath(p,it,ot,false)' : `p.push([w/2,${fillTo}]);p.push([-w/2,${fillTo}]);it.push([0,0],[0,0]);ot.push([0,0],[0,0]);createPath(p,it,ot,true)`);
}
const LIQUID = {
  'blob-calm': { name: 'بلوب هادي', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(1, c.r)] }], fill: o.color }, transform: { position: o.pos }, keys: { 'shape:path.1': blobKeys(1, c.r, { dur: 8, irregular: 0.15 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: 'time*6' } }] },
  'blob-energetic': { name: 'بلوب سريع', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(3, c.r)] }], fill: o.color }, transform: { position: o.pos }, keys: { 'shape:path.1': blobKeys(3, c.r, { dur: 2.4, irregular: 0.3 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: 'time*25' } }] },
  'blob-duo': { name: 'بلوبين فوق بعض', build: (o, c) => [
    { type: 'shape', name: o.name + ' A', blend: 'screen', shape: { items: [{ paths: [blob(5, c.r)] }], fill: o.color }, transform: { position: o.pos, opacity: 85 }, keys: { 'shape:path.1': blobKeys(5, c.r, { dur: 6 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: 'time*10' } },
    { type: 'shape', name: o.name + ' B', blend: 'screen', shape: { items: [{ paths: [blob(9, c.r * 0.9)] }], fill: o.color2 }, transform: { position: o.pos, opacity: 85 }, keys: { 'shape:path.1': blobKeys(9, c.r * 0.9, { dur: 7 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: '-time*8' } }] },
  'blob-outline': { name: 'بلوب خط', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(11, c.r)] }], fill: null, stroke: o.color, strokeWidth: c.r * 0.05 }, transform: { position: o.pos }, keys: { 'shape:path.1': blobKeys(11, c.r, { dur: 5 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: 'time*12' } }] },
  'morph-ring': { name: 'رينج بيتشكّل', build: (o, c) => [0, 1, 2].map(k => ({ type: 'shape', name: o.name + ' ' + (k + 1), shape: { items: [{ paths: [blob(20 + k, c.r * (1 - k * 0.12))] }], fill: null, stroke: k % 2 ? o.color2 : o.color, strokeWidth: c.r * 0.025 }, transform: { position: o.pos, opacity: 100 - k * 25 }, keys: { 'shape:path.1': blobKeys(20 + k, c.r * (1 - k * 0.12), { dur: 4 + k, irregular: 0.12 }) }, expressions: { 'shape:path.1': PATH_LOOP, rotation: (k % 2 ? '-' : '') + 'time*' + (10 + k * 6) } })) },
  'liquid-circle': { name: 'دايرة بتترجرج', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(30, c.r, { irregular: 0.05, points: 10 })] }], fill: o.color }, transform: { position: o.pos }, keys: { 'shape:path.1': blobKeys(30, c.r, { dur: 1.6, irregular: 0.06, points: 10 }) }, expressions: { 'shape:path.1': PATH_LOOP } }] },
  'wave-line': { name: 'خط موج', build: (o, c) => [{ type: 'shape', name: o.name, transform: { position: o.pos }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: null, stroke: o.color, strokeWidth: c.H * 0.008, lineCap: 'round' }, expressions: { 'shape:path': waveExpr(c.W * 0.8, c.H * 0.05, 2, 2.5) } }] },
  'wavy-stripes': { name: 'خطوط موج كتير', build: (o, c) => [0, 1, 2, 3, 4].map(k => ({ type: 'shape', name: o.name + ' ' + (k + 1), transform: { position: [o.pos[0], typeof o.pos[1] === 'number' ? o.pos[1] + (k - 2) * c.H * 0.06 : (parseFloat(o.pos[1]) + (k - 2) * 6) + '%'] }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: null, stroke: k % 2 ? o.color2 : o.color, strokeWidth: c.H * 0.006, lineCap: 'round' }, expressions: { 'shape:path': waveExpr(c.W * 0.9, c.H * 0.03, 1.5, 2, { phase: k * 0.7 }) } })) },
  'water-fill': { name: 'مية بتملا الكادر', build: (o, c) => [
    { type: 'shape', name: o.name + ' Front', transform: { position: ['50%', '75%'] }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: o.color }, expressions: { 'shape:path': waveExpr(c.W * 1.1, c.H * 0.025, 1.5, 2.2, { fillTo: c.H * 0.6 }) }, keys: { position: [[0, ['50%', '115%'], 'easeInOut'], [3, ['50%', '60%']]] } },
    { type: 'shape', name: o.name + ' Back', transform: { position: ['50%', '73%'], opacity: 55 }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: o.color2 }, expressions: { 'shape:path': waveExpr(c.W * 1.1, c.H * 0.03, 1.2, -1.6, { fillTo: c.H * 0.6, phase: 1.3 }) }, keys: { position: [[0, ['50%', '113%'], 'easeInOut'], [3, ['50%', '58%']]] } }] },
  'liquid-progress': { name: 'دايرة بتتملي مية', build: (o, c) => [
    { type: 'shape', name: o.name + ' Water', matte: { layer: o.name + ' Mask', type: 'alpha' }, transform: { position: o.pos }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: o.color }, expressions: { 'shape:path': waveExpr(c.r * 2.4, c.r * 0.08, 1.5, 3, { fillTo: c.r * 2.2 }) }, keys: { position: [[0, [c.cx, c.cy + c.r * 1.1], 'easeInOut'], [4, [c.cx, c.cy - c.r * 0.7]]] } },
    { type: 'shape', name: o.name + ' Mask', shape: { kind: 'ellipse', size: [c.r * 2, c.r * 2], fill: '#ffffff' }, transform: { position: o.pos } },
    { type: 'shape', name: o.name + ' Outline', shape: { kind: 'ellipse', size: [c.r * 2.1, c.r * 2.1], fill: null, stroke: o.color, strokeWidth: c.r * 0.04 }, transform: { position: o.pos } }] },
  'drop-splash': { name: 'نقطة بتقع وتطرطش', build: (o, c) => {
    const L = [{ type: 'shape', name: o.name + ' Drop', shape: { path: 'M0 -60 C20 -25 35 0 35 20 C35 40 18 55 0 55 C-18 55 -35 40 -35 20 C-35 0 -20 -25 0 -60 Z', size: [c.r * 0.35, c.r * 0.5], fill: o.color }, transform: { position: o.pos }, keys: { position: [[0, [c.cx, c.cy - c.H * 0.45], 'easeIn'], [0.7, [c.cx, c.cy]]], opacity: [[0.7, 100, 'hold'], [0.72, 0]] } },
      { type: 'shape', name: o.name + ' Ring', shape: { kind: 'ellipse', size: [c.r * 2, c.r * 0.5], fill: null, stroke: o.color, strokeWidth: c.r * 0.04 }, transform: { position: o.pos }, keys: { scale: [[0.7, 0, 'expoOut'], [1.8, 160]], opacity: [[0.7, 100], [1.8, 0]] } }];
    for (let k = 0; k < 7; k++) { const a = -Math.PI * (0.15 + 0.7 * k / 6), v = c.r * (0.9 + (k % 3) * 0.3); L.push({ type: 'shape', name: o.name + ' Drip ' + (k + 1), shape: { kind: 'ellipse', size: [c.r * 0.1, c.r * 0.1], fill: o.color }, transform: { position: o.pos }, keys: { position: [[0.7, [c.cx, c.cy], 'expoOut'], [1.2, [c.cx + Math.cos(a) * v, c.cy + Math.sin(a) * v]], [1.7, [c.cx + Math.cos(a) * v * 1.2, c.cy + c.r * 0.2]]], scale: [[1.2, 100], [1.7, 0]] } }); }
    return L;
  } },
  'drip': { name: 'نقط بتسيل من فوق', build: (o, c) => [0, 1, 2, 3, 4, 5].map(k => { const x = c.W * (0.1 + k * 0.16), len = c.H * (0.25 + (k * 37 % 5) * 0.08); return { type: 'shape', name: o.name + ' ' + (k + 1), shape: { items: [{ kind: 'rect', size: [c.W * 0.05, len], round: c.W * 0.025, position: [0, len / 2] }], fill: k % 2 ? o.color2 : o.color }, transform: { position: [x, -c.W * 0.03] }, keys: { scale: [[k * 0.15, [100, 0], 'easeInOut'], [1.5 + k * 0.15, [100, 100]]] } }; }) },
  'bubbles': { name: 'فقاعات طالعة', build: (o, c) => [{ type: 'particles', name: o.name, preset: 'snow', count: 30, colors: [o.color, o.color2], size: [10, 40], speed: -80 }].map(p => Object.assign(p, { preset: 'dust', speed: 90 })) },
  'gooey-dots': { name: 'نقط لزجة (لودر)', build: (o, c) => [{ type: 'precomp', name: o.name, comp: { duration: c.D },
    effects: [{ name: 'blur', params: { amount: c.r * 0.12 } }, { match: 'ADBE Simple Choker', params: { 'Choke Matte': -c.r * 0.08 } }, { name: 'fill', params: { color: o.color } }], transform: { position: o.pos, anchor: ['50%', '50%'] },
    layers: [0, 1, 2, 3].map(k => ({ type: 'shape', name: 'Dot ' + (k + 1), shape: { kind: 'ellipse', size: [c.r * 0.45, c.r * 0.45], fill: '#ffffff' }, expressions: { position: `var a=time*2.4+${k}*Math.PI/2,r=${(c.r * 0.45).toFixed(1)}*(0.6+0.4*Math.sin(time*3+${k}));[thisComp.width/2+Math.cos(a)*r,thisComp.height/2+Math.sin(a)*r]` } })) }] },
  'lava-lamp': { name: 'لافا لامب', build: (o, c) => [{ type: 'precomp', name: o.name, comp: { duration: c.D },
    effects: [{ name: 'blur', params: { amount: c.r * 0.15 } }, { match: 'ADBE Simple Choker', params: { 'Choke Matte': -c.r * 0.1 } }, { name: 'gradient', params: { start: ['50%', '0%'], startColor: o.color, end: ['50%', '100%'], endColor: o.color2 } }],
    layers: [0, 1, 2, 3, 4, 5].map(k => ({ type: 'shape', name: 'Blob ' + (k + 1), shape: { kind: 'ellipse', size: [c.r * (0.4 + (k % 3) * 0.2), c.r * (0.4 + (k % 3) * 0.2)], fill: '#ffffff' }, expressions: { position: `seedRandom(${k + 3},true);var x=random(${c.W * 0.3},${c.W * 0.7}),sp=random(0.15,0.35),y=${c.H}*(0.5+0.45*Math.sin(time*sp*2+${k}));[x+Math.sin(time*0.7+${k})*${(c.W * 0.05).toFixed(0)},y]` } })) }] },
  'ink-spread': { name: 'حبر بينتشر', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(40, c.r, { irregular: 0.3, points: 12 })] }], fill: o.color }, transform: { position: o.pos }, keys: { scale: [[0, 0, 'expoOut'], [2.5, 260]] }, effects: [{ name: 'displace', params: { amount: 60, size: c.r * 0.3 } }], expressions: { 'fx:displace.evolution': 'time*120' } }] },
  'ripple-rings': { name: 'موجات دواير', build: (o, c) => [0, 1, 2, 3].map(k => ({ type: 'shape', name: o.name + ' ' + (k + 1), shape: { kind: 'ellipse', size: [c.r * 2, c.r * 2], fill: null, stroke: o.color, strokeWidth: c.r * 0.03 }, transform: { position: o.pos }, expressions: { scale: `var t=(time+${k * 0.5})%2;[t*80,t*80]`, opacity: `var t=(time+${k * 0.5})%2;linear(t,0,2,100,0)` } })) },
  'splash-burst': { name: 'طرطشة من النص', build: (o, c) => Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2, d = c.r * (1.1 + (k % 3) * 0.25); return { type: 'shape', name: o.name + ' ' + (k + 1), shape: { path: 'M0 -60 C20 -25 35 0 35 20 C35 40 18 55 0 55 C-18 55 -35 40 -35 20 C-35 0 -20 -25 0 -60 Z', size: [c.r * 0.18, c.r * 0.26], fill: k % 2 ? o.color2 : o.color }, transform: { position: o.pos, rotation: a * 180 / Math.PI + 90 }, keys: { position: [[0.1, [c.cx, c.cy], 'expoOut'], [0.8, [c.cx + Math.cos(a) * d, c.cy + Math.sin(a) * d]]], scale: [[0.1, 0, 'backOut'], [0.5, 100], [1.4, 100, 'easeIn'], [1.9, 0]] } }; }) },
  'liquid-button': { name: 'زرار سايل', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [svg.parse(`M${-c.r} 0 C${-c.r} ${-c.r * 0.35} ${-c.r * 0.6} ${-c.r * 0.4} 0 ${-c.r * 0.4} C${c.r * 0.6} ${-c.r * 0.4} ${c.r} ${-c.r * 0.35} ${c.r} 0 C${c.r} ${c.r * 0.35} ${c.r * 0.6} ${c.r * 0.4} 0 ${c.r * 0.4} C${-c.r * 0.6} ${c.r * 0.4} ${-c.r} ${c.r * 0.35} ${-c.r} 0 Z`)[0]] }], fill: o.color }, transform: { position: o.pos }, effects: [{ name: 'waveWarp', params: { height: c.r * 0.04, width: c.r * 0.8, speed: 1 } }], keys: { scale: [[0, 0, 'backOut'], [0.6, 100]] } }] },
  'blob-cluster': { name: 'بلوبات صغيرة بتطفو', build: (o, c) => Array.from({ length: 6 }, (_, k) => { const rr = c.r * (0.25 + (k % 3) * 0.12); return { type: 'shape', name: o.name + ' ' + (k + 1), shape: { items: [{ paths: [blob(50 + k, rr)] }], fill: k % 2 ? o.color2 : o.color }, expressions: { position: `seedRandom(${k + 11},true);[random(${c.W * 0.15},${c.W * 0.85})+Math.sin(time*0.5+${k})*${(c.W * 0.04).toFixed(0)},random(${c.H * 0.2},${c.H * 0.8})+Math.cos(time*0.4+${k})*${(c.H * 0.05).toFixed(0)}]`, 'shape:path.1': PATH_LOOP }, keys: { 'shape:path.1': blobKeys(50 + k, rr, { dur: 5 + k }) } }; }) },
  'blob-reveal': { name: 'بلوب بيغطي الكادر', build: (o, c) => [{ type: 'shape', name: o.name, shape: { items: [{ paths: [blob(60, c.r)] }], fill: o.color }, transform: { position: o.pos }, keys: { scale: [[0, 0, 'expoIn'], [0.8, 550], [1.2, 550, 'expoOut'], [2, 0]], 'shape:path.1': blobKeys(60, c.r, { dur: 2, irregular: 0.3 }) } }] }
};
/** a liquid preset → raw layers. o: { preset, name, color, color2, size (px radius), position } */
function liquidLayers(o = {}, comp = { width: 1920, height: 1080, duration: 8 }) {
  const P = LIQUID[o.preset] || LIQUID['blob-calm'];
  const W = comp.width, H = comp.height, pos = Array.isArray(o.position) ? o.position : [W / 2, H / 2];
  const c = { W, H, D: comp.duration || 8, r: +o.size || Math.min(W, H) * 0.22, cx: pos[0], cy: pos[1] };
  return P.build({ name: String(o.name || P.name).slice(0, 30), color: o.color || '#f97316', color2: o.color2 || '#fbbf24', pos }, c);
}

/* ======================= transitions ======================= */
const TRANSITIONS = {
  zoomIn: 'زووم داخل', zoomOut: 'زووم خارج', whipLeft: 'Whip شمال', whipRight: 'Whip يمين', whipUp: 'Whip فوق', spin: 'لفّة', glitch: 'جليتش', rgb: 'RGB Split',
  flash: 'فلاش', blur: 'بلور', circle: 'دايرة بتغطي', diagonal: 'مسحة مايلة', bars: 'بارات', liquid: 'سايل (Liquid)', ink: 'حبر'
};
/**
 * The layers of one transition around a cut (t): adjustment-layer moves (zoom, whip, spin, glitch, blur, flash) or
 * shapes that cover the frame and reveal the next shot (circle, diagonal, bars, liquid, ink). d = total length.
 */
function transitionLayers(kind, t, { d = 0.6, comp = { width: 1920, height: 1080 }, color = '#f97316', color2 = '#fbbf24', index = 1 } = {}) {
  const W = comp.width, H = comp.height, a = Math.max(0, t - d / 2), b = t + d / 2, h = d / 2, N = 'EF ' + (TRANSITIONS[kind] ? kind : 'zoomIn') + ' ' + index;
  const adj = (fx, keys, expr) => [{ type: 'adjustment', name: N, start: a, end: b, effects: fx, keys: keys || {}, expressions: expr || {} }];
  const tile = { name: 'motionTile', params: { outputWidth: 300, outputHeight: 300, mirror: 1 } };
  const tf = { match: 'ADBE Geometry2', label: 'EF Transform', params: { 'Use Composition\'s Shutter Angle': 0, 'Shutter Angle': 240 } };
  const at = x => +(x - a).toFixed(3); // keys are from the layer's start
  switch (kind) {
    case 'zoomOut':
    case 'zoomIn': {
      const out = kind === 'zoomIn' ? 400 : 30, inn = kind === 'zoomIn' ? 30 : 400;
      return adj([tile, tf], { 'fx:EF Transform.Scale': [[at(a), 100, 'expoIn'], [at(t), out, 'hold'], [at(t) + 0.001, inn, 'expoOut'], [at(b), 100]] });
    }
    case 'whipLeft': case 'whipRight': case 'whipUp': {
      const dx = kind === 'whipLeft' ? -W : kind === 'whipRight' ? W : 0, dy = kind === 'whipUp' ? -H : 0, C = [W / 2, H / 2];
      return adj([tile, tf, { name: 'directionalBlur', params: { direction: dy ? 0 : 90, length: 0 } }], {
        'fx:EF Transform.Position': [[at(a), C, 'expoIn'], [at(t), [C[0] + dx, C[1] + dy], 'hold'], [at(t) + 0.001, [C[0] - dx, C[1] - dy], 'expoOut'], [at(b), C]],
        'fx:directionalBlur.length': [[at(a), 0, 'expoIn'], [at(t), 120, 'expoOut'], [at(b), 0]] });
    }
    case 'spin':
      return adj([tile, tf], { 'fx:EF Transform.Rotation': [[at(a), 0, 'expoIn'], [at(t), 180, 'hold'], [at(t) + 0.001, -180, 'expoOut'], [at(b), 0]], 'fx:EF Transform.Scale': [[at(a), 100, 'easeInOut'], [at(t), 140, 'easeInOut'], [at(b), 100]] });
    case 'glitch': case 'rgb': {
      const fx = [{ name: 'displace', params: { amount: 0, size: 60 } }, { match: 'ADBE Offset', label: 'EF Offset', params: {} }, { name: 'directionalBlur', params: { direction: 90, length: 0 } }, { name: 'posterizeTime', params: { fps: 12 } }];
      const jump = [], amt = [];
      for (let k = 0, tt = a; tt <= b + 1e-6; k++, tt += d / 8) { SEED = 77 + k * 13 + index; jump.push([at(tt), [W / 2 + (rnd() - 0.5) * W * 0.12, H / 2 + (rnd() - 0.5) * H * 0.06], 'hold']); amt.push([at(tt), k % 2 ? 80 : 20 + rnd() * 60, 'hold']); }
      jump.push([at(b), [W / 2, H / 2], 'hold']); amt.push([at(b), 0, 'hold']);
      const L = adj(fx, { 'fx:displace.amount': amt, 'fx:EF Offset.Shift Center To': jump, 'fx:directionalBlur.length': [[at(a), 0], [at(t), 60, 'hold'], [at(t) + d / 6, 0]] });
      if (kind === 'rgb') L.push({ type: 'adjustment', name: N + ' RGB', start: a, end: b, blend: 'screen', effects: [{ match: 'ADBE Shift Channels', label: 'EF Channels', params: { 'Take Green From': 9, 'Take Blue From': 9 } }, { match: 'ADBE Geometry2', label: 'EF Shift', params: {} }], keys: { 'fx:EF Shift.Position': [[at(a), [W / 2, H / 2], 'easeInOut'], [at(t), [W / 2 + W * 0.02, H / 2], 'easeInOut'], [at(b), [W / 2, H / 2]]] } });
      return L;
    }
    case 'flash':
      return [{ type: 'solid', name: N, start: a, end: b, color: '#ffffff', blend: 'add', keys: { opacity: [[at(a), 0, 'expoIn'], [at(t), 100, 'expoOut'], [at(b), 0]] } }];
    case 'blur':
      return adj([{ name: 'blur', params: { amount: 0 } }], { 'fx:blur.amount': [[at(a), 0, 'expoIn'], [at(t), 90, 'expoOut'], [at(b), 0]] });
    case 'circle':
      return [{ type: 'shape', name: N, start: a, end: b, shape: { kind: 'ellipse', size: [100, 100], fill: color }, transform: { position: ['50%', '50%'] }, keys: { scale: [[at(a), 0, 'expoIn'], [at(t), Math.hypot(W, H) / 100 * 105, 'hold'], [at(t) + 0.04, Math.hypot(W, H) / 100 * 105, 'expoOut'], [at(b), 0]] } }];
    case 'diagonal':
      return [{ type: 'shape', name: N, start: a, end: b, shape: { kind: 'rect', size: [Math.hypot(W, H) * 1.2, Math.hypot(W, H) * 0.8], fill: color }, transform: { rotation: -25 }, keys: { position: [[at(a), [-W * 0.8, H * 1.3], 'expoIn'], [at(t), [W / 2, H / 2], 'expoOut'], [at(b), [W * 1.8, -H * 0.3]]] } }];
    case 'bars':
      return Array.from({ length: 5 }, (_, k) => ({ type: 'shape', name: N + ' Bar ' + (k + 1), start: a, end: b, shape: { kind: 'rect', size: [W * 1.05, H / 5 + 2], fill: k % 2 ? color2 : color }, keys: { position: [[at(a) + k * h * 0.12, [-W * 0.6, H * (k + 0.5) / 5], 'expoIn'], [at(t), [W / 2, H * (k + 0.5) / 5], 'hold'], [at(t) + k * h * 0.12, [W / 2, H * (k + 0.5) / 5], 'expoOut'], [at(b), [W * 1.6, H * (k + 0.5) / 5]]] } }));
    case 'liquid': case 'ink':
      return [0, 1, 2].map(k => ({ type: 'shape', name: N + ' ' + (k + 1), start: a + k * h * 0.15, end: b, shape: { items: [{ paths: [blob(80 + k + index, 200, { irregular: kind === 'ink' ? 0.35 : 0.2 })] }], fill: [color, color2, '#ffffff'][k] === '#ffffff' ? color : [color, color2, color][k] },
        transform: { position: [W * (0.3 + k * 0.2), H * (0.4 + k * 0.1)] }, effects: kind === 'ink' ? [{ name: 'displace', params: { amount: 50, size: 80 } }] : [],
        keys: { scale: [[0, 0, 'expoIn'], [Math.max(0.05, at(t) - k * h * 0.15), Math.hypot(W, H) / 200 * 120, 'hold'], [Math.max(0.06, at(t) - k * h * 0.15) + 0.03, Math.hypot(W, H) / 200 * 120, 'expoOut'], [at(b) - k * h * 0.15, 0]] } }));
  }
  return transitionLayers('zoomIn', t, { d, comp, color, color2, index });
}

module.exports = { sliderUnit, PATH_LOOP, FORMAT_SRC, efFmt, CURRENCIES, FORMATS, COUNTER_STYLES, counterOptions, formatNumber, counterExpr, counterLayers, CHARTS, PALETTE, parseTable, chartScene, LIQUID, blob, liquidLayers, waveExpr, TRANSITIONS, transitionLayers };

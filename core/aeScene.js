'use strict';
// المونتير الذكي في أفتر: "وصف المشهد" اللي الـ AI بيكتبه (ليرز + كي فريمز + إفكتات + منحنيات + مسارات + ماسكات + بري كومب)
// — بيتراجع هنا ويتحوّل لحاجة الأفتر يبنيها ليرز عادية تتعدّل. الـ AI عمره ما بيكتب كود بيتشغّل في الأفتر.
const curves = require('./curves');
const svg = require('./svgPath');
const character = require('./character');
const motionKit = require('./motionKit');

/**
 * Effects the AI may use by a friendly name: AE matchName + its parameters (a param is a matchName, or the English
 * display name the host finds by walking the effect). Any other installed effect works raw: {"match": "...", "params": {"Display Name": v}}.
 */
const EFFECTS = {
  blur: { match: 'ADBE Gaussian Blur 2', params: { amount: 'ADBE Gaussian Blur 2-0001' } },
  glow: { match: 'ADBE Glo2', params: { threshold: 'ADBE Glo2-0002', radius: 'ADBE Glo2-0003', intensity: 'ADBE Glo2-0004' } },
  shadow: { match: 'ADBE Drop Shadow', params: { color: 'ADBE Drop Shadow-0001', opacity: 'ADBE Drop Shadow-0002', direction: 'ADBE Drop Shadow-0003', distance: 'ADBE Drop Shadow-0004', softness: 'ADBE Drop Shadow-0005' } },
  fill: { match: 'ADBE Fill', params: { color: 'ADBE Fill-0002' } },
  gradient: { match: 'ADBE Ramp', params: { start: 'ADBE Ramp-0001', startColor: 'ADBE Ramp-0002', end: 'ADBE Ramp-0003', endColor: 'ADBE Ramp-0004', shape: 'ADBE Ramp-0005' } },
  tint: { match: 'ADBE Tint', params: { black: 'ADBE Tint-0001', white: 'ADBE Tint-0002', amount: 'ADBE Tint-0003' } },
  tritone: { match: 'ADBE Tritone', params: { highlights: 'Highlights', midtones: 'Midtones', shadows: 'Shadows', blend: 'Blend With Original' } },
  directionalBlur: { match: 'ADBE Motion Blur', params: { direction: 'ADBE Motion Blur-0001', length: 'ADBE Motion Blur-0002' } },
  radialBlur: { match: 'CC Radial Fast Blur', params: { center: 'Center', amount: 'Amount' } },
  displace: { match: 'ADBE Turbulent Displace', params: { amount: 'ADBE Turbulent Displace-0002', size: 'ADBE Turbulent Displace-0003', evolution: 'Evolution' } },
  waveWarp: { match: 'ADBE Wave Warp', params: { height: 'Wave Height', width: 'Wave Width', speed: 'Wave Speed' } },
  noise: { match: 'ADBE Noise', params: { amount: 'ADBE Noise-0001' } },
  fractalNoise: { match: 'ADBE Fractal Noise', params: { contrast: 'Contrast', brightness: 'Brightness', complexity: 'Complexity', evolution: 'Evolution', scale: 'Scale' } },
  lightSweep: { match: 'CC Light Sweep', params: { center: 'Center', direction: 'Direction', width: 'Width', intensity: 'Sweep Intensity' } },
  lightRays: { match: 'CC Light Rays', params: { intensity: 'Intensity', center: 'Center', radius: 'Radius' } },
  lensFlare: { match: 'ADBE Lens Flare', params: { center: 'Flare Center', brightness: 'Flare Brightness' } },
  linearWipe: { match: 'ADBE Linear Wipe', params: { completion: 'Transition Completion', angle: 'Wipe Angle', feather: 'Feather' } },
  radialWipe: { match: 'ADBE Radial Wipe', params: { completion: 'Transition Completion', angle: 'Start Angle', feather: 'Feather' } },
  venetianBlinds: { match: 'ADBE Venetian Blinds', params: { completion: 'Transition Completion', direction: 'Direction', width: 'Width' } },
  echo: { match: 'ADBE Echo', params: { time: 'Echo Time (seconds)', count: 'Number Of Echoes', decay: 'Decay' } },
  posterizeTime: { match: 'ADBE Posterize Time', params: { fps: 'Frame Rate' } },
  exposure: { match: 'ADBE Exposure2', params: { exposure: 'Exposure' } },
  brightness: { match: 'ADBE Brightness & Contrast 2', params: { brightness: 'Brightness', contrast: 'Contrast' } },
  vibrance: { match: 'ADBE Vibrance', params: { vibrance: 'Vibrance', saturation: 'Saturation' } },
  slider: { match: 'ADBE Slider Control', params: { value: 'ADBE Slider Control-0001' } },
  checkbox: { match: 'ADBE Checkbox Control', params: { value: 'ADBE Checkbox Control-0001' } },
  angle: { match: 'ADBE Angle Control', params: { value: 'ADBE Angle Control-0001' } },
  colorControl: { match: 'ADBE Color Control', params: { color: 'ADBE Color Control-0001' } },
  pointControl: { match: 'ADBE Point Control', params: { point: 'ADBE Point Control-0001' } },
  cornerPin: { match: 'ADBE Corner Pin', params: { topLeft: 'ADBE Corner Pin-0001', topRight: 'ADBE Corner Pin-0002', bottomLeft: 'ADBE Corner Pin-0003', bottomRight: 'ADBE Corner Pin-0004' } },
  motionTile: { match: 'ADBE Tile', params: { outputWidth: 'Output Width', outputHeight: 'Output Height', mirror: 'Mirror Edges' } }
};
const TYPES = ['text', 'shape', 'solid', 'adjustment', 'null', 'footage', 'camera', 'light', 'precomp', 'particles', 'character', 'plexus', 'counter', 'chart', 'liquid'];
const PROPS = ['position', 'scale', 'rotation', 'opacity', 'anchor', 'rotationX', 'rotationY', 'orientation'];
const SHAPE_PROPS = ['trimStart', 'trimEnd', 'trimOffset', 'fillColor', 'fillOpacity', 'strokeColor', 'strokeWidth', 'size', 'roundness', 'path',
  'repeaterCopies', 'repeaterOffset', 'repeaterPosition', 'repeaterScale', 'repeaterRotation', 'outerRadius', 'innerRadius', 'starRotation', 'groupPosition', 'groupScale', 'groupRotation'];
const MASK_PROPS = ['path', 'feather', 'expansion', 'opacity'];
const GEOMETRY_PROPS = ['depth', 'bevelDepth', 'bevelStyle'];
const CAMERA_PROPS = ['zoom', 'focusDistance', 'aperture', 'blurLevel', 'dof'];
const LIGHT_PROPS = ['intensity', 'color', 'coneAngle', 'coneFeather', 'castsShadows'];
const BLEND = ['normal', 'add', 'screen', 'multiply', 'overlay', 'softLight', 'colorDodge', 'lighten', 'darken', 'difference'];
const MATTES = ['alpha', 'alphaInverted', 'luma', 'lumaInverted'];
const MASK_MODES = ['add', 'subtract', 'intersect', 'difference', 'none'];
const TEXT_PRESETS = ['fadeUp', 'typewriter', 'blurIn', 'scalePop', 'slideIn', 'tracking', 'rotateIn', 'dropIn'];
const PARTICLES = ['dust', 'snow', 'embers', 'sparks', 'confetti', 'bokeh', 'stars'];
const EASES = Object.keys(curves.PRESETS).filter(k => curves.PRESETS[k].fn.bezier).concat(['hold', 'linear']);
// expressions: a few safe building blocks only (no file / system access ever reaches AE)
const BAD_EXPR = /system|callSystem|\$\.|File\(|Folder\(|eval\s*\(|app\.|Socket|\$\[/;
const MATCH_RE = /^[\w .&()'+-]{2,80}$/;

function hex(c, def = [1, 1, 1, 1]) {
  if (Array.isArray(c)) return [+c[0] || 0, +c[1] || 0, +c[2] || 0, c[3] === undefined ? 1 : +c[3]];
  const s = String(c || '').trim();
  let m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) { const m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s); if (m3) m = [0, m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]]; }
  if (!m) return def;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
const isColor = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function bz(ease) {
  if (Array.isArray(ease) && ease.length === 4) return ease.map(Number);
  const p = curves.PRESETS[ease];
  return p && p.fn.bezier ? p.fn.bezier : null;
}

/** a path value: svg "M…", points [[x,y]…], {points, smooth, closed} or an already-made path → AE path */
function pathValue(v, comp, { center = false, size = null } = {}) {
  let paths;
  if (v && v.v && v.i && v.o) paths = [v];
  else if (typeof v === 'string') paths = svg.parse(v);
  else if (Array.isArray(v)) paths = [svg.fromPoints(v.map(p => vec(p, comp)), {})];
  else if (v && Array.isArray(v.points)) paths = [svg.fromPoints(v.points.map(p => vec(p, comp)), { closed: !!v.closed, smooth: !!v.smooth })];
  else if (v && (v.svg || v.d)) paths = svg.parse(v.svg || v.d);
  else return null;
  paths = (paths || []).filter(p => p.v.length > 1);
  if (!paths.length) return null;
  return center ? svg.fit(paths, size) : paths;
}

/**
 * A property key the scene may set / animate → its canonical form, or null if unknown:
 * transform names · shape:<prop> · mask:<n>.<prop> · camera:<prop> · light:<prop> · fx:<effect>.<param>
 */
function keyTarget(k, effects) {
  if (PROPS.indexOf(k) >= 0) return { key: k, kind: k };
  if (k === 'text') return { key: 'text', kind: 'text' };
  let m = /^shape:(\w+)$/.exec(k);
  if (m && SHAPE_PROPS.indexOf(m[1]) >= 0) return { key: k, kind: 'shape:' + m[1] };
  m = /^shape:path\.(\d+)$/.exec(k);
  if (m && +m[1] >= 1 && +m[1] <= 400) return { key: k, kind: 'shape:path' };
  m = /^geometry:(\w+)$/.exec(k);
  if (m && GEOMETRY_PROPS.indexOf(m[1]) >= 0) return { key: k, kind: k };
  m = /^mask:(\d+)\.(\w+)$/.exec(k);
  if (m && MASK_PROPS.indexOf(m[2]) >= 0 && +m[1] >= 1 && +m[1] <= 10) return { key: k, kind: 'mask:' + m[2] };
  m = /^camera:(\w+)$/.exec(k);
  if (m && CAMERA_PROPS.indexOf(m[1]) >= 0) return { key: k, kind: k };
  m = /^light:(\w+)$/.exec(k);
  if (m && LIGHT_PROPS.indexOf(m[1]) >= 0) return { key: k, kind: k };
  if (k.indexOf('fx:') === 0) {
    const body = k.slice(3), dot = body.lastIndexOf('.');
    if (dot < 1) return null;
    const fxName = body.slice(0, dot), param = body.slice(dot + 1);
    const labelled = effects && effects.find(e => e.label && e.label === fxName);
    if (labelled) {
      const ldef = Object.values(EFFECTS).find(d => d.match === labelled.match);
      const pm = ldef && ldef.params[param] ? ldef.params[param] : (MATCH_RE.test(param) ? param : null);
      return pm ? { key: 'fxl:' + labelled.label + '|' + pm, kind: 'fx' } : null;
    }
    const def = EFFECTS[fxName];
    if (def) {
      if (!def.params[param]) return null;
      if (effects && !effects.some(e => e.match === def.match)) effects.push({ name: fxName, match: def.match, params: {} });
      return { key: 'fx:' + def.match + '|' + def.params[param], kind: 'fx' };
    }
    // a raw / plugin effect already on the layer (by match name)
    if (MATCH_RE.test(fxName) && MATCH_RE.test(param) && effects && effects.some(e => e.match === fxName)) return { key: 'fx:' + fxName + '|' + param, kind: 'fx' };
    return null;
  }
  return null;
}
/** a value for a target kind */
function valueFor(kind, v, comp, threeD, ctx = {}) {
  if (kind === 'position' || kind === 'anchor') return vec(v, comp, threeD ? 3 : 2);
  if (kind === 'orientation') return vec(v, comp, 3);
  if (kind === 'scale') { const a = Array.isArray(v) ? v : [v, v, v]; return threeD ? [+a[0], +a[1], +(a[2] === undefined ? a[0] : a[2])] : [+a[0], +(a[1] === undefined ? a[0] : a[1])]; }
  if (kind === 'shape:fillColor' || kind === 'shape:strokeColor' || kind === 'light:color') return hex(v);
  if (kind === 'shape:path') { const p = pathValue(v, comp, { center: true, size: ctx.size }); return p ? p[0] : null; }
  if (kind === 'mask:path') { const p = pathValue(v, comp); return p ? p[0] : null; }
  if (kind === 'mask:feather') return Array.isArray(v) ? [+v[0], +(v[1] === undefined ? v[0] : v[1])] : [+v, +v];
  if (/^shape:(size|groupPosition|repeaterPosition)$/.test(kind)) return vec(v, comp);
  if (/^shape:(groupScale|repeaterScale)$/.test(kind)) { const a = Array.isArray(v) ? v : [v, v]; return [+a[0], +(a[1] === undefined ? a[0] : a[1])]; }
  if (kind === 'fx') {
    if (isColor(v)) return hex(v);
    if (Array.isArray(v)) return v.length === 4 && v.every(x => typeof x === 'number' && x <= 1) ? v.map(Number) : vec(v, comp, v.length > 2 ? 3 : 2);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return +v;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return +v;
}
function effectList(list, comp, warnings) {
  const out = [];
  for (const fx of (list || []).slice(0, 20)) {
    if (!fx) continue;
    const def = EFFECTS[fx.name];
    if (def) {
      const params = {};
      for (const k of Object.keys(fx.params || {})) {
        if (def.params[k]) params[def.params[k]] = valueFor('fx', fx.params[k], comp);
        else warnings.push('باراميتر مش معروف: ' + fx.name + '.' + k);
      }
      out.push({ name: fx.name, match: def.match, params, label: fx.label ? String(fx.label).slice(0, 40) : undefined });
    } else if (fx.match && MATCH_RE.test(String(fx.match))) {
      const params = {};
      for (const k of Object.keys(fx.params || {}).slice(0, 30)) if (MATCH_RE.test(k)) params[k] = valueFor('fx', fx.params[k], comp);
      out.push({ name: 'raw', match: String(fx.match), params, label: fx.label ? String(fx.label).slice(0, 40) : undefined });
    } else warnings.push('إفكت مش متاح: ' + (fx.name || fx.match));
  }
  return out;
}
function keyList(raw, kind, comp, threeD, ctx) {
  const list = (raw || []).map(x => Array.isArray(x) ? { t: x[0], v: x[1], ease: x[2] } : x).filter(x => x && isFinite(+x.t));
  list.sort((a, b) => a.t - b.t);
  return list.slice(0, 80).map(x => {
    const e = x.ease || 'easeInOut';
    const v = valueFor(kind, x.v, comp, threeD, ctx);
    return v === null ? null : { t: Math.max(0, +x.t), v, bz: e === 'hold' || e === 'linear' ? null : bz(e), hold: e === 'hold' };
  }).filter(Boolean);
}

/** shape contents: one or more items (rect / ellipse / star / polygon / path) sharing fill, stroke, trim paths, repeater */
function shapeSpec(s, comp, warnings) {
  s = s || {};
  const items = [];
  const src = Array.isArray(s.items) && s.items.length ? s.items : [s];
  for (const it of src.slice(0, 30)) {
    const kind = ['rect', 'ellipse', 'star', 'polygon', 'path'].indexOf(it.kind) >= 0 ? it.kind : (it.path || it.svg || it.points ? 'path' : 'rect');
    const pos = it.position !== undefined ? vec(it.position, comp) : null;
    if (Array.isArray(it.paths)) {
      // ready-made paths (traced / imported art): kept as they are, only checked
      const ok = it.paths.filter(p => p && Array.isArray(p.v) && p.v.length > 1 && Array.isArray(p.i) && Array.isArray(p.o) && p.i.length === p.v.length && p.o.length === p.v.length && p.v.concat(p.i, p.o).every(q => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1])))
        .slice(0, 400).map(p => ({ v: p.v.map(q => [+q[0], +q[1]]), i: p.i.map(q => [+q[0], +q[1]]), o: p.o.map(q => [+q[0], +q[1]]), c: !!p.c }));
      if (!ok.length) { warnings.push('مسار مش مفهوم'); continue; }
      items.push({ kind: 'path', paths: ok, position: pos });
      continue;
    }
    if (kind === 'path') {
      const paths = pathValue(it.path || it.svg ? (it.path || it.svg) : { points: it.points, closed: it.closed, smooth: it.smooth }, comp, { center: true, size: it.size ? vec(it.size, comp) : (src.length === 1 && s.size ? vec(s.size, comp) : null) });
      if (!paths) { warnings.push('مسار مش مفهوم'); continue; }
      items.push({ kind, paths, position: pos });
    } else {
      const size = vec(it.size || s.size || [400, 200], comp);
      items.push({ kind, size, round: Math.max(0, +it.round || 0), points: clamp(+it.points || 5, 3, 40), outer: +it.outer || size[0] / 2, inner: +it.inner || size[0] / 4, position: pos });
    }
  }
  const open = items.length && items.every(it => it.kind === 'path' && it.paths.every(p => !p.c));
  const o = { items };
  const fill = s.fill === undefined ? (open ? null : '#f97316') : s.fill;
  if (fill) o.fill = hex(fill);
  if (s.fillRule === 'evenodd') o.fillRule = 2;
  if (s.stroke || (open && !fill)) { o.stroke = hex(s.stroke || '#ffffff'); o.strokeWidth = clamp(+s.strokeWidth || 6, 0.5, 400); }
  if (s.lineCap) o.lineCap = { butt: 1, round: 2, square: 3 }[s.lineCap] || 2;
  else if (s.trim) o.lineCap = 2;
  if (s.dash) o.dash = clamp(+s.dash, 1, 2000);
  if (s.trim) o.trim = { start: clamp(+s.trim.start || 0, 0, 100), end: clamp(s.trim.end === undefined ? 100 : +s.trim.end, 0, 100), offset: +s.trim.offset || 0, mode: s.trim.individually ? 2 : 1 };
  if (s.repeater) {
    const r = s.repeater;
    o.repeater = { copies: clamp(+r.copies || 3, 1, 200), offset: +r.offset || 0, position: r.position !== undefined ? vec(r.position, comp) : [100, 0], scale: r.scale !== undefined ? valueFor('shape:repeaterScale', r.scale, comp) : [100, 100], rotation: +r.rotation || 0, startOpacity: r.startOpacity === undefined ? 100 : +r.startOpacity, endOpacity: r.endOpacity === undefined ? 100 : +r.endOpacity };
  }
  return o;
}
function masksSpec(list, comp, warnings) {
  const out = [];
  for (const m of (list || []).slice(0, 10)) {
    if (!m) continue;
    let path = null;
    if (m.rect) { const r = m.rect, xy = vec([r[0], r[1]], comp), wh = vec([r[2], r[3]], comp); path = svg.rect(xy[0], xy[1], wh[0], wh[1]); }
    else if (m.ellipse) { const e = m.ellipse, c = vec([e[0], e[1]], comp), wh = vec([e[2], e[3]], comp); path = svg.ellipse(c[0], c[1], wh[0], wh[1]); }
    else { const p = pathValue(m.path || m.points ? (m.path || { points: m.points, closed: true, smooth: m.smooth }) : null, comp); path = p && p[0]; if (path) path.c = true; }
    if (!path) { warnings.push('ماسك من غير شكل'); continue; }
    out.push({ path, mode: MASK_MODES.indexOf(m.mode) >= 0 ? m.mode : 'add', feather: valueFor('mask:feather', m.feather || 0, comp), expansion: +m.expansion || 0, opacity: m.opacity === undefined ? 100 : +m.opacity, inverted: !!m.inverted });
  }
  return out;
}

/** particles → a precomp of small shape layers moved by expressions (works in every AE, no plugin) */
function particleLayers(L, comp) {
  const P = PARTICLES.indexOf(L.preset) >= 0 ? L.preset : 'dust';
  const n = clamp(Math.round(+L.count || { dust: 40, snow: 50, embers: 35, sparks: 40, confetti: 45, bokeh: 18, stars: 50 }[P]), 1, 80);
  const W = comp.width, H = comp.height;
  const colors = (Array.isArray(L.colors) ? L.colors : [L.color || { snow: '#ffffff', embers: '#fb923c', sparks: '#fde68a', confetti: '#f97316', bokeh: '#fdba74', stars: '#ffffff' }[P] || '#ffffff']).slice(0, 6);
  if (P === 'confetti' && !L.colors && !L.color) colors.push('#fbbf24', '#ffffff', '#22c55e', '#3b82f6');
  const sz = Array.isArray(L.size) ? L.size : [+L.size || { dust: 3, snow: 6, embers: 4, sparks: 3, confetti: 10, bokeh: 60, stars: 3 }[P], (+L.size || { dust: 3, snow: 6, embers: 4, sparks: 3, confetti: 10, bokeh: 60, stars: 3 }[P]) * 2.5];
  const speed = +L.speed || { dust: 20, snow: 90, embers: 70, sparks: 700, confetti: 500, bokeh: 15, stars: 0 }[P];
  const at = +L.burstAt || 0, origin = L.origin !== undefined ? vec(L.origin, comp) : [W / 2, H / 2];
  const life = +L.life || 2.5;
  const R = `seedRandom(index,true);`;
  const exprs = {
    dust: { position: `${R}var x=random(0,${W}),y=random(0,${H}),a=random(0,6.28),v=random(${speed * 0.5},${speed});[(x+Math.sin(time*0.4+a)*40+${W})%${W},((y-time*v)%${H}+${H})%${H}]`, opacity: `${R}var b=random(20,70);b+Math.sin(time*random(1,3)+index)*20` },
    snow: { position: `${R}var x=random(0,${W}),y=random(0,${H}),v=random(${speed * 0.5},${speed});[x+Math.sin(time+index)*30,((y+time*v)%${H}+${H})%${H}]`, opacity: `${R}random(60,100)` },
    embers: { position: `${R}var x=random(0,${W}),y=random(0,${H}),v=random(${speed * 0.5},${speed});[x+Math.sin(time*2+index)*25,((y-time*v)%${H}+${H})%${H}]`, opacity: `${R}var f=random(2,6);50+Math.sin(time*f+index)*50` },
    sparks: { position: `${R}var a=random(0,6.28),v=random(${speed * 0.4},${speed}),t=Math.max(0,time-${at});[${origin[0]}+Math.cos(a)*v*t,${origin[1]}+Math.sin(a)*v*t+400*t*t]`, opacity: `${R}var t=time-${at};t<0?0:linear(t,0,random(${life * 0.4},${life}),100,0)` },
    confetti: { position: `${R}var a=random(-2.6,-0.5),v=random(${speed * 0.5},${speed}),t=Math.max(0,time-${at});[${origin[0]}+Math.cos(a)*v*t+Math.sin(t*4+index)*20,${origin[1]}+Math.sin(a)*v*t+600*t*t]`, opacity: `time<${at}?0:linear(time-${at},${life * 0.7},${life},100,0)`, rotation: `${R}time*random(-400,400)` },
    bokeh: { position: `${R}var x=random(0,${W}),y=random(0,${H});[x+Math.sin(time*0.3+index)*60,y+Math.cos(time*0.25+index)*40]`, opacity: `${R}var b=random(15,45);b+Math.sin(time*random(0.5,1.5)+index)*12` },
    stars: { position: `${R}[random(0,${W}),random(0,${H})]`, opacity: `${R}var f=random(1,4);40+Math.sin(time*f+index*3)*40` }
  }[P];
  exprs.scale = `${R}var s=random(${sz[0]},${sz[1]})/${sz[0]}*100;[s,s]`;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ type: 'shape', name: 'Particle ' + (i + 1), shape: { kind: P === 'confetti' ? 'rect' : P === 'stars' ? 'star' : 'ellipse', size: P === 'confetti' ? [sz[0], sz[0] * 0.5] : [sz[0], sz[0]], points: 4, fill: colors[i % colors.length] }, blend: P === 'bokeh' || P === 'embers' || P === 'sparks' ? 'add' : 'normal', expressions: exprs });
  }
  const fx = { embers: [{ name: 'glow', params: { radius: 20, intensity: 1.5 } }], sparks: [{ name: 'glow', params: { radius: 15, intensity: 2 } }], bokeh: [{ name: 'blur', params: { amount: 18 } }], stars: [{ name: 'glow', params: { radius: 10, intensity: 1 } }] }[P] || [];
  return { layers: out, effects: fx, blend: P === 'snow' || P === 'confetti' ? 'normal' : 'screen' };
}

/** plexus: drifting points + lines that fade in when two points are close (all expressions, in a precomp) */
function plexusLayer(L, comp) {
  const n = clamp(Math.round(+L.count || 16), 4, 24), W = comp.width, H = comp.height, maxD = +L.distance || Math.min(W, H) * 0.28, col = L.color || '#fdba74';
  const pt = i => JSON.stringify('P' + (i + 1));
  const layers = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    layers.push({ type: 'shape', name: 'Line ' + (i + 1) + '-' + (j + 1), transform: { position: [0, 0] }, shape: { kind: 'path', path: 'M0 0 L1 1', fill: null, stroke: col, strokeWidth: +L.lineWidth || 1.5 },
      expressions: { 'shape:path': `var a=fromComp(thisComp.layer(${pt(i)}).transform.position),b=fromComp(thisComp.layer(${pt(j)}).transform.position);createPath([a,b],[],[],false)`,
        opacity: `var d=length(thisComp.layer(${pt(i)}).transform.position,thisComp.layer(${pt(j)}).transform.position);d<${maxD.toFixed(0)}?linear(d,0,${maxD.toFixed(0)},90,0):0` } });
  }
  for (let i = 0; i < n; i++) layers.push({ type: 'shape', name: 'P' + (i + 1), shape: { kind: 'ellipse', size: [+L.size || 8, +L.size || 8], fill: col },
    expressions: { position: `seedRandom(index,true);var x=random(${W * 0.05},${W * 0.95}),y=random(${H * 0.05},${H * 0.95}),a=random(0,6.28),s=random(0.2,0.6)*${+L.speed || 1};[x+Math.sin(time*s+a)*${(W * 0.08).toFixed(0)},y+Math.cos(time*s*0.8+a)*${(H * 0.08).toFixed(0)}]` } });
  return { type: 'precomp', name: L.name || 'Plexus', start: L.start, end: L.end, transform: L.transform, keys: L.keys, blend: L.blend || 'screen', comp: { duration: comp.duration }, layers, effects: (L.effects || []).concat([{ name: 'glow', params: { radius: 12, intensity: 0.8 } }]) };
}

/**
 * The AI's scene → what the AE host builds. Unknown things are dropped (never sent), numbers clamped,
 * colours → [r,g,b,a], "%" → pixels, eases → cubic-bezier, svg → AE paths. → { spec, warnings }
 */
function normalize(raw, compInfo = {}) {
  const warnings = [];
  const c = raw && raw.comp ? raw.comp : {};
  const comp = {
    create: !!(raw && raw.comp && (raw.comp.create !== false)) || !compInfo.width,
    name: String(c.name || 'EditFast Scene').slice(0, 60),
    width: Math.round(clamp(+c.width || compInfo.width || 1920, 64, 7680)),
    height: Math.round(clamp(+c.height || compInfo.height || 1080, 64, 4320)),
    fps: clamp(+c.fps || compInfo.fps || 30, 1, 120),
    duration: clamp(+c.duration || compInfo.duration || 8, 0.5, 600),
    bg: c.bg ? hex(c.bg) : null
  };
  if (c.renderer === '3d' || (raw && (raw.layers || []).some(l => l && l.extrude))) comp.renderer = '3d';
  const ctx = { layers: 0, keys: 0, warnings };
  const layers = layerList((raw && raw.layers) || [], comp, ctx, 0);
  return { spec: { comp, layers }, warnings };
}
function layerList(list, comp, ctx, depth) {
  const out = [];
  for (const L of list) {
    if (ctx.layers >= 250) { ctx.warnings.push('أكتر من 250 لير — الباقي اتساب'); break; }
    if (ctx.keys > 5000) { ctx.warnings.push('كي فريمز كتير قوي — اتقلّلت'); break; }
    if (!L || TYPES.indexOf(L.type) < 0) { ctx.warnings.push('نوع لير مش معروف: ' + (L && L.type)); continue; }
    // generated groups: a rigged character (plain layers) / a plexus (precomp)
    if (L.type === 'character') { out.push(...layerList(character.flatCharacter(L, comp), comp, ctx, depth)); continue; }
    if (L.type === 'plexus') { out.push(...layerList([plexusLayer(L, comp)], comp, ctx, depth)); continue; }
    if (L.type === 'counter') { out.push(...layerList(motionKit.counterLayers(Object.assign({}, L, { layerStart: L.start, layerEnd: L.end }), comp), comp, ctx, depth)); continue; }
    if (L.type === 'liquid') { out.push(...layerList(motionKit.liquidLayers(Object.assign({}, L, { position: L.position ? vec(L.position, comp) : undefined }), comp), comp, ctx, depth)); continue; }
    if (L.type === 'chart') {
      let ch; try { ch = motionKit.chartScene(L, comp); } catch (e) { ctx.warnings.push(e.message); continue; }
      out.push(...layerList([{ type: 'precomp', name: L.name || 'Chart', start: L.start, end: L.end, transform: L.transform, keys: L.keys, comp: { duration: ch.comp.duration }, layers: ch.layers }], comp, ctx, depth)); continue;
    }
    const made = layerSpec(L, comp, ctx, depth);
    for (const m of made) { out.push(m); ctx.layers++; }
  }
  return out;
}
/** one layer of the scene (a gradient shape comes back as the shape + its gradient under it) */
function layerSpec(L, comp, ctx, depth) {
  const warnings = ctx.warnings;
  const threeD = !!L.threeD || L.type === 'camera' || L.type === 'light';
  const o = { type: L.type, name: String(L.name || L.type).slice(0, 60), threeD, start: Math.max(0, +L.start || 0), end: L.end === undefined || L.end === null ? null : Math.max(0, +L.end) };
  if (L.parent) o.parent = String(L.parent);
  if (L.blend && BLEND.indexOf(L.blend) >= 0) o.blend = L.blend;
  if (L.motionBlur) o.motionBlur = true;
  if (L.matte && L.matte.layer) o.matte = { layer: String(L.matte.layer), type: MATTES.indexOf(L.matte.type) >= 0 ? L.matte.type : 'alpha' };
  o.effects = effectList(L.effects, comp, warnings);
  const extra = [];
  if (L.type === 'text') {
    o.text = String(L.text === undefined ? 'نص' : L.text).slice(0, 600);
    o.size = clamp(+L.size || 80, 4, 1500); o.color = hex(L.color || '#ffffff');
    if (L.font) o.font = String(L.font).slice(0, 80);
    o.align = ['left', 'center', 'right'].indexOf(L.align) >= 0 ? L.align : 'center';
    if (L.tracking) o.tracking = +L.tracking;
    if (L.leading) o.leading = +L.leading;
    if (L.allCaps) o.allCaps = true;
    if (L.stroke) { o.stroke = hex(L.stroke); o.strokeWidth = clamp(+L.strokeWidth || 2, 0, 100); }
    if (L.counter && isFinite(+L.counter.to)) {
      // a counting number = slider "Count" (keyed from → to) + the formatted Source Text expression
      const C = L.counter, from = +C.from || 0, t0 = Math.max(0, (C.start === undefined ? o.start : +C.start) - o.start);
      L = Object.assign({}, L, { effects: (L.effects || []).concat([{ name: 'slider', label: 'Count', params: { value: from } }]),
        keys: Object.assign({}, L.keys, { 'fx:Count.value': [[t0, from, C.ease || 'expoOut'], [t0 + Math.max(0.1, +C.duration || 2), +C.to]] }),
        expressions: Object.assign({}, L.expressions, { text: motionKit.counterExpr(C) }) });
      o.effects = effectList(L.effects, comp, warnings);
    }
    const anims = [].concat(L.textAnimators || [], L.textAnimator ? [L.textAnimator] : [], L.textOut ? [Object.assign({ out: true }, L.textOut)] : []);
    o.textAnimators = anims.slice(0, 4).filter(a => a).map(a => ({ preset: TEXT_PRESETS.indexOf(a.preset) >= 0 ? a.preset : 'fadeUp', by: ['chars', 'words', 'lines'].indexOf(a.by) >= 0 ? a.by : 'chars', duration: clamp(+a.duration || 1, 0.05, 30), start: a.start === undefined ? (a.out && o.end ? o.end - (+a.duration || 1) : o.start) : +a.start, out: !!a.out }));
  }
  if (L.type === 'shape') {
    o.shape = shapeSpec(L.shape, comp, warnings);
    if (!o.shape.items.length) { warnings.push('شكل فاضي: ' + o.name); return []; }
    const g = L.shape && L.shape.gradient;
    if (g && Array.isArray(g.colors) && g.colors.length >= 2) {
      // a gradient fill = a gradient solid matted by the shape (scripts can't set gradient-fill colours)
      const from = g.from !== undefined ? vec(g.from, comp) : [0, comp.height / 2], to = g.to !== undefined ? vec(g.to, comp) : [comp.width, comp.height / 2];
      extra.push({ type: 'solid', name: o.name + ' Gradient', threeD: false, start: o.start, end: o.end, color: hex('#000000'), transform: {}, keys: {}, expressions: {}, masks: [],
        effects: [{ name: 'gradient', match: EFFECTS.gradient.match, params: { 'ADBE Ramp-0001': from, 'ADBE Ramp-0002': hex(g.colors[0]), 'ADBE Ramp-0003': to, 'ADBE Ramp-0004': hex(g.colors[g.colors.length - 1]), 'ADBE Ramp-0005': g.type === 'radial' ? 2 : 1 } }],
        matte: { layer: o.name, type: 'alpha' }, blend: o.blend });
    }
  }
  if (L.type === 'solid' || L.type === 'adjustment') o.color = hex(L.color || (L.type === 'adjustment' ? '#ffffff' : '#000000'));
  if (L.type === 'footage') {
    if (!L.file) { warnings.push('فوتيج من غير ملف'); return []; }
    o.file = String(L.file); o.srcIn = Math.max(0, +L.srcIn || 0); o.cover = L.cover !== false;
  }
  if (L.type === 'light') o.lightType = ['spot', 'point', 'parallel', 'ambient'].indexOf(L.lightType) >= 0 ? L.lightType : 'point';
  if (L.type === 'precomp' || L.type === 'particles') {
    if (depth >= 3) { warnings.push('بري كومب جوه بري كومب أكتر من 3 مرات'); return []; }
    const sub = L.comp || {};
    o.comp = { renderer: sub.renderer === '3d' || (L.layers || []).some(l => l && l.extrude) ? '3d' : undefined, name: String(sub.name || o.name).slice(0, 60), width: Math.round(clamp(+sub.width || comp.width, 16, 7680)), height: Math.round(clamp(+sub.height || comp.height, 16, 4320)), fps: comp.fps, duration: clamp(+sub.duration || (o.end ? o.end - o.start : comp.duration), 0.1, 600), bg: sub.bg ? hex(sub.bg) : null };
    if (L.type === 'particles') {
      const p = particleLayers(L, o.comp);
      o.layers = layerList(p.layers, o.comp, ctx, depth + 1);
      o.effects = effectList(p.effects, comp, warnings).concat(o.effects);
      if (!o.blend) o.blend = p.blend;
      o.type = 'precomp'; o.particles = L.preset || 'dust';
    } else o.layers = layerList(L.layers || [], o.comp, ctx, depth + 1);
    if (L.collapse) o.collapse = true;
  }
  o.masks = masksSpec(L.masks, comp, warnings);
  const shapeSize = o.shape && o.shape.items[0] && o.shape.items[0].paths ? (L.shape && L.shape.size ? vec(L.shape.size, comp) : null) : null;
  // still values: transform names and every other target (shape:…, mask:…, camera:…, light:…, fx:…)
  o.transform = {};
  const sets = Object.assign({}, L.transform || {});
  if (L.camera) for (const k of Object.keys(L.camera)) sets['camera:' + k] = L.camera[k];
  if (L.light) for (const k of Object.keys(L.light)) sets['light:' + k] = L.light[k];
  if (L.extrude && (L.type === 'shape' || L.type === 'text')) {
    o.threeD = true;
    sets['geometry:depth'] = L.extrude.depth === undefined ? 40 : L.extrude.depth;
    if (L.extrude.bevel) { sets['geometry:bevelDepth'] = L.extrude.bevel; sets['geometry:bevelStyle'] = { angular: 2, concave: 3, convex: 4 }[L.extrude.bevelStyle] || 4; }
  }
  for (const k of Object.keys(sets)) {
    const t = keyTarget(k, o.effects);
    if (!t) { warnings.push('خاصية مش معروفة: ' + k); continue; }
    const v = valueFor(t.kind, sets[k], comp, threeD, { size: shapeSize });
    if (v !== null) o.transform[t.key] = v;
  }
  // keyframes: { prop: [[t, value, ease], …] } or [{t, v, ease}] — times from the layer's start
  o.keys = {};
  for (const k of Object.keys(L.keys || {})) {
    const t = keyTarget(k, o.effects);
    if (!t) { warnings.push('خاصية مش معروفة: ' + k); continue; }
    const keys = keyList(L.keys[k], t.kind, comp, threeD, { size: shapeSize });
    if (keys.length) { o.keys[t.key] = keys; ctx.keys += keys.length; }
  }
  o.expressions = {};
  for (const k of Object.keys(L.expressions || {})) {
    const t = keyTarget(k, o.effects);
    if (!t) continue;
    const ex = String(L.expressions[k]).slice(0, 1500);
    if (BAD_EXPR.test(ex)) { warnings.push('إكسبريشن اترفض'); continue; }
    o.expressions[t.key] = ex;
  }
  return [o].concat(extra);
}

/** an edit's look (the chat's "make it bigger / slower / orange") → the same checked shape as a layer's */
function normalizeLook(look, comp, { threeD = false, type = 'null' } = {}) {
  const warnings = [];
  look = look || {};
  const ctx = { layers: 0, keys: 0, warnings };
  void type;
  const [L] = layerSpec({ type: 'null', name: 'x', threeD, transform: look.transform, keys: look.keys, effects: look.effects, expressions: look.expressions, masks: look.masks, matte: look.matte, camera: look.camera, light: look.light }, comp, ctx, 0);
  const o = { transform: L.transform, keys: L.keys, effects: L.effects, expressions: L.expressions };
  if (look.masks) o.masks = L.masks;
  if (look.matte) o.matte = L.matte;
  if (look.text !== undefined) o.text = String(look.text).slice(0, 600);
  if (look.color) o.color = hex(look.color);
  if (+look.size > 0) o.size = clamp(+look.size, 4, 1500);
  if (look.font) o.font = String(look.font).slice(0, 80);
  if (look.textAnimator) o.textAnimators = [{ preset: TEXT_PRESETS.indexOf(look.textAnimator.preset) >= 0 ? look.textAnimator.preset : 'fadeUp', by: look.textAnimator.by || 'chars', duration: +look.textAnimator.duration || 1, start: +look.textAnimator.start || 0, out: false }];
  return { look: o, warnings };
}

/** the scene language, as the AI is told it */
function promptDoc() {
  return [
    'اكتب المشهد JSON بالشكل ده بس (أول لير في الليستة = فوق خالص):',
    '{"comp":{"create":true,"name":"…","width":1920,"height":1080,"fps":30,"duration":6,"bg":"#0b0806"},"layers":[ … ]}',
    'كل لير: {"type":"' + TYPES.join('|') + '","name":"اسم مميز","start":0,"end":6,"parent":"اسم لير","threeD":false,"blend":"' + BLEND.join('|') + '","motionBlur":true,',
    '  "matte":{"layer":"اسم اللير اللي هيبقى ماط","type":"' + MATTES.join('|') + '"},',
    '  "masks":[{"rect":[x,y,w,h] أو "ellipse":[cx,cy,w,h] أو "path":"M… (SVG)","mode":"add|subtract|intersect","feather":20,"expansion":0,"inverted":false}],',
    '  "transform":{"position":["50%","50%"],"scale":100,"rotation":0,"opacity":100,"anchor":[0,0]},',
    '  "keys":{"<خاصية>":[[ثانية, قيمة, "منحنى"], …]},  "expressions":{"<خاصية>":"wiggle(2,10)"},',
    '  "effects":[{"name":"<اسم من القايمة>","params":{…}}] أو إفكت متسطب بالـ matchName: {"match":"ADBE Fractal Noise","params":{"Contrast":150}}}',
    'حسب النوع:',
    '- text: "text","size":120,"color":"#fff","font":"PostScript name زي Cairo-Bold","align":"center","tracking":20,"leading":0,"allCaps":false,"stroke":"#000","strokeWidth":4,',
    '   "textAnimators":[{"preset":"' + TEXT_PRESETS.join('|') + '","by":"chars|words|lines","duration":1,"start":0}],"textOut":{"preset":"fadeUp","by":"words","duration":0.6} (خروج),',
    '   "counter":{"from":0,"to":250,"duration":2,"decimals":0,"prefix":"$","suffix":"+"}',
    '- shape: "shape":{"kind":"rect|ellipse|star|polygon|path","size":[600,120],"round":30,"points":5,',
    '   "path":"SVG path d (أيقونات، لوجوهات، خطوط منحنية — بيتسنتر ويتقاس على size)","points":[[x,y],…],"closed":true,"smooth":true,',
    '   "items":[{"kind":"…","position":[x,y],…}] (أكتر من شكل في لير واحد),',
    '   "fill":"#f97316" أو null,"stroke":"#fff","strokeWidth":6,"lineCap":"round","dash":20,',
    '   "gradient":{"colors":["#f97316","#7c2d12"],"type":"linear|radial","from":["0%","50%"],"to":["100%","50%"]},',
    '   "trim":{"start":0,"end":100,"offset":0} (خط بيترسم: حرّك shape:trimEnd من 0 لـ 100),',
    '   "repeater":{"copies":8,"position":[0,0],"rotation":45,"scale":100,"startOpacity":100,"endOpacity":30}}',
    '- solid / adjustment: "color":"#hex" · footage: "file":"مسار","srcIn":0 · light: "lightType":"spot|point|parallel|ambient","light":{"intensity":100,"color":"#fff","castsShadows":1}',
    '- ثري دي حقيقي لكلام أو شكل: "extrude":{"depth":60,"bevel":6,"bevelStyle":"convex"} (الكومب بيتحوّل Advanced 3D لوحده) — حط camera + light.',
    '- camera: "camera":{"zoom":2000,"dof":1,"focusDistance":2000,"aperture":50,"blurLevel":100}',
    '- precomp: "comp":{"width","height","duration"},"layers":[…] (مشاهد جوه مشاهد — استخدمه لتقسيم الفيديو لمشاهد ورا بعض بترانزيشن)',
    '- character: شخصية فلات بأطراف مطاطية ومتريّجة: "action":"walk|run|idle|wave|talk|jump","colors":{"skin","shirt","pants","hair","shoes"},"height":600,"position":[x, y الأرض],"walkAcross":true,"sliders":{"Speed":1.2} — بتتحرك بسلايدرز على "<name> Ctrl" (Walk, Speed, Stride, Arm Swing, Bob, Breath, Blink, Talk, Mouth, Wave, Jump, Look)',
    '- counter: عدّاد: "from":0,"to":1500,"duration":2,"format":"number|currency|percent|compact|time","currency":"USD|EUR|GBP|EGP|SAR|AED|KWD|QAR","decimals":0,"arabic":true (أرقام عربي),"prefix","suffix","plus":true,"style":"plain|ring|bar|card","label":"عميل سعيد","color","accent","size","position" (أو "counter":{…نفس الإعدادات…} على لير text)',
    '- chart: إنفوجرافيك: "type":"column|bar|line|area|pie|donut|progress|timeline","data":"اسم, رقم\\nاسم, رقم","title","colors":[…],"format":{…زي العدّاد…}',
    '- liquid: أشكال سايلة متحركة: "preset":"' + Object.keys(motionKit.LIQUID).join('|') + '","color","color2","size","position"',
    '- plexus: نقط بتطفو وخطوط بينها (تكنولوجي): "count":16,"distance":300,"color":"#hex"',
    '- particles: "preset":"' + PARTICLES.join('|') + '","count":40,"color":"#hex","colors":[…],"size":[3,8],"speed":60,"burstAt":0.5,"origin":["50%","50%"],"life":2.5',
    'الخصايص اللي تتحط في transform / keys / expressions:',
    '  ' + PROPS.join(', '),
    '  shape:' + SHAPE_PROPS.join(', shape:') + '  (shape:path قيمته SVG path أو نقط — كي فريمز بين شكلين = morph)',
    '  shape:path.2 (المسار التاني في اللير — للـ morph بكذا مسار) · geometry:depth, geometry:bevelDepth (ثري دي)',
    '  mask:1.path, mask:1.feather, mask:1.expansion, mask:1.opacity  ·  camera:' + CAMERA_PROPS.join(', camera:') + '  ·  light:' + LIGHT_PROPS.join(', light:'),
    '  fx:<اسم الإفكت>.<باراميتر> زي fx:glow.intensity، أو fx:<matchName>.<Display Name> لإفكت متسطب',
    'المنحنيات (آخر عنصر في الكي): ' + EASES.join('، ') + '. المكان بالبكسل أو "%" من الكومب. الوقت بالثواني من أول اللير. الألوان #hex.',
    'الإفكتات بالاسم: ' + Object.entries(EFFECTS).map(([k, v]) => k + '(' + Object.keys(v.params).join(',') + ')').join('، '),
    'الماسكات بإحداثيات اللير نفسه (للسوليد والفوتيج = بكسل الكومب). للكلام والأشكال استخدم matte بدل الماسك.'
  ].join('\n');
}

/** how a pro motion designer thinks — sent with every scene request */
function designGuide() {
  return [
    'إنت مصمم موشن محترف (مستوى Behance / Motion Collective). قواعدك:',
    '- كل عنصر داخل بمنحنى قوي (expoOut / backOut / quintOut) — مفيش linear غير للحاجات المستمرة (لف، تكرار).',
    '- overlap و stagger: العناصر بتدخل ورا بعض بفرق 0.05–0.15 ثانية، والحركة الكبيرة بتتبعها حركة صغيرة (follow-through).',
    '- مستويات: خلفية فيها حركة هادية (جرادينت، particles، أشكال بتطفو)، وسط، وعنصر رئيسي واضح. عمق بالـ blur والـ scale والـ parallax.',
    '- ألوان محدودة متناسقة (2–3 + محايد)، تباين قوي، مساحات بيضا كفاية، الكلام مقروء (حجم كبير، تراكينج مظبوط).',
    '- تفاصيل بتفرق: خطوط بتترسم (trim paths)، ماسك ريفيل، motion blur على الحركة السريعة، glow خفيف، grain بسيط، camera drift.',
    '- كل مشهد: دخول (0–1 ثانية) ← ثبات بحركة خفيفة مستمرة ← خروج نظيف (آخر 0.5 ثانية) لو مش loop.',
    '- للفيديوهات الطويلة: precomp لكل مشهد وترانزيشن بينهم (wipe، zoom، shape reveal، matte).',
    '- اسامي الليرز واضحة ومميزة (هتتعدّل بالاسم بعدين).'
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
,
  { id: 'line-logo', name: 'لوجو بيترسم بخط', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Line Logo', duration: 5, bg: '#0a0705' }, layers: [
    { type: 'text', name: 'Brand', text: p.title || 'BRAND', size: Math.round(H(c) * 0.08), color: '#ffffff', tracking: 60, transform: { position: ['50%', '72%'] }, textAnimators: [{ preset: 'tracking', by: 'chars', duration: 1.2, start: 1.4 }], keys: { opacity: [[1.4, 0], [1.8, 100]] } },
    { type: 'text', name: 'Tagline', text: p.subtitle || 'tagline', size: Math.round(H(c) * 0.03), color: '#fdba74', transform: { position: ['50%', '79%'] }, textAnimators: [{ preset: 'fadeUp', by: 'words', duration: 0.6, start: 2 }] },
    { type: 'shape', name: 'Check', shape: { path: 'M -60 0 L -15 45 L 70 -50', fill: null, stroke: p.color || '#f97316', strokeWidth: 16, trim: { end: 0 } }, transform: { position: ['50%', '42%'] }, keys: { 'shape:trimEnd': [[0.7, 0, 'expoOut'], [1.4, 100]] } },
    { type: 'shape', name: 'Ring', motionBlur: true, shape: { kind: 'ellipse', size: [H(c) * 0.36, H(c) * 0.36], fill: null, stroke: p.color || '#f97316', strokeWidth: 10, trim: { end: 0 } }, transform: { position: ['50%', '42%'] }, keys: { 'shape:trimEnd': [[0, 0, 'expoInOut'], [1, 100]], 'shape:trimOffset': [[0, -90, 'expoInOut'], [1.2, 0]], scale: [[1, 100, 'backOut'], [1.3, 108], [1.6, 100]] }, effects: [{ name: 'glow', params: { radius: 30, intensity: 0.8 } }] }
  ] }) },
  { id: 'particles-title', name: 'عنوان بشرار طاير', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Embers Title', duration: 6, bg: '#070403' }, layers: [
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.12), color: '#fff7ed', transform: { position: ['50%', '50%'] }, textAnimators: [{ preset: 'blurIn', by: 'chars', duration: 1.4, start: 0.3 }], textOut: { preset: 'fadeUp', by: 'chars', duration: 0.6, start: 5.2 }, effects: [{ name: 'glow', params: { radius: 40, intensity: 0.6 } }], keys: { scale: [[0.3, 92, 'easeOut'], [6, 100, 'linear']] } },
    { type: 'text', name: 'Subtitle', text: p.subtitle || '', size: Math.round(H(c) * 0.035), color: p.color || '#fb923c', transform: { position: ['50%', '62%'] }, textAnimators: [{ preset: 'tracking', by: 'chars', duration: 1, start: 1.2 }] },
    { type: 'particles', name: 'Embers', preset: 'embers', count: 45, color: p.color || '#fb923c' },
    { type: 'shape', name: 'Heat Glow', shape: { kind: 'ellipse', size: [W(c) * 0.9, H(c) * 0.5], gradient: { colors: [p.color || '#ea580c', '#070403'], type: 'radial', from: ['50%', '100%'], to: ['50%', '40%'] } }, transform: { position: ['50%', '100%'], opacity: 70 }, effects: [{ name: 'blur', params: { amount: 120 } }], expressions: { opacity: '60+Math.sin(time*2)*10' } }
  ] }) },
  { id: 'blob-morph', name: 'بلوب بيتشكّل (Morph)', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Blob Morph', duration: 6, bg: '#fff7ed' }, layers: [
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.11), color: '#ffffff', transform: { position: ['50%', '53%'] }, textAnimators: [{ preset: 'scalePop', by: 'words', duration: 0.7, start: 0.6 }] },
    { type: 'shape', name: 'Blob', motionBlur: true, shape: { path: 'M0 -200 C110 -200 210 -120 200 0 C190 120 110 210 0 200 C-120 190 -210 110 -200 0 C-190 -110 -110 -200 0 -200 Z', size: [H(c) * 0.75, H(c) * 0.75], gradient: { colors: [p.color || '#f97316', '#c2410c'], from: ['30%', '20%'], to: ['70%', '80%'] } }, transform: { position: ['50%', '50%'] },
      keys: { 'shape:path': [[0, 'M0 -200 C110 -200 210 -120 200 0 C190 120 110 210 0 200 C-120 190 -210 110 -200 0 C-190 -110 -110 -200 0 -200 Z', 'easeInOut'], [2, 'M0 -230 C150 -190 190 -90 220 20 C200 160 80 190 -20 210 C-150 180 -230 90 -190 -30 C-170 -150 -90 -210 0 -230 Z', 'easeInOut'], [4, 'M0 -190 C90 -220 230 -140 190 10 C170 140 120 230 10 190 C-110 210 -190 90 -220 0 C-200 -120 -130 -170 0 -190 Z', 'easeInOut'], [6, 'M0 -200 C110 -200 210 -120 200 0 C190 120 110 210 0 200 C-120 190 -210 110 -200 0 C-190 -110 -110 -200 0 -200 Z']],
        scale: [[0, 0, 'backOut'], [0.7, 100]], rotation: [[0, 0, 'linear'], [6, 40]] } }
  ] }) },
  { id: 'mask-reveal', name: 'كلام بيطلع من ورا خط', fields: ['title', 'subtitle', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Matte Reveal', duration: 5, bg: '#0b0806' }, layers: [
    { type: 'shape', name: 'Reveal Box', shape: { kind: 'rect', size: [W(c), H(c) * 0.16], fill: '#ffffff' }, transform: { position: ['50%', '48%'] } },
    { type: 'text', name: 'Title', text: p.title || 'العنوان', size: Math.round(H(c) * 0.11), color: '#ffffff', matte: { layer: 'Reveal Box', type: 'alpha' }, transform: { position: ['50%', '52%'] }, keys: { position: [[0.3, ['50%', '68%'], 'expoOut'], [1.1, ['50%', '52%']], [4.2, ['50%', '52%'], 'expoIn'], [4.8, ['50%', '36%']]] } },
    { type: 'shape', name: 'Line', shape: { kind: 'rect', size: [W(c) * 0.5, 6], round: 3, fill: p.color || '#f97316' }, transform: { position: ['50%', '57%'] }, keys: { scale: [[0, [0, 100], 'expoInOut'], [0.6, [100, 100]], [4.3, [100, 100], 'expoInOut'], [4.9, [0, 100]]] } },
    { type: 'text', name: 'Subtitle', text: p.subtitle || 'سطر تحت', size: Math.round(H(c) * 0.035), color: '#fed7aa', transform: { position: ['50%', '64%'] }, textAnimators: [{ preset: 'fadeUp', by: 'words', duration: 0.6, start: 1 }], textOut: { preset: 'fadeUp', by: 'words', duration: 0.4, start: 4.2 } }
  ] }) },
  { id: 'burst-loader', name: 'بيرست خطوط (Repeater)', fields: ['title', 'color'], build: (p, c) => ({ comp: { create: true, name: 'Burst', duration: 4, bg: '#0b0806' }, layers: [
    { type: 'text', name: 'Label', text: p.title || 'WOW', size: Math.round(H(c) * 0.09), color: '#ffffff', transform: { position: ['50%', '53%'] }, keys: { scale: [[0.2, 0, 'backOut'], [0.7, 100]] } },
    { type: 'shape', name: 'Rays', shape: { items: [{ kind: 'rect', size: [8, 70], round: 4, position: [0, -H(c) * 0.2] }], fill: p.color || '#f97316', repeater: { copies: 16, position: [0, 0], rotation: 22.5 } }, transform: { position: ['50%', '50%'] }, keys: { scale: [[0, 40, 'expoOut'], [0.8, 100]], 'shape:groupScale': [[0, [100, 0], 'expoOut'], [0.6, [100, 100]], [1.6, [100, 100], 'expoIn'], [2.2, [100, 0]]] }, expressions: { rotation: 'time*20' } }
  ] }) },
  { id: 'promo-3', name: 'برومو 3 مشاهد بترانزيشن', fields: ['title', 'subtitle', 'color'], build: (p, c) => {
    const words = String(p.title || 'جديد • أسرع • أقوى').split(/[•|,،]/).map(x => x.trim()).filter(Boolean).slice(0, 3);
    while (words.length < 3) words.push(['جديد', 'أسرع', 'أقوى'][words.length]);
    const scene = (w, i) => ({ type: 'precomp', name: 'Scene ' + (i + 1), start: i * 2, end: i * 2 + 2.4, comp: { duration: 2.4, bg: i % 2 ? '#fff7ed' : (p.color || '#ea580c') }, layers: [
      { type: 'text', name: 'Word', text: w, size: Math.round(H(c) * 0.16), color: i % 2 ? '#1f140c' : '#ffffff', transform: { position: ['50%', '54%'] }, textAnimators: [{ preset: i === 1 ? 'dropIn' : 'scalePop', by: 'chars', duration: 0.6, start: 0.1 }], keys: { scale: [[0, 100, 'linear'], [2.4, 110]] } },
      { type: 'particles', name: 'Dust', preset: 'dust', count: 20, color: i % 2 ? '#fdba74' : '#ffffff' }
    ], keys: i ? { 'mask:1.expansion': [[0, -W(c), 'expoInOut'], [0.5, 0]] } : {}, masks: i ? [{ ellipse: ['50%', '50%', '160%', '160%'] }] : [] });
    return { comp: { create: true, name: 'Promo', duration: 6.4 }, layers: [
      { type: 'text', name: 'CTA', start: 5.2, text: p.subtitle || 'جرّبه دلوقتي', size: Math.round(H(c) * 0.05), color: '#ffffff', transform: { position: ['50%', '82%'] }, textAnimators: [{ preset: 'fadeUp', by: 'words', duration: 0.5, start: 5.3 }] },
      scene(words[2], 2), scene(words[1], 1), scene(words[0], 0)
    ] };
  } }
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

module.exports = { EFFECTS, TYPES, PROPS, SHAPE_PROPS, EASES, PARTICLES, TEXT_PRESETS, SCENES, STYLES, RATIOS, normalize, normalizeLook, keyTarget, promptDoc, designGuide, buildLibrary, montageScene, hex };

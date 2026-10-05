'use strict';
// Liquid Glass — زجاج سايل على الفيديو بتاعك: بيكسر (refraction) ويغبّش الفيديو اللي تحته، وحواف لامعة وظل وحركة سايلة.
// بيشتغل بـ WebGL جوه اللوحة (أوفلاين) — الملف ده فيه البريسيتات + حساب الحركة + رسم الشكل + الشيدر + الرندرر.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EFLiquid = api;
})(typeof window !== 'undefined' ? window : null, function () {

  // x,y = مركز الشكل (0..1). w = نسبة من عرض الكادر، h = نسبة من ارتفاعه. radius 0..1 (1 = كبسولة كاملة).
  var PRESETS = [
    { id: 'pill', name: 'كبسولة', shape: 'pill', x: 0.5, y: 0.84, w: 0.36, h: 0.11, label: 'اكتب هنا', labelSize: 0.045 },
    { id: 'card', name: 'كارت زجاج', shape: 'rect', x: 0.5, y: 0.5, w: 0.46, h: 0.44, radius: 0.34, label: '', labelSize: 0.05 },
    { id: 'lens', name: 'عدسة مكبّرة', shape: 'circle', x: 0.5, y: 0.5, w: 0.3, h: 0.3, zoom: 1.4, refract: 1.8, blur: 0, chroma: 1.2, label: '' },
    { id: 'lower-third', name: 'لوور ثيرد زجاج', shape: 'rect', x: 0.3, y: 0.83, w: 0.42, h: 0.13, radius: 0.4, label: 'الاسم هنا', labelSize: 0.05 },
    { id: 'notification', name: 'إشعار', shape: 'rect', x: 0.5, y: 0.11, w: 0.58, h: 0.12, radius: 0.45, label: '🔔  إشعار جديد', labelSize: 0.042, animIn: 'drop' },
    { id: 'subscribe', name: 'زرار اشترك', shape: 'pill', x: 0.5, y: 0.82, w: 0.28, h: 0.11, label: 'اشترك', labelSize: 0.05, tint: '#ff2d55', tintAmount: 0.38 },
    { id: 'glass-text', name: 'نص زجاج', shape: 'text', x: 0.5, y: 0.5, text: 'EDITFAST', textSize: 0.24, refract: 1.4, blur: 6, bevel: 10, label: '' },
    { id: 'dock', name: 'شريط أيقونات', shape: 'rect', x: 0.5, y: 0.9, w: 0.5, h: 0.12, radius: 0.5, label: '🎬   🎵   📷   ✨', labelSize: 0.05 },
    { id: 'side-panel', name: 'بانل جانبي', shape: 'rect', x: 0.78, y: 0.5, w: 0.34, h: 0.82, radius: 0.22, label: '', labelSize: 0.05, animIn: 'slide' },
    { id: 'frame', name: 'إطار زجاج', shape: 'ring', x: 0.5, y: 0.5, w: 0.94, h: 0.9, radius: 0.07, thickness: 0.05, label: '', animIn: 'fade' }
  ];

  var DEFAULTS = {
    shape: 'pill', x: 0.5, y: 0.5, w: 0.36, h: 0.12, radius: 1, thickness: 0.05, text: 'GLASS', textSize: 0.2, font: 'EF Cairo, Cairo, Segoe UI, Arial, sans-serif',
    label: '', labelSize: 0.045, labelColor: '#ffffff',
    blur: 14, refract: 1.25, chroma: 0.6, tint: '#ffffff', tintAmount: 0.08, spec: 0.9, shadow: 0.35, zoom: 1, bright: 1.06, bevel: 0, wobble: 0.6,
    animIn: 'liquid', animOut: 'fade', duration: 4
  };
  var ANIMS_IN = ['liquid', 'pop', 'drop', 'slide', 'fade', 'none'];
  var ANIMS_OUT = ['fade', 'shrink', 'liquid', 'none'];

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function normalize(params) {
    var base = {};
    var p = params || {};
    var pre = p.preset ? PRESETS.filter(function (x) { return x.id === p.preset; })[0] : null;
    var k;
    for (k in DEFAULTS) base[k] = DEFAULTS[k];
    if (pre) for (k in pre) if (k !== 'id' && k !== 'name') base[k] = pre[k];
    for (k in p) if (p[k] !== undefined && p[k] !== null && k !== 'preset') base[k] = p[k];
    base.preset = pre ? pre.id : (p.preset || 'custom');
    base.x = clamp(num(base.x, 0.5), -0.5, 1.5); base.y = clamp(num(base.y, 0.5), -0.5, 1.5);
    base.w = clamp(num(base.w, 0.36), 0.01, 2); base.h = clamp(num(base.h, 0.12), 0.01, 2);
    base.radius = clamp(num(base.radius, 1), 0, 1);
    base.blur = clamp(num(base.blur, 14), 0, 60); base.refract = clamp(num(base.refract, 1), 0, 4);
    base.chroma = clamp(num(base.chroma, 0.6), 0, 4); base.tintAmount = clamp(num(base.tintAmount, 0.08), 0, 1);
    base.spec = clamp(num(base.spec, 0.9), 0, 3); base.shadow = clamp(num(base.shadow, 0.35), 0, 1);
    base.zoom = clamp(num(base.zoom, 1), 0.5, 3); base.bright = clamp(num(base.bright, 1.06), 0.3, 2);
    base.wobble = clamp(num(base.wobble, 0.6), 0, 6);
    base.duration = clamp(num(base.duration, 4), 0.3, 60);
    if (ANIMS_IN.indexOf(base.animIn) < 0) base.animIn = 'liquid';
    if (ANIMS_OUT.indexOf(base.animOut) < 0) base.animOut = 'fade';
    if (['pill', 'rect', 'circle', 'ring', 'text'].indexOf(base.shape) < 0) base.shape = 'pill';
    return base;
  }

  // damped spring 0→1 (overshoots like liquid)
  function spring(t, freq, damp) { if (t <= 0) return 0; return 1 - Math.exp(-damp * t) * Math.cos(freq * t); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /** Animation state at time t (seconds): {sx, sy, dx, dy (px fraction), opacity} */
  function animState(p, t) {
    var d = p.duration, st = { sx: 1, sy: 1, dx: 0, dy: 0, opacity: 1 };
    var tin = t, tout = d - t;
    switch (p.animIn) {
      case 'liquid':
        st.sx *= spring(tin, 14, 6.5); st.sy *= spring(Math.max(0, tin - 0.06), 16, 7.5);
        st.opacity *= smooth(tin / 0.12); break;
      case 'pop': st.sx *= spring(tin, 18, 9); st.sy = st.sx; st.opacity *= smooth(tin / 0.1); break;
      case 'drop': st.dy -= (1 - spring(tin, 12, 7)) * 0.25; st.sy *= 0.85 + 0.15 * spring(tin, 20, 8); st.opacity *= smooth(tin / 0.15); break;
      case 'slide': st.dx += (1 - spring(tin, 10, 7)) * 0.3; st.opacity *= smooth(tin / 0.2); break;
      case 'fade': st.opacity *= smooth(tin / 0.4); break;
      default: break;
    }
    if (tout < 0.5) {
      var k = smooth(1 - tout / 0.5); // 0 → 1 during the last 0.5s
      switch (p.animOut) {
        case 'fade': st.opacity *= 1 - k; break;
        case 'shrink': st.sx *= 1 - k; st.sy *= 1 - k; st.opacity *= 1 - k * 0.5; break;
        case 'liquid': st.sy *= 1 - k; st.sx *= 1 + 0.25 * Math.sin(k * Math.PI) - k; st.opacity *= 1 - k * k; break;
        default: break;
      }
    }
    st.sx = Math.max(0.001, st.sx); st.sy = Math.max(0.001, st.sy); st.opacity = clamp(st.opacity, 0, 1);
    return st;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** Path of the glass shape in frame pixels. */
  function shapePath(ctx, p, W, H) {
    var cx = p.x * W, cy = p.y * H, w = p.w * W, h = p.h * H;
    ctx.beginPath();
    if (p.shape === 'circle') { var r = h / 2; ctx.arc(cx, cy, r, 0, Math.PI * 2); return; }
    var rr = p.shape === 'pill' ? h / 2 : p.radius * Math.min(w, h) / 2;
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, rr);
    if (p.shape === 'ring') {
      var t = Math.max(2, p.thickness * Math.min(W, H));
      roundRectPath(ctx, cx - w / 2 + t, cy - h / 2 + t, w - 2 * t, h - 2 * t, Math.max(0, rr - t));
    }
  }

  function fillShape(ctx, p, W, H) {
    if (p.shape === 'text') {
      ctx.font = '900 ' + Math.round(p.textSize * H) + 'px ' + p.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.direction = /[\u0600-\u06FF]/.test(p.text) ? 'rtl' : 'ltr';
      ctx.fillText(p.text, p.x * W, p.y * H);
      return;
    }
    shapePath(ctx, p, W, H);
    ctx.fill(p.shape === 'ring' ? 'evenodd' : 'nonzero');
  }

  /**
   * Shape texture (frame space): R = sharp mask, G = bevel height (blurred), B = soft shadow mask.
   * `makeCanvas(w,h)` returns a 2D-capable canvas (document.createElement in the panel).
   */
  function drawShapeTexture(makeCanvas, p, W, H) {
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // thick rounded bevel = the 'liquid' look (strong bending near the edges, clear in the middle)
    var bevel = p.bevel || Math.max(8, Math.round((p.shape === 'ring' ? p.thickness * Math.min(W, H) : Math.min(p.w * W, p.h * H)) * 0.22));
    ctx.filter = 'blur(' + Math.round(Math.max(18, bevel * 2)) + 'px)'; ctx.fillStyle = '#0000ff'; fillShape(ctx, p, W, H);
    ctx.filter = 'blur(' + bevel + 'px)'; ctx.fillStyle = '#00ff00'; fillShape(ctx, p, W, H);
    ctx.filter = 'none'; ctx.fillStyle = '#ff0000'; fillShape(ctx, p, W, H);
    return c;
  }

  /** Label (text drawn on the glass), transparent canvas in frame space. */
  function drawLabelTexture(makeCanvas, p, W, H) {
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    if (!p.label || p.shape === 'text') return c;
    var px = Math.round(p.labelSize * H);
    ctx.font = '800 ' + px + 'px ' + p.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = /[\u0600-\u06FF]/.test(p.label) ? 'rtl' : 'ltr';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = px * 0.25; ctx.shadowOffsetY = px * 0.05;
    ctx.fillStyle = p.labelColor;
    ctx.fillText(p.label, p.x * W, p.y * H + px * 0.04);
    return c;
  }

  /** Geometry in px for the analytic shader path (type 0 = rounded rect/pill, 1 = circle, 2 = ring, 3 = text texture). */
  function shapeGeometry(p, W, H) {
    var w = p.w * W, h = p.h * H, type = { rect: 0, pill: 0, circle: 1, ring: 2, text: 3 }[p.shape];
    var rad = p.shape === 'pill' ? h / 2 : (p.shape === 'circle' ? h / 2 : p.radius * Math.min(w, h) / 2);
    var thick = Math.max(2, p.thickness * Math.min(W, H));
    var base = p.shape === 'ring' ? thick : (p.shape === 'circle' ? h : Math.min(w, h));
    var bevel = p.bevel || Math.max(6, base * (p.shape === 'ring' ? 0.5 : 0.28));
    return { type: type, hw: w / 2, hh: h / 2, rad: Math.min(rad, w / 2, h / 2), thick: thick, bevel: bevel };
  }

  var VERT = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';

  // NOTE: everything lives in "image space" (row 0 = top). Textures are uploaded top-down without flipping and
  // the output of readPixels is top-down too, so no flips are needed anywhere.
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uSrc; uniform sampler2D uShape; uniform sampler2D uLabel;',
    'uniform vec2 uRes; uniform vec2 uCenter; uniform vec2 uScale; uniform vec2 uOffset;',
    'uniform float uOpacity; uniform float uBlur; uniform float uRefract; uniform float uChroma; uniform vec4 uTint;',
    'uniform float uSpec; uniform float uShadow; uniform float uZoom; uniform float uTime; uniform float uWobble; uniform float uHasSrc; uniform float uBright; uniform float uFlip;',
    'uniform float uType; uniform vec2 uHalf; uniform float uRad; uniform float uThick; uniform float uBevel;',
    'vec2 toShape(vec2 p){ return uCenter + (p - uCenter - uOffset) / uScale; }',
    'vec4 shapeAt(vec2 p){ vec2 q = toShape(p) / uRes; if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0); return texture2D(uShape, q); }',
    // analytic shapes (signed distance in px, <0 inside): smooth float height → no banding
    // smooth max: rounds off the crease a box SDF has along its diagonals (no hard seams inside the glass)
    'float smax(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(a, b, h) + k * h * (1.0 - h); }',
    'float box(vec2 l){ vec2 q = abs(l) - uHalf + uRad; return length(max(q, 0.0)) + min(smax(q.x, q.y, uBevel * 0.7), 0.0) - uRad; }',
    'float sdf(vec2 p){',
    '  vec2 l = toShape(p) - uCenter;',
    '  if (uType < 0.5) return box(l);',
    '  if (uType < 1.5) return length(l) - uHalf.y;',
    '  float d = box(l);',
    '  return abs(d + uThick * 0.5) - uThick * 0.5;',
    '}',
    'float heightA(vec2 p){ float x = clamp(-sdf(p) / uBevel, 0.0, 1.0); return sqrt(1.0 - (1.0 - x) * (1.0 - x)); }',  // rounded (quarter-circle) bevel
    'vec3 src(vec2 p){ return texture2D(uSrc, clamp(p / uRes, vec2(0.0), vec2(1.0))).rgb; }',
    'vec3 blurSrc(vec2 p){',
    '  vec3 acc = src(p); float w = 1.0;',
    '  for (int i = 0; i < 24; i++) { float fi = float(i) + 1.0; float r = sqrt(fi / 24.0) * uBlur; float a = fi * 2.39996; acc += src(p + vec2(cos(a), sin(a)) * r); w += 1.0; }',
    '  return acc / w;',
    '}',
    'void main(){',
    '  vec2 p = vec2(vUv.x, uFlip > 0.5 ? 1.0 - vUv.y : vUv.y) * uRes;',
    '  vec2 pw = p + uWobble * vec2(sin(p.y * 0.018 + uTime * 2.1), cos(p.x * 0.016 + uTime * 1.7));',
    '  bool analytic = uType < 2.5;',
    '  float mask, h, shadowA; vec2 grad;',
    '  if (analytic) {',
    '    float d = sdf(pw);',
    '    mask = clamp(0.5 - d, 0.0, 1.0);',
    '    float ds = sdf(p - vec2(0.0, uRes.y * 0.012));',
    '    shadowA = uShadow * (1.0 - smoothstep(-uBevel, uBevel * 2.5, ds)) * (1.0 - mask) * 0.6;',
    '    if (mask < 0.004) { gl_FragColor = vec4(0.0, 0.0, 0.0, shadowA * uOpacity); return; }',
    '    float e = 1.0;',
    '    grad = vec2(heightA(pw + vec2(e, 0.0)) - heightA(pw - vec2(e, 0.0)), heightA(pw + vec2(0.0, e)) - heightA(pw - vec2(0.0, e))) / (2.0 * e);',
    '    grad *= 0.18 * uBevel / max(uRes.y * 0.02, 1.0);',   // scale to the same range as the texture path
    '    h = heightA(pw);',
    '  } else {',
    '    vec4 s = shapeAt(pw);',
    '    mask = s.r;',
    '    shadowA = uShadow * shapeAt(p - vec2(0.0, uRes.y * 0.012)).b * (1.0 - mask) * 0.75;',
    '    if (mask < 0.004) { gl_FragColor = vec4(0.0, 0.0, 0.0, shadowA * uOpacity); return; }',
    '    float e = 3.0;',
    '    grad = vec2(shapeAt(pw + vec2(e, 0.0)).g - shapeAt(pw - vec2(e, 0.0)).g, shapeAt(pw + vec2(0.0, e)).g - shapeAt(pw - vec2(0.0, e)).g) / (2.0 * e);',
    '    h = s.g;',
    '  }',
    '  float steep = clamp(length(grad) * 40.0, 0.0, 1.0);',
    '  vec2 disp = grad * uRefract * uRes.y * 0.9;',             // lens: edges pull the picture inwards
    '  vec2 q = uCenter + uOffset + (p - uCenter - uOffset) / uZoom - disp;',
    '  vec2 ca = grad * uChroma * uRes.y * 0.25;',
    '  vec3 col = vec3(0.93);',
    '  if (uHasSrc > 0.5) { col = vec3(blurSrc(q - ca).r, blurSrc(q).g, blurSrc(q + ca).b); }',
    '  col = mix(col, uTint.rgb, uTint.a) * uBright;',
    '  vec2 n = length(grad) > 1e-6 ? normalize(grad) : vec2(0.0);',
    '  vec2 L = normalize(vec2(-0.55, -0.85));',                  // light from the top-left
    '  float rim = steep * pow(max(dot(-n, L), 0.0), 1.6);',       // bright outer edge facing the light
    '  float rimIn = steep * pow(max(dot(n, L), 0.0), 2.0) * 0.45;',// softer glint on the opposite inner edge
    '  float sheen = (1.0 - smoothstep(0.0, 0.55, (p.y - (uCenter.y + uOffset.y)) / max(uRes.y * 0.25, 1.0) + 0.6)) * h * 0.10;',
    '  col += (rim + rimIn) * uSpec + sheen * uSpec;',
    '  col = mix(col, col * 0.86, steep * 0.35 * (1.0 - rim));',  // slightly darker bevel = thickness
    '  vec4 lab = texture2D(uLabel, toShape(p) / uRes);',
    '  col = mix(col, lab.rgb, lab.a);',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), mask * uOpacity);',
    '}'
  ].join('\n');

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
  }

  /**
   * WebGL renderer. canvas: HTMLCanvasElement. Returns {setParams, render(srcPixelsOrNull, t) → Uint8Array RGBA top-down, destroy}.
   */
  function createRenderer(canvas, W, H, makeCanvas) {
    canvas.width = W; canvas.height = H;
    var gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL مش متاح');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    function tex(unit) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    var tSrc = tex(0), tShape = tex(1), tLabel = tex(2);
    var U = {}; ['uSrc', 'uShape', 'uLabel', 'uRes', 'uCenter', 'uScale', 'uOffset', 'uOpacity', 'uBlur', 'uRefract', 'uChroma', 'uTint', 'uSpec', 'uShadow', 'uZoom', 'uTime', 'uWobble', 'uHasSrc', 'uBright', 'uFlip', 'uType', 'uHalf', 'uRad', 'uThick', 'uBevel']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uSrc, 0); gl.uniform1i(U.uShape, 1); gl.uniform1i(U.uLabel, 2);
    gl.uniform2f(U.uRes, W, H);
    gl.viewport(0, 0, W, H);
    var P = null, out = new Uint8Array(W * H * 4);
    var mk = makeCanvas || function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    function setParams(params) {
      P = normalize(params);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tShape);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawShapeTexture(mk, P, W, H));
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tLabel);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawLabelTexture(mk, P, W, H));
      var tint = hexToRgb(P.tint);
      gl.uniform4f(U.uTint, tint[0], tint[1], tint[2], P.tintAmount);
      gl.uniform1f(U.uBlur, P.blur * H / 1080); gl.uniform1f(U.uRefract, P.refract * 0.02); gl.uniform1f(U.uChroma, P.chroma * 0.02);
      gl.uniform1f(U.uSpec, P.spec); gl.uniform1f(U.uShadow, P.shadow); gl.uniform1f(U.uZoom, P.zoom); gl.uniform1f(U.uBright, P.bright);
      gl.uniform1f(U.uWobble, P.wobble * H / 1080);
      gl.uniform2f(U.uCenter, P.x * W, P.y * H);
      var g = shapeGeometry(P, W, H);
      gl.uniform1f(U.uType, g.type); gl.uniform2f(U.uHalf, g.hw, g.hh); gl.uniform1f(U.uRad, g.rad); gl.uniform1f(U.uThick, g.thick); gl.uniform1f(U.uBevel, g.bevel);
      return P;
    }

    /** src: Uint8Array RGBA (W×H, top-down) | HTMLImageElement/Canvas | null. */
    function render(src, t, read) {
      var st = animState(P, t);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tSrc);
      if (src && src.length !== undefined) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.uniform1f(U.uHasSrc, src ? 1 : 0);
      gl.uniform2f(U.uScale, st.sx, st.sy); gl.uniform2f(U.uOffset, st.dx * W, st.dy * H);
      gl.uniform1f(U.uOpacity, st.opacity); gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uFlip, read === false ? 1 : 0); // on-screen preview is bottom-up, exported pixels are top-down
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (read === false) return null;
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    }
    return { setParams: setParams, render: render, gl: gl, destroy: function () { var e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } };
  }

  return { PRESETS: PRESETS, DEFAULTS: DEFAULTS, ANIMS_IN: ANIMS_IN, ANIMS_OUT: ANIMS_OUT, normalize: normalize, animState: animState,
    drawShapeTexture: drawShapeTexture, shapeGeometry: shapeGeometry, drawLabelTexture: drawLabelTexture, createRenderer: createRenderer, VERT: VERT, FRAG: FRAG, hexToRgb: hexToRgb };
});

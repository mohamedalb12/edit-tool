'use strict';
// كابشن متحرك: ستايلات بتتزامن مع كل كلمة (كاريوكي، بوب، بوكس، بولد، نيون…) — رسم على canvas (عربي RTL صح).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EFCaptions = api;
})(typeof window !== 'undefined' ? window : null, function () {

  var STYLES = [
    { id: 'karaoke', name: 'كاريوكي' },
    { id: 'pop', name: 'بوب كلمة كلمة' },
    { id: 'box', name: 'بوكس على الكلمة' },
    { id: 'bold', name: 'بولد (ستايل الريلز)' },
    { id: 'neon', name: 'نيون' },
    { id: 'gradient', name: 'تدرج' },
    { id: 'minimal', name: 'بسيط أنيق' },
    { id: 'typewriter', name: 'آلة كاتبة' },
    { id: 'hormozi', name: 'هرموزي' },
    { id: 'beast', name: 'بيست (ألوان)' },
    { id: 'highlighter', name: 'هايلايتر' },
    { id: 'outline', name: 'أوتلاين' },
    { id: 'lyric', name: 'ليريك ناعم' }
  ];

  // حركة دخول كل كلمة (مستقلة عن الستايل)
  var ANIMS = [
    { id: 'none', name: 'من غير (حركة الستايل)' },
    { id: 'drop', name: 'نازلة من فوق' },
    { id: 'rise', name: 'طالعة من تحت' },
    { id: 'slideStart', name: 'من الجنب (أول السطر)' },
    { id: 'slideEnd', name: 'من الجنب التاني' },
    { id: 'zoomIn', name: 'زووم من كبير' },
    { id: 'pop', name: 'بوب' },
    { id: 'bounce', name: 'نطّة' },
    { id: 'blur', name: 'ضباب لوضوح' },
    { id: 'fade', name: 'ظهور ناعم' },
    { id: 'flip', name: 'قلبة' },
    { id: 'spin', name: 'لفّة' },
    { id: 'stretch', name: 'مطّ' },
    { id: 'swing', name: 'مرجيحة' },
    { id: 'letters', name: 'حرف حرف' },
    { id: 'glitch', name: 'جليتش' },
    { id: 'wave', name: 'موجة' }
  ];
  // منحنى السرعة: out = سريع في الأول وبطيء في الآخر
  var EASES = [
    { id: 'out', name: 'سريع ← بطيء' }, { id: 'in', name: 'بطيء ← سريع' }, { id: 'inOut', name: 'ناعم من الناحيتين' },
    { id: 'linear', name: 'ثابت' }, { id: 'back', name: 'بيعدّي ويرجع' }, { id: 'elastic', name: 'مطاطي' }, { id: 'bounce', name: 'نطّات' }
  ];
  var EXITS = [{ id: 'none', name: 'من غير' }, { id: 'fade', name: 'يختفي' }, { id: 'drop', name: 'ينزل لتحت' }, { id: 'rise', name: 'يطلع لفوق' }, { id: 'slide', name: 'يخرج من الجنب' }, { id: 'zoomOut', name: 'يصغر' }, { id: 'blur', name: 'يتغبّش' }];

  var DEFAULTS = { style: 'bold', position: 'bottom', size: 0.068, text: '#FFFFFF', accent: '#FFD84D', box: '#7C3AED', stroke: '#000000', font: 'EF Cairo, Cairo, Segoe UI, Arial, sans-serif', maxWidth: 0.84, uppercase: false,
    anim: 'none', ease: 'out', strength: 3, animDur: 0.35, distance: 1.2, timing: 'sync', wordGap: 0.12, exit: 'none', exitDur: 0.25 };
  var AR = /[\u0600-\u06FF]/;

  function opts(o) { var r = {}, k; for (k in DEFAULTS) r[k] = DEFAULTS[k]; for (k in (o || {})) if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function bounceOut(x) { var n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; } if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; } x -= 2.625 / d; return n * x * x + 0.984375; }
  /** speed curve 0..1 → 0..1; strength (1-6) = how strong the fast→slow (or slow→fast) is */
  function ease(name, x, strength) {
    x = clamp(x, 0, 1); var p = clamp(strength || 3, 1, 8);
    switch (name) {
      case 'linear': return x;
      case 'in': return Math.pow(x, p);
      case 'inOut': return x < 0.5 ? Math.pow(2 * x, p) / 2 : 1 - Math.pow(2 - 2 * x, p) / 2;
      case 'back': { var c1 = 1.2 + p * 0.25, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
      case 'elastic': return x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / (2 + 4 / p))) + 1;
      case 'bounce': return bounceOut(x);
      default: return 1 - Math.pow(1 - x, p); // out: fast at the start, slow at the end
    }
  }
  /** when word i of the cue starts its entrance */
  function wordStart(cue, i, o) {
    if (o.timing === 'cascade') return cue.start + i * o.wordGap;
    if (o.timing === 'line') return cue.start;
    return Math.max(cue.start, cue.words[i].start - Math.min(o.animDur * 0.35, 0.12)); // lands right on the spoken word
  }
  /** entrance/exit transform of one word → {dx, dy, sx, sy, rot, alpha, blur, chars} (dist in px) */
  function motion(o, k, e, dist, rtl, t, i) {
    var m = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: clamp(k * 2.5, 0, 1), blur: 0, chars: 1 };
    var side = rtl ? 1 : -1; // reading starts on the right in Arabic
    switch (o.anim) {
      case 'drop': m.dy = -dist * (1 - e); break;
      case 'rise': m.dy = dist * (1 - e); break;
      case 'slideStart': m.dx = side * dist * 1.6 * (1 - e); break;
      case 'slideEnd': m.dx = -side * dist * 1.6 * (1 - e); break;
      case 'zoomIn': m.sx = m.sy = 1 + 1.3 * (1 - e); break;
      case 'pop': m.sx = m.sy = Math.max(0, e); m.alpha = clamp(k * 4, 0, 1); break;
      case 'bounce': m.dy = -dist * 1.4 * (1 - bounceOut(k)); m.alpha = clamp(k * 5, 0, 1); break;
      case 'blur': m.blur = 14 * (1 - e); m.alpha = clamp(e * 1.3, 0, 1); break;
      case 'fade': m.alpha = e; break;
      case 'flip': m.sy = Math.max(0.02, e); m.dy = -dist * 0.4 * (1 - e); break;
      case 'spin': m.rot = -120 * (1 - e); m.sx = m.sy = 0.3 + 0.7 * e; break;
      case 'stretch': m.sx = 1 + 1.6 * (1 - e); m.sy = 0.35 + 0.65 * e; break;
      case 'swing': m.rot = 35 * Math.sin((1 - e) * Math.PI * 1.5) * (1 - e); m.dy = -dist * 0.3 * (1 - e); break;
      case 'letters': m.chars = e; m.alpha = k > 0 ? 1 : 0; break;
      case 'glitch': if (k < 1) { var r = Math.sin(t * 91 + i * 13); m.dx = r * dist * 0.35 * (1 - e); m.alpha = r > -0.6 ? 1 : 0.3; } break;
      case 'wave': m.dy = -dist * (1 - e) + Math.sin(t * 6 + i * 0.9) * dist * 0.08; break;
    }
    return m;
  }
  function exitMotion(o, x, dist, rtl) {
    var m = { dx: 0, dy: 0, sx: 1, sy: 1, alpha: 1, blur: 0 }, e = ease('in', x, 2.5);
    switch (o.exit) {
      case 'fade': m.alpha = 1 - e; break;
      case 'drop': m.dy = dist * e; m.alpha = 1 - e; break;
      case 'rise': m.dy = -dist * e; m.alpha = 1 - e; break;
      case 'slide': m.dx = (rtl ? -1 : 1) * dist * 1.6 * e; m.alpha = 1 - e; break;
      case 'zoomOut': m.sx = m.sy = 1 - 0.7 * e; m.alpha = 1 - e; break;
      case 'blur': m.blur = 14 * e; m.alpha = 1 - e; break;
    }
    return m;
  }
  var BEAST = ['#FFFFFF', '#FFE500', '#33FF66', '#FF3D7F', '#00D9FF'];

  function fontFor(o, H, weight) { return (weight || 900) + ' ' + Math.round(o.size * H) + 'px ' + o.font; }

  /** Lay out words into centered lines (RTL aware). Returns [{line, words:[{i, x, w}]}] */
  function layout(ctx, words, o, W, H) {
    var px = Math.round(o.size * H), maxW = o.maxWidth * W, gap = px * 0.3;
    var rtl = AR.test(words.map(function (w) { return w.text; }).join(' '));
    ctx.font = fontFor(o, H); ctx.direction = rtl ? 'rtl' : 'ltr';
    var lines = [[]], lw = [0];
    words.forEach(function (w, i) {
      var t = o.uppercase && !rtl ? String(w.text).toUpperCase() : String(w.text);
      var ww = ctx.measureText(t).width * (o.style === 'bold' ? 1.06 : 1);
      var L = lines.length - 1;
      if (lines[L].length && lw[L] + gap + ww > maxW) { lines.push([]); lw.push(0); L++; }
      lines[L].push({ i: i, t: t, w: ww }); lw[L] += (lines[L].length > 1 ? gap : 0) + ww;
    });
    var lineH = px * 1.32, baseY = typeof o.y === 'number' ? H * o.y - (lines.length - 1) * lineH / 2 : o.position === 'top' ? H * 0.16 : o.position === 'center' ? H * 0.5 - (lines.length - 1) * lineH / 2 : H * 0.82 - (lines.length - 1) * lineH;
    return lines.map(function (ln, li) {
      var x = rtl ? (W + lw[li]) / 2 : (W - lw[li]) / 2, out = [];
      ln.forEach(function (wd) {
        if (rtl) { x -= wd.w; out.push({ i: wd.i, t: wd.t, x: x, w: wd.w }); x -= gap; }
        else { out.push({ i: wd.i, t: wd.t, x: x, w: wd.w }); x += wd.w + gap; }
      });
      return { y: baseY + li * lineH, words: out, rtl: rtl };
    });
  }

  function roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /**
   * Draw one caption card at absolute time t. cue: {start, end, words:[{text,start,end}]}
   */
  function draw(ctx, cue, t, o, W, H) {
    o = opts(o);
    ctx.clearRect(0, 0, W, H);
    if (!cue || !cue.words || !cue.words.length || t < cue.start || t > cue.end + 0.05) return;
    var px = Math.round(o.size * H);
    var lines = layout(ctx, cue.words, o, W, H);
    // still = plain captions: the whole card shows at once, no highlight, no motion
    if (o.still) { o.anim = 'none'; o.exit = 'none'; }
    var anim = o.anim && o.anim !== 'none';
    var cardIn = anim || o.still ? 1 : clamp((t - cue.start) / 0.12, 0, 1), cardOut = (o.exit && o.exit !== 'none') || o.still ? 1 : clamp((cue.end - t) / 0.1, 0, 1);
    var cardA = Math.min(cardIn, cardOut);
    var dist = px * o.distance;
    var exitX = o.exit && o.exit !== 'none' ? clamp(1 - (cue.end - t) / Math.max(0.05, o.exitDur), 0, 1) : 0;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    lines.forEach(function (ln) {
      ctx.direction = ln.rtl ? 'rtl' : 'ltr';
      ln.words.forEach(function (wd) {
        var w = cue.words[wd.i];
        var active = !o.still && t >= w.start && t < w.end + 0.02;
        var spoken = o.still || t >= w.start;
        var k = o.still ? 1 : clamp((t - w.start) / 0.14, 0, 1); // per-word entrance 0..1 (built-in style motion)
        var scale = 1, alpha = cardA, color = o.text, dy = 0, rot = 0;
        ctx.font = fontFor(o, H);
        switch (o.style) {
          case 'karaoke': color = spoken ? o.accent : o.text; scale = active ? 1.08 : 1; break;
          case 'pop': if (!spoken && !anim) return; scale = anim ? 1 : 0.4 + 0.6 * easeOutBack(k); color = active ? o.accent : o.text; break;
          case 'box': break;
          case 'bold': color = active ? o.accent : o.text; scale = active ? 1.12 + 0.06 * Math.sin(k * Math.PI) : 1; rot = active ? (wd.i % 2 ? 2 : -2) * (1 - k) : 0; break;
          case 'neon': color = active ? '#FFFFFF' : o.text; break;
          case 'gradient': break;
          case 'minimal': ctx.font = fontFor(o, H, 700); alpha = cardA * (spoken ? 1 : 0.45); break;
          case 'typewriter': if (!spoken) return; break;
          case 'hormozi': color = active ? o.accent : o.text; scale = active ? 1.1 : 1; break;
          case 'beast': color = BEAST[wd.i % BEAST.length]; scale = active ? 1.15 : 1; rot = (wd.i % 2 ? 3 : -3); break;
          case 'highlighter': color = spoken ? '#111111' : o.text; break;
          case 'outline': break;
          case 'lyric': ctx.font = fontFor(o, H, 600); alpha = cardA * (active ? 1 : spoken ? 0.75 : 0.35); break;
        }
        // word entrance (drop from the top, from the side…) on its own speed curve
        var mo = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, blur: 0, chars: 1 };
        if (anim) {
          var st0 = wordStart(cue, wd.i, o);
          if (t < st0) return;
          var kk = clamp((t - st0) / Math.max(0.03, o.animDur), 0, 1);
          mo = motion(o, kk, ease(o.ease, kk, o.strength), dist, ln.rtl, t, wd.i);
        }
        var ex = exitX > 0 ? exitMotion(o, exitX, dist, ln.rtl) : null;
        var cx = wd.x + wd.w / 2 + mo.dx + (ex ? ex.dx : 0), cy = ln.y + dy + mo.dy + (ex ? ex.dy : 0);
        ctx.save();
        ctx.globalAlpha = clamp(alpha * mo.alpha * (ex ? ex.alpha : 1), 0, 1);
        var blur = mo.blur + (ex ? ex.blur : 0);
        if (blur > 0.3) ctx.filter = 'blur(' + (blur * px / 80).toFixed(1) + 'px)';
        ctx.translate(cx, cy); ctx.rotate((rot + mo.rot) * Math.PI / 180);
        ctx.scale(scale * mo.sx * (ex ? ex.sx : 1), scale * mo.sy * (ex ? ex.sy : 1)); ctx.translate(-wd.w / 2, 0);
        var text = wd.t;
        if (o.style === 'typewriter' && !o.still) { var chars = Array.from(text); text = chars.slice(0, Math.max(1, Math.ceil(chars.length * clamp((t - w.start) / Math.max(0.08, w.end - w.start), 0, 1)))).join(''); }
        if (mo.chars < 1) { var cs = Array.from(text); text = cs.slice(0, Math.max(1, Math.ceil(cs.length * mo.chars))).join(''); }
        if (o.style === 'box' && active) {
          ctx.fillStyle = o.box; ctx.shadowColor = o.box; ctx.shadowBlur = px * 0.5;
          roundRect(ctx, -px * 0.22, -px * 0.62, wd.w + px * 0.44, px * 1.24, px * 0.28); ctx.fill(); ctx.shadowBlur = 0;
        }
        if (o.style === 'highlighter' && spoken) {
          var sw = clamp((t - w.start) / 0.18, 0, 1);
          ctx.fillStyle = o.accent; ctx.globalAlpha *= active ? 1 : 0.82;
          roundRect(ctx, -px * 0.12, -px * 0.42, (wd.w + px * 0.24) * sw, px * 0.9, px * 0.12); ctx.fill();
          ctx.globalAlpha = clamp(alpha * mo.alpha * (ex ? ex.alpha : 1), 0, 1);
        }
        if (o.style === 'neon') { ctx.shadowColor = o.accent; ctx.shadowBlur = px * (active ? 0.9 : 0.4); }
        else if (o.style === 'lyric') { ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = active ? px * 0.5 : 0; }
        else if (o.style !== 'box' && o.style !== 'highlighter') { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.05; }
        if (o.style === 'beast') { ctx.shadowBlur = 0; ctx.fillStyle = '#000'; ctx.lineWidth = px * 0.22; ctx.strokeStyle = '#000'; ctx.strokeText(text, px * 0.05, px * 0.09); ctx.fillText(text, px * 0.05, px * 0.09); }
        if (o.style === 'bold' || o.style === 'karaoke' || o.style === 'pop' || o.style === 'hormozi' || o.style === 'beast') { ctx.lineWidth = px * (o.style === 'hormozi' ? 0.2 : 0.16); ctx.strokeStyle = o.stroke; ctx.strokeText(text, 0, 0); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
        if (o.style === 'outline') {
          // hollow letters: thick stroke, then punch the inside out (no seams where Arabic letters join)
          ctx.shadowBlur = 0; ctx.lineWidth = px * 0.12; ctx.strokeStyle = active ? o.accent : o.text; ctx.strokeText(text, 0, 0);
          ctx.globalCompositeOperation = 'destination-out'; ctx.fillText(text, 0, 0); ctx.globalCompositeOperation = 'source-over';
          if (active) { ctx.fillStyle = o.accent; ctx.fillText(text, 0, 0); } // hollow words, the spoken one fills in
          ctx.restore(); return;
        }
        if (o.style === 'gradient') {
          var g = ctx.createLinearGradient(0, -px / 2, wd.w, px / 2);
          g.addColorStop(0, active ? o.accent : o.text); g.addColorStop(1, active ? o.box : o.text);
          ctx.fillStyle = g;
        } else ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        if (o.style === 'neon' && active) { ctx.shadowBlur = px * 1.6; ctx.fillText(text, 0, 0); }
        ctx.restore();
      });
    });
  }

  /**
   * A key that's the same for frames that look the same (nothing moving) → the renderer reuses the last frame
   * instead of reading the canvas again. null = this frame is mid-animation.
   */
  function frameKey(cue, t, o) {
    o = opts(o);
    if (!cue || !cue.words || t < cue.start || t > cue.end + 0.05) return 'empty';
    if (o.still) return 'still';
    if (o.anim === 'wave' || o.anim === 'glitch' || o.style === 'typewriter') return null;
    var anim = o.anim && o.anim !== 'none';
    var cardIn = anim ? 1 : clamp((t - cue.start) / 0.12, 0, 1), cardOut = o.exit && o.exit !== 'none' ? 1 : clamp((cue.end - t) / 0.1, 0, 1);
    if ((cardIn > 0 && cardIn < 1) || (cardOut > 0 && cardOut < 1)) return null;
    if (o.exit && o.exit !== 'none' && cue.end - t < o.exitDur) return null;
    var key = '';
    for (var i = 0; i < cue.words.length; i++) {
      var w = cue.words[i], k = (t - w.start) / 0.14;
      if (k > 0 && k < 1) return null;
      if (o.style === 'highlighter' && t - w.start > 0 && t - w.start < 0.18) return null;
      if (anim) { var kk = (t - wordStart(cue, i, o)) / Math.max(0.03, o.animDur); if (kk > 0 && kk < 1) return null; key += kk >= 1 ? 'v' : 'h'; }
      key += (t >= w.start && t < w.end + 0.02) ? 'A' : t >= w.start ? 's' : '-';
    }
    return key + (cardOut === 0 ? 'x' : '');
  }

  return { frameKey: frameKey, STYLES: STYLES, ANIMS: ANIMS, EASES: EASES, EXITS: EXITS, DEFAULTS: DEFAULTS, opts: opts, layout: layout, draw: draw, ease: ease, wordStart: wordStart };
});

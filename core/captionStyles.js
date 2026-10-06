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
    { id: 'typewriter', name: 'آلة كاتبة' }
  ];

  var DEFAULTS = { style: 'bold', position: 'bottom', size: 0.068, text: '#FFFFFF', accent: '#FFD84D', box: '#7C3AED', stroke: '#000000', font: 'EF Cairo, Cairo, Segoe UI, Arial, sans-serif', maxWidth: 0.84, uppercase: false };
  var AR = /[\u0600-\u06FF]/;

  function opts(o) { var r = {}, k; for (k in DEFAULTS) r[k] = DEFAULTS[k]; for (k in (o || {})) if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

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
    var cardIn = clamp((t - cue.start) / 0.12, 0, 1), cardOut = clamp((cue.end - t) / 0.1, 0, 1);
    var cardA = Math.min(cardIn, cardOut);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    lines.forEach(function (ln) {
      ctx.direction = ln.rtl ? 'rtl' : 'ltr';
      ln.words.forEach(function (wd) {
        var w = cue.words[wd.i];
        var active = t >= w.start && t < w.end + 0.02;
        var spoken = t >= w.start;
        var k = clamp((t - w.start) / 0.14, 0, 1); // per-word entrance 0..1
        var scale = 1, alpha = cardA, color = o.text, dy = 0, rot = 0;
        ctx.font = fontFor(o, H);
        switch (o.style) {
          case 'karaoke': color = spoken ? o.accent : o.text; scale = active ? 1.08 : 1; break;
          case 'pop': if (!spoken) return; scale = 0.4 + 0.6 * easeOutBack(k); color = active ? o.accent : o.text; break;
          case 'box': break;
          case 'bold': color = active ? o.accent : o.text; scale = active ? 1.12 + 0.06 * Math.sin(k * Math.PI) : 1; rot = active ? (wd.i % 2 ? 2 : -2) * (1 - k) : 0; break;
          case 'neon': color = active ? '#FFFFFF' : o.text; break;
          case 'gradient': break;
          case 'minimal': ctx.font = fontFor(o, H, 700); alpha = cardA * (spoken ? 1 : 0.45); break;
          case 'typewriter': if (!spoken) return; break;
        }
        var cx = wd.x + wd.w / 2, cy = ln.y + dy;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy); ctx.rotate(rot * Math.PI / 180); ctx.scale(scale, scale); ctx.translate(-wd.w / 2, 0);
        var text = wd.t;
        if (o.style === 'typewriter') { var chars = Array.from(text); text = chars.slice(0, Math.max(1, Math.ceil(chars.length * clamp((t - w.start) / Math.max(0.08, w.end - w.start), 0, 1)))).join(''); }
        if (o.style === 'box' && active) {
          ctx.fillStyle = o.box; ctx.shadowColor = o.box; ctx.shadowBlur = px * 0.5;
          roundRect(ctx, -px * 0.22, -px * 0.62, wd.w + px * 0.44, px * 1.24, px * 0.28); ctx.fill(); ctx.shadowBlur = 0;
        }
        if (o.style === 'neon') { ctx.shadowColor = o.accent; ctx.shadowBlur = px * (active ? 0.9 : 0.4); }
        else if (o.style !== 'box') { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.05; }
        if (o.style === 'bold' || o.style === 'karaoke' || o.style === 'pop') { ctx.lineWidth = px * 0.16; ctx.strokeStyle = o.stroke; ctx.strokeText(text, 0, 0); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
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

  return { STYLES: STYLES, DEFAULTS: DEFAULTS, opts: opts, layout: layout, draw: draw };
});

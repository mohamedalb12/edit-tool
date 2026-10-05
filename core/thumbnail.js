'use strict';
// صانع الثامبنيل: يختار أحلى فريمات (حدة + إضاءة + لقطات) ويرسم عنوان بستايل يوتيوب.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EFThumb = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var STYLES = [{ id: 'bold', name: 'بولد يوتيوب' }, { id: 'box', name: 'بوكسات' }, { id: 'gradient', name: 'تدرج' }, { id: 'neon', name: 'نيون' }];
  var AR = /[\u0600-\u06FF]/;

  /** Laplacian variance (sharpness) + mean / spread of luminance for a gray frame. */
  function frameStats(gray, w, h) {
    var sum = 0, sum2 = 0, n = w * h, lap = 0, lap2 = 0, m = 0, x, y, i, v;
    for (i = 0; i < n; i++) { sum += gray[i]; sum2 += gray[i] * gray[i]; }
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x; v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lap += v; lap2 += v * v; m++;
    }
    var mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean)), lm = lap / m;
    return { mean: mean, contrast: std, sharpness: lap2 / m - lm * lm };
  }

  /** Higher is better: sharp, well exposed, contrasty; dark/blown/flat frames lose. */
  function score(st) {
    var exposure = 1 - Math.min(1, Math.abs(st.mean - 120) / 110);
    return Math.log10(1 + st.sharpness) * 0.55 + exposure * 0.3 + Math.min(1, st.contrast / 70) * 0.15;
  }

  function drawCover(ctx, img, W, H, zoom) {
    var iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
    var s = Math.max(W / iw, H / ih) * (zoom || 1), dw = iw * s, dh = ih * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) * 0.25, dw, dh); // keep the upper part (faces) when cropping
  }

  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [''];
    words.forEach(function (w) { var t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w; if (ctx.measureText(t).width > maxW && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t; });
    return lines.slice(0, 3);
  }

  /**
   * opts: {title, highlight (word), style, side: 'left'|'right'|'center', accent, box, text, grade (bool), emoji}
   */
  function draw(ctx, img, o, W, H) {
    o = o || {};
    var accent = o.accent || '#FFD84D', boxC = o.box || '#E11D48', textC = o.text || '#FFFFFF', side = o.side || 'left';
    ctx.save();
    ctx.filter = o.grade === false ? 'none' : 'contrast(1.12) saturate(1.25) brightness(1.03)';
    if (img) drawCover(ctx, img, W, H, 1.04); else { ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // readability gradient on the text side + vignette
    var g = side === 'center' ? ctx.createLinearGradient(0, H, 0, H * 0.35) : ctx.createLinearGradient(side === 'left' ? 0 : W, 0, side === 'left' ? W * 0.7 : W * 0.3, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (!o.title) return;
    var rtl = AR.test(o.title), px = Math.round(H * (o.size || 0.15));
    ctx.font = '900 ' + px + 'px "EF Cairo", Cairo, "Segoe UI", Arial, sans-serif';
    ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'middle';
    var maxW = side === 'center' ? W * 0.86 : W * 0.56;
    var lines = wrap(ctx, o.title, maxW);
    var lh = px * 1.12, y0 = side === 'center' ? H * 0.78 - (lines.length - 1) * lh : H / 2 - (lines.length - 1) * lh / 2;
    var x = side === 'center' ? W / 2 : side === 'left' ? W * 0.05 : W * 0.95;
    ctx.textAlign = side === 'center' ? 'center' : side === 'left' ? 'left' : 'right';
    var hl = o.highlight ? String(o.highlight) : '';
    lines.forEach(function (line, li) {
      var y = y0 + li * lh, isHl = hl && line.indexOf(hl) >= 0;
      ctx.save();
      ctx.translate(x, y); ctx.rotate((o.style === 'bold' ? -1.5 : 0) * Math.PI / 180);
      var m = ctx.measureText(line), bw = m.width;
      var bx = ctx.textAlign === 'center' ? -bw / 2 : ctx.textAlign === 'left' ? 0 : -bw;
      if (o.style === 'box') {
        ctx.fillStyle = li % 2 ? accent : boxC; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = px * 0.3;
        ctx.fillRect(bx - px * 0.25, -px * 0.62, bw + px * 0.5, px * 1.24); ctx.shadowBlur = 0;
        ctx.fillStyle = li % 2 ? '#111' : textC; ctx.fillText(line, 0, 0);
      } else if (o.style === 'gradient') {
        var gg = ctx.createLinearGradient(bx, -px / 2, bx + bw, px / 2); gg.addColorStop(0, accent); gg.addColorStop(1, boxC);
        ctx.lineWidth = px * 0.14; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(line, 0, 0);
        ctx.fillStyle = gg; ctx.fillText(line, 0, 0);
      } else if (o.style === 'neon') {
        ctx.shadowColor = accent; ctx.shadowBlur = px * 0.6; ctx.fillStyle = '#fff'; ctx.fillText(line, 0, 0); ctx.shadowBlur = px * 1.2; ctx.fillText(line, 0, 0);
      } else { // bold
        ctx.lineWidth = px * 0.2; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = px * 0.25; ctx.shadowOffsetY = px * 0.06;
        ctx.strokeText(line, 0, 0); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = isHl ? accent : textC; ctx.fillText(line, 0, 0);
      }
      ctx.restore();
    });
    if (o.emoji) {
      ctx.font = Math.round(H * 0.2) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20;
      ctx.fillText(o.emoji, side === 'left' ? W * 0.86 : side === 'right' ? W * 0.14 : W * 0.88, H * 0.2);
    }
  }

  return { STYLES: STYLES, frameStats: frameStats, score: score, draw: draw };
});

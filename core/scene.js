'use strict';
// محرّك المشاهد المتحركة: مواصفات JSON (يكتبها الوكيل أو تكتبها انت) → فريمات على canvas → ffmpeg → ملف فيديو.
// بيشتغل جوه اللوحة (Chromium) فالعربي بيتشكّل صح، وبيتخرّج أوفلاين.
(function (root, factory) {
  // Works as a <script> in the panel AND via require() — in Premiere's mixed context both window and module exist.
  var hasModule = typeof module === 'object' && module && module.exports;
  var dep = (root && root.EFCurves) || (hasModule ? require('./curves') : null);
  var api = factory(dep);
  if (hasModule) module.exports = api;
  if (root) root.EFScene = api;
})(typeof window !== 'undefined' ? window : null, function (curves) {

  const DEFAULT_STYLE = { primary: '#7C5CFF', accent: '#FFD84D', text: '#FFFFFF', background: '#0E0E14', font: 'Cairo' };
  const ANIMS = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'zoom', 'typewriter', 'wipe', 'blur', 'bounce'];

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function normalize(spec, style) {
    const st = Object.assign({}, DEFAULT_STYLE, style || {});
    const s = Object.assign({ width: 1920, height: 1080, fps: 30, duration: 4 }, spec || {});
    s.width = Math.round(num(s.width, 1920)); s.height = Math.round(num(s.height, 1080));
    s.fps = Math.min(60, Math.max(12, Math.round(num(s.fps, 30))));
    s.duration = Math.min(30, Math.max(0.5, num(s.duration, 4)));
    const bg = s.background || {};
    s.background = { type: bg.type || 'solid', colors: (bg.colors && bg.colors.length ? bg.colors : [bg.color || st.background, st.primary]), angle: num(bg.angle, 135) };
    s.transparent = s.background.type === 'transparent';
    s.layers = (s.layers || []).map((l, i) => {
      const L = Object.assign({ type: 'text', x: 0.5, y: 0.5, delay: i * 0.15, inDur: 0.5, outDur: 0.4, in: 'fade', out: 'fade' }, l);
      L.color = colorRole(L.color, st, L.type === 'text' ? st.text : st.primary);
      if (L.type === 'text') {
        L.size = num(L.size, 0.08); L.font = L.font || st.font; L.weight = L.weight || 800;
        L.align = L.align || 'center'; L.text = String(L.text == null ? '' : L.text);
        if (L.highlight) L.highlight = colorRole(L.highlight, st, st.accent);
      } else if (L.type === 'shape') {
        L.shape = L.shape || 'rect'; L.w = num(L.w, 0.4); L.h = num(L.h, 0.1); L.radius = num(L.radius, 0.2);
      }
      if (!ANIMS.includes(L.in)) L.in = 'fade';
      if (!ANIMS.includes(L.out)) L.out = 'fade';
      return L;
    });
    s.style = st;
    return s;
  }

  function colorRole(c, st, d) {
    if (!c) return d;
    if (c === 'primary' || c === 'accent' || c === 'text' || c === 'background') return st[c];
    return c;
  }

  // progress of an animation phase with easing
  function phase(t, start, dur, ease) {
    if (dur <= 0) return t >= start ? 1 : 0;
    const u = Math.min(1, Math.max(0, (t - start) / dur));
    return curves.getEasing(ease)(u);
  }

  /** returns {alpha, dx, dy, scale, reveal(0..1), blur} for a layer at time t */
  function layerState(L, t, total) {
    const st = { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: 1, blur: 0 };
    const pin = phase(t, L.delay, L.inDur, L.in === 'bounce' ? 'bounce' : L.in === 'pop' ? 'backOut' : 'expoOut');
    const outStart = num(L.outAt, total - L.outDur);
    const pout = L.out === 'none' ? 0 : phase(t, outStart, L.outDur, 'expoInOut');
    apply(st, L.in, 1 - pin, true);
    apply(st, L.out, pout, false);
    if (t < L.delay && L.in !== 'none') st.alpha = 0;
    return st;
  }

  function apply(st, anim, k, entering) {
    if (k <= 0) return;
    const d = entering ? 1 : -1;
    switch (anim) {
      case 'fade': st.alpha *= 1 - k; break;
      case 'slide-up': st.dy += 0.12 * k * d; st.alpha *= 1 - k; break;
      case 'slide-down': st.dy -= 0.12 * k * d; st.alpha *= 1 - k; break;
      case 'slide-left': st.dx += 0.2 * k * d; st.alpha *= 1 - k; break;
      case 'slide-right': st.dx -= 0.2 * k * d; st.alpha *= 1 - k; break;
      case 'pop': case 'zoom': st.scale *= 1 - k * (anim === 'pop' ? 1 : 0.4); st.alpha *= anim === 'zoom' ? 1 - k : 1; break;
      case 'bounce': st.dy -= 0.3 * k; break;
      case 'typewriter': case 'wipe': st.reveal = Math.min(st.reveal, 1 - k); break;
      case 'blur': st.blur = Math.max(st.blur, 20 * k); st.alpha *= 1 - k * 0.8; break;
      default: break;
    }
  }

  function drawBackground(ctx, s) {
    const W = s.width, H = s.height, bg = s.background;
    ctx.clearRect(0, 0, W, H);
    if (s.transparent) return;
    if (bg.type === 'gradient') {
      const a = (bg.angle || 135) * Math.PI / 180, r = Math.hypot(W, H) / 2;
      const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      bg.colors.forEach((c, i) => g.addColorStop(bg.colors.length === 1 ? 0 : i / (bg.colors.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = bg.colors[0];
    ctx.fillRect(0, 0, W, H);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawFrame(ctx, spec, t) {
    const s = spec.style ? spec : normalize(spec);
    const W = s.width, H = s.height;
    drawBackground(ctx, s);
    for (const L of s.layers) {
      const st = layerState(L, t, s.duration);
      if (st.alpha <= 0.001 || st.scale <= 0.001) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, st.alpha * num(L.opacity, 1)));
      if (st.blur > 0.5 && 'filter' in ctx) ctx.filter = `blur(${st.blur.toFixed(1)}px)`;
      const cx = (L.x + st.dx) * W, cy = (L.y + st.dy) * H;
      ctx.translate(cx, cy); ctx.scale(st.scale, st.scale);
      if (L.rotation) ctx.rotate(L.rotation * Math.PI / 180);
      if (L.type === 'shape') {
        const w = L.w * W * (L.in === 'wipe' || L.out === 'wipe' ? st.reveal : 1), h = L.h * H;
        ctx.fillStyle = L.color;
        if (L.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (L.shape === 'line') { ctx.fillRect(-w / 2, -Math.max(2, h) / 2, w, Math.max(2, h)); }
        else { roundRect(ctx, -L.w * W / 2, -h / 2, w, h, L.radius * h); ctx.fill(); }
      } else if (L.type === 'text') {
        const px = Math.round(L.size * H);
        ctx.font = `${L.weight} ${px}px "${L.font}", "Cairo", "Tajawal", "Segoe UI", "Arial", sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.direction = /[؀-ۿ]/.test(L.text) ? 'rtl' : 'ltr';
        ctx.textAlign = L.align === 'center' ? 'center' : (L.align === 'right' ? 'right' : 'left');
        let text = L.text;
        if (L.in === 'typewriter' && st.reveal < 1) text = Array.from(text).slice(0, Math.ceil(Array.from(text).length * st.reveal)).join('');
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          const y = (i - (lines.length - 1) / 2) * px * 1.25;
          if (L.box) {
            const m = ctx.measureText(line), pad = px * 0.35;
            const bx = ctx.textAlign === 'center' ? -m.width / 2 : ctx.textAlign === 'right' ? -m.width : 0;
            ctx.save(); ctx.globalAlpha *= num(L.boxOpacity, 1); ctx.fillStyle = colorRole(L.box, s.style, s.style.primary);
            roundRect(ctx, bx - pad, y - px * 0.65, m.width + pad * 2, px * 1.3, px * 0.25); ctx.fill(); ctx.restore();
          }
          if (L.stroke) { ctx.lineWidth = Math.max(2, px * 0.08); ctx.strokeStyle = colorRole(L.stroke, s.style, '#000'); ctx.strokeText(line, 0, y); }
          if (L.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = px * 0.15; ctx.shadowOffsetY = px * 0.04; }
          ctx.fillStyle = L.color;
          ctx.fillText(line, 0, y);
          ctx.shadowColor = 'transparent';
          if (L.wipe === 'underline' || L.underline) {
            const m = ctx.measureText(line);
            ctx.fillStyle = L.highlight || s.style.accent;
            const uw = m.width * phase(t, L.delay + L.inDur * 0.6, 0.4, 'expoOut');
            const ux = ctx.textAlign === 'center' ? -m.width / 2 : ctx.textAlign === 'right' ? -m.width : 0;
            ctx.fillRect(ctx.direction === 'rtl' && ctx.textAlign !== 'left' ? ux + m.width - uw : ux, y + px * 0.62, uw, Math.max(3, px * 0.08));
          }
        });
      }
      ctx.restore();
    }
  }

  function frameCount(spec) { const s = spec.style ? spec : normalize(spec); return Math.round(s.duration * s.fps); }

  /**
   * Render all frames. `canvas` is an HTMLCanvasElement (panel) — `onFrame(pngBytes, i)` gets each PNG.
   * In the panel, onFrame writes to the ffmpeg encoder (see sceneEncode.js).
   */
  async function render(spec, canvas, onFrame, { onProgress } = {}) {
    const s = normalize(spec, spec.style);
    canvas.width = s.width; canvas.height = s.height;
    const ctx = canvas.getContext('2d');
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
    const n = frameCount(s);
    for (let i = 0; i < n; i++) {
      drawFrame(ctx, s, i / s.fps);
      const url = canvas.toDataURL('image/png');
      const b64 = url.slice(url.indexOf(',') + 1);
      await onFrame(b64, i);
      if (onProgress && i % 10 === 0) onProgress(i / n);
    }
    return { frames: n, fps: s.fps, width: s.width, height: s.height, transparent: s.transparent, duration: s.duration };
  }

  return { DEFAULT_STYLE, ANIMS, normalize, drawFrame, layerState, frameCount, render };
});

'use strict';
// كلام متحرك مع الصوت (Kinetic Typography): كل كلمة ليرها، بتظهر في نفس لحظة ما بتتقال — جمل قصيرة، عربي من اليمين.

const STYLES = { pop: 'كلمة كلمة بتنط', highlight: 'الجملة كلها والكلمة الحالية منوّرة', stack: 'كلام كبير ورا بعض (هورموزي)', typewriter: 'آلة كاتبة', slide: 'بتدخل من الجنب' };
const hasArabic = s => /[؀-ۿ]/.test(s);

/** words [{text, start, end}] → phrases (break on a pause, punctuation, or maxWords) */
function phrases(words, { maxWords = 4, pause = 0.45 } = {}) {
  const out = []; let cur = null;
  for (const w of words) {
    const text = String(w.text || '').trim(); if (!text) continue;
    if (!cur || cur.words.length >= maxWords || w.start - cur.end > pause) { cur = { words: [], start: w.start, end: w.end }; out.push(cur); }
    cur.words.push({ text, start: w.start, end: w.end }); cur.end = w.end;
    if (/[.!?؟،,…]$/.test(text)) cur = null;
  }
  return out;
}
/** rough text width (no font metrics in Node): Arabic letters join, so a bit narrower */
const widthOf = (t, size, bold) => t.length * size * (hasArabic(t) ? 0.46 : 0.55) * (bold ? 1.08 : 1);

/**
 * Words → raw scene layers. o: { style, size, color, accent, font, comp: {width, height}, maxWords, upper, y }
 */
function layers(words, o = {}) {
  const comp = o.comp || { width: 1920, height: 1080 }, W = comp.width, H = comp.height, style = STYLES[o.style] ? o.style : 'pop';
  const size = +o.size || Math.round(Math.min(W, H) * (style === 'stack' ? 0.11 : 0.075)), color = o.color || '#ffffff', accent = o.accent || '#f97316';
  const ph = phrases(words, { maxWords: style === 'stack' ? 3 : +o.maxWords || 4 });
  const out = [];
  ph.forEach((p, pi) => {
    const rtl = hasArabic(p.words.map(w => w.text).join(' '));
    // lines: stack = one word a line; else wrap at 80% of the width
    const lines = [];
    if (style === 'stack') p.words.forEach(w => lines.push([w]));
    else { let line = [], lw = 0; for (const w of p.words) { const ww = widthOf(w.text, size); if (line.length && lw + ww > W * 0.8) { lines.push(line); line = []; lw = 0; } line.push(w); lw += ww + size * 0.3; } if (line.length) lines.push(line); }
    const lh = size * (style === 'stack' ? 1.05 : 1.3), cy = o.y || H * (style === 'stack' ? 0.5 : 0.78), top = cy - (lines.length - 1) * lh / 2;
    const pEnd = Math.max(p.end + 0.2, (ph[pi + 1] ? Math.min(ph[pi + 1].start, p.end + 0.6) : p.end + 0.6));
    lines.forEach((line, li) => {
      const ws = line.map(w => widthOf(o.upper ? w.text.toUpperCase() : w.text, size, style === 'stack')), total = ws.reduce((a, b) => a + b, 0) + size * 0.3 * (line.length - 1);
      let x = rtl ? W / 2 + total / 2 : W / 2 - total / 2;
      line.forEach((w, wi) => {
        const cx = rtl ? x - ws[wi] / 2 : x + ws[wi] / 2;
        x = rtl ? x - ws[wi] - size * 0.3 : x + ws[wi] + size * 0.3;
        const t0 = Math.max(0, w.start - p.start), te = pEnd - p.start, wsize = style === 'stack' ? Math.round(size * (wi === 0 && line.length === 1 && w.text.length <= 4 ? 1.25 : 1)) : size;
        const L = { type: 'text', name: `W${pi + 1}-${li + 1}-${wi + 1}`, text: o.upper ? w.text.toUpperCase() : w.text, size: wsize, color, font: o.font, start: +p.start.toFixed(3), end: +pEnd.toFixed(3),
          transform: { position: [Math.round(cx), Math.round(top + li * lh)] }, effects: [{ name: 'shadow', params: { opacity: 55, distance: 4, softness: 14 } }], keys: {} };
        if (style === 'pop' || style === 'stack') { L.keys.scale = [[t0, 0, 'backOut'], [t0 + 0.25, 100]]; L.keys.opacity = [[t0, 0, 'hold'], [t0 + 0.02, 100], [te - 0.12, 100, 'easeIn'], [te, 0]]; }
        if (style === 'typewriter') L.keys.opacity = [[t0, 0, 'hold'], [t0 + 0.01, 100], [te - 0.1, 100], [te, 0]];
        if (style === 'slide') { L.keys.position = [[t0, [Math.round(cx + (rtl ? 60 : -60)), Math.round(top + li * lh)], 'expoOut'], [t0 + 0.35, [Math.round(cx), Math.round(top + li * lh)]]]; L.keys.opacity = [[t0, 0], [t0 + 0.15, 100], [te - 0.12, 100], [te, 0]]; }
        if (style === 'highlight' || style === 'stack') {
          // the word lights up while it's being said
          const tw = Math.max(t0 + 0.05, w.end - p.start);
          L.effects.push({ name: 'fill', params: { color } });
          L.keys['fx:fill.color'] = [[Math.max(0, t0 - 0.01), color, 'hold'], [t0, accent, 'hold'], [tw, color, 'hold']];
          if (style === 'highlight') { L.keys.scale = [[t0, 100, 'easeOut'], [t0 + 0.12, 112, 'easeIn'], [tw, 100]]; L.keys.opacity = [[0, 0], [0.15, 100], [te - 0.12, 100], [te, 0]]; }
        }
        out.push(L);
      });
    });
  });
  return out;
}

module.exports = { STYLES, phrases, layers, widthOf };

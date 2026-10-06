'use strict';
// المناطق الآمنة لريلز/تيك توك/شورتس: فين زراير المنصة والكابشن بتاعها بيغطّوا الفيديو،
// وفحص تلقائي إن الوشوش والكابشن والعناوين بعيدة عنها.

// margins as fractions of a 9:16 frame (top, bottom, left, right) + the UI blocks we draw on the guide
const PLATFORMS = {
  tiktok: {
    label: 'تيك توك', margins: { top: 0.08, bottom: 0.2, left: 0.055, right: 0.14 },
    ui: [['top', 0, 0, 1, 0.075, 'التابات'], ['rail', 0.86, 0.38, 0.14, 0.45, 'لايك/كومنت/شير'], ['caption', 0, 0.8, 0.84, 0.2, 'الاسم والكابشن والمزيكا']]
  },
  reels: {
    label: 'ريلز إنستجرام', margins: { top: 0.12, bottom: 0.27, left: 0.06, right: 0.13 },
    ui: [['top', 0, 0, 1, 0.1, 'Reels / الكاميرا'], ['rail', 0.87, 0.5, 0.13, 0.42, 'لايك/كومنت/شير'], ['caption', 0, 0.75, 0.86, 0.25, 'الاسم والكابشن والمزيكا']]
  },
  shorts: {
    label: 'يوتيوب شورتس', margins: { top: 0.09, bottom: 0.23, left: 0.05, right: 0.15 },
    ui: [['top', 0, 0, 1, 0.08, 'البحث / المنيو'], ['rail', 0.85, 0.4, 0.15, 0.5, 'لايك/ديسلايك/كومنت/شير'], ['caption', 0, 0.78, 0.84, 0.22, 'العنوان والقناة واشترك']]
  }
};

function margins(platform) {
  if (platform === 'all') {
    const m = { top: 0, bottom: 0, left: 0, right: 0 };
    Object.values(PLATFORMS).forEach(p => Object.keys(m).forEach(k => { m[k] = Math.max(m[k], p.margins[k]); }));
    return m;
  }
  const p = PLATFORMS[platform]; if (!p) throw new Error('منصة مش معروفة: ' + platform);
  return p.margins;
}

/** The safe rectangle {x,y,w,h} (fractions). */
function safeRect(platform) {
  const m = margins(platform);
  return { x: m.left, y: m.top, w: 1 - m.left - m.right, h: 1 - m.top - m.bottom };
}

/** Where a box {x,y,w,h} (fractions) crosses the unsafe margins → [{side, amount}] (amount = overlap fraction of the box). */
function violations(box, platform) {
  const r = safeRect(platform), out = [];
  const area = Math.max(1e-6, box.w * box.h);
  const over = (x0, y0, x1, y1) => { const w = Math.max(0, Math.min(box.x + box.w, x1) - Math.max(box.x, x0)); const h = Math.max(0, Math.min(box.y + box.h, y1) - Math.max(box.y, y0)); return (w * h) / area; };
  const sides = { top: over(0, 0, 1, r.y), bottom: over(0, r.y + r.h, 1, 1), left: over(0, 0, r.x, 1), right: over(r.x + r.w, 0, 1, 1) };
  for (const [side, amount] of Object.entries(sides)) if (amount > 0.12) out.push({ side, amount: +amount.toFixed(2) });
  return out;
}

/** A face from the source frame → box in the vertical sequence frame (clip scaled to fill and centred). */
function faceToFrame(face, { srcW, srcH, seqW, seqH, scale = null }) {
  const s = scale || Math.max(seqW / srcW, seqH / srcH);
  const dw = srcW * s, dh = srcH * s, ox = (seqW - dw) / 2, oy = (seqH - dh) / 2;
  const x = (ox + (face.cx - face.w / 2) * dw) / seqW, y = (oy + (face.cy - face.h / 2) * dh) / seqH;
  return { x, y, w: (face.w * dw) / seqW, h: (face.h * dh) / seqH };
}

const SIDE_AR = { top: 'فوق', bottom: 'تحت', left: 'شمال', right: 'يمين (زراير المنصة)' };

/**
 * Check faces (sampled over time) + caption block against a platform.
 * faces: [{time, box}] in frame fractions; captionY: centre of the caption block (fraction) or null.
 */
function check({ platform = 'all', faces = [], captionBox = null, texts = [] }) {
  const issues = [];
  // one issue per stretch of trouble (not one per sampled frame)
  let prevBad = false, prevT = -10;
  for (const f of faces.slice().sort((a, b) => a.time - b.time)) {
    const v = violations(f.box, platform);
    const bad = v.length > 0;
    if (bad && (!prevBad || f.time - prevT > 2.5)) issues.push({ kind: 'face', time: +f.time.toFixed(2), sides: v, text: `الوش قريب من ${v.map(x => SIDE_AR[x.side]).join(' و')}` });
    prevBad = bad; prevT = f.time;
  }
  if (captionBox) { const v = violations(captionBox, platform); if (v.length) issues.push({ kind: 'caption', time: null, sides: v, text: `الكابشن تحت ${v.map(x => SIDE_AR[x.side]).join(' و')} — هيتغطّى` }); }
  for (const t of texts) { const v = violations(t.box, platform); if (v.length) issues.push({ kind: 'text', time: t.time, sides: v, text: `${t.name || 'نص'} قريب من ${v.map(x => SIDE_AR[x.side]).join(' و')}` }); }
  const facesOk = faces.length ? faces.filter(f => !violations(f.box, platform).length).length / faces.length : 1;
  return { platform, safe: safeRect(platform), issues, score: Math.round(facesOk * 100) };
}

/** Caption vertical centre that sits just above the platform's bottom UI (fraction of height). */
function captionY(platform = 'all') { const m = margins(platform); return +(1 - m.bottom - 0.07).toFixed(3); }

module.exports = { PLATFORMS, margins, safeRect, violations, faceToFrame, check, captionY };

'use strict';
// زووم تلقائي من قوة الصوت (زي AutoZoom / zoom cuts): من غير AI ومن غير تفريغ — بيسمع الصوت، يقسمه لجمل،
// ويختار الجمل اللي فيها تأكيد (أعلى من صوتك العادي) ويعمل عليها زووم.

/** RMS in dB per hop (seconds) of mono PCM */
function envelope(pcm, rate, hop = 0.05) {
  const n = Math.max(1, Math.round(rate * hop)), out = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let s = 0; for (let j = i; j < i + n; j++) s += pcm[j] * pcm[j];
    out.push(10 * Math.log10(s / n + 1e-12));
  }
  return out;
}

function median(a) { if (!a.length) return -90; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/**
 * Spoken phrases from an envelope: runs of sound (level-relative threshold) split by pauses ≥ gap.
 * Each phrase: { start, end, loud } — loud = how much louder than this voice's usual level (dB) its strongest
 * part is (mean of its top 30% hops), the "emphasis" score.
 */
function phrases(env, { hop = 0.05, gap = 0.3, minLen = 0.4 } = {}) {
  const voiced = env.filter(v => v > -60);
  const ref = median(voiced.length ? voiced : env);
  const thr = Math.max(-55, ref - 14);
  const out = [];
  let st = -1, quiet = 0;
  const close = endIdx => {
    const a = st * hop, b = endIdx * hop;
    if (b - a >= minLen) {
      const seg = env.slice(st, endIdx).slice().sort((x, y) => y - x);
      const top = seg.slice(0, Math.max(1, Math.round(seg.length * 0.3)));
      out.push({ start: +a.toFixed(3), end: +b.toFixed(3), loud: +(top.reduce((s, v) => s + v, 0) / top.length - ref).toFixed(2) });
    }
    st = -1; quiet = 0;
  };
  for (let i = 0; i < env.length; i++) {
    if (env[i] > thr) { if (st < 0) st = i; quiet = 0; }
    else if (st >= 0 && ++quiet * hop >= gap) close(i - quiet + 1);
  }
  if (st >= 0) close(env.length - (quiet || 0));
  return out;
}

const DENSITY = { low: 0.18, medium: 0.32, high: 0.5 };

/**
 * Which phrases get a zoom: the most emphatic ones (density = share of phrases), never two within minGap
 * seconds, never the first phrase of the video (the opening shot stays wide). Levels alternate so it never looks
 * like one long zoom. → [{ start, end, scale }]
 */
function pick(list, { density = 'medium', minGap = 3, scale = 115, alt = 108 } = {}) {
  const share = DENSITY[density] || +density || DENSITY.medium;
  const want = Math.max(1, Math.round(list.length * share));
  const ranked = list.map((p, i) => ({ ...p, i })).filter(p => p.i > 0 || list.length === 1).sort((a, b) => b.loud - a.loud);
  const chosen = [];
  for (const p of ranked) {
    if (chosen.length >= want) break;
    if (chosen.some(c => p.start < c.end + minGap && p.end > c.start - minGap)) continue;
    chosen.push(p);
  }
  chosen.sort((a, b) => a.start - b.start);
  return chosen.map((p, k) => ({ start: p.start, end: p.end, loud: p.loud, scale: k % 3 === 2 ? alt : scale }));
}

/**
 * Keyframes for one zoom, relative to its start (applyKeyframes "at" mode), scale in %:
 *  jump   → cut in on the phrase, cut back out after it (the YouTube "zoom cut")
 *  smooth → quick eased push in, eased back out
 *  punch  → a short punch on the first beat of the phrase, then back
 */
function keys(z, style = 'jump', fps = 30) {
  const f = 1 / (fps || 30), len = Math.max(0.3, z.end - z.start), S = z.scale;
  const HOLD = 4, BEZ = 5;
  if (style === 'smooth') {
    const ramp = Math.min(0.35, len / 3);
    return [{ t: 0, v: 100, interp: BEZ }, { t: ramp, v: S, interp: BEZ }, { t: Math.max(ramp + f, len - ramp), v: S, interp: BEZ }, { t: len, v: 100, interp: BEZ }];
  }
  if (style === 'punch') {
    return [{ t: -f, v: 100, interp: HOLD }, { t: 0, v: S + 4, interp: BEZ }, { t: Math.min(0.5, len), v: S, interp: BEZ }, { t: Math.min(len, 1.6), v: 100, interp: HOLD }];
  }
  return [{ t: -f, v: 100, interp: HOLD }, { t: 0, v: S, interp: HOLD }, { t: len, v: 100, interp: HOLD }];
}

module.exports = { envelope, phrases, pick, keys, DENSITY };

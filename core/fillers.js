'use strict';
// كلمات الحشو (اممم، آآآ، يعني…) + الكلام اللي محتاج تنزيل صوت (بيب): بيلاقيها من توقيت الكلمات ويرجّع أماكنها.
const { normalizeForSearch: normalize } = require('./arabicFix');

// hesitation sounds: always safe to cut
const SOUNDS = ['اممم', 'امم', 'ام', 'ممم', 'مم', 'اا', 'ااا', 'آآ', 'آآآ', 'إإ', 'إإإ', 'ههم', 'اه اه', 'um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm'];
// words that are fillers only sometimes: off by default, the editor ticks what they want
const OPTIONAL = ['يعني', 'بص', 'بقى', 'طيب', 'إيه', 'ايه', 'فاهمني', 'زي', 'like', 'you know', 'basically', 'actually', 'so'];

const key = s => normalize(String(s || '')).replace(/[^\p{L}\p{N} ]/gu, '').trim();
/** a stretched sound like "امممممم" or "آآآآ" counts as a hesitation even if it isn't in the list */
const STRETCH = /^(ا|آ|إ|أ)?(م{2,}|ا{2,}|آ{2,}|ه{3,})$|^(u+m+|u+h+|e+r+m*|a+h+|h+m+)$/i;

/**
 * Find filler words in timed words. Returns ranges to cut [{start,end,text,kind}] — merged when they touch,
 * with a little padding so the cut lands in the gap, never inside the next word.
 * opts: { words:[{text,start,end}], extra:[...] optional words to include, pad }
 */
function find(words, { extra = [], pad = 0.03 } = {}) {
  const sounds = new Set(SOUNDS.map(key)), opt = new Set(extra.map(key).filter(Boolean));
  const multi = extra.map(key).filter(x => x.includes(' '));
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], k = key(w.text);
    if (!k) continue;
    let kind = null, end = i;
    if (sounds.has(k) || STRETCH.test(k)) kind = 'sound';
    else if (opt.has(k)) kind = 'word';
    else for (const m of multi) { const parts = m.split(' '); if (parts.every((p, j) => words[i + j] && key(words[i + j].text) === p)) { kind = 'word'; end = i + parts.length - 1; break; } }
    if (!kind) continue;
    const prevEnd = i > 0 ? words[i - 1].end : -Infinity, nextStart = end + 1 < words.length ? words[end + 1].start : Infinity;
    const a = Math.max(w.start - pad, prevEnd), b = Math.min(words[end].end + pad, nextStart);
    if (b - a < 0.05) { i = end; continue; }
    const text = words.slice(i, end + 1).map(x => x.text).join(' ');
    const last = out[out.length - 1];
    if (last && a - last.end < 0.05) { last.end = +b.toFixed(3); last.text += ' ' + text; } else out.push({ start: +a.toFixed(3), end: +b.toFixed(3), text, kind });
    i = end;
  }
  return out;
}

/** words from a list (swearing, a name to hide…) → where to bleep */
function findWords(words, list, { pad = 0.02 } = {}) {
  const want = list.map(key).filter(Boolean), out = [];
  for (let i = 0; i < words.length; i++) {
    const k = key(words[i].text);
    if (want.some(x => k === x || (x.length >= 3 && k.includes(x)))) out.push({ start: +(words[i].start - pad).toFixed(3), end: +(words[i].end + pad).toFixed(3), text: words[i].text });
  }
  return out;
}

module.exports = { SOUNDS, OPTIONAL, find, findWords, key };

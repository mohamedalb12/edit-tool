'use strict';
// يلاقي التكرار: كلمة مكررة ورا بعض (تهتهة) + جملة اتقالت وبعدين اتعادت (إعادة تيك) → يسيب آخر تيك.
const { normalizeForSearch } = require('./arabicFix');
const { sentences } = require('./transcribe');
const ranges = require('./ranges');

function tokens(s) { return normalizeForSearch(s).split(' ').filter(Boolean); }

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  // prefix overlap: retakes usually restart the same sentence
  let prefix = 0;
  while (prefix < A.length && prefix < B.length && A[prefix] === B[prefix]) prefix++;
  const setA = new Set(A), setB = new Set(B);
  let inter = 0; setA.forEach(t => { if (setB.has(t)) inter++; });
  const jaccard = inter / (setA.size + setB.size - inter);
  const containment = inter / Math.min(setA.size, setB.size);
  return Math.max(jaccard, prefix / Math.min(A.length, B.length), containment * 0.9);
}

function findStutters(words) {
  const out = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = normalizeForSearch(words[i].text), b = normalizeForSearch(words[i + 1].text);
    if (a && a === b && words[i + 1].start - words[i].end < 0.8) {
      out.push({ start: words[i].start, end: words[i + 1].start, reason: `تكرار كلمة: ${words[i].text}` });
    }
  }
  return out;
}

/** Phrase restarted with no pause: "A B C | A B C D" → cut the first "A B C". */
function findPhraseRepeats(words, { minLen = 2, maxLen = 10 } = {}) {
  const n = words.map(w => normalizeForSearch(w.text));
  const out = [];
  let i = 0;
  while (i < n.length) {
    let found = 0;
    for (let len = Math.min(maxLen, Math.floor((n.length - i) / 2)); len >= minLen; len--) {
      let same = true;
      for (let k = 0; k < len; k++) if (!n[i + k] || n[i + k] !== n[i + len + k]) { same = false; break; }
      if (same) { found = len; break; }
    }
    if (found) {
      out.push({ start: words[i].start, end: words[i + found].start, reason: `إعادة جملة: "${words.slice(i, i + found).map(w => w.text).join(' ')}"` });
      i += found;
    } else i++;
  }
  return out;
}

function findRetakes(sents, { threshold = 0.6, lookahead = 3, minWords = 3 } = {}) {
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    if (tokens(sents[i].text).length < Math.min(minWords, 2)) continue;
    for (let j = i + 1; j <= Math.min(sents.length - 1, i + lookahead); j++) {
      if (similarity(sents[i].text, sents[j].text) >= threshold) {
        // remove sentence i and anything between it and the retake
        out.push({ start: sents[i].start, end: sents[j].start, reason: `إعادة تيك: "${sents[i].text.slice(0, 40)}"` });
        break;
      }
    }
  }
  return out;
}

function findRepeats(words, opts = {}) {
  const sents = sentences(words, opts);
  const all = [...findRetakes(sents, opts), ...findPhraseRepeats(words), ...findStutters(words)];
  const merged = ranges.merge(all);
  return { cuts: merged, details: all.sort((a, b) => a.start - b.start), sentences: sents };
}

module.exports = { similarity, findStutters, findPhraseRepeats, findRetakes, findRepeats };

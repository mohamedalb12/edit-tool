'use strict';
// بحث في الكلام المفرّغ (بيتجاهل التشكيل والهمزات).
const { normalizeForSearch } = require('./arabicFix');

function searchWords(words, query, { context = 4 } = {}) {
  const q = normalizeForSearch(query).split(' ').filter(Boolean);
  if (!q.length) return [];
  const norm = words.map(w => normalizeForSearch(w.text));
  const hits = [];
  for (let i = 0; i <= norm.length - q.length; i++) {
    let ok = true;
    for (let k = 0; k < q.length; k++) {
      const w = norm[i + k];
      const last = k === q.length - 1;
      if (!(w === q[k] || (last && w.startsWith(q[k])) || (q.length === 1 && w.includes(q[k]) && q[k].length >= 3))) { ok = false; break; }
    }
    if (ok) {
      const a = Math.max(0, i - context), b = Math.min(words.length, i + q.length + context);
      hits.push({ start: words[i].start, end: words[i + q.length - 1].end, index: i,
        context: words.slice(a, b).map(w => w.text).join(' ') });
    }
  }
  return hits;
}

module.exports = { searchWords };

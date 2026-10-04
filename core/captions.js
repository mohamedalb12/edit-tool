'use strict';
// الكابشن: تقسيم الكلمات لكروت وتحويلها لـ SRT.
const { srtTime } = require('./util');

function buildCues(words, { maxWords = 4, maxDuration = 2.5, singleWord = false, maxGap = 0.7, minDuration = 0.25 } = {}) {
  const limit = singleWord ? 1 : Math.max(1, maxWords | 0);
  const cues = [];
  let cur = null;
  for (const w of words) {
    if (!w || !String(w.text).trim()) continue;
    const startNew = !cur || cur.words.length >= limit || (w.end - cur.start) > maxDuration || (w.start - cur.end) > maxGap
      || /[.!?؟]$/.test(cur.words[cur.words.length - 1].text);
    if (startNew) { if (cur) cues.push(cur); cur = { start: w.start, end: w.end, words: [w] }; }
    else { cur.words.push(w); cur.end = w.end; }
  }
  if (cur) cues.push(cur);
  // fix overlaps + minimum display time
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], next = cues[i + 1];
    c.text = c.words.map(w => String(w.text).trim()).join(' ');
    if (c.end - c.start < minDuration) c.end = c.start + minDuration;
    if (next && c.end > next.start) c.end = Math.max(c.start + 0.05, next.start);
    delete c.words;
  }
  return cues;
}

function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

function parseSRT(text) {
  const out = [];
  for (const block of String(text).replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const tl = lines.findIndex(l => l.includes('-->'));
    if (tl < 0) continue;
    const [a, b] = lines[tl].split('-->').map(s => s.trim());
    const { parseClock } = require('./util');
    out.push({ start: parseClock(a), end: parseClock(b), text: lines.slice(tl + 1).join('\n') });
  }
  return out;
}

module.exports = { buildCues, toSRT, parseSRT };

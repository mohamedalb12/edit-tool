'use strict';
// الكابشن: تقسيم الكلمات لكروت وتحويلها لـ SRT.
const { srtTime } = require('./util');

/**
 * Words → caption cards.
 * A new card on: the word limit, the length limit (maxChars, one readable line), maxDuration, a pause in the voice
 * (pauseBreak — a card never stays up across the speaker's silence), or the end of a sentence.
 * Each card is up from its first word to its last + `hold` (time to finish reading), at least `minDuration` when the
 * gap after it allows — never over the next card.
 */
function buildCues(words, { maxWords = 4, maxDuration = 2.5, singleWord = false, maxGap, pauseBreak = 0.6, maxChars = 38, minDuration = 0.7, hold = 0.2, keepWords = false } = {}) {
  const limit = singleWord ? 1 : Math.max(1, maxWords | 0);
  const brk = maxGap !== undefined ? Math.min(maxGap, pauseBreak) : pauseBreak;
  const cues = [];
  let cur = null;
  const len = c => c.words.reduce((n, w) => n + String(w.text).trim().length + 1, -1);
  for (const w of words) {
    if (!w || !String(w.text).trim()) continue;
    const startNew = !cur || cur.words.length >= limit || (w.end - cur.start) > maxDuration || (w.start - cur.end) >= brk
      || (cur.words.length && len(cur) + 1 + String(w.text).trim().length > maxChars)
      || /[.!?؟]$/.test(cur.words[cur.words.length - 1].text);
    if (startNew) { if (cur) cues.push(cur); cur = { start: w.start, end: w.end, words: [w] }; }
    else { cur.words.push(w); cur.end = w.end; }
  }
  if (cur) cues.push(cur);
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], next = cues[i + 1], room = next ? next.start - 0.04 : Infinity;
    c.text = c.words.map(w => String(w.text).trim()).join(' ');
    c.end = Math.min(Math.max(c.end + hold, c.start + minDuration), Math.max(c.end, room));
    if (next && c.end > next.start) c.end = Math.max(c.start + 0.05, next.start);
    c.end = +c.end.toFixed(3);
    if (keepWords) c.words = c.words.map(w => ({ text: String(w.text).trim(), start: w.start, end: w.end })); else delete c.words;
  }
  return cues;
}

/**
 * Hesitation sounds Whisper writes ("آآ", "اممم", "ممم") — said, but left out of captions unless asked. "آه" (yes) stays.
 */
const FILLER = /^(ا+|ا?م{2,}|ء+|ااه+)$/;
function isFiller(text) {
  const t = String(text || '').replace(/[ًٌٍَُِّْـ.،,!?؟…]/g, '').replace(/[أإآٱ]/g, 'ا').trim();
  return !!t && FILLER.test(t) && t !== 'اه';
}
function dropFillers(words) { return words.filter(w => !isFiller(w.text)); }

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

/**
 * Whisper's word times run a little late (and drift). Each spoken phrase (words with < gap between them) is moved so
 * it starts where the voice really starts: the nearest speech onset heard in the audio, up to maxEarly sooner or
 * maxLate later. Phrases with no onset nearby stay put; phrases never overlap. Pure: onsets are timeline seconds.
 */
function snapToOnsets(words, onsets, { gap = 0.3, maxEarly = 1.2, maxLate = 0.35 } = {}) {
  if (!words.length || !onsets || !onsets.length) return { words, moved: 0 };
  const on = onsets.slice().sort((a, b) => a - b);
  const out = words.map(w => ({ ...w }));
  const phrases = [];
  for (let i = 0; i < out.length; i++) {
    if (!i || out[i].start - out[i - 1].end >= gap) phrases.push([i, i]); else phrases[phrases.length - 1][1] = i;
  }
  let prevEnd = -Infinity, moved = 0;
  for (let p = 0; p < phrases.length; p++) {
    const [a, b] = phrases[p], st = out[a].start;
    let best = null;
    for (const o of on) {
      if (o < st - maxEarly) continue;
      if (o > st + maxLate) break;
      if (o < prevEnd + 0.02) continue;
      if (best === null || Math.abs(o - st) < Math.abs(best - st)) best = o;
    }
    let d = best === null ? 0 : best - st;
    const nextStart = p + 1 < phrases.length ? out[phrases[p + 1][0]].start : Infinity;
    if (d > 0 && out[b].end + d > nextStart) d = Math.max(0, nextStart - out[b].end); // never run into the next phrase
    if (Math.abs(d) >= 0.02) { moved++; for (let i = a; i <= b; i++) { out[i].start = Math.max(0, out[i].start + d); out[i].end = Math.max(out[i].start + 0.02, out[i].end + d); } }
    prevEnd = out[b].end;
  }
  return { words: out, moved, phrases: phrases.length };
}

module.exports = { buildCues, toSRT, parseSRT, snapToOnsets, isFiller, dropFillers };

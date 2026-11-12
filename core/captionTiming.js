'use strict';
// توقيت الكابشن على الصوت نفسه: Whisper بيحط بداية الكلمة غالبًا قبل ما الصوت يبدأ (أو جوه سكتة) ونهايتها بعد ما
// الصوت يخلص. هنا كل كلمة بتتظبط على الصوت اللي تحتها: لو بدايتها في سكتة بتتأخر لحد ما الصوت يطلع، ولو نهايتها في
// سكتة بتتقدّم لحد ما الصوت يخلص — حركات صغيرة بس (≤ 0.5 ث) وماتعديش على الكلمة اللي جنبها. Pure: env = dB كل win ثانية.
const { percentile } = require('./audio');

/** voiced[] per window: louder than the recording's own floor (15th percentile) by `above` dB */
function voicing(db, { above = 12 } = {}) {
  const floor = percentile(db, 0.15);
  return Array.from(db, v => v > floor + above);
}

/**
 * words [{text,start,end}] (seconds in the same time as the envelope) → the same words, each start moved onto the first
 * voiced window and each end onto the last voiced one, when whisper put them in a silence.
 */
function alignToVoice(words, voiced, win, { maxShift = 1.2, minWord = 0.08, gap = 0.15 } = {}) {
  if (!words.length || !voiced.length) return words;
  const at = t => voiced[Math.max(0, Math.min(voiced.length - 1, Math.floor(t / win + 1e-9)))];
  const need = Math.max(1, Math.round(gap / win));
  const out = words.map(w => ({ ...w }));
  for (let k = 0; k < out.length; k++) {
    const w = out[k], next = words[k + 1];
    // Whisper starts a word where the one before it ended: the tail of that word's sound, then a pause, then this
    // word. A real pause (≥ 150 ms of no voice) inside the span = this word starts on the voice after it. Short words
    // ("ده", "إن", "ما") often end before their voice even starts, so the search goes up to 0.3 s past the end
    // (never into the next word).
    const limit = Math.min(w.start + maxShift, w.end + 0.3, next ? next.start - 0.02 : w.end + 0.3);
    const i0 = Math.floor(w.start / win + 1e-9), iMax = Math.floor(limit / win);
    let run = 0, onset = -1;
    for (let i = i0; i <= iMax && i < voiced.length; i++) { if (!voiced[i]) run++; else { if (run >= need || (run > 0 && i - run === i0)) onset = i; run = 0; } }
    if (onset > i0) { w.start = onset * win; if (w.end < w.start + minWord) w.end = Math.min(w.start + Math.max(minWord, 0.15), next ? Math.max(next.start, w.start + minWord) : w.start + 0.15); }
    // the same at the end: voice, then a pause before the end → the word ends where its voice ends
    const j1 = Math.ceil(w.end / win) - 1, jMin = Math.max(Math.ceil((w.start + minWord) / win), Math.ceil((w.end - maxShift) / win));
    run = 0; let offset = -1;
    for (let j = j1; j >= jMin; j--) { if (!voiced[j]) run++; else { if (run >= need || (run > 0 && j + run === j1)) offset = j + 1; run = 0; } }
    if (offset > 0 && offset * win < w.end) w.end = offset * win;
  }
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
  for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.04, out[i + 1].start);
  return out.map(w => ({ ...w, start: +w.start.toFixed(3), end: +Math.max(w.end, w.start + 0.04).toFixed(3) }));
}

module.exports = { voicing, alignToVoice };

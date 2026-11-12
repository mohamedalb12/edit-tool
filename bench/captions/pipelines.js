'use strict';
/*
 * The plugin's caption post-processing, as named pipelines the benchmark can compare.
 * words(raw, {file, duration}) → caption words [{text,start,end}] · cues(words) → [{start,end,idx:[word indices]}]
 * "current" = exactly what the plugin did before this work (Groq engine path): silence refine → Arabic rule fixes →
 * snap each phrase to the voice onset → cards of ≤4 words / ≤2.5 s.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const transcribe = require(path.join(ROOT, 'core', 'transcribe'));
const arabicFix = require(path.join(ROOT, 'core', 'arabicFix'));
const captions = require(path.join(ROOT, 'core', 'captions'));
const silence = require(path.join(ROOT, 'core', 'silence'));
const { run, findBinary } = require(path.join(ROOT, 'core', 'ffmpeg'));
const FF = findBinary('ffmpeg');

const cache = new Map();
async function meanVolume(file) {
  try { const { stderr } = await run(FF, ['-hide_banner', '-nostdin', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']); const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(stderr)); if (m) return +m[1]; } catch (_) {}
  return null;
}
async function silences(file, minSilence) {
  const k = file + '|' + minSilence;
  if (!cache.has(k)) {
    const mv = await meanVolume(file), thr = mv === null ? -40 : Math.min(-30, Math.max(-70, mv - 16));
    cache.set(k, await silence.detectSilence(FF, file, { thresholdDb: thr, minSilence }));
  }
  return cache.get(k);
}

/** cards with the word indices they hold (buildCues keeps words; map them back by identity of start/text) */
function cuesWithIdx(words, opts) {
  const tagged = words.map((w, i) => ({ ...w, _i: i }));
  const cs = captions.buildCues(tagged.map(w => ({ ...w })), { ...opts, keepWords: true });
  let k = 0;
  return cs.map(c => { const idx = c.words.map(() => k++); return { start: c.start, end: c.end, text: c.text, idx }; });
}

const current = {
  async words(raw, { file }) {
    let words = raw.map(w => ({ text: w.text, start: w.start, end: w.end }));
    try { words = transcribe.refineWithSilence(words, await silences(file, 0.12)); } catch (_) {}
    words = arabicFix.fixWords(arabicFix.fixPhrasesAcrossWords(words), { dialect: 'egyptian' });
    const onsets = (await silences(file, 0.2)).map(s => s.end).filter(t => t > 0.02);
    return captions.snapToOnsets(words, onsets).words;
  },
  cues(words) { return require('./legacyCaptions').buildCues ? legacyCuesEarly(words) : cuesWithIdx(words, { maxWords: 4, maxDuration: 2.5, singleWord: false }); }
};
function legacyCuesEarly(words) {
  const cs = require('./legacyCaptions').buildCues(words.map(w => ({ ...w })), { maxWords: 4, maxDuration: 2.5, keepWords: true });
  let k = 0; return cs.map(c => ({ start: c.start, end: c.end, text: c.text, idx: c.words.map(() => k++) }));
}
const newCues = words => cuesWithIdx(words, { maxWords: 4, maxDuration: 2.5, singleWord: false });
/** Whisper's words untouched (to see what each step adds or costs) */
const raw = {
  async words(rawWords) { return rawWords.map(w => ({ text: w.text, start: w.start, end: w.end })); },
  cues: current.cues
};

module.exports = { current, raw, silences, cuesWithIdx };

/* each step of "current" alone, to see which one helps and which one hurts */
const fixOnly = async rw => arabicFix.fixWords(arabicFix.fixPhrasesAcrossWords(rw.map(w => ({ text: w.text, start: w.start, end: w.end }))), { dialect: 'egyptian' });
module.exports.refineOnly = { async words(rw, { file }) { return transcribe.refineWithSilence(await fixOnly(rw), await silences(file, 0.12)); }, cues: current.cues };
module.exports.snapOnly = { async words(rw, { file }) { const on = (await silences(file, 0.2)).map(s => s.end).filter(t => t > 0.02); return captions.snapToOnsets(await fixOnly(rw), on).words; }, cues: current.cues };

/* candidates */
const timing = require(path.join(ROOT, 'core', 'captionTiming'));
const { envelope, WIN } = require('./voiced');
async function voiced(file, above) { const { db } = await envelope(file); return timing.voicing(db, { above }); }
module.exports.voice = { async words(rw, { file }) { return timing.alignToVoice(await module.exports.refineOnly.words(rw, { file }), await voiced(file, 12), WIN); }, cues: current.cues };
module.exports.voiceOnly = { async words(rw, { file }) { return timing.alignToVoice(await fixOnly(rw), await voiced(file, 12), WIN); }, cues: current.cues };
module.exports.voice8 = { async words(rw, { file }) { return timing.alignToVoice(await fixOnly(rw), await voiced(file, 8), WIN); }, cues: current.cues };
const variantOf = o => ({ async words(rw, { file }) { return timing.alignToVoice(await module.exports.refineOnly.words(rw, { file }), await voiced(file, o.above || 12), WIN, o); }, cues: current.cues });
module.exports.voiceShift12 = variantOf({ maxShift: 1.2 });
module.exports.voiceGap10 = variantOf({ gap: 0.1 });
module.exports.voiceGap20 = variantOf({ gap: 0.2 });
module.exports.voiceAbove10 = variantOf({ above: 10 });
module.exports.voiceAbove15 = variantOf({ above: 15 });
module.exports.voiceShift16 = variantOf({ maxShift: 1.6 });
module.exports.voiceShift20 = variantOf({ maxShift: 2.0 });
const legacy = require('./legacyCaptions');
function legacyCues(words) {
  const cs = legacy.buildCues(words.map(w => ({ ...w })), { maxWords: 4, maxDuration: 2.5, keepWords: true });
  let k = 0; return cs.map(c => ({ start: c.start, end: c.end, text: c.text, idx: c.words.map(() => k++) }));
}
module.exports.currentLegacy = { words: current.words, cues: legacyCues };
module.exports.voiceOldCards = { words: module.exports.voiceShift12.words, cues: legacyCues };
module.exports.voiceNewCards = { words: module.exports.voiceShift12.words, cues: newCues };

const cueVariant = o => ({ words: module.exports.voiceShift12.words, cues: w => cuesWithIdx(w, { maxWords: 4, maxDuration: 2.5, ...o }) });
module.exports.cardsP45 = cueVariant({ pauseBreak: 0.45 });
module.exports.cardsP60 = cueVariant({ pauseBreak: 0.6 });
module.exports.cardsP70 = cueVariant({ pauseBreak: 0.7 });
module.exports.cardsP60h0 = cueVariant({ pauseBreak: 0.6, hold: 0 });
module.exports.cardsP45h0 = cueVariant({ pauseBreak: 0.45, hold: 0, minDuration: 0.25 });
module.exports.cardsP35 = cueVariant({ pauseBreak: 0.35 });

/* THE PLUGIN as shipped now: transcribe.cleanUp (the same code the panel runs) + core/captions buildCues defaults */
const segsOf = raw => raw && raw.segments ? raw.segments.map(s => ({ ...s, noSpeech: s.no_speech_prob, logprob: s.avg_logprob, compression: s.compression_ratio })) : null;
module.exports.dropped = [];
module.exports.plugin = {
  async words(rw, { file, raw }) { return transcribe.cleanUp(rw.map(w => ({ text: w.text, start: w.start, end: w.end, seg: w.seg })), { ffmpeg: FF, file, dialectId: 'egyptian', segments: segsOf(raw), onDropped: d => module.exports.dropped.push(...d.map(x => ({ ...x, file }))) }); },
  cues: w => cuesWithIdx(w, { maxWords: 4, maxDuration: 2.5 })
};

module.exports.pluginNoGuard = {
  async words(rw, { file }) { return transcribe.cleanUp(rw.map(w => ({ text: w.text, start: w.start, end: w.end })), { ffmpeg: FF, file, dialectId: 'egyptian', guard: false }); },
  cues: module.exports.plugin.cues
};
module.exports.pluginCaptions = { async words(rw, o) { return captions.dropFillers(await module.exports.plugin.words(rw, o)); }, cues: module.exports.plugin.cues };

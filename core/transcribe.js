'use strict';
// تفريغ الكلام أوفلاين بـ whisper.cpp مع توقيت لكل كلمة.
const fs = require('fs');
const path = require('path');
const { run, toWav16k, requireTool } = require('./ffmpeg');
const { parseClock, hash } = require('./util');
const arabicFix = require('./arabicFix');

const DIALECTS = [
  { id: 'egyptian', label: 'مصري', lang: 'ar', prompt: 'ده فيديو باللهجة المصرية. إزيكم يا جماعة، النهارده هنتكلم عن حاجة مهمة أوي.' },
  { id: 'gulf', label: 'خليجي / سعودي', lang: 'ar', prompt: 'هذا فيديو باللهجة الخليجية. هلا والله، اليوم بنتكلم عن شي مهم وايد.' },
  { id: 'levantine', label: 'شامي', lang: 'ar', prompt: 'هاد فيديو باللهجة الشامية. مرحبا يا جماعة، اليوم رح نحكي عن شغلة كتير مهمة.' },
  { id: 'iraqi', label: 'عراقي', lang: 'ar', prompt: 'هذا فيديو باللهجة العراقية. هلا بيكم، اليوم راح نحچي عن شغلة كلش مهمة.' },
  { id: 'maghrebi', label: 'مغربي', lang: 'ar', prompt: 'هادا فيديو بالدارجة المغربية. السلام عليكم، اليوم غادي نهضرو على حاجة مهمة بزاف.' },
  { id: 'msa', label: 'فصحى', lang: 'ar', prompt: 'هذا مقطع باللغة العربية الفصحى. مرحبًا بكم، سنتحدث اليوم عن موضوع مهم.' },
  { id: 'english', label: 'English', lang: 'en', prompt: 'Hello everyone, today we are talking about something important.' }
];

function dialect(id) { return DIALECTS.find(d => d.id === id) || DIALECTS[0]; }

function buildWhisperArgs({ model, wav, outBase, dialectId = 'egyptian', threads = 4 }) {
  const d = dialect(dialectId);
  return ['-m', model, '-f', wav, '-l', d.lang, '-t', String(threads), '--prompt', d.prompt,
    '-ml', '1', '-sow', '-oj', '-of', outBase, '-np'];
}

const SPECIAL = /^\s*(\[_[A-Z]+_?\d*\]|<\|.*\|>|\[BLANK_AUDIO\]|\[موسيقى\]|\(.*\))\s*$/;

/**
 * Parse whisper.cpp JSON (`-oj`, word-split with -ml 1 -sow, or `-ojf` with tokens).
 * Returns [{text,start,end}] in seconds.
 */
function parseWhisperJson(json, offset = 0) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const segs = data.transcription || data.segments || [];
  const words = [];
  for (const seg of segs) {
    const from = seg.offsets ? seg.offsets.from / 1000 : (seg.timestamps ? parseClock(seg.timestamps.from) : seg.start);
    const to = seg.offsets ? seg.offsets.to / 1000 : (seg.timestamps ? parseClock(seg.timestamps.to) : seg.end);
    if (Array.isArray(seg.tokens) && seg.tokens.length && seg.tokens[0].offsets) {
      let cur = null;
      for (const tk of seg.tokens) {
        const txt = tk.text || '';
        if (!txt || SPECIAL.test(txt)) continue;
        const a = tk.offsets.from / 1000, b = tk.offsets.to / 1000;
        if (!cur || /^\s/.test(txt)) { if (cur) words.push(cur); cur = { text: txt.trim(), start: a, end: b }; }
        else { cur.text += txt; cur.end = b; }
      }
      if (cur) words.push(cur);
      continue;
    }
    const text = String(seg.text || '').trim();
    if (!text || SPECIAL.test(text)) continue;
    const parts = text.split(/\s+/);
    if (parts.length === 1) words.push({ text, start: from, end: to });
    else { // segment had several words → spread evenly by characters
      const total = parts.reduce((s, p) => s + p.length, 0) || 1;
      let t = from;
      for (const p of parts) { const d = (to - from) * p.length / total; words.push({ text: p, start: t, end: t + d }); t += d; }
    }
  }
  return words
    .filter(w => w.text && isFinite(w.start) && isFinite(w.end))
    .map(w => ({ text: w.text, start: +(w.start + offset).toFixed(3), end: +(Math.max(w.end, w.start + 0.02) + offset).toFixed(3) }));
}

/** Group words into sentences by pause length or end punctuation. */
function sentences(words, { pause = 0.6, maxWords = 30 } = {}) {
  const out = [];
  let cur = null;
  words.forEach((w, i) => {
    if (!cur) cur = { start: w.start, end: w.end, words: [], firstIndex: i };
    cur.words.push(w); cur.end = w.end;
    const next = words[i + 1];
    const brk = !next || next.start - w.end >= pause || /[.!?؟،]$/.test(w.text) || cur.words.length >= maxWords;
    if (brk) { cur.text = cur.words.map(x => x.text).join(' '); out.push(cur); cur = null; }
  });
  return out;
}

/**
 * Transcribe one media file (or a [start,start+duration] slice of it).
 * Result times are in the *source* time of the file.
 */
async function transcribe({ ffmpeg, whisper, model, file, start = 0, duration = 0, dialectId = 'egyptian', cacheDir, llm, spellModel, onProgress }) {
  requireTool(ffmpeg, 'ffmpeg'); requireTool(whisper, 'whisper.cpp');
  if (!model || !fs.existsSync(model)) throw new Error('موديل Whisper مش موجود. حمّله من الإعدادات (ggml-*.bin).');
  const key = hash(`${file}|${start}|${duration}|${dialectId}|${model}`);
  const base = path.join(cacheDir, `tr-${key}`);
  const cached = base + '.words.json';
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  onProgress && onProgress('تجهيز الصوت…');
  const wav = await toWav16k(ffmpeg, file, base + '.wav', { start, duration });
  onProgress && onProgress('بيفرّغ الكلام على جهازك…');
  await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId }), {
    onStderr: s => { const m = /progress\s*=\s*(\d+)%/.exec(s); if (m && onProgress) onProgress(`تفريغ ${m[1]}%`); }
  });
  let words = parseWhisperJson(fs.readFileSync(base + '.json', 'utf8'), start);
  if (dialect(dialectId).lang === 'ar') {
    words = arabicFix.fixWords(arabicFix.fixPhrasesAcrossWords(words), { dialect: dialectId });
    if (llm && spellModel) { onProgress && onProgress('تصحيح إملائي…'); words = await arabicFix.fixWordsAI(words, llm, spellModel, { dialect: dialectId }); }
  }
  const result = { words, text: words.map(w => w.text).join(' '), dialect: dialectId, file, start, duration };
  fs.writeFileSync(cached, JSON.stringify(result), 'utf8');
  try { fs.unlinkSync(wav); } catch (_) {}
  return result;
}

/** Map source-time words of a clip to timeline time. */
function wordsToTimeline(words, clip) {
  return words
    .map(w => ({ ...w, start: clip.start + (w.start - clip.inPoint), end: clip.start + (w.end - clip.inPoint) }))
    .filter(w => w.end > clip.start && w.start < clip.end);
}

module.exports = { DIALECTS, dialect, buildWhisperArgs, parseWhisperJson, sentences, transcribe, wordsToTimeline };

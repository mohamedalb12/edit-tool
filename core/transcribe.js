'use strict';
// تفريغ الكلام أوفلاين بـ whisper.cpp مع توقيت لكل كلمة.
const fs = require('fs');
const path = require('path');
const os = require('os');
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

/** whisper.cpp alignment preset (-dtw) from the model file name: word timing aligned to the audio, not guessed */
function dtwPreset(model) {
  const n = path.basename(String(model || '')).toLowerCase();
  const m = /ggml-(tiny|base|small|medium|large-v1|large-v2|large-v3-turbo|large-v3)(\.en)?(-q\w+)?\.bin$/.exec(n);
  return m ? m[1].replace(/-/g, '.') + (m[2] || '') : null;
}

function buildWhisperArgs({ model, wav, outBase, dialectId = 'egyptian', threads, accurate = true, dtw = true }) {
  const d = dialect(dialectId);
  const t = threads || Math.max(2, Math.min(8, os.cpus().length));
  const args = ['-m', model, '-f', wav, '-l', d.lang, '-t', String(t), '--prompt', d.prompt, '-ml', '1', '-sow', '-of', outBase, '-np'];
  if (accurate) args.push('-bs', '5', '-bo', '5'); // beam search: fewer wrong words
  const preset = dtw && dtwPreset(model);
  if (preset) args.push('-dtw', preset, '-ojf'); else args.push('-oj');
  return args;
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
    // word-split output (-ml 1 -sow) with DTW alignment: keep the word text, take the aligned time
    if (Array.isArray(seg.tokens) && seg.tokens.some(tk => typeof tk.t_dtw === 'number' && tk.t_dtw >= 0) && String(seg.text || '').trim() && !/\s/.test(String(seg.text).trim())) {
      const text = String(seg.text).trim();
      if (SPECIAL.test(text)) continue;
      const dtwT = seg.tokens.filter(tk => tk.t_dtw >= 0 && !SPECIAL.test(tk.text || '')).map(tk => tk.t_dtw / 100);
      words.push({ text, start: dtwT.length ? Math.min(...dtwT) : from, end: to, dtw: true });
      continue;
    }
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
  // DTW gives where each word starts; a word ends where the next one starts (or its segment end)
  for (let i = 0; i < words.length; i++) if (words[i].dtw) { const nx = words[i + 1]; if (nx && nx.start > words[i].start) words[i].end = Math.min(Math.max(words[i].end, words[i].start + 0.08), nx.start); delete words[i].dtw; }
  return words
    .filter(w => w.text && isFinite(w.start) && isFinite(w.end))
    .map(w => ({ text: w.text, start: +(w.start + offset).toFixed(3), end: +(Math.max(w.end, w.start + 0.02) + offset).toFixed(3) }));
}

/**
 * Snap word times to the audio: a word can't start or end inside a silence
 * (whisper often starts a word during the pause before it → captions show up too early).
 */
function refineWithSilence(words, silences, { minSil = 0.12 } = {}) {
  const sil = (silences || []).filter(s => s.end - s.start >= minSil).sort((a, b) => a.start - b.start);
  if (!sil.length) return words;
  const inside = t => sil.find(s => t > s.start + 0.02 && t < s.end - 0.02);
  const out = words.map(w => ({ ...w }));
  for (const w of out) {
    const a = inside(w.start); if (a && a.end < w.end) w.start = a.end;
    const b = inside(w.end); if (b && b.start > w.start) w.end = b.start;
    if (w.end - w.start < 0.06) w.end = w.start + 0.06;
  }
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
  for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.04, out[i + 1].start);
  return out.map(w => ({ ...w, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
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
async function transcribe({ ffmpeg, whisper, model, file, start = 0, duration = 0, dialectId = 'egyptian', cacheDir, llm, spellModel, onProgress, accurate = true }) {
  requireTool(ffmpeg, 'ffmpeg'); requireTool(whisper, 'whisper.cpp');
  if (!model || !fs.existsSync(model)) throw new Error('موديل Whisper مش موجود. حمّله من الإعدادات (ggml-*.bin).');
  const key = hash(`${file}|${start}|${duration}|${dialectId}|${model}|v2|${accurate}`);
  const base = path.join(cacheDir, `tr-${key}`);
  const cached = base + '.words.json';
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  onProgress && onProgress('تجهيز الصوت…');
  const wav = await toWav16k(ffmpeg, file, base + '.wav', { start, duration });
  onProgress && onProgress('بيفرّغ الكلام على جهازك…');
  const onStderr = s => { const m = /progress\s*=\s*(\d+)%/.exec(s); if (m && onProgress) onProgress(`تفريغ ${m[1]}%`); };
  try { await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId, accurate }), { onStderr }); }
  catch (e) { // older whisper.cpp builds don't know -dtw / beam options → plain run
    await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId, accurate: false, dtw: false }), { onStderr });
  }
  let words = parseWhisperJson(fs.readFileSync(base + '.json', 'utf8'), start);
  // align to the actual speech (silences measured on the same audio)
  try {
    const sil = await require('./silence').detectSilence(ffmpeg, wav, { thresholdDb: -38, minSilence: 0.12 });
    words = refineWithSilence(words, sil.map(x => ({ start: x.start + start, end: x.end + start })));
  } catch (_) {}
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

module.exports = { DIALECTS, dialect, dtwPreset, buildWhisperArgs, parseWhisperJson, refineWithSilence, sentences, transcribe, wordsToTimeline };

'use strict';
// تفريغ الكلام أوفلاين بـ whisper.cpp مع توقيت لكل كلمة.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { run, toWav16k, requireTool } = require('./ffmpeg');
const { parseClock, hash } = require('./util');
const arabicFix = require('./arabicFix');

const DIALECTS = [
  { id: 'egyptian', label: 'مصري', lang: 'ar', prompt: 'ده فيديو باللهجة المصرية. إزيكم يا جماعة، اممم، النهارده يعني هنتكلم عن، آآ، حاجة مهمة أوي.' },
  { id: 'gulf', label: 'خليجي / سعودي', lang: 'ar', prompt: 'هذا فيديو باللهجة الخليجية. هلا والله، اليوم بنتكلم عن شي مهم وايد.' },
  { id: 'levantine', label: 'شامي', lang: 'ar', prompt: 'هاد فيديو باللهجة الشامية. مرحبا يا جماعة، اليوم رح نحكي عن شغلة كتير مهمة.' },
  { id: 'iraqi', label: 'عراقي', lang: 'ar', prompt: 'هذا فيديو باللهجة العراقية. هلا بيكم، اليوم راح نحچي عن شغلة كلش مهمة.' },
  { id: 'maghrebi', label: 'مغربي', lang: 'ar', prompt: 'هادا فيديو بالدارجة المغربية. السلام عليكم، اليوم غادي نهضرو على حاجة مهمة بزاف.' },
  { id: 'msa', label: 'فصحى', lang: 'ar', prompt: 'هذا مقطع باللغة العربية الفصحى. مرحبًا بكم، سنتحدث اليوم عن موضوع مهم.' },
  { id: 'english', label: 'English', lang: 'en', prompt: 'Hello everyone, today we are talking about something important.' }
];

function dialect(id) { return DIALECTS.find(d => d.id === id) || DIALECTS[0]; }
/** names and words the user spells a certain way ("محمد أيمن، EditFast، شاورما الريم") → a clean list */
function glossaryList(g) { return String(g || '').split(/[،,\n؛;]+/).map(x => x.trim()).filter(Boolean).slice(0, 40); }
/** what Whisper is primed with: the dialect + the user's own words (it spells them like that when it hears them) */
function promptFor(dialectId, glossary) {
  const d = dialect(dialectId), g = glossaryList(glossary);
  return (d.prompt + (g.length ? ' ' + g.join('، ') + '.' : '')).slice(0, 600);
}

/** whisper.cpp alignment preset (-dtw) from the model file name: word timing aligned to the audio, not guessed */
function dtwPreset(model) {
  const n = path.basename(String(model || '')).toLowerCase();
  const m = /ggml-(tiny|base|small|medium|large-v1|large-v2|large-v3-turbo|large-v3)(\.en)?(-q\w+)?\.bin$/.exec(n);
  return m ? m[1].replace(/-/g, '.') + (m[2] || '') : null;
}

/** the voice-activity model shipped with the extension (Silero VAD, MIT) */
const VAD_MODEL = path.join(__dirname, '..', 'assets', 'models', 'ggml-silero-v6.2.0.bin');

/**
 * whisper.cpp arguments.
 * - accurate: beam search (fewer wrong words)
 * - vad: only the parts with speech are transcribed (no words "heard" in silence/music, timing pinned to the voice).
 *   whisper.cpp maps SEGMENT times back to the original audio under VAD, but not token times — so with -ml 1 every
 *   word is its own segment and we read plain -oj (segment offsets), never token times.
 * - dtw: token-level alignment; off by default (current whisper-cli disables it under flash attention, and its times
 *   aren't mapped when VAD is on).
 */
function buildWhisperArgs({ model, wav, outBase, dialectId = 'egyptian', threads, accurate = true, dtw = false, vad = true, vadModel = VAD_MODEL, glossary = '' }) {
  const d = dialect(dialectId);
  const t = threads || Math.max(2, Math.min(8, os.cpus().length));
  // -mc 0: each 30 s window on its own, not continuing the text before it — on long recordings that continuation is
  // how Whisper gets stuck repeating one line for minutes (bench/captions: 54.6% → 30.2% word errors)
  const args = ['-m', model, '-f', wav, '-l', d.lang, '-t', String(t), '--prompt', promptFor(dialectId, glossary), '-mc', '0', '-ml', '1', '-sow', '-of', outBase, '-np'];
  if (accurate) args.push('-bs', '5', '-bo', '5'); // beam search: fewer wrong words
  if (vad && vadModel && fs.existsSync(vadModel)) args.push('--vad', '-vm', vadModel, '-vp', '50');
  const preset = dtw && !vad && dtwPreset(model);
  if (preset) args.push('-nfa', '-dtw', preset, '-ojf'); else args.push('-oj');
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
function refineWithSilence(words, silences, { minSil = 0.12, maxShift = 0.6 } = {}) {
  const sil = (silences || []).filter(s => s.end - s.start >= minSil).sort((a, b) => a.start - b.start);
  if (!sil.length) return words;
  // if "silence" covers most of the speech, the threshold was wrong (a quiet voice): don't touch anything
  const total = words.reduce((a, w) => a + (w.end - w.start), 0) || 1;
  const covered = words.reduce((a, w) => a + sil.reduce((x, s) => x + Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start)), 0), 0);
  if (covered / total > 0.35) return words;
  const inside = t => sil.find(s => t > s.start + 0.02 && t < s.end - 0.02);
  const out = words.map(w => ({ ...w }));
  for (const w of out) {
    // small, safe moves only: a word is never pushed far from where whisper heard it
    const a = inside(w.start); if (a && a.end < w.end - 0.05 && a.end - w.start <= maxShift) w.start = a.end;
    const b = inside(w.end); if (b && b.start > w.start + 0.05 && w.end - b.start <= maxShift) w.end = b.start;
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
/**
 * Which engine: Groq (online, Whisper large v3 — much better Arabic) when there's a key, unless the user picked
 * "local"; whisper.cpp on this machine otherwise.
 */
function engineOf({ engine = 'auto', groqKey } = {}) {
  if (engine === 'local') return 'local';
  if (engine === 'groq' || groqKey) return groqKey ? 'groq' : (engine === 'groq' ? 'groq' : 'local');
  return 'local';
}

async function transcribe({ ffmpeg, whisper, model, file, start = 0, duration = 0, dialectId = 'egyptian', cacheDir, llm, spellModel, onProgress, accurate = true, engine = 'auto', groqKey = '', groqModel = 'whisper-large-v3', fetchImpl, glossary = '' }) {
  const eng = engineOf({ engine, groqKey });
  requireTool(ffmpeg, 'ffmpeg');
  if (eng === 'local') {
    requireTool(whisper, 'whisper.cpp');
    if (!model || !fs.existsSync(model)) throw new Error('موديل Whisper مش موجود. حمّله من الإعدادات (ggml-*.bin) — أو حط مفتاح Groq (أدق بكتير).');
  }
  const gl = glossaryList(glossary).join('،');
  const src = `${file}|${start}|${duration}|${dialectId}|${eng === 'groq' ? 'groq:' + groqModel : model}` + (gl ? '|g:' + gl : '');
  // what Whisper heard is kept on its own (raw), so a better clean-up later never needs a new transcription;
  // the cleaned-up result is cached per clean-up version
  // v5: Groq in 30 s pieces / whisper.cpp with -mc 0 (a transcript from before may hold a stuck loop: not reused)
  const base = path.join(cacheDir, `tr-${hash(src + '|v5|' + accurate)}`);
  const rawFile = base + '.raw.json', cached = path.join(cacheDir, `tr-${hash(src + '|' + POST_VERSION + '|' + accurate + '|' + !!(llm && spellModel))}.words.json`);
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  let words = null, segments = null;
  if (fs.existsSync(rawFile)) ({ words, segments = null } = JSON.parse(fs.readFileSync(rawFile, 'utf8')));
  if (!words) {
    onProgress && onProgress('تجهيز الصوت…');
    const wav = await toWav16k(ffmpeg, file, base + '.wav', { start, duration });
    if (eng === 'groq') {
      const D = dialect(dialectId);
      const g = await require('./groq').transcribe({ ffmpeg, file: wav, key: groqKey, fetchImpl: fetchImpl || require('./http').nodeFetch, model: groqModel, language: D.lang, prompt: promptFor(dialectId, glossary), tmpDir: cacheDir, onProgress });
      segments = (g.segments || []).map(x => ({ ...x, start: +(x.start + start).toFixed(3), end: +(x.end + start).toFixed(3) }));
      words = g.map(w => ({ ...w, start: +(w.start + start).toFixed(3), end: +(w.end + start).toFixed(3) }));
    } else {
      onProgress && onProgress('بيفرّغ الكلام على جهازك…');
      const onStderr = s => { const m = /progress\s*=\s*(\d+)%/.exec(s); if (m && onProgress) onProgress(`تفريغ ${m[1]}%`); };
      // newest options first; older whisper.cpp builds that don't know them get a simpler run
      try { await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId, accurate, glossary }), { onStderr }); }
      catch (e) {
        try { await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId, accurate, vad: false, glossary }), { onStderr }); }
        catch (e2) { await run(whisper, buildWhisperArgs({ model, wav, outBase: base, dialectId, accurate: false, vad: false, glossary }), { onStderr }); }
      }
      words = parseWhisperJson(fs.readFileSync(base + '.json', 'utf8'), start);
    }
    fs.writeFileSync(rawFile, JSON.stringify({ words, segments, engine: eng }), 'utf8');
    try { fs.unlinkSync(wav); } catch (_) {}
  }
  words = await cleanUp(words, { ffmpeg, file, start, duration, dialectId, llm, spellModel, onProgress, segments });
  const result = { words, text: words.map(w => w.text).join(' '), dialect: dialectId, file, start, duration, engine: eng };
  fs.writeFileSync(cached, JSON.stringify(result), 'utf8');
  return result;
}

/**
 * What Whisper heard → caption-ready words. Each step is measured on real Egyptian speech (bench/captions):
 *  1. words that start / end inside a silence move onto the voice (silencedetect at this recording's level)
 *  2. each word moved onto the voice under it — after a pause Whisper starts a word ~0.45 s before the voice
 *     (where the word before it ended); this brings it to ~0.05 s (core/captionTiming)
 *  3. Arabic spelling (rules, then optionally AI — spelling only, never another word)
 *  (0. before all that: words nobody said — core/hallucination)
 */
const POST_VERSION = 'post7';
async function cleanUp(words, { ffmpeg, file, start = 0, duration = 0, dialectId = 'egyptian', llm, spellModel, onProgress, segments = null, guard = true, onDropped } = {}) {
  // the voice under every 50 ms of the span (relative to this recording's own floor)
  let voiced = null; const win = 0.05, T = require('./captionTiming');
  try {
    const { rmsEnvelope, toDb } = require('./audio');
    const pcm = await require('./ffmpeg').decodePCM(ffmpeg, file, { rate: 8000, start, duration });
    voiced = T.voicing(Array.from(rmsEnvelope(pcm, 8000, win)).map(toDb));
  } catch (_) {}
  // 0. what nobody said (outros, loops, the prompt written back) — on Whisper's own times, before anything moves them
  if (guard) {
    const share = voiced ? (a, b) => { const i0 = Math.max(0, Math.floor((a - start) / win)), i1 = Math.min(voiced.length, Math.ceil((b - start) / win)); let n = 0; for (let i = i0; i < i1; i++) if (voiced[i]) n++; return i1 > i0 ? n / (i1 - i0) : 0; } : null;
    const r = require('./hallucination').guard(words, { segments, voiced: share, end: start + (duration > 0 ? duration : (voiced ? voiced.length * win : Infinity)), prompt: dialect(dialectId).prompt });
    words = r.words; if (onDropped) onDropped(r.dropped);
  }
  try {
    const thr = await speechThreshold(ffmpeg, file, { start, duration });
    const sil = await require('./silence').detectSilence(ffmpeg, file, { thresholdDb: thr, minSilence: 0.12, start, duration });
    words = refineWithSilence(words, sil.map(x => ({ start: x.start + start, end: x.end + start })));
  } catch (_) {}
  if (voiced) {
    words = T.alignToVoice(words.map(w => ({ ...w, start: w.start - start, end: w.end - start })), voiced, win)
      .map(w => ({ ...w, start: +(w.start + start).toFixed(3), end: +(w.end + start).toFixed(3) }));
  }
  if (dialect(dialectId).lang === 'ar') {
    words = arabicFix.fixWords(arabicFix.fixPhrasesAcrossWords(words), { dialect: dialectId });
    if (llm && spellModel) { onProgress && onProgress('تصحيح إملائي…'); words = await arabicFix.fixWordsAI(words, llm, spellModel, { dialect: dialectId }); }
  }
  return words;
}

/** a silence threshold relative to the recording's loudness (mean volume − 16 dB, never above −30 dB) */
async function speechThreshold(ffmpeg, wav, { start = 0, duration = 0 } = {}) {
  try {
    const args = ['-hide_banner', '-nostdin'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', wav);
    if (duration > 0) args.push('-t', String(duration));
    const { stderr } = await run(ffmpeg, args.concat(['-vn', '-af', 'volumedetect', '-f', 'null', '-']));
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(stderr));
    if (m) return Math.min(-30, Math.max(-70, +m[1] - 16));
  } catch (_) {}
  return -40;
}

/** Map source-time words of a clip to timeline time — at the clip's speed (110% → the words come 10% sooner). */
function wordsToTimeline(words, clip) {
  const sp = Math.abs(clip.speed || 1) || 1;
  return words
    .map(w => ({ ...w, start: clip.start + (w.start - clip.inPoint) / sp, end: clip.start + (w.end - clip.inPoint) / sp, src: w.src !== undefined ? w.src : w.start }))
    .filter(w => w.end > clip.start && w.start < clip.end);
}

/** how much of the source a clip uses (seconds of media), speed included */
function sourceSpan(clip) { const sp = Math.abs(clip.speed || 1) || 1; return { a: clip.inPoint, b: clip.inPoint + (clip.end - clip.start) * sp }; }

module.exports = { engineOf, VAD_MODEL, DIALECTS, dialect, glossaryList, promptFor, dtwPreset, buildWhisperArgs, parseWhisperJson, refineWithSilence, speechThreshold, sourceSpan, sentences, transcribe, cleanUp, POST_VERSION, wordsToTimeline };

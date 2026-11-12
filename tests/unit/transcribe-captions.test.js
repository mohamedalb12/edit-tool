'use strict';
const { TMP, FFMPEG, makeAudio } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const tr = require('../../core/transcribe');
const fix = require('../../core/arabicFix');
const captions = require('../../core/captions');
const repeats = require('../../core/repeats');
const search = require('../../core/search');
const chapters = require('../../core/chapters');

const W = (list) => list.map(([text, start, end]) => ({ text, start, end }));

test('7 dialects; whisper args carry language + dialect prompt + word timing flags', () => {
  assert.equal(tr.DIALECTS.length, 7);
  const args = tr.buildWhisperArgs({ model: 'm.bin', wav: 'a.wav', outBase: 'o', dialectId: 'gulf' });
  assert.deepEqual(args.slice(0, 6), ['-m', 'm.bin', '-f', 'a.wav', '-l', 'ar']);
  for (const f of ['-ml', '-sow', '-oj', '--prompt']) assert.ok(args.includes(f), f);
  assert.match(args[args.indexOf('--prompt') + 1], /الخليجية/);
  assert.equal(tr.buildWhisperArgs({ model: 'm', wav: 'a', outBase: 'o', dialectId: 'english' })[5], 'en');
});

test('parse whisper.cpp word JSON (segments) and token JSON (-ojf)', () => {
  const seg = { transcription: [{ offsets: { from: 0, to: 500 }, text: ' أهلا' }, { offsets: { from: 500, to: 900 }, text: ' [_BEG_]' }, { offsets: { from: 900, to: 1400 }, text: ' بيكم' }] };
  assert.deepEqual(tr.parseWhisperJson(seg, 10), [{ text: 'أهلا', start: 10, end: 10.5 }, { text: 'بيكم', start: 10.9, end: 11.4 }]);
  const tok = { transcription: [{ offsets: { from: 0, to: 1000 }, text: ' hello world', tokens: [
    { text: '[_BEG_]', offsets: { from: 0, to: 0 } }, { text: ' hel', offsets: { from: 0, to: 200 } }, { text: 'lo', offsets: { from: 200, to: 400 } }, { text: ' world', offsets: { from: 500, to: 900 } }] }] };
  assert.deepEqual(tr.parseWhisperJson(tok).map(w => w.text), ['hello', 'world']);
  assert.equal(tr.parseWhisperJson(tok)[0].end, 0.4);
});

test('arabic spell-fix: hamzas, phrases, punctuation — offline', () => {
  assert.equal(fix.fixText('انا قلت انشاء الله , ده حلو ? الحمدلله'), 'أنا قلت إن شاء الله، ده حلو؟ الحمد لله');
  assert.equal(fix.fixText('شكرا جدا'), 'شكرًا جدًا');
  const w = fix.fixPhrasesAcrossWords(W([['إنشاء', 0, 0.5], ['الله', 0.5, 1]]));
  assert.deepEqual(w.map(x => x.text), ['إن', 'شاء الله']);
  assert.equal(fix.normalizeForSearch('أنَا إسمي مكتبة'), 'انا اسمي مكتبه');
});

test('arabic spell-fix via AI keeps word count/timings, falls back on mismatch, and never rewords what was said', async () => {
  const words = W([['انا', 0, 1], ['رحت', 1, 2], ['مدرسه', 2, 3], ['ليها', 3, 4], ['دلوقتي', 4, 5], ['مسئول', 5, 6]]);
  const good = { json: async () => ({ words: ['أنا', 'روحت', 'مدرسة', 'لها', 'الآن', 'مسؤول'] }) };
  const bad = { json: async () => ({ words: ['أنا روحت'] }) };
  // spelling (hamza, ة, ؤ/ئ) is taken; a different word — even a "more correct" one — is not
  assert.deepEqual((await fix.fixWordsAI(words, good, 'm')).map(x => x.text), ['أنا', 'رحت', 'مدرسة', 'ليها', 'دلوقتي', 'مسؤول']);
  assert.deepEqual((await fix.fixWordsAI(words, bad, 'm')).map(x => x.text), ['انا', 'رحت', 'مدرسه', 'ليها', 'دلوقتي', 'مسئول']);
  assert.equal((await fix.fixWordsAI(words, good, 'm'))[1].start, 1);
  assert.equal(fix.sameWord('طيب،', 'طيب'), true); assert.equal(fix.sameWord('عشان', 'علشان'), false);
  assert.equal(fix.normalizeForSearch('نفسه، طيب؟'), 'نفسه طيب', 'Arabic comma / question mark are punctuation');
});

test('transcribe pipeline end-to-end with a whisper.cpp-compatible CLI (ffmpeg → wav → json → fixes → cache)', async () => {
  const audio = makeAudio('speech.wav', [{ tone: 200, dur: 2 }]);
  const model = path.join(TMP, 'fake-model.bin'); fs.writeFileSync(model, 'x');
  const fake = path.join(__dirname, '..', 'fixtures', 'fake-whisper.js');
  const opts = { ffmpeg: FFMPEG, whisper: fake, model, file: audio, start: 0.5, duration: 1.5, dialectId: 'egyptian', cacheDir: TMP };
  const progress = [];
  const r = await tr.transcribe({ ...opts, onProgress: m => progress.push(m) });
  assert.deepEqual(r.words.map(w => w.text), ['أنا', 'قلت', 'إن', 'شاء الله', 'هنبدأ']);
  assert.equal(r.words[0].start, 0.5); // source time = slice start + offset
  assert.ok(progress.some(p => /50%/.test(p)));
  // cached second call doesn't run whisper
  const r2 = await tr.transcribe({ ...opts, whisper: '/bin/false' });
  assert.deepEqual(r2.words, r.words);
  // timeline mapping
  const tl = tr.wordsToTimeline(r.words, { start: 100, end: 101.2, inPoint: 0.5 });
  assert.equal(tl[0].start, 100);
  assert.ok(tl.every(w => w.start < 101.2));
});

test('captions: max words, max duration, single-word mode, SRT round-trip', () => {
  const words = W([['واحد', 0, 0.4], ['اتنين', 0.45, 0.8], ['تلاتة', 0.85, 1.2], ['اربعة', 1.25, 1.6], ['خمسة', 3, 3.3], ['ستة', 3.35, 3.7]]);
  const c3 = captions.buildCues(words, { maxWords: 3, maxDuration: 5 });
  assert.deepEqual(c3.map(c => c.text), ['واحد اتنين تلاتة', 'اربعة', 'خمسة ستة']);
  const c1 = captions.buildCues(words, { singleWord: true });
  assert.equal(c1.length, 6);
  const cd = captions.buildCues(words, { maxWords: 10, maxDuration: 0.9 });
  assert.ok(cd.every(c => c.end - c.start <= 1.0));
  for (let i = 1; i < c1.length; i++) assert.ok(c1[i - 1].end <= c1[i].start);
  const srt = captions.toSRT(c3);
  // up from the first word to the last + 0.2 s to finish reading (never over the next card)
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,210\nواحد اتنين تلاتة\n/, 'the next card starts at 1.25: the hold stops 40 ms before it');
  assert.equal(c3[1].end, 1.95, 'a lone word stays up 0.7 s (there is room before the next card)');
  assert.deepEqual(captions.parseSRT(srt).map(c => c.text), c3.map(c => c.text));
});

test('captions: a card never stays up across a pause, keeps to one readable line, and lasts long enough to read', () => {
  const words = W([['ده', 0, 0.3], ['كلام', 0.35, 0.7], ['بعد', 1.6, 1.9], ['سكتة', 1.95, 2.3], ['وكلمة', 2.35, 2.5]]);
  const cs = captions.buildCues(words, { maxWords: 5, maxDuration: 5 });
  assert.deepEqual(cs.map(c => c.text), ['ده كلام', 'بعد سكتة وكلمة'], 'split at the 0.9 s pause');
  assert.equal(cs[0].end, 0.9, 'last word + 0.2 s'); assert.equal(cs[1].end, 2.7);
  const long = W(['المونتاج', 'الاحترافي', 'بيحتاج', 'تركيز', 'كبير', 'جدا'].map((t, i) => [t, i * 0.3, i * 0.3 + 0.28]));
  assert.ok(captions.buildCues(long, { maxWords: 6, maxDuration: 9 }).every(c => c.text.length <= 38), 'one line of ≤ 38 characters');
  const fast = W([['آه', 0, 0.1], ['لا', 1, 1.1]]);
  assert.ok(captions.buildCues(fast).every(c => c.end - c.start >= 0.7), 'at least 0.7 s when there is room');
});

test('captionTiming: a word Whisper starts in the pause before it (where the last word ended) moves onto its voice', () => {
  const T = require('../../core/captionTiming'), win = 0.05;
  // voice 0–1.0 s, pause 1.0–1.5, voice 1.5–2.5, pause 2.5–2.7, short voice 2.95–3.1
  const voiced = Array.from({ length: 70 }, (_, i) => { const t = i * win + 1e-6; return (t < 1.0) || (t >= 1.5 && t < 2.5) || (t >= 2.95 && t < 3.1); });
  const out = T.alignToVoice([{ text: 'أول', start: 0, end: 1.0 }, { text: 'تاني', start: 1.0, end: 2.0 }, { text: 'تالت', start: 2.0, end: 2.5 }, { text: 'ده', start: 2.5, end: 2.8 }], voiced, win);
  assert.equal(out[1].start, 1.5, 'after the pause: on the voice, not at the end of the word before');
  assert.equal(out[2].start, 2.0, 'mid-speech: untouched');
  assert.equal(out[3].start, 2.95, 'a short word that ends before its voice: found just past its end');
  assert.ok(out[3].end > out[3].start);
  assert.equal(out[0].start, 0); assert.equal(out[0].end, 1.0);
  // a word whose voice is far (> 1.2 s) stays where Whisper put it
  const far = T.alignToVoice([{ text: 'x', start: 0, end: 3.4 }], Array.from({ length: 70 }, (_, i) => i * win > 3.0), win);
  assert.equal(far[0].start, 0);
});

test('repeats: removes stutters and earlier retakes, keeps the last take', () => {
  const words = W([
    ['النهارده', 0, 0.5], ['هنتكلم', 0.6, 1], ['عن', 1.05, 1.2], ['المونتاج', 1.25, 1.8],      // take 1
    ['النهارده', 3, 3.5], ['هنتكلم', 3.6, 4], ['عن', 4.05, 4.2], ['المونتاج', 4.25, 4.8], ['السريع', 4.85, 5.4], // take 2 (kept)
    ['أنا', 7, 7.2], ['أنا', 7.3, 7.5], ['جاهز', 7.6, 8]
  ]);
  const r = repeats.findRepeats(words);
  assert.equal(r.cuts.length, 2, JSON.stringify(r.details));
  assert.deepEqual([r.cuts[0].start, r.cuts[0].end], [0, 3]);
  assert.deepEqual([r.cuts[1].start, r.cuts[1].end], [7, 7.3]);
  assert.ok(repeats.similarity('هنتكلم عن المونتاج', 'هنتكلم عن المونتاج السريع') > 0.6);
  assert.ok(repeats.similarity('السلام عليكم', 'الجو حلو النهارده') < 0.3);
});

test('repeats: phrase restarted without any pause is caught too', () => {
  const words = W([['هنتكلم', 0, 0.3], ['عن', 0.4, 0.5], ['المونتاج', 0.6, 0.9], ['هنتكلم', 1, 1.3], ['عن', 1.4, 1.5], ['المونتاج', 1.6, 1.9], ['السريع', 2, 2.4]]);
  const r = repeats.findRepeats(words);
  assert.deepEqual(r.cuts.map(c => [c.start, c.end]), [[0, 1]]);
  assert.equal(repeats.findPhraseRepeats(W([['قال', 0, 1], ['لا', 1, 2], ['قال', 2, 3]])).length, 0);
});

test('search: finds words regardless of hamza / ta marbuta, multi-word phrases', () => {
  const words = W([['إزيكم', 0, 1], ['يا', 1, 1.2], ['جماعة', 1.2, 2], ['المكتبة', 5, 6], ['الجديدة', 6, 7]]);
  assert.equal(search.searchWords(words, 'ازيكم')[0].start, 0);
  assert.equal(search.searchWords(words, 'المكتبه الجديده')[0].start, 5);
  assert.equal(search.searchWords(words, 'مش موجود').length, 0);
});

test('chapters: YouTube rules (starts at 00:00, ≥10s apart) + offline + AI', async () => {
  const v = chapters.validate([{ time: 5, title: 'a' }, { time: 12, title: 'b' }, { time: 15, title: 'c' }, { time: 40, title: 'd' }]);
  assert.equal(v[0].time, 0);
  for (let i = 1; i < v.length; i++) assert.ok(v[i].time - v[i - 1].time >= 10);
  assert.match(chapters.formatYouTube([{ time: 0, title: 'المقدمة' }, { time: 75, title: 'الفكرة' }]), /^00:00 المقدمة\n01:15 الفكرة$/);
  const sents = []; for (let i = 0; i < 40; i++) sents.push({ start: i * 10 + (i % 8 === 0 ? 3 : 0), end: i * 10 + 8, text: 'جملة رقم ' + i });
  const off = chapters.offlineChapters(sents);
  assert.ok(off.length >= 3 && off[0].time === 0);
  const ai = await chapters.aiChapters({ json: async () => ({ chapters: [{ time: 0, title: 'البداية' }, { time: 120, title: 'التفاصيل' }] }) }, 'm', sents);
  assert.deepEqual(ai.map(c => c.title), ['البداية', 'التفاصيل']);
});

test('Groq pieces are cut in a pause near each 10-minute mark, never inside a word', () => {
  const groq = require('../../core/groq');
  // 25 min; pauses at 8:20 (0.4 s), 9:30 (1.2 s) and 19:10 (0.6 s); nothing near the 30-minute mark is needed
  const sil = [{ start: 500, end: 500.4 }, { start: 570, end: 571.2 }, { start: 1150, end: 1150.6 }];
  assert.deepEqual(groq.cutPoints(1500, sil, 600), [570.6, 1150.3], 'the longest pause in the last quarter before each mark');
  assert.deepEqual(groq.cutPoints(1500, [], 600), [600, 1200], 'no pause found → the mark itself');
  assert.deepEqual(groq.cutPoints(400, sil, 600), [], 'short: one piece');
  // words and whisper's per-segment signals come back together
  const j = { segments: [{ start: 0, end: 2, text: 'a b', no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.2 }, { start: 2, end: 4, text: 'c', no_speech_prob: 0.9, avg_logprob: -1.5, compression_ratio: 1 }], words: [{ word: 'a', start: 0.1, end: 0.5 }, { word: 'b', start: 0.6, end: 1 }, { word: 'c', start: 2.5, end: 3 }] };
  assert.deepEqual(groq.wordsFrom(j, 100, 5).map(w => w.seg), [5, 5, 6]);
  assert.equal(groq.segmentsFrom(j, 100)[1].noSpeech, 0.9);
});

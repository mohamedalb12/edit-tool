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

test('arabic spell-fix via AI keeps word count/timings, falls back on mismatch', async () => {
  const words = W([['انا', 0, 1], ['رحت', 1, 2]]);
  const good = { json: async () => ({ words: ['أنا', 'روحت'] }) };
  const bad = { json: async () => ({ words: ['أنا روحت'] }) };
  assert.deepEqual((await fix.fixWordsAI(words, good, 'm')).map(x => x.text), ['أنا', 'روحت']);
  assert.deepEqual((await fix.fixWordsAI(words, bad, 'm')).map(x => x.text), ['انا', 'رحت']);
  assert.equal((await fix.fixWordsAI(words, good, 'm'))[1].start, 1);
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
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,200\nواحد اتنين تلاتة\n/);
  assert.deepEqual(captions.parseSRT(srt).map(c => c.text), c3.map(c => c.text));
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

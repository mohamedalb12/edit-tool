'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { guard } = require('../../core/hallucination');
const W = a => a.map(([text, start, end, seg]) => ({ text, start, end, seg }));
const texts = r => r.words.map(w => w.text);

test('the outro Whisper writes at the end of a clip is dropped (seen in 7 of 46 real Egyptian clips); said for real, it stays', () => {
  // as measured: the last word of the speech, then "اشتركوا في القناة" with zero-length words in the last second
  const made = W([['ده', 20, 20.4], ['أحسن.', 20.4, 20.8], ['اشتركوا', 20.8, 21.06], ['في', 21.06, 21.06], ['القناة', 21.06, 21.06]]);
  assert.deepEqual(texts(guard(made, { end: 21.1 })), ['ده', 'أحسن.']);
  // a creator really saying it mid-video, with voice under it and real durations: kept
  const said = W([['يلا', 5, 5.3], ['اشتركوا', 5.4, 6], ['في', 6.05, 6.2], ['القناة', 6.25, 6.8], ['ونبدأ', 7, 7.5]]);
  assert.deepEqual(texts(guard(said, { end: 60, voiced: () => 0.9 })), ['يلا', 'اشتركوا', 'في', 'القناة', 'ونبدأ']);
  // the same words over silence (no voice under them) mid-file: dropped
  assert.deepEqual(texts(guard(said, { end: 60, voiced: (a) => (a >= 5.4 && a < 7 ? 0 : 0.9) })), ['يلا', 'ونبدأ']);
  // "موسيقى" over the music at the end
  assert.deepEqual(texts(guard(W([['خلصنا', 10, 10.5], ['موسيقى', 29.3, 29.9]]), { end: 30 })), ['خلصنا']);
});

test('a stretch whisper marks as silence, a stuck loop, and the prompt written back are dropped; normal repeats stay', () => {
  const segs = [{ noSpeech: 0.05, logprob: -0.3 }, { noSpeech: 0.9, logprob: -1.4 }];
  assert.deepEqual(texts(guard(W([['كلام', 0, 0.5, 0], ['حقيقي', 0.6, 1, 0], ['وهمي', 3, 3.5, 1]]), { segments: segs })), ['كلام', 'حقيقي']);
  const loop = W(['شكرا', 'ليكم', 'جدا', 'شكرا', 'ليكم', 'جدا', 'شكرا', 'ليكم', 'جدا', 'شكرا', 'ليكم', 'جدا'].map((t, i) => [t, i * 0.4, i * 0.4 + 0.3]));
  assert.deepEqual(texts(guard(loop)), ['شكرا', 'ليكم', 'جدا']);
  assert.deepEqual(texts(guard(W([['لا', 0, 0.2], ['لا', 0.25, 0.4], ['لا', 0.45, 0.6], ['مش', 0.7, 0.9]]))), ['لا', 'لا', 'لا', 'مش'], 'people do say "لا لا لا"');
  assert.deepEqual(texts(guard(W([['مين', 0, 0.3], ['مين', 0.4, 0.7]]))), ['مين', 'مين']);
  const prompt = 'ده فيديو باللهجة المصرية. إزيكم يا جماعة، النهارده يعني هنتكلم عن حاجة مهمة أوي.';
  const echo = W(['إزيكم', 'يا', 'جماعة', 'النهارده', 'يعني', 'هنتكلم', 'عن', 'الطبخ'].map((t, i) => [t, i * 0.4, i * 0.4 + 0.3]));
  assert.deepEqual(texts(guard(echo, { prompt })), ['الطبخ']);
  assert.deepEqual(texts(guard(W([['النهارده', 0, 0.4], ['هنتكلم', 0.5, 0.9], ['عن', 1, 1.1], ['الطبخ', 1.2, 1.6]]), { prompt })), ['النهارده', 'هنتكلم', 'عن', 'الطبخ'], 'three words in common is just Egyptian');
});

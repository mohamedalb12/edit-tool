'use strict';
// فلتر الهلوسة: Whisper ساعات بيكتب كلام محدش قاله — أشهره "اشتركوا في القناة" في آخر الفيديو (طلع في 14% من
// المقاطع المصرية في القياس: bench/captions)، و"موسيقى"، و"ترجمة نانسي قنقر"، وتكرار نفس الجملة كذا مرة، أو جملة
// البرومبت نفسها. هنا بيتشال اللي عليه علامات الهلوسة بس — الكلام الحقيقي مابيتلمسش. Pure.
const { normalizeForSearch } = require('./arabicFix');

const norm = t => normalizeForSearch(t).replace(/\s+/g, ' ').trim();
/** what Whisper says when there's no one talking (YouTube outros, subtitle credits, sound tags) */
const PHRASES = [
  'اشتركوا في القناه', 'اشترك في القناه', 'لا تنسوا الاشتراك في القناه', 'لا تنسى الاشتراك في القناه', 'لا تنسوا الاشتراك',
  'اشتركوا في القناه وفعلوا الجرس', 'شكرا للمشاهده', 'شكرا على المشاهده', 'شكرا لكم على المشاهده', 'شكرا لمتابعتكم',
  'ترجمه نانسي قنقر', 'نانسي قنقر', 'سبحان الله وبحمده سبحان الله العظيم', 'موسيقى', 'موسيقي', 'تصفيق', 'ضحك'
].map(norm);

/**
 * words [{text,start,end,seg?}] → { words, dropped: [{text,start,reason}] }
 * o.segments  whisper's per-segment signals (Groq: noSpeech, logprob, compression)
 * o.voiced    (a, b) → 0–1 share of [a, b] with voice in it (optional)
 * o.end       where the audio ends (the last second is where the outros appear)
 * o.prompt    the prompt that was sent (Whisper sometimes writes it back)
 */
function guard(words, { segments = null, voiced = null, end = Infinity, prompt = '' } = {}) {
  const keep = words.map(() => true), why = [];
  const drop = (i, reason) => { if (keep[i]) { keep[i] = false; why.push({ text: words[i].text, start: words[i].start, reason }); } };
  const zero = w => w.end - w.start < 0.05;
  const N = words.map(w => norm(w.text));
  // 1. a stretch Whisper itself says is silence (OpenAI's own rule: no-speech > 0.6 and low confidence)
  if (segments) words.forEach((w, i) => { const s = segments[w.seg]; if (s && s.noSpeech > 0.6 && s.logprob < -1) drop(i, 'no-speech'); });
  // 2. outro / credit phrases when they look made up: a zero-length word in them, the last second of the audio,
  //    no voice under them, or a stretch whisper doubts
  for (const p of PHRASES) {
    const pw = p.split(' ');
    for (let i = 0; i + pw.length <= words.length; i++) {
      if (!pw.every((x, k) => N[i + k] === x)) continue;
      const span = words.slice(i, i + pw.length), a = span[0].start, b = span[span.length - 1].end;
      const seg = segments && segments[span[0].seg];
      const fake = span.some(zero) || b >= end - 1.0 || (voiced && voiced(a, b) < 0.3) || (seg && seg.noSpeech > 0.3) || (pw.length === 1 && span[0].start === span[0].end);
      if (fake) for (let k = 0; k < pw.length; k++) drop(i + k, 'outro');
    }
  }
  // 3. runs of zero-length words in the last second (the outro signature, whatever the words)
  for (let i = 0; i < words.length; i++) {
    let j = i; while (j < words.length && zero(words[j])) j++;
    if (j - i >= 2 && words[i].start >= end - 1.0) for (let k = i; k < j; k++) drop(k, 'zero-length');
    i = Math.max(i, j - 1);
  }
  // 4. loops: the same 2–6 words three times or more in a row (a stuck decoder), or one word five times or more
  for (let n = 6; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= words.length; i++) {
      let reps = 1;
      while (i + (reps + 1) * n <= words.length && N.slice(i + reps * n, i + (reps + 1) * n).join(' ') === N.slice(i, i + n).join(' ')) reps++;
      if ((n >= 2 && reps >= 3) || (n === 1 && reps >= 5)) {
        const keepReps = n === 1 ? 2 : 1;
        for (let k = i + keepReps * n; k < i + reps * n; k++) drop(k, 'loop');
        i += reps * n - 1;
      }
    }
  }
  // 5. the prompt written back: four or more words in a row taken from it
  const P = norm(prompt).split(' ').filter(Boolean);
  if (P.length >= 4) {
    for (let i = 0; i + 4 <= words.length; i++) {
      for (let s = 0; s + 4 <= P.length; s++) {
        let k = 0; while (i + k < words.length && s + k < P.length && N[i + k] === P[s + k]) k++;
        if (k >= 4) { for (let x = 0; x < k; x++) drop(i + x, 'prompt'); i += k - 1; break; }
      }
    }
  }
  return { words: words.filter((_, i) => keep[i]), dropped: why };
}

module.exports = { guard, PHRASES };

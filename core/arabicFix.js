'use strict';
// تصحيح إملائي بعد التفريغ: قواعد أوفلاين ثابتة + (اختياري) تصحيح بالذكاء الاصطناعي من غير ما يبوّظ التوقيت.

// \b مبيشتغلش مع الحروف العربية في JS، فبنعمل حدود الكلمة بإيدينا.
const B = '(^|[\\s،.؟!,?])', E = '(?=$|[\\s،.؟!,?])';
const phrase = alts => new RegExp(B + '(?:' + alts.join('|') + ')' + E, 'g');
const PHRASES = [
  [phrase(['انشاء الله', 'إنشاء الله', 'انشالله', 'إنشالله', 'ان شاء الله']), 'إن شاء الله'],
  [phrase(['ماشاء الله', 'ماشالله', 'ما شاالله']), 'ما شاء الله'],
  [phrase(['الحمدلله', 'الحمد الله']), 'الحمد لله'],
  [phrase(['جزاك الله خير']), 'جزاك الله خيرًا'],
  [phrase(['لا اله الا الله']), 'لا إله إلا الله']
];

// كلمات مفردة شائعة بتتكتب غلط في الهمزات.
const WORDS = {
  'انا': 'أنا', 'احنا': 'إحنا', 'انتو': 'إنتو', 'اللى': 'اللي', 'إللي': 'اللي', 'ازاي': 'إزاي', 'ازيك': 'إزيك',
  'اول': 'أول', 'اخر': 'آخر', 'ايه': 'إيه', 'اية': 'إيه', 'امتى': 'إمتى', 'اكتر': 'أكتر', 'اكثر': 'أكثر',
  'الان': 'الآن', 'اذا': 'إذا', 'الى': 'إلى', 'إلي': 'إلى', 'اين': 'أين', 'ايضا': 'أيضًا', 'أيضا': 'أيضًا',
  'لان': 'لأن', 'لانه': 'لأنه', 'لانها': 'لأنها', 'ان': 'إن', 'اننا': 'إننا', 'انه': 'إنه', 'انها': 'إنها',
  'اوي': 'أوي', 'اكيد': 'أكيد', 'امبارح': 'إمبارح', 'ابدا': 'أبدًا', 'أبدا': 'أبدًا', 'شكرا': 'شكرًا', 'جدا': 'جدًا',
  'طبعا': 'طبعًا', 'تقريبا': 'تقريبًا', 'دايما': 'دايمًا', 'مثلا': 'مثلًا', 'فعلا': 'فعلًا', 'اصلا': 'أصلًا', 'أصلا': 'أصلًا',
  'هاذا': 'هذا', 'هاذه': 'هذه', 'لاكن': 'لكن', 'ذالك': 'ذلك'
};

const TATWEEL = /ـ/g;
const DIACRITICS = /[ً-ْٰ]/g;

function fixWord(w) {
  if (!w) return w;
  const m = /^([^\u0600-\u06FFA-Za-z0-9]*)(.*?)([^\u0600-\u06FFA-Za-z0-9]*)$/.exec(w);
  const core = m[2].replace(TATWEEL, '');
  const fixed = WORDS[core] || core;
  return m[1] + fixed + m[3];
}

function fixPunctuation(text) {
  return text
    .replace(/\s+([،؛؟!.:,])/g, '$1')
    .replace(/([\u0600-\u06FF])\s*\?/g, '$1؟')
    .replace(/([\u0600-\u06FF])\s*,/g, '$1،')
    .replace(/([\u0600-\u06FF]);/g, '$1؛')
    .replace(/([،؛؟!])(?=[^\s])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fixText(text, { dialect = 'egyptian' } = {}) {
  let t = String(text || '').replace(TATWEEL, '');
  for (const [re, rep] of PHRASES) t = t.replace(re, (_, pre) => pre + rep);
  t = t.split(/(\s+)/).map(p => /\s/.test(p) ? p : fixWord(p)).join('');
  // في العربي الفصحى "ان" ممكن تبقى "أن" — نسيبها "إن" في العامية بس.
  if (dialect === 'msa') t = t.replace(/(^|\s)إن(?=\s)/g, '$1أن');
  return fixPunctuation(t);
}

/** Apply rule-based fixes word-by-word (keeps timings 1:1). */
function fixWords(words, opts) {
  return words.map(w => ({ ...w, text: fixText(w.text, opts) || w.text }));
}

/** Multi-word phrase fixes need to be applied across neighbouring words. */
function fixPhrasesAcrossWords(words) {
  const out = words.map(w => ({ ...w }));
  const pairs = [['إنشاء', 'الله', 'إن', 'شاء الله'], ['انشاء', 'الله', 'إن', 'شاء الله'], ['ماشاء', 'الله', 'ما', 'شاء الله'], ['الحمدلله', null, 'الحمد', 'لله']];
  for (let i = 0; i < out.length; i++) {
    const a = out[i].text.trim();
    for (const [x, y, rx, ry] of pairs) {
      if (a === x && (y === null || (out[i + 1] && out[i + 1].text.trim() === y))) {
        if (y === null) {
          const mid = (out[i].start + out[i].end) / 2;
          out.splice(i, 1, { ...out[i], text: rx, end: mid }, { ...out[i], text: ry, start: mid });
        } else { out[i].text = rx; out[i + 1].text = ry; }
      }
    }
  }
  return out;
}

/** AI spell-fix: the model must return exactly the same number of words. Falls back silently. */
async function fixWordsAI(words, llm, model, { dialect = 'egyptian', chunk = 250 } = {}) {
  const out = words.map(w => ({ ...w }));
  for (let i = 0; i < out.length; i += chunk) {
    const slice = out.slice(i, i + chunk);
    const src = slice.map(w => w.text);
    try {
      const res = await llm.json({
        model,
        system: 'أنت مدقق إملائي للتفريغ الصوتي العربي. صحح الإملاء والهمزات فقط ولا تغيّر اللهجة ولا تعيد الصياغة. أرجع JSON بالشكل {"words":[...]} بنفس عدد الكلمات وبنفس الترتيب بالضبط.',
        user: `اللهجة: ${dialect}\nالكلمات (${src.length}):\n${JSON.stringify(src)}`
      });
      const fixed = res && res.words;
      if (Array.isArray(fixed) && fixed.length === src.length) {
        fixed.forEach((t, j) => { if (typeof t === 'string' && t.trim()) out[i + j].text = t.trim(); });
      }
    } catch (_) { /* keep rule-based result */ }
  }
  return out;
}

function normalizeForSearch(s) {
  return String(s || '').replace(DIACRITICS, '').replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = { fixText, fixWords, fixPhrasesAcrossWords, fixWordsAI, normalizeForSearch, fixPunctuation };

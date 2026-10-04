'use strict';
// فصول يوتيوب من الكلام: بالذكاء الاصطناعي، ولو مفيش مفتاح بتتعمل أوفلاين بالسكتات.
const { ytTime } = require('./util');

function validate(chapters, total) {
  let list = (chapters || []).filter(c => isFinite(c.time) && c.title).map(c => ({ time: Math.max(0, +c.time), title: String(c.title).trim() }));
  list.sort((a, b) => a.time - b.time);
  if (!list.length || list[0].time > 0) list.unshift({ time: 0, title: list.length ? 'المقدمة' : 'البداية' });
  list[0].time = 0;
  const out = [];
  for (const c of list) { if (!out.length || c.time - out[out.length - 1].time >= 10) out.push(c); }
  return out.filter(c => !total || c.time < total);
}

function formatYouTube(chapters) { return chapters.map(c => `${ytTime(c.time)} ${c.title}`).join('\n'); }

/** Offline: split at the longest pauses, title = first words of the section. */
function offlineChapters(sentences, { count } = {}) {
  if (!sentences.length) return [];
  const total = sentences[sentences.length - 1].end;
  const n = count || Math.max(3, Math.min(10, Math.round(total / 90)));
  const gaps = sentences.slice(1).map((s, i) => ({ i: i + 1, gap: s.start - sentences[i].end }));
  const minSpacing = Math.max(10, total / (n * 2));
  const picks = [];
  for (const g of gaps.sort((a, b) => b.gap - a.gap)) {
    const t = sentences[g.i].start;
    if (picks.every(p => Math.abs(sentences[p].start - t) >= minSpacing) && t >= 10) picks.push(g.i);
    if (picks.length >= n - 1) break;
  }
  const idx = [0, ...picks.sort((a, b) => a - b)];
  return validate(idx.map(i => ({ time: sentences[i].start, title: sentences[i].text.split(' ').slice(0, 6).join(' ') })), total);
}

async function aiChapters(llm, model, sentences) {
  const total = sentences.length ? sentences[sentences.length - 1].end : 0;
  const lines = sentences.map(s => `[${Math.round(s.start)}] ${s.text}`).join('\n');
  const res = await llm.json({
    model,
    system: 'أنت محرر يوتيوب. قسّم الفيديو لفصول (3 إلى 12 فصل)، كل فصل عنوان قصير جذاب بنفس لغة/لهجة الكلام. أول فصل لازم يبدأ من 0. أرجع {"chapters":[{"time":ثواني,"title":"..."}]}',
    user: `مدة الفيديو ${Math.round(total)} ثانية. التفريغ بالثواني:\n${lines}`
  });
  return validate(res.chapters || res, total);
}

module.exports = { validate, formatYouTube, offlineChapters, aiChapters };

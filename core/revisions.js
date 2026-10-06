'use strict';
// تعديلات العميل: تلصق رسالة العميل ← تتقسم لمهام (بالوقت لو مذكور) ← تعلّم اللي خلص ← رسالة للعميل بالعامية المصرية.
const fs = require('fs');
const path = require('path');
const { hash } = require('./util');

const TYPES = { cut: 'قص', text: 'نص/كابشن', music: 'مزيكا/صوت', sfx: 'مؤثرات', color: 'ألوان', graphics: 'جرافيك/مشاهد', speed: 'إيقاع', other: 'تاني' };

// "1:20" "01:02:03" "دقيقة 2" "الثانية 45" "min 3" → seconds
const TIME_RE = /(\d{1,2}:\d{2}(?::\d{2})?)|(?:دقيق[ةه]|الدقيق[ةه]|min(?:ute)?)\s*(\d+(?:[.,]\d+)?)|(?:ثاني[ةه]|الثاني[ةه]|sec(?:ond)?)\s*(\d+)/i;
function parseTimeRef(s) {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  if (m[1]) return m[1].split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  if (m[2]) return Math.round(parseFloat(m[2].replace(',', '.')) * 60);
  if (m[3]) return +m[3];
  return null;
}

function guessType(t) {
  const s = String(t).toLowerCase();
  if (/شيل|احذف|اقطع|قص|امسح|cut|remove|delete|trim/.test(s)) return 'cut';
  if (/مزيك|موسيق|صوت|music|audio|volume/.test(s)) return 'music';
  if (/مؤثر|ساوند|sfx|effect/.test(s)) return 'sfx';
  if (/لون|ألوان|الوان|color|grade/.test(s)) return 'color';
  if (/كابشن|ترجم|نص|كلام مكتوب|عنوان|title|text|caption|font|خط/.test(s)) return 'text';
  if (/لوجو|جرافيك|مشهد|انتقال|transition|logo|graphic|انيميشن|أنيميشن/.test(s)) return 'graphics';
  if (/أسرع|اسرع|أبطأ|ابطأ|إيقاع|ايقاع|speed|pace/.test(s)) return 'speed';
  return 'other';
}

/** No AI needed: one task per line / bullet / number / sentence, with its time if mentioned. */
function splitOffline(text) {
  const lines = String(text || '').replace(/\r/g, '').split(/\n+/)
    .flatMap(l => l.split(/\s(?=\d{1,2}[-)]\s)/)) // "1- … 2- …" on one line
    .flatMap(l => l.split(/(?<=[.!؟?])\s+(?=[^\d\s])/)) // sentences (not "دقيقة 3. …")
    .map(x => x.replace(/^\s*(?:[-•*▪●◦]|\d{1,2}[-.)])\s*/, '').trim()).filter(x => x.length > 2);
  return lines.map((l, i) => ({ id: 'r' + (i + 1), text: l.slice(0, 200), time: parseTimeRef(l), type: guessType(l), done: false }));
}

async function splitAI(llm, model, text, { duration } = {}) {
  const res = await llm.json({ model, maxTokens: 2500,
    system: 'أنت مساعد مونتير محترف. بتاخد رسالة تعديلات من العميل (ممكن تكون مكتوبة بشكل عشوائي أو بأي لهجة) وتقسمها لمهام مونتاج واضحة ومنفصلة، كل مهمة جملة قصيرة بالعامية المصرية تبدأ بفعل (شيل، غيّر، زوّد…). لو العميل ذكر وقت (1:20، دقيقة 2) حطه بالثواني في time، ولو ذكر فترة حط timeEnd. type واحد من: ' + Object.keys(TYPES).join(', ') + '. ماتخترعش تعديلات مش موجودة، ولو فيه حاجة مش واضحة حطها كمهمة وفي note اكتب السؤال اللي تسأله للعميل.',
    user: `${duration ? `مدة الفيديو ${Math.round(duration)} ثانية.\n` : ''}رسالة العميل:\n${text}\n\nرجّع: {"items":[{"text":"...","time":ثواني أو null,"timeEnd":ثواني أو null,"type":"...","note":""}]}` });
  const items = (Array.isArray(res.items) ? res.items : []).filter(x => x && x.text).slice(0, 60);
  return items.map((x, i) => ({ id: 'r' + (i + 1), text: String(x.text).slice(0, 200), time: isFinite(+x.time) && x.time !== null ? +x.time : parseTimeRef(x.text), timeEnd: isFinite(+x.timeEnd) && x.timeEnd !== null ? +x.timeEnd : null, type: TYPES[x.type] ? x.type : guessType(x.text), note: x.note ? String(x.note).slice(0, 200) : '', done: false }));
}

function fmt(t) { t = Math.round(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

/** The reply to the client, without AI (used when there's no key/credits). */
function messageOffline(items, { name } = {}) {
  const done = items.filter(x => x.done), left = items.filter(x => !x.done);
  const L = [`أهلًا${name ? ' ' + name : ''} 👋`, done.length ? 'خلصت التعديلات دي:' : 'لسه شغال على التعديلات.'];
  done.forEach(x => L.push(`✅ ${x.text}${x.time != null ? ` (عند ${fmt(x.time)})` : ''}`));
  if (left.length) { L.push('', 'ولسه فاضل:'); left.forEach(x => L.push(`⏳ ${x.text}${x.note ? ` — ${x.note}` : ''}`)); }
  L.push('', left.length ? 'هبعتلك النسخة الكاملة أول ما أخلص الباقي 🙏' : 'النسخة الجديدة جاهزة، شوفها وقولّي رأيك 🙏');
  return L.join('\n');
}

async function messageAI(llm, model, items, { name } = {}) {
  const txt = await llm.text({ model, maxTokens: 900,
    system: 'أنت مونتير محترف بتكتب رسالة واتساب للعميل بالعامية المصرية: ودودة ومحترمة ومختصرة. قول التعديلات اللي اتعملت (كل واحدة في سطر بعلامة ✅) واللي لسه (⏳) لو فيه، ولو فيه سؤال للعميل اسأله بوضوح. ماتزوّدش تعديلات مش في القائمة. من غير مقدمات طويلة.',
    user: `${name ? `اسم العميل: ${name}\n` : ''}التعديلات:\n${items.map(x => `${x.done ? '[اتعمل]' : '[لسه]'} ${x.text}${x.time != null ? ` (${fmt(x.time)})` : ''}${x.note ? ` — ملاحظة: ${x.note}` : ''}`).join('\n')}` });
  return txt.trim();
}

/* ---------- الحفظ: لكل مشروع ملف، وكل جولة تعديلات لوحدها ---------- */
function file(dataDir, projectPath) { const d = path.join(dataDir, 'revisions'); fs.mkdirSync(d, { recursive: true }); return path.join(d, `${hash(projectPath || 'no-project')}.json`); }
function load(dataDir, projectPath) { try { return JSON.parse(fs.readFileSync(file(dataDir, projectPath), 'utf8')); } catch (_) { return { project: projectPath || '', rounds: [] }; } }
function save(dataDir, projectPath, data) { fs.writeFileSync(file(dataDir, projectPath), JSON.stringify(data, null, 1)); return data; }

module.exports = { TYPES, parseTimeRef, guessType, splitOffline, splitAI, messageOffline, messageAI, load, save, fmt };

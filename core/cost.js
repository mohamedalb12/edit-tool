'use strict';
// كام هيتصرف؟ تقدير لكل ميزة AI قبل ما تدوس، وعدّاد للي اتصرف فعلًا (النهارده والشهر ده).
const fs = require('fs');
const path = require('path');

// أسعار احتياطي (دولار لكل مليون توكن) لو قائمة OpenRouter لسه ماتحمّلتش. الحقيقية بتيجي من OpenRouter نفسه.
const KNOWN_PRICES = {
  'anthropic/claude-opus-5.5': { in: 4, out: 20, cached: 0.2 },
  'anthropic/claude-sonnet-5.5': { in: 2, out: 10, cached: 0.2 },
  'anthropic/claude-haiku-4.5': { in: 1, out: 5, cached: 0.1 }
};

/*
 * استهلاك تقريبي لكل ميزة في المرة الواحدة على فيديو كلام ~10 دقايق (توكنز):
 * in = داخل جديد، cached = داخل متكرر بيتقري من الكاش (المونتير الذكي بيعيد قراية المحادثة كل خطوة)، out = طالع.
 * perMin = بيكبر مع طول الفيديو (التفريغ داخل في الطلب).
 */
const PROFILES = {
  agent_strong: { in: 40000, cached: 350000, out: 12000, perMin: true, what: 'جلسة مونتاج كاملة بالشات' },
  agent_max: { in: 50000, cached: 500000, out: 20000, perMin: true, what: 'جلسة مونتاج كاملة بالشات (بيخطط ويراجع)' },
  auto_effects: { in: 9000, out: 3000, perMin: true, what: 'اقتراح المؤثرات للفيديو كله' },
  sfx_translate: { in: 300, out: 80, what: 'ترجمة وصف واحد' },
  spellfix: { in: 7000, out: 7000, perMin: true, what: 'تصحيح التفريغ كله' },
  chapters: { in: 7000, out: 900, perMin: true, what: 'فصول الفيديو' },
  scene: { in: 9000, out: 5000, what: 'مشهد أو مونتاج بالاستايل' },
  broll: { in: 7000, out: 900, perMin: true, what: 'كلمات بحث الـ B-Roll' },
  hook: { in: 7000, out: 400, perMin: true, what: 'اختيار الهوك' },
  shorts: { in: 8000, out: 1500, perMin: true, what: 'أقوى مقاطع شورتس' },
  thumbnail: { in: 9000, out: 700, what: 'أفكار الثامبنيل (بيشوف صور)' },
  translate: { in: 4500, out: 4500, perMin: true, what: 'ترجمة الكابشن' },
  revisions: { in: 1500, out: 1200, what: 'تقسيم التعديلات + رسالة العميل' }
};

/** price {in,out,cached?} per 1M tokens for a model: OpenRouter's list first, then the known table */
function priceOf(model, list) {
  const m = (list || []).find(x => x.id === model);
  const p = m && m.price && isFinite(m.price.in) && isFinite(m.price.out) ? m.price : KNOWN_PRICES[model];
  if (!p) return null;
  // cached input: Anthropic ~10% of input, most others ~25-50% → be safe with 50% when unknown
  const cached = isFinite(p.cached) ? p.cached : (/^anthropic\//.test(model) ? p.in * 0.1 : p.in * 0.5);
  return { in: +p.in, out: +p.out, cached };
}

/**
 * Estimated cost (USD) of one run of a feature: { low, high } — high allows for models that think before answering
 * (thinking is billed as output) and for a longer/denser video. null when the model's price isn't known.
 */
function estimate(feature, model, list, { minutes = 10 } = {}) {
  const pr = PROFILES[feature], price = priceOf(model, list);
  if (!pr || !price) return null;
  const k = pr.perMin ? Math.max(0.2, minutes / 10) : 1;
  const base = (pr.in * k * price.in + (pr.cached || 0) * k * price.cached + pr.out * price.out) / 1e6;
  return { low: base, high: base * 2.2, what: pr.what, free: price.in === 0 && price.out === 0 };
}

/** "أقل من سنت" / "3 سنت" / "$1.20" */
function fmt(usd) {
  if (!isFinite(usd)) return '—';
  if (usd < 0.01) return 'أقل من سنت';
  if (usd < 1) return Math.round(usd * 100) + ' سنت';
  return '$' + usd.toFixed(2);
}
function fmtRange(e) {
  if (!e) return 'السعر مش معروف';
  if (e.free) return 'مجاني';
  if (e.high < 0.01) return 'أقل من سنت';
  if (e.high < 1) { const a = Math.max(1, Math.round(e.low * 100)), b = Math.max(a, Math.round(e.high * 100)); return '≈ ' + (a === b ? a : a + '–' + b) + ' سنت'; }
  return '≈ $' + e.low.toFixed(2) + '–' + e.high.toFixed(2);
}

/** what a finished request cost: OpenRouter's own number when it sends one, else computed from tokens × price */
function costOfUsage(usage, model, list) {
  if (!usage) return 0;
  if (typeof usage.cost === 'number') return usage.cost;
  const p = priceOf(model, list); if (!p) return 0;
  const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0;
  return ((Math.max(0, (usage.prompt_tokens || 0) - cached)) * p.in + cached * p.cached + (usage.completion_tokens || 0) * p.out) / 1e6;
}

/* ---------- الدفتر: كل طلب بيتسجل باليوم ---------- */
function day(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function file(dataDir) { return path.join(dataDir, 'spend.json'); }
function load(dataDir) { try { return JSON.parse(fs.readFileSync(file(dataDir), 'utf8')); } catch (_) { return { days: {} }; } }

function record(dataDir, { model, cost, tokens = 0 }, now = new Date()) {
  const d = load(dataDir), k = day(now);
  const t = d.days[k] = d.days[k] || { cost: 0, calls: 0, tokens: 0, models: {} };
  t.cost += cost || 0; t.calls++; t.tokens += tokens;
  const m = t.models[model] = t.models[model] || { cost: 0, calls: 0 };
  m.cost += cost || 0; m.calls++;
  const keys = Object.keys(d.days).sort(); while (keys.length > 120) delete d.days[keys.shift()]; // ~4 months
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file(dataDir), JSON.stringify(d));
  return t;
}

function summary(dataDir, now = new Date()) {
  const d = load(dataDir), k = day(now), month = k.slice(0, 7);
  const today = d.days[k] || { cost: 0, calls: 0, tokens: 0, models: {} };
  let monthCost = 0, monthCalls = 0;
  for (const [key, v] of Object.entries(d.days)) if (key.startsWith(month)) { monthCost += v.cost; monthCalls += v.calls; }
  const byModel = Object.entries(today.models).map(([id, v]) => ({ id, cost: v.cost, calls: v.calls })).sort((a, b) => b.cost - a.cost);
  const last7 = []; for (let i = 6; i >= 0; i--) { const x = new Date(now); x.setDate(x.getDate() - i); const kk = day(x); last7.push({ day: kk, cost: (d.days[kk] || {}).cost || 0 }); }
  return { today: today.cost, todayCalls: today.calls, month: monthCost, monthCalls, byModel, last7 };
}

module.exports = { KNOWN_PRICES, PROFILES, priceOf, estimate, fmt, fmtRange, costOfUsage, record, summary, day };

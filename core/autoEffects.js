'use strict';
// المؤثرات التلقائية: الموديل بيقرا الكلام ويفهم بيحصل إيه، ويقترح مؤثر مناسب لكل لحظة (مش بيدوّر على قمم صوت).
const { sentences } = require('./transcribe');
const motion = require('./motionPresets');

const DENSITY = { low: { every: 12, label: 'قليل' }, medium: { every: 7, label: 'متوسط' }, high: { every: 4, label: 'كتير' } };

function buildPrompt(words, { density = 'medium', style } = {}) {
  const sents = sentences(words);
  const total = sents.length ? sents[sents.length - 1].end : 0;
  const d = DENSITY[density] || DENSITY.medium;
  const presetIds = motion.PRESETS.filter(p => p.kind === 'emphasis').map(p => p.id).join(', ');
  const system = [
    'أنت مونتير محترف متخصص في المؤثرات الصوتية والبصرية للفيديوهات القصيرة واليوتيوب.',
    'اقرا التفريغ وافهم بيحصل إيه في كل لحظة (نكتة، مفاجأة، رقم مهم، انتقال لفكرة جديدة، سؤال، تأكيد...)،',
    'واقترح مؤثر في اللحظات اللي تستاهل بس. ماتحطش مؤثرات عشوائية.',
    `الكثافة المطلوبة: مؤثر تقريبًا كل ${d.every} ثواني في المتوسط.`,
    'أنواع المؤثرات: "sfx" (صوت يتولّد من وصف إنجليزي قصير ودقيق) أو "motion" (حركة كاميرا على الكليب من القوالب: ' + presetIds + ').',
    'رجّع {"effects":[{"time":ثانية,"type":"sfx"|"motion","prompt":"وصف إنجليزي للصوت لو sfx","preset":"id لو motion","duration":ثواني,"reason":"السبب بالعربي في جملة قصيرة"}]}'
  ].join('\n');
  const st = style ? `\nذوق المونتير: ${JSON.stringify(style)}` : '';
  const user = `مدة الفيديو ${Math.round(total)} ثانية.${st}\nالتفريغ (الوقت بالثواني):\n` + sents.map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join('\n');
  return { system, user, total };
}

function validate(effects, total, { minSpacing = 1.5 } = {}) {
  const ids = new Set(motion.PRESETS.map(p => p.id));
  const out = [];
  for (const e of (effects || []).slice().sort((a, b) => a.time - b.time)) {
    if (!isFinite(e.time) || e.time < 0 || (total && e.time > total)) continue;
    if (e.type === 'sfx' && (!e.prompt || !String(e.prompt).trim())) continue;
    if (e.type === 'motion' && !ids.has(e.preset)) continue;
    if (e.type !== 'sfx' && e.type !== 'motion') continue;
    const prev = out.filter(x => x.type === e.type).pop();
    if (prev && e.time - prev.time < minSpacing) continue;
    out.push({ time: +(+e.time).toFixed(3), type: e.type, prompt: e.prompt ? String(e.prompt).trim() : undefined, preset: e.preset,
      duration: Math.min(10, Math.max(0.5, +e.duration || (e.type === 'sfx' ? 1.5 : 0.5))), reason: e.reason || '' });
  }
  return out;
}

async function suggest(llm, model, words, opts = {}) {
  const { system, user, total } = buildPrompt(words, opts);
  const res = await llm.json({ model, system, user, maxTokens: 6000 });
  return validate(res.effects || res, total);
}

module.exports = { DENSITY, buildPrompt, validate, suggest };

'use strict';
// عميل OpenRouter: كل مميزات الذكاء الاصطناعي في الإضافة بتعدّي من هنا بمفتاحك، وكل ميزة ليها موديل تختاره.
const { extractJson } = require('./util');

const BASE = 'https://openrouter.ai/api/v1';

// بتتعرض في القائمة لو مفيش نت أو لسه مجبناش القائمة الحقيقية من OpenRouter.
const FALLBACK_MODELS = [
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5' },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 mini' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' }
];

// كل ميزة ذكاء اصطناعي في الإضافة + الموديل الافتراضي بتاعها.
const FEATURES = [
  { id: 'agent_strong', label: 'المونتير الذكي — قوي', def: 'anthropic/claude-sonnet-5.5', tools: true },
  { id: 'agent_max', label: 'المونتير الذكي — قوي جدًا', def: 'anthropic/claude-opus-5.5', tools: true },
  { id: 'auto_effects', label: 'المؤثرات التلقائية', def: 'anthropic/claude-sonnet-5.5' },
  { id: 'sfx_translate', label: 'ترجمة وصف المؤثر الصوتي', def: 'anthropic/claude-haiku-4.5' },
  { id: 'spellfix', label: 'التصحيح الإملائي بعد التفريغ', def: 'anthropic/claude-haiku-4.5' },
  { id: 'chapters', label: 'فصول يوتيوب', def: 'anthropic/claude-sonnet-5.5' },
  { id: 'scene', label: 'بناء المشاهد المتحركة', def: 'anthropic/claude-sonnet-5.5' },
  { id: 'broll', label: 'كلمات بحث الـ B-Roll', def: 'anthropic/claude-haiku-4.5' },
  { id: 'hook', label: 'اختيار الهوك (المونتاج التلقائي)', def: 'anthropic/claude-sonnet-5.5' },
  { id: 'shorts', label: 'أقوى مقاطع الشورتس', def: 'anthropic/claude-sonnet-5.5' },
  { id: 'thumbnail', label: 'عناوين الثامبنيل', def: 'anthropic/claude-sonnet-5.5', vision: true },
  { id: 'translate', label: 'ترجمة الكابشن', def: 'anthropic/claude-haiku-4.5' },
  { id: 'revisions', label: 'تعديلات العميل', def: 'anthropic/claude-sonnet-5.5' }
];

/**
 * Prompt caching: the system prompt + tool list (and the conversation so far) are identical on every step of the
 * agent loop. Anthropic models need explicit cache breakpoints; OpenAI/Gemini/DeepSeek cache automatically.
 * Cached input costs ~10% of normal input, so long editing sessions get much cheaper.
 */
function withCache(model, messages) {
  if (!/^anthropic\//.test(String(model || ''))) return messages;
  const mark = text => [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
  const out = messages.map(m => m);
  const sys = out.findIndex(m => m.role === 'system' && typeof m.content === 'string');
  if (sys >= 0) out[sys] = { ...out[sys], content: mark(out[sys].content) };
  // the newest user message: everything before it (incl. earlier tool rounds) is re-read from cache on the next step
  for (let i = out.length - 1; i > sys; i--) {
    if (out[i].role === 'user' && typeof out[i].content === 'string' && out[i].content.length > 200) { out[i] = { ...out[i], content: mark(out[i].content) }; break; }
  }
  return out;
}

/** OpenRouter errors in plain Egyptian Arabic, with what to do */
function friendly(status, msg) {
  const afford = /can only afford (\d+)/.exec(msg);
  if (status === 402) return `رصيد OpenRouter مش كفاية${afford ? ` (المفتاح يقدر يصرف ${afford[1]} توكن بس)` : ''} — اشحن رصيد من openrouter.ai/settings/credits أو زوّد حد المفتاح (Credit limit) من openrouter.ai/settings/keys. [OpenRouter 402]`;
  if (status === 401) return 'مفتاح OpenRouter غلط أو اتلغى — حط مفتاح جديد من الإعدادات. [OpenRouter 401]';
  if (status === 404 && /model|endpoint/i.test(msg)) return `الموديل ده مش موجود على OpenRouter — غيّره من الإعدادات (${msg.slice(0, 120)}) [OpenRouter 404]`;
  if (status === 429) return 'OpenRouter مضغوط دلوقتي أو المفتاح وصل للحد — استنى شوية وجرّب تاني. [OpenRouter 429]';
  return `OpenRouter ${status}: ${msg}`;
}

function modelFor(featureId, settings = {}) {
  const f = FEATURES.find(x => x.id === featureId);
  return (settings.models && settings.models[featureId]) || settings.defaultModel || (f && f.def) || FALLBACK_MODELS[0].id;
}

// last model list fetched (with prices) — used to price requests when OpenRouter doesn't send the cost
const catalog = { list: [] };

class OpenRouter {
  constructor({ apiKey, fetchImpl, retries = 2, appName = 'EditFast for Premiere Pro', onUsage } = {}) {
    this.apiKey = apiKey;
    this.onUsage = onUsage; // (model, usage) after every answered request → the spend counter
    this.fetch = fetchImpl || require('./http').nodeFetch;
    this.retries = retries;
    this.appName = appName;
  }

  headers() {
    if (!this.apiKey) throw new Error('حط مفتاح OpenRouter من الإعدادات الأول.');
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://editfast.local', 'X-Title': this.appName };
  }

  async request(pathname, body, method = 'POST') {
    if (body && body._shrunk !== undefined) delete body._shrunk;
    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const send = body ? { ...body } : null; if (send) delete send._shrunk;
        const res = await this.fetch(BASE + pathname, { method, headers: this.headers(), body: send ? JSON.stringify(send) : undefined });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
        if (res.ok && !data.error) return data;
        const msg = (data.error && (data.error.message || data.error)) || text.slice(0, 300);
        // the key can still afford a shorter answer → retry once with fewer max_tokens
        const afford = /can only afford (\d+)/.exec(String(msg));
        if (res.status === 402 && afford && body && body.max_tokens && +afford[1] >= 300 && +afford[1] < body.max_tokens && !body._shrunk) {
          body = { ...body, max_tokens: +afford[1] - 32, _shrunk: true }; attempt--; continue;
        }
        const err = new Error(friendly(res.status, String(msg)));
        err.status = res.status;
        if (res.status === 429 || res.status >= 500) { lastErr = err; await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt))); continue; }
        throw err;
      } catch (e) {
        if (e.status && e.status < 500 && e.status !== 429) throw e;
        lastErr = e;
        if (attempt < this.retries) await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
    throw lastErr;
  }

  async listModels() {
    const res = await this.fetch(BASE + '/models', { headers: { 'HTTP-Referer': 'https://editfast.local', 'X-Title': this.appName } });
    if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
    const data = await res.json();
    return (catalog.list = (data.data || []).map(m => ({
      id: m.id, name: m.name || m.id, context: m.context_length,
      tools: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('tools') : undefined,
      vision: m.architecture && Array.isArray(m.architecture.input_modalities) ? m.architecture.input_modalities.includes('image') : undefined,
      price: m.pricing ? Object.assign({ in: +m.pricing.prompt * 1e6, out: +m.pricing.completion * 1e6 }, m.pricing.input_cache_read !== undefined ? { cached: +m.pricing.input_cache_read * 1e6 } : {}) : null
    })));
  }

  /** OpenAI-style chat completion. Returns the assistant message object. */
  async chat({ model, messages, tools, temperature, maxTokens = 4096, jsonMode = false, cache = true }) {
    const body = { model, messages: cache ? withCache(model, messages) : messages, max_tokens: maxTokens, usage: { include: true } };
    if (temperature !== undefined) body.temperature = temperature;
    if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    if (jsonMode) body.response_format = { type: 'json_object' };
    const data = await this.request('/chat/completions', body);
    if (this.onUsage && data.usage) { try { this.onUsage(model, data.usage); } catch (_) {} }
    const choice = data.choices && data.choices[0];
    if (!choice) throw new Error('OpenRouter رجّع رد فاضي');
    return { ...choice.message, finish_reason: choice.finish_reason, usage: data.usage };
  }

  async text({ model, system, user, maxTokens = 2048 }) {
    const msgs = []; if (system) msgs.push({ role: 'system', content: system }); msgs.push({ role: 'user', content: user });
    const m = await this.chat({ model, messages: msgs, maxTokens });
    return String(m.content || '').trim();
  }

  async json({ model, system, user, maxTokens = 4096 }) {
    const sys = (system ? system + '\n' : '') + 'رد بـ JSON صالح فقط من غير أي كلام زيادة.';
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
    let m;
    try { m = await this.chat({ model, messages: msgs, maxTokens, jsonMode: true }); }
    catch (e) { if (e.status === 400) m = await this.chat({ model, messages: msgs, maxTokens }); else throw e; }
    return extractJson(m.content);
  }
}

module.exports = { catalog, OpenRouter, FEATURES, FALLBACK_MODELS, modelFor, withCache, friendly, BASE };

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
  { id: 'broll', label: 'كلمات بحث الـ B-Roll', def: 'anthropic/claude-haiku-4.5' }
];

function modelFor(featureId, settings = {}) {
  const f = FEATURES.find(x => x.id === featureId);
  return (settings.models && settings.models[featureId]) || settings.defaultModel || (f && f.def) || FALLBACK_MODELS[0].id;
}

class OpenRouter {
  constructor({ apiKey, fetchImpl, retries = 2, appName = 'EditFast for Premiere Pro' } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl || require('./http').nodeFetch;
    this.retries = retries;
    this.appName = appName;
  }

  headers() {
    if (!this.apiKey) throw new Error('حط مفتاح OpenRouter من الإعدادات الأول.');
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://editfast.local', 'X-Title': this.appName };
  }

  async request(pathname, body, method = 'POST') {
    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetch(BASE + pathname, { method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
        if (res.ok && !data.error) return data;
        const msg = (data.error && (data.error.message || data.error)) || text.slice(0, 300);
        const err = new Error(`OpenRouter ${res.status}: ${msg}`);
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
    return (data.data || []).map(m => ({
      id: m.id, name: m.name || m.id, context: m.context_length,
      tools: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('tools') : undefined,
      price: m.pricing ? { in: +m.pricing.prompt * 1e6, out: +m.pricing.completion * 1e6 } : null
    }));
  }

  /** OpenAI-style chat completion. Returns the assistant message object. */
  async chat({ model, messages, tools, temperature, maxTokens = 4096, jsonMode = false }) {
    const body = { model, messages, max_tokens: maxTokens };
    if (temperature !== undefined) body.temperature = temperature;
    if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    if (jsonMode) body.response_format = { type: 'json_object' };
    const data = await this.request('/chat/completions', body);
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

module.exports = { OpenRouter, FEATURES, FALLBACK_MODELS, modelFor, BASE };

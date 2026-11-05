'use strict';
// اختبار مفتاح API لـ Claude على موقع وسيط (زي MWAPI) أو على Anthropic نفسها: بيكلّم الموقع مباشرة ويقول بالظبط
// إيه اللي شغّال — الموديلات، رد حقيقي من /v1/messages — ولو الموقع OpenAI بس بيقول كده بدل ما يفشل وخلاص.
const http = require('http');
const https = require('https');
const { URL } = require('url');

/** the sites the settings tab knows by name (the user still pastes their own key) */
const PROVIDERS = {
  mwapi: { id: 'mwapi', name: 'MWAPI', url: 'https://api.mwapi.dev', site: 'https://api.mwapi.dev/dashboard' },
  anthropic: { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com', site: 'https://console.anthropic.com/settings/keys' }
};

function request(method, url, { key, body, timeout = 30000 } = {}) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (e) { return resolve({ status: 0, error: 'الرابط مش صح: ' + url }); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = lib.request(u, {
      method,
      headers: Object.assign({ 'x-api-key': key, authorization: 'Bearer ' + key, 'anthropic-version': '2023-06-01', accept: 'application/json', 'user-agent': 'EditFast' },
        data ? { 'content-type': 'application/json', 'content-length': data.length } : {})
    }, res => {
      let txt = ''; res.setEncoding('utf8');
      res.on('data', d => { if (txt.length < 200000) txt += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, json, text: txt.slice(0, 400) }); });
    });
    req.on('error', e => resolve({ status: 0, error: e.code === 'ENOTFOUND' ? 'الموقع مش موجود أو النت مقطوع (' + u.host + ')' : e.message }));
    req.setTimeout(timeout, () => { req.destroy(); resolve({ status: 0, error: 'الموقع ماردش في ' + Math.round(timeout / 1000) + ' ثانية' }); });
    if (data) req.write(data);
    req.end();
  });
}
function errText(r) {
  if (r.error) return r.error;
  const m = r.json && ((r.json.error && (r.json.error.message || r.json.error.type || r.json.error)) || r.json.message || r.json.detail);
  return (typeof m === 'string' ? m : r.text || '').slice(0, 200);
}
function why(r) {
  if (r.status === 401 || r.status === 403) return 'المفتاح مرفوض (' + r.status + '): ' + errText(r);
  if (r.status === 402) return 'الرصيد خلص في الموقع (402): ' + errText(r);
  if (r.status === 429) return 'وصلت لحد الاستخدام في الموقع (429): ' + errText(r);
  if (r.status === 404 && /model/i.test(errText(r))) return 'اسم الموديل مش موجود عند الموقع: ' + errText(r);
  return (r.status ? 'الموقع رد بـ ' + r.status + ': ' : '') + errText(r);
}
/** the best Claude model on the list: newest Sonnet, else Opus, else the first Claude */
function pickModel(ids) {
  const c = ids.filter(i => /claude/i.test(i));
  return c.find(i => /sonnet/i.test(i)) || c.find(i => /opus/i.test(i)) || c[0] || ids[0] || null;
}

/**
 * { url, key, model } → { ok, format: 'anthropic'|'openai'|null, models: [ids], model, reply, ms, message }
 * Talks to the site itself: GET /v1/models, then a real one-line POST /v1/messages (what Claude Code sends).
 */
async function test({ url, key, model } = {}) {
  const { gatewayOf } = require('./claudeChat');
  const g = gatewayOf({ url, key, model });
  if (!g) return { ok: false, models: [], message: 'محتاج الرابط والمفتاح الاتنين' };
  const lm = await request('GET', g.url + '/v1/models', { key: g.key, timeout: 20000 });
  if (lm.status === 0) return { ok: false, models: [], message: lm.error };
  if (lm.status === 401 || lm.status === 403) return { ok: false, models: [], message: why(lm) };
  const list = lm.status === 200 && lm.json && Array.isArray(lm.json.data) ? lm.json.data.map(m => m && (m.id || m.name)).filter(Boolean) : [];
  const use = g.model || pickModel(list);
  if (!use) return { ok: false, models: list, message: 'الموقع مابيقولش أسامي الموديلات — اكتب اسم الموديل من صفحة الموقع' };
  const t0 = Date.now();
  const r = await request('POST', g.url + '/v1/messages', { key: g.key, body: { model: use, max_tokens: 20, messages: [{ role: 'user', content: 'رد بكلمة واحدة: تمام' }] } });
  const ms = Date.now() - t0;
  if (r.status === 200 && r.json && Array.isArray(r.json.content)) {
    const reply = r.json.content.filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
    return { ok: true, format: 'anthropic', models: list, model: use, reply: reply.slice(0, 80), ms, message: 'شغّال ✓ — ' + use + ' رد: ' + (reply.slice(0, 40) || '(رد فاضي)') + ' (' + (ms / 1000).toFixed(1) + 's)' };
  }
  if (r.status === 404 || r.status === 405 || (r.status === 200 && !(r.json && r.json.content))) {
    // maybe an OpenAI-style site: Claude Code can't use it, but say so plainly
    const o = await request('POST', g.url + '/v1/chat/completions', { key: g.key, body: { model: use, max_tokens: 20, messages: [{ role: 'user', content: 'رد بكلمة واحدة: تمام' }] } });
    if (o.status === 200 && o.json && o.json.choices) return { ok: false, format: 'openai', models: list, model: use, message: 'الموقع شغّال بس بصيغة OpenAI (/v1/chat/completions) مش Anthropic — شات Claude محتاج /v1/messages. شوف في الموقع لو فيه رابط "Anthropic" أو "Claude Code".' };
  }
  return { ok: false, format: null, models: list, model: use, message: why(r) };
}

module.exports = { test, request, pickModel, PROVIDERS };

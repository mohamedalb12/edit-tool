'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const gw = require('../../core/gateway');

// a stand-in API site: Anthropic-style (/v1/models + /v1/messages) or OpenAI-only
function site(kind) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; }); req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-api-key'], bearer: req.headers.authorization, version: req.headers['anthropic-version'], body: body && JSON.parse(body) });
      const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers['x-api-key'] !== 'good') return send(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (req.url === '/v1/models') return send(200, { data: [{ id: 'gpt-x' }, { id: 'claude-opus-z' }, { id: 'claude-sonnet-z' }] });
      if (req.url === '/v1/messages') return kind === 'anthropic' ? send(200, { content: [{ type: 'text', text: 'تمام' }] }) : send(404, { error: 'not found' });
      if (req.url === '/v1/chat/completions') return send(200, { choices: [{ message: { content: 'تمام' } }] });
      send(404, {});
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port, seen })));
}

test('an Anthropic-style site: the key is checked, the models are listed, a real /v1/messages answers with the best Claude model', async () => {
  const s = await site('anthropic');
  try {
    const r = await gw.test({ url: s.url + '/dashboard', key: 'good' });
    assert.equal(r.ok, true, r.message); assert.equal(r.format, 'anthropic');
    assert.deepEqual(r.models, ['gpt-x', 'claude-opus-z', 'claude-sonnet-z']);
    assert.equal(r.model, 'claude-sonnet-z'); assert.match(r.message, /تمام/);
    const m = s.seen.find(x => x.url === '/v1/messages');
    assert.equal(m.key, 'good'); assert.equal(m.bearer, 'Bearer good'); assert.equal(m.version, '2023-06-01'); assert.equal(m.body.model, 'claude-sonnet-z');
    assert.equal((await gw.test({ url: s.url, key: 'good', model: 'claude-opus-z' })).model, 'claude-opus-z', 'the model the user typed wins');
    const bad = await gw.test({ url: s.url, key: 'nope' });
    assert.equal(bad.ok, false); assert.match(bad.message, /المفتاح مرفوض \(401\)/);
  } finally { s.srv.close(); }
});

test('an OpenAI-only site is named as such, a dead host is said plainly, and nothing runs without a key', async () => {
  const s = await site('openai');
  try {
    const r = await gw.test({ url: s.url, key: 'good' });
    assert.equal(r.ok, false); assert.equal(r.format, 'openai'); assert.match(r.message, /OpenAI/);
  } finally { s.srv.close(); }
  const dead = await gw.test({ url: 'http://127.0.0.1:9', key: 'k', model: 'm' });
  assert.equal(dead.ok, false); assert.ok(dead.message.length > 3);
  assert.match((await gw.test({ url: 'https://x.dev', key: '' })).message, /المفتاح/);
  assert.equal(gw.PROVIDERS.mwapi.url, 'https://api.mwapi.dev');
  assert.equal(gw.pickModel(['a', 'claude-haiku', 'claude-opus']), 'claude-opus');
});

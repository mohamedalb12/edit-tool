'use strict';
const { TMP } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { nodeFetch } = require('../../core/http');
const downloader = require('../../core/downloader');

test('node http client: json POST, headers, redirects, errors, streaming download with progress', async () => {
  const big = Buffer.alloc(300000, 7);
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => body += d); req.on('end', () => {
      if (req.url === '/echo') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization, body: JSON.parse(body || 'null') })); }
      if (req.url === '/redir') { res.writeHead(302, { Location: '/file' }); return res.end(); }
      if (req.url === '/file') { res.writeHead(200, { 'Content-Length': big.length }); return res.end(big); }
      res.writeHead(404); res.end('nope');
    });
  });
  await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await nodeFetch(base + '/echo', { method: 'POST', headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'عربي' }) });
    assert.deepEqual(await r.json(), { method: 'POST', auth: 'Bearer k', body: { a: 'عربي' } });
    const f = await nodeFetch(base + '/redir');
    assert.equal(Buffer.from(await f.arrayBuffer()).length, big.length);
    const nf = await nodeFetch(base + '/missing');
    assert.equal(nf.ok, false); assert.equal(nf.status, 404); assert.equal(await nf.text(), 'nope');
    const prog = [];
    const dest = path.join(TMP, 'models', 'ggml-x.bin');
    const d = await downloader.download(base + '/redir', dest, { onProgress: p => prog.push(p) });
    assert.equal(d.bytes, big.length); assert.ok(prog.length > 0 && prog.at(-1) === 1);
    assert.ok(!fs.existsSync(dest + '.part'));
    await assert.rejects(downloader.download(base + '/missing', path.join(TMP, 'm2.bin')), /404/);
    assert.equal(downloader.WHISPER_MODELS.length, 4);
    assert.match(downloader.whisperUrl('large-v3-turbo'), /ggml-large-v3-turbo\.bin$/);
  } finally { srv.close(); }
});

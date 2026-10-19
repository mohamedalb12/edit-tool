'use strict';
// fetch مبني على Node (https) — جوه بريمير الـ fetch بتاع المتصفح بيتمنع بسبب CORS، ده لأ.
const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

function makeResponse(res, buf, url) {
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, url,
    headers: { get: k => { const v = res.headers[String(k).toLowerCase()]; return v === undefined ? null : String(v); } },
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)
  };
}

/**
 * nodeFetch(url, { method, headers, body, timeout, toFile, onProgress, redirects })
 * With `toFile`, the body is streamed to disk (for big downloads) and the response text is empty.
 * `onBytes(got, total)` also reports when the size isn't known; `headersOnly` resolves on the headers and drops the body.
 */
function nodeFetch(url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeout = 120000, toFile, onProgress, onBytes, headersOnly, onRequest, redirects = 5 } = opts;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    const h = { 'User-Agent': 'EditFast/1.0', ...headers };
    if (payload) h['Content-Length'] = payload.length;
    const req = lib.request(u, { method, headers: h }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        const keep = res.statusCode === 307 || res.statusCode === 308;
        return resolve(nodeFetch(next, { ...opts, method: keep ? method : 'GET', body: keep ? body : undefined, redirects: redirects - 1 }));
      }
      // headers only (size / name / type of a big file): never pull the body
      if (headersOnly) { res.destroy(); return resolve(makeResponse(res, Buffer.alloc(0), url)); }
      const total = +res.headers['content-length'] || 0;
      let got = 0;
      if (toFile && res.statusCode >= 200 && res.statusCode < 300) {
        const tmp = toFile + '.part';
        const out = fs.createWriteStream(tmp);
        let broke = false;
        res.on('data', d => { got += d.length; if (onProgress && total) onProgress(got / total); if (onBytes) onBytes(got, total); });
        res.pipe(out);
        out.on('finish', () => {
          if (broke) return;
          // a dropped connection still "finishes" the file: never accept a truncated download as good
          if (total && got < total) { try { fs.unlinkSync(tmp); } catch (_) {} return reject(new Error(`التحميل اتقطع (${Math.round(got / 1e6)} من ${Math.round(total / 1e6)} ميجا) — جرّب تاني`)); }
          fs.renameSync(tmp, toFile); resolve(makeResponse(res, Buffer.alloc(0), url));
        });
        const stop = e => { if (broke) return; broke = true; out.destroy(); try { fs.unlinkSync(tmp); } catch (_) {} reject(e); };
        res.on('aborted', () => stop(new Error('التحميل اتقطع')));
        req.on('error', stop);
        out.on('error', reject); res.on('error', stop);
        return;
      }
      const chunks = [];
      res.on('data', d => { chunks.push(d); got += d.length; if (onProgress && total) onProgress(got / total); });
      res.on('end', () => resolve(makeResponse(res, Buffer.concat(chunks), url)));
      res.on('error', reject);
    });
    if (onRequest) onRequest(req); // lets a caller stop a big download (req.destroy())
    req.setTimeout(timeout, () => req.destroy(new Error('انتهى وقت الاتصال: ' + u.host)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { nodeFetch };

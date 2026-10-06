// EditFast Pro scenes — renders a scene spec with Remotion locally.
// usage: node render.mjs job.json   (job: { spec, out, still?, frame?, browserExecutable?, concurrency? })
// prints JSON lines: {"progress":0.42} … {"done":"/path/out.mov"}
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function getBundle() {
  // cache the webpack bundle between renders (rebuilt only when sources change)
  const cacheRoot = path.join(os.homedir(), '.editfast', 'remotion-bundle');
  const stamp = fs.readdirSync(path.join(here, 'src'), { recursive: true }).map(f => { try { return fs.statSync(path.join(here, 'src', f)).mtimeMs; } catch { return 0; } }).reduce((a, b) => Math.max(a, b), 0);
  const marker = path.join(cacheRoot, 'stamp.txt');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === String(stamp) && fs.existsSync(path.join(cacheRoot, 'bundle', 'index.html'))) return path.join(cacheRoot, 'bundle');
  say({ status: 'bundling' });
  const out = await bundle({ entryPoint: path.join(here, 'src', 'index.jsx'), outDir: path.join(cacheRoot, 'bundle'), publicDir: path.join(here, 'public') });
  fs.mkdirSync(cacheRoot, { recursive: true }); fs.writeFileSync(marker, String(stamp));
  return out;
}

// Local photos/videos used by a scene (collage, 3D carousel…) are served from a tiny localhost server:
// only the files listed in the spec are reachable, nothing else on the disk.
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mxf)$/i;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
async function serveMedia(spec) {
  const files = [];
  const map = (v) => {
    if (typeof v !== 'string' || !path.isAbsolute(v) || !fs.existsSync(v)) return null;
    let i = files.indexOf(v); if (i < 0) { files.push(v); i = files.length - 1; }
    return { i, kind: VIDEO_EXT.test(v) ? 'video' : 'image' };
  };
  const refs = [];
  for (const el of spec.elements || []) {
    const p = el.props || {};
    for (const key of ['media', 'src']) {
      if (Array.isArray(p[key])) p[key] = p[key].map(v => { const m = map(v); if (m) refs.push(m); return m || v; });
      else if (p[key]) { const m = map(p[key]); if (m) { refs.push(m); p[key] = m; } }
    }
  }
  if (!files.length) return null;
  const server = http.createServer((req, res) => {
    const m = /^\/f\/(\d+)/.exec(req.url || ''); const file = m && files[+m[1]];
    if (!file) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
    if (range) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const r of refs) { r.src = `${base}/f/${r.i}${path.extname(files[r.i]).toLowerCase()}`; delete r.i; }
  return server;
}

// one job = one render, or a batch (the layers of a scene) sharing one bundle
const items = job.batch || [{ spec: job.spec, out: job.out, still: job.still, frame: job.frame }];
let mediaServer = null;
try {
  const serveUrl = await getBundle();
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    mediaServer = await serveMedia(it.spec);
    const inputProps = { spec: it.spec };
    const common = { serveUrl, inputProps, browserExecutable: job.browserExecutable || null, chromiumOptions: { gl: job.gl || 'angle' }, logLevel: job.logLevel || 'error', timeoutInMilliseconds: 120000 };
    const composition = await selectComposition({ ...common, id: 'Scene' });
    const transparent = (it.spec.background || {}).type === 'transparent';
    if (it.still) {
      await renderStill({ ...common, composition, output: it.out, frame: it.frame ?? Math.floor(composition.durationInFrames * 0.6), imageFormat: 'png' });
    } else {
      await renderMedia({
        ...common, composition, outputLocation: it.out,
        codec: transparent ? 'prores' : 'h264', ...(transparent ? { proResProfile: '4444', pixelFormat: 'yuva444p10le', imageFormat: 'png' } : { crf: 16, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92 }),
        concurrency: job.concurrency || null,
        onProgress: ({ progress }) => say({ progress: Math.round(((k + progress) / items.length) * 1000) / 1000 })
      });
    }
    if (mediaServer) { mediaServer.close(); mediaServer = null; }
    if (job.batch) say({ layer: k, out: it.out });
  }
  say({ done: job.batch ? items.map(i => i.out) : job.out });
} catch (e) {
  say({ error: String(e && e.message || e) });
  process.exit(1);
}

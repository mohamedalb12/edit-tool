// EditFast Pro scenes — renders a scene spec with Remotion locally.
// usage: node render.mjs job.json   (job: { spec, out, still?, frame?, browserExecutable?, concurrency? })
// prints JSON lines: {"progress":0.42} … {"done":"/path/out.mov"}
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

try {
  const serveUrl = await getBundle();
  const inputProps = { spec: job.spec };
  const common = { serveUrl, inputProps, browserExecutable: job.browserExecutable || null, chromiumOptions: { gl: job.gl || 'angle' }, logLevel: job.logLevel || 'error' };
  const composition = await selectComposition({ ...common, id: 'Scene' });
  const transparent = (job.spec.background || {}).type === 'transparent';
  if (job.still) {
    await renderStill({ ...common, composition, output: job.out, frame: job.frame ?? Math.floor(composition.durationInFrames * 0.6), imageFormat: 'png' });
  } else {
    await renderMedia({
      ...common, composition, outputLocation: job.out,
      codec: transparent ? 'prores' : 'h264', ...(transparent ? { proResProfile: '4444', pixelFormat: 'yuva444p10le', imageFormat: 'png' } : { crf: 16, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92 }),
      concurrency: job.concurrency || null,
      onProgress: ({ progress }) => say({ progress: Math.round(progress * 1000) / 1000 })
    });
  }
  say({ done: job.out });
} catch (e) {
  say({ error: String(e && e.message || e) });
  process.exit(1);
}

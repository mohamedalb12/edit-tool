'use strict';
// Dev tool: renders the animated previews of the template library (assets/templates/<id>.mp4 + .jpg)
// and the gallery thumbnails of the Pro components (assets/pro/<type>.jpg) with the real Remotion engine.
// usage: node scripts/build-template-previews.js [--browser /path/to/chrome] [--only id,id] [--thumbs]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pro = require('../core/proScene');
const T = require('../core/templates');
const { findBinary } = require('../core/ffmpeg');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BROWSER = opt('--browser') || undefined;
const only = opt('--only') ? opt('--only').split(',') : null;
const FF = findBinary('ffmpeg');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'templates');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ef-prev-'));
fs.mkdirSync(OUT, { recursive: true });

// sample "photos" for the previews (abstract, generated — no third-party images)
const SAMPLES = [
  'mandelbrot=s=800x600:start_scale=0.5:end_scale=0.5:outer=normalized_iteration_count',
  'gradients=s=800x600:c0=0xff6b6b:c1=0x4ecdc4:c2=0xffe66d:n=3:type=radial:seed=4',
  'mandelbrot=s=800x600:start_x=-0.743643887:start_y=0.131825904:start_scale=0.01:end_scale=0.01',
  'gradients=s=800x600:c0=0x7c3aed:c1=0xf472b6:c2=0x22d3ee:n=3:type=circular:seed=9',
  'mandelbrot=s=800x600:start_x=-0.16:start_y=1.0405:start_scale=0.03:end_scale=0.03:inner=period',
  'gradients=s=800x600:c0=0xf97316:c1=0x1e3a8a:c2=0xfde047:n=3:type=spiral:seed=2'
].map((src, i) => {
  const f = path.join(TMP, `sample${i}.jpg`);
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '1', '-q:v', '3', f]);
  return f;
});

async function preview(id, spec, { w = 384, h = 216, seconds } = {}) {
  const s = JSON.parse(JSON.stringify(spec));
  if (s.background && s.background.type === 'transparent') s.background = { type: 'mesh' };
  if (seconds) s.duration = Math.min(s.duration || seconds, seconds);
  s.elements.forEach(e => { if (Array.isArray(e.props.media) && !e.props.media.length) e.props.media = SAMPLES.slice(0, e.type === 'collage' ? 4 : 6); });
  const full = pro.normalize(s, { width: w, height: h, fps: 25 });
  const raw = path.join(TMP, id + '.mp4');
  await pro.render({ node: process.execPath, spec: full, out: raw, browserExecutable: BROWSER, gl: BROWSER ? 'swiftshader' : undefined });
  return { raw, full };
}

(async () => {
  const thumbsOnly = args.includes('--thumbs');
  if (!thumbsOnly) for (const t of T.TEMPLATES) {
    if (only && !only.includes(t.id)) continue;
    const t0 = Date.now();
    const { raw, full } = await preview(t.id, t.spec, { seconds: 4.5 });
    execFileSync(FF, ['-v', 'error', '-y', '-i', raw, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, t.id + '.mp4')]);
    execFileSync(FF, ['-v', 'error', '-y', '-ss', String(Math.min(full.duration * 0.55, 2.2)), '-i', raw, '-frames:v', '1', '-q:v', '4', path.join(OUT, t.id + '.jpg')]);
    console.log(t.id, Date.now() - t0, 'ms');
  }
  if (thumbsOnly || args.includes('--all')) {
    // gallery thumbnails for the Pro tab (one per component)
    for (const type of Object.keys(pro.CATALOG)) {
      if (type === 'icon' || (only && !only.includes(type))) continue;
      const tpl = T.TEMPLATES.find(t => t.spec.elements.length === 1 && t.spec.elements[0].type === type);
      const spec = tpl ? tpl.spec : { duration: 3, elements: [{ type, props: {} }] };
      const f = path.join(ROOT, 'assets', 'pro', type + '.jpg');
      if (fs.existsSync(f) && !only) continue;
      const { raw, full } = await preview('thumb-' + type, spec, { w: 640, h: 360, seconds: 4 });
      execFileSync(FF, ['-v', 'error', '-y', '-ss', String(full.duration * 0.6), '-i', raw, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', f]);
      console.log('thumb', type);
    }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });

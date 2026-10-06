'use strict';
// Real Remotion renders (needs `npm install` inside remotion/). Uses Playwright's headless Chromium in this environment.
const { TMP, FFPROBE } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pro = require('../../core/proScene');
const config = require('../../core/config');
const { Services } = require('../../core/services');
const { loadHost } = require('../host/mockPremiere');

const BROWSER = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(f => fs.existsSync(f)) || process.env.REMOTION_BROWSER;
const NODE = process.execPath;
const ready = pro.engineInfo().installed;
const probe = f => JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-print_format', 'json', f]).toString());

test('Remotion: transparent ProRes 4444 overlay, H.264 scene and a still render', { skip: !ready && 'remotion not installed', timeout: 600000 }, async () => {
  const spec = pro.normalize({ duration: 1, background: { type: 'transparent' }, elements: [{ type: 'lowerThird', props: { name: 'محمد أيمن', role: 'مونتير' } }] }, { width: 640, height: 360, fps: 25 });
  const progress = [];
  const mov = await pro.render({ node: NODE, spec, out: path.join(TMP, 'pro.mov'), browserExecutable: BROWSER, gl: 'swiftshader', onProgress: p => progress.push(p) });
  const v = probe(mov).streams.find(s => s.codec_type === 'video');
  assert.equal(v.codec_name, 'prores'); assert.match(v.pix_fmt, /yuva444/); assert.equal(+v.nb_read_frames, 25); assert.equal(v.width, 640);
  assert.ok(progress.some(p => p > 0.9));
  const mp4 = await pro.render({ node: NODE, spec: { ...spec, background: { type: 'mesh' } }, out: path.join(TMP, 'pro.mp4'), browserExecutable: BROWSER, gl: 'swiftshader' });
  assert.equal(probe(mp4).streams.find(s => s.codec_type === 'video').codec_name, 'h264');
  const png = await pro.render({ node: NODE, spec: { ...spec, background: { type: 'grid' }, elements: [{ type: 'statCounter', from: 0, duration: 1, props: { value: 50, suffix: '%', label: 'نص', ring: true } }] }, out: path.join(TMP, 'pro.png'), still: true, frame: 20, browserExecutable: BROWSER, gl: 'swiftshader' });
  assert.ok(fs.statSync(png).size > 5000);
  await assert.rejects(pro.render({ node: NODE, spec, out: path.join(TMP, 'x.mov'), root: path.join(TMP, 'no-engine') }), /مش متثبّت/);
});

test('Remotion through the services + AI tool: designed by the director, rendered, placed above the footage', { skip: !ready && 'remotion not installed', timeout: 600000 }, async () => {
  const h = loadHost();
  const seq = h.pr.newSequence('Main', { fps: 25, width: 640, height: 360 });
  seq.v[0].add({ projectItem: h.pr.project.importOne('/m/talk.mp4', h.pr.project.root), start: 0, end: 10 });
  config.save({ ...config.DEFAULTS, keys: { openrouter: 'k' }, paths: { ...config.DEFAULTS.paths, chrome: BROWSER } });
  const fetchImpl = async (url, opts) => ({ ok: true, status: 200, headers: { get: () => null },
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ duration: 1, background: { type: 'transparent' }, elements: [{ type: 'emojiBurst', from: 0, duration: 1, props: { emoji: '🔥', text: 'جامد' } }] }) } }] }) });
  const S = new Services({ host: async (n, a) => h.call(n, JSON.parse(JSON.stringify(a))), fetchImpl });
  S.settings.paths.node = NODE;
  const spec = await S.designProScene({ brief: 'لحظة حماس', duration: 1, transparent: true });
  assert.equal(spec.elements[0].type, 'emojiBurst'); assert.equal(spec.width, 640);
  seq.player = 2;
  const r = await S.renderProScene({ spec });
  assert.equal(r.track, 1); assert.match(r.file, /pro-[0-9a-f]+\.mov$/);
  assert.ok(seq.v[1].items.find(c => c._start === 2));
  const prev = await S.renderProScene({ spec, preview: true });
  assert.match(prev.file, /\.png$/);
  const { EditFastAgent } = require('../../core/agent');
  const agent = new EditFastAgent({ llm: S.llm, model: 'm', services: S, style: {} });
  const res = await agent.callTool('pro_scene', { brief: 'لحظة حماس', duration: 1, overlay: true, time: 5 });
  assert.deepEqual(res.elements, ['emojiBurst']); assert.equal(res.start, 5);
});

test('Remotion: style scenes with the editor\'s own photos + video (local media server) — collage, 3D carousel, icon', { skip: !ready && 'remotion not installed', timeout: 600000 }, async () => {
  const FF = require('../../core/ffmpeg').findBinary('ffmpeg');
  const img = path.join(TMP, 'still.jpg'), vid = path.join(TMP, 'clip.mp4');
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-frames:v', '1', img]);
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=2', '-pix_fmt', 'yuv420p', vid]);
  const collage = pro.normalize({ style: 'collage', duration: 1, elements: [{ type: 'collage', props: { media: [img, vid, img], title: 'رحلة' } }] }, { width: 480, height: 270, fps: 25 });
  const out = await pro.render({ node: NODE, spec: collage, out: path.join(TMP, 'collage.mp4'), browserExecutable: BROWSER, gl: 'swiftshader' });
  const v = probe(out).streams.find(s => s.codec_type === 'video');
  assert.equal(v.codec_name, 'h264'); assert.equal(+v.nb_read_frames, 25);
  // the photo really is in the frame (testsrc2 has saturated colour bars; the paper background is beige)
  const png = await pro.render({ node: NODE, spec: collage, out: path.join(TMP, 'collage.png'), still: true, frame: 22, browserExecutable: BROWSER, gl: 'swiftshader' });
  const sat = +execFileSync(FF, ['-v', 'error', '-i', png, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=-', '-f', 'null', '-']).toString().match(/SATAVG=([\d.]+)/)[1];
  assert.ok(sat > 20, 'photos with colour bars visible: SATAVG ' + sat);
  const car = pro.normalize({ style: '3d', duration: 1, background: { type: 'transparent' }, elements: [{ type: 'carousel3D', props: { media: [img, vid, img, img], layout: 'ring' } }] }, { width: 480, height: 270, fps: 25 });
  const mov = await pro.render({ node: NODE, spec: car, out: path.join(TMP, 'car.mov'), browserExecutable: BROWSER, gl: 'swiftshader' });
  const cv = probe(mov).streams.find(s => s.codec_type === 'video');
  assert.equal(cv.codec_name, 'prores'); assert.match(cv.pix_fmt, /yuva444/);
  const icons = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'vendor', 'icons', 'icons.json'), 'utf8')).icons;
  const car2 = icons.find(i => i.id === 'l-car');
  const ic = pro.normalize({ duration: 1, background: { type: 'transparent' }, elements: [{ type: 'icon', props: { svg: car2.svg, mode: 'stroke', anim: 'draw', badge: 'glass', label: 'عربيات' } }] }, { width: 320, height: 180, fps: 25 });
  const icPng = await pro.render({ node: NODE, spec: ic, out: path.join(TMP, 'icon.png'), still: true, frame: 24, browserExecutable: BROWSER, gl: 'swiftshader' });
  assert.ok(fs.statSync(icPng).size > 2000);
});

test('Remotion: a scene rendered as separate layers in one run (opaque background, transparent element layers, look on top)', { skip: !ready && 'remotion not installed', timeout: 600000 }, async () => {
  const spec = pro.normalize({ style: 'vhs', duration: 1, elements: [{ type: 'kineticTitle', from: 0, duration: 1, props: { text: 'لاير' } }, { type: 'emojiBurst', from: 0.4, duration: 0.6, props: { emoji: '🔥' } }] }, { width: 320, height: 180, fps: 25 });
  const L = pro.layers(spec);
  const batch = L.map((l, i) => ({ spec: l.spec, out: path.join(TMP, `layer${i}.${(l.spec.background || {}).type === 'transparent' ? 'mov' : 'mp4'}`) }));
  const prog = [];
  const outs = await pro.render({ node: NODE, batch, browserExecutable: BROWSER, gl: 'swiftshader', onProgress: p => prog.push(p) });
  assert.equal(outs.length, 4);
  const v = f => probe(f).streams.find(s => s.codec_type === 'video');
  assert.equal(v(outs[0]).codec_name, 'h264'); assert.equal(+v(outs[0]).nb_read_frames, 25);
  for (const f of outs.slice(1)) { assert.equal(v(f).codec_name, 'prores'); assert.match(v(f).pix_fmt, /yuva/); }
  assert.equal(+v(outs[2]).nb_read_frames, 15, 'the emoji layer is only as long as the emoji');
  assert.ok(prog.some(p => p > 0.9) && prog.some(p => p < 0.5), 'progress covers the whole batch');
  // the title layer is mostly transparent (alpha), the background layer is full
  const FF = require('../../core/ffmpeg').findBinary('ffmpeg');
  const alphaMean = f => +execFileSync(FF, ['-v', 'error', '-ss', '0.8', '-i', f, '-frames:v', '1', '-vf', 'alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']).toString().match(/YAVG=([\d.]+)/)[1];
  assert.ok(alphaMean(outs[1]) < 80, 'title layer is see-through around the text');
});

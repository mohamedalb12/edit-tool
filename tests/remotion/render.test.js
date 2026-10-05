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

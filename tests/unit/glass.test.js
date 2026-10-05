'use strict';
const { TMP, FFMPEG, FFPROBE } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const LG = require('../../core/liquidGlass');
const io = require('../../core/glassIO');

test('liquid glass: 10 presets, normalize merges preset + overrides and clamps', () => {
  assert.equal(LG.PRESETS.length, 10);
  const ids = LG.PRESETS.map(p => p.id);
  for (const id of ['pill', 'card', 'lens', 'lower-third', 'notification', 'subscribe', 'glass-text', 'dock', 'side-panel', 'frame']) assert.ok(ids.includes(id), id);
  const p = LG.normalize({ preset: 'subscribe', label: 'تابعنا', blur: 999, x: 7, animIn: 'weird' });
  assert.equal(p.preset, 'subscribe'); assert.equal(p.shape, 'pill'); assert.equal(p.tint, '#ff2d55'); assert.equal(p.label, 'تابعنا');
  assert.equal(p.blur, 60); assert.equal(p.x, 1.5); assert.equal(p.animIn, 'liquid');
  assert.equal(LG.normalize({ preset: 'lens' }).zoom, 1.4);
  assert.equal(LG.normalize({ shape: 'star' }).shape, 'pill');
  assert.deepEqual(LG.hexToRgb('#ff0000'), [1, 0, 0]);
});

test('liquid glass: animation starts small, overshoots like liquid, settles, fades out at the end', () => {
  const p = LG.normalize({ preset: 'pill', duration: 4 });
  const a0 = LG.animState(p, 0), a1 = LG.animState(p, 1.2), aEnd = LG.animState(p, 3.99);
  assert.ok(a0.sx < 0.05 && a0.opacity === 0);
  const peak = Math.max(...Array.from({ length: 40 }, (_, i) => LG.animState(p, i * 0.01).sx));
  assert.ok(peak > 1.02, 'overshoot ' + peak);
  assert.ok(Math.abs(a1.sx - 1) < 0.01 && Math.abs(a1.sy - 1) < 0.01 && a1.opacity === 1);
  assert.ok(aEnd.opacity < 0.05);
  const drop = LG.animState(LG.normalize({ animIn: 'drop' }), 0.02);
  assert.ok(drop.dy < -0.1);
  assert.ok(LG.FRAG.includes('blurSrc') && LG.FRAG.includes('uRefract') && LG.FRAG.includes('uFlip'));
});

test('glass IO: decode RGBA frames from video/still with ffmpeg, encode ProRes 4444 with alpha', async () => {
  const vid = path.join(TMP, 'g.mp4'); const img = path.join(TMP, 'g.png');
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=3:r=25', '-pix_fmt', 'yuv420p', vid]);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=100x100', '-frames:v', '1', img]);
  const W = 160, H = 90, frames = [];
  const r = await io.decodeFrames(FFMPEG, { mediaPath: vid, start: 1, duration: 0.4, width: W, height: H, fps: 25 }, async f => { await new Promise(res => setTimeout(res, 2)); frames.push(f); });
  assert.equal(r.frames, 10); assert.equal(frames[0].length, W * H * 4);
  assert.equal(frames[0][3], 255);
  // letterboxed 4:3 → 16:9: left bar is black
  assert.deepEqual([...frames[0].subarray(0, 3)], [0, 0, 0]);
  const still = [];
  await io.decodeFrames(FFMPEG, { mediaPath: img, duration: 0.2, width: W, height: H, fps: 25 }, f => { still.push(f); });
  assert.equal(still.length, 5);
  const mid = ((H / 2) * W + W / 2) * 4; assert.ok(still[0][mid] > 200 && still[0][mid + 1] < 40);
  const out = path.join(TMP, 'glass-test.mov');
  const enc = io.startRawEncoder(FFMPEG, { width: W, height: H, fps: 25, out });
  for (let i = 0; i < 6; i++) { const b = Buffer.alloc(W * H * 4); for (let j = 0; j < b.length; j += 4) { b[j] = 255; b[j + 3] = j < b.length / 2 ? 0 : 255; } await enc.write(b); }
  await enc.end();
  const v = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-print_format', 'json', out]).toString()).streams[0];
  assert.equal(v.codec_name, 'prores'); assert.match(v.pix_fmt, /yuva444/); assert.equal(+v.nb_read_frames, 6);
});

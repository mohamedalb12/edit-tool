'use strict';
const { TMP, FFMPEG, FFPROBE } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const reframe = require('../../core/reframe');

const moving = (from, to, dur = 6) => Array.from({ length: dur * 2 + 1 }, (_, i) => ({ t: i / 2, faces: [{ cx: from + (to - from) * (i / (dur * 2)), cy: 0.4, w: 0.1, h: 0.18, score: 0.9 }] }));

test('reframe plan: follows a moving face smoothly, holds still inside the dead zone, clamps to the frame', () => {
  const p = reframe.plan(moving(0.2, 0.8), { srcW: 1920, srcH: 1080 });
  assert.equal(p.cropW, 608); assert.equal(p.cropH, 1080);
  const xs = p.path.map(x => x.cx);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 1e-9, 'monotonic follow');
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(Math.max(...steps) <= 0.045 + 1e-9, 'speed limited (no whip pans)');
  assert.ok(xs[xs.length - 1] > 0.65, 'caught up with the subject');
  const still = reframe.plan(Array.from({ length: 13 }, (_, i) => ({ t: i / 2, faces: [{ cx: 0.5 + (i % 2 ? 0.01 : -0.01), cy: 0.4, w: 0.1, h: 0.2, score: 0.9 }] })), { srcW: 1920, srcH: 1080 });
  assert.ok(new Set(still.path.map(x => x.cx.toFixed(3))).size <= 3, 'jitter inside the dead zone is ignored');
  const edge = reframe.plan([{ t: 0, faces: [{ cx: 0.01, cy: .5, w: .1, h: .1, score: 1 }] }], { srcW: 1920, srcH: 1080 });
  assert.ok(Math.abs(edge.path[0].cx - 304 / 1920) < 1e-3, 'clamped inside the frame');
  const none = reframe.plan([{ t: 0, faces: [] }, { t: 1, faces: [] }], { srcW: 1920, srcH: 1080 });
  assert.equal(none.path[0].cx, 0.5);
});

test('reframe plan: picks the biggest face, sticks with it, and cuts (no pan) on a shot change', () => {
  const s = [0, 0.5, 1, 1.5, 2].map(t => ({ t, faces: [{ cx: 0.25, cy: .4, w: .14, h: .25, score: .9 }, { cx: 0.8, cy: .4, w: .06, h: .1, score: .9 }] }));
  const p = reframe.plan(s, { srcW: 1920, srcH: 1080 });
  assert.ok(Math.abs(p.path[0].cx - 0.25) < 0.01);
  const cut = reframe.plan([{ t: 0, faces: [{ cx: .25, cy: .5, w: .1, h: .2, score: 1 }] }, { t: 2, faces: [{ cx: .8, cy: .5, w: .1, h: .2, score: 1 }] }, { t: 3, faces: [{ cx: .8, cy: .5, w: .1, h: .2, score: 1 }] }], { srcW: 1920, srcH: 1080, shots: [2] });
  const at = t => cut.path.find(x => Math.abs(x.t - t) < 1e-6).cx;
  assert.ok(at(1.9) < 0.3 && at(2) > 0.75, 'jumped at the cut');
  assert.match(reframe.sendcmd(cut, 1920, 1080).split('\n')[0], /^0\.000 crop x \d+;$/);
  assert.deepEqual(reframe.plan(moving(.5, .5, 1), { srcW: 1920, srcH: 1080, ratio: '1:1' }).cropW, 1080);
});

test('reframe render: ffmpeg moves the crop over time → 1080×1920 with audio', async () => {
  const src = path.join(TMP, 'wide.mp4');
  // left half red, right half blue
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=640x720:d=2:r=25', '-f', 'lavfi', '-i', 'color=c=blue:s=640x720:d=2:r=25', '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-filter_complex', '[0:v][1:v]hstack=inputs=2[v]', '-map', '[v]', '-map', '2:a', '-pix_fmt', 'yuv420p', '-shortest', src]);
  const planRes = { cropW: 404, cropH: 720, path: [{ t: 0, cx: 0.16 }, { t: 1, cx: 0.16 }, { t: 1.2, cx: 0.84 }, { t: 2, cx: 0.84 }] };
  const out = await reframe.render(FFMPEG, { file: src, duration: 2, srcW: 1280, srcH: 720, planRes, out: path.join(TMP, 'reel.mp4') });
  const p = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_streams', '-of', 'json', out]).toString()).streams;
  const v = p.find(s => s.codec_type === 'video');
  assert.deepEqual([v.width, v.height], [1080, 1920]); assert.ok(p.find(s => s.codec_type === 'audio'));
  const px = t => execFileSync(FFMPEG, ['-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const a = px(0.3), b = px(1.6);
  assert.ok(a[0] > 180 && a[2] < 80, 'starts on the red (left) side');
  assert.ok(b[2] > 180 && b[0] < 80, 'ends on the blue (right) side');
});

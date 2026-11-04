'use strict';
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const vision = require('../../core/vision');

function colorVideo(name, colors, segDur = 1.2) {
  const out = path.join(TMP, name);
  const ins = colors.flatMap(c => ['-f', 'lavfi', '-t', String(segDur), '-i', `color=c=${c}:s=320x180:r=25`]);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...ins, '-filter_complex', colors.map((_, i) => `[${i}:v]`).join('') + `concat=n=${colors.length}:v=1:a=0[v]`, '-map', '[v]', '-pix_fmt', 'yuv420p', out]);
  return out;
}

test('vision: offline shot detection finds the cuts', async () => {
  // ffmpeg's scene score is luminance based → use colours with clearly different brightness
  const f = colorVideo('shots.mp4', ['black', 'white', '0x404040', 'yellow']);
  const cuts = await vision.detectShots(FFMPEG, f);
  assert.equal(cuts.length, 3, JSON.stringify(cuts));
  [1.2, 2.4, 3.6].forEach((t, i) => assert.ok(Math.abs(cuts[i] - t) < 0.1, `${cuts[i]} ~ ${t}`));
  const part = await vision.detectShots(FFMPEG, f, { start: 2, duration: 1.5 });
  assert.equal(part.length, 1); assert.ok(Math.abs(part[0] - 2.4) < 0.1, 'times are in source time');
});

test('vision: frame grab is a real JPEG of the right moment, packed as an OpenAI/OpenRouter image message', async () => {
  const f = colorVideo('frames.mp4', ['red', 'blue']);
  const b64 = await vision.frameJpeg(FFMPEG, f, 1.8, { width: 64 });
  const buf = Buffer.from(b64, 'base64');
  assert.deepEqual([...buf.subarray(0, 2)], [0xff, 0xd8]);
  const raw = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { input: buf });
  const mid = raw.length / 2 - (raw.length / 2) % 3;
  assert.ok(raw[mid + 2] > 150 && raw[mid] < 80, 'blue frame at 1.8s');
  const msg = vision.imageMessage([{ time: 1.8, b64, label: '1.8s' }]);
  assert.equal(msg.role, 'user'); assert.equal(msg.content[1].type, 'image_url'); assert.match(msg.content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

// the adaptive detector (PySceneDetect's method, core/shots): the two cases the fixed ffmpeg threshold gets wrong
function lavfiVideo(name, inputs) {
  const out = path.join(TMP, name);
  if (!fs.existsSync(out)) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    for (const i of inputs) args.push('-f', 'lavfi', '-i', i);
    args.push('-filter_complex', inputs.map((_, k) => '[' + k + ']').join('') + 'concat=n=' + inputs.length + ':v=1:a=0,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', out);
    execFileSync(FFMPEG, args);
  }
  return out;
}
test('shots: a fast camera move inside one shot is not a cut (the fixed threshold calls it one)', async () => {
  const f = lavfiVideo('shots-pan.mp4', ['testsrc2=s=640x360:r=25:d=3',
    "mandelbrot=s=1600x900:r=25,crop=640:360:'mod(t*900,900)':'120+60*sin(t*5)',trim=duration=3,setpts=PTS-STARTPTS",
    'smptebars=s=640x360:r=25:d=3']);
  const cuts = await vision.detectShots(FFMPEG, f);
  assert.deepEqual(cuts.map(t => Math.round(t)), [3, 6], JSON.stringify(cuts));
  const fixed = await vision.detectShotsFixed(FFMPEG, f);
  assert.ok(fixed.length > 2, 'the old fixed threshold saw a cut in the pan: ' + JSON.stringify(fixed));
});
test('shots: cuts between dark, low-contrast shots are found (the fixed threshold misses them)', async () => {
  const dim = ',eq=brightness=-0.42:contrast=0.35';
  const f = lavfiVideo('shots-dark.mp4', ['testsrc2=s=640x360:r=25:d=3' + dim, 'cellauto=s=640x360:r=25,trim=duration=3,setpts=PTS-STARTPTS' + dim, 'testsrc=s=640x360:r=25:d=3' + dim]);
  const cuts = await vision.detectShots(FFMPEG, f);
  assert.deepEqual(cuts.map(t => Math.round(t)), [3, 6], JSON.stringify(cuts));
  assert.equal((await vision.detectShotsFixed(FFMPEG, f)).length, 0, 'the old one found none');
});
test('shots: the adaptive rule itself — a spike over its neighbours, a minimum shot length', () => {
  const shots = require('../../core/shots');
  const flat = [0, 2, 2, 2, 2, 60, 2, 2, 2, 2, 2, 2, 2];
  assert.deepEqual(shots.adaptiveCuts(flat, 10), [5]);
  const moving = [0, 30, 32, 35, 31, 40, 33, 30, 34, 31, 30, 32, 30];
  assert.deepEqual(shots.adaptiveCuts(moving, 10), [], 'steady high motion is not a cut');
  const twoClose = [0, 1, 1, 1, 50, 1, 50, 1, 1, 1, 1];
  assert.deepEqual(shots.adaptiveCuts(twoClose, 10), [4], 'two cuts closer than 0.6 s → one');
  const [H, S, V] = shots.toHSV(Buffer.from([255, 0, 0, 0, 0, 255, 255, 255, 255]), 3);
  assert.deepEqual([...H], [0, 120, 0]); assert.deepEqual([...S], [255, 255, 0]); assert.deepEqual([...V], [255, 255, 255]);
});

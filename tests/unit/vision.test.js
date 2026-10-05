'use strict';
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

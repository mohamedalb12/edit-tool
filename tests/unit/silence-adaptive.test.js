'use strict';
// Quick cut, adaptive: the threshold is measured from the recording (noise floor ↔ speech level) and clicks / breaths
// inside a pause don't split it (auto-editor's minclip / mincut smoothing). The three cases the old fixed −35 dB
// threshold got wrong, with the pause known to be at 2.0–3.5 s.
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const S = require('../../core/silence');

const speech = 'sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*3*t))', pause = 'lt(t,2)+gte(t,3.5)';
function wav(name, expr) {
  const out = path.join(TMP, name);
  if (!fs.existsSync(out)) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=16000:d=5.5`, out]);
  return { start: 0, end: 5.5, inPoint: 0, mediaPath: out };
}
const cuts = r => r.cuts.map(c => [+c.start.toFixed(2), +c.end.toFixed(2)]);
const near = (got, want) => got.length === 1 && Math.abs(got[0][0] - want[0]) < 0.06 && Math.abs(got[0][1] - want[1]) < 0.06;

test('a quiet, far-mic recording: the pause is cut and the words around it are kept', async () => {
  const clip = wav('sil-quiet.wav', `if(${pause}, 0.012*${speech}, 0.0004*(random(0)-0.5))`);
  const r = await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5 });
  assert.ok(near(cuts(r), [2.08, 3.42]), JSON.stringify(cuts(r)));
  const old = await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5, engine: 'fixed' });
  assert.ok(old.cuts[0].start < 1.95, 'the fixed −35 dB threshold ate the end of the words: ' + JSON.stringify(cuts(old)));
});
test('a noisy room: the pause is still found (the fixed threshold found nothing)', async () => {
  const clip = wav('sil-noisy.wav', `0.07*(random(0)-0.5) + if(${pause}, 0.5*${speech}, 0)`);
  const r = await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5 });
  assert.ok(near(cuts(r), [2.08, 3.42]), JSON.stringify(cuts(r)));
  assert.equal((await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5, engine: 'fixed' })).cuts.length, 0);
});
test('a click in the middle of a pause doesn\'t split it in two', async () => {
  const clip = wav('sil-click.wav', `if(${pause}, 0.5*${speech}, if(between(t,2.72,2.75), 0.6*sin(2*PI*1500*t), 0.001*(random(0)-0.5)))`);
  const r = await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5 });
  assert.ok(near(cuts(r), [2.08, 3.42]), JSON.stringify(cuts(r)));
  assert.equal((await S.analyzeClips(FFMPEG, [clip], { sensitivity: 5, engine: 'fixed' })).cuts.length, 2, 'the old one left the click in');
});
test('smoothing and the measured threshold on their own', () => {
  assert.deepEqual(S.smoothing([1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1].map(Boolean), 3, 2).map(Number),
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], 'a 1-frame gap is kept, a 1-frame blip is dropped');
  assert.equal(S.autoThreshold(new Array(100).fill(-30)), null, 'no difference between loud and quiet → no pauses to cut');
  const lv = [].concat(new Array(60).fill(-12), new Array(40).fill(-60));
  const t = S.autoThreshold(lv, 5);
  assert.ok(t > -60 && t < -12, String(t));
  assert.ok(S.autoThreshold(lv, 10) > S.autoThreshold(lv, 1), 'more sensitive → higher threshold → cuts more');
});

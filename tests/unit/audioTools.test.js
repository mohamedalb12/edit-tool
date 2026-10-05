'use strict';
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const audio = require('../../core/audioTools');
const { decodePCM } = require('../../core/ffmpeg');

const rmsDb = (pcm, a, b, rate) => { let s = 0, n = 0; for (let i = Math.floor(a * rate); i < Math.min(pcm.length, b * rate); i++) { s += pcm[i] * pcm[i]; n++; } return 10 * Math.log10(s / n + 1e-12); };

test('speech segments + duck keys: dip under every sentence, back up in the gaps, clipped to the music clip', () => {
  const env = new Float32Array(200).fill(0.002);
  for (let i = 20; i < 60; i++) env[i] = 0.3; for (let i = 64; i < 90; i++) env[i] = 0.3; for (let i = 140; i < 170; i++) env[i] = 0.3;
  const seg = audio.speechSegments(env, 0.05);
  assert.deepEqual(seg.map(s => [s.start, s.end]), [[1, 4.5], [7, 8.5]], 'short gap merged');
  const keys = audio.duckKeys([{ start: 11, end: 14.5 }, { start: 17, end: 18.5 }], { start: 10, end: 18 }, { duckDb: -12, attack: 0.25, release: 0.6 });
  assert.deepEqual(keys.map(k => [k.t, k.db]), [[10.75, 0], [11, -12], [14.5, -12], [15.1, 0], [16.75, 0], [17, -12], [18, -12]]);
  assert.match(audio.cleanFilter({ strength: 'strong', noiseFloorDb: -45 }), /afftdn=nr=30:nf=-35\.0/);
});

test('clean audio (offline): background noise goes down a lot, speech stays, loudness normalised', async () => {
  const src = path.join(TMP, 'noisy.wav');
  // 2s "voice" tone + 2s of only noise, both with constant hiss
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.25*sin(2*PI*220*t)*lt(t\\,2):s=48000:d=4', '-f', 'lavfi', '-i', 'anoisesrc=d=4:c=white:r=48000:a=0.03',
    '-filter_complex', '[0][1]amix=inputs=2:normalize=0', src]);
  const out = await audio.cleanFile(FFMPEG, { file: src, out: path.join(TMP, 'clean.wav'), strength: 'strong', loudness: -16 });
  const a = await decodePCM(FFMPEG, src, { rate: 16000 }), b = await decodePCM(FFMPEG, out, { rate: 16000 });
  const snrIn = rmsDb(a, 0.5, 1.8, 16000) - rmsDb(a, 2.5, 3.8, 16000);
  const snrOut = rmsDb(b, 0.5, 1.8, 16000) - rmsDb(b, 2.5, 3.8, 16000);
  assert.ok(snrOut - snrIn > 10, `noise floor reduced: SNR ${snrIn.toFixed(1)} → ${snrOut.toFixed(1)} dB`);
  assert.ok(Math.abs(rmsDb(b, 0.5, 1.8, 16000) - rmsDb(a, 0.5, 1.8, 16000)) < 8, 'speech level kept in range');
  const r = require('child_process').spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128', '-f', 'null', '-']);
  const I = +/I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.toString().split('Summary:').pop())[1];
  assert.ok(Math.abs(I - -16) < 2, 'integrated loudness ≈ -16 LUFS: ' + I);
});

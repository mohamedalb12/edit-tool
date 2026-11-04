'use strict';
// "صوت استوديو" (Auphonic-style): the noise profile picks the cure (hum notch / RNNoise / FFT), the result lands on
// the loudness target with the peak under control, and a before / after report comes back.
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const A = require('../../core/audioTools');

const voice = '0.3*sin(2*PI*180*t)*(0.55+0.45*sin(2*PI*3.1*t))*gt(sin(2*PI*0.37*t),-0.3)'; // syllables with pauses
function wav(name, expr, d = 8) {
  const out = path.join(TMP, name);
  if (!fs.existsSync(out)) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=16000:d=${d}`, out]);
  return out;
}

test('noise profile: mains hum (50 or 60 Hz), street rumble, plain hiss', async () => {
  const hum50 = await A.analyzeNoise(FFMPEG, wav('st-hum50.wav', `${voice}+0.04*sin(2*PI*50*t)+0.02*sin(2*PI*100*t)+0.01*(random(0)-0.5)`));
  assert.equal(hum50.hum, 50);
  const hum60 = await A.analyzeNoise(FFMPEG, wav('st-hum60.wav', `${voice}+0.04*sin(2*PI*60*t)+0.02*sin(2*PI*120*t)+0.01*(random(0)-0.5)`));
  assert.equal(hum60.hum, 60);
  const hiss = await A.analyzeNoise(FFMPEG, wav('st-hiss.wav', `${voice}+0.03*(random(0)-0.5)`));
  assert.deepEqual([hiss.hum, hiss.kind], [0, 'broad'], 'no hum invented, white hiss → FFT');
  const street = path.join(TMP, 'st-street.wav');
  if (!fs.existsSync(street)) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${voice}':s=16000:d=8`, '-f', 'lavfi', '-i', 'anoisesrc=c=brown:a=0.12:r=16000', '-filter_complex', '[1]lowpass=f=600,volume=1.5[n];[0][n]amix=inputs=2:duration=first:normalize=0', '-ac', '1', street]);
  const st = await A.analyzeNoise(FFMPEG, street);
  assert.deepEqual([st.hum, st.kind], [0, 'low'], 'traffic rumble → the neural denoiser: ' + JSON.stringify(st));
});

test('the chain follows the profile: notch only with hum, RNNoise only for rumble', () => {
  const plain = A.studioFilter({ noiseFloorDb: -45, hum: 0, kind: 'broad' });
  assert.doesNotMatch(plain, /bandreject|arnndn/);
  assert.match(A.studioFilter({ noiseFloorDb: -30, hum: 60, kind: 'broad' }), /bandreject=f=60:.*bandreject=f=120:.*bandreject=f=180:/);
  const low = A.studioFilter({ noiseFloorDb: -30, hum: 0, kind: 'low' });
  assert.match(low, /arnndn=m='[^']*std\.rnnn'/); assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'assets', 'models', 'rnnoise', 'std.rnnn')), 'the model ships with the panel');
  assert.match(low, /speechnorm=/, 'the leveler');
  assert.equal(A.filterPath("C:\\Users\\me\\a'b.rnnn"), "'C\\:/Users/me/a'\\\\''b.rnnn'", 'Windows paths survive the filter syntax');
});

test('studio pass: lands on the loudness target, peak under −1 dBTP, noise down, a before / after report', async () => {
  const src = wav('st-hum-voice.wav', `${voice}+0.05*sin(2*PI*50*t)+0.03*sin(2*PI*100*t)+0.004*(random(0)-0.5)`);
  const out = path.join(TMP, 'st-out.wav');
  const r = await A.studioFile(FFMPEG, { file: src, out, loudness: -16 });
  assert.ok(fs.existsSync(out));
  assert.equal(r.profile.hum, 50);
  assert.ok(Math.abs(r.after.lufs - -16) <= 1.5, 'loudness ' + r.after.lufs);
  assert.ok(r.after.truePeak <= -0.5, 'true peak ' + r.after.truePeak);
  assert.ok(r.after.noiseFloor < r.before.noiseFloor - 6, 'noise floor ' + r.before.noiseFloor + ' → ' + r.after.noiseFloor);
  const card = A.summarize([{ before: r.before, after: r.after, profile: r.profile }]);
  assert.equal(card.after.lufs, r.after.lufs); assert.match(card.found.join(' '), /50Hz/);
});

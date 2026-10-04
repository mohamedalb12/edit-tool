'use strict';
const { TMP, FFMPEG, FFPROBE, makeAudio, makeClicks } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const ff = require('../../core/ffmpeg');
const silence = require('../../core/silence');
const beats = require('../../core/beats');
const multicam = require('../../core/multicam');

test('ffmpeg + ffprobe are found locally', () => {
  assert.ok(FFMPEG, 'ffmpeg missing'); assert.ok(FFPROBE, 'ffprobe missing');
});

test('quick cut: finds real silences in audio and maps them to the timeline', async () => {
  // speech(1s) silence(1s) speech(1s) silence(0.5s) speech(1s)  => total 4.5s
  const f = makeAudio('qc.wav', [{ tone: 300, dur: 1 }, { silence: 1 }, { tone: 400, dur: 1 }, { silence: 0.5 }, { tone: 500, dur: 1 }]);
  const sil = await silence.detectSilence(FFMPEG, f, { thresholdDb: -35, minSilence: 0.3 });
  assert.equal(sil.length, 2);
  assert.ok(Math.abs(sil[0].start - 1) < 0.05 && Math.abs(sil[0].end - 2) < 0.05, JSON.stringify(sil));
  assert.ok(Math.abs(sil[1].start - 3) < 0.05 && Math.abs(sil[1].end - 3.5) < 0.05);

  // the clip sits on the timeline at 10s and starts 0.5s into the media
  const clip = { start: 10, end: 14, inPoint: 0.5, mediaPath: f };
  const r = await silence.analyzeClips(FFMPEG, [clip], { sensitivity: 5, padding: 0.08, minSilence: 0.3 });
  assert.equal(r.cuts.length, 2);
  assert.ok(Math.abs(r.cuts[0].start - (10 + 1 - 0.5 + 0.08)) < 0.06, JSON.stringify(r.cuts));
  assert.ok(Math.abs(r.cuts[0].end - (10 + 2 - 0.5 - 0.08)) < 0.06);
  assert.ok(r.removedSeconds > 1 && r.removedSeconds < 1.5);
});

test('quick cut: sensitivity maps to sane params & padding never eats speech', () => {
  const lo = silence.sensitivityToParams(1), hi = silence.sensitivityToParams(10);
  assert.ok(lo.thresholdDb < hi.thresholdDb && lo.minSilence > hi.minSilence);
  const cuts = silence.silencesToCuts([{ start: 0, end: 0.5 }, { start: 2, end: 2.2 }, { start: 5, end: 6 }], { padding: 0.1, minCut: 0.15, total: 6 });
  assert.deepEqual(cuts.map(c => [+c.start.toFixed(2), +c.end.toFixed(2)]), [[0, 0.4], [5.1, 6]]);
});

test('beats: detects tempo of a 120 BPM click track (offline)', async () => {
  const f = makeClicks('clicks.wav', 120, 12);
  const r = await beats.detect(FFMPEG, f);
  assert.ok(Math.abs(r.bpm - 120) < 3, 'bpm ' + r.bpm);
  assert.ok(r.beats.length >= 20 && r.beats.length <= 26, 'beats ' + r.beats.length);
  const offs = r.beats.map(b => Math.min(b % 0.5, 0.5 - (b % 0.5)));
  assert.ok(offs.filter(o => o < 0.05).length / offs.length > 0.85, 'beats aligned to clicks');
});

test('multicam: switches to whoever is talking, with minimum shot length', async () => {
  // cam A talks 0-4s, cam B talks 4-8s, A again 8-12s (each mic has a little bleed of the other)
  const a = makeAudio('camA.wav', [{ tone: 220, dur: 4, amp: 0.6 }, { tone: 220, dur: 4, amp: 0.02 }, { tone: 220, dur: 4, amp: 0.6 }]);
  const b = makeAudio('camB.wav', [{ tone: 330, dur: 4, amp: 0.02 }, { tone: 330, dur: 4, amp: 0.6 }, { tone: 330, dur: 4, amp: 0.02 }]);
  const plan = await multicam.analyze(FFMPEG, [
    { mediaPath: a, inPoint: 0, start: 0, end: 12, trackIndex: 0 },
    { mediaPath: b, inPoint: 0, start: 0, end: 12, trackIndex: 1 }
  ], { minShot: 1.5 });
  assert.deepEqual(plan.map(p => p.trackIndex), [0, 1, 0], JSON.stringify(plan));
  assert.ok(Math.abs(plan[1].start - 4) < 0.6 && Math.abs(plan[2].start - 8) < 0.6, JSON.stringify(plan));
  assert.equal(multicam.summarize(plan).cuts, 2);
});

test('multicam: ignores short interjections shorter than minShot', () => {
  const n = 120, A = new Float32Array(n).fill(0.5), B = new Float32Array(n).fill(0.01);
  for (let i = 50; i < 55; i++) { A[i] = 0.01; B[i] = 0.5; } // 0.5s interjection
  const plan = multicam.planFromEnvelopes([A, B], { windowSec: 0.1, minShot: 2 });
  assert.equal(plan.length, 1);
});

test('ffprobe: detects alpha on ProRes 4444', async () => {
  const out = TMP + '/alpha.mov';
  require('child_process').execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red@0.5:s=64x64:d=0.2,format=rgba', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', out]);
  const p = await ff.probe(FFPROBE, out);
  assert.equal(p.alpha, true); assert.equal(p.hasVideo, true);
});

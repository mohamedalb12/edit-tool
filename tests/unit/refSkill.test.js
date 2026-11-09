'use strict';
const { TMP, FFMPEG } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../../core/refSkill');

// a "reference edit": a 15% punch-in at 1 s, hard cuts, a white flash frame, a zooming shot, clicks at 120 BPM under it
function makeRef(name) {
  const out = path.join(TMP, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=s=400x224:r=30:d=2', '-f', 'lavfi', '-i', 'smptebars=s=400x224:r=30:d=1.5', '-f', 'lavfi', '-i', 'color=white:s=400x224:r=30:d=0.1',
    '-f', 'lavfi', '-i', 'mandelbrot=s=400x224:r=30,trim=duration=1.5', '-f', 'lavfi', '-i', 'testsrc=s=400x224:r=30:d=2',
    '-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*880*t)*exp(-60*mod(t,0.5))':s=22050:d=7.1",
    '-filter_complex', "[0:v]zoompan=z='if(gte(in_time,1),1.15,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=400x224:fps=30,setsar=1[a];[1:v]setsar=1[b];[2:v]setsar=1[c];[3:v]setsar=1[d];[4:v]setsar=1[e];[a][b][c][d][e]concat=n=5:v=1:a=0,format=yuv420p[v]",
    '-map', '[v]', '-map', '5:a', '-shortest', out]);
  return out;
}

test('one reference: cuts (a punch-in is a zoom, not a cut), the punch size, a white flash, the palette, cuts on the beat', async () => {
  const a = await R.analyzeVideo(FFMPEG, makeRef('ref1.mp4'), { sheet: path.join(TMP, 'sheet.jpg') });
  assert.deepEqual(a.cuts, [2, 3.5, 5.1]);
  assert.equal(a.zoom.punches.length, 1); assert.equal(a.zoom.punches[0].t, 1);
  assert.ok(a.zoom.punches[0].amount >= 10 && a.zoom.punches[0].amount <= 16, String(a.zoom.punches[0].amount));
  assert.equal(a.flashes.white, 1);
  assert.equal(a.music.bpm, 120); assert.ok(a.music.onBeat >= 0.6, JSON.stringify(a.music));
  assert.ok(a.color.palette.length >= 3 && /^#[0-9a-f]{6}$/.test(a.color.palette[0].hex));
  assert.ok(fs.statSync(a.sheet).size > 5000, 'a contact sheet of the reference');
});

test('estimateScale finds a centred zoom and says 1 for a different picture', () => {
  const w = 64, h = 36, img = new Float32Array(w * h).map((_, i) => 128 + 100 * Math.sin((i % w) / 3) * Math.cos(Math.floor(i / w) / 2.5));
  const zoomed = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = 31.5 + (x - 31.5) / 1.08, sy = 17.5 + (y - 17.5) / 1.08; zoomed[y * w + x] = 128 + 100 * Math.sin(sx / 3) * Math.cos(sy / 2.5); }
  assert.ok(Math.abs(R.estimateScale(img, zoomed, w, h).scale - 1.08) <= 0.011);
  assert.equal(R.estimateScale(img, new Float32Array(w * h).fill(30), w, h).scale, 1);
});

test('a skill from references: stored, combined, turned into tool settings and a guide; sheets go to Claude', async () => {
  const f = makeRef('ref2.mp4');
  const s = await R.create({ ffmpeg: FFMPEG, name: 'ريلز سريعة', files: [f, f, path.join(TMP, 'notes.txt')] });
  assert.equal(s.refs.length, 2, 'only the videos');
  assert.equal(s.settings.pace, 'سريع');
  assert.equal(s.settings.zoom.style, 'jump'); assert.equal(s.settings.zoom.density, 'high'); assert.ok(s.settings.zoom.scale >= 110);
  assert.equal(s.settings.beat.on, true); assert.equal(s.settings.beat.bpm, 120);
  assert.equal(s.settings.flashes, 'فلاشات بين اللقطات');
  assert.deepEqual(R.list().map(x => x.name), ['ريلز سريعة']);
  const g = R.guideText(R.get(s.id));
  assert.match(g, /الإيقاع: سريع/); assert.match(g, /premiere_auto_zoom بـ density=high style=jump/); assert.match(g, /premiere_beat_montage/);
  assert.equal(R.sheets(s).length, 2);
  R.update(s.id, { notes: 'كابشن أصفر كلمة كلمة' });
  assert.match(R.guideText(R.get(s.id), 'ae'), /كابشن أصفر[\s\S]*الأفتر/);
  await assert.rejects(R.create({ ffmpeg: FFMPEG, name: 'x', files: ['a.txt'] }), /فيديو واحد/);
  assert.equal(R.remove(s.id), true); assert.equal(R.list().length, 0);
});

test('settings: a calm, smooth reference becomes a slow pace with smooth zooms and no beat cutting', () => {
  const st = R.settingsOf({ shotAvg: 6, shotP10: 3, shotP90: 9, cutsPerMin: 10, punchPerMin: 0.5, punchAmount: 0, smoothShare: 0.6, smoothRate: 3, motion: 4, flashesPerMin: 0, brightness: 160, contrast: 30, saturation: 0.15, warmth: 20, bpm: 90, onBeat: 0.2, chance: 0.3, palette: [] });
  assert.equal(st.pace, 'هادي'); assert.equal(st.zoom.style, 'smooth'); assert.equal(st.zoom.density, 'low'); assert.equal(st.beat.on, false);
  assert.deepEqual(st.grade, ['فاتح', 'كونتراست هادي', 'ألوان باهتة', 'دافي']);
});

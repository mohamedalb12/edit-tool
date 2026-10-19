'use strict';
// 1.5: fillers + bleep words, yt-dlp managed binary/args/errors, PATH for Homebrew tools, the error log.
const { TMP } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../../core/fillers');
const Y = require('../../core/ytdlp');

const W = (list) => list.map(([text, start, end]) => ({ text, start, end }));

test('fillers: hesitation sounds (any length), optional words only when ticked, multi-word, padding stays in the gaps', () => {
  const w = W([['طيب', 0, 0.3], ['اممممم', 0.4, 0.9], ['هنبدأ', 1.0, 1.4], ['إإإ', 1.45, 1.7], ['يعني', 1.75, 1.95], ['إيه', 2.0, 2.2], ['umm', 2.3, 2.6], ['خلاص', 2.7, 3.0]]);
  const base = F.find(w);
  assert.deepEqual(base.map(x => x.text), ['اممممم', 'إإإ', 'umm']);
  assert.ok(base[0].start >= 0.3 && base[0].end <= 1.0, 'never eats into the next word');
  assert.deepEqual(F.find(w, { extra: ['يعني'] }).map(x => x.text), ['اممممم', 'إإإ يعني', 'umm'], 'touching ranges merge');
  assert.deepEqual(F.find(w, { extra: ['يعني إيه'] }).map(x => x.text), ['اممممم', 'إإإ يعني إيه umm'], 'a two-word filler, merged with the sounds right next to it');
  assert.deepEqual(F.find(W([['المونتاج', 0, 0.5], ['مهم', 0.6, 0.9]])), []);
  assert.ok(F.OPTIONAL.includes('يعني') && !F.SOUNDS.includes('يعني'), '"يعني" is never cut unless ticked');
});

test('bleep words: matches ignoring hamza/diacritics, inside longer words for 3+ letters', () => {
  const w = W([['اتصل', 0, 0.4], ['بالشركة', 0.5, 1.0], ['أحمد', 1.1, 1.5]]);
  assert.deepEqual(F.findWords(w, ['الشركة']).map(x => x.text), ['بالشركة']);
  assert.deepEqual(F.findWords(w, ['احمد']).map(x => x.text), ['أحمد']);
  assert.deepEqual(F.findWords(w, ['']), []);
});

test('yt-dlp: standalone build per OS, JS runtime + browser cookies passed, a no-ffmpeg format that needs no merging', () => {
  assert.equal(Y.assetName('darwin'), 'yt-dlp_macos'); assert.equal(Y.assetName('win32'), 'yt-dlp.exe'); assert.equal(Y.assetName('linux'), 'yt-dlp_linux');
  assert.equal(Y.managedPath('/data', 'darwin'), path.join('/data', 'bin', 'yt-dlp_macos'));
  const a = Y.buildArgs({ url: 'https://youtu.be/x', quality: '720', outDir: '/o', ffmpeg: '/bin/ffmpeg', jsRuntime: 'deno:/opt/homebrew/bin/deno', cookiesFrom: 'chrome' }).join(' ');
  assert.match(a, /--js-runtimes deno:\/opt\/homebrew\/bin\/deno/); assert.match(a, /--cookies-from-browser chrome/); assert.match(a, /bv\*\[height<=720\]\+ba/);
  const b = Y.buildArgs({ url: 'https://youtu.be/x', quality: '720', outDir: '/o' }).join(' ');
  assert.match(b, /-f b\[height<=720\]\[ext=mp4\]/, 'no ffmpeg → one ready file'); assert.doesNotMatch(b, /merge-output-format/);
  assert.ok(Y.needsJsRuntime('2026.08.19')); assert.ok(Y.needsJsRuntime('2025.11.12')); assert.ok(!Y.needsJsRuntime('2025.10.22')); assert.ok(!Y.needsJsRuntime(''));
});

test('yt-dlp errors become what to do, in Arabic', () => {
  assert.match(Y.friendlyError("Sign in to confirm you're not a bot"), /كوكيز المتصفح/);
  assert.match(Y.friendlyError('HTTP Error 403: Forbidden'), /حدّث yt-dlp/);
  assert.match(Y.friendlyError('Requested format is not available'), /جودة تانية/);
  assert.match(Y.friendlyError('n challenge solving failed: no JS runtime'), /deno/);
  assert.match(Y.friendlyError("Unable to connect to proxy', OSError('Tunnel connection failed: 403"), /بروكسي أو VPN/);
  assert.equal(Y.friendlyError('something new'), 'something new');
});

test('Homebrew dirs are on PATH for child processes (Premiere from the Dock has a bare PATH)', () => {
  const env = require('../../core/env');
  const saved = process.env.PATH;
  try {
    process.env.PATH = '/usr/bin:/bin';
    env.fixPath();
    if (process.platform !== 'win32') { assert.ok(process.env.PATH.split(':').includes('/opt/homebrew/bin')); assert.ok(process.env.PATH.split(':').includes('/usr/local/bin')); assert.ok(process.env.PATH.startsWith('/usr/bin:/bin')); }
  } finally { process.env.PATH = saved; }
});

test('error log: one file per day, keys redacted, tail returns the newest entries in order', () => {
  const L = require('../../core/log');
  const dir = path.join(TMP, 'log-' + Date.now());
  L.append(dir, { action: 'a', error: 'boom with sk-or-v1-abcdefabcdef and sk_1234567890ab' });
  L.append(dir, { action: 'b', error: 'second' });
  const t = L.tail(dir, 10);
  assert.deepEqual(t.map(x => x.action), ['a', 'b']);
  assert.doesNotMatch(JSON.stringify(t), /abcdefabcdef|1234567890ab/);
  assert.equal(fs.readdirSync(path.join(dir, 'logs')).length, 1);
});

test('yt-dlp age + the YouTube retry flags', () => {
  assert.equal(Y.ageDays('2026.03.17', Date.UTC(2026, 9, 19)), 216);
  assert.equal(Y.ageDays('', Date.now()), Infinity);
  assert.deepEqual(Y.youtubeRetryArgs('2026.03.17'), ['--extractor-args', 'youtube:player_client=tv,web_safari,mweb', '--remote-components', 'ejs:github']);
  assert.deepEqual(Y.youtubeRetryArgs('2025.06.01'), ['--extractor-args', 'youtube:player_client=tv,web_safari,mweb']);
  assert.ok(Y.buildArgs({ url: 'u', outDir: '/o', extra: ['--x', 'y'] }).includes('--x'));
});

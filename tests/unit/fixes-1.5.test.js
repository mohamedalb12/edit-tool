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

test('caption timing: sped-up clips map words sooner; the silence snap never wrecks a quiet voice and never moves a word far', () => {
  const T = require('../../core/transcribe');
  const w = [{ text: 'a', start: 12, end: 13 }, { text: 'b', start: 21, end: 22 }];
  const clip = { start: 0, end: 20, inPoint: 10, speed: 1.1 };
  const m = T.wordsToTimeline(w, clip);
  assert.ok(Math.abs(m[0].start - 2 / 1.1) < 1e-9 && Math.abs(m[1].start - 11 / 1.1) < 1e-9, '110% → 10% sooner, no drift');
  assert.deepEqual(T.sourceSpan(clip), { a: 10, b: 32 });
  // "silence" over most of the words = threshold wrong for this voice → untouched
  const words = [{ text: 'x', start: 1, end: 2 }, { text: 'y', start: 2.1, end: 3 }];
  assert.deepEqual(T.refineWithSilence(words, [{ start: 0.5, end: 3.2 }]), words);
  // a real pause: small move only (≤ 0.6 s)
  const r = T.refineWithSilence([{ text: 'x', start: 1, end: 2 }, { text: 'y', start: 2.3, end: 4 }, { text: 'z', start: 4.2, end: 6 }], [{ start: 2.0, end: 2.5 }, { start: 3.9, end: 4.9 }]);
  assert.equal(r[1].start, 2.5, 'moved 0.2 s to where the voice starts');
  assert.equal(r[2].start, 4.2, 'a 0.7 s jump is not trusted');
});

test('preview stream for YouTube & co: yt-dlp -g with a ready-made (picture + sound) format; failures say so', async () => {
  const Y = require('../../core/ytdlp'), os = require('os'), fs2 = require('fs'), p2 = require('path');
  const fake = p2.join(os.tmpdir(), 'ef-yt-g-' + process.pid);
  fs2.writeFileSync(fake, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (!a.includes('-g') || !a.includes('b[ext=mp4][height<=720]/b[height<=720]/b[ext=mp4]/b')) process.exit(2);\nif (a.some(x => /bad/.test(x))) { console.error('ERROR: [youtube] bad: Video unavailable'); process.exit(1); }\nconsole.log('https://rr1.googlevideo.com/videoplayback?x=1');\n`);
  fs2.chmodSync(fake, 0o755);
  assert.equal(await Y.streamUrl(fake, 'https://youtu.be/ok'), 'https://rr1.googlevideo.com/videoplayback?x=1');
  await assert.rejects(Y.streamUrl(fake, 'https://youtu.be/bad'), /البريفيو مش متاح/);
  fs2.unlinkSync(fake);
});

test('snapToOnsets: phrases move to the voice, never overlap, stay put with nothing nearby', () => {
  const C = require('../../core/captions');
  const w = [{ text: 'a', start: 1.5, end: 2 }, { text: 'b', start: 2.05, end: 2.6 }, { text: 'c', start: 3.0, end: 3.5 }, { text: 'd', start: 9, end: 9.5 }];
  const r = C.snapToOnsets(w, [1.0, 2.8, 20]);
  assert.deepEqual(r.words.map(x => +x.start.toFixed(2)), [1.0, 1.55, 2.8, 9], 'a+b one phrase (−0.5), c → 2.8, d has nothing near');
  assert.ok(r.words[1].end <= r.words[2].start, 'no overlap');
  assert.deepEqual(C.snapToOnsets(w, []).words, w);
  // an onset later than the phrase may only push it up to the next phrase
  const r2 = C.snapToOnsets([{ text: 'x', start: 1, end: 1.9 }, { text: 'y', start: 2.2, end: 3 }], [1.3]);
  assert.ok(r2.words[0].end <= 2.2 + 1e-9);
});

test('caption presets: every preset uses a real style / animation / curve / exit and draws', () => {
  const CS = require('../../core/captionStyles');
  const ids = k => new Set(CS[k].map(x => x.id));
  const S = ids('STYLES'), A = ids('ANIMS'), E = ids('EASES'), X = ids('EXITS');
  assert.ok(CS.PRESETS.length >= 10);
  for (const p of CS.PRESETS) {
    assert.ok(S.has(p.o.style), p.id + ' style'); if (p.o.anim) assert.ok(A.has(p.o.anim), p.id + ' anim');
    if (p.o.ease) assert.ok(E.has(p.o.ease), p.id + ' ease'); if (p.o.exit) assert.ok(X.has(p.o.exit), p.id + ' exit');
  }
  assert.equal(new Set(CS.PRESETS.map(p => p.id)).size, CS.PRESETS.length);
});

test('EditFast Motion is its own After Effects extension next to EditFast: created from the install, refreshed on a new version, never from a dev checkout', () => {
  const MI = require('../../core/motionInstall');
  const os = require('os'), fs2 = require('fs'), p2 = require('path');
  const root = fs2.mkdtempSync(p2.join(os.tmpdir(), 'ef-cep-'));
  const ext = p2.join(root, 'Adobe', 'CEP', 'extensions', 'EditFast');
  const repo = p2.join(__dirname, '..', '..');
  for (const d of ['client', 'core', 'host', 'assets', 'CSXS']) fs2.cpSync(p2.join(repo, d), p2.join(ext, d), { recursive: true });
  assert.deepEqual(MI.ensure(repo), { skipped: 'not an installed extension' });
  const r = MI.ensure(ext);
  assert.equal(r.created, true);
  const dest = p2.join(root, 'Adobe', 'CEP', 'extensions', 'EditFastMotion');
  assert.equal(r.path, dest);
  const man = fs2.readFileSync(p2.join(dest, 'CSXS', 'manifest.xml'), 'utf8');
  const v = MI.version(ext);
  assert.match(man, /ExtensionBundleId="com\.editfast\.motion"/);
  assert.match(man, new RegExp('ExtensionBundleVersion="' + v.replace(/\./g, '\\.') + '"'));
  assert.match(man, /<Host Name="AEFT"/); assert.doesNotMatch(man, /PPRO|__VERSION__/);
  assert.match(man, /\.\/client\/ae\.html/); assert.match(man, /\.\/host\/ae\.jsx/);
  assert.ok(fs2.existsSync(p2.join(dest, 'host', 'ae.jsx')) && fs2.existsSync(p2.join(dest, 'core', 'aeServices.js')));
  assert.doesNotThrow(() => { if (!/^<\?xml[\s\S]*<\/ExtensionManifest>\s*$/.test(man)) throw new Error('bad xml'); });
  assert.deepEqual(MI.ensure(ext), { path: dest, created: false, updated: false, version: v }, 'same version: nothing to do');
  // a new EditFast version → the AE folder follows
  const mp = p2.join(ext, 'CSXS', 'manifest.xml');
  fs2.writeFileSync(mp, fs2.readFileSync(mp, 'utf8').replace(/ExtensionBundleVersion="[^"]+"/, 'ExtensionBundleVersion="9.9.9"'));
  const u = MI.ensure(ext);
  assert.equal(u.updated, true); assert.equal(MI.version(dest), '9.9.9');
  // the Premiere manifest is Premiere only now (one host per bundle: what CEP supports)
  const main = fs2.readFileSync(p2.join(repo, 'CSXS', 'manifest.xml'), 'utf8');
  assert.doesNotMatch(main, /AEFT|ae\.html/);
});

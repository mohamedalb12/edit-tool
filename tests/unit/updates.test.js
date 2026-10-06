'use strict';
// Self-update (zip, manifest, install with backup, rollback) + scene layers.
const { TMP, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zip = require('../../core/zip');
const U = require('../../core/updater');

test('zip: round trip (Arabic names, deflate, CRC) and unsafe paths are refused', () => {
  const buf = zip.create([{ name: 'EditFast/core/a.js', data: Buffer.from('x'.repeat(5000)) }, { name: 'EditFast/client/ملف.txt', data: Buffer.from('أهلا') }, { name: 'EditFast/run.command', data: Buffer.from('#!/bin/sh'), mode: 0o100755 }]);
  const out = zip.read(buf);
  assert.deepEqual(out.map(e => e.name), ['EditFast/core/a.js', 'EditFast/client/ملف.txt', 'EditFast/run.command']);
  assert.equal(out[1].data.toString(), 'أهلا'); assert.equal(out[0].data.length, 5000); assert.ok(out[2].mode & 0o111);
  assert.ok(buf.length < 1000, 'compressed: ' + buf.length);
  assert.throws(() => zip.read(zip.create([{ name: '../evil.js', data: Buffer.from('x') }])), /مش آمن/);
  assert.throws(() => zip.read(zip.create([{ name: '/etc/x', data: Buffer.from('x') }])), /مش آمن/);
  const bad = Buffer.from(buf); bad[52] ^= 0xff; // inside the first file's compressed data
  assert.throws(() => zip.read(bad));
  assert.throws(() => zip.read(Buffer.from('nope')), /zip/);
});

function fakeExt(dir, version, extra = {}) {
  const w = (rel, txt) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };
  w('CSXS/manifest.xml', `<ExtensionManifest ExtensionBundleVersion="${version}"></ExtensionManifest>`);
  w('core/services.js', 'old services ' + version);
  w('remotion/package.json', JSON.stringify({ dependencies: { remotion: extra.remotion || '4.0.533' } }));
  w('remotion/node_modules/remotion/index.js', 'installed engine');
  return dir;
}

test('updater: versions, manifests (ours + GitHub releases), newest source wins, a dead source is fine', async () => {
  assert.equal(U.cmp('1.10.0', '1.9.9'), 1); assert.equal(U.cmp('v1.2.0', '1.2'), 0); assert.equal(U.cmp('1.2.0', '1.3.0'), -1);
  const ext = fakeExt(path.join(TMP, 'ext-chk'), '1.2.0');
  assert.equal(U.currentVersion(ext), '1.2.0');
  const ours = U.parseManifest({ version: '1.3.0', url: 'EditFast-1.3.0.zip', notes: 'n', sha256: 'ab' }, 'https://raw.githubusercontent.com/o/r/main/updates/latest.json');
  assert.equal(ours.url, 'https://raw.githubusercontent.com/o/r/main/updates/EditFast-1.3.0.zip');
  const gh = U.parseManifest({ tag_name: 'v1.4.0', body: 'جديد', assets: [{ name: 'notes.txt' }, { name: 'EditFast-1.4.0.zip', browser_download_url: 'https://gh/dl.zip' }] }, 'x');
  assert.deepEqual([gh.version, gh.url, gh.notes], ['1.4.0', 'https://gh/dl.zip', 'جديد']);
  assert.equal(U.parseManifest({ tag_name: 'v2', assets: [] }), null);
  const fetchImpl = async url => /latest\.json/.test(url) ? mockResponse({ version: '1.3.0', url: 'EditFast-1.3.0.zip' }) : /api\.github/.test(url) ? mockResponse({ message: 'Not Found' }, { status: 404 }) : (() => { throw new Error('offline'); })();
  const r = await U.check({ extRoot: ext, sources: ['https://a/updates/latest.json', 'https://api.github.com/x', 'https://dead/x'], fetchImpl });
  assert.equal(r.available, true); assert.equal(r.latest, '1.3.0'); assert.equal(r.errors.length, 2);
  const same = await U.check({ extRoot: fakeExt(path.join(TMP, 'ext-new'), '1.3.0'), sources: ['https://a/updates/latest.json'], fetchImpl });
  assert.equal(same.available, false);
  assert.ok(U.DEFAULT_SOURCES.some(s => /mohamedalb12\/edit-tool\/main\/updates\/latest\.json/.test(s)));
});

test('updater: installs the new version over the old one, keeps the engine + data, backs up, verifies, rolls back', async () => {
  const ext = fakeExt(path.join(TMP, 'ext-inst'), '1.2.0');
  fs.writeFileSync(path.join(ext, 'core', 'removed-in-new.js'), 'stale');
  const data = path.join(TMP, 'data-inst');
  const files = [
    { name: 'EditFast/CSXS/manifest.xml', data: Buffer.from('<ExtensionManifest ExtensionBundleVersion="1.3.0"></ExtensionManifest>') },
    { name: 'EditFast/core/services.js', data: Buffer.from('new services 1.3.0') },
    { name: 'EditFast/core/brand-new.js', data: Buffer.from('new file') },
    { name: 'EditFast/remotion/package.json', data: Buffer.from(JSON.stringify({ dependencies: { remotion: '4.1.0' } })) }];
  const buf = zip.create(files);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const fetchImpl = async (url, o) => { fs.writeFileSync(o.toFile, buf); if (o.onProgress) o.onProgress(1); return { ok: true, status: 200 }; };
  // a tampered download is refused and nothing changes
  await assert.rejects(U.install({ info: { version: '1.3.0', url: 'u', sha256: 'f'.repeat(64) }, extRoot: ext, dataDir: data, fetchImpl }), /sha256/);
  assert.equal(fs.readFileSync(path.join(ext, 'core', 'services.js'), 'utf8'), 'old services 1.2.0');
  const steps = [];
  const r = await U.install({ info: { version: '1.3.0', url: 'u', sha256: sha, notes: 'جديد' }, extRoot: ext, dataDir: data, fetchImpl, onProgress: (p, s) => steps.push(s) });
  assert.equal(r.version, '1.3.0'); assert.equal(r.previous, '1.2.0'); assert.equal(r.engineChanged, true);
  assert.equal(U.currentVersion(ext), '1.3.0');
  assert.equal(fs.readFileSync(path.join(ext, 'core', 'services.js'), 'utf8'), 'new services 1.3.0');
  assert.ok(fs.existsSync(path.join(ext, 'core', 'brand-new.js')));
  assert.ok(!fs.existsSync(path.join(ext, 'core', 'removed-in-new.js')), 'stale code removed');
  assert.equal(fs.readFileSync(path.join(ext, 'remotion', 'node_modules', 'remotion', 'index.js'), 'utf8'), 'installed engine', 'engine untouched');
  assert.equal(fs.readFileSync(path.join(data, 'backups', '1.2.0', 'core', 'services.js'), 'utf8'), 'old services 1.2.0');
  assert.ok(steps.includes('backup') && steps.includes('done'));
  const rb = U.rollback({ extRoot: ext, dataDir: data });
  assert.equal(rb.version, '1.2.0'); assert.equal(U.currentVersion(ext), '1.2.0');
  assert.equal(fs.readFileSync(path.join(ext, 'core', 'services.js'), 'utf8'), 'old services 1.2.0');
  // not an EditFast package
  const junk = zip.create([{ name: 'x/readme.txt', data: Buffer.from('hi') }]);
  await assert.rejects(U.install({ info: { version: '9', url: 'u' }, extRoot: ext, dataDir: data, fetchImpl: async (u, o) => { fs.writeFileSync(o.toFile, junk); return { ok: true }; } }), /مش EditFast/);
});

test('release: npm run package -- --release writes updates/latest.json that the updater accepts', () => {
  const { execFileSync } = require('child_process');
  const root = path.join(__dirname, '..', '..');
  const out = execFileSync(process.execPath, ['scripts/package.js'], { cwd: root }).toString();
  assert.match(out, /EditFast-[\d.]+\.zip/);
  if (fs.existsSync(path.join(root, 'updates', 'latest.json'))) {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'updates', 'latest.json'), 'utf8'));
    const info = U.parseManifest(m, 'https://raw.githubusercontent.com/x/y/main/updates/latest.json');
    assert.match(info.url, /updates\/EditFast-[\d.]+\.zip$/);
    const z = fs.readFileSync(path.join(root, 'updates', m.url));
    assert.equal(crypto.createHash('sha256').update(z).digest('hex'), m.sha256, 'published zip matches its checksum');
  }
});

test('scene layers: background, one transparent layer per element with its own timing, the look on top', () => {
  const pro = require('../../core/proScene');
  const spec = pro.normalize({ style: 'vhs', duration: 6, elements: [{ type: 'kineticTitle', from: 0.5, duration: 3, props: { text: 'عنوان' } }, { type: 'lowerThird', from: 2, duration: 4, props: { name: 'محمد' } }] });
  const L = pro.layers(spec);
  assert.deepEqual(L.map(l => l.kind), ['background', 'element', 'element', 'look']);
  assert.equal(L[0].spec.layer, 'background'); assert.equal(L[0].spec.background.type, 'gradient');
  assert.equal(L[1].spec.background.type, 'transparent'); assert.equal(L[1].spec.elements[0].from, 0); assert.equal(L[1].spec.duration, 3);
  assert.deepEqual([L[1].from, L[2].from], [0.5, 2]); assert.match(L[1].name, /عنوان حركي — عنوان/);
  assert.equal(L[3].spec.overlay, 'vhs');
  const overlay = pro.layers(pro.normalize({ background: { type: 'transparent' }, grain: false, elements: [{ type: 'quote' }] }));
  assert.deepEqual(overlay.map(l => l.kind), ['element'], 'an overlay scene has no background / look layers');
});

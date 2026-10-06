'use strict';
// يعمل dist/EditFast-<version>.zip جاهز للتثبيت — من غير أي مكتبات خارجية.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zipLib = require('../core/zip');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const INCLUDE = ['CSXS', 'client', 'core', 'host', 'assets', 'remotion/src', 'remotion/public', 'remotion/package.json', 'remotion/package-lock.json', 'remotion/render.mjs', 'remotion/.gitignore', 'scripts/install-windows.bat', 'scripts/install-windows.ps1', 'scripts/install-mac.command', 'README.md', '.debug'];

function list(p, out = []) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isDirectory()) for (const f of fs.readdirSync(abs).sort()) list(path.join(p, f), out);
  else out.push(p);
  return out;
}

const files = INCLUDE.flatMap(p => list(p));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `EditFast-${pkg.version}.zip`);
const buf = zipLib.create(files.map(rel => ({ name: 'EditFast/' + rel.split(path.sep).join('/'), data: fs.readFileSync(path.join(ROOT, rel)), mode: rel.endsWith('.command') ? 0o100755 : 0o100644 })));
fs.writeFileSync(out, buf);
console.log(`${out} — ${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);

// --release "ملاحظات": publish to updates/ (the panel checks updates/latest.json and updates itself)
const ri = process.argv.indexOf('--release');
if (ri >= 0) {
  const dir = path.join(ROOT, 'updates');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^EditFast-.*\.zip$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const name = `EditFast-${pkg.version}.zip`;
  fs.copyFileSync(out, path.join(dir, name));
  const manifest = { version: pkg.version, url: name, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length, notes: process.argv[ri + 1] || '', date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('release →', path.join(dir, 'latest.json'));
}

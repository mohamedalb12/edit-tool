'use strict';
// يعمل dist/EditFast-<version>.zip جاهز للتثبيت — من غير أي مكتبات خارجية.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const INCLUDE = ['CSXS', 'client', 'core', 'host', 'assets', 'remotion/src', 'remotion/public', 'remotion/package.json', 'remotion/package-lock.json', 'remotion/render.mjs', 'remotion/.gitignore', 'scripts/install-windows.bat', 'scripts/install-windows.ps1', 'scripts/install-mac.command', 'README.md', '.debug'];

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }

function list(p, out = []) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isDirectory()) for (const f of fs.readdirSync(abs).sort()) list(path.join(p, f), out);
  else out.push(p);
  return out;
}

function dosTime(d = new Date()) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

function zip(files, prefix) {
  const local = [], central = []; let offset = 0;
  const { time, date } = dosTime();
  for (const rel of files) {
    const data = fs.readFileSync(path.join(ROOT, rel));
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const name = Buffer.from(prefix + rel.split(path.sep).join('/'), 'utf8');
    const crc = crc32(data);
    const mode = rel.endsWith('.command') ? 0o100755 : 0o100644;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE((mode << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const files = INCLUDE.flatMap(p => list(p));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `EditFast-${pkg.version}.zip`);
fs.writeFileSync(out, zip(files, 'EditFast/'));
console.log(`${out} — ${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);

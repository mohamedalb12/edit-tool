'use strict';
// التحديث التلقائي: الإضافة بتشوف لو فيه نسخة أحدث (updates/latest.json في الريبو أو GitHub Releases)،
// تنزّلها، تتأكد منها (sha256 + CRC)، تاخد نسخة احتياطية من القديمة، وتحدّث نفسها من غير ما تلمس محرك Remotion المتثبّت.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zip = require('./zip');

const REPO = 'mohamedalb12/edit-tool';
const DEFAULT_SOURCES = [
  `https://raw.githubusercontent.com/${REPO}/main/updates/latest.json`,
  `https://api.github.com/repos/${REPO}/releases/latest`,
  `https://raw.githubusercontent.com/${REPO}/claude/vibrant-goodall-cwxlhf/updates/latest.json`
];
// what an update replaces; the rest (remotion/node_modules, bin/, the user's data) stays as it is
const CODE_DIRS = ['client', 'core', 'host', 'CSXS', 'assets', 'remotion/src', 'remotion/public'];

function currentVersion(extRoot) {
  try {
    const m = /ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(extRoot, 'CSXS', 'manifest.xml'), 'utf8'));
    return m ? m[1] : '0.0.0';
  } catch (_) { return '0.0.0'; }
}

/** semver-ish compare: 1.10.0 > 1.9.2 */
function cmp(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.-]/).map(x => parseInt(x, 10) || 0), pb = String(b || '0').replace(/^v/i, '').split(/[.-]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

/** A GitHub release or our latest.json → { version, url, notes, sha256 } */
function parseManifest(j, from) {
  if (!j) return null;
  if (j.tag_name) {
    const asset = (j.assets || []).find(a => /EditFast.*\.zip$/i.test(a.name));
    if (!asset) return null;
    return { version: String(j.tag_name).replace(/^v/i, ''), url: asset.browser_download_url, notes: j.body || '', sha256: null, source: from };
  }
  if (j.version && j.url) return { version: String(j.version), url: new URL(j.url, from).toString(), notes: j.notes || '', sha256: j.sha256 || null, size: j.size, date: j.date, source: from };
  return null;
}

/** Ask every source; the newest version wins. → { current, latest, available, info } */
async function check({ extRoot, sources, fetchImpl }) {
  const f = fetchImpl || require('./http').nodeFetch;
  const current = currentVersion(extRoot);
  let best = null; const errors = [];
  for (const src of (sources && sources.length ? sources : DEFAULT_SOURCES)) {
    try {
      const res = await f(src + (src.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: { Accept: 'application/json' }, timeout: 15000 });
      if (!res.ok) { errors.push(`${src}: ${res.status}`); continue; }
      const info = parseManifest(await res.json(), src);
      if (info && (!best || cmp(info.version, best.version) > 0)) best = info;
    } catch (e) { errors.push(`${src}: ${e.message}`); }
  }
  return { current, latest: best ? best.version : null, available: !!best && cmp(best.version, current) > 0, info: best, errors };
}

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p));
  }
  return out;
}

/**
 * Download, verify and install. Old code is backed up to <dataDir>/backups/<version>/ first.
 * → { version, previous, engineChanged, backup }
 */
async function install({ info, extRoot, dataDir, fetchImpl, onProgress }) {
  const f = fetchImpl || require('./http').nodeFetch;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editfast-update-'));
  const zf = path.join(tmp, 'update.zip');
  const res = await f(info.url, { toFile: zf, timeout: 600000, onProgress: p => onProgress && onProgress(p * 0.8, 'download') });
  if (!res.ok || !fs.existsSync(zf)) throw new Error('تحميل التحديث فشل ' + (res.status || ''));
  const buf = fs.readFileSync(zf);
  if (info.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== info.sha256) throw new Error('ملف التحديث مش مطابق (sha256) — اتلغى التحديث');
  const entries = zip.read(buf);
  const prefix = (entries.find(e => /(^|\/)CSXS\/manifest\.xml$/.test(e.name)) || {}).name;
  if (!prefix) throw new Error('ملف التحديث مش EditFast');
  const root = prefix.replace(/CSXS\/manifest\.xml$/, '');
  const files = entries.filter(e => e.name.startsWith(root)).map(e => ({ rel: e.name.slice(root.length), data: e.data, mode: e.mode }));
  const newVer = (/ExtensionBundleVersion="([^"]+)"/.exec(files.find(x => x.rel === 'CSXS/manifest.xml').data.toString('utf8')) || [])[1];
  if (!newVer) throw new Error('نسخة التحديث مش واضحة');
  onProgress && onProgress(0.85, 'backup');

  // backup the code we're about to replace
  const previous = currentVersion(extRoot);
  const backup = path.join(dataDir, 'backups', previous);
  fs.rmSync(backup, { recursive: true, force: true });
  for (const d of CODE_DIRS) { const src = path.join(extRoot, d); if (fs.existsSync(src)) fs.cpSync(src, path.join(backup, d), { recursive: true }); }
  for (const f2 of ['remotion/package.json', 'remotion/render.mjs', 'README.md']) { const src = path.join(extRoot, f2); if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(path.join(backup, f2)), { recursive: true }); fs.copyFileSync(src, path.join(backup, f2)); } }

  const oldDeps = readDeps(extRoot);
  // write the new files, then drop code files that no longer exist in the new version (stale scripts)
  const keep = new Set(files.map(x => x.rel.split('/').join(path.sep)));
  for (const x of files) {
    const dest = path.join(extRoot, x.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, x.data);
    if (x.mode & 0o111) { try { fs.chmodSync(dest, 0o755); } catch (_) {} }
  }
  for (const d of ['client', 'core', 'host', 'remotion/src']) for (const rel of walk(path.join(extRoot, d), extRoot)) if (!keep.has(rel)) fs.unlinkSync(path.join(extRoot, rel));
  fs.rmSync(tmp, { recursive: true, force: true });
  onProgress && onProgress(1, 'done');
  return { version: newVer, previous, backup, engineChanged: JSON.stringify(oldDeps) !== JSON.stringify(readDeps(extRoot)), notes: info.notes };
}

function readDeps(extRoot) { try { return JSON.parse(fs.readFileSync(path.join(extRoot, 'remotion', 'package.json'), 'utf8')).dependencies || {}; } catch (_) { return {}; } }

/** Put the backed-up version back. */
function rollback({ extRoot, dataDir, version }) {
  const dir = path.join(dataDir, 'backups');
  const v = version || (fs.existsSync(dir) ? fs.readdirSync(dir).sort((a, b) => cmp(b, a))[0] : null);
  if (!v || !fs.existsSync(path.join(dir, v))) throw new Error('مفيش نسخة احتياطية');
  fs.cpSync(path.join(dir, v), extRoot, { recursive: true, force: true });
  return { version: v };
}

module.exports = { DEFAULT_SOURCES, currentVersion, cmp, parseManifest, check, install, rollback };

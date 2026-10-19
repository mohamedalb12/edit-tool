'use strict';
// EditFast Motion (After Effects) لازم يكون إضافة لوحدها في فولدر لوحده جنب EditFast (ده الشكل اللي أدوبي بتدعمه
// لكل برنامج). الفولدر ده بيتعمل ويتحدّث لوحده من EditFast: نفس الكود + المانيفست بتاع أفتر.
const fs = require('fs');
const path = require('path');

const FOLDER = 'EditFastMotion';
const DIRS = ['client', 'core', 'host', 'assets'];

function version(dir) {
  try { return (/ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(dir, 'CSXS', 'manifest.xml'), 'utf8')) || [])[1] || null; } catch (_) { return null; }
}
/** only from a real install (…/CEP/extensions/EditFast), never from a dev checkout */
function isInstalled(extRoot) { return /[\\/]CEP[\\/]extensions[\\/][^\\/]+[\\/]?$/i.test(path.resolve(extRoot)); }

/**
 * Create / refresh the After Effects extension next to the Premiere one.
 * → { path, created, updated, version } (or { skipped } outside a CEP extensions folder unless force)
 */
function ensure(extRoot, { force = false } = {}) {
  if (!force && !isInstalled(extRoot)) return { skipped: 'not an installed extension' };
  const tpl = path.join(extRoot, 'assets', 'motion', 'manifest.xml');
  const v = version(extRoot);
  if (!v || !fs.existsSync(tpl)) return { skipped: 'no motion manifest' };
  const dest = path.join(path.dirname(path.resolve(extRoot)), FOLDER);
  const had = version(dest);
  if (had === v && fs.existsSync(path.join(dest, 'client', 'ae.html'))) return { path: dest, created: false, updated: false, version: v };
  for (const d of DIRS) {
    const src = path.join(extRoot, d);
    if (!fs.existsSync(src)) continue;
    fs.rmSync(path.join(dest, d), { recursive: true, force: true });
    fs.cpSync(src, path.join(dest, d), { recursive: true });
  }
  fs.mkdirSync(path.join(dest, 'CSXS'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'CSXS', 'manifest.xml'), fs.readFileSync(tpl, 'utf8').replace(/__VERSION__/g, v));
  return { path: dest, created: !had, updated: !!had, version: v };
}

module.exports = { ensure, isInstalled, version, FOLDER };

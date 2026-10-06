'use strict';
// EditFast Link: يلاقي الملفات الناقصة (Media Offline) في المشروع ويدوّر عليها في فولدراتك ويربطها تاني واحد واحد.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKIP = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', 'Library', 'AppData', '.Trash', 'proc', 'sys', 'dev', 'Windows', 'Program Files', 'Program Files (x86)']);
const MEDIA = /\.(mp4|mov|m4v|mxf|avi|mkv|webm|mts|m2ts|r3d|braw|wav|mp3|aac|m4a|aif|aiff|flac|ogg|jpe?g|png|tiff?|psd|ai|gif|webp|heic|exr|dpx|prproj|mogrt|aep)$/i;

const lower = s => String(s || '').toLowerCase();
const stemOf = f => lower(path.basename(f, path.extname(f)));
/** "Clip 01 (1) copy" → "clip01" — survives renames by the OS/cloud sync */
function looseStem(f) {
  return stemOf(f).replace(/\s*\(\d+\)$/, '').replace(/[\s_-]*copy( \d+)?$/, '').replace(/[\s_\-.]+/g, '');
}

/** Walk folders once and index every media file by name. */
function buildIndex(dirs, { maxFiles = 200000, maxDepth = 12, onProgress } = {}) {
  const byName = new Map(), byStem = new Map(), byLoose = new Map();
  let count = 0;
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const walk = (dir, depth) => {
    if (count >= maxFiles || depth > maxDepth) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (count >= maxFiles) return;
      if (e.name.startsWith('.') && e.name !== '.') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, depth + 1); continue; }
      if (!MEDIA.test(e.name)) continue;
      count++;
      add(byName, lower(e.name), p); add(byStem, stemOf(e.name), p); add(byLoose, looseStem(e.name), p);
      if (onProgress && count % 500 === 0) onProgress(count);
    }
  };
  for (const d of Array.from(new Set(dirs.filter(Boolean)))) if (fs.existsSync(d)) walk(d, 0);
  return { byName, byStem, byLoose, count };
}

/** Best candidate for one missing file → { path, score, reason } or null. */
function matchOne(missingPath, index) {
  const name = lower(path.basename(missingPath)), ext = lower(path.extname(missingPath));
  const parent = lower(path.basename(path.dirname(missingPath)));
  const pick = (list, score, reason) => {
    if (!list || !list.length) return null;
    // prefer the copy that lives in a folder with the same name as before
    const best = list.slice().sort((a, b) => (lower(path.basename(path.dirname(b))) === parent) - (lower(path.basename(path.dirname(a))) === parent))[0];
    const bonus = lower(path.basename(path.dirname(best))) === parent ? 0.04 : 0;
    return { path: best, score: Math.min(1, score + bonus), reason, others: list.length - 1 };
  };
  const exact = pick(index.byName.get(name), 0.95, 'نفس الاسم');
  if (exact) return exact;
  const sameStem = (index.byStem.get(stemOf(missingPath)) || []).filter(p => isSameKind(ext, lower(path.extname(p))));
  const st = pick(sameStem, 0.8, 'نفس الاسم بامتداد تاني');
  if (st) return st;
  const loose = (index.byLoose.get(looseStem(missingPath)) || []).filter(p => isSameKind(ext, lower(path.extname(p))));
  return pick(loose, 0.65, 'اسم قريب');
}

const KINDS = [/\.(mp4|mov|m4v|mxf|avi|mkv|webm|mts|m2ts|r3d|braw)$/, /\.(wav|mp3|aac|m4a|aif|aiff|flac|ogg)$/, /\.(jpe?g|png|tiff?|psd|gif|webp|heic|exr|dpx)$/];
function isSameKind(a, b) { return KINDS.some(re => re.test(a) && re.test(b)) || a === b; }

/** Folders worth searching first: what's left of the old path, the project folder, the usual places. */
function suggestDirs(missingPaths, projectPath) {
  const out = [];
  const push = d => { if (d && fs.existsSync(d) && !out.includes(d)) out.push(d); };
  if (projectPath) push(path.dirname(projectPath));
  for (const p of missingPaths) {
    let d = path.dirname(p);
    for (let i = 0; i < 6 && d && d !== path.dirname(d); i++) { if (fs.existsSync(d)) { push(d); break; } d = path.dirname(d); }
  }
  const home = os.homedir();
  ['Movies', 'Videos', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music'].forEach(n => push(path.join(home, n)));
  if (process.platform === 'darwin') { try { fs.readdirSync('/Volumes').forEach(v => push(path.join('/Volumes', v))); } catch (_) {} }
  if (process.platform === 'win32') { for (const l of 'DEFGHIJ') push(l + ':\\'); }
  return out;
}

/** Match every missing item: [{id, name, path}] → [{...item, match}] */
function plan(items, index) {
  return items.map(it => ({ ...it, match: matchOne(it.path || it.name, index) }));
}

module.exports = { buildIndex, matchOne, suggestDirs, plan, looseStem };

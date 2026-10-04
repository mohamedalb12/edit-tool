'use strict';
// مكتبتك الخاصة: ارمي الفولدر كله وهو يرتّب الساوند إفكتس والترانزيشنز والأوفرلايز لوحده.
const fs = require('fs');
const path = require('path');
const { hash } = require('./util');

const AUDIO = ['wav', 'mp3', 'aif', 'aiff', 'm4a', 'aac', 'flac', 'ogg'];
const VIDEO = ['mov', 'mp4', 'webm', 'mxf', 'avi', 'm4v', 'mkv'];
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'psd'];

const TRANSITION_RE = /(transition|trans\b|swipe|wipe|whip|zoom[\s_-]?trans|spin[\s_-]?trans|ink|liquid|shape[\s_-]?trans|انتقال|ترانزيشن)/i;
const OVERLAY_RE = /(overlay|light[\s_-]?leak|leak|dust|grain|film|bokeh|flare|smoke|particles?|fire|snow|rain|frame|vhs|scratch|texture|اوفرلاي|أوفرلاي)/i;

const SFX_SUB = [
  ['whoosh', /(whoosh|swoosh|swish|woosh|ووش)/i], ['impact', /(impact|hit|punch|boom|slam|thud|ضربة)/i],
  ['pop', /(pop|bubble|click|بوب)/i], ['riser', /(riser|rise|build|uplifter)/i], ['glitch', /(glitch|digital|error)/i],
  ['ui', /(ui|notification|ding|bell|ping|beep)/i], ['camera', /(camera|shutter|flash)/i],
  ['typing', /(typing|keyboard|type)/i], ['transition', /(transition|swipe)/i], ['funny', /(funny|cartoon|boing|meme)/i]
];

function extOf(p) { return path.extname(p).slice(1).toLowerCase(); }

/** category: sfx | transitions | overlays | music | null (ignore) */
function classifyFile(file, { duration, alpha } = {}) {
  const e = extOf(file);
  const hay = file.replace(/\\/g, '/').split('/').slice(-3).join(' ');
  if (e === 'prfpset') return { category: 'transitions', sub: 'preset' };
  if (e === 'mogrt') return { category: 'overlays', sub: 'mogrt' };
  if (AUDIO.includes(e)) {
    if (/(music|song|bgm|موسيقى)/i.test(hay) || (duration && duration > 40)) return { category: 'music', sub: '' };
    const sub = (SFX_SUB.find(([, re]) => re.test(hay)) || ['other'])[0];
    return { category: 'sfx', sub };
  }
  if (VIDEO.includes(e) || IMAGE.includes(e)) {
    if (TRANSITION_RE.test(hay)) return { category: 'transitions', sub: VIDEO.includes(e) ? 'video' : 'image' };
    if (OVERLAY_RE.test(hay) || alpha) return { category: 'overlays', sub: VIDEO.includes(e) ? 'video' : 'image' };
    if (VIDEO.includes(e) && duration && duration <= 2.5) return { category: 'transitions', sub: 'video' };
    return { category: 'overlays', sub: VIDEO.includes(e) ? 'video' : 'image' };
  }
  return null;
}

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('__MACOSX')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1); else out.push(p);
  }
  return out;
}

/**
 * Scan folders and build the library index. `probe(file)` (optional, async) returns {duration, alpha}.
 */
async function scan(dirs, { probe, onProgress } = {}) {
  const items = [];
  const files = [];
  for (const d of [].concat(dirs)) {
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) walk(d, files); else if (fs.existsSync(d)) files.push(d);
  }
  let i = 0;
  for (const f of files) {
    i++;
    let meta = {};
    const pre = classifyFile(f);
    if (!pre) continue;
    if (probe && (VIDEO.includes(extOf(f)) || AUDIO.includes(extOf(f)))) { try { meta = await probe(f); } catch (_) {} }
    const c = classifyFile(f, meta) || pre;
    items.push({ id: hash(f), path: f, name: path.basename(f, path.extname(f)), ext: extOf(f), category: c.category, sub: c.sub, duration: meta.duration || 0, alpha: !!meta.alpha });
    if (onProgress && i % 20 === 0) onProgress(i / files.length);
  }
  return items;
}

function mergeIndex(oldItems, newItems) {
  const map = new Map(oldItems.map(x => [x.id, x]));
  for (const n of newItems) map.set(n.id, { ...(map.get(n.id) || {}), ...n });
  return Array.from(map.values()).filter(x => fs.existsSync(x.path));
}

function indexPath(dataDir) { return path.join(dataDir, 'library.json'); }
function loadIndex(dataDir) { try { return JSON.parse(fs.readFileSync(indexPath(dataDir), 'utf8')); } catch (_) { return []; } }
function saveIndex(dataDir, items) { fs.writeFileSync(indexPath(dataDir), JSON.stringify(items, null, 1), 'utf8'); return items; }

function search(items, { q = '', category = '', sub = '' } = {}) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(x => (!category || x.category === category) && (!sub || x.sub === sub) &&
    terms.every(t => (x.name + ' ' + x.sub + ' ' + x.path).toLowerCase().includes(t)));
}

module.exports = { classifyFile, scan, mergeIndex, loadIndex, saveIndex, search, walk };

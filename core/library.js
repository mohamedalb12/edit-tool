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

const FOOTAGE_RE = /(b[\s_-]?roll|footage|stock|clip|shot|drone|aerial|timelapse|بي رول|لقطات|لقطة)/i;
const GRAPHIC_RE = /(lower[\s_-]?third|title|text|logo|subscribe|like|cta|call[\s_-]?to|banner|تايتل|لوجو|اشترك)/i;

/** category: sfx | music | transitions | overlays | footage | graphics | images | presets | null (ignore) */
function classifyFile(file, { duration, alpha } = {}) {
  const e = extOf(file);
  const hay = file.replace(/\\/g, '/').split('/').slice(-3).join(' ');
  if (e === 'prfpset') return { category: 'presets', sub: 'preset' };
  if (e === 'mogrt') return { category: 'graphics', sub: 'mogrt' };
  if (AUDIO.includes(e)) {
    if (/(music|song|bgm|موسيقى)/i.test(hay) || (duration && duration > 40)) return { category: 'music', sub: '' };
    const sub = (SFX_SUB.find(([, re]) => re.test(hay)) || ['other'])[0];
    return { category: 'sfx', sub };
  }
  if (VIDEO.includes(e) || IMAGE.includes(e)) {
    const v = VIDEO.includes(e);
    if (TRANSITION_RE.test(hay)) return { category: 'transitions', sub: v ? 'video' : 'image' };
    if (OVERLAY_RE.test(hay)) return { category: 'overlays', sub: v ? 'video' : 'image' };
    if (GRAPHIC_RE.test(hay)) return { category: 'graphics', sub: v ? 'video' : 'image' };
    if (alpha) return { category: 'overlays', sub: v ? 'video' : 'image' };
    if (v && duration && duration <= 2.5) return { category: 'transitions', sub: 'video' };
    if (v && (FOOTAGE_RE.test(hay) || !duration || duration > 2.5)) return { category: 'footage', sub: 'video' };
    if (!v) return { category: 'images', sub: 'image' };
    return { category: 'overlays', sub: 'video' };
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
async function scan(dirs, { probe, onProgress, known = [] } = {}) {
  const items = [];
  const files = [];
  for (const d of [].concat(dirs)) {
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) walk(d, files); else if (fs.existsSync(d)) files.push(d);
  }
  // unchanged files (same size + time) keep what we already know: rescanning a big library is instant
  const old = new Map(known.map(x => [x.path, x]));
  let i = 0;
  for (const f of files) {
    i++;
    const pre = classifyFile(f);
    if (!pre) continue;
    let st = null; try { st = fs.statSync(f); } catch (_) { continue; }
    const prev = old.get(f);
    if (prev && prev.size === st.size && prev.mtime === +st.mtimeMs) { items.push(prev); continue; }
    let meta = {};
    if (probe && (VIDEO.includes(extOf(f)) || AUDIO.includes(extOf(f)))) { try { meta = await probe(f); } catch (_) {} }
    const c = classifyFile(f, meta) || pre;
    items.push({ id: hash(f), path: f, name: path.basename(f, path.extname(f)), ext: extOf(f), category: c.category, sub: c.sub, duration: meta.duration || 0, alpha: !!meta.alpha,
      width: meta.width || 0, height: meta.height || 0, size: st.size, mtime: +st.mtimeMs, added: prev ? prev.added : Date.now() });
    if (onProgress && i % 20 === 0) onProgress(i / files.length);
    if (i % 50 === 0) await new Promise(r => setImmediate(r)); // let the panel breathe on big folders
  }
  return items;
}

function mergeIndex(oldItems, newItems) {
  const map = new Map(oldItems.map(x => [x.id, x]));
  // the editor's own data (tags, uses, favourite) survives a rescan
  for (const n of newItems) { const o = map.get(n.id) || {}; map.set(n.id, { ...o, ...n, tags: o.tags || n.tags || [], uses: o.uses || 0, lastUsed: o.lastUsed || 0, fav: !!o.fav }); }
  return Array.from(map.values()).filter(x => fs.existsSync(x.path));
}

function indexPath(dataDir) { return path.join(dataDir, 'library.json'); }
function loadIndex(dataDir) { try { return JSON.parse(fs.readFileSync(indexPath(dataDir), 'utf8')); } catch (_) { return []; } }
function saveIndex(dataDir, items) { fs.writeFileSync(indexPath(dataDir), JSON.stringify(items, null, 1), 'utf8'); return items; }

const CATEGORIES = [
  { id: 'sfx', label: 'ساوند إفكتس' }, { id: 'music', label: 'موسيقى' }, { id: 'transitions', label: 'ترانزيشنز' },
  { id: 'overlays', label: 'أوفرلايز' }, { id: 'footage', label: 'لقطات' }, { id: 'graphics', label: 'جرافيك' },
  { id: 'images', label: 'صور' }, { id: 'presets', label: 'بريسيتس' }
];

/**
 * q: words (name, folder, sub-type, your tags); category; sub; special: 'fav' | 'recent' | 'used';
 * sort: 'name' | 'new' | 'used' | 'dur'
 */
function search(items, { q = '', category = '', sub = '', special = '', sort = '' } = {}) {
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  let out = items.filter(x => (!category || x.category === category) && (!sub || x.sub === sub) &&
    (special !== 'fav' || x.fav) && (special !== 'recent' || x.lastUsed) && (special !== 'used' || x.uses) &&
    terms.every(t => (x.name + ' ' + x.sub + ' ' + x.path + ' ' + (x.tags || []).join(' ')).toLowerCase().includes(t)));
  if (special === 'recent') out = out.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 60);
  else if (sort === 'name') out = out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'new') out = out.sort((a, b) => (b.added || 0) - (a.added || 0));
  else if (sort === 'used') out = out.sort((a, b) => (b.uses || 0) - (a.uses || 0));
  else if (sort === 'dur') out = out.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  return out;
}

/** counts per category and per sub-type (for the chips) */
function stats(items) {
  const cats = {}, subs = {};
  for (const x of items) { cats[x.category] = (cats[x.category] || 0) + 1; const k = x.category + '/' + (x.sub || ''); subs[k] = (subs[k] || 0) + 1; }
  return { cats, subs, total: items.length, fav: items.filter(x => x.fav).length };
}

module.exports = { CATEGORIES, AUDIO, VIDEO, IMAGE, classifyFile, scan, mergeIndex, loadIndex, saveIndex, search, stats, walk };

'use strict';
// بحث في النت جوه الأداة: صور وفيديوهات وأصوات من مصادر مجانية (Openverse, Wikimedia Commons) + Google (بمفتاح) + Pexels/Pixabay،
// والنتايج بتتنظّم وتتحمّل على المشروع بضغطة. بنترست مالوش API بحث مفتوح: بنفتح البحث في المتصفح وانت تلصق لينك البن.
const fs = require('fs');
const path = require('path');
const { hash, slug } = require('./util');

const UA = { 'User-Agent': 'EditFast/1.0 (Premiere Pro extension)' };

async function getJson(f, url, headers = {}) {
  const res = await f(url, { headers: { ...UA, ...headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

function item(o) { return { id: o.source + '-' + hash(o.url).slice(0, 10), ...o }; }

async function openverse({ q, type = 'image', f }) {
  const kind = type === 'audio' ? 'audio' : 'images';
  const j = await getJson(f, `https://api.openverse.org/v1/${kind}/?q=${encodeURIComponent(q)}&page_size=30`);
  return (j.results || []).map(r => item({ source: 'openverse', type: type === 'audio' ? 'audio' : 'photo', title: r.title || '', url: r.url, thumb: r.thumbnail || r.url, width: r.width, height: r.height,
    duration: r.duration ? r.duration / 1000 : undefined, license: (r.license || '').toUpperCase() + (r.license_version ? ' ' + r.license_version : ''), credit: r.creator || '', page: r.foreign_landing_url || '' }));
}

async function commons({ q, type = 'image', f }) {
  const ft = type === 'video' ? 'filetype:video' : type === 'audio' ? 'filetype:audio' : 'filetype:bitmap';
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=${encodeURIComponent(q + ' ' + ft)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=360`;
  const j = await getJson(f, u);
  const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.filter(p => p.imageinfo && p.imageinfo[0]).map(p => {
    const ii = p.imageinfo[0], md = ii.extmetadata || {};
    const strip = s => String((s && s.value) || '').replace(/<[^>]+>/g, '').trim();
    const t = /^video/.test(ii.mime) ? 'video' : /^audio/.test(ii.mime) ? 'audio' : 'photo';
    return item({ source: 'commons', type: t, title: String(p.title || '').replace(/^File:/, ''), url: ii.url, thumb: ii.thumburl || ii.url, width: ii.width, height: ii.height, duration: ii.duration,
      license: strip(md.LicenseShortName), credit: strip(md.Artist).slice(0, 80), page: ii.descriptionurl || '' });
  });
}

async function google({ q, key, cx, f }) {
  if (!key || !cx) throw new Error('Google محتاج مفتاح Custom Search + رقم محرك البحث (cx) من الإعدادات');
  const j = await getJson(f, `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&searchType=image&num=10&safe=active&q=${encodeURIComponent(q)}`);
  return (j.items || []).map(r => item({ source: 'google', type: 'photo', title: r.title || '', url: r.link, thumb: (r.image && r.image.thumbnailLink) || r.link, width: r.image && r.image.width, height: r.image && r.image.height,
    license: 'تأكد من الحقوق', credit: r.displayLink || '', page: (r.image && r.image.contextLink) || '' }));
}

const SEARCH_PAGES = {
  google: q => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
  pinterest: q => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`
};

/** Search the chosen sources; one failing source never hides the others. */
async function search({ q, sources = ['openverse', 'commons'], type = 'image', keys = {}, fetchImpl, brollSearch }) {
  if (!q || !String(q).trim()) throw new Error('اكتب كلمة البحث');
  const f = fetchImpl || require('./http').nodeFetch;
  const jobs = sources.map(async s => {
    if (s === 'openverse') return type === 'video' ? [] : openverse({ q, type, f });
    if (s === 'commons') return commons({ q, type, f });
    if (s === 'google') return type === 'image' ? google({ q, key: keys.google, cx: keys.googleCx, f }) : [];
    if ((s === 'pexels' || s === 'pixabay') && brollSearch) return (await brollSearch(s, type === 'image' ? 'photo' : 'video')).map(r => ({ ...r, thumb: r.thumb || r.preview, title: r.title || '' }));
    return [];
  });
  const settled = await Promise.allSettled(jobs);
  const results = [], errors = [];
  settled.forEach((r, i) => { if (r.status === 'fulfilled') results.push(...r.value); else errors.push({ source: sources[i], error: r.reason.message }); });
  // interleave sources so the first row isn't all from one site
  const by = {}; results.forEach(r => { (by[r.source] = by[r.source] || []).push(r); });
  const mixed = []; let more = true;
  for (let i = 0; more; i++) { more = false; for (const s of Object.keys(by)) if (by[s][i]) { mixed.push(by[s][i]); more = true; } }
  return { q, results: mixed, errors };
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/flac': '.flac' };

/** Download any media URL into dir → file path (cached by URL). */
async function downloadUrl(url, dir, { fetchImpl, name } = {}) {
  const f = fetchImpl || require('./http').nodeFetch;
  fs.mkdirSync(dir, { recursive: true });
  const guess = (path.extname(new URL(url).pathname).toLowerCase().match(/^\.(jpe?g|png|webp|gif|mp4|webm|mov|mp3|ogg|wav|flac|tiff?)$/) || [])[0];
  const base = `${slug(name || path.basename(new URL(url).pathname, guess || '') || 'media', 40)}-${hash(url).slice(0, 8)}`;
  const existing = fs.readdirSync(dir).find(x => x.startsWith(base + '.'));
  if (existing) return path.join(dir, existing);
  const tmp = path.join(dir, base + '.part');
  const res = await f(url, { headers: UA, toFile: tmp, timeout: 300000 });
  if (!res.ok) throw new Error(`التحميل فشل ${res.status}`);
  const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '').split(';')[0].trim();
  const ext = guess || EXT[type] || '.bin';
  if (ext === '.bin' || /text\/html/.test(type)) { try { fs.unlinkSync(tmp); } catch (_) {} throw new Error('اللينك ده مش صورة أو فيديو مباشر'); }
  const file = path.join(dir, base + ext);
  fs.renameSync(tmp, file);
  return file;
}

/** Pinterest pin page → its image/video URL (og:image / og:video) */
async function pinterestMedia(pageUrl, { fetchImpl } = {}) {
  const f = fetchImpl || require('./http').nodeFetch;
  const res = await f(pageUrl, { headers: { ...UA, 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`بنترست ${res.status}`);
  const html = await res.text();
  const meta = n => { const m = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, 'i').exec(html); return m ? m[1].replace(/&amp;/g, '&') : null; };
  const video = meta('og:video:secure_url') || meta('og:video:url') || meta('og:video');
  const image = meta('og:image:secure_url') || meta('og:image');
  if (!video && !image) throw new Error('مش لاقي صورة أو فيديو في اللينك ده');
  return { url: video || image, type: video ? 'video' : 'photo', title: meta('og:title') || '' };
}

module.exports = { search, openverse, commons, google, downloadUrl, pinterestMedia, SEARCH_PAGES };

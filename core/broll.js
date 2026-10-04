'use strict';
// مكتبة B-Roll: Pexels + Pixabay + فولدر محلي. بيحمّل اللقطة لكاش الجهاز ويحطها على التايملين مباشرة.
const fs = require('fs');
const path = require('path');
const { hash, slug, hasArabic } = require('./util');
const library = require('./library');

function pickPexelsFile(files, maxW = 1920) {
  const vids = (files || []).filter(f => f.link && (f.file_type || '').includes('mp4'));
  vids.sort((a, b) => (b.width || 0) - (a.width || 0));
  return vids.find(f => (f.width || 0) <= maxW) || vids[vids.length - 1] || vids[0];
}

async function pexels({ key, q, type = 'video', perPage = 24, page = 1, orientation, fetchImpl }) {
  if (!key) throw new Error('حط مفتاح Pexels من الإعدادات.');
  const f = fetchImpl || require('./http').nodeFetch;
  const base = type === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search';
  const url = `${base}?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}${orientation ? '&orientation=' + orientation : ''}`;
  const res = await f(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const j = await res.json();
  if (type === 'video') {
    return (j.videos || []).map(v => {
      const file = pickPexelsFile(v.video_files);
      return { id: 'pexels-v-' + v.id, source: 'pexels', type: 'video', thumb: v.image, preview: (pickPexelsFile(v.video_files, 640) || file || {}).link,
        url: file && file.link, width: file && file.width, height: file && file.height, duration: v.duration, author: v.user && v.user.name, page: v.url };
    }).filter(x => x.url);
  }
  return (j.photos || []).map(p => ({ id: 'pexels-p-' + p.id, source: 'pexels', type: 'photo', thumb: p.src.medium, preview: p.src.large,
    url: p.src.original, width: p.width, height: p.height, author: p.photographer, page: p.url }));
}

async function pixabay({ key, q, type = 'video', perPage = 24, page = 1, fetchImpl }) {
  if (!key) throw new Error('حط مفتاح Pixabay من الإعدادات.');
  const f = fetchImpl || require('./http').nodeFetch;
  const base = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  const url = `${base}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=${Math.max(3, perPage)}&page=${page}&safesearch=true${type === 'photo' ? '&image_type=photo' : ''}`;
  const res = await f(url);
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const j = await res.json();
  if (type === 'video') {
    return (j.hits || []).map(h => {
      const v = h.videos || {};
      const file = v.large && v.large.url ? v.large : (v.medium && v.medium.url ? v.medium : v.small);
      return { id: 'pixabay-v-' + h.id, source: 'pixabay', type: 'video', thumb: (v.tiny && v.tiny.thumbnail) || (file && file.thumbnail) || '',
        preview: (v.tiny && v.tiny.url) || (file && file.url), url: file && file.url, width: file && file.width, height: file && file.height,
        duration: h.duration, author: h.user, page: h.pageURL };
    }).filter(x => x.url);
  }
  return (j.hits || []).map(h => ({ id: 'pixabay-p-' + h.id, source: 'pixabay', type: 'photo', thumb: h.webformatURL, preview: h.webformatURL,
    url: h.largeImageURL || h.webformatURL, width: h.imageWidth, height: h.imageHeight, author: h.user, page: h.pageURL }));
}

function local({ dirs = [], q, type = 'video' }) {
  const exts = type === 'video' ? ['mp4', 'mov', 'mxf', 'm4v', 'webm', 'mkv', 'avi'] : ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic'];
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const d of dirs) {
    for (const f of library.walk(d)) {
      const e = path.extname(f).slice(1).toLowerCase();
      if (!exts.includes(e)) continue;
      const hay = f.toLowerCase();
      if (terms.length && !terms.some(t => hay.includes(t))) continue;
      out.push({ id: 'local-' + hash(f), source: 'local', type, thumb: type === 'photo' ? f : '', preview: f, url: f, local: true, name: path.basename(f) });
      if (out.length >= 200) return out;
    }
  }
  return out;
}

async function search({ sources = ['pexels'], q, type = 'video', keys = {}, dirs = [], fetchImpl }) {
  const jobs = sources.map(s => {
    if (s === 'pexels') return pexels({ key: keys.pexels, q, type, fetchImpl });
    if (s === 'pixabay') return pixabay({ key: keys.pixabay, q, type, fetchImpl });
    if (s === 'local') return Promise.resolve(local({ dirs, q, type }));
    return Promise.resolve([]);
  });
  const settled = await Promise.allSettled(jobs);
  const results = [], errors = [];
  settled.forEach((r, i) => r.status === 'fulfilled' ? results.push(...r.value) : errors.push(`${sources[i]}: ${r.reason.message}`));
  // interleave sources so the grid is mixed
  return { results, errors };
}

async function download(item, dir, { fetchImpl } = {}) {
  if (item.local) return item.url;
  const f = fetchImpl || require('./http').nodeFetch;
  const ext = (/\.(mp4|mov|jpg|jpeg|png|webp)(\?|$)/i.exec(item.url) || [, item.type === 'video' ? 'mp4' : 'jpg'])[1].toLowerCase();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${item.source}-${slug(item.id, 30)}-${hash(item.url)}.${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const res = await f(item.url);
  if (!res.ok) throw new Error(`تحميل اللقطة فشل ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file + '.part', buf);
  fs.renameSync(file + '.part', file);
  return file;
}

/** Arabic query → English stock-search keywords (stock sites are English-indexed). */
async function keywords(llm, model, q) {
  if (!hasArabic(q) || !llm) return q;
  try { return (await llm.text({ model, system: 'Convert the request into a short English stock-footage search query (2-5 words). Output only the query.', user: q, maxTokens: 50 })).replace(/["'.]/g, '').trim() || q; }
  catch (_) { return q; }
}

module.exports = { pexels, pixabay, local, search, download, keywords, pickPexelsFile };

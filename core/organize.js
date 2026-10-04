'use strict';
// تنظيم المشروع (أوفلاين): يصنّف كل حاجة في المشروع ويطلع خطة نقل للمجلدات قبل ما يلمس حاجة.

const BINS = {
  sequences: 'سيكوينسات',
  video: 'فيديو',
  audio: 'صوت',
  music: 'صوت/موسيقى',
  sfx: 'صوت/مؤثرات',
  images: 'صور',
  graphics: 'جرافيك',
  captions: 'كابشن',
  other: 'أخرى'
};

const EXT = {
  video: ['mp4', 'mov', 'mxf', 'avi', 'mkv', 'm4v', 'mts', 'm2ts', 'r3d', 'braw', 'webm', 'wmv', 'mpg', 'mpeg', '3gp', 'insv', 'lrv'],
  audio: ['wav', 'mp3', 'aac', 'm4a', 'aif', 'aiff', 'flac', 'ogg', 'wma', 'opus'],
  images: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'gif', 'heic', 'webp', 'dng', 'cr2', 'nef', 'arw', 'exr', 'dpx', 'tga'],
  graphics: ['mogrt', 'psd', 'ai', 'eps', 'svg', 'aep', 'prproj', 'pdf'],
  captions: ['srt', 'vtt', 'scc', 'stl', 'xml', 'ass']
};

const SFX_WORDS = /(sfx|whoosh|swoosh|swish|hit|impact|pop|click|riser|boom|ding|glitch|transition|swipe|بوب|مؤثر|ووش)/i;
const MUSIC_WORDS = /(music|song|track|beat|bgm|موسيقى|اغنية|أغنية)/i;

function ext(p) { const m = /\.([a-z0-9]+)$/i.exec(p || ''); return m ? m[1].toLowerCase() : ''; }

function classify(item) {
  if (item.isSequence) return 'sequences';
  const e = ext(item.path || item.name);
  if (EXT.video.includes(e)) return 'video';
  if (EXT.audio.includes(e)) {
    const n = (item.path || '') + ' ' + (item.name || '');
    if (SFX_WORDS.test(n)) return 'sfx';
    if (MUSIC_WORDS.test(n) || (item.duration && item.duration > 45)) return 'music';
    return 'audio';
  }
  if (EXT.images.includes(e)) return 'images';
  if (EXT.graphics.includes(e) || item.isGraphic) return 'graphics';
  if (EXT.captions.includes(e) || item.isCaption) return 'captions';
  return 'other';
}

/**
 * items: [{nodeId, name, path, isSequence, bin}] (bin = current parent bin path, "" = root; bins themselves excluded)
 * Returns plan: {moves:[{nodeId,name,from,to,category}], bins:[...], counts}
 */
function plan(items, { binNames = BINS, root = '' } = {}) {
  const moves = [], counts = {};
  for (const it of items) {
    const cat = classify(it);
    counts[cat] = (counts[cat] || 0) + 1;
    const to = (root ? root + '/' : '') + binNames[cat];
    if ((it.bin || '') === to) continue;
    moves.push({ nodeId: it.nodeId, name: it.name, from: it.bin || '(الأساسي)', to, category: cat });
  }
  const bins = Array.from(new Set(moves.map(m => m.to))).sort();
  return { moves, bins, counts };
}

module.exports = { BINS, classify, plan, ext };

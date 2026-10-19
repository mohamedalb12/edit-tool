'use strict';
// لينكات التخزين (دروبوكس / جوجل درايف): تحويل لينك المشاركة للينك تحميل مباشر، قراية الاسم والحجم والمدة،
// وتنزيل جزء من الفيديو بس (ffmpeg بيقرا من النت ويقص) من غير ما ينزّل الملف كله.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi|mxf|mts|m2ts|3gp|wmv|flv|r3d|braw)$/i;
const AUDIO = /\.(mp3|wav|aif|aiff|m4a|aac|flac|ogg|opus|wma)$/i;
const PHOTO = /\.(jpe?g|png|webp|gif|tiff?|heic|bmp|psd|ai|svg)$/i;
const ZIP = /\.zip$/i;

function hostOf(url) { try { return new URL(String(url).trim()).hostname.toLowerCase(); } catch (_) { return ''; } }

/** 'dropbox' | 'gdrive' | null */
function kindOf(url) {
  const h = hostOf(url);
  if (/(^|\.)(dropbox\.com|dropboxusercontent\.com)$|^db\.tt$/.test(h)) return 'dropbox';
  if (/^(drive|docs|drive\.usercontent)\.google\.com$/.test(h)) return 'gdrive';
  return null;
}

/** a Dropbox shared folder (downloads as one zip) vs a single file */
function dropboxIsFolder(url) {
  let u; try { u = new URL(String(url).trim()); } catch (_) { return false; }
  // a file opened inside a shared folder keeps the folder path but ends with its own name: that's a file
  const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return false;
  return /^\/(scl\/fo|sh)\//.test(u.pathname);
}

function gdriveId(url) {
  const s = String(url);
  const m = /\/file\/d\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s) || /\/open\?id=([\w-]{10,})/.exec(s);
  return m ? m[1] : null;
}

/** share link → { url, kind, folder } (the url downloads the file itself, not the preview page) */
function direct(url) {
  const kind = kindOf(url);
  if (!kind) return null;
  const raw = String(url).trim();
  if (kind === 'dropbox') {
    const u = new URL(raw);
    if (/dropboxusercontent\.com$/.test(u.hostname)) return { url: u.toString(), kind, folder: false };
    u.searchParams.delete('raw');
    u.searchParams.set('dl', '1'); // keeps rlkey / st: new-style links need them
    return { url: u.toString(), kind, folder: dropboxIsFolder(raw) };
  }
  if (/\/drive\/(u\/\d+\/)?folders\//.test(raw)) {
    const e = new Error('ده لينك فولدر جوجل درايف — افتح الفولدر، كليك يمين على الملف اللي عايزه ← Share ← Copy link، وحط لينك الملف هنا.');
    e.code = 'GDRIVE_FOLDER'; throw e;
  }
  const id = gdriveId(raw);
  if (!id) throw new Error('مش عارف أقرا لينك جوجل درايف ده — خد لينك الملف نفسه (Share ← Copy link)');
  // confirm=t skips the "too big to scan for viruses" page on big files
  return { url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, kind, folder: false };
}

/** file name from Content-Disposition (RFC 5987 UTF-8 first: Arabic names) */
function nameFromDisposition(cd) {
  if (!cd) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch (_) {} }
  const plain = /filename\s*=\s*"([^"]+)"/.exec(cd) || /filename\s*=\s*([^;]+)/.exec(cd);
  if (!plain) return null;
  const v = plain[1].trim();
  // servers often send UTF-8 bytes in a latin1 header
  try { const b = Buffer.from(v, 'latin1').toString('utf8'); return /�/.test(b) ? v : b; } catch (_) { return v; }
}

function nameFromUrl(url) {
  try { const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); return /\.[a-z0-9]{2,5}$/i.test(last) ? last : null; } catch (_) { return null; }
}

function typeOf(name, ctype = '') {
  const n = String(name || '');
  if (ZIP.test(n) || /zip/.test(ctype)) return 'zip';
  if (VIDEO.test(n) || /^video\//.test(ctype)) return 'video';
  if (AUDIO.test(n) || /^audio\//.test(ctype)) return 'audio';
  if (PHOTO.test(n) || /^image\//.test(ctype)) return 'photo';
  return 'other';
}

function safeName(n) { return String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'; }

function accessError(kind) {
  return new Error(kind === 'dropbox'
    ? 'دروبوكس رجّع صفحة بدل الملف — اللينك محتاج تسجيل دخول أو مقفول. من دروبوكس: Share ← خلّي "Anyone with the link" يقدر يشوف ← Copy link، وحطه تاني.'
    : 'جوجل درايف رجّع صفحة بدل الملف — اللينك مقفول. من درايف: Share ← General access ← "Anyone with the link" ← Copy link.');
}

/**
 * What's behind the link, without downloading it: { name, size, type, folder, kind, url, finalUrl }.
 * One-byte range request → headers only (Content-Range carries the full size).
 */
async function head(url, { fetchImpl } = {}) {
  const d = direct(url);
  if (!d) throw new Error('ده مش لينك دروبوكس أو جوجل درايف');
  const r = await fetchImpl(d.url, { headers: { Range: 'bytes=0-0' }, timeout: 30000, redirects: 8, headersOnly: true });
  const ctype = (r.headers.get('content-type') || '').toLowerCase();
  if (r.status === 404) throw new Error('الملف مش موجود — اتمسح أو اللينك غلط');
  if (r.status === 401 || r.status === 403 || /text\/html/.test(ctype)) throw accessError(d.kind);
  if (r.status >= 400) throw new Error('السيرفر رجّع ' + r.status);
  const cr = r.headers.get('content-range'), cl = r.headers.get('content-length');
  const size = cr && /\/(\d+)$/.test(cr) ? +/\/(\d+)$/.exec(cr)[1] : (r.status === 200 && cl ? +cl : null);
  const name = nameFromDisposition(r.headers.get('content-disposition')) || nameFromUrl(r.url || d.url) || nameFromUrl(url) || (d.folder ? 'dropbox-folder.zip' : 'file');
  const type = d.folder ? 'zip' : typeOf(name, ctype);
  return { name, size, type, folder: d.folder || type === 'zip', kind: d.kind, url: d.url, finalUrl: r.url || d.url, ranges: r.status === 206 };
}

const NET_IN = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '5'];

/** duration etc. of a remote video, read straight off the link (ffprobe asks only for the bytes it needs) */
function probeRemote(ffprobe, url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', url], { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, so) => {
      if (err) return reject(new Error('مش قادر أقرا الفيديو من اللينك'));
      try {
        const j = JSON.parse(so);
        const v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
        resolve({ duration: parseFloat((j.format && j.format.duration) || 0) || null, width: v ? v.width : 0, height: v ? v.height : 0, hasVideo: !!v, hasAudio: !!a, codec: v ? v.codec_name : '' });
      } catch (e) { reject(e); }
    });
  });
}

/** ffmpeg args that read [start, end] straight from the link and write a Premiere-friendly file */
function rangeArgs(url, { start = 0, end = null, audioOnly = false, out }) {
  const a = Math.max(0, +start || 0);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...NET_IN, '-ss', String(a), '-i', url];
  if (end !== null && end !== undefined && +end > a) args.push('-t', String(+end - a));
  if (audioOnly) args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
  else args.push('-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  args.push(out);
  return args;
}

/** one frame of the remote video at t seconds → JPEG bytes (ffmpeg fetches only the bytes around t) */
function frameAt(ffmpeg, url, t, { width = 320, timeout = 45000 } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', ...NET_IN, '-ss', String(Math.max(0, +t || 0)), '-i', url, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '5', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'];
  return new Promise((resolve, reject) => execFile(ffmpeg, args, { encoding: 'buffer', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, so) => {
    if (err || !so || !so.length) return reject(new Error('مش قادر أجيب صورة من الفيديو'));
    resolve(so);
  }));
}

/**
 * A small 360p piece of the remote file from t, for playing in the panel. Premiere's built-in browser has no
 * H.264/AAC (licensing), so it's WebM (VP8 + Opus/Vorbis) whenever this ffmpeg can make it.
 */
function previewArgs(url, t, len, out, { webm = true, audio = 'libopus' } = {}) {
  const v = webm
    ? ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '900k', '-qmin', '4', '-qmax', '42', '-pix_fmt', 'yuv420p', '-c:a', audio, '-b:a', '96k', '-ac', '2', '-ar', '48000', '-f', 'webm']
    : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart'];
  return ['-hide_banner', '-loglevel', 'error', '-y', ...(/^https?:/.test(url) ? NET_IN : []), '-ss', String(Math.max(0, +t || 0)), '-i', url, '-t', String(len),
    '-map', '0:v:0?', '-map', '0:a:0?', '-vf', 'scale=-2:360', ...v, out];
}
function previewClip(ffmpeg, url, t, len, out, opts) {
  const tmp = out + '.part' + path.extname(out);
  return new Promise((resolve, reject) => execFile(ffmpeg, previewArgs(url, t, len, tmp, opts), { timeout: 120000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, so, se) => {
    if (err || !fs.existsSync(tmp) || !fs.statSync(tmp).size) { try { fs.unlinkSync(tmp); } catch (_) {} return reject(new Error('مش قادر أجهّز البريفيو: ' + String(se || (err && err.message) || '').trim().split('\n').pop())); }
    fs.renameSync(tmp, out); // never leave half a piece in the cache
    resolve(out);
  }));
}

/** cut a part out of the remote file → { file } (progress 0..1 from ffmpeg's out_time) */
function downloadRange(ffmpeg, url, { start, end, audioOnly, out, total, onChild }, onProgress) {
  const args = rangeArgs(url, { start, end, audioOnly, out });
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    if (onChild) onChild(child);
    let err = '', buf = '';
    child.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
        if (m && total > 0 && onProgress) onProgress(Math.min(0.99, +m[1] / 1e6 / total));
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) return resolve({ file: out });
      try { fs.unlinkSync(out); } catch (_) {}
      reject(new Error('القص من اللينك فشل: ' + (err.trim().split('\n').pop() || 'exit ' + code)));
    });
  });
}

/** "clip.mp4" + 1:05–2:10 → "clip-65-130.mp4"; never overwrites an existing file */
function outName(dir, name, { start, end, ext } = {}) {
  const base = safeName(name).replace(/\.[^.]+$/, '');
  const e = ext !== undefined ? ext : (path.extname(safeName(name)) || '.mp4');
  const tag = start !== undefined && start !== null ? `-${Math.round(start)}-${end === null || end === undefined ? 'end' : Math.round(end)}` : '';
  let f = path.join(dir, base + tag + e), n = 2;
  while (fs.existsSync(f)) f = path.join(dir, `${base}${tag} (${n++})${e}`);
  return f;
}

/** unzip (macOS ditto keeps Arabic names; unzip elsewhere) → list of extracted media files */
function extract(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const [bin, args] = process.platform === 'darwin' ? ['ditto', ['-x', '-k', zip, dir]] : process.platform === 'win32'
    ? ['powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}'`]]
    : ['unzip', ['-q', '-o', zip, '-d', dir]];
  return new Promise((resolve, reject) => execFile(bin, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, err => {
    if (err) return reject(new Error('فك الضغط فشل: ' + err.message.split('\n')[0]));
    resolve(listMedia(dir));
  }));
}

function listMedia(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const t = typeOf(e.name); if (t !== 'other' && t !== 'zip') out.push({ path: p, name: e.name, type: t, size: fs.statSync(p).size }); }
    }
  })(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { kindOf, direct, dropboxIsFolder, gdriveId, nameFromDisposition, nameFromUrl, typeOf, safeName, head, probeRemote, rangeArgs, downloadRange, frameAt, previewArgs, previewClip, outName, extract, listMedia };

'use strict';
// تحميل فيديوهات من يوتيوب/إنستجرام/تيك توك/بنترست/X… بـ yt-dlp: تختار الجودة وجزء معيّن (بداية/نهاية) ويتحط على التايملين.
// ملحوظة: نزّل بس المحتوى اللي عندك حق تستخدمه.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PLATFORMS = [
  ['youtube', /(^|\.)youtube\.com|youtu\.be/i, 'يوتيوب'],
  ['instagram', /(^|\.)instagram\.com/i, 'إنستجرام'],
  ['tiktok', /(^|\.)tiktok\.com/i, 'تيك توك'],
  ['pinterest', /(^|\.)pinterest\.[a-z.]+|pin\.it/i, 'بنترست'],
  ['x', /(^|\.)(twitter|x)\.com/i, 'X'],
  ['facebook', /(^|\.)(facebook\.com|fb\.watch)/i, 'فيسبوك'],
  ['vimeo', /(^|\.)vimeo\.com/i, 'فيميو']
];

function platformOf(url) {
  let host = '';
  try { host = new URL(String(url).trim()).hostname; } catch (_) { return null; }
  const p = PLATFORMS.find(([, re]) => re.test(host));
  return p ? { id: p[0], label: p[2] } : { id: 'other', label: host };
}

const QUALITIES = [
  { id: 'best', label: 'أعلى جودة' }, { id: '2160', label: '4K' }, { id: '1440', label: '1440p' }, { id: '1080', label: '1080p' },
  { id: '720', label: '720p' }, { id: '480', label: '480p' }, { id: 'audio', label: 'صوت بس (MP3)' }
];

/** "1:23" / "83" / "00:01:23.5" → seconds (null when empty) */
function parseTime(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v >= 0 ? v : null;
  const parts = String(v).trim().split(':').map(Number);
  if (parts.some(x => !isFinite(x))) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

/** yt-dlp arguments (pure — tested without the network). */
function buildArgs({ url, quality = '1080', start, end, outDir, ffmpeg, name }) {
  const args = ['--no-playlist', '--newline', '--no-colors', '--windows-filenames', '--no-mtime', '--progress',
    '--progress-template', 'download:EFPROG %(progress._percent_str)s %(progress._speed_str)s',
    '--no-simulate', '--print', 'after_move:EFFILE %(filepath)s'];
  if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);
  if (quality === 'audio') args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3');
  else {
    const h = /^\d+$/.test(String(quality)) ? +quality : 0;
    args.push('-f', h ? `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b` : 'bv*+ba/b');
    // H.264 + AAC first: Premiere opens it everywhere (AV1/VP9 can fail on older versions)
    args.push('-S', 'vcodec:h264,res,acodec:m4a', '--merge-output-format', 'mp4');
  }
  const a = parseTime(start), b = parseTime(end);
  if (a !== null || b !== null) {
    args.push('--download-sections', `*${a === null ? 0 : a}-${b === null ? 'inf' : b}`, '--force-keyframes-at-cuts');
  }
  const base = name ? String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) : '%(title).80B [%(id)s]';
  const suffix = a !== null || b !== null ? `-${a || 0}-${b === null ? 'end' : b}` : '';
  args.push('-o', path.join(outDir, `${base}${suffix}.%(ext)s`));
  args.push(String(url).trim());
  return args;
}

function runJson(bin, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error('yt-dlp: ' + (String(stderr || err.message).trim().split('\n').pop() || 'فشل')));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('yt-dlp رجّع رد مش مفهوم')); }
    });
  });
}

/** Title, length, thumbnail, available heights. */
async function info(bin, url) {
  if (!bin) throw new Error('محتاج yt-dlp على الجهاز (المثبّت بيثبّته) أو حدد مكانه من الإعدادات.');
  const j = await runJson(bin, ['-J', '--no-playlist', '--no-warnings', String(url).trim()]);
  const heights = Array.from(new Set((j.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height))).sort((a, b) => b - a);
  return { id: j.id, title: j.title || j.id, duration: j.duration || null, thumbnail: j.thumbnail || null, uploader: j.uploader || j.channel || '', heights, platform: platformOf(url), extractor: j.extractor_key || j.extractor };
}

/** Download with progress → { file }. */
function download(bin, opts, onProgress) {
  if (!bin) return Promise.reject(new Error('محتاج yt-dlp على الجهاز (المثبّت بيثبّته) أو حدد مكانه من الإعدادات.'));
  fs.mkdirSync(opts.outDir, { recursive: true });
  const args = buildArgs(opts);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let file = null, err = '', buf = '';
    const line = l => {
      const p = /EFPROG\s+([\d.]+)%/.exec(l); if (p && onProgress) onProgress(Math.min(1, +p[1] / 100));
      const f = /EFFILE\s+(.+)$/.exec(l); if (f) file = f[1].trim();
    };
    child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (buf) line(buf);
      if (code === 0 && file && fs.existsSync(file)) resolve({ file });
      else reject(new Error('التحميل فشل: ' + (err.trim().split('\n').filter(x => /ERROR/.test(x)).pop() || err.trim().split('\n').pop() || 'exit ' + code)));
    });
  });
}

module.exports = { PLATFORMS, QUALITIES, platformOf, parseTime, buildArgs, info, download };

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
  ['vimeo', /(^|\.)vimeo\.com/i, 'فيميو'],
  ['dropbox', /(^|\.)(dropbox\.com|dropboxusercontent\.com)$|^db\.tt$/i, 'دروبوكس'],
  ['gdrive', /^(drive|docs|drive\.usercontent)\.google\.com$/i, 'جوجل درايف']
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
  const t = String(v).trim();
  // "1.30" typed as minutes.seconds (two digits after the dot, under 60) → 1:30
  const ms = /^(\d+)\.(\d{2})$/.exec(t);
  if (ms && +ms[2] < 60) return +ms[1] * 60 + +ms[2];
  const parts = t.split(':').map(Number);
  if (parts.some(x => !isFinite(x))) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

/** the official standalone build for this OS (no Python, no Homebrew needed) */
function assetName(platform = process.platform) { return platform === 'darwin' ? 'yt-dlp_macos' : platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp_linux'; }
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
function managedPath(dataDir, platform = process.platform) { return path.join(dataDir, 'bin', assetName(platform)); }

/** download (or replace with the latest) the standalone yt-dlp into the extension's data folder */
async function installManaged(dataDir, { fetchImpl, onProgress } = {}) {
  const fetch = fetchImpl || require('./http').nodeFetch;
  const out = managedPath(dataDir);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.new';
  const r = await fetch(RELEASE_URL + assetName(), { toFile: tmp, onProgress, timeout: 300000 });
  if (!r.ok) throw new Error('مقدرتش أنزّل yt-dlp من GitHub (' + r.status + ')');
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, out);
  if (process.platform === 'darwin') { try { require('child_process').execFileSync('xattr', ['-d', 'com.apple.quarantine', out], { stdio: 'ignore' }); } catch (_) {} }
  return { file: out, version: await version(out).catch(() => '') };
}

function version(bin) {
  return new Promise((resolve, reject) => execFile(bin, ['--version'], { timeout: 30000, windowsHide: true }, (err, so) => (err ? reject(err) : resolve(String(so).trim()))));
}
/** how many days old a yt-dlp version ("2026.03.17") is — sites change often, old builds start failing with 403 */
function ageDays(ver, now = Date.now()) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(ver || '');
  return m ? Math.floor((now - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5) : Infinity;
}
/** a YouTube 403 often goes away with another player client and the up-to-date challenge solver */
function youtubeRetryArgs(ver) {
  return ['--extractor-args', 'youtube:player_client=tv,web_safari,mweb', ...(needsJsRuntime(ver) ? ['--remote-components', 'ejs:github'] : [])];
}
/** yt-dlp ≥ 2025.11 solves YouTube's JS challenges with an outside runtime (deno, or node) */
function needsJsRuntime(ver) { const m = /^(\d{4})\.(\d{2})/.exec(ver || ''); return !!m && (+m[1] > 2025 || (+m[1] === 2025 && +m[2] >= 11)); }

/** turn yt-dlp's last ERROR line into what to do, in Arabic */
/** the site asks to be logged in (YouTube "not a bot", Instagram/TikTok/X/Facebook login walls) */
function needsLogin(msg) { return /Sign in to confirm|not a bot|cookies|login required|log in|rate-limit|Requested content is not available|Restricted Video|empty media response|authentication|This content isn.t available|use --cookies/i.test(String(msg || '')); }

function friendlyError(msg, site) {
  const m = String(msg || ''), who = site || 'الموقع';
  if (needsLogin(m)) return `${who} طالب تسجيل دخول. افتح ${who} في Chrome أو Safari وسجّل دخول، وبعدين اختار المتصفح ده في "كوكيز المتصفح" فوق وجرّب تاني.`;
  if (/Private video|members-only|This video is private/i.test(m)) return 'الفيديو خاص أو للأعضاء بس — لازم كوكيز حساب عنده صلاحية (من الإعدادات).';
  if (/Video unavailable|has been removed|not available in your country/i.test(m)) return 'الفيديو مش متاح (اتشال أو مقفول في بلدك).';
  if (/Unsupported URL/i.test(m)) return 'اللينك ده مش مدعوم — اتأكد إنه لينك الفيديو نفسه مش صفحة.';
  if (/HTTP Error 403|Forbidden/i.test(m)) return 'الموقع رفض التحميل (403). دوس "حدّث yt-dlp" وجرّب تاني — غالبًا الموقع غيّر حاجة ونسخة أحدث بتحلها.';
  if (/JavaScript|js runtime|challenge|n challenge|nsig|EJS/i.test(m)) return 'يوتيوب محتاج برنامج JavaScript (deno أو node) عشان التحميل. دوس "حدّث yt-dlp"، ولو فضلت المشكلة ثبّت deno: افتح Terminal واكتب brew install deno';
  if (/ffmpeg|ffprobe/i.test(m) && /not found|not installed|exited/i.test(m)) return 'المشكلة في ffmpeg أثناء الدمج أو القص: ' + m.slice(-160);
  if (/Requested format is not available/i.test(m)) return 'الجودة دي مش موجودة للفيديو ده — اختار جودة تانية أو "أعلى جودة".';
  if (/proxy|Tunnel connection failed|CONNECT tunnel/i.test(m)) return 'مش قادر يوصل للموقع (بروكسي أو VPN بيمنع، أو النت) — جرّب من غير VPN.';
  if (/timed out|Connection reset|Unable to download|getaddrinfo/i.test(m)) return 'النت فصل أو بطيء أثناء التحميل — جرّب تاني.';
  return m;
}

function siteOf(args) { const u = args[args.length - 1]; const p = platformOf(u); return p && p.id !== 'other' ? p.label : null; }

/** the browsers on this Mac whose login yt-dlp can borrow, most likely first */
function installedBrowsers(platform = process.platform) {
  if (platform !== 'darwin') return ['chrome', 'firefox', 'edge', 'brave'];
  const apps = [['chrome', 'Google Chrome.app'], ['brave', 'Brave Browser.app'], ['edge', 'Microsoft Edge.app'], ['firefox', 'Firefox.app'], ['safari', 'Safari.app']];
  const home = require('os').homedir();
  return apps.filter(([id, app]) => id === 'safari' || fs.existsSync(path.join('/Applications', app)) || fs.existsSync(path.join(home, 'Applications', app))).map(([id]) => id);
}

/** yt-dlp arguments (pure — tested without the network). */
function buildArgs({ url, quality = '1080', start, end, outDir, ffmpeg, name, sections = true, jsRuntime, cookiesFrom, simple = false, extra = [] }) {
  const args = ['--no-playlist', '--newline', '--no-colors', '--windows-filenames', '--no-mtime', '--progress',
    '--progress-template', 'download:EFPROG %(progress._percent_str)s %(progress._speed_str)s',
    '--no-simulate', '--print', 'after_move:EFFILE %(filepath)s', ...extra];
  if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);
  if (jsRuntime) args.push('--js-runtimes', jsRuntime);
  if (cookiesFrom) args.push('--cookies-from-browser', cookiesFrom);
  if (quality === 'audio') args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3');
  else if (simple || !ffmpeg) {
    // no ffmpeg (or merging failed): one ready-made file with picture + sound, no merge step
    const h = /^\d+$/.test(String(quality)) ? +quality : 0;
    args.push('-f', h ? `b[height<=${h}][ext=mp4]/b[height<=${h}]/b[ext=mp4]/b` : 'b[ext=mp4]/b');
  } else {
    const h = /^\d+$/.test(String(quality)) ? +quality : 0;
    args.push('-f', h ? `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b` : 'bv*+ba/b');
    // H.264 + AAC first: Premiere opens it everywhere (AV1/VP9 can fail on older versions)
    args.push('-S', 'vcodec:h264,res,acodec:m4a', '--merge-output-format', 'mp4');
  }
  const a = sections ? parseTime(start) : null, b = sections ? parseTime(end) : null;
  if (a !== null || b !== null) {
    args.push('--download-sections', `*${a === null ? 0 : a}-${b === null ? 'inf' : b}`, '--force-keyframes-at-cuts');
  }
  const base = name ? String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) : '%(title).80B [%(id)s]';
  const suffix = a !== null || b !== null ? `-${a || 0}-${b === null ? 'end' : b}` : '';
  args.push('-o', path.join(outDir, `${base}${suffix}.%(ext)s`));
  args.push(String(url).trim());
  return args;
}

function runJson(bin, args, timeout = 150000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || err.message).trim().split('\n');
        const last = lines.filter(x => /ERROR/.test(x)).pop() || lines.pop() || 'فشل';
        const raw = last.replace(/^ERROR:\s*/, '');
        const e2 = new Error(err.killed ? 'yt-dlp خد وقت أكتر من اللازم — النت بطيء أو الموقع مش بيرد' : friendlyError(raw, siteOf(args)));
        e2.raw = raw; e2.login = needsLogin(raw);
        return reject(e2);
      }
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('yt-dlp رجّع رد مش مفهوم')); }
    });
  });
}

/** Title, length, thumbnail, available heights. */
async function info(bin, url, { jsRuntime, cookiesFrom } = {}) {
  if (!bin) throw new Error('yt-dlp مش متثبّت — دوس "ثبّت yt-dlp" فوق.');
  const extra = [...(jsRuntime ? ['--js-runtimes', jsRuntime] : []), ...(cookiesFrom ? ['--cookies-from-browser', cookiesFrom] : [])];
  const j = await runJson(bin, ['-J', '--no-playlist', '--no-warnings', ...extra, String(url).trim()]);
  const heights = Array.from(new Set((j.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height))).sort((a, b) => b - a);
  return { id: j.id, title: j.title || j.id, duration: j.duration || null, thumbnail: j.thumbnail || null, uploader: j.uploader || j.channel || '', heights, platform: platformOf(url), extractor: j.extractor_key || j.extractor };
}

/** a direct link to a ready-made (picture + sound in one) stream, small enough to play in the panel */
function streamUrl(bin, url, { jsRuntime, cookiesFrom } = {}) {
  if (!bin) return Promise.reject(new Error('yt-dlp مش متثبّت'));
  const args = ['-g', '--no-playlist', '--no-warnings', '-f', 'b[ext=mp4][height<=720]/b[height<=720]/b[ext=mp4]/b',
    ...(jsRuntime ? ['--js-runtimes', jsRuntime] : []), ...(cookiesFrom ? ['--cookies-from-browser', cookiesFrom] : []), String(url).trim()];
  return new Promise((resolve, reject) => execFile(bin, args, { timeout: 90000, windowsHide: true }, (err, so, se) => {
    const first = String(so || '').trim().split('\n')[0];
    if (err || !/^https?:/.test(first)) {
      const raw = String(se || (err && err.message) || '').trim().split('\n').filter(x => /ERROR/.test(x)).pop() || 'no stream';
      const e = new Error('البريفيو مش متاح للينك ده: ' + friendlyError(raw.replace(/^ERROR:\s*/, ''), siteOf(args))); e.raw = raw; e.login = needsLogin(raw); return reject(e);
    }
    resolve(first);
  }));
}

/** Cut [start, end] out of a downloaded file exactly (frame-accurate re-encode). */
function trim(ffmpeg, file, { start, end, audioOnly, out, onChild }) {
  const a = parseTime(start) || 0, b = parseTime(end);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(a), '-i', file];
  if (b !== null && b > a) args.push('-t', String(b - a));
  if (audioOnly) args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  args.push(out);
  return new Promise((resolve, reject) => { const ch = execFile(ffmpeg, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, so, se) => (err ? reject(new Error('القص فشل: ' + String(se || err.message).trim().split('\n').pop())) : resolve({ file: out }))); if (onChild) onChild(ch); });
}

/** Download with progress → { file }. */
function download(bin, opts, onProgress) {
  if (!bin) return Promise.reject(new Error('yt-dlp مش متثبّت — دوس "ثبّت yt-dlp" فوق.'));
  fs.mkdirSync(opts.outDir, { recursive: true });
  const args = buildArgs(opts);
  return new Promise((resolve, reject) => {
    // its own process group: stopping it also stops the ffmpeg it started
    const child = spawn(bin, args, { windowsHide: true, detached: process.platform !== 'win32' });
    child.efGroup = process.platform !== 'win32';
    if (opts.onChild) opts.onChild(child); // so the panel's stop button can end it
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
      else {
        const last = (err.trim().split('\n').filter(x => /ERROR/.test(x)).pop() || err.trim().split('\n').pop() || 'exit ' + code).replace(/^ERROR:\s*/, '');
        const e = new Error('التحميل فشل: ' + friendlyError(last, siteOf(args))); e.raw = last; e.login = needsLogin(last); reject(e);
      }
    });
  });
}

module.exports = { PLATFORMS, QUALITIES, platformOf, parseTime, buildArgs, info, download, trim, streamUrl, assetName, managedPath, installManaged, version, needsJsRuntime, friendlyError, RELEASE_URL, ageDays, youtubeRetryArgs, needsLogin, installedBrowsers };

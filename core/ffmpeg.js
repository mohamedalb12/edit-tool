'use strict';
// تشغيل ffmpeg / ffprobe / whisper محليًا على الجهاز.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const EXT = IS_WIN ? '.exe' : '';

const COMMON_DIRS = IS_WIN
  ? ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin', 'C:\\whisper', 'C:\\whisper.cpp', path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')]
  : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin'];

function exists(p) { try { return !!p && fs.statSync(p).isFile(); } catch (_) { return false; } }

function findOnPath(name) {
  try {
    const out = execFileSync(IS_WIN ? 'where' : 'which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find(Boolean);
    return exists(first) ? first : null;
  } catch (_) { return null; }
}

/** Find a binary: configured path → extension bin/ folder → PATH → common install dirs. */
function findBinary(names, configured, extraDirs = []) {
  if (configured && exists(configured)) return configured;
  const list = Array.isArray(names) ? names : [names];
  const bundled = path.join(__dirname, '..', 'bin');
  for (const n of list) {
    for (const d of [bundled, ...extraDirs]) { const p = path.join(d, n + EXT); if (exists(p)) return p; }
    const onPath = findOnPath(n);
    if (onPath) return onPath;
    for (const d of COMMON_DIRS) { const p = path.join(d, n + EXT); if (exists(p)) return p; }
  }
  return null;
}

function resolveTools(settings = {}) {
  const p = settings.paths || {};
  const ffmpeg = findBinary('ffmpeg', p.ffmpeg);
  const ffprobe = findBinary('ffprobe', p.ffprobe, ffmpeg ? [path.dirname(ffmpeg)] : []);
  const whisper = findBinary(['whisper-cli', 'whisper-cpp', 'main', 'whisper'], p.whisper);
  return { ffmpeg, ffprobe, whisper };
}

function requireTool(bin, label) {
  if (!bin) throw new Error(`مش لاقي ${label} على الجهاز. نزّله أو حدد مكانه من الإعدادات.`);
  return bin;
}

/** Run a process and collect output. Rejects on non-zero exit. */
function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, ...opts.spawn });
    const out = [], err = [];
    child.stdout.on('data', d => { out.push(d); if (opts.onStdout) opts.onStdout(d); });
    child.stderr.on('data', d => { err.push(d); if (opts.onStderr) opts.onStderr(String(d)); });
    if (opts.input) { child.stdin.end(opts.input); }
    child.on('error', reject);
    child.on('close', code => {
      const res = { code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') };
      if (code !== 0 && !opts.allowFail) {
        const e = new Error(`${path.basename(bin)} خرج بكود ${code}: ${res.stderr.slice(-600)}`);
        e.result = res; return reject(e);
      }
      resolve(res);
    });
  });
}

/** Decode audio to mono Float32 PCM. */
async function decodePCM(ffmpeg, file, { rate = 16000, start = 0, duration = 0 } = {}) {
  const args = ['-hide_banner', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration > 0) args.push('-t', String(duration));
  args.push('-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-');
  const { stdout } = await run(ffmpeg, args);
  const buf = Buffer.from(stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
}

async function probe(ffprobe, file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(stdout.toString('utf8'));
  const v = (j.streams || []).find(s => s.codec_type === 'video');
  const a = (j.streams || []).find(s => s.codec_type === 'audio');
  const pix = (v && v.pix_fmt) || '';
  return {
    duration: parseFloat((j.format && j.format.duration) || (v && v.duration) || (a && a.duration) || 0) || 0,
    hasVideo: !!v, hasAudio: !!a,
    width: v ? v.width : 0, height: v ? v.height : 0,
    alpha: /yuva|rgba|argb|bgra|abgr|gbrap|ya8|ya16/.test(pix),
    codec: v ? v.codec_name : (a ? a.codec_name : ''),
    pixFmt: pix
  };
}

/** Convert any media to 16k mono wav (what whisper.cpp wants). */
async function toWav16k(ffmpeg, file, out, { start = 0, duration = 0 } = {}) {
  const args = ['-hide_banner', '-nostdin', '-y'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration > 0) args.push('-t', String(duration));
  args.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out);
  await run(ffmpeg, args);
  return out;
}

module.exports = { findBinary, resolveTools, requireTool, run, decodePCM, probe, toWav16k, IS_WIN };

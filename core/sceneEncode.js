'use strict';
// يستقبل فريمات PNG من اللوحة ويكتبها فيديو بـ ffmpeg (ProRes 4444 بشفافية أو H.264).
const { spawn } = require('child_process');

function encoderArgs({ fps, out, transparent }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
  if (transparent) args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0');
  else args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  args.push(out);
  return args;
}

function startEncoder(ffmpeg, opts) {
  const child = spawn(ffmpeg, encoderArgs(opts), { windowsHide: true });
  let err = '';
  child.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(opts.out) : reject(new Error('ffmpeg encode: ' + err.slice(-500))));
  });
  return {
    write(b64OrBuf) {
      const buf = Buffer.isBuffer(b64OrBuf) ? b64OrBuf : Buffer.from(b64OrBuf, 'base64');
      return new Promise(res => { if (child.stdin.write(buf)) res(); else child.stdin.once('drain', res); });
    },
    end() { child.stdin.end(); return done; }
  };
}

module.exports = { encoderArgs, startEncoder };

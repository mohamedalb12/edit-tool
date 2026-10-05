'use strict';
// قراءة فريمات الفيديو (RGBA) وكتابة طبقة الزجاج (ProRes 4444 بشفافية) — بـ ffmpeg على الجهاز.
const { spawn } = require('child_process');

/** Decode [start, start+duration] of a media file to RGBA frames of W×H at fps; awaits onFrame for back-pressure. */
function decodeFrames(ffmpeg, { mediaPath, start = 0, duration, width, height, fps, still = /\.(png|jpe?g|webp|bmp|tiff?|gif|psd)$/i.test(mediaPath) }, onFrame) {
  return new Promise((resolve, reject) => {
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=rgba`;
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (still) args.push('-loop', '1', '-framerate', String(fps));   // a still image → repeat it for the whole duration
    else if (start > 0) args.push('-ss', String(start));
    args.push('-i', mediaPath);
    if (duration) args.push('-t', String(duration));
    args.push('-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-');
    const child = spawn(ffmpeg, args, { windowsHide: true });
    const size = width * height * 4;
    let pending = Buffer.alloc(0), index = 0, err = '', chain = Promise.resolve(), failed = null;
    child.stderr.on('data', d => { err += d; });
    child.stdout.on('data', chunk => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= size) {
        const frame = Buffer.from(pending.subarray(0, size)); pending = pending.subarray(size);
        const i = index++;
        child.stdout.pause();
        chain = chain.then(() => onFrame(frame, i)).catch(e => { failed = e; child.kill(); }).then(() => child.stdout.resume());
      }
    });
    child.on('error', reject);
    child.on('close', code => chain.then(() => {
      if (failed) return reject(failed);
      if (code !== 0 && !index) return reject(new Error('ffmpeg decode: ' + err.slice(-400)));
      resolve({ frames: index });
    }));
  });
}

/** Raw RGBA frames in → ProRes 4444 with alpha out. */
function startRawEncoder(ffmpeg, { width, height, fps, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', '-',
    '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', out];
  const child = spawn(ffmpeg, args, { windowsHide: true });
  let err = '';
  child.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error('ffmpeg encode: ' + err.slice(-400))));
  });
  return {
    write(buf) { const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength); return new Promise(r => { if (child.stdin.write(Buffer.from(b))) r(); else child.stdin.once('drain', r); }); },
    end() { child.stdin.end(); return done; }
  };
}

module.exports = { decodeFrames, startRawEncoder };

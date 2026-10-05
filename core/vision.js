'use strict';
// عين المونتير الذكي: كشف اللقطات (أوفلاين) + صور فريمات تتبعت لموديل بيشوف صور.
const { run } = require('./ffmpeg');

/** Shot boundaries (source time) via ffmpeg scene detection. */
async function detectShots(ffmpeg, file, { start = 0, duration = 0, threshold = 0.32 } = {}) {
  const args = ['-hide_banner', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration > 0) args.push('-t', String(duration));
  args.push('-an', '-vf', `scale=320:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-');
  const { stderr } = await run(ffmpeg, args, { allowFail: true });
  const cuts = [];
  for (const m of stderr.matchAll(/pts_time:\s*([\d.]+)/g)) cuts.push(+(+m[1] + start).toFixed(3));
  const end = duration > 0 ? start + duration : Infinity;
  return cuts.filter((t, i) => t > start && t < end && (i === 0 || t - cuts[i - 1] > 0.4));
}

/** One JPEG (base64) of `file` at source time `t`. */
async function frameJpeg(ffmpeg, file, t, { width = 512, still = /\.(png|jpe?g|webp|bmp|tiff?|gif|psd)$/i.test(file) } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (!still && t > 0) args.push('-ss', String(t));
  args.push('-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-');
  const { stdout } = await run(ffmpeg, args);
  return Buffer.from(stdout).toString('base64');
}

/** Message content for an OpenAI/OpenRouter vision request. */
function imageMessage(frames, intro) {
  return {
    role: 'user',
    content: [{ type: 'text', text: intro || ('الصور اللي طلبتها بالترتيب: ' + frames.map((f, i) => `#${i + 1} عند ${f.label || f.time.toFixed(1) + 's'}`).join('، ')) }]
      .concat(frames.map(f => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + f.b64 } })))
  };
}

module.exports = { detectShots, frameJpeg, imageMessage };

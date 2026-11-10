'use strict';
// HDR → SDR: فيديو متصوّر HDR (موبايل / كاميرا: HLG أو PQ / Dolby Vision) يبقى Rec.709 عادي بنفس الألوان والتفاصيل،
// من غير ما يطلع باهت ولا محروق. التحويل بـ ffmpeg على الجهاز: الصورة بتتحوّل لضوء خطي، الهايلايتس بتتضغط بـ tone map
// (مش بتتقص)، الألوان من BT.2020 لـ BT.709، وبعدين 10-bit ProRes (أو HEVC / H.264) بنفس المقاس والفريمات والصوت.
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');

const LOOKS = {
  // measured on a known picture taken to HLG / PQ and back: natural is ~13/255 off the original (a plain round trip with no tone map ~10), the untouched HDR ~75–95
  natural: { label: 'طبيعي (زي ما اتصوّر)', algo: 'mobius', param: 0.8 }, // everything under SDR white as shot, only the highlights roll off
  soft: { label: 'هايلايت أنعم', algo: 'mobius', param: 0.5 },             // more room for bright skies / windows
  filmic: { label: 'سينمائي (أغمق)', algo: 'hable', param: null }          // the filmic curve: darker, more contrast
};
const CODECS = {
  prores: { label: 'ProRes 422 HQ (أعلى جودة للمونتاج)', ext: '.mov', args: ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le'] },
  hevc: { label: 'HEVC 10-bit (حجم أصغر)', ext: '.mp4', args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'] },
  h264: { label: 'H.264 (يشتغل في أي حتة)', ext: '.mp4', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p'] }
};

/** what kind of HDR a file is → { hdr: 'pq'|'hlg'|null, label, dolbyVision, primaries, transfer, bits, width, height, duration, fps } */
async function info(ffprobe, file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-select_streams', 'v:0', file]);
  const j = JSON.parse(stdout.toString('utf8')), v = (j.streams || [])[0] || {};
  const trc = String(v.color_transfer || ''), prim = String(v.color_primaries || '');
  const side = (v.side_data_list || []).map(s => String(s.side_data_type || ''));
  const dv = side.some(s => /dovi|dolby/i.test(s)) || /dvh1|dvhe/.test(String(v.codec_tag_string || ''));
  const hdr = /smpte2084/.test(trc) ? 'pq' : /arib-std-b67/.test(trc) ? 'hlg' : (dv ? 'pq' : null);
  const bits = +(String(v.pix_fmt || '').match(/p(\d+)/) || [0, 8])[1] || 8;
  const fr = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/');
  return {
    hdr, dolbyVision: dv, transfer: trc || null, primaries: prim || null, bits,
    label: hdr ? (dv ? 'Dolby Vision' : hdr === 'hlg' ? 'HDR (HLG)' : 'HDR10 (PQ)') : 'SDR',
    width: v.width || 0, height: v.height || 0, fps: +fr[1] ? +(fr[0] / fr[1]).toFixed(3) : 0,
    duration: parseFloat((j.format && j.format.duration) || v.duration || 0) || 0
  };
}

/** does this ffmpeg have the filters a real tone map needs? */
async function capable(ffmpeg) {
  try { const { stdout } = await run(ffmpeg, ['-hide_banner', '-filters']); const t = stdout.toString(); return / zscale /.test(t) && / tonemap /.test(t); } catch (_) { return false; }
}

/**
 * The filter chain. kind: 'pq' | 'hlg' · look: LOOKS key · brightness: stops (+ = brighter, −1…+1) · saturation: 0.8–1.3
 * Linear light at a reference white of `npl` nits → tone map (highlights compressed, not clipped; colours not desaturated)
 * → BT.709 primaries and gamma, limited range, error-diffusion dither (no banding).
 */
function filterChain({ kind = 'hlg', look = 'natural', brightness = 0, saturation = 1, outPix = 'yuv422p10le' } = {}) {
  const L = LOOKS[look] || LOOKS.natural;
  const npl = Math.round(100 / Math.pow(2, Math.max(-1.5, Math.min(1.5, +brightness || 0))));
  const tin = kind === 'pq' ? 'smpte2084' : 'arib-std-b67';
  const tm = 'tonemap=' + L.algo + (L.param !== null ? ':param=' + L.param : '') + ':desat=0';
  const sat = Math.abs((+saturation || 1) - 1) > 0.005 ? ',eq=saturation=' + (+saturation).toFixed(2) : '';
  return `zscale=tin=${tin}:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=${npl},format=gbrpf32le,zscale=p=bt709,${tm},zscale=t=bt709:m=bt709:r=tv:d=error_diffusion,format=${outPix}${sat}`;
}
const colorTags = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

/** where the SDR copy goes: next to the original (…_SDR.mov), or the cache when that folder isn't writable */
function outPath(file, codec = 'prores', dir) {
  const ext = (CODECS[codec] || CODECS.prores).ext, name = path.basename(file, path.extname(file)) + '_SDR' + ext;
  let d = dir || path.dirname(file);
  try { fs.accessSync(d, fs.constants.W_OK); } catch (_) { d = require('./config').cacheDir('sdr'); }
  return path.join(d, name);
}

/** one HDR file → an SDR file (same size, frame rate and audio). → { out, info } */
async function convert({ ffmpeg, ffprobe, file, out, codec = 'prores', look = 'natural', brightness = 0, saturation = 1, onProgress }) {
  if (!(await capable(ffmpeg))) throw new Error('الـ ffmpeg اللي عندك مافيهوش zscale (اللي بيحوّل الـ HDR صح) — نزّل ffmpeg من Homebrew: brew install ffmpeg، وبعدين حط مكانه في الإعدادات');
  const inf = await info(ffprobe, file);
  if (!inf.hdr) throw new Error(path.basename(file) + ' مش HDR أصلًا (' + (inf.transfer || 'SDR') + ') — مش محتاج تحويل');
  const C = CODECS[codec] || CODECS.prores;
  out = out || outPath(file, codec);
  const outPix = codec === 'prores' ? 'yuv422p10le' : codec === 'hevc' ? 'yuv420p10le' : 'yuv420p';
  const args = ['-hide_banner', '-nostdin', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0',
    '-vf', filterChain({ kind: inf.hdr, look, brightness, saturation, outPix })].concat(C.args, colorTags,
    ['-c:a', codec === 'prores' ? 'pcm_s16le' : 'aac', '-b:a', '320k', '-progress', 'pipe:2', '-nostats', out]);
  await run(ffmpeg, args, { onStderr: s => { const m = /out_time_(?:us|ms)=(\d+)/.exec(s); if (m && onProgress && inf.duration) onProgress(Math.min(1, +m[1] / 1e6 / inf.duration)); } });
  if (!fs.existsSync(out) || fs.statSync(out).size < 1000) throw new Error('التحويل ماطلعش ملف');
  return { out, info: inf };
}

/** one frame before/after (base64 jpg): 'after' = the SDR result, 'naive' = what the clip looks like without a tone map */
async function preview({ ffmpeg, ffprobe, file, t = 1, look = 'natural', brightness = 0, saturation = 1, width = 640 }) {
  const inf = await info(ffprobe, file);
  if (!inf.hdr) throw new Error('الملف ده مش HDR');
  const at = Math.max(0, Math.min(t, Math.max(0, inf.duration - 0.1)));
  const grab = async vf => Buffer.from((await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', vf + `,scale=${width}:-2`, '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'])).stdout).toString('base64');
  return {
    info: inf,
    after: await grab(filterChain({ kind: inf.hdr, look, brightness, saturation, outPix: 'yuv420p' })),
    naive: await grab('format=yuv420p')
  };
}

module.exports = { info, capable, filterChain, convert, preview, outPath, LOOKS, CODECS };

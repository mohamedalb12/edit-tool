'use strict';
// HDR → SDR (BT.2100 → BT.709): فيديو متصوّر HDR (موبايل / كاميرا: HLG أو PQ / Dolby Vision) يبقى Rec.709 عادي بنفس الألوان والتفاصيل،
// من غير ما يطلع باهت ولا محروق. التحويل بـ ffmpeg على الجهاز: الصورة بتتحوّل لضوء خطي، الهايلايتس بتتضغط بـ tone map
// (مش بتتقص)، الألوان من BT.2020 لـ BT.709 — كله محسوب في 3D LUT بيشتغل على أي ffmpeg، وبعدين 10-bit ProRes (أو HEVC / H.264) بنفس المقاس والفريمات والصوت.
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

/**
 * which way this ffmpeg can do it → 'lut' (our 3D LUT: any ffmpeg, BT.2100 maths) · 'zscale' (zimg; only when there's no
 * lut3d) · null. The LUT is the default everywhere so every machine gets the same picture — and zimg applies the HLG
 * system gamma to each channel instead of to the luminance (BT.2100), which pushes the saturation up.
 */
async function capable(ffmpeg) {
  try {
    const { stdout } = await run(ffmpeg, ['-hide_banner', '-filters']); const t = stdout.toString();
    return / lut3d /.test(t) ? 'lut' : / zscale /.test(t) && / tonemap /.test(t) ? 'zscale' : null;
  } catch (_) { return null; }
}

/* ---------- the same conversion as math, baked into a 3D LUT (for ffmpeg builds without zimg, e.g. the static Mac ones) ---------- */
const HLG = { a: 0.17883277, b: 0.28466892, c: 0.55991073 };
const PQ = { m1: 2610 / 16384, m2: 2523 / 4096 * 128, c1: 3424 / 4096, c2: 2413 / 4096 * 32, c3: 2392 / 4096 * 32 };
const B2020_TO_709 = [[1.660491, -0.587641, -0.072850], [-0.124550, 1.132900, -0.008349], [-0.018151, -0.100579, 1.118730]];
/** HLG signal (BT.2100) → display light in nits, for a 1000-nit display (system gamma 1.2) */
function hlgToNits(r, g, b) {
  const inv = e => (e <= 0.5 ? e * e / 3 : (Math.exp((e - HLG.c) / HLG.a) + HLG.b) / 12);
  const R = inv(r), G = inv(g), B = inv(b), Ys = 0.2627 * R + 0.6780 * G + 0.0593 * B, k = 1000 * Math.pow(Math.max(Ys, 1e-9), 0.2);
  return [R * k, G * k, B * k];
}
/** PQ signal (SMPTE ST 2084) → nits */
function pqToNits(e) { const p = Math.pow(Math.max(e, 0), 1 / PQ.m2); return 10000 * Math.pow(Math.max(p - PQ.c1, 0) / (PQ.c2 - PQ.c3 * p), 1 / PQ.m1); }
/** ffmpeg's tonemap curves (vf_tonemap.c), on a signal where 1 = reference white */
function curve(algo, x, param, peak) {
  if (algo === 'mobius') {
    const j = param; if (x <= j) return x;
    const a = -j * j * (peak - 1) / (j * j - 2 * j + peak), b = (j * j - 2 * j * peak + peak) / Math.max(peak - 1, 1e-6);
    return (b * b + 2 * b * j + j * j) / (b - a) * (x + a) / (x + b);
  }
  if (algo === 'hable') { const h = v => (v * (v * 0.15 + 0.05) + 0.004) / (v * (v * 0.15 + 0.5) + 0.06) - 0.02 / 0.3; return h(x) / h(peak); }
  if (algo === 'reinhard') { const off = (1 - param) / param; return x / (x + off) * (peak + off) / peak; }
  return Math.min(x, 1);
}
const oetf709 = l => (l < 0.018 ? 4.5 * l : 1.099 * Math.pow(l, 0.45) - 0.099);
/** HDR R'G'B' (0–1, BT.2020) → SDR R'G'B' (0–1, BT.709): light → 709 primaries → tone map on the brightest channel (hue kept) → 709 gamma */
function mapPixel(kind, r, g, b, { algo, param, npl, peak }) {
  const n = kind === 'pq' ? [pqToNits(r), pqToNits(g), pqToNits(b)] : hlgToNits(r, g, b);
  const l = B2020_TO_709.map(m => (m[0] * n[0] + m[1] * n[1] + m[2] * n[2]) / npl);
  const sig = Math.max(l[0], l[1], l[2]);
  const k = sig > 1e-9 ? curve(algo, sig, param, peak) / sig : 1;
  return l.map(v => oetf709(Math.min(1, Math.max(0, v * k))));
}
/** a .cube 3D LUT of the whole conversion (size 65, ~4 MB) → file path (cached per settings) */
function cubeLut({ kind = 'hlg', look = 'natural', brightness = 0, size = 65, dir } = {}) {
  const L = LOOKS[look] || LOOKS.natural, npl = nplOf(brightness), peak = 1000 / npl;
  dir = dir || require('./config').cacheDir('luts');
  const file = path.join(dir, `hdr-${kind}-${look}-${npl}-${size}.cube`);
  if (fs.existsSync(file)) return file;
  const lines = ['TITLE "EditFast HDR to SDR"', 'LUT_3D_SIZE ' + size, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'], o = { algo: L.algo, param: L.param === null ? 0 : L.param, npl, peak };
  for (let bi = 0; bi < size; bi++) for (let gi = 0; gi < size; gi++) for (let ri = 0; ri < size; ri++) {
    const v = mapPixel(kind, ri / (size - 1), gi / (size - 1), bi / (size - 1), o);
    lines.push(v[0].toFixed(6) + ' ' + v[1].toFixed(6) + ' ' + v[2].toFixed(6));
  }
  fs.writeFileSync(file + '.tmp', lines.join('\n') + '\n'); fs.renameSync(file + '.tmp', file);
  return file;
}
const nplOf = brightness => Math.round(100 / Math.pow(2, Math.max(-1.5, Math.min(1.5, +brightness || 0))));
/** YUV (BT.2020, limited) → 16-bit R'G'B' → the LUT → YUV (BT.709, limited) */
function lutChain({ lut, saturation = 1, outPix = 'yuv422p10le' }) {
  // inside '…' a filter argument is literal (a Windows "C:", a space or a colon is fine); a path with a ' in it is copied
  // somewhere plain first (cubeLut keeps its LUTs in the cache, so this is only a user-picked folder)
  let f = String(lut).replace(/\\/g, '/');
  if (/'/.test(f)) { const safe = path.join(require('os').tmpdir(), 'editfast-' + path.basename(f).replace(/'/g, '_')); fs.copyFileSync(lut, safe); f = safe.replace(/\\/g, '/'); }
  const esc = f.replace(/:/g, '\\:'); // the option parser splits on ':' even inside the graph's quotes
  const sat = Math.abs((+saturation || 1) - 1) > 0.005 ? ',eq=saturation=' + (+saturation).toFixed(2) : '';
  return `scale=in_color_matrix=bt2020:in_range=tv:flags=accurate_rnd+full_chroma_int,format=gbrp16le,lut3d=file='${esc}':interp=tetrahedral,scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=${outPix}${sat}`;
}

/**
 * The filter chain. kind: 'pq' | 'hlg' · look: LOOKS key · brightness: stops (+ = brighter, −1…+1) · saturation: 0.8–1.3
 * Linear light at a reference white of `npl` nits → tone map (highlights compressed, not clipped; colours not desaturated)
 * → BT.709 primaries and gamma, limited range, error-diffusion dither (no banding).
 */
function filterChain({ kind = 'hlg', look = 'natural', brightness = 0, saturation = 1, outPix = 'yuv422p10le' } = {}) {
  const L = LOOKS[look] || LOOKS.natural;
  const npl = nplOf(brightness);
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
/** the -vf for this file: our LUT (any ffmpeg), zscale only on a build without lut3d — `way` forces one */
async function chainFor(ffmpeg, kind, { look, brightness, saturation, outPix, way }) {
  way = way || await capable(ffmpeg);
  if (!way) throw new Error('الـ ffmpeg اللي عندك مافيهوش lut3d ولا zscale — حدّثه من الإعدادات');
  return way === 'zscale' ? filterChain({ kind, look, brightness, saturation, outPix }) : lutChain({ lut: cubeLut({ kind, look, brightness }), saturation, outPix });
}

async function convert({ ffmpeg, ffprobe, file, out, codec = 'prores', look = 'natural', brightness = 0, saturation = 1, onProgress, way }) {
  const inf = await info(ffprobe, file);
  if (!inf.hdr) throw new Error(path.basename(file) + ' مش HDR أصلًا (' + (inf.transfer || 'SDR') + ') — مش محتاج تحويل');
  const C = CODECS[codec] || CODECS.prores;
  out = out || outPath(file, codec);
  const outPix = codec === 'prores' ? 'yuv422p10le' : codec === 'hevc' ? 'yuv420p10le' : 'yuv420p';
  const args = ['-hide_banner', '-nostdin', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0',
    '-vf', await chainFor(ffmpeg, inf.hdr, { look, brightness, saturation, outPix, way })].concat(C.args, colorTags,
    ['-c:a', codec === 'prores' ? 'pcm_s16le' : 'aac', '-b:a', '320k', '-progress', 'pipe:2', '-nostats', out]);
  await run(ffmpeg, args, { onStderr: s => { const m = /out_time_(?:us|ms)=(\d+)/.exec(s); if (m && onProgress && inf.duration) onProgress(Math.min(1, +m[1] / 1e6 / inf.duration)); } });
  if (!fs.existsSync(out) || fs.statSync(out).size < 1000) throw new Error('التحويل ماطلعش ملف');
  return { out, info: inf };
}

/** one frame before/after (base64 jpg): 'after' = the SDR result, 'naive' = what the clip looks like without a tone map */
async function preview({ ffmpeg, ffprobe, file, t = 1, look = 'natural', brightness = 0, saturation = 1, width = 640, way }) {
  const inf = await info(ffprobe, file);
  if (!inf.hdr) throw new Error('الملف ده مش HDR');
  const at = Math.max(0, Math.min(t, Math.max(0, inf.duration - 0.1)));
  const grab = async vf => Buffer.from((await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', vf + `,scale=${width}:-2`, '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'])).stdout).toString('base64');
  return {
    info: inf,
    after: await grab(await chainFor(ffmpeg, inf.hdr, { look, brightness, saturation, outPix: 'yuv420p', way })),
    naive: await grab('format=yuv420p')
  };
}

module.exports = { info, capable, filterChain, lutChain, cubeLut, mapPixel, convert, preview, outPath, LOOKS, CODECS };

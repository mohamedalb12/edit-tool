'use strict';
const { TMP, FFMPEG, FFPROBE } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('../../core/hdr');

// a known SDR picture, taken to HDR (HLG or PQ, BT.2020, 10-bit HEVC) the way a phone / camera records it
const SRC = path.join(TMP, 'sdr-src.mp4');
function makeSrc() { if (!fs.existsSync(SRC)) execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '10', '-shortest', SRC]); return SRC; }
// SDR → HDR by the BT.2100 maths (the exact inverse of what the tool does), baked into a LUT like a camera would record it
function encodeLut(kind) {
  const file = path.join(TMP, 'enc-' + kind + '.cube'), N = 33, M = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]];
  const lin = v => (v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45));
  const hlg = e => (e <= 1 / 12 ? Math.sqrt(3 * e) : 0.17883277 * Math.log(12 * e - 0.28466892) + 0.55991073);
  const pq = n => { const y = Math.pow(n / 10000, 2610 / 16384); return Math.pow((3424 / 4096 + 2413 / 4096 * 32 * y) / (1 + 2392 / 4096 * 32 * y), 2523 / 4096 * 128); };
  const out = ['LUT_3D_SIZE ' + N];
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const l = [r, g, b].map(v => lin(v / (N - 1)) * 100), F = M.map(m => m[0] * l[0] + m[1] * l[1] + m[2] * l[2]);
    let e;
    if (kind === 'pq') e = F.map(pq);
    else { const Yd = 0.2627 * F[0] + 0.6780 * F[1] + 0.0593 * F[2], Ys = Math.pow(Math.max(Yd, 1e-9) / 1000, 1 / 1.2), k = 1000 * Math.pow(Ys, 0.2); e = F.map(f => hlg(f / k)); }
    out.push(e.map(v => Math.min(1, Math.max(0, v)).toFixed(6)).join(' '));
  }
  fs.writeFileSync(file, out.join('\n') + '\n');
  return file;
}
function makeHdr(kind) {
  const trc = kind === 'pq' ? 'smpte2084' : 'arib-std-b67', out = path.join(TMP, 'hdr-' + kind + '.mov');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', makeSrc(), '-vf', `scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=gbrp16le,lut3d=file=${encodeLut(kind)}:interp=tetrahedral,scale=out_color_matrix=bt2020:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p10le`,
    '-c:v', 'libx265', '-crf', '8', '-x265-params', 'log-level=error', '-color_primaries', 'bt2020', '-color_trc', trc, '-colorspace', 'bt2020nc', '-c:a', 'aac', out]);
  return out;
}
const frame = f => execFileSync(FFMPEG, ['-loglevel', 'error', '-ss', '1', '-i', f, '-frames:v', '1', '-vf', 'scale=160:90,format=rgb24', '-f', 'rawvideo', '-']);
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

for (const kind of ['hlg', 'pq']) {
  test(`HDR (${kind}) → SDR keeps the colours: the result matches the original picture, the untouched HDR does not`, async t => {
    const hdr = makeHdr(kind);
    const i = await H.info(FFPROBE, hdr);
    assert.equal(i.hdr, kind); assert.equal(i.bits, 10); assert.equal(i.label, kind === 'hlg' ? 'HDR (HLG)' : 'HDR10 (PQ)');
    let last = 0;
    const r = await H.convert({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: hdr, codec: 'prores', onProgress: p => { last = p; } });
    assert.equal(r.out, path.join(TMP, 'hdr-' + kind + '_SDR.mov'));
    const ref = frame(SRC), got = diff(ref, frame(r.out)), naive = diff(ref, frame(hdr));
    t.diagnostic('mean |diff| vs the original: converted ' + got.toFixed(1) + ' · untouched HDR ' + naive.toFixed(1));
    assert.ok(got < 16, 'colours as shot: ' + got.toFixed(1));
    assert.ok(naive > 3 * got, 'the untouched HDR is far off: ' + naive.toFixed(1));
    const o = await H.info(FFPROBE, r.out);
    assert.equal(o.hdr, null); assert.equal(o.transfer, 'bt709'); assert.equal(o.primaries, 'bt709'); assert.equal(o.bits, 10);
    assert.equal(o.width, 640); assert.equal(o.fps, 25);
    const streams = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', r.out]).toString()).streams;
    assert.ok(streams.some(s => s.codec_type === 'audio'), 'the sound comes along');
    assert.ok(last > 0.5, 'progress reported');
  });
}

test('the LUT maths (BT.2100): HLG grey follows the standard, colours keep their hue, highlights roll off instead of clipping', () => {
  const o = { algo: 'mobius', param: 0.8, npl: 100, peak: 10 };
  const grey = H.mapPixel('hlg', 0.5, 0.5, 0.5, o); // HLG 0.5 → 50.7 nits on a 1000-nit display → SDR 0.507 linear
  assert.ok(Math.abs(grey[0] - (1.099 * Math.pow(0.507, 0.45) - 0.099)) < 0.002 && Math.abs(grey[0] - grey[2]) < 1e-5);
  const skin = H.mapPixel('hlg', 0.6, 0.48, 0.42, o);
  assert.ok(skin[0] > skin[1] && skin[1] > skin[2] && skin[0] < 1, 'a skin tone stays a skin tone');
  const hi = H.mapPixel('pq', 0.75, 0.75, 0.75, o), top = H.mapPixel('pq', 0.9, 0.9, 0.9, o);
  assert.ok(hi[0] < 1 && top[0] > hi[0] && top[0] <= 1, 'brighter stays brighter, under white');
});

test('looks and brightness change the curve; an SDR file is refused; previews come back as pictures', async () => {
  assert.match(H.filterChain({ kind: 'pq' }), /tin=smpte2084.*tonemap=mobius:param=0\.8:desat=0.*m=bt709/);
  assert.match(H.filterChain({ kind: 'hlg', look: 'filmic' }), /tin=arib-std-b67.*tonemap=hable:desat=0/);
  assert.match(H.filterChain({ brightness: 1 }), /npl=50/); assert.match(H.filterChain({ brightness: -1 }), /npl=200/);
  assert.match(H.filterChain({ saturation: 1.1 }), /eq=saturation=1\.10$/);
  await assert.rejects(H.convert({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: makeSrc() }), /مش HDR/);
  const p = await H.preview({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: makeHdr('hlg'), t: 1 });
  assert.ok(Buffer.from(p.after, 'base64').length > 2000 && Buffer.from(p.naive, 'base64').length > 2000);
  assert.equal(await H.capable(FFMPEG), 'lut');
  // the LUT works from any folder name (a colon, a space, an apostrophe)
  for (const name of ['C: my dir', "it's here"]) {
    const d = path.join(TMP, name); fs.mkdirSync(d, { recursive: true });
    execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=64x36:d=0.2', '-vf', H.lutChain({ lut: H.cubeLut({ kind: 'pq', dir: d, size: 17 }), outPix: 'yuv420p' }), '-f', 'null', '-'], { stdio: 'pipe' });
  }
});

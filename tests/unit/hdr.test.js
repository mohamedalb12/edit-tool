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
function makeHdr(kind) {
  const trc = kind === 'pq' ? 'smpte2084' : 'arib-std-b67', out = path.join(TMP, 'hdr-' + kind + '.mov');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', makeSrc(), '-vf', `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020,zscale=t=${trc}:m=bt2020nc:npl=100,format=yuv420p10le`,
    '-c:v', 'libx265', '-crf', '8', '-x265-params', 'log-level=error', '-color_primaries', 'bt2020', '-color_trc', trc, '-colorspace', 'bt2020nc', '-c:a', 'aac', out]);
  return out;
}
const frame = f => execFileSync(FFMPEG, ['-loglevel', 'error', '-ss', '1', '-i', f, '-frames:v', '1', '-vf', 'scale=160:90,format=rgb24', '-f', 'rawvideo', '-']);
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

for (const kind of ['hlg', 'pq']) {
  test(`HDR (${kind}) → SDR keeps the colours: the result matches the original picture, the untouched HDR does not`, async () => {
    const hdr = makeHdr(kind);
    const i = await H.info(FFPROBE, hdr);
    assert.equal(i.hdr, kind); assert.equal(i.bits, 10); assert.equal(i.label, kind === 'hlg' ? 'HDR (HLG)' : 'HDR10 (PQ)');
    let last = 0;
    const r = await H.convert({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: hdr, codec: 'prores', onProgress: p => { last = p; } });
    assert.equal(r.out, path.join(TMP, 'hdr-' + kind + '_SDR.mov'));
    const ref = frame(SRC), got = diff(ref, frame(r.out)), naive = diff(ref, frame(hdr));
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

test('looks and brightness change the curve; an SDR file is refused; previews come back as pictures', async () => {
  assert.match(H.filterChain({ kind: 'pq' }), /tin=smpte2084.*tonemap=mobius:param=0\.8:desat=0.*m=bt709/);
  assert.match(H.filterChain({ kind: 'hlg', look: 'filmic' }), /tin=arib-std-b67.*tonemap=hable:desat=0/);
  assert.match(H.filterChain({ brightness: 1 }), /npl=50/); assert.match(H.filterChain({ brightness: -1 }), /npl=200/);
  assert.match(H.filterChain({ saturation: 1.1 }), /eq=saturation=1\.10$/);
  await assert.rejects(H.convert({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: makeSrc() }), /مش HDR/);
  const p = await H.preview({ ffmpeg: FFMPEG, ffprobe: FFPROBE, file: makeHdr('hlg'), t: 1 });
  assert.ok(Buffer.from(p.after, 'base64').length > 2000 && Buffer.from(p.naive, 'base64').length > 2000);
  assert.equal(await H.capable(FFMPEG), true);
});

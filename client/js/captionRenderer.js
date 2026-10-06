/* كابشن متحرك → كليب شفاف (ProRes 4444) لكل كارت، أوفلاين. */
(function () {
  var EF = window.EF;
  /** job: {cues, width, height, fps, style, outDir, ffmpeg, onProgress, hash} → [{file, start, end}] */
  EF.renderCaptionClips = function (job) {
    var io = EF.node('glassIO'), CS = window.EFCaptions;
    var W = job.width, H = job.height, fps = job.fps;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    var out = [], i = 0;
    return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function next() {
      if (i >= job.cues.length) return out;
      var cue = job.cues[i], idx = i++;
      if (job.style && job.style.still) {
        // plain captions: one still PNG per card (instant, no video encode)
        var png = job.outDir + '/cap-' + job.hash + '-' + idx + '.png';
        CS.draw(ctx, cue, (cue.start + cue.end) / 2, job.style, W, H);
        var b64 = c.toDataURL('image/png').split(',')[1];
        if (EF.isCEP) require('fs').writeFileSync(png, Buffer.from(b64, 'base64')); else if (EF.test && EF.test.writeFile) EF.test.writeFile(png, b64);
        out.push({ file: png, start: cue.start, end: cue.end });
        if (job.onProgress) job.onProgress(i / job.cues.length);
        return next();
      }
      var file = job.outDir + '/cap-' + job.hash + '-' + idx + '.mov';
      var frames = Math.max(1, Math.round((cue.end - cue.start) * fps));
      var enc = io.startRawEncoder(job.ffmpeg, { width: W, height: H, fps: fps, out: file });
      var f = 0, lastKey = null, last = null;
      return (function frame() {
        if (f >= frames) return enc.end();
        var t = cue.start + f / fps, key = CS.frameKey(cue, t, job.style); f++;
        // nothing moved since the last frame → send the same pixels again (the canvas readback is the slow part)
        if (key !== null && key === lastKey && last) return enc.write(last).then(frame);
        CS.draw(ctx, cue, t, job.style, W, H);
        var px = new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer);
        lastKey = key; last = key !== null ? px : null;
        return enc.write(px).then(frame);
      })().then(function () {
        out.push({ file: file, start: cue.start, end: cue.end });
        if (job.onProgress) job.onProgress(i / job.cues.length);
        return next();
      });
    });
  };
})();

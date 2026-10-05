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
      var file = job.outDir + '/cap-' + job.hash + '-' + idx + '.mov';
      var frames = Math.max(1, Math.round((cue.end - cue.start) * fps));
      var enc = io.startRawEncoder(job.ffmpeg, { width: W, height: H, fps: fps, out: file });
      var f = 0;
      return (function frame() {
        if (f >= frames) return enc.end();
        CS.draw(ctx, cue, cue.start + f / fps, job.style, W, H);
        var px = ctx.getImageData(0, 0, W, H).data; f++;
        return enc.write(new Uint8Array(px.buffer)).then(frame);
      })().then(function () {
        out.push({ file: file, start: cue.start, end: cue.end });
        if (job.onProgress) job.onProgress(i / job.cues.length);
        return next();
      });
    });
  };
})();

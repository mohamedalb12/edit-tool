/* Liquid Glass: فريمات الفيديو (ffmpeg) → شيدر WebGL → ProRes 4444 بشفافية. كله على الجهاز. */
(function () {
  var EF = window.EF;
  EF.renderGlass = function (job) {
    var io = EF.node('glassIO'), LG = window.EFLiquid;
    var canvas = document.createElement('canvas');
    var r = LG.createRenderer(canvas, job.width, job.height);
    r.setParams(job.params);
    var enc = io.startRawEncoder(job.ffmpeg, { width: job.width, height: job.height, fps: job.fps, out: job.out });
    var total = Math.max(1, Math.round(job.params.duration * job.fps));
    function frame(buf, i) {
      if (i >= total) return Promise.resolve();
      var px = r.render(buf ? new Uint8Array(buf.buffer, buf.byteOffset, buf.length) : null, i / job.fps);
      if (job.onProgress && i % 5 === 0) job.onProgress(i / total);
      return enc.write(px);
    }
    var work;
    if (job.src) work = io.decodeFrames(job.ffmpeg, { mediaPath: job.src.mediaPath, start: job.src.start, duration: job.src.duration, width: job.width, height: job.height, fps: job.fps }, frame);
    else work = (function loop(i) { return i >= total ? Promise.resolve() : frame(null, i).then(function () { return loop(i + 1); }); })(0);
    return work.then(function () { return enc.end(); }).then(function (out) { r.destroy(); return out; }, function (e) { r.destroy(); throw e; });
  };

  /** Colourful stand-in picture so the glass has something to bend when there's no footage. */
  EF.glassDemoBackground = function (W, H) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(.5, '#7c3aed'); bg.addColorStop(1, '#f472b6'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    [['#22d3ee', .2, .3, .22], ['#fbbf24', .78, .25, .18], ['#34d399', .65, .8, .2], ['#f43f5e', .15, .85, .16]].forEach(function (b) {
      var rg = g.createRadialGradient(b[1] * W, b[2] * H, 0, b[1] * W, b[2] * H, b[3] * W); rg.addColorStop(0, b[0]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(1, W / 480);
    for (var x = 0; x < W; x += W / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (var y = 0; y < H; y += H / 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 ' + Math.round(H * 0.16) + 'px "EF Cairo", Cairo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EditFast', W / 2, H * 0.5);
    return c;
  };
})();

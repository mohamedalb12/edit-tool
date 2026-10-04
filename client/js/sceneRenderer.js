/* بيخرّج مواصفات المشهد لفيديو: canvas في اللوحة → PNG → ffmpeg (أوفلاين). */
(function () {
  var EF = window.EF;
  EF.renderScene = function (spec, outPath, ffmpegPath, onProgress) {
    var enc = EF.node('sceneEncode');
    var s = window.EFScene.normalize(spec, spec.style);
    var canvas = document.createElement('canvas');
    var encoder = enc.startEncoder(ffmpegPath, { fps: s.fps, out: outPath, transparent: s.transparent });
    return window.EFScene.render(spec, canvas, function (b64) { return encoder.write(b64); }, { onProgress: onProgress })
      .then(function () { return encoder.end(); });
  };

  /** Small live preview: plays a scene spec in a canvas element (loop). */
  EF.previewScene = function (canvas, spec, opts) {
    opts = opts || {};
    var s = window.EFScene.normalize(Object.assign({ width: 480, height: 270 }, spec, { width: 480, height: 270 }), spec.style);
    canvas.width = s.width; canvas.height = s.height;
    var ctx = canvas.getContext('2d'), start = performance.now(), stopped = false;
    function frame(now) {
      if (stopped) return;
      // a still thumbnail shows the "settled" moment (after the entrance, before the exit)
      var t = opts.once ? Math.min(1.1, s.duration * 0.55) : ((now - start) / 1000) % (s.duration + 0.4);
      if (s.transparent) { ctx.fillStyle = '#16161b'; ctx.fillRect(0, 0, s.width, s.height); }
      var bgCanvasTransparent = s.transparent;
      if (bgCanvasTransparent) { ctx.save(); window.EFScene.drawFrame(proxy(ctx), s, Math.min(t, s.duration)); ctx.restore(); }
      else window.EFScene.drawFrame(ctx, s, Math.min(t, s.duration));
      if (!opts.once) requestAnimationFrame(frame);
    }
    // keep the dark preview background when the scene itself is transparent
    function proxy(c) { return new Proxy(c, { get: function (o, k) { if (k === 'clearRect') return function () {}; var v = o[k]; return typeof v === 'function' ? v.bind(o) : v; }, set: function (o, k, v) { o[k] = v; return true; } }); }
    requestAnimationFrame(frame);
    return function stop() { stopped = true; };
  };
})();

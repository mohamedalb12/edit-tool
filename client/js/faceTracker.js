/* تتبّع الوش أوفلاين في اللوحة (face-api TinyFaceDetector، موديل ~190KB متضمّن). */
(function () {
  var EF = window.EF, loading = null;
  var BASE = 'vendor/face-api/';

  function loadScript(src) {
    return new Promise(function (res, rej) { if (window.faceapi) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('مقدرتش أحمّل face-api')); }; document.head.appendChild(s); });
  }
  function readBinary(rel) {
    // inside Premiere: read with Node (fetch can't open file://); in the browser test harness: fetch
    if (EF.isCEP) { var fs = require('fs'); var b = fs.readFileSync(EF.extRoot + '/client/' + rel); return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
    return fetch(rel).then(function (r) { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); });
  }

  EF.faceTracker = {
    load: function () {
      if (loading) return loading;
      loading = loadScript(BASE + 'face-api.js').then(function () {
        var fa = window.faceapi;
        // GPU (WebGL) first, CPU as a fallback — the WASM backend isn't shipped
        return fa.tf.setBackend('webgl').then(function (ok) { return ok ? ok : fa.tf.setBackend('cpu'); }, function () { return fa.tf.setBackend('cpu'); }).then(function () { return fa.tf.ready(); });
      }).then(function () {
        var fa = window.faceapi;
        return Promise.all([readBinary(BASE + 'tiny_face_detector_model-weights_manifest.json'), readBinary(BASE + 'tiny_face_detector_model.bin')]).then(function (r) {
          var manifest = JSON.parse(new TextDecoder().decode(r[0]));
          var weightMap = fa.tf.io.decodeWeights(r[1], manifest[0].weights);
          fa.nets.tinyFaceDetector.loadFromWeightMap(weightMap);
          return fa.tf.ready();
        });
      });
      return loading;
    },
    /** rgba: Uint8Array W×H → [{cx, cy, w, h, score}] normalized */
    detect: function (rgba, W, H, canvas) {
      var fa = window.faceapi;
      var c = canvas || document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, W * H * 4), W, H), 0, 0);
      return fa.detectAllFaces(c, new fa.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 })).then(function (dets) {
        return dets.map(function (d) { var b = d.box; return { cx: (b.x + b.width / 2) / W, cy: (b.y + b.height / 2) / H, w: b.width / W, h: b.height / H, score: d.score }; });
      });
    }
  };

  /** job: {ffmpeg, file, start, duration, srcW, srcH, fps, onProgress} → samples [{t, faces}] */
  EF.analyzeFaces = function (job) {
    var io = EF.node('glassIO');
    var W = 640, H = Math.max(2, Math.round(W * job.srcH / job.srcW / 2) * 2), fps = job.fps || 3, canvas = document.createElement('canvas'), samples = [];
    var total = Math.max(1, Math.round(job.duration * fps));
    return EF.faceTracker.load().then(function () {
      return io.decodeFrames(job.ffmpeg, { mediaPath: job.file, start: job.start, duration: job.duration, width: W, height: H, fps: fps }, function (buf, i) {
        return EF.faceTracker.detect(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), W, H, canvas).then(function (faces) {
          samples.push({ t: i / fps, faces: faces });
          if (job.onProgress) job.onProgress(Math.min(1, (i + 1) / total));
        });
      });
    }).then(function () { return samples; });
  };
})();

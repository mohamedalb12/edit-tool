/* رسم دليل المنطقة الآمنة (زراير وكابشن المنصة) على كانفس — للمعاينة في اللوحة ولـ PNG شفاف يتحط على التايملين. */
(function () {
  var EF = window.EF;

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /** draw the guide for `platform` (tiktok | reels | shorts | all) on a W×H canvas context */
  EF.drawSafeZones = function (ctx, W, H, platform, opts) {
    opts = opts || {};
    var SZ = EF.node('safeZones'), m = SZ.margins(platform), safe = SZ.safeRect(platform);
    var u = Math.min(W, H) / 100, red = 'rgba(255, 45, 85, ' + (opts.tint || 0.22) + ')';
    ctx.save();
    // unsafe margins
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, W, H * m.top); ctx.fillRect(0, H * (1 - m.bottom), W, H * m.bottom);
    ctx.fillRect(0, H * m.top, W * m.left, H * (1 - m.top - m.bottom)); ctx.fillRect(W * (1 - m.right), H * m.top, W * m.right, H * (1 - m.top - m.bottom));
    // safe rectangle
    ctx.setLineDash([u * 2.2, u * 1.4]); ctx.lineWidth = Math.max(2, u * 0.45); ctx.strokeStyle = 'rgba(52, 211, 153, .95)';
    rr(ctx, W * safe.x, H * safe.y, W * safe.w, H * safe.h, u * 2); ctx.stroke(); ctx.setLineDash([]);
    // platform UI mock (the platform we draw = first one when "all")
    var P = SZ.PLATFORMS[platform] || SZ.PLATFORMS.tiktok;
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    P.ui.forEach(function (b) {
      var x = b[1] * W, y = b[2] * H, w = b[3] * W, hh = b[4] * H;
      if (b[0] === 'rail') {
        var n = 4, gap = hh / n, r = Math.min(w * 0.32, gap * 0.28);
        for (var i = 0; i < n; i++) {
          var cx = x + w / 2, cy = y + gap * (i + 0.45);
          ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, u * 0.5); ctx.stroke();
          ctx.globalAlpha = 0.75; rr(ctx, cx - r * 0.7, cy + r * 1.35, r * 1.4, r * 0.35, r * 0.17); ctx.fill();
        }
      } else if (b[0] === 'caption') {
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(x + u * 6, y + hh * 0.22, u * 3, 0, Math.PI * 2); ctx.fill();
        rr(ctx, x + u * 11, y + hh * 0.16, w * 0.35, u * 2.4, u * 1.2); ctx.fill();
        ctx.globalAlpha = 0.6;
        rr(ctx, x + u * 4, y + hh * 0.42, w * 0.8, u * 2, u); ctx.fill();
        rr(ctx, x + u * 4, y + hh * 0.58, w * 0.55, u * 2, u); ctx.fill();
        ctx.globalAlpha = 0.45; rr(ctx, x + u * 4, y + hh * 0.76, w * 0.45, u * 1.8, u); ctx.fill();
      } else {
        ctx.globalAlpha = 0.8; ctx.font = '700 ' + Math.round(u * 3.4) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b[5], W / 2, y + hh * 0.55);
      }
    });
    ctx.globalAlpha = 1;
    // label
    ctx.font = '800 ' + Math.round(u * 3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(52, 211, 153, 1)'; ctx.fillText(platform === 'all' ? 'SAFE ZONE (ALL)' : 'SAFE ZONE — ' + platform.toUpperCase(), W * (safe.x + safe.w / 2), H * safe.y - u);
    ctx.restore();
  };

  /** job: {platform, width, height, out} → writes a transparent PNG */
  EF.renderSafeOverlay = function (job) {
    var c = document.createElement('canvas'); c.width = job.width; c.height = job.height;
    EF.drawSafeZones(c.getContext('2d'), job.width, job.height, job.platform, { tint: 0.28 });
    var b64 = c.toDataURL('image/png').split(',')[1];
    if (!EF.isCEP) { if (EF.test && EF.test.writeFile) EF.test.writeFile(job.out, b64); else return Promise.reject(new Error('مفيش وصول للملفات')); }
    else require('fs').writeFileSync(job.out, Buffer.from(b64, 'base64'));
    return Promise.resolve(job.out);
  };
})();

'use strict';
// كشف تغيير اللقطات بطريقة PySceneDetect "AdaptiveDetector" (github.com/Breakthrough/PySceneDetect, BSD-3):
// درجة كل فريم = متوسط الفرق في Hue / Saturation / Luminance مع اللي قبله، وبعدين بتتقارن بمتوسط الفريمات اللي حواليه.
// القطع الحقيقي بيطلع أكبر بكتير من اللي حواليه، لكن حركة الكاميرا السريعة بتبقى عالية في كل الفريمات فمش بتتحسب
// قطع — وده عيب الحد الثابت (ffmpeg scene > 0.32) اللي كان قبل كده.
const { spawn } = require('child_process');

const DEFAULTS = { adaptiveThreshold: 3.0, windowWidth: 2, minContentVal: 15.0, minSceneLen: 0.6 };

/** RGB (0–255) → OpenCV-style HSV (H 0–179, S 0–255, V 0–255), per pixel into three planes */
function toHSV(rgb, n, out) {
  const H = out ? out[0] : new Uint8Array(n), S = out ? out[1] : new Uint8Array(n), V = out ? out[2] : new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const r = rgb[j], g = rgb[j + 1], b = rgb[j + 2];
    const v = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b), d = v - mn;
    V[i] = v;
    S[i] = v === 0 ? 0 : Math.round(255 * d / v);
    let h = 0;
    if (d !== 0) { h = v === r ? 60 * (g - b) / d : v === g ? 120 + 60 * (b - r) / d : 240 + 60 * (r - g) / d; if (h < 0) h += 360; }
    H[i] = Math.round(h / 2);
  }
  return [H, S, V];
}
const meanDist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/** frame scores (ContentDetector, weights 1/1/1/0) → cut frame indices (AdaptiveDetector) */
function adaptiveCuts(scores, fps, o = {}) {
  const { adaptiveThreshold, windowWidth: w, minContentVal, minSceneLen } = Object.assign({}, DEFAULTS, o);
  const minLen = Math.max(1, Math.round(minSceneLen * fps)), cuts = [];
  // unlike PySceneDetect the first frame is not a cut: we often analyse from the middle of a clip, and a real cut
  // 0.3 s into that range must not be dropped by the minimum shot length
  let last = -Infinity;
  for (let t = w; t < scores.length - w; t++) {
    let sum = 0; for (let k = t - w; k <= t + w; k++) if (k !== t) sum += scores[k];
    const avg = sum / (2 * w);
    const ratio = Math.abs(avg) < 1e-5 ? (scores[t] >= minContentVal ? 255 : 0) : Math.min(scores[t] / avg, 255);
    if (ratio >= adaptiveThreshold && scores[t] >= minContentVal && t - last >= minLen) { cuts.push(t); last = t; }
  }
  return cuts;
}

/**
 * Shot changes in [start, start+duration] of a file → source times (seconds).
 * o: { width (analysis size), fps (analysis rate), adaptiveThreshold, minContentVal, minSceneLen }
 */
function detect(ffmpeg, file, { start = 0, duration = 0, width = 160, fps = 15, ...o } = {}) {
  return new Promise((resolve, reject) => {
    const W = width, Hh = Math.max(2, Math.round(width * 9 / 16 / 2) * 2), n = W * Hh, size = n * 3;
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', file);
    if (duration > 0) args.push('-t', String(duration));
    // fixed analysis size (letter-boxed) so every frame compares like for like
    args.push('-an', '-vf', `fps=${fps},scale=${W}:${Hh}:force_original_aspect_ratio=decrease,pad=${W}:${Hh}:(ow-iw)/2:(oh-ih)/2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-');
    const p = spawn(ffmpeg, args, { windowsHide: true });
    const scores = [];
    let buf = Buffer.alloc(0), prev = null, cur = null, err = '';
    p.stdout.on('data', d => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= size) {
        const frame = buf.subarray(0, size);
        cur = toHSV(frame, n, prev ? null : undefined);
        scores.push(prev ? (meanDist(cur[0], prev[0]) + meanDist(cur[1], prev[1]) + meanDist(cur[2], prev[2])) / 3 : 0);
        prev = cur;
        buf = buf.subarray(size);
      }
    });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0 && !scores.length) return reject(new Error('ffmpeg: ' + err.trim().slice(0, 300)));
      resolve(adaptiveCuts(scores, fps, o).map(i => +(start + i / fps).toFixed(3)));
    });
  });
}

module.exports = { detect, adaptiveCuts, toHSV, DEFAULTS };

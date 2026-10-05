'use strict';
// تحويل لريلز 9:16 بتتبّع الوش: خطة قص ناعمة (منطقة ميتة + متابعة ناعمة + حد سرعة + قفزة عند تغيير اللقطة) → ffmpeg.
const fs = require('fs');
const path = require('path');
const { run } = require('./ffmpeg');

const RATIOS = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
const OUT_SIZE = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };

/**
 * samples: [{t, faces:[{cx, cy, w, h, score}]}]  (normalized 0..1, source frame)
 * returns { cropW, cropH, path:[{t, cx}] (normalized crop centre), subject }
 */
function plan(samples, { srcW, srcH, ratio = '9:16', deadZone = 0.05, follow = 0.18, maxSpeed = 0.45, rate = 10, shots = [], lookahead = 0.6 } = {}) {
  const ar = RATIOS[ratio] || RATIOS['9:16'];
  let cropH = srcH, cropW = Math.round(srcH * ar);
  if (cropW > srcW) { cropW = srcW; cropH = Math.round(srcW / ar); }
  cropW -= cropW % 2; cropH -= cropH % 2;
  const half = cropW / 2 / srcW; // normalized half width
  const clampX = x => Math.min(1 - half, Math.max(half, x));
  const ss = samples.slice().sort((a, b) => a.t - b.t);
  if (!ss.length) return { cropW, cropH, path: [{ t: 0, cx: 0.5 }], subject: null };
  const end = ss[ss.length - 1].t;

  // 1) pick the subject per sample: biggest confident face, preferring the one near the previous subject
  let prev = null; const target = [];
  for (const s of ss) {
    const faces = (s.faces || []).filter(f => (f.score ?? 1) >= 0.35);
    let pick = null;
    if (faces.length) {
      pick = faces.reduce((best, f) => {
        const size = f.w * f.h, near = prev === null ? 0 : Math.abs(f.cx - prev);
        const score = size * 4 - near * 0.6 + (f.score || 0.5) * 0.05;
        return !best || score > best.score ? { f, score } : best;
      }, null).f;
    }
    if (pick) prev = pick.cx;
    target.push({ t: s.t, x: pick ? pick.cx : null });
  }
  // fill gaps (no face) with the last known / next known position, default centre
  let last = null;
  for (const p of target) { if (p.x === null) p.x = last; else last = p.x; }
  let next = null;
  for (let i = target.length - 1; i >= 0; i--) { if (target[i].x === null) target[i].x = next; else next = target[i].x; }
  target.forEach(p => { if (p.x === null) p.x = 0.5; });

  // 2) virtual camera: dead zone + critically damped follow + speed limit; hard jump on shot changes
  const out = []; let cam = clampX(target[0].x);
  const dt = 1 / rate;
  const targetAt = t => { let i = 0; while (i < target.length - 1 && target[i + 1].t <= t) i++; return target[i].x; };
  const isCut = t => shots.some(c => c > t - dt && c <= t);
  for (let t = 0; t <= end + 1e-6; t += dt) {
    // offline advantage: aim where the subject is going (look-ahead), not where it was → no lag behind movement
    const nextCut = shots.find(c => c > t);
    const ahead = nextCut !== undefined ? Math.min(t + lookahead, nextCut - dt) : t + lookahead;
    const want = clampX(targetAt(Math.max(t, ahead)));
    const diff = want - cam;
    if (isCut(t)) cam = want; // new shot → cut straight to the subject, don't pan
    else if (Math.abs(diff) > deadZone * 0.5) {
      const step = diff * follow;
      const lim = maxSpeed * dt;
      cam += Math.max(-lim, Math.min(lim, step));
    }
    cam = clampX(cam);
    out.push({ t: +t.toFixed(3), cx: +cam.toFixed(4) });
  }
  return { cropW, cropH, path: out, subject: prev };
}

/** sendcmd script: crop x in source pixels over time */
function sendcmd(planRes, srcW, srcH) {
  return planRes.path.map(p => `${p.t.toFixed(3)} crop x ${Math.round(p.cx * srcW - planRes.cropW / 2)};`).join('\n') + '\n';
}

/** Render the reframed clip (video + audio) with ffmpeg. */
async function render(ffmpeg, { file, start = 0, duration, srcW, srcH, planRes, ratio = '9:16', out }) {
  const [W, H] = OUT_SIZE[ratio] || OUT_SIZE['9:16'];
  const dir = path.dirname(out);
  const cmdName = path.basename(out) + '.cmd.txt';
  fs.writeFileSync(path.join(dir, cmdName), sendcmd(planRes, srcW, srcH));
  const x0 = Math.round(planRes.path[0].cx * srcW - planRes.cropW / 2), y0 = Math.round((srcH - planRes.cropH) / 2);
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration) args.push('-t', String(duration));
  // the command file is referenced relative to cwd → no path escaping problems on Windows
  args.push('-filter_complex', `[0:v]sendcmd=f=${cmdName},crop=w=${planRes.cropW}:h=${planRes.cropH}:x=${x0}:y=${y0},scale=${W}:${H}:flags=lanczos,setsar=1[v]`,
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out);
  await run(ffmpeg, args, { spawn: { cwd: dir } });
  try { fs.unlinkSync(path.join(dir, cmdName)); } catch (_) {}
  return out;
}

module.exports = { RATIOS, OUT_SIZE, plan, sendcmd, render };

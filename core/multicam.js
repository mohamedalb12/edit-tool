'use strict';
// المالتي كام: يحلل صوت كل كاميرا ويعرف مين بيتكلم ويطلع خطة تبديل تراجعها قبل التطبيق.
const { decodePCM } = require('./ffmpeg');
const { rmsEnvelope, toDb, percentile } = require('./audio');

/**
 * envelopes: Float32Array RMS per window for each camera (same window, same time origin).
 * Returns [{start,end,camera}] where camera is the index (or wideIndex when nobody/everybody speaks).
 */
function planFromEnvelopes(envelopes, { windowSec = 0.1, minShot = 2.0, marginDb = 4, speechDb = 10, wideIndex = -1, wideAfter = 6, cameraOffsetsDb = [] } = {}) {
  const n = Math.min(...envelopes.map(e => e.length));
  if (!n || !isFinite(n)) return [];
  // normalise every mic by its own noise floor so a hot mic doesn't win always
  const db = envelopes.map((env, c) => {
    const arr = Array.from(env.subarray ? env.subarray(0, n) : env.slice(0, n)).map(toDb);
    // the quietest 5%: someone who talks almost without pauses still has breaths below that (20% made a
    // non-stop talker look like silence)
    const floor = percentile(arr, 0.05);
    return arr.map(v => v - floor + (cameraOffsetsDb[c] || 0));
  });
  // smooth 0.5s moving average
  const k = Math.max(1, Math.round(0.5 / windowSec));
  const sm = db.map(arr => arr.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { s += arr[j]; c++; } return s / c; }));
  const raw = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = -1, bestV = -Infinity, second = -Infinity;
    for (let c = 0; c < sm.length; c++) { const v = sm[c][i]; if (v > bestV) { second = bestV; bestV = v; best = c; } else if (v > second) second = v; }
    if (bestV < speechDb) raw[i] = null; // nobody talking
    else if (sm.length > 1 && bestV - second < marginDb && wideIndex >= 0) raw[i] = 'both';
    else raw[i] = best;
  }
  // build shots with hysteresis: a new speaker must hold for minShot before we cut
  const minWin = Math.max(1, Math.round(minShot / windowSec));
  const shots = [];
  let cur = raw.find(v => typeof v === 'number');
  if (cur === undefined) cur = 0;
  let curStart = 0, silentRun = 0;
  for (let i = 0; i < n; i++) {
    let v = raw[i];
    if (v === null) { silentRun++; v = (wideIndex >= 0 && silentRun * windowSec >= wideAfter) ? wideIndex : cur; } else silentRun = 0;
    if (v === 'both') v = wideIndex;
    if (v !== cur) {
      // look ahead: does v dominate the next minWin windows?
      let hold = 0; for (let j = i; j < Math.min(n, i + minWin); j++) { const r = raw[j] === 'both' ? wideIndex : raw[j]; if (r === v || r === null) hold++; }
      if (hold >= minWin * 0.7 && (i - curStart) >= minWin) {
        shots.push({ start: +(curStart * windowSec).toFixed(3), end: +(i * windowSec).toFixed(3), camera: cur });
        cur = v; curStart = i;
      }
    }
  }
  shots.push({ start: +(curStart * windowSec).toFixed(3), end: +(n * windowSec).toFixed(3), camera: cur });
  return shots;
}

/**
 * cameras: [{ mediaPath, inPoint, start, end, trackIndex }] — the audio for each camera as it sits on the timeline.
 * Returns timeline-time plan.
 */
async function analyze(ffmpeg, cameras, opts = {}) {
  const rate = 8000, windowSec = opts.windowSec || 0.1;
  const t0 = Math.min(...cameras.map(c => c.start)), t1 = Math.max(...cameras.map(c => c.end));
  const envs = [];
  for (const cam of cameras) {
    const pcm = await decodePCM(ffmpeg, cam.mediaPath, { rate, start: cam.inPoint, duration: cam.end - cam.start });
    const env = rmsEnvelope(pcm, rate, windowSec);
    // place on common timeline grid
    const total = Math.ceil((t1 - t0) / windowSec);
    const grid = new Float32Array(total).fill(1e-6);
    const off = Math.round((cam.start - t0) / windowSec);
    for (let i = 0; i < env.length && off + i < total; i++) grid[off + i] = env[i];
    envs.push(grid);
  }
  const plan = breakLongShots(planFromEnvelopes(envs, { ...opts, windowSec }), { ...opts, cameras: cameras.length });
  // a wide camera without its own mic (opts.wideTrack) is the virtual camera number cameras.length
  return plan.map(s => ({ start: +(s.start + t0).toFixed(3), end: +(s.end + t0).toFixed(3), camera: s.camera, cutaway: !!s.cutaway, trackIndex: s.camera >= 0 && cameras[s.camera] ? cameras[s.camera].trackIndex : (s.camera === cameras.length && opts.wideTrack >= 0 ? opts.wideTrack : s.camera) }));
}

/**
 * Nobody watches one face for a minute: a shot longer than maxShot is broken with a cut-away of `cutLen` seconds —
 * the wide shot if there is one, else the other camera (the listener's reaction) — repeating as long as needed.
 * The last piece of a shot is never shorter than minShot.
 */
function breakLongShots(shots, { maxShot = 0, cutLen = 2.5, minShot = 2, wideIndex = -1, cameras = 2 } = {}) {
  if (!(maxShot > 0)) return shots;
  const out = [];
  for (const s of shots) {
    const isWide = wideIndex >= 0 && s.camera === wideIndex;
    if (isWide || s.end - s.start <= maxShot) { out.push(s); continue; }
    const away = wideIndex >= 0 ? wideIndex : (s.camera + 1) % Math.max(2, cameras);
    let t = s.start;
    while (s.end - t > maxShot) {
      const cutAt = t + maxShot, back = cutAt + cutLen;
      if (s.end - back < minShot) break; // not enough left to come back: let this shot run to its end
      out.push({ start: +t.toFixed(3), end: +cutAt.toFixed(3), camera: s.camera });
      out.push({ start: +cutAt.toFixed(3), end: +back.toFixed(3), camera: away, cutaway: true });
      t = back;
    }
    out.push({ start: +t.toFixed(3), end: s.end, camera: s.camera });
  }
  return out;
}

function summarize(plan, labels = []) {
  const stats = {};
  for (const s of plan) { const k = labels[s.camera] || `كام ${s.camera + 1}`; stats[k] = (stats[k] || 0) + (s.end - s.start); }
  return { cuts: Math.max(0, plan.length - 1), seconds: stats };
}

module.exports = { planFromEnvelopes, breakLongShots, analyze, summarize };

'use strict';
// القص السريع (أوفلاين): يلاقي السكتات بـ ffmpeg silencedetect ويحسب الأجزاء اللي تتشال.
const { run } = require('./ffmpeg');
const ranges = require('./ranges');

/** الحساسية 1..10 → عتبة dB وأقل مدة سكتة. أعلى حساسية = يقص أكتر. */
function sensitivityToParams(sensitivity = 5) {
  const s = Math.min(10, Math.max(1, Number(sensitivity) || 5));
  return {
    thresholdDb: Math.round(-50 + (s - 1) * (25 / 9)),           // -50dB .. -25dB
    minSilence: Math.round((1.0 - (s - 1) * (0.8 / 9)) * 100) / 100 // 1.0s .. 0.2s
  };
}

function parseSilencedetect(stderr, totalDuration) {
  const out = [];
  let open = null;
  for (const line of String(stderr).split(/\r?\n/)) {
    let m = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (m) { open = Math.max(0, parseFloat(m[1])); continue; }
    m = /silence_end:\s*([\d.]+)/.exec(line);
    if (m && open !== null) { out.push({ start: open, end: parseFloat(m[1]) }); open = null; }
  }
  if (open !== null && totalDuration) out.push({ start: open, end: totalDuration });
  return out;
}

async function detectSilence(ffmpeg, file, { thresholdDb = -35, minSilence = 0.4, start = 0, duration = 0 } = {}) {
  const args = ['-hide_banner', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration > 0) args.push('-t', String(duration));
  args.push('-vn', '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilence}`, '-f', 'null', '-');
  const { stderr } = await run(ffmpeg, args);
  return parseSilencedetect(stderr, duration || 0);
}

/**
 * يحوّل السكتات لفترات قص: بيسيب padding من الناحيتين عشان الكلام ميتقطعش،
 * وبيتجاهل السكتات اللي أقصر من minCut بعد الـ padding.
 */
function silencesToCuts(silences, { padding = 0.08, minCut = 0.15, total = Infinity } = {}) {
  const cuts = [];
  for (const s of ranges.normalize(silences)) {
    const a = s.start <= 0.0001 ? 0 : s.start + padding;
    const b = s.end >= total - 0.0001 ? total : s.end - padding;
    if (b - a >= minCut) cuts.push({ start: a, end: b });
  }
  return ranges.merge(cuts);
}

/**
 * Map per-clip silences (source time) to timeline cuts.
 * clip: { start, end, inPoint } timeline seconds + source in-point.
 */
function clipCutsToTimeline(clip, sourceCuts) {
  const out = [];
  for (const c of sourceCuts) {
    const a = clip.start + (c.start - clip.inPoint);
    const b = clip.start + (c.end - clip.inPoint);
    const s = Math.max(a, clip.start), e = Math.min(b, clip.end);
    if (e - s > 1e-3) out.push({ start: s, end: e });
  }
  return out;
}

/* ---------- adaptive silence detection (auto-editor's method + a threshold measured from the recording) ---------- */
const FRAME = 0.02; // 20 ms analysis frames

/** peak level (dBFS) of every 20 ms of [start, start+duration], streamed (an hour of audio never sits in memory) */
function frameLevels(ffmpeg, file, { start = 0, duration = 0, rate = 8000 } = {}) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', file);
    if (duration > 0) args.push('-t', String(duration));
    args.push('-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-');
    const p = spawn(ffmpeg, args, { windowsHide: true }), per = Math.round(rate * FRAME), out = [];
    let peak = 0, n = 0, carry = null, err = '';
    p.stdout.on('data', d => {
      if (carry) { d = Buffer.concat([carry, d]); carry = null; }
      const even = d.length - (d.length % 2);
      for (let i = 0; i < even; i += 2) {
        const v = Math.abs(d.readInt16LE(i)); if (v > peak) peak = v;
        if (++n === per) { out.push(peak ? 20 * Math.log10(peak / 32768) : -120); peak = 0; n = 0; }
      }
      if (even < d.length) carry = d.subarray(even);
    });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => { if (n) out.push(peak ? 20 * Math.log10(peak / 32768) : -120); if (code !== 0 && !out.length) return reject(new Error('ffmpeg: ' + err.trim().slice(0, 300))); resolve(out); });
  });
}
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
/**
 * The threshold from the recording itself: halfway-ish (by sensitivity) between its noise floor (15th percentile)
 * and its speech level (85th), so a quiet far-mic take and a noisy room both work. → dBFS, or null = no clear pauses.
 */
function autoThreshold(levels, sensitivity = 5) {
  const s = Math.min(10, Math.max(1, Number(sensitivity) || 5)), sorted = levels.filter(x => x > -119).sort((a, b) => a - b);
  if (sorted.length < 10) return -50;
  const noise = Math.max(-90, pct(levels.slice().sort((a, b) => a - b), 0.15)), speech = pct(sorted, 0.85);
  if (speech - noise < 8) return null;
  return Math.max(-70, Math.min(-12, noise + (speech - noise) * (0.25 + (s - 1) * 0.04)));
}
/**
 * auto-editor's smoothing (github.com/WyattBlue/auto-editor, public domain): a sound shorter than minclip (a click,
 * a breath) doesn't count as speech, and a pause shorter than mincut isn't cut. active: [bool] per frame (mutated).
 */
function smoothing(active, mincut, minclip) {
  let prev = null, prev2 = null;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  while (!same(prev, active) && !same(prev2, active)) {
    prev2 = prev; prev = active.slice();
    const next = prev.slice();
    for (const [want, min, set] of [[true, minclip, false], [false, mincut, true]]) {
      let start = 0, on = false;
      for (let j = 0; j < prev.length; j++) {
        if (prev[j] === want) {
          if (!on) { start = j; on = true; }
          if (j === prev.length - 1 && j - start + 1 < min) for (let i = start; i < prev.length; i++) next[i] = set;
        } else if (on) { if (j - start < min) for (let i = start; i < j; i++) next[i] = set; on = false; }
      }
    }
    for (let i = 0; i < active.length; i++) active[i] = next[i];
  }
  return active;
}
/** levels (dBFS per 20 ms) → silences [{start, end}] in seconds from the start of the levels */
function levelsToSilences(levels, { thresholdDb, minSilence = 0.4, minClip = 0.12 }) {
  if (thresholdDb === null) return [];
  const active = smoothing(levels.map(l => l > thresholdDb), Math.max(1, Math.round(minSilence / FRAME)), Math.max(1, Math.round(minClip / FRAME)));
  const out = [];
  for (let j = 0; j < active.length;) {
    if (active[j]) { j++; continue; }
    let k = j; while (k < active.length && !active[k]) k++;
    if ((k - j) * FRAME >= minSilence) out.push({ start: +(j * FRAME).toFixed(3), end: +(k * FRAME).toFixed(3) });
    j = k;
  }
  return out;
}

/** Full pipeline for a list of timeline clips. */
async function analyzeClips(ffmpeg, clips, opts = {}) {
  const p = { ...sensitivityToParams(opts.sensitivity), ...opts.params };
  const all = [];
  for (const clip of clips) {
    const dur = clip.end - clip.start;
    const minSilence = opts.minSilence || p.minSilence;
    let sil;
    if (opts.engine === 'fixed') sil = await detectSilence(ffmpeg, clip.mediaPath, { thresholdDb: p.thresholdDb, minSilence, start: clip.inPoint, duration: dur });
    else {
      // measured from this recording (unless a threshold was set by hand), clicks / breaths ignored
      const levels = await frameLevels(ffmpeg, clip.mediaPath, { start: clip.inPoint, duration: dur });
      const thr = opts.params && opts.params.thresholdDb !== undefined ? opts.params.thresholdDb : autoThreshold(levels, opts.sensitivity);
      p.measured = (p.measured || []).concat([thr === null ? null : Math.round(thr)]);
      sil = levelsToSilences(levels, { thresholdDb: thr, minSilence, minClip: opts.minClip || 0.12 });
    }
    // silencedetect times are relative to -ss start → shift to source time
    const src = sil.map(s => ({ start: s.start + clip.inPoint, end: s.end + clip.inPoint }));
    const cuts = silencesToCuts(src, { padding: opts.padding ?? 0.08, minCut: opts.minCut ?? 0.15, total: clip.inPoint + dur });
    all.push(...clipCutsToTimeline(clip, cuts));
  }
  const merged = ranges.merge(all);
  return { cuts: merged, removedSeconds: ranges.totalLength(merged), params: p };
}

module.exports = { sensitivityToParams, parseSilencedetect, detectSilence, silencesToCuts, clipCutsToTimeline, analyzeClips, frameLevels, autoThreshold, smoothing, levelsToSilences };

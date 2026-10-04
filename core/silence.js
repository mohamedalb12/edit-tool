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

/** Full pipeline for a list of timeline clips. */
async function analyzeClips(ffmpeg, clips, opts = {}) {
  const p = { ...sensitivityToParams(opts.sensitivity), ...opts.params };
  const all = [];
  for (const clip of clips) {
    const dur = clip.end - clip.start;
    const sil = await detectSilence(ffmpeg, clip.mediaPath, { thresholdDb: p.thresholdDb, minSilence: opts.minSilence || p.minSilence, start: clip.inPoint, duration: dur });
    // silencedetect times are relative to -ss start → shift to source time
    const src = sil.map(s => ({ start: s.start + clip.inPoint, end: s.end + clip.inPoint }));
    const cuts = silencesToCuts(src, { padding: opts.padding ?? 0.08, minCut: opts.minCut ?? 0.15, total: clip.inPoint + dur });
    all.push(...clipCutsToTimeline(clip, cuts));
  }
  const merged = ranges.merge(all);
  return { cuts: merged, removedSeconds: ranges.totalLength(merged), params: p };
}

module.exports = { sensitivityToParams, parseSilencedetect, detectSilence, silencesToCuts, clipCutsToTimeline, analyzeClips };

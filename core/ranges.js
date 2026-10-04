'use strict';
// عمليات على الفترات الزمنية [start, end] بالثواني.

function normalize(ranges) {
  return ranges
    .filter(r => r && isFinite(r.start) && isFinite(r.end) && r.end > r.start)
    .map(r => ({ ...r }))
    .sort((a, b) => a.start - b.start);
}

/** Merge overlapping / touching ranges (gap <= tolerance). */
function merge(ranges, tolerance = 0) {
  const out = [];
  for (const r of normalize(ranges)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + tolerance) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** Ranges in [0, total] not covered by `remove`. */
function invert(remove, total, from = 0) {
  const keep = [];
  let cur = from;
  for (const r of merge(remove)) {
    if (r.end <= cur) continue;
    if (r.start > cur) keep.push({ start: cur, end: Math.min(r.start, total) });
    cur = Math.max(cur, r.end);
    if (cur >= total) break;
  }
  if (cur < total) keep.push({ start: cur, end: total });
  return keep.filter(k => k.end - k.start > 1e-6);
}

function totalLength(ranges) { return ranges.reduce((s, r) => s + (r.end - r.start), 0); }

/** Map a source time to output time after removing `remove` ranges (ripple). */
function rippleTime(t, remove) {
  let shift = 0;
  for (const r of merge(remove)) {
    if (r.end <= t) shift += r.end - r.start;
    else if (r.start < t) shift += t - r.start;
  }
  return t - shift;
}

module.exports = { normalize, merge, invert, totalLength, rippleTime };

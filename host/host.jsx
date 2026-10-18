/* EditFast \u2014 ExtendScript host for Adobe Premiere Pro.
 * ES3 only (ExtendScript): no let/const, arrow functions, Array.indexOf, JSON, String.trim.
 * Every public function goes through ef_call(name, jsonArgs) and returns a JSON string {ok, data|error}.
 */

var EF = EF || {};
EF.TICKS = 254016000000;

/* ---------------- JSON (ExtendScript has none) ---------------- */
EF.json = {
  esc: function (s) {
    var out = '"', i, c, code;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i); code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === '\\') out += '\\\\';
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  },
  stringify: function (v) {
    var t = typeof v, i, parts, k;
    if (v === null || v === undefined) return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return EF.json.esc(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      parts = [];
      for (i = 0; i < v.length; i++) parts.push(EF.json.stringify(v[i]));
      return '[' + parts.join(',') + ']';
    }
    if (t === 'object') {
      parts = [];
      for (k in v) {
        if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) parts.push(EF.json.esc(k) + ':' + EF.json.stringify(v[k]));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  },
  parse: function (s) {
    if (!s) return {};
    return eval('(' + s + ')');
  }
};

/* ---------------- helpers ---------------- */
EF.seq = function () {
  var s = app.project.activeSequence;
  if (!s) throw new Error('\u0627\u0641\u062a\u062d \u0633\u064a\u0643\u0648\u064a\u0646\u0633 \u0627\u0644\u0623\u0648\u0644'); // \u0627\u0641\u062a\u062d \u0633\u064a\u0643\u0648\u064a\u0646\u0633 \u0627\u0644\u0623\u0648\u0644
  return s;
};

EF.sec = function (t) {
  if (t === undefined || t === null) return 0;
  if (typeof t === 'number') return t;
  if (t.seconds !== undefined) return t.seconds;
  return parseFloat(t) || 0;
};

EF.ticksToSec = function (ticks) { return parseFloat(ticks) / EF.TICKS; };
EF.secToTicks = function (s) { return String(Math.round(s * EF.TICKS)); };

EF.timeObj = function (s) { var t = new Time(); t.seconds = s; return t; };

EF.fps = function (seq) {
  try {
    var fr = seq.getSettings().videoFrameRate; // Time: seconds per frame
    var spf = EF.sec(fr);
    if (spf > 0) return 1 / spf;
  } catch (e) {}
  try { return EF.TICKS / parseFloat(seq.timebase); } catch (e2) {}
  return 30;
};

EF.snap = function (s, fps) { return Math.round(s * fps) / fps; };

EF.timecode = function (seq, s) {
  var t = EF.timeObj(s);
  var settings = seq.getSettings();
  return t.getFormatted(settings.videoFrameRate, settings.videoDisplayFormat);
};

EF.mediaPath = function (projectItem) {
  try { return projectItem ? projectItem.getMediaPath() : ''; } catch (e) { return ''; }
};

EF.clipInfo = function (clip, kind, ti, ci) {
  return {
    kind: kind, track: ti, index: ci, name: clip.name,
    start: EF.sec(clip.start), end: EF.sec(clip.end),
    inPoint: EF.sec(clip.inPoint), outPoint: EF.sec(clip.outPoint),
    mediaPath: EF.mediaPath(clip.projectItem),
    nodeId: clip.projectItem ? clip.projectItem.nodeId : '',
    selected: clip.isSelected ? !!clip.isSelected() : false,
    disabled: !!clip.disabled,
    effects: EF.effectNames(clip)
  };
};

EF.INTRINSIC = { 'Opacity': 1, 'Motion': 1, 'Volume': 1, 'Channel Volume': 1, 'Panner': 1, 'Time Remapping': 1, 'Vector Motion': 1 };
/** names of the effects the user added to a clip (intrinsic Motion/Opacity/Volume are skipped) */
EF.effectNames = function (clip) {
  var out = [], i, c;
  try {
    for (i = 0; i < clip.components.numItems; i++) {
      c = clip.components[i];
      if (c && !EF.INTRINSIC[c.displayName]) out.push(c.displayName);
    }
  } catch (e) {}
  return out;
};

EF.markerList = function (seq) {
  var out = [], m, n = 0;
  try {
    m = seq.markers.getFirstMarker();
    while (m && n < 500) {
      out.push({ time: EF.sec(m.start), end: EF.sec(m.end), name: m.name || '', comment: m.comments || '' });
      m = seq.markers.getNextMarker(m); n++;
    }
  } catch (e) {}
  return out;
};

EF.tracks = function (seq, kind) { return kind === 'audio' ? seq.audioTracks : seq.videoTracks; };

EF.isLocked = function (track) { try { return !!track.isLocked(); } catch (e) { return false; } };

EF.clipAt = function (track, t) {
  var i, c, eps = 0.0005;
  for (i = 0; i < track.clips.numItems; i++) {
    c = track.clips[i];
    if (EF.sec(c.start) - eps <= t && t < EF.sec(c.end) - eps) return c;
  }
  return null;
};

/** topmost (highest) video clip at time t, or on a specific track */
EF.findVideoClip = function (seq, t, trackIndex) {
  var i, c;
  if (trackIndex !== undefined && trackIndex !== null && trackIndex >= 0) {
    return trackIndex < seq.videoTracks.numTracks ? EF.clipAt(seq.videoTracks[trackIndex], t) : null;
  }
  for (i = seq.videoTracks.numTracks - 1; i >= 0; i--) {
    c = EF.clipAt(seq.videoTracks[i], t);
    if (c) return c;
  }
  return null;
};

EF.selectedClip = function (seq) {
  var sel, i;
  try { sel = seq.getSelection(); } catch (e) { sel = null; }
  if (sel && sel.length) {
    for (i = 0; i < sel.length; i++) if (sel[i] && sel[i].mediaType !== 'Audio') return sel[i];
    return sel[0];
  }
  return null;
};

EF.qeSeq = function () {
  app.enableQE();
  return qe.project.getActiveSequence();
};

/* ---------------- project items ---------------- */
EF.walk = function (item, binPath, out) {
  var i, ch, p;
  for (i = 0; i < item.children.numItems; i++) {
    ch = item.children[i];
    if (!ch) continue;
    if (ch.type === ProjectItemType.BIN) {
      p = binPath ? binPath + '/' + ch.name : ch.name;
      out.push({ item: ch, bin: binPath, isBin: true, path: p });
      EF.walk(ch, p, out);
    } else {
      out.push({ item: ch, bin: binPath, isBin: false });
    }
  }
  return out;
};

EF.findByPath = function (path) {
  var all = EF.walk(app.project.rootItem, '', []), i, norm = String(path).replace(/\\/g, '/').toLowerCase();
  for (i = 0; i < all.length; i++) {
    if (!all[i].isBin && String(EF.mediaPath(all[i].item)).replace(/\\/g, '/').toLowerCase() === norm) return all[i].item;
  }
  return null;
};

EF.findByNodeId = function (id) {
  var all = EF.walk(app.project.rootItem, '', []), i;
  for (i = 0; i < all.length; i++) if (all[i].item.nodeId === id) return all[i].item;
  return null;
};

EF.ensureBin = function (path) {
  var parts = String(path).split('/'), cur = app.project.rootItem, i, j, found;
  for (i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    found = null;
    for (j = 0; j < cur.children.numItems; j++) {
      if (cur.children[j].type === ProjectItemType.BIN && cur.children[j].name === parts[i]) { found = cur.children[j]; break; }
    }
    if (!found) found = cur.createBin(parts[i]);
    cur = found;
  }
  return cur;
};

/* macOS can store Arabic letters with hamza/madda decomposed (NFD): compose them so path compares match */
EF.normPath = function (p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase()
    .replace(/\u0627\u0653/g, '\u0622').replace(/\u0627\u0654/g, '\u0623').replace(/\u0648\u0654/g, '\u0624')
    .replace(/\u0627\u0655/g, '\u0625').replace(/\u064a\u0654/g, '\u0626').replace(/\u06d5\u0654/g, '\u06c0');
};
EF.baseName = function (p) { var s = String(p || '').replace(/\\/g, '/'); return s.substring(s.lastIndexOf('/') + 1); };

/** an already imported item for this file inside one bin (no project-wide scan) */
EF.findInBin = function (bin, path) {
  var i, ch, norm = EF.normPath(path);
  for (i = 0; i < bin.children.numItems; i++) {
    ch = bin.children[i];
    if (ch && ch.type !== ProjectItemType.BIN && EF.normPath(EF.mediaPath(ch)) === norm) return ch;
  }
  return null;
};

/**
 * Import files into a bin in ONE importFiles call and return the items in the same order.
 * Existing items in that bin are reused; new ones are found among the bin's new children (by path, then by name),
 * so a path written in a different Unicode form or with different case never turns into a false "import failed".
 */
EF.importMany = function (paths, binPath) {
  var bin = EF.ensureBin(binPath || 'EditFast'), out = [], need = [], i, j, ch, before = bin.children.numItems;
  for (i = 0; i < paths.length; i++) { out.push(EF.findInBin(bin, paths[i])); if (!out[i]) need.push(paths[i]); }
  if (!need.length) return out;
  app.project.importFiles(need, true, bin, false);
  var fresh = [];
  for (j = before; j < bin.children.numItems; j++) { ch = bin.children[j]; if (ch && ch.type !== ProjectItemType.BIN) fresh.push(ch); }
  for (i = 0; i < paths.length; i++) {
    if (out[i]) continue;
    var norm = EF.normPath(paths[i]), name = EF.normPath(EF.baseName(paths[i])), hit = null;
    for (j = 0; j < fresh.length && !hit; j++) if (EF.normPath(EF.mediaPath(fresh[j])) === norm) hit = fresh[j];
    for (j = 0; j < fresh.length && !hit; j++) if (EF.normPath(fresh[j].name) === name || EF.normPath(EF.baseName(EF.mediaPath(fresh[j]))) === name) hit = fresh[j];
    if (!hit) hit = EF.findInBin(bin, paths[i]);
    if (!hit) throw new Error('\u0628\u0631\u064a\u0645\u064a\u0631 \u0645\u0627\u0639\u0631\u0641\u0634 \u064a\u0633\u062a\u0648\u0631\u062f \u0627\u0644\u0645\u0644\u0641 \u062f\u0647 (\u0635\u064a\u063a\u062a\u0647 \u0645\u0634 \u0645\u062f\u0639\u0648\u0645\u0629 \u0623\u0648 \u0645\u0634 \u0645\u0648\u062c\u0648\u062f): ' + EF.baseName(paths[i]));
    out[i] = hit;
  }
  return out;
};

EF.importFile = function (path, binPath) { return EF.importMany([path], binPath)[0]; };

/** the source length of a project item in seconds (0 when unknown, e.g. a still with no length yet) */
EF.itemDuration = function (item) {
  try { var d = EF.sec(item.getOutPoint()) - EF.sec(item.getInPoint()); if (d > 0) return d; } catch (e) {}
  return 0;
};

/* ---------------- public API ---------------- */
var EFAPI = {};

EFAPI.ping = function () { return { app: app.name || 'Premiere Pro', version: app.version || '' }; };

EFAPI.sequenceInfo = function () {
  var seq = EF.seq(), out = { name: seq.name, id: seq.sequenceID, video: [], audio: [] }, k, kinds = ['video', 'audio'], ti, ci, tr;
  out.fps = EF.fps(seq);
  try { var st = seq.getSettings(); out.width = st.videoFrameWidth; out.height = st.videoFrameHeight; } catch (e) { out.width = 1920; out.height = 1080; }
  out.duration = EF.ticksToSec(seq.end);
  out.playhead = EF.sec(seq.getPlayerPosition());
  out.markers = EF.markerList(seq);
  try { var io = seq.getInPointAsTime ? EF.sec(seq.getInPointAsTime()) : null, oo = seq.getOutPointAsTime ? EF.sec(seq.getOutPointAsTime()) : null; if (io !== null) out.inOut = [io, oo]; } catch (e2) {}
  for (k = 0; k < kinds.length; k++) {
    var tracks = EF.tracks(seq, kinds[k]);
    for (ti = 0; ti < tracks.numTracks; ti++) {
      tr = tracks[ti];
      var info = { index: ti, name: tr.name, locked: EF.isLocked(tr), clips: [] };
      for (ci = 0; ci < tr.clips.numItems; ci++) info.clips.push(EF.clipInfo(tr.clips[ci], kinds[k], ti, ci));
      out[kinds[k]].push(info);
    }
  }
  return out;
};

EFAPI.setPlayhead = function (a) { var seq = EF.seq(); seq.setPlayerPosition(EF.secToTicks(a.time)); return { time: a.time }; };

EFAPI.cloneSequence = function (a) {
  var seq = EF.seq(), ids = {}, i, s, newest = null, tries;
  for (i = 0; i < app.project.sequences.numSequences; i++) ids[app.project.sequences[i].sequenceID] = 1;
  seq.clone();
  for (tries = 0; tries < 30 && !newest; tries++) {
    for (i = 0; i < app.project.sequences.numSequences; i++) { s = app.project.sequences[i]; if (!ids[s.sequenceID]) newest = s; }
    if (!newest) $.sleep(100);
  }
  if (!newest) throw new Error('\u0645\u0627\u0642\u062f\u0631\u062a\u0634 \u0623\u0639\u0645\u0644 \u0646\u0633\u062e\u0629 \u0645\u0646 \u0627\u0644\u0633\u064a\u0643\u0648\u0646\u0633');
  if (a && a.name) { try { newest.name = a.name; } catch (e) {} }
  app.project.openSequence(newest.sequenceID);
  // make sure the copy is the active one before anything gets cut
  for (tries = 0; tries < 30; tries++) {
    if (app.project.activeSequence && app.project.activeSequence.sequenceID === newest.sequenceID) break;
    try { app.project.activeSequence = newest; } catch (e2) {}
    $.sleep(100);
  }
  if (!app.project.activeSequence || app.project.activeSequence.sequenceID !== newest.sequenceID) throw new Error('\u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u062a\u0639\u0645\u0644\u062a \u0628\u0633 \u0628\u0631\u064a\u0645\u064a\u0631 \u0645\u0627\u0641\u062a\u062d\u0647\u0627\u0634 \u2014 \u0627\u0641\u062a\u062d\u0647\u0627 \u0628\u0625\u064a\u062f\u0643 \u0648\u062c\u0631\u0651\u0628 \u062a\u0627\u0646\u064a: ' + newest.name);
  return { name: newest.name, id: newest.sequenceID };
};

/** Razor every unlocked track at time s. */
EF.razorAll = function (seq, qseq, s, keep) {
  var tc = EF.timecode(seq, s), i, n = 0;
  for (i = 0; i < seq.videoTracks.numTracks; i++) if (!EF.isLocked(seq.videoTracks[i]) && !EF.kept(keep, 'video', i)) { qseq.getVideoTrackAt(i).razor(tc); n++; }
  for (i = 0; i < seq.audioTracks.numTracks; i++) if (!EF.isLocked(seq.audioTracks[i]) && !EF.kept(keep, 'audio', i)) { qseq.getAudioTrackAt(i).razor(tc); n++; }
  return n;
};
/** tracks the user asked us not to cut (e.g. the music bed): keep = { audio:[i], video:[i] } */
EF.kept = function (keep, kind, i) {
  var list = keep && keep[kind], j;
  if (!list) return false;
  for (j = 0; j < list.length; j++) if (list[j] === i) return true;
  return false;
};

/**
 * Cut out ranges [{start,end}] on all unlocked tracks and close the gaps (ripple).
 * args: { ranges, clone, crossfadeFrames }
 */
EFAPI.removeRanges = function (a) {
  var cloneInfo = null;
  if (a.clone) cloneInfo = EFAPI.cloneSequence({ name: a.cloneName });
  var seq = EF.seq(), qseq = EF.qeSeq(), fps = EF.fps(seq), rs = [], i, j, k, r, removed = 0;
  for (i = 0; i < a.ranges.length; i++) {
    r = { start: EF.snap(a.ranges[i].start, fps), end: EF.snap(a.ranges[i].end, fps) };
    if (r.end - r.start >= 1 / fps) rs.push(r);
  }
  rs.sort(function (x, y) { return y.start - x.start; }); // from the end \u2192 earlier times stay valid
  // 1) razor at every boundary
  for (i = 0; i < rs.length; i++) { EF.razorAll(seq, qseq, rs[i].end, a.keep); EF.razorAll(seq, qseq, rs[i].start, a.keep); }
  // 2) remove + ripple, range by range from the end
  var kinds = ['video', 'audio'], cutPoints = [];
  for (i = 0; i < rs.length; i++) {
    r = rs[i];
    var len = r.end - r.start;
    for (k = 0; k < kinds.length; k++) {
      var tracks = EF.tracks(seq, kinds[k]);
      for (j = 0; j < tracks.numTracks; j++) {
        var tr = tracks[j];
        if (EF.isLocked(tr) || EF.kept(a.keep, kinds[k], j)) continue;
        var victims = [], later = [], c, ci;
        for (ci = 0; ci < tr.clips.numItems; ci++) {
          c = tr.clips[ci];
          if (EF.sec(c.start) >= r.start - 0.001 && EF.sec(c.end) <= r.end + 0.001) victims.push(c);
          else if (EF.sec(c.start) >= r.end - 0.001) later.push(c);
        }
        if (victims.length) {
          for (ci = victims.length - 1; ci >= 0; ci--) { victims[ci].remove(true, true); removed++; }
        } else if (later.length) {
          // nothing to delete on this track (gap) \u2192 shift later clips left so tracks stay in sync
          for (ci = 0; ci < later.length; ci++) { try { later[ci].move(EF.timeObj(-len)); } catch (e) {} }
        }
      }
    }
    cutPoints.push(r.start);
  }
  // 3) tiny audio crossfades at the joins so cuts don't click
  var fades = 0;
  if (a.crossfadeFrames && a.crossfadeFrames > 0) fades = EF.addAudioFades(seq, cutPoints, a.crossfadeFrames, rs, a.keep);
  return { removed: removed, ranges: rs.length, crossfades: fades, sequence: cloneInfo ? cloneInfo.name : seq.name };
};

EF.addAudioFades = function (seq, cutPointsOriginal, frames, rangesDesc, keep) {
  var qseq = EF.qeSeq(), tr, n = 0, i, j, t, it;
  var trans = null;
  try { trans = qe.project.getAudioTransitionByName('Constant Power'); } catch (e) {}
  if (!trans) return 0;
  // rippled positions of each cut point
  var pts = [];
  for (i = 0; i < cutPointsOriginal.length; i++) {
    var p = cutPointsOriginal[i], shift = 0;
    for (j = 0; j < rangesDesc.length; j++) if (rangesDesc[j].end <= p + 0.0001 && rangesDesc[j].start < p) shift += rangesDesc[j].end - rangesDesc[j].start;
    pts.push(p - shift);
  }
  var durTc = EF.timecode(seq, frames / EF.fps(seq));
  for (i = 0; i < seq.audioTracks.numTracks; i++) {
    if (EF.isLocked(seq.audioTracks[i]) || EF.kept(keep, 'audio', i)) continue;
    tr = qseq.getAudioTrackAt(i);
    for (j = 0; j < tr.numItems; j++) {
      it = tr.getItemAt(j);
      if (!it || it.type === 'Empty') continue;
      t = it.start ? (it.start.secs !== undefined ? it.start.secs : EF.sec(it.start)) : -1;
      for (var q = 0; q < pts.length; q++) {
        if (Math.abs(t - pts[q]) < 0.02) { try { it.addTransition(trans, true, durTc, '00:00:00:00', 0.5, false, true); n++; } catch (e2) {} break; }
      }
    }
  }
  return n;
};

/* Premiere marker colours: 0 green 1 red 2 purple 3 orange 4 yellow 5 white 6 blue 7 cyan */
EF.MARKER_COLORS = { green: 0, red: 1, purple: 2, magenta: 2, orange: 3, yellow: 4, white: 5, blue: 6, cyan: 7 };
EF.markerColor = function (c) { if (typeof c === 'number') return c; var v = EF.MARKER_COLORS[String(c).toLowerCase()]; return v === undefined ? 0 : v; };

EFAPI.addMarkers = function (a) {
  var seq = EF.seq(), i, m, mk, n = 0;
  for (i = 0; i < a.markers.length; i++) {
    m = a.markers[i];
    mk = seq.markers.createMarker(m.time);
    if (m.name) mk.name = m.name;
    if (m.comment) mk.comments = m.comment;
    if (m.duration) { try { mk.end = EF.timeObj(m.time + m.duration); } catch (e) {} }
    if (m.color !== undefined && m.color !== null) { try { mk.setColorByIndex(EF.markerColor(m.color), 0); } catch (e2) {} }
    n++;
  }
  return { added: n };
};

EF.trackFree = function (track, a, b) {
  var i, c;
  for (i = 0; i < track.clips.numItems; i++) {
    c = track.clips[i];
    if (EF.sec(c.start) < b - 0.001 && EF.sec(c.end) > a + 0.001) return false;
  }
  return true;
};

/** add one track on top. QE's addTracks has an undocumented signature, so try the known forms and check the count. */
EF.addTrack = function (seq, kind) {
  var n = EF.tracks(seq, kind).numTracks, q = null, k;
  try { q = EF.qeSeq(); } catch (e) {}
  if (!q) return false;
  var tries = kind === 'video' ? [
    function () { q.addTracks(1, n, 0, 1, 0, 0, 1, 0); }, function () { q.addTracks(1, n, 0, 0, 0); },
    function () { q.addTracks(1, n, 0); }, function () { q.addTracks(1, n); }, function () { q.addTracks(1); }
  ] : [
    function () { q.addTracks(0, 0, 1, 1, n, 0, 1, 0); }, function () { q.addTracks(0, 0, 1, 1, n); },
    function () { q.addTracks(0, 0, 1, 0, n); }, function () { q.addTracks(0, 0, 1); }
  ];
  for (k = 0; k < tries.length; k++) {
    try { tries[k](); } catch (e2) {}
    if (EF.tracks(seq, kind).numTracks > n) return true;
  }
  return false;
};

/** a free unlocked track for [a,b] from minIndex up; adds a track when none is free. Never returns a busy track. */
EF.pickTrack = function (seq, kind, a, b, minIndex, ranges) {
  var tracks = EF.tracks(seq, kind), i, j, ok;
  minIndex = minIndex || 0;
  for (i = minIndex; i < tracks.numTracks; i++) {
    if (EF.isLocked(tracks[i])) continue;
    ok = EF.trackFree(tracks[i], a, b);
    if (ok && ranges) for (j = 0; j < ranges.length && ok; j++) ok = EF.trackFree(tracks[i], ranges[j][0], ranges[j][1]);
    if (ok) return i;
  }
  while (EF.tracks(seq, kind).numTracks <= minIndex) if (!EF.addTrack(seq, kind)) break;
  if (EF.tracks(seq, kind).numTracks > minIndex && EF.addTrack(seq, kind)) return EF.tracks(seq, kind).numTracks - 1;
  // adding failed: an empty track at/above minIndex is still safe
  tracks = EF.tracks(seq, kind);
  for (i = minIndex; i < tracks.numTracks; i++) if (!EF.isLocked(tracks[i]) && tracks[i].clips.numItems === 0) return i;
  throw new Error(kind === 'video'
    ? '\u0645\u0641\u064a\u0634 \u062a\u0631\u0627\u0643 \u0641\u064a\u062f\u064a\u0648 \u0641\u0627\u0636\u064a \u0648\u0645\u0627\u0642\u062f\u0631\u062a\u0634 \u0623\u0632\u0648\u0651\u062f \u0648\u0627\u062d\u062f \u2014 \u0632\u0648\u0651\u062f \u062a\u0631\u0627\u0643 \u0641\u064a\u062f\u064a\u0648 \u0641\u0627\u0636\u064a \u0641\u0648\u0642 (\u0643\u0644\u064a\u0643 \u064a\u0645\u064a\u0646 > Add Track) \u0648\u062c\u0631\u0651\u0628 \u062a\u0627\u0646\u064a'
    : '\u0645\u0641\u064a\u0634 \u062a\u0631\u0627\u0643 \u0635\u0648\u062a \u0641\u0627\u0636\u064a \u0648\u0645\u0627\u0642\u062f\u0631\u062a\u0634 \u0623\u0632\u0648\u0651\u062f \u0648\u0627\u062d\u062f \u2014 \u0632\u0648\u0651\u062f \u062a\u0631\u0627\u0643 \u0635\u0648\u062a \u0641\u0627\u0636\u064a \u0648\u062c\u0631\u0651\u0628 \u062a\u0627\u0646\u064a');
};

/** the clip just placed: same item, start within a frame of t */
EF.placedClip = function (track, item, t, fps) {
  var i, c, best = null, bd = 1e9, tol = 1.5 / (fps || 25);
  for (i = 0; i < track.clips.numItems; i++) {
    c = track.clips[i];
    var d = Math.abs(EF.sec(c.start) - t);
    if (d <= tol && d < bd && (!c.projectItem || !item || c.projectItem.nodeId === item.nodeId)) { best = c; bd = d; }
  }
  return best;
};

/** lay one item at t for dur seconds on track ti, without the full source length ever covering later clips */
EF.layItem = function (seq, item, kind, ti, t, dur, fps) {
  var tracks = EF.tracks(seq, kind), setIO = false;
  if (dur > 0) {
    var src = EF.itemDuration(item);
    if (!src || dur < src - 0.001) { try { item.setInPoint(0, 4); item.setOutPoint(dur, 4); setIO = true; } catch (e) {} }
  }
  tracks[ti].overwriteClip(item, t);
  if (setIO) { try { item.clearInPoint(); item.clearOutPoint(); } catch (e2) {} }
  var clip = EF.placedClip(tracks[ti], item, t, fps);
  if (clip && dur > 0 && Math.abs(EF.sec(clip.end) - (t + dur)) > 0.5 / fps) { try { clip.end = EF.timeObj(t + dur); } catch (e3) {} }
  return clip;
};

/**
 * Import a file (if needed) and place it on the timeline.
 * a: { path, time, kind: 'video'|'audio', track (-1 auto), duration, bin }
 */
EFAPI.placeFile = function (a) {
  var seq = EF.seq(), fps = EF.fps(seq), item = EF.importFile(a.path, a.bin || 'EditFast'), kind = a.kind || 'video';
  var t = EF.snap(a.time === undefined || a.time === null ? EF.sec(seq.getPlayerPosition()) : a.time, fps);
  var dur = a.duration || EF.itemDuration(item) || 5;
  var ti = (a.track === undefined || a.track === null || a.track < 0) ? EF.pickTrack(seq, kind, t, t + dur, a.minTrack === undefined ? 1 : a.minTrack) : a.track;
  var clip = EF.layItem(seq, item, kind, ti, t, a.duration || 0, fps);
  return { track: ti, start: t, end: clip ? EF.sec(clip.end) : t + dur, name: item.name };
};

/**
 * Many files in one call (captions, scenes, SFX): one import, one track for all of them when they don't overlap.
 * a: { items:[{path,time,duration}], kind, bin, minTrack, sameTrack }
 */
EFAPI.placeFiles = function (a) {
  var seq = EF.seq(), fps = EF.fps(seq), kind = a.kind || 'video', list = a.items || [], i, paths = [];
  if (!list.length) return { placed: 0 };
  for (i = 0; i < list.length; i++) paths.push(list[i].path);
  var items = EF.importMany(paths, a.bin || 'EditFast'), ranges = [], lo = 1e12, hi = 0, t;
  for (i = 0; i < list.length; i++) {
    t = EF.snap(list[i].time, fps);
    var d = list[i].duration || EF.itemDuration(items[i]) || 5;
    ranges.push([t, t + d]); if (t < lo) lo = t; if (t + d > hi) hi = t + d;
  }
  var minT = a.minTrack === undefined ? 1 : a.minTrack;
  var ti = a.sameTrack === false ? -1 : EF.pickTrack(seq, kind, lo, lo, minT, ranges), placed = 0, tracks = [];
  for (i = 0; i < list.length; i++) {
    var tt = ti >= 0 ? ti : EF.pickTrack(seq, kind, ranges[i][0], ranges[i][1], minT);
    EF.layItem(seq, items[i], kind, tt, ranges[i][0], list[i].duration || 0, fps);
    placed++; tracks.push(tt);
  }
  return { placed: placed, track: ti, tracks: tracks };
};

EFAPI.createCaptions = function (a) {
  var seq = EF.seq(), item = EF.importFile(a.srtPath, 'EditFast/Captions'), res;
  var fmt = (typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) ? Sequence.CAPTION_FORMAT_SUBTITLE : 'Subtitle Default';
  if (typeof seq.createCaptionTrack !== 'function') throw new Error('\u0646\u0633\u062e\u0629 \u0628\u0631\u064a\u0645\u064a\u0631 \u062f\u064a \u0645\u0627\u0628\u062a\u0633\u0645\u062d\u0634 \u0628\u0625\u0636\u0627\u0641\u0629 \u0643\u0627\u0628\u0634\u0646 \u0645\u0646 \u0633\u0643\u0631\u064a\u0628\u062a \u2014 \u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0643\u0627\u0628\u0634\u0646 \u0627\u0644\u062b\u0627\u0628\u062a \u0628\u0627\u0644\u0634\u0643\u0644 \u0623\u0648 \u0627\u0633\u062d\u0628 \u0645\u0644\u0641 \u0627\u0644\u0640 SRT \u0645\u0646 bin \u0627\u0644\u0640 Captions \u0644\u0644\u062a\u0627\u064a\u0645\u0644\u064a\u0646');
  res = seq.createCaptionTrack(item, a.start || 0, fmt);
  if (res === false) throw new Error('\u0628\u0631\u064a\u0645\u064a\u0631 \u0631\u0641\u0636 \u064a\u0639\u0645\u0644 \u062a\u0631\u0627\u0643 \u0627\u0644\u0643\u0627\u0628\u0634\u0646 \u2014 \u0627\u0633\u062d\u0628 \u0645\u0644\u0641 \u0627\u0644\u0640 SRT \u0645\u0646 bin \u0627\u0644\u0640 EditFast/Captions \u0644\u0644\u062a\u0627\u064a\u0645\u0644\u064a\u0646 \u0628\u0625\u064a\u062f\u0643');
  return { ok: true, item: item.name, result: res === undefined ? null : String(res) };
};

/* ---------------- keyframes ---------------- */
EF.PROPS = {
  transform: { match: 'AE.ADBE Geometry2', names: { pos: ['Position'], scale: ['Scale', 'Scale Height'], uniform: ['Uniform Scale'], skew: ['Skew'], rotation: ['Rotation'], opacity: ['Opacity'] },
    idx: { pos: 1, uniform: 2, scale: 3, skew: 5, rotation: 7, opacity: 8 } },
  motion: { match: 'AE.ADBE Motion', names: { pos: ['Position'], scale: ['Scale'], uniform: ['Uniform Scale'], rotation: ['Rotation'] },
    idx: { pos: 0, scale: 1, uniform: 3, rotation: 4 } }
};

EF.findComponent = function (clip, matchName, display) {
  var i, c;
  for (i = 0; i < clip.components.numItems; i++) {
    c = clip.components[i];
    if (c.matchName === matchName || c.displayName === display) return c;
  }
  return null;
};

EF.qeClipFor = function (seq, clip, trackIndex) {
  var qtr = EF.qeSeq().getVideoTrackAt(trackIndex), i, it, s = EF.sec(clip.start);
  for (i = 0; i < qtr.numItems; i++) {
    it = qtr.getItemAt(i);
    if (!it || it.type === 'Empty') continue;
    var st = it.start ? (it.start.secs !== undefined ? it.start.secs : EF.sec(it.start)) : -1;
    if (Math.abs(st - s) < 0.02 && (!it.name || it.name === clip.name)) return it;
  }
  return null;
};

EF.ensureTransform = function (seq, clip, trackIndex) {
  var comp = EF.findComponent(clip, 'AE.ADBE Geometry2', 'Transform');
  if (comp) return comp;
  try {
    var q = EF.qeClipFor(seq, clip, trackIndex), fx = qe.project.getVideoEffectByName('Transform');
    if (q && fx) { q.addVideoEffect(fx); }
  } catch (e) {}
  return EF.findComponent(clip, 'AE.ADBE Geometry2', 'Transform');
};

EF.prop = function (comp, map, key) {
  var names = map.names[key] || [], i, j, p;
  for (i = 0; i < comp.properties.numItems; i++) {
    p = comp.properties[i];
    for (j = 0; j < names.length; j++) if (p.displayName === names[j]) return p;
  }
  var idx = map.idx[key];
  return (idx !== undefined && idx < comp.properties.numItems) ? comp.properties[idx] : null;
};

EF.trackIndexOf = function (seq, clip) {
  var i, j, tr;
  for (i = 0; i < seq.videoTracks.numTracks; i++) {
    tr = seq.videoTracks[i];
    for (j = 0; j < tr.clips.numItems; j++) if (tr.clips[j].nodeId === clip.nodeId && EF.sec(tr.clips[j].start) === EF.sec(clip.start)) return i;
  }
  return 0;
};

/**
 * a: { time, track, mode: in|out|emphasis|at, duration, props:{scale,pos,rotation,opacity,skew}, interpolation, useSelection }
 */
EFAPI.applyKeyframes = function (a) {
  var seq = EF.seq(), t = (a.time === undefined || a.time === null) ? EF.sec(seq.getPlayerPosition()) : a.time;
  var clip = a.useSelection ? EF.selectedClip(seq) : null;
  if (!clip) clip = EF.findVideoClip(seq, t, a.track);
  if (!clip) throw new Error('\u0645\u0641\u064a\u0634 \u0643\u0644\u064a\u0628 \u0641\u064a\u062f\u064a\u0648 \u0639\u0646\u062f \u0627\u0644\u0648\u0642\u062a \u062f\u0647'); // \u0645\u0641\u064a\u0634 \u0643\u0644\u064a\u0628 \u0641\u064a\u062f\u064a\u0648 \u0639\u0646\u062f \u0627\u0644\u0648\u0642\u062a \u062f\u0647
  var trackIndex = (a.track !== undefined && a.track !== null && a.track >= 0) ? a.track : EF.trackIndexOf(seq, clip);
  var cs = EF.sec(clip.start), ce = EF.sec(clip.end), dur = a.duration || 0.5;
  var anchor = a.mode === 'in' ? cs : a.mode === 'out' ? Math.max(cs, ce - dur) : Math.max(cs, Math.min(t, ce - 0.04));
  var comp = EF.ensureTransform(seq, clip, trackIndex), map = EF.PROPS.transform, usingMotion = false;
  if (!comp) { comp = EF.findComponent(clip, 'AE.ADBE Motion', 'Motion'); map = EF.PROPS.motion; usingMotion = true; }
  if (!comp) throw new Error('no Transform/Motion component');
  var w = 1920, h = 1080;
  try { var st = seq.getSettings(); w = st.videoFrameWidth; h = st.videoFrameHeight; } catch (e) {}
  var mediaOffset = EF.sec(clip.inPoint) - cs; // timeline \u2192 clip media time
  var interp = a.interpolation === 'hold' ? 4 : 0, written = 0, key, keys, p, i, base, isNorm, v, kt;
  var uni = EF.prop(comp, map, 'uniform');
  if (uni && a.props.scale) { try { uni.setValue(true, true); } catch (e1) {} }
  for (key in a.props) {
    if (!a.props.hasOwnProperty(key)) continue;
    keys = a.props[key];
    if (!keys || !keys.length) continue;
    if (key === 'opacity' && usingMotion) { p = EF.findComponent(clip, 'AE.ADBE Opacity', 'Opacity'); p = p ? p.properties[0] : null; }
    else p = EF.prop(comp, map, key);
    if (!p) continue;
    base = p.getValue();
    if (!p.isTimeVarying()) p.setTimeVarying(true, true);
    else if (a.clear !== false) {
      try { p.removeKeyRange(anchor + mediaOffset - 0.001, anchor + mediaOffset + keys[keys.length - 1].t + 0.001, true); } catch (e2) {}
    }
    isNorm = (key === 'pos' && base && base.length === 2 && Math.abs(base[0]) <= 2 && Math.abs(base[1]) <= 2);
    for (i = 0; i < keys.length; i++) {
      kt = anchor + keys[i].t + mediaOffset;
      if (key === 'pos') v = isNorm ? [base[0] + keys[i].v[0], base[1] + keys[i].v[1]] : [base[0] + keys[i].v[0] * w, base[1] + keys[i].v[1] * h];
      else if (key === 'scale' && usingMotion) v = keys[i].v * (typeof base === 'number' ? base : 100) / 100;
      else v = keys[i].v;
      p.addKey(kt);
      // redraw Premiere's UI once at the end, not on every key (hundreds of redraws froze it)
      p.setValueAtKey(kt, v, i === keys.length - 1);
      try { p.setInterpolationTypeAtKey(kt, keys[i].interp !== undefined ? keys[i].interp : interp, i === keys.length - 1); } catch (e3) {}
      written++;
    }
  }
  return { keys: written, clip: clip.name, start: anchor, component: usingMotion ? 'Motion' : 'Transform' };
};

/** Read every keyframed property of the selected clip (or clip at time). Times returned in timeline seconds. */
EFAPI.readKeyframes = function (a) {
  var seq = EF.seq(), clip = EF.selectedClip(seq);
  if (!clip) clip = EF.findVideoClip(seq, (a && a.time !== undefined) ? a.time : EF.sec(seq.getPlayerPosition()), a && a.track);
  if (!clip) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0643\u0644\u064a\u0628 \u0627\u0644\u0623\u0648\u0644'); // \u0627\u062e\u062a\u0627\u0631 \u0643\u0644\u064a\u0628 \u0627\u0644\u0623\u0648\u0644
  var off = EF.sec(clip.start) - EF.sec(clip.inPoint), out = [], i, j, k, comp, p, keys;
  for (i = 0; i < clip.components.numItems; i++) {
    comp = clip.components[i];
    for (j = 0; j < comp.properties.numItems; j++) {
      p = comp.properties[j];
      try { if (!p.isTimeVarying()) continue; } catch (e) { continue; }
      keys = p.getKeys() || [];
      var list = [];
      for (k = 0; k < keys.length; k++) list.push({ t: EF.sec(keys[k]) + off, v: p.getValueAtKey(keys[k]) });
      if (list.length) out.push({ component: comp.displayName, matchName: comp.matchName, componentIndex: i, prop: p.displayName, propIndex: j, keys: list });
    }
  }
  return { clip: clip.name, start: EF.sec(clip.start), end: EF.sec(clip.end), props: out };
};

/** Replace keys of one property in [from,to] with a new dense list (baked curve). Times in timeline seconds. */
EFAPI.writeKeyframes = function (a) {
  var seq = EF.seq(), clip = EF.selectedClip(seq);
  if (!clip) clip = EF.findVideoClip(seq, a.time, a.track);
  if (!clip) throw new Error('no clip');
  var comp = clip.components[a.componentIndex], p = comp.properties[a.propIndex], off = EF.sec(clip.inPoint) - EF.sec(clip.start), i, kt;
  try { p.removeKeyRange(a.from + off - 0.0005, a.to + off + 0.0005, true); } catch (e) {}
  for (i = 0; i < a.keys.length; i++) {
    kt = a.keys[i].t + off;
    p.addKey(kt);
    p.setValueAtKey(kt, a.keys[i].v, true);
    try { p.setInterpolationTypeAtKey(kt, 0, true); } catch (e2) {}
  }
  return { written: a.keys.length };
};

/* ---------------- project organizer ---------------- */
EFAPI.scanProject = function () {
  var all = EF.walk(app.project.rootItem, '', []), out = [], i, it, isSeq;
  for (i = 0; i < all.length; i++) {
    if (all[i].isBin) continue;
    it = all[i].item;
    isSeq = false;
    try { isSeq = !!it.isSequence(); } catch (e) {}
    out.push({ nodeId: it.nodeId, name: it.name, path: EF.mediaPath(it), isSequence: isSeq, bin: all[i].bin });
  }
  return { items: out };
};

EFAPI.organize = function (a) {
  var i, m, item, bin, moved = 0, failed = [];
  for (i = 0; i < a.moves.length; i++) {
    m = a.moves[i];
    item = EF.findByNodeId(m.nodeId);
    if (!item) { failed.push(m.name); continue; }
    bin = EF.ensureBin(m.to);
    try { item.moveBin(bin); moved++; } catch (e) { failed.push(m.name); }
  }
  return { moved: moved, failed: failed };
};

/* ---------------- titles (MOGRT) ---------------- */
EF.setMgtText = function (clip, text, opts) {
  var comp = null, i, p, v, set = 0;
  try { comp = clip.getMGTComponent(); } catch (e) {}
  if (!comp) return 0;
  for (i = 0; i < comp.properties.numItems; i++) {
    p = comp.properties[i];
    try { v = p.getValue(); } catch (e2) { continue; }
    if (typeof v !== 'string') continue;
    if (v.indexOf('textEditValue') >= 0) {
      try {
        var obj = EF.json.parse(v);
        obj.textEditValue = text;
        if (opts && opts.fontSize) obj.fontSizeEditValue = [opts.fontSize];
        if (opts && opts.font) obj.fontEditValue = [opts.font];
        p.setValue(EF.json.stringify(obj), true); set++;
      } catch (e3) {}
    } else if (set === 0 && /text|title|\u0646\u0635/i.test(p.displayName)) {
      try { p.setValue(text, true); set++; } catch (e4) {}
    }
    if (set > 0 && !(opts && opts.all)) break;
  }
  return set;
};

EFAPI.importMGT = function (a) {
  var seq = EF.seq(), t = (a.time === undefined || a.time === null) ? EF.sec(seq.getPlayerPosition()) : a.time;
  var dur = a.duration || 3;
  var ti = (a.track === undefined || a.track === null || a.track < 0) ? EF.pickTrack(seq, 'video', t, t + dur, 1) : a.track;
  var clip = seq.importMGT(a.path, EF.secToTicks(t), ti, 0);
  if (!clip) throw new Error('importMGT failed');
  try { clip.end = EF.timeObj(t + dur); } catch (e) {}
  var set = a.text ? EF.setMgtText(clip, a.text, a) : 0;
  return { track: ti, start: t, end: t + dur, textSet: set > 0, name: clip.name };
};

/* ---------------- multicam ---------------- */
/** a: { plan:[{start,end,trackIndex}], tracks:[video track indexes], clone } */
EFAPI.multicamApply = function (a) {
  var cloneInfo = a.clone ? EFAPI.cloneSequence({ name: a.cloneName }) : null;
  var seq = EF.seq(), qseq = EF.qeSeq(), fps = EF.fps(seq), i, j, s, tc, c, disabled = 0, enabled = 0;
  for (i = 1; i < a.plan.length; i++) {
    tc = EF.timecode(seq, EF.snap(a.plan[i].start, fps));
    for (j = 0; j < a.tracks.length; j++) qseq.getVideoTrackAt(a.tracks[j]).razor(tc);
  }
  for (i = 0; i < a.plan.length; i++) {
    s = a.plan[i];
    var mid = (EF.snap(s.start, fps) + EF.snap(s.end, fps)) / 2;
    for (j = 0; j < a.tracks.length; j++) {
      c = EF.clipAt(seq.videoTracks[a.tracks[j]], mid);
      if (!c) continue;
      var off = (a.tracks[j] !== s.trackIndex) && s.trackIndex >= 0;
      try { c.disabled = off; if (off) disabled++; else enabled++; } catch (e) {}
    }
  }
  return { switches: Math.max(0, a.plan.length - 1), disabled: disabled, enabled: enabled, sequence: cloneInfo ? cloneInfo.name : seq.name };
};

/* ---------------- hook ---------------- */
/** Copy timeline range [start,end] of the main clip to the very beginning (on a copy of the sequence). */
EFAPI.makeHook = function (a) {
  var cloneInfo = a.clone === false ? null : EFAPI.cloneSequence({ name: a.cloneName });
  var seq = EF.seq(), clip = EF.findVideoClip(seq, a.start + 0.01, a.track === undefined ? 0 : a.track);
  if (!clip) throw new Error('no clip at hook start');
  var item = clip.projectItem, srcIn = EF.sec(clip.inPoint) + (a.start - EF.sec(clip.start));
  var len = Math.min(a.end, EF.sec(clip.end)) - a.start;
  item.setInPoint(srcIn, 4);
  item.setOutPoint(srcIn + len, 4);
  seq.videoTracks[a.track === undefined ? 0 : a.track].insertClip(item, 0);
  try { item.clearInPoint(); item.clearOutPoint(); } catch (e) {}
  return { length: len, sequence: cloneInfo ? cloneInfo.name : seq.name };
};

/* ---------------- history / undo helpers ---------------- */
EFAPI.activeSequenceId = function () { var s = app.project.activeSequence; return { id: s ? s.sequenceID : null, name: s ? s.name : null }; };

EFAPI.openSequence = function (a) {
  var i, s;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    s = app.project.sequences[i];
    if (s.sequenceID === a.id) { app.project.openSequence(s.sequenceID); return { name: s.name }; }
  }
  throw new Error('sequence not found');
};

/** Remove the clip we placed (matched by track + start + media path), no ripple. */
/** undo for placeFiles: remove the clips of those files on one track (a: {kind, track, paths}) */
EFAPI.removeClips = function (a) {
  var seq = EF.seq(), tracks = EF.tracks(seq, a.kind || 'video'), want = {}, i, c, n = 0, tr;
  if (a.track < 0 || a.track >= tracks.numTracks) return { removed: 0 };
  for (i = 0; i < a.paths.length; i++) want[EF.normPath(a.paths[i])] = 1;
  tr = tracks[a.track];
  for (i = tr.clips.numItems - 1; i >= 0; i--) { c = tr.clips[i]; if (want[EF.normPath(EF.mediaPath(c.projectItem))]) { c.remove(false, false); n++; } }
  return { removed: n };
};

EFAPI.removeClip = function (a) {
  var seq = EF.seq(), tracks = EF.tracks(seq, a.kind || 'video'), tr, i, c, norm = EF.normPath(a.path || '');
  if (a.track >= tracks.numTracks) return { removed: 0 };
  tr = tracks[a.track];
  for (i = tr.clips.numItems - 1; i >= 0; i--) {
    c = tr.clips[i];
    if (Math.abs(EF.sec(c.start) - a.start) < 0.02 && (!norm || EF.normPath(EF.mediaPath(c.projectItem)) === norm)) { c.remove(false, false); return { removed: 1 }; }
  }
  return { removed: 0 };
};

EFAPI.removeMarkers = function (a) {
  var seq = EF.seq(), list = EF.markerList(seq), n = 0, i, j, m, want;
  for (j = 0; j < a.markers.length; j++) {
    want = a.markers[j];
    m = seq.markers.getFirstMarker();
    while (m) {
      if (Math.abs(EF.sec(m.start) - want.time) < 0.02 && (!want.name || m.name === want.name)) { seq.markers.deleteMarker(m); n++; break; }
      m = seq.markers.getNextMarker(m);
    }
  }
  return { removed: n, before: list.length };
};

/* ---------------- audio ---------------- */
EFAPI.muteTrack = function (a) {
  var seq = EF.seq(), tr = seq.audioTracks[a.track];
  if (!tr) throw new Error('no audio track ' + a.track);
  tr.setMute(a.mute ? 1 : 0);
  return { track: a.track, mute: !!a.mute };
};

// Premiere's Volume \u203a Level value \u2194 dB (0 dB = 0.1778\u2026)
EF.levelToDb = function (v) { return 20 * Math.log(Math.max(v, 1e-6)) / Math.LN10 + 15; };
EF.dbToLevel = function (db) { return Math.pow(10, (db - 15) / 20); };

/** a: { track, clipStart, keys:[{t (timeline s), db (relative to the clip's current level)}] } */
EFAPI.setVolumeKeys = function (a) {
  var seq = EF.seq(), tr = seq.audioTracks[a.track], clip = null, i, j, comp = null, p = null;
  for (i = 0; i < tr.clips.numItems; i++) if (Math.abs(EF.sec(tr.clips[i].start) - a.clipStart) < 0.02) clip = tr.clips[i];
  if (!clip) throw new Error('no audio clip at ' + a.clipStart);
  for (i = 0; i < clip.components.numItems; i++) {
    comp = clip.components[i];
    if (comp.displayName === 'Volume' || comp.matchName === 'Internal Volume Stereo' || comp.matchName === 'Internal Volume Mono') {
      for (j = 0; j < comp.properties.numItems; j++) if (comp.properties[j].displayName === 'Level') { p = comp.properties[j]; break; }
      if (!p && comp.properties.numItems > 1) p = comp.properties[1];
      if (p) break;
    }
  }
  if (!p) throw new Error('Volume \u203a Level not found');
  var baseLevel = p.getValue(), ks, k2, v2;
  if (p.isTimeVarying()) {
    // ducked before: the loudest key is the music's real level. Clear the old keys so ducking twice doesn't stack.
    ks = p.getKeys(); baseLevel = null;
    for (k2 = 0; ks && k2 < ks.length; k2++) { v2 = p.getValueAtKey(ks[k2]); if (baseLevel === null || v2 > baseLevel) baseLevel = v2; }
    if (baseLevel === null) baseLevel = p.getValue();
    try { p.setTimeVarying(false, false); p.setValue(baseLevel, false); } catch (e0) {}
  }
  var baseDb = EF.levelToDb(baseLevel);
  var off = EF.sec(clip.inPoint) - EF.sec(clip.start), kt;
  if (!p.isTimeVarying()) p.setTimeVarying(true, false);
  for (i = 0; i < a.keys.length; i++) {
    kt = a.keys[i].t + off;
    p.addKey(kt);
    p.setValueAtKey(kt, EF.dbToLevel(baseDb + a.keys[i].db), i === a.keys.length - 1);
  }
  return { keys: a.keys.length, baseDb: Math.round(baseDb * 10) / 10 };
};

/* EditFast Link: project items whose media is offline (missing on disk) */
EFAPI.listOffline = function () {
  var all = EF.walk(app.project.rootItem, '', []), out = [], i, it, off;
  for (i = 0; i < all.length; i++) {
    if (all[i].isBin) continue;
    it = all[i].item; off = false;
    try { off = it.isOffline(); } catch (e) { off = false; }
    if (!off) continue;
    try { if (it.isSequence()) continue; } catch (e2) {}
    out.push({ id: it.nodeId, name: it.name, path: EF.mediaPath(it), bin: all[i].bin });
  }
  return { items: out };
};

EFAPI.relinkMedia = function (a) {
  var it = EF.findByNodeId(a.id);
  if (!it) throw new Error('item not found: ' + a.id);
  try { if (it.canChangeMediaPath && !it.canChangeMediaPath()) throw new Error('cannot relink ' + it.name); } catch (e) { if (/cannot relink/.test(e.message)) throw e; }
  var ok = it.changeMediaPath(a.path, true);
  if (ok === false) throw new Error('relink refused: ' + it.name);
  return { name: it.name, path: a.path };
};

EFAPI.projectPath = function () { return { path: app.project.path || '' }; };
EFAPI.importFiles = function (a) { return { imported: EF.importMany(a.paths, a.bin || 'EditFast').length }; };

/* ---------------- reels ---------------- */
/** New sequence from rendered files (its size comes from the first file, e.g. 1080\u00d71920). a: {name, items:[{path,time}], bin} */
EFAPI.createSequenceFromClips = function (a) {
  var bin = EF.ensureBin(a.bin || 'EditFast'), items, i, seq, paths = [];
  for (i = 0; i < a.items.length; i++) paths.push(a.items[i].path);
  items = EF.importMany(paths, a.bin || 'EditFast');
  seq = app.project.createNewSequenceFromClips(a.name, [items[0]], bin);
  if (!seq) throw new Error('createNewSequenceFromClips failed');
  app.project.openSequence(seq.sequenceID);
  seq = app.project.activeSequence;
  for (i = 1; i < items.length; i++) seq.videoTracks[0].overwriteClip(items[i], a.items[i].time);
  return { name: seq.name, id: seq.sequenceID, clips: items.length };
};

/**
 * Editable scene: the layers go into their own sequence (one track per layer, each at its own time),
 * and that sequence is nested into the active sequence at `time`.
 * a: { name, bin, time, minTrack, duration, layers: [{ path, start, duration, name }] }
 */
EFAPI.buildLayeredScene = function (a) {
  var main = EF.seq(), mainId = main.sequenceID, i, j, k, tr, items = [];
  var t = a.time === undefined || a.time === null ? EF.sec(main.getPlayerPosition()) : a.time;
  var binPath = a.bin || 'EditFast/Pro Scenes';
  var lpaths = []; for (i = 0; i < a.layers.length; i++) lpaths.push(a.layers[i].path);
  items = EF.importMany(lpaths, binPath + '/' + a.name);
  var nest = app.project.createNewSequenceFromClips(a.name, [items[0]], EF.ensureBin(binPath));
  if (!nest) throw new Error('createNewSequenceFromClips failed');
  app.project.openSequence(nest.sequenceID);
  nest = app.project.activeSequence;
  // start clean: the helper put the first file on V1/A1
  for (k = 0; k < 2; k++) {
    var all = EF.tracks(nest, k ? 'audio' : 'video');
    for (i = 0; i < all.numTracks; i++) { tr = all[i]; for (j = tr.clips.numItems - 1; j >= 0; j--) tr.clips[j].remove(false, false); }
  }
  var vt = EF.tracks(nest, 'video');
  while (vt.numTracks < a.layers.length) { if (!EF.addTrack(nest, 'video')) break; vt = EF.tracks(nest, 'video'); }
  var nfps = EF.fps(nest);
  for (i = 0; i < a.layers.length; i++) {
    var L = a.layers[i], ti = i < vt.numTracks ? i : EF.pickTrack(nest, 'video', L.start, L.start + (L.duration || 5), 0);
    EF.layItem(nest, items[i], 'video', ti, L.start, L.duration || 0, nfps);
  }
  var nestId = nest.sequenceID, nestItem = nest.projectItem;
  app.project.openSequence(mainId);
  main = app.project.activeSequence;
  var dur = a.duration || 5;
  var mi = EF.pickTrack(main, 'video', t, t + dur, a.minTrack || 1);
  var placed = EF.layItem(main, nestItem, 'video', mi, t, dur, EF.fps(main));
  return { track: mi, start: t, end: placed ? EF.sec(placed.end) : t + dur, name: a.name, sequenceId: nestId, layers: a.layers.length };
};

/** Put an existing sequence (a nested scene) back on the timeline. */
EFAPI.placeSequence = function (a) {
  var seq = EF.seq(), i, item = null;
  for (i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].sequenceID === a.id) item = app.project.sequences[i].projectItem;
  if (!item) throw new Error('sequence not found: ' + a.id);
  var dur = a.duration || EF.itemDuration(item) || 5, ti = a.track >= 0 ? a.track : EF.pickTrack(seq, 'video', a.time, a.time + dur, a.minTrack || 1);
  EF.layItem(seq, item, 'video', ti, a.time, a.duration || 0, EF.fps(seq));
  return { track: ti, start: a.time };
};


/* ---------------- self-test: every Premiere call the extension depends on, on a throwaway sequence ---------------- */
/** a: { video, still, srt }  \u2192 { env, probes:[{id, ok, ms, detail}] } \u2014 the user's own sequences are not touched */
EFAPI.selfTest = function (a) {
  var out = [], env = {}, orig = app.project.activeSequence, origId = orig ? orig.sequenceID : null, bin = null, seq = null, items = null, q = null, k;
  function probe(id, fn) {
    var t0 = new Date().getTime(), r = { id: id, ok: false };
    try { var d = fn(); r.ok = d !== false; if (d !== undefined && d !== true && d !== false) r.detail = String(d); }
    catch (e) { r.ok = false; r.detail = String(e && e.message ? e.message : e) + (e && e.line ? ' (line ' + e.line + ')' : ''); }
    r.ms = new Date().getTime() - t0; out.push(r); return r.ok;
  }
  env.app = app.name || ''; env.version = app.version || '';
  try { env.os = $.os; } catch (e0) {}
  try { env.build = app.build || ''; } catch (e1) {}
  env.project = app.project.path || '';
  env.hasSequence = !!orig;
  probe('qe', function () { app.enableQE(); return typeof qe !== 'undefined' && !!qe.project; });
  probe('bin', function () { bin = EF.ensureBin('EditFast Self-Test'); return !!bin; });
  probe('import', function () { items = EF.importMany([a.video, a.still, a.srt], 'EditFast Self-Test'); return items.length === 3; });
  probe('newSequence', function () {
    seq = app.project.createNewSequenceFromClips('EditFast Self-Test', [items[0]], bin);
    if (!seq) return false;
    app.project.openSequence(seq.sequenceID);
    for (k = 0; k < 20 && (!app.project.activeSequence || app.project.activeSequence.sequenceID !== seq.sequenceID); k++) $.sleep(100);
    seq = app.project.activeSequence;
    return seq && seq.videoTracks[0].clips.numItems > 0;
  });
  if (seq) {
    var fps = EF.fps(seq);
    probe('settings', function () { var st = seq.getSettings(); return st.videoFrameWidth + 'x' + st.videoFrameHeight + ' @ ' + Math.round(fps * 100) / 100; });
    probe('addTrack', function () { var n = seq.videoTracks.numTracks; return EF.addTrack(seq, 'video') ? (n + ' -> ' + seq.videoTracks.numTracks) : false; });
    probe('placeStill', function () {
      var ti = EF.pickTrack(seq, 'video', 0.4, 1.4, 1), c = EF.layItem(seq, items[1], 'video', ti, 0.4, 1, fps);
      if (!c) return false;
      var d = EF.sec(c.end) - EF.sec(c.start);
      if (Math.abs(d - 1) > 1.5 / fps) throw new Error('still lasted ' + Math.round(d * 100) / 100 + 's instead of 1s');
      return 'V' + (ti + 1);
    });
    probe('clipEnd', function () { var c = seq.videoTracks[0].clips[0], e = EF.sec(c.end); c.end = EF.timeObj(e - 0.2); var ok = Math.abs(EF.sec(c.end) - (e - 0.2)) < 1.5 / fps; c.end = EF.timeObj(e); return ok; });
    probe('markers', function () { var m = seq.markers.createMarker(0.5); m.name = 'EF test'; m.setColorByIndex(4, 0); return seq.markers.numMarkers > 0; });
    probe('razor', function () {
      q = EF.qeSeq();
      var before = seq.videoTracks[0].clips.numItems;
      q.getVideoTrackAt(0).razor(EF.timecode(seq, EF.snap(1, fps)));
      return seq.videoTracks[0].clips.numItems > before ? true : 'clips: ' + before + ' -> ' + seq.videoTracks[0].clips.numItems;
    });
    probe('rippleDelete', function () {
      var tr = seq.videoTracks[0];
      if (tr.clips.numItems < 2) return false;
      var second = EF.sec(tr.clips[1].start); tr.clips[0].remove(true, true);
      return EF.sec(tr.clips[0].start) < second - 0.01;
    });
    probe('transform', function () {
      var c = seq.videoTracks[0].clips[0], comp = EF.ensureTransform(seq, c, 0);
      if (!comp) throw new Error('Transform effect not added (non-English Premiere? effect name differs)');
      var p = EF.prop(comp, EF.PROPS.transform, 'scale');
      p.setTimeVarying(true, false); p.addKey(EF.sec(c.inPoint) + 0.1); p.setValueAtKey(EF.sec(c.inPoint) + 0.1, 120, true);
      return true;
    });
    probe('audioTransition', function () { return !!qe.project.getAudioTransitionByName('Constant Power'); });
    probe('captions', function () {
      if (typeof seq.createCaptionTrack !== 'function') throw new Error('createCaptionTrack missing');
      var r = seq.createCaptionTrack(items[2], 0, Sequence.CAPTION_FORMAT_SUBTITLE);
      return r === false ? false : true;
    });
    probe('clone', function () {
      var n = app.project.sequences.numSequences; seq.clone();
      for (k = 0; k < 20 && app.project.sequences.numSequences === n; k++) $.sleep(100);
      return app.project.sequences.numSequences > n;
    });
  }
  // clean up: test sequences + bin, then back to where the user was
  probe('cleanup', function () {
    var i, s2, gone = 0;
    for (i = app.project.sequences.numSequences - 1; i >= 0; i--) {
      s2 = app.project.sequences[i];
      if (s2 && String(s2.name).substring(0, 18) === 'EditFast Self-Test') { try { app.project.deleteSequence(s2); gone++; } catch (e) {} }
    }
    if (bin) { try { bin.deleteBin(); } catch (e2) {} }
    if (origId) app.project.openSequence(origId);
    return gone + ' removed';
  });
  return { env: env, probes: out };
};

/* ---------------- dispatcher ---------------- */
function ef_call(name, jsonArgs) {
  try {
    if (!EFAPI.hasOwnProperty(name)) throw new Error('unknown host function ' + name);
    var data = EFAPI[name](EF.json.parse(jsonArgs));
    return EF.json.stringify({ ok: true, data: data });
  } catch (e) {
    return EF.json.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line, fn: name });
  }
}

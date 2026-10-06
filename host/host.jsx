/* EditFast — ExtendScript host for Adobe Premiere Pro.
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
  if (!s) throw new Error('افتح سيكوينس الأول'); // افتح سيكوينس الأول
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

EF.importFile = function (path, binPath) {
  var item = EF.findByPath(path);
  if (item) return item;
  var bin = EF.ensureBin(binPath || 'EditFast');
  app.project.importFiles([path], true, bin, false);
  item = EF.findByPath(path);
  if (!item) throw new Error('import failed: ' + path);
  return item;
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
  var seq = EF.seq(), before = app.project.sequences.numSequences, i, s, newest = null;
  seq.clone();
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    s = app.project.sequences[i];
    if (s.sequenceID !== seq.sequenceID && s.name.indexOf(seq.name) === 0) newest = s;
  }
  if (!newest && app.project.sequences.numSequences > before) newest = app.project.sequences[app.project.sequences.numSequences - 1];
  if (!newest) throw new Error('clone failed');
  if (a && a.name) { try { newest.name = a.name; } catch (e) {} }
  app.project.openSequence(newest.sequenceID);
  return { name: newest.name, id: newest.sequenceID };
};

/** Razor every unlocked track at time s. */
EF.razorAll = function (seq, qseq, s) {
  var tc = EF.timecode(seq, s), i, n = 0;
  for (i = 0; i < seq.videoTracks.numTracks; i++) if (!EF.isLocked(seq.videoTracks[i])) { qseq.getVideoTrackAt(i).razor(tc); n++; }
  for (i = 0; i < seq.audioTracks.numTracks; i++) if (!EF.isLocked(seq.audioTracks[i])) { qseq.getAudioTrackAt(i).razor(tc); n++; }
  return n;
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
  rs.sort(function (x, y) { return y.start - x.start; }); // from the end → earlier times stay valid
  // 1) razor at every boundary
  for (i = 0; i < rs.length; i++) { EF.razorAll(seq, qseq, rs[i].end); EF.razorAll(seq, qseq, rs[i].start); }
  // 2) remove + ripple, range by range from the end
  var kinds = ['video', 'audio'], cutPoints = [];
  for (i = 0; i < rs.length; i++) {
    r = rs[i];
    var len = r.end - r.start;
    for (k = 0; k < kinds.length; k++) {
      var tracks = EF.tracks(seq, kinds[k]);
      for (j = 0; j < tracks.numTracks; j++) {
        var tr = tracks[j];
        if (EF.isLocked(tr)) continue;
        var victims = [], later = [], c, ci;
        for (ci = 0; ci < tr.clips.numItems; ci++) {
          c = tr.clips[ci];
          if (EF.sec(c.start) >= r.start - 0.001 && EF.sec(c.end) <= r.end + 0.001) victims.push(c);
          else if (EF.sec(c.start) >= r.end - 0.001) later.push(c);
        }
        if (victims.length) {
          for (ci = victims.length - 1; ci >= 0; ci--) { victims[ci].remove(true, true); removed++; }
        } else if (later.length) {
          // nothing to delete on this track (gap) → shift later clips left so tracks stay in sync
          for (ci = 0; ci < later.length; ci++) { try { later[ci].move(EF.timeObj(-len)); } catch (e) {} }
        }
      }
    }
    cutPoints.push(r.start);
  }
  // 3) tiny audio crossfades at the joins so cuts don't click
  var fades = 0;
  if (a.crossfadeFrames && a.crossfadeFrames > 0) fades = EF.addAudioFades(seq, cutPoints, a.crossfadeFrames, rs);
  return { removed: removed, ranges: rs.length, crossfades: fades, sequence: cloneInfo ? cloneInfo.name : seq.name };
};

EF.addAudioFades = function (seq, cutPointsOriginal, frames, rangesDesc) {
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
    if (EF.isLocked(seq.audioTracks[i])) continue;
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

EFAPI.addMarkers = function (a) {
  var seq = EF.seq(), i, m, mk, n = 0;
  for (i = 0; i < a.markers.length; i++) {
    m = a.markers[i];
    mk = seq.markers.createMarker(m.time);
    if (m.name) mk.name = m.name;
    if (m.comment) mk.comments = m.comment;
    if (m.duration) { try { mk.end = EF.timeObj(m.time + m.duration); } catch (e) {} }
    if (m.color !== undefined) { try { mk.setColorByIndex(m.color, 0); } catch (e2) {} }
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

EF.pickTrack = function (seq, kind, a, b, minIndex) {
  var tracks = EF.tracks(seq, kind), i;
  for (i = minIndex; i < tracks.numTracks; i++) if (!EF.isLocked(tracks[i]) && EF.trackFree(tracks[i], a, b)) return i;
  try { // add a new track on top
    var q = EF.qeSeq();
    if (kind === 'video') q.addTracks(1, tracks.numTracks, 0); else q.addTracks(0, 0, 1, 1, tracks.numTracks);
  } catch (e) {}
  tracks = EF.tracks(seq, kind);
  return Math.max(minIndex, tracks.numTracks - 1);
};

/**
 * Import a file (if needed) and place it on the timeline.
 * a: { path, time, kind: 'video'|'audio', track (-1 auto), duration, bin }
 */
EFAPI.placeFile = function (a) {
  var seq = EF.seq(), item = EF.importFile(a.path, a.bin || 'EditFast'), kind = a.kind || 'video';
  var t = a.time === undefined || a.time === null ? EF.sec(seq.getPlayerPosition()) : a.time;
  var dur = a.duration || 5;
  var ti = (a.track === undefined || a.track === null || a.track < 0) ? EF.pickTrack(seq, kind, t, t + dur, a.minTrack || 1) : a.track;
  var tracks = EF.tracks(seq, kind);
  tracks[ti].overwriteClip(item, t);
  var clip = EF.clipAt(tracks[ti], t + 0.01);
  if (clip && a.duration) { try { clip.end = EF.timeObj(t + a.duration); } catch (e) {} }
  return { track: ti, start: t, end: clip ? EF.sec(clip.end) : t + dur, name: item.name };
};

EFAPI.createCaptions = function (a) {
  var seq = EF.seq(), item = EF.importFile(a.srtPath, 'EditFast/Captions');
  var fmt = (typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE) ? Sequence.CAPTION_FORMAT_SUBTITLE : 'Subtitle Default';
  seq.createCaptionTrack(item, a.start || 0, fmt);
  return { ok: true, item: item.name };
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
  if (!clip) throw new Error('مفيش كليب فيديو عند الوقت ده'); // مفيش كليب فيديو عند الوقت ده
  var trackIndex = (a.track !== undefined && a.track !== null && a.track >= 0) ? a.track : EF.trackIndexOf(seq, clip);
  var cs = EF.sec(clip.start), ce = EF.sec(clip.end), dur = a.duration || 0.5;
  var anchor = a.mode === 'in' ? cs : a.mode === 'out' ? Math.max(cs, ce - dur) : Math.max(cs, Math.min(t, ce - 0.04));
  var comp = EF.ensureTransform(seq, clip, trackIndex), map = EF.PROPS.transform, usingMotion = false;
  if (!comp) { comp = EF.findComponent(clip, 'AE.ADBE Motion', 'Motion'); map = EF.PROPS.motion; usingMotion = true; }
  if (!comp) throw new Error('no Transform/Motion component');
  var w = 1920, h = 1080;
  try { var st = seq.getSettings(); w = st.videoFrameWidth; h = st.videoFrameHeight; } catch (e) {}
  var mediaOffset = EF.sec(clip.inPoint) - cs; // timeline → clip media time
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
      p.setValueAtKey(kt, v, true);
      try { p.setInterpolationTypeAtKey(kt, interp, true); } catch (e3) {}
      written++;
    }
  }
  return { keys: written, clip: clip.name, start: anchor, component: usingMotion ? 'Motion' : 'Transform' };
};

/** Read every keyframed property of the selected clip (or clip at time). Times returned in timeline seconds. */
EFAPI.readKeyframes = function (a) {
  var seq = EF.seq(), clip = EF.selectedClip(seq);
  if (!clip) clip = EF.findVideoClip(seq, (a && a.time !== undefined) ? a.time : EF.sec(seq.getPlayerPosition()), a && a.track);
  if (!clip) throw new Error('اختار كليب الأول'); // اختار كليب الأول
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
    } else if (set === 0 && /text|title|نص/i.test(p.displayName)) {
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
EFAPI.removeClip = function (a) {
  var seq = EF.seq(), tracks = EF.tracks(seq, a.kind || 'video'), tr, i, c, norm = String(a.path || '').replace(/\\/g, '/').toLowerCase();
  if (a.track >= tracks.numTracks) return { removed: 0 };
  tr = tracks[a.track];
  for (i = tr.clips.numItems - 1; i >= 0; i--) {
    c = tr.clips[i];
    if (Math.abs(EF.sec(c.start) - a.start) < 0.02 && (!norm || String(EF.mediaPath(c.projectItem)).replace(/\\/g, '/').toLowerCase() === norm)) { c.remove(false, false); return { removed: 1 }; }
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

// Premiere's Volume › Level value ↔ dB (0 dB = 0.1778…)
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
  if (!p) throw new Error('Volume › Level not found');
  var baseDb = EF.levelToDb(p.isTimeVarying() ? p.getValueAtKey(p.getKeys()[0]) : p.getValue());
  var off = EF.sec(clip.inPoint) - EF.sec(clip.start), kt;
  if (!p.isTimeVarying()) p.setTimeVarying(true, true);
  for (i = 0; i < a.keys.length; i++) {
    kt = a.keys[i].t + off;
    p.addKey(kt);
    p.setValueAtKey(kt, EF.dbToLevel(baseDb + a.keys[i].db), true);
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
EFAPI.importFiles = function (a) { var i, n = 0; for (i = 0; i < a.paths.length; i++) { EF.importFile(a.paths[i], a.bin || 'EditFast'); n++; } return { imported: n }; };

/* ---------------- reels ---------------- */
/** New sequence from rendered files (its size comes from the first file, e.g. 1080×1920). a: {name, items:[{path,time}], bin} */
EFAPI.createSequenceFromClips = function (a) {
  var bin = EF.ensureBin(a.bin || 'EditFast'), items = [], i, seq;
  for (i = 0; i < a.items.length; i++) items.push(EF.importFile(a.items[i].path, a.bin || 'EditFast'));
  seq = app.project.createNewSequenceFromClips(a.name, [items[0]], bin);
  if (!seq) throw new Error('createNewSequenceFromClips failed');
  app.project.openSequence(seq.sequenceID);
  seq = app.project.activeSequence;
  for (i = 1; i < items.length; i++) seq.videoTracks[0].overwriteClip(items[i], a.items[i].time);
  return { name: seq.name, id: seq.sequenceID, clips: items.length };
};

/* ---------------- dispatcher ---------------- */
function ef_call(name, jsonArgs) {
  try {
    if (!EFAPI.hasOwnProperty(name)) throw new Error('unknown host function ' + name);
    var data = EFAPI[name](EF.json.parse(jsonArgs));
    return EF.json.stringify({ ok: true, data: data });
  } catch (e) {
    return EF.json.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line });
  }
}

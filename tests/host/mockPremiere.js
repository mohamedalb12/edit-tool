'use strict';
// محاكي صغير لـ DOM بتاع Premiere Pro ExtendScript (+ QE) عشان نختبر host.jsx من غير بريمير.
// بيحاكي السلوك المهم: razor بيقسم الكليب، remove(ripple) بيقفّل الفراغ في نفس التراك، الكي فريمز بوقت الميديا، البنز، الـ MOGRT.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TICKS = 254016000000;
const EPS = 1e-6;
let NODE = 1;

class Time {
  constructor() { this._s = 0; }
  get seconds() { return this._s; }
  set seconds(v) { this._s = +v; }
  get ticks() { return String(Math.round(this._s * TICKS)); }
  set ticks(v) { this._s = parseFloat(v) / TICKS; }
  getFormatted() { return '@' + this._s.toFixed(6); } // mock timecode: QE razor parses it back
}
const T = s => { const t = new Time(); t.seconds = s; return t; };
const fromTc = tc => parseFloat(String(tc).slice(1));

function collection(arrFn, key = 'numItems') {
  return new Proxy({}, {
    get(_, k) {
      const arr = arrFn();
      if (k === key) return arr.length;
      if (k === 'length') return arr.length;
      if (typeof k === 'string' && /^\d+$/.test(k)) return arr[+k];
      return undefined;
    }
  });
}

class Property {
  constructor(name, value) { this.displayName = name; this.value = value; this.varying = false; this.keys = []; this.log = []; }
  getValue() { return this.value; }
  setValue(v) { this.value = v; this.log.push(['setValue', v]); }
  isTimeVarying() { return this.varying; }
  setTimeVarying(v) { this.varying = v; if (!v) this.keys = []; }
  addKey(t) { if (!this.varying) throw new Error('not time varying'); if (!this.keys.find(k => Math.abs(k.t - t) < EPS)) this.keys.push({ t, v: this.value, interp: 0 }); this.keys.sort((a, b) => a.t - b.t); }
  key(t) { const k = this.keys.find(k => Math.abs(k.t - t) < 1e-4); if (!k) throw new Error('no key at ' + t); return k; }
  setValueAtKey(t, v) { this.key(t).v = Array.isArray(v) ? v.slice() : v; }
  getValueAtKey(t) { return this.key(EF_sec(t)).v; }
  setInterpolationTypeAtKey(t, type) { this.key(t).interp = type; }
  getKeys() { return this.keys.map(k => T(k.t)); }
  removeKeyRange(a, b) { this.keys = this.keys.filter(k => k.t < a - EPS || k.t > b + EPS); }
}
function EF_sec(t) { return typeof t === 'number' ? t : t.seconds; }

class Component {
  constructor(displayName, matchName, props) { this.displayName = displayName; this.matchName = matchName; this.props = props; this.properties = collection(() => this.props); }
}

function motionComponent() { return new Component('Motion', 'AE.ADBE Motion', [new Property('Position', [0.5, 0.5]), new Property('Scale', 100), new Property('Scale Width', 100), new Property('Uniform Scale', true), new Property('Rotation', 0), new Property('Anchor Point', [0.5, 0.5]), new Property('Anti-flicker Filter', 0)]); }
function opacityComponent() { return new Component('Opacity', 'AE.ADBE Opacity', [new Property('Opacity', 100), new Property('Blend Mode', 0)]); }
function transformComponent() {
  return new Component('Transform', 'AE.ADBE Geometry2', [new Property('Anchor Point', [960, 540]), new Property('Position', [960, 540]), new Property('Uniform Scale', false),
    new Property('Scale', 100), new Property('Scale Width', 100), new Property('Skew', 0), new Property('Skew Axis', 0), new Property('Rotation', 0), new Property('Opacity', 100)]);
}

class ProjectItem {
  constructor({ name, type = 1, mediaPath = '', isSeq = false, parent = null }) {
    this.name = name; this.type = type; this.mediaPath = mediaPath; this._isSeq = isSeq; this.parent = parent;
    this.nodeId = 'n' + (NODE++); this.kids = []; this.children = collection(() => this.kids);
    this.inPoint = null; this.outPoint = null; this.mgt = /\.mogrt$/i.test(mediaPath);
  }
  getMediaPath() { return this.mediaPath; }
  isSequence() { return this._isSeq; }
  createBin(name) { const b = new ProjectItem({ name, type: 2, parent: this }); this.kids.push(b); return b; }
  moveBin(bin) { this.parent.kids = this.parent.kids.filter(k => k !== this); this.parent = bin; bin.kids.push(this); }
  setInPoint(s) { this.inPoint = s; }
  setOutPoint(s) { this.outPoint = s; }
  clearInPoint() { this.inPoint = null; }
  clearOutPoint() { this.outPoint = null; }
}

class TrackItem {
  constructor(track, { projectItem, start, end, inPoint = 0, name }) {
    this.track = track; this.projectItem = projectItem; this._start = start; this._end = end; this._in = inPoint;
    this.name = name || projectItem.name; this.disabled = false; this.selected = false;
    this.mediaType = track.kind === 'audio' ? 'Audio' : 'Video';
    this.comps = track.kind === 'video' ? [opacityComponent(), motionComponent()] : [];
    this.components = collection(() => this.comps);
    this.mgtComp = null;
  }
  get nodeId() { return this.projectItem.nodeId; }
  get start() { return T(this._start); }
  get end() { return T(this._end); }
  set end(t) { this._end = EF_sec(t); }
  get inPoint() { return T(this._in); }
  get outPoint() { return T(this._in + this._end - this._start); }
  isSelected() { return this.selected; }
  remove(ripple) {
    const tr = this.track; const len = this._end - this._start;
    tr.items = tr.items.filter(c => c !== this);
    if (ripple) tr.items.forEach(c => { if (c._start >= this._end - EPS) { c._start -= len; c._end -= len; } });
    tr.seq.log.push(['remove', tr.kind, tr.index, +this._start.toFixed(4), +this._end.toFixed(4), ripple]);
  }
  move(t) { const d = EF_sec(t); this._start += d; this._end += d; }
  getMGTComponent() { return this.mgtComp; }
}

class Track {
  constructor(seq, kind, index) { this.seq = seq; this.kind = kind; this.index = index; this.items = []; this.name = (kind === 'video' ? 'V' : 'A') + (index + 1); this.locked = false; this.clips = collection(() => this.items.slice().sort((a, b) => a._start - b._start)); }
  isLocked() { return this.locked; }
  add(opts) { const c = new TrackItem(this, opts); this.items.push(c); return c; }
  razor(s) {
    const c = this.items.find(c => c._start + 1e-4 < s && s < c._end - 1e-4);
    if (!c) return;
    const right = new TrackItem(this, { projectItem: c.projectItem, start: s, end: c._end, inPoint: c._in + (s - c._start), name: c.name });
    right.comps = c.comps; right.disabled = c.disabled;
    c._end = s; this.items.push(right);
  }
  overwriteClip(item, t) {
    const len = item.mediaPath.match(/\.(png|jpg)$/i) ? 5 : (item.duration || 10);
    const a = EF_sec(t), b = a + len;
    this.items = this.items.filter(c => !(c._start >= a - EPS && c._end <= b + EPS));
    const c = this.add({ projectItem: item, start: a, end: b, inPoint: 0 });
    this.seq.log.push(['overwrite', this.kind, this.index, a, item.name]);
    return c;
  }
  insertClip(item, t) {
    const a = EF_sec(t), len = (item.outPoint ?? 10) - (item.inPoint ?? 0);
    this.items.forEach(c => { if (c._start >= a - EPS) { c._start += len; c._end += len; } });
    this.add({ projectItem: item, start: a, end: a + len, inPoint: item.inPoint ?? 0 });
    this.seq.log.push(['insert', this.kind, this.index, a, len]);
  }
}

class Sequence {
  constructor(project, name, { video = 3, audio = 3, fps = 25, width = 1920, height = 1080 } = {}) {
    this.project = project; this.name = name; this.sequenceID = 'seq-' + (NODE++); this.fps = fps; this.width = width; this.height = height;
    this.v = []; this.a = []; for (let i = 0; i < video; i++) this.v.push(new Track(this, 'video', i)); for (let i = 0; i < audio; i++) this.a.push(new Track(this, 'audio', i));
    this.videoTracks = collection(() => this.v, 'numTracks'); this.audioTracks = collection(() => this.a, 'numTracks');
    this.player = 0; this.log = []; this.markerList = []; this.captionTracks = [];
    const self = this;
    this.markers = {
      getFirstMarker() { return self.markerList.slice().sort((a, b) => a.start.seconds - b.start.seconds)[0] || null; },
      getNextMarker(m) { const l = self.markerList.slice().sort((a, b) => a.start.seconds - b.start.seconds); return l[l.indexOf(m) + 1] || null; },
      createMarker(s) { const m = { start: T(s), name: '', comments: '', end: T(s), color: null, setColorByIndex(i) { this.color = i; } }; self.markerList.push(m); return m; }, get numMarkers() { return self.markerList.length; } };
    this.projectItem = new ProjectItem({ name, isSeq: true, parent: project.root }); project.root.kids.push(this.projectItem);
  }
  get end() { const all = [...this.v, ...this.a].flatMap(t => t.items.map(c => c._end)); return String(Math.round(Math.max(0, ...all) * TICKS)); }
  get timebase() { return String(TICKS / this.fps); }
  getSettings() { return { videoFrameRate: T(1 / this.fps), videoDisplayFormat: 101, videoFrameWidth: this.width, videoFrameHeight: this.height }; }
  getPlayerPosition() { return T(this.player); }
  getInPointAsTime() { return T(this.inPoint || 0); }
  getOutPointAsTime() { return T(this.outPoint || 0); }
  setPlayerPosition(ticks) { this.player = parseFloat(ticks) / TICKS; }
  getSelection() { return [...this.v, ...this.a].flatMap(t => t.items.filter(c => c.selected)); }
  clone() {
    const c = new Sequence(this.project, this.name + ' Copy', { video: 0, audio: 0, fps: this.fps });
    const copyTrack = (src, kind, i) => { const t = new Track(c, kind, i); src.items.forEach(x => { const n = t.add({ projectItem: x.projectItem, start: x._start, end: x._end, inPoint: x._in, name: x.name }); n.comps = x.comps; }); return t; };
    c.v = this.v.map((t, i) => copyTrack(t, 'video', i)); c.a = this.a.map((t, i) => copyTrack(t, 'audio', i));
    this.project.seqs.push(c); return true;
  }
  importMGT(p, ticks, vTrack) {
    const item = this.project.importOne(p, this.project.root);
    const s = parseFloat(ticks) / TICKS;
    const clip = this.v[vTrack].add({ projectItem: item, start: s, end: s + 10, inPoint: 0 });
    clip.mgtComp = new Component('Graphic Parameters', 'AE.ADBE Capsule', [new Property('Main Title', JSON.stringify({ textEditValue: 'Title', fontEditValue: ['Arial'], fontSizeEditValue: [80] })), new Property('Color', '#fff')]);
    return clip;
  }
  createCaptionTrack(item, start, fmt) { this.captionTracks.push({ item: item.name, start, fmt }); return true; }
}

function createPremiere() {
  const project = { seqs: [], activeSeq: null };
  project.root = new ProjectItem({ name: 'root', type: 3 });
  project.importOne = (p, bin) => {
    const it = new ProjectItem({ name: path.basename(p), mediaPath: p, parent: bin });
    bin.kids.push(it); return it;
  };
  const qeLog = [];
  const app = {
    name: 'Premiere Pro (mock)', version: '25.0',
    enableQE() {},
    project: {
      get rootItem() { return project.root; },
      get activeSequence() { return project.activeSeq; },
      set activeSequence(s) { project.activeSeq = s; },
      sequences: collection(() => project.seqs, 'numSequences'),
      importFiles(paths, suppress, bin) { paths.forEach(p => project.importOne(p, bin || project.root)); return true; },
      openSequence(id) { project.activeSeq = project.seqs.find(s => s.sequenceID === id); return !!project.activeSeq; }
    }
  };
  const transformFx = { name: 'Transform' };
  const qe = {
    project: {
      getActiveSequence() {
        const seq = project.activeSeq;
        const wrapTrack = (tr) => ({
          razor(tc) { tr.razor(fromTc(tc)); qeLog.push(['razor', tr.kind, tr.index, fromTc(tc)]); },
          get numItems() { return tr.items.length; },
          getItemAt(i) {
            const c = tr.clips[i]; if (!c) return null;
            return { type: 'Clip', name: c.name, start: { secs: c._start },
              addVideoEffect(fx) { if (fx === transformFx) c.comps.push(transformComponent()); qeLog.push(['fx', fx.name, c.name]); },
              addTransition(t, toStart, dur) { qeLog.push(['transition', t.name, tr.index, c._start, dur]); } };
          }
        });
        return {
          getVideoTrackAt(i) { return wrapTrack(seq.v[i]); }, getAudioTrackAt(i) { return wrapTrack(seq.a[i]); },
          addTracks(nv, vi, na) { for (let i = 0; i < nv; i++) seq.v.push(new Track(seq, 'video', seq.v.length)); for (let i = 0; i < (na || 0); i++) seq.a.push(new Track(seq, 'audio', seq.a.length)); }
        };
      },
      getVideoEffectByName(n) { return n === 'Transform' ? transformFx : null; },
      getAudioTransitionByName(n) { return { name: n }; }
    }
  };
  const newSequence = (name, opts) => { const s = new Sequence(project, name, opts); project.seqs.push(s); project.activeSeq = s; return s; };
  return { app, qe, Time, project, newSequence, qeLog, ProjectItemType: { CLIP: 1, BIN: 2, ROOT: 3, FILE: 4 }, Sequence: { CAPTION_FORMAT_SUBTITLE: 'Subtitle Default' } };
}

/** Load host.jsx into a fresh VM context wired to a fresh mock. Returns {call, pr}. */
function loadHost() {
  const pr = createPremiere();
  const ctx = vm.createContext({ app: pr.app, qe: pr.qe, Time: pr.Time, ProjectItemType: pr.ProjectItemType, Sequence: pr.Sequence });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'host', 'host.jsx'), 'utf8'), ctx, { filename: 'host.jsx' });
  const raw = (name, args) => JSON.parse(ctx.ef_call(name, JSON.stringify(args || {})));
  const call = (name, args) => { const r = raw(name, args); if (!r.ok) throw new Error(r.error); return r.data; };
  return { call, raw, pr, ctx };
}

module.exports = { createPremiere, loadHost, Time, T, TICKS };

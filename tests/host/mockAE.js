'use strict';
// A small After Effects simulator for host/ae.jsx: project, comps, layers, the property tree (transform, effects,
// text animators, shape contents), keyframes with temporal ease, expressions, Essential Graphics and MOGRT export.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zip = require('../../core/zip');

const PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
const PVT = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417, COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424 };
const KIT = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
let IDS = 100;

class KeyframeEase { constructor(speed, influence) { this.speed = speed; this.influence = influence; } }

class Prop {
  constructor(matchName, name, value, type, opts = {}) {
    this.matchName = matchName; this.name = name; this.value = value; this.propertyValueType = type;
    this.propertyType = PropertyType.PROPERTY; this.keys = []; this.expression = ''; this.canSetExpression = type !== PVT.NO_VALUE;
    this.isSpatial = type === PVT.TwoD_SPATIAL || type === PVT.ThreeD_SPATIAL; this.dimensionsSeparated = false; this.selectedKeys = [];
    this.parentProperty = null; Object.assign(this, opts);
  }
  get expressionEnabled() { return !!this.expression; }
  get numKeys() { return this.keys.length; }
  get propertyDepth() { let d = 0, p = this.parentProperty; while (p) { d++; p = p.parentProperty; } return d; }
  propertyGroup(n = 1) { let p = this; for (let i = 0; i < n && p; i++) p = p.parentProperty; return p; }
  setValue(v) { if (this.keys.length) throw new Error('setValue on keyframed property'); this.value = clone(v); }
  get value() { return this._v; }
  set value(v) { this._v = clone(v); }
  addKey(t) { let i = this.keys.findIndex(k => Math.abs(k.t - t) < 1e-6); if (i < 0) { this.keys.push({ t, v: clone(this.value), inI: KIT.LINEAR, outI: KIT.LINEAR, inE: null, outE: null }); this.keys.sort((a, b) => a.t - b.t); i = this.keys.findIndex(k => Math.abs(k.t - t) < 1e-6); } return i + 1; }
  removeKey(i) { this.keys.splice(i - 1, 1); }
  setValueAtKey(i, v) { this.keys[i - 1].v = clone(v); }
  setValueAtTime(t, v) { this.setValueAtKey(this.addKey(t), v); }
  keyTime(i) { return this.keys[i - 1].t; }
  keyValue(i) { return clone(this.keys[i - 1].v); }
  nearestKeyIndex(t) { let best = 1, d = Infinity; this.keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); best = i + 1; } }); return best; }
  valueAtTime(t) {
    if (!this.keys.length) return clone(this.value);
    if (t <= this.keys[0].t) return clone(this.keys[0].v);
    const K = this.keys; for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1].t) { const u = (t - K[i].t) / (K[i + 1].t - K[i].t); return lerp(K[i].v, K[i + 1].v, u); }
    return clone(K[K.length - 1].v);
  }
  setInterpolationTypeAtKey(i, a, b) { this.keys[i - 1].inI = a; this.keys[i - 1].outI = b === undefined ? a : b; }
  keyInInterpolationType(i) { return this.keys[i - 1].inI; }
  keyOutInterpolationType(i) { return this.keys[i - 1].outI; }
  dims() { const v = this.value; return v && typeof v === 'object' && typeof v.length === 'number' && !this.isSpatial ? v.length : 1; }
  setTemporalEaseAtKey(i, inE, outE) {
    const n = this.dims();
    if (inE.length !== n || outE.length !== n) throw new Error(`ease array of ${inE.length}/${outE.length} for ${n} dims`);
    this.keys[i - 1].inE = inE; this.keys[i - 1].outE = outE;
  }
  keyInTemporalEase(i) { return this.keys[i - 1].inE || Array.from({ length: this.dims() }, () => new KeyframeEase(0, 16.67)); }
  keyOutTemporalEase(i) { return this.keys[i - 1].outE || Array.from({ length: this.dims() }, () => new KeyframeEase(0, 16.67)); }
  canAddToMotionGraphicsTemplate(comp) { return this.propertyValueType !== PVT.NO_VALUE && this.propertyValueType !== PVT.SHAPE && layerOf(this).containingComp === comp; }
  addToMotionGraphicsTemplateAs(comp, name) { if (!this.canAddToMotionGraphicsTemplate(comp)) return false; comp._egp.push({ name, prop: this }); return true; }
  addToMotionGraphicsTemplate(comp) { return this.addToMotionGraphicsTemplateAs(comp, this.name); }
}
// arrays always come back as this realm's arrays (the host runs in its own vm context)
function clone(v) { if (v && typeof v === 'object' && typeof v.length === 'number') return Array.prototype.slice.call(v); return v && typeof v === 'object' ? Object.assign(Object.create(Object.getPrototypeOf(v)), v) : v; }
function lerp(a, b, u) { return a && typeof a === 'object' && typeof a.length === 'number' ? a.map((x, i) => x + (b[i] - x) * u) : (typeof a === 'number' ? a + (b - a) * u : a); }
function layerOf(p) { while (p && !(p instanceof Layer)) p = p.parentProperty; return p; }

class Group {
  constructor(matchName, name, kind = PropertyType.NAMED_GROUP, factory = null) { this.matchName = matchName; this.name = name; this.propertyType = kind; this.children = []; this.factory = factory; this.parentProperty = null; this.enabled = true; }
  get numProperties() { return this.children.length; }
  property(k) { if (typeof k === 'number') return this.children[k - 1] || null; return this.children.find(c => c.matchName === k || c.name === k) || null; }
  add(child) { child.parentProperty = this; this.children.push(child); return child; }
  addProperty(matchName) { if (!this.factory) throw new Error('cannot add to ' + this.matchName); const c = this.factory(matchName); if (!c) throw new Error('unknown ' + matchName); return this.add(c); }
  canAddProperty(m) { return !!this.factory && !!this.factory(m); }
  remove() { const c = this.parentProperty.children; c.splice(c.indexOf(this), 1); }
}
class Shape { constructor() { this.vertices = []; this.inTangents = []; this.outTangents = []; this.closed = true; } }

/* ---- effects ---- */
function effect(matchName) {
  const g = new Group(matchName, { 'ADBE Slider Control': 'Slider Control', 'ADBE Color Control': 'Color Control', 'ADBE Fill': 'Fill', 'ADBE Checkbox Control': 'Checkbox Control', 'ADBE Point Control': 'Point Control' }[matchName] || matchName, PropertyType.INDEXED_GROUP);
  if (matchName === 'ADBE Slider Control') g.add(new Prop('ADBE Slider Control-0001', 'Slider', 0, PVT.OneD));
  else if (matchName === 'ADBE Color Control') g.add(new Prop('ADBE Color Control-0001', 'Color', [1, 0, 0, 1], PVT.COLOR));
  else if (matchName === 'ADBE Checkbox Control') g.add(new Prop('ADBE Checkbox Control-0001', 'Checkbox', 0, PVT.OneD));
  else if (matchName === 'ADBE Point Control') g.add(new Prop('ADBE Point Control-0001', 'Point', [0, 0], PVT.TwoD_SPATIAL));
  else if (matchName === 'ADBE Fill') { g.add(new Prop('ADBE Fill-0001', 'Fill Mask', 0, PVT.OneD)); g.add(new Prop('ADBE Fill-0002', 'Color', [1, 0, 0, 1], PVT.COLOR)); }
  else if (matchName === 'ADBE Gaussian Blur 2') g.add(new Prop('ADBE Gaussian Blur 2-0001', 'Blurriness', 0, PVT.OneD));
  else if (/^ADBE (Glo2|Drop Shadow|Ramp|Tint|Motion Blur|Noise|Turbulent Displace)$/.test(matchName)) {
    const n = { 'ADBE Glo2': 4, 'ADBE Drop Shadow': 5, 'ADBE Ramp': 5, 'ADBE Tint': 3, 'ADBE Motion Blur': 2, 'ADBE Noise': 1, 'ADBE Turbulent Displace': 3 }[matchName];
    const colors = { 'ADBE Drop Shadow-0001': 1, 'ADBE Ramp-0002': 1, 'ADBE Ramp-0004': 1, 'ADBE Tint-0001': 1, 'ADBE Tint-0002': 1 };
    for (let i = 1; i <= n; i++) { const m = matchName + '-000' + i; g.add(colors[m] ? new Prop(m, m, [0, 0, 0, 1], PVT.COLOR) : new Prop(m, m, 0, PVT.OneD)); }
  }
  else {
    const def = Object.values(require('../../core/aeScene').EFFECTS).find(d => d.match === matchName);
    const plugin = { 'VIDEOCOPILOT 3DSaber': ['Glow Intensity', 'Core Size', 'Start Offset'], 'ADBE Simple Choker': ['Choke Matte'], 'ADBE Offset': ['Shift Center To'], 'ADBE Shift Channels': ['Take Green From', 'Take Blue From'], 'ADBE Geometry2': ['Position', 'Scale', 'Rotation', 'Shutter Angle', "Use Composition's Shutter Angle"], 'Keylight 906': ['Screen Colour', 'Screen Gain'] }[matchName];
    if (!def && !plugin) return null;
    for (const pm of def ? Object.values(def.params) : plugin) if (!g.property(pm) && !(matchName === 'ADBE Fractal Noise' && pm === 'Scale')) g.add(new Prop(pm, pm, /^(Position|Shift Center To)$/.test(pm) ? [0, 0] : /Screen Colour/.test(pm) ? [0, 1, 0, 1] : /Color|Highlights|Midtones|Shadows$/.test(pm) && !/Shadows/.test(matchName) ? [0, 0, 0, 1] : /Center|^Start$|^End$|-0001$|-0003$/.test(pm) && matchName !== 'ADBE Gaussian Blur 2' && matchName !== 'ADBE Noise' && !/Motion Blur|Tint|Turbulent|Glo2/.test(matchName) ? [0, 0] : 0, PVT.OneD));
    if (matchName === 'ADBE Fractal Noise') g.add(new Group('ADBE Fractal Noise Transform', 'Transform')).add(new Prop('Scale', 'Scale', 100, PVT.OneD));
  }
  return g;
}

/* ---- shape contents ---- */
function vectorItem(m) {
  if (m === 'ADBE Vector Group') { const g = new Group(m, 'Group 1', PropertyType.INDEXED_GROUP); g.add(new Group('ADBE Vectors Group', 'Contents', PropertyType.INDEXED_GROUP, vectorItem)); const t = g.add(new Group('ADBE Vector Transform Group', 'Transform')); t.add(new Prop('ADBE Vector Position', 'Position', [0, 0], PVT.TwoD_SPATIAL)); t.add(new Prop('ADBE Vector Scale', 'Scale', [100, 100], PVT.TwoD)); t.add(new Prop('ADBE Vector Rotation', 'Rotation', 0, PVT.OneD)); return g; }
  if (m === 'ADBE Vector Shape - Group') { const g = new Group(m, 'Path 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Shape', 'Path', new Shape(), PVT.SHAPE)); return g; }
  if (m === 'ADBE Vector Filter - Trim') { const g = new Group(m, 'Trim Paths 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Trim Start', 'Start', 0, PVT.OneD)); g.add(new Prop('ADBE Vector Trim End', 'End', 100, PVT.OneD)); g.add(new Prop('ADBE Vector Trim Offset', 'Offset', 0, PVT.OneD)); g.add(new Prop('ADBE Vector Trim Type', 'Trim Multiple Shapes', 1, PVT.OneD)); return g; }
  if (m === 'ADBE Vector Filter - Repeater') { const g = new Group(m, 'Repeater 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Repeater Copies', 'Copies', 3, PVT.OneD)); g.add(new Prop('ADBE Vector Repeater Offset', 'Offset', 0, PVT.OneD)); const t = g.add(new Group('ADBE Vector Repeater Transform', 'Transform')); t.add(new Prop('ADBE Vector Repeater Position', 'Position', [100, 0], PVT.TwoD_SPATIAL)); t.add(new Prop('ADBE Vector Repeater Scale', 'Scale', [100, 100], PVT.TwoD)); t.add(new Prop('ADBE Vector Repeater Rotation', 'Rotation', 0, PVT.OneD)); t.add(new Prop('ADBE Vector Repeater Opacity 1', 'Start Opacity', 100, PVT.OneD)); t.add(new Prop('ADBE Vector Repeater Opacity 2', 'End Opacity', 100, PVT.OneD)); return g; }
  if (m === 'ADBE Vector Shape - Rect') { const g = new Group(m, 'Rectangle Path 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Rect Size', 'Size', [100, 100], PVT.TwoD)); g.add(new Prop('ADBE Vector Rect Roundness', 'Roundness', 0, PVT.OneD)); return g; }
  if (m === 'ADBE Vector Shape - Ellipse') { const g = new Group(m, 'Ellipse Path 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Ellipse Size', 'Size', [100, 100], PVT.TwoD)); return g; }
  if (m === 'ADBE Vector Shape - Star') { const g = new Group(m, 'Polystar Path 1', PropertyType.INDEXED_GROUP); ['ADBE Vector Star Type', 'ADBE Vector Star Points', 'ADBE Vector Star Outer Radius', 'ADBE Vector Star Inner Radius', 'ADBE Vector Star Rotation'].forEach(x => g.add(new Prop(x, x, 1, PVT.OneD))); return g; }
  if (m === 'ADBE Vector Graphic - Fill') { const g = new Group(m, 'Fill 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Fill Color', 'Color', [1, 0, 0, 1], PVT.COLOR)); g.add(new Prop('ADBE Vector Fill Opacity', 'Opacity', 100, PVT.OneD)); g.add(new Prop('ADBE Vector Fill Rule', 'Fill Rule', 1, PVT.OneD)); return g; }
  if (m === 'ADBE Vector Graphic - Stroke') { const g = new Group(m, 'Stroke 1', PropertyType.INDEXED_GROUP); g.add(new Prop('ADBE Vector Stroke Color', 'Color', [1, 1, 1, 1], PVT.COLOR)); g.add(new Prop('ADBE Vector Stroke Width', 'Stroke Width', 2, PVT.OneD)); g.add(new Prop('ADBE Vector Stroke Line Cap', 'Line Cap', 1, PVT.OneD)); g.add(new Prop('ADBE Vector Stroke Line Join', 'Line Join', 1, PVT.OneD)); g.add(new Group('ADBE Vector Stroke Dashes', 'Dashes', PropertyType.INDEXED_GROUP, dm => dm === 'ADBE Vector Stroke Dash 1' ? new Prop(dm, 'Dash', 10, PVT.OneD) : null)); return g; }
  return null;
}

/* ---- text animators ---- */
function textAnimatorItem(m) {
  if (m !== 'ADBE Text Animator') return null;
  const an = new Group(m, 'Animator 1', PropertyType.INDEXED_GROUP);
  const sels = an.add(new Group('ADBE Text Selectors', 'Selectors', PropertyType.INDEXED_GROUP, sm => {
    if (sm !== 'ADBE Text Selector') return null;
    const s = new Group(sm, 'Range Selector 1', PropertyType.INDEXED_GROUP);
    s.add(new Prop('ADBE Text Percent Start', 'Start', 0, PVT.OneD)); s.add(new Prop('ADBE Text Percent End', 'End', 100, PVT.OneD)); s.add(new Prop('ADBE Text Percent Offset', 'Offset', 0, PVT.OneD));
    const adv = s.add(new Group('ADBE Text Range Advanced', 'Advanced'));
    ['ADBE Text Range Units', 'ADBE Text Range Type2', 'ADBE Text Range Shape', 'ADBE Text Levels Max Ease'].forEach(x => adv.add(new Prop(x, x, 1, PVT.OneD)));
    return s;
  }));
  void sels;
  an.add(new Group('ADBE Text Animator Properties', 'Properties', PropertyType.NAMED_GROUP, pm => {
    const T = { 'ADBE Text Opacity': [100, PVT.OneD], 'ADBE Text Position 3D': [[0, 0, 0], PVT.ThreeD], 'ADBE Text Blur': [[0, 0], PVT.TwoD], 'ADBE Text Scale 3D': [[100, 100, 100], PVT.ThreeD], 'ADBE Text Tracking Amount': [0, PVT.OneD], 'ADBE Text Rotation': [0, PVT.OneD] }[pm];
    return T ? new Prop(pm, pm.replace('ADBE Text ', ''), T[0], T[1]) : null;
  }));
  return an;
}

class TextDocument { constructor(text) { this.text = text; this.fontSize = 72; this.fillColor = [1, 1, 1]; this.applyFill = true; this.applyStroke = false; this.justification = 0; } }

class Layer {
  constructor(comp, name, kind) {
    this.containingComp = comp; this.name = name; this.kind = kind; this.parent = null; this._3d = false; this.guideLayer = false; this.enabled = true; this.shy = false;
    this.inPoint = 0; this.outPoint = comp.duration; this.startTime = 0; this.nullLayer = kind === 'null'; this.source = null; this.label = 0; this.id = IDS++;
    this.root = new Group('ADBE Layer', name); this.root.parentProperty = this;
    const tr = this.root.add(new Group('ADBE Transform Group', 'Transform'));
    tr.add(new Prop('ADBE Anchor Point', 'Anchor Point', [0, 0, 0], PVT.ThreeD_SPATIAL));
    tr.add(new Prop('ADBE Position', 'Position', [comp.width / 2, comp.height / 2, 0], PVT.ThreeD_SPATIAL));
    tr.add(new Prop('ADBE Scale', 'Scale', [100, 100, 100], PVT.ThreeD));
    tr.add(new Prop('ADBE Rotate X', 'X Rotation', 0, PVT.OneD)); tr.add(new Prop('ADBE Rotate Y', 'Y Rotation', 0, PVT.OneD)); tr.add(new Prop('ADBE Rotate Z', 'Rotation', 0, PVT.OneD));
    tr.add(new Prop('ADBE Opacity', 'Opacity', 100, PVT.OneD)); tr.add(new Prop('ADBE Orientation', 'Orientation', [0, 0, 0], PVT.ThreeD_SPATIAL));
    this.root.add(new Group('ADBE Mask Parade', 'Masks', PropertyType.INDEXED_GROUP, mm => {
      if (mm !== 'ADBE Mask Atom') return null;
      const g = new Group(mm, 'Mask', PropertyType.INDEXED_GROUP); g.maskMode = 6812; g.inverted = false;
      g.add(new Prop('ADBE Mask Shape', 'Mask Path', new Shape(), PVT.SHAPE)); g.add(new Prop('ADBE Mask Feather', 'Mask Feather', [0, 0], PVT.TwoD)); g.add(new Prop('ADBE Mask Opacity', 'Mask Opacity', 100, PVT.OneD)); g.add(new Prop('ADBE Mask Offset', 'Mask Expansion', 0, PVT.OneD));
      return g;
    }));
    this.root.add(new Group('ADBE Effect Parade', 'Effects', PropertyType.INDEXED_GROUP, effect));
    this.root.add(new Group('ADBE Material Options Group', 'Material Options')).add(new Prop('ADBE Casts Shadows', 'Casts Shadows', 0, PVT.OneD));
    const geo = this.root.add(new Group('ADBE Extrsn Options Group', 'Geometry Options')); geo.add(new Prop('ADBE Extrsn Depth', 'Extrusion Depth', 0, PVT.OneD)); geo.add(new Prop('ADBE Bevel Styles', 'Bevel Style', 1, PVT.OneD)); geo.add(new Prop('ADBE Bevel Depth', 'Bevel Depth', 0, PVT.OneD));
  }
  get startTime() { return this._st || 0; }
  set startTime(v) { const d = v - (this._st || 0); this._st = v; if (this.outPoint !== undefined) { this.inPoint += d; this.outPoint += d; } }
  get threeDLayer() { return this._3d; }
  set threeDLayer(v) {
    this._3d = !!v;
    if (!v) return;
    // AE: a 3D layer's position / anchor / scale get a z
    const t = this.root.property('ADBE Transform Group');
    for (const [m, z] of [['ADBE Position', 0], ['ADBE Anchor Point', 0], ['ADBE Scale', 100]]) { const p = t.property(m); if (p.value.length === 2) { p.value = p.value.concat([z]); p.propertyValueType = m === 'ADBE Scale' ? PVT.ThreeD : PVT.ThreeD_SPATIAL; } }
  }
  get index() { return this.containingComp.layerList.indexOf(this) + 1; }
  get numProperties() { return this.root.numProperties; }
  property(k) { return this.root.property(k); }
  get transform() { return this.root.property('ADBE Transform Group'); }
  get selected() { return this.containingComp.selectedLayers.includes(this); }
  set selected(v) { const S = this.containingComp.selectedLayers, i = S.indexOf(this); if (v && i < 0) S.push(this); if (!v && i >= 0) S.splice(i, 1); }
  moveBefore(other) { const L = this.containingComp.layerList; L.splice(L.indexOf(this), 1); L.splice(L.indexOf(other), 0, this); }
  sourceRectAtTime() { return this._rect || { left: -100, top: -50, width: 200, height: 100 }; }
  duplicate() { return this.containingComp._duplicate ? this.containingComp._duplicate(this) : this; }
  remove() { const L = this.containingComp.layerList; L.splice(L.indexOf(this), 1); }
  moveToEnd() { const L = this.containingComp.layerList; L.splice(L.indexOf(this), 1); L.push(this); }
  setParentWithJump(p) { this.parent = p; this.jumped = true; }
  setTrackMatte(m, type) { this.trackMatteLayer = m; this.trackMatteType = type; }
}
// 2D layers report 2D position / scale values
function twoD(L) { const t = L.transform; ['ADBE Anchor Point', 'ADBE Position'].forEach(m => { const p = t.property(m); p.value = p.value.slice(0, 2); p.propertyValueType = PVT.TwoD_SPATIAL; }); const s = t.property('ADBE Scale'); s.value = s.value.slice(0, 2); s.propertyValueType = PVT.TwoD; }

function makeClasses() {
  class CompItem { }
  class FolderItem { }
  class FootageItem { }
  class AVLayer extends Layer { }
  class TextLayer extends AVLayer { }
  class ShapeLayer extends AVLayer { }
  class CameraLayer extends Layer { }
  class LightLayer extends Layer { }
  class SolidSource { }
  class FileSource { }
  return { CompItem, FolderItem, FootageItem, AVLayer, TextLayer, ShapeLayer, CameraLayer, LightLayer, SolidSource, FileSource };
}

function loadAE({ dir } = {}) {
  const K = makeClasses();
  const items = [];
  const project = {
    file: null, renderQueue: null, rootFolder: null,
    get numItems() { return items.length; }, item(i) { return items[i - 1]; },
    get activeItem() { return project._active || null; },
    items: { addComp(name, w, hh, par, d, fps) { return newComp(name, { width: w, height: hh, fps, duration: d }); }, addFolder(name) { const f = Object.assign(new K.FolderItem(), { name, id: IDS++, parentFolder: project.rootFolder }); items.push(f); return f; } },
    save() { project.saved = (project.saved || 0) + 1; },
    importFile(opts) { const f = Object.assign(new K.FootageItem(), { name: path.basename(opts.file.fsName), id: IDS++, file: opts.file, hasVideo: /\.(mp4|mov|png|jpg)$/i.test(opts.file.fsName), hasAudio: /\.(wav|mp3|mp4|mov)$/i.test(opts.file.fsName), mainSource: Object.assign(new K.FileSource(), { isStill: /\.(png|jpg)$/i.test(opts.file.fsName) }), width: /\.(mp3|wav)$/i.test(opts.file.fsName) ? 0 : 1280, height: /\.(mp3|wav)$/i.test(opts.file.fsName) ? 0 : 720, duration: 10, parentFolder: project.rootFolder, usedIn: [] }); items.push(f); return f; },
    removeUnusedFootage() { const before = items.length; for (let i = items.length - 1; i >= 0; i--) if (items[i] instanceof K.FootageItem && !items[i].usedIn.length) items.splice(i, 1); return before - items.length; }
  };
  project.rootFolder = Object.assign(new K.FolderItem(), { name: 'root', id: 0 });
  const rendered = [];
  project.renderQueue = {
    items: { add(comp) { const om = { templates: ['Lossless', 'High Quality with Alpha', 'H.264 - Match Render Settings - 15 Mbps', 'Apple ProRes 422 HQ', '_HIDDEN X'], applied: null, file: null, applyTemplate(n) { this.applied = n; } }; const it = { comp, om, outputModule() { return om; } }; rendered.push(it); return it; } },
    render() { rendered.forEach(r => { if (r.om.file) { fs.mkdirSync(path.dirname(r.om.file.fsName), { recursive: true }); fs.writeFileSync(r.om.file.fsName, 'render'); } }); },
    queueInAME() { project.ame = true; }
  };

  class File {
    constructor(p) { this.fsName = path.resolve(String(p)); }
    get exists() { return fs.existsSync(this.fsName); }
    get parent() { const d = path.dirname(this.fsName); return { fsName: d, get exists() { return fs.existsSync(d); }, create() { fs.mkdirSync(d, { recursive: true }); return true; } }; }
  }
  class ImportOptions { constructor(f) { this.file = f; } }

  function newComp(name, { width = 1920, height = 1080, fps = 25, duration = 10 } = {}) {
    const c = Object.assign(new K.CompItem(), { name, id: IDS++, width, height, frameDuration: 1 / fps, duration, time: 0, layerList: [], selectedLayers: [], selectedProperties: [], _egp: [], motionGraphicsTemplateName: '', renderer: 'ADBE Advanced 3d', renderers: ['ADBE Advanced 3d', 'ADBE Ernst', 'ADBE Picasso'], parentFolder: project.rootFolder });
    c.layer = i => c.layerList[i - 1];
    Object.defineProperty(c, 'numLayers', { get: () => c.layerList.length });
    const push = (L, twoDim = true) => { if (twoDim) twoD(L); c.layerList.unshift(L); return L; };
    c.layers = {
      addNull(d) { const L = push(new K.AVLayer(c, 'Null ' + (c.layerList.length + 1), 'null')); L.nullLayer = true; return L; },
      addShape() { const L = push(new K.ShapeLayer(c, 'Shape Layer ' + (c.layerList.length + 1), 'shape')); L.root.add(new Group('ADBE Root Vectors Group', 'Contents', PropertyType.INDEXED_GROUP, vectorItem)); return L; },
      addText(text) {
        const L = push(new K.TextLayer(c, String(text), 'text'));
        const tp = L.root.add(new Group('ADBE Text Properties', 'Text'));
        tp.add(new Prop('ADBE Text Document', 'Source Text', new TextDocument(String(text)), PVT.TEXT_DOCUMENT));
        tp.add(new Group('ADBE Text Animators', 'Animators', PropertyType.INDEXED_GROUP, textAnimatorItem));
        return L;
      },
      addCamera(name) { const L = push(new K.CameraLayer(c, name, 'camera'), false); const co = L.root.add(new Group('ADBE Camera Options Group', 'Camera Options')); [['ADBE Camera Zoom', 'Zoom', 2666.7], ['ADBE Camera Depth of Field', 'Depth of Field', 0], ['ADBE Camera Focus Distance', 'Focus Distance', 2666.7], ['ADBE Camera Aperture', 'Aperture', 25], ['ADBE Camera Blur Level', 'Blur Level', 100]].forEach(x => co.add(new Prop(x[0], x[1], x[2], PVT.OneD))); return L; },
      addLight(name) { const L = push(new K.LightLayer(c, name, 'light'), false); L.lightType = 0; const o = L.root.add(new Group('ADBE Light Options Group', 'Light Options')); ['ADBE Light Intensity', 'ADBE Light Casts Shadows', 'ADBE Light Shadow Diffusion', 'ADBE Light Cone Angle', 'ADBE Light Cone Feather 2'].forEach(m => o.add(new Prop(m, m, 0, PVT.OneD))); o.add(new Prop('ADBE Light Color', 'Color', [1, 1, 1, 1], PVT.COLOR)); return L; },
      addSolid(color, name, w, hh) { const L = push(new K.AVLayer(c, name, 'solid')); const src = Object.assign(new K.FootageItem(), { name, id: IDS++, width: w, height: hh, usedIn: [], mainSource: Object.assign(new K.SolidSource(), { color }) }); src.remove = () => { const i = items.indexOf(src); if (i >= 0) items.splice(i, 1); }; items.push(src); L.source = src; return L; },
      add(item) { const L = push(new K.AVLayer(c, item.name, 'footage')); L.source = item; if (item.usedIn) item.usedIn.push(c); return L; }
    };
    c.duplicate = () => {
      const d = newComp(c.name + ' 2', { width, height, fps, duration });
      // deep-ish copy: rebuild layers of the same kinds with the same values
      for (let i = c.layerList.length - 1; i >= 0; i--) {
        const L = c.layerList[i];
        const N = L.kind === 'text' ? d.layers.addText(L.property('ADBE Text Properties').property('ADBE Text Document').value.text) : L.kind === 'shape' ? d.layers.addShape() : L.kind === 'null' ? d.layers.addNull() : L.kind === 'footage' ? d.layers.add(L.source) : d.layers.addNull();
        N.name = L.name; N.inPoint = L.inPoint; N.outPoint = L.outPoint;
        copyTree(L.root, N.root);
      }
      return d;
    };
    c._duplicate = L => {
      const N = L.kind === 'shape' ? c.layers.addShape() : L.kind === 'text' ? c.layers.addText(L.property('ADBE Text Properties').property('ADBE Text Document').value.text) : c.layers.addNull();
      if (L.kind === 'shape') N.root.property('ADBE Root Vectors Group').children.length = 0;
      N.name = L.name + ' 2'; N.inPoint = L.inPoint; N.outPoint = L.outPoint; copyTree(L.root, N.root);
      N.moveBefore(L); return N;
    };
    c.remove = () => { const i = items.indexOf(c); if (i >= 0) items.splice(i, 1); c.removed = true; if (project._active === c) project._active = null; };
    c.openInViewer = () => { project._active = c; return c; };
    c.saveFrameToPng = (t, f) => { fs.mkdirSync(path.dirname(f.fsName), { recursive: true }); fs.writeFileSync(f.fsName, require('../../core/util').makePng(16, 9, [249, 115, 22, 255])); };
    c.exportAsMotionGraphicsTemplate = (overwrite, p) => {
      if (!project.file) throw new Error('project not saved');
      if (fs.existsSync(p) && !overwrite) return false;
      const controls = c._egp.map((e, i) => {
        const t = e.prop.propertyValueType, v = e.prop.value;
        const base = { id: 'c' + i, uiName: { strDB: [{ localeString: 'en_US', str: e.name }] } };
        if (t === PVT.TEXT_DOCUMENT) return { ...base, type: 6, value: { strDB: [{ localeString: 'en_US', str: v.text }] } };
        if (t === PVT.COLOR) return { ...base, type: 4, value: v };
        if (t === PVT.OneD) return { ...base, type: 2, value: v, min: 0, max: 500 };
        return { ...base, type: 5, value: { x: v[0], y: v[1] } };
      });
      const def = { capsuleName: c.motionGraphicsTemplateName, authorApp: 'aefx', clientControls: [{ id: 'g', type: 10, uiName: { strDB: [{ str: '' }] }, value: [] }].concat(controls) };
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, zip.create([{ name: 'definition.json', data: Buffer.from(JSON.stringify(def)) }, { name: 'thumb.png', data: require('../../core/util').makePng(32, 18, [234, 88, 12, 255]) }, { name: 'project.aegraphic', data: Buffer.alloc(64, 1) }]));
      c.exported = (c.exported || 0) + 1;
      return true;
    };
    items.push(c);
    return c;
  }
  function copyTree(a, b) {
    for (const ch of a.children) {
      let t = b.children.find(x => x.matchName === ch.matchName && x.name === ch.name);
      if (!t && b.factory) { try { t = b.addProperty(ch.matchName); t.name = ch.name; } catch (_) {} }
      if (!t) continue;
      if (ch instanceof Prop) { t.value = clone(ch.value); t.keys = ch.keys.map(k => ({ ...k, v: clone(k.v) })); t.expression = ch.expression; }
      else copyTree(ch, t);
    }
  }

  const app = {
    version: '25.0', project, undo: [], effects: [{ displayName: 'Glow', matchName: 'ADBE Glo2', category: 'Stylize' }, { displayName: 'Saber', matchName: 'VIDEOCOPILOT 3DSaber', category: 'Video Copilot' }, { displayName: 'Old', matchName: 'X Old', category: '_Obsolete' }], preferences: { scriptsCanWrite: 1, getPrefAsLong(sec, key) { return key === 'Pref_SCRIPTING_FILE_NETWORK_SECURITY' ? this.scriptsCanWrite : 0; } },
    beginUndoGroup(n) { app.undo.push(n); }, endUndoGroup() {},
    findMenuCommandId(name) { return name === 'Create Shapes from Text' ? 3781 : 0; },
    executeCommand(id) {
      const c = project._active; if (!c || id !== 3781) return;
      for (const T of c.selectedLayers.slice()) {
        if (T.kind !== 'text') continue;
        const S = c.layers.addShape(); S.name = T.name + ' Outlines'; S.moveBefore(T);
        const g = S.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group'); g.name = 'H';
        const sh = g.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape').value;
        const shape = new Shape(); shape.vertices = [[-50, -30], [50, -30], [50, 30], [-50, 30]]; shape.inTangents = shape.vertices.map(() => [0, 0]); shape.outTangents = shape.vertices.map(() => [0, 0]); shape.closed = true;
        g.property('ADBE Vectors Group').property(1).property('ADBE Vector Shape').value = shape; void sh;
        g.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill');
        T.enabled = false; c.selectedLayers.length = 0; c.selectedLayers.push(S);
      }
    },
    open(f) { project.file = f; project.opened = f.fsName; return project; }
  };
  const ctx = vm.createContext({
    app, File, ImportOptions, KeyframeEase, PropertyType, PropertyValueType: PVT, KeyframeInterpolationType: KIT,
    LightType: { PARALLEL: 4401, SPOT: 4402, POINT: 4403, AMBIENT: 4404 }, ParagraphJustification: { LEFT_JUSTIFY: 7413, CENTER_JUSTIFY: 7415, RIGHT_JUSTIFY: 7414 }, Shape, MaskMode: { NONE: 6812, ADD: 6813, SUBTRACT: 6814, INTERSECT: 6815, LIGHTEN: 6816, DARKEN: 6817, DIFFERENCE: 6818 }, TrackMatteType: { NO_TRACK_MATTE: 5012, ALPHA: 5013, ALPHA_INVERTED: 5014, LUMA: 5015, LUMA_INVERTED: 5016 }, BlendingMode: { LIGHTEN: 5213, DARKEN: 5214, DIFFERENCE: 5226, NORMAL: 5212, ADD: 5220, SCREEN: 5219, MULTIPLY: 5216, OVERLAY: 5224, SOFT_LIGHT: 5225, COLOR_DODGE: 5221 },
    ...K, Math, String, Number, Array, Object, Error, isFinite, parseInt, parseFloat
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'host', 'ae.jsx'), 'utf8'), ctx);
  const call = (name, args) => { const r = JSON.parse(ctx.efm_call(name, JSON.stringify(args || {}))); if (!r.ok) { const e = new Error(r.error); e.line = r.line; throw e; } return r.data; };
  return { app, project, K, newComp, call, ctx, File, rendered, Prop, Group, PVT, Shape };
}

module.exports = { loadAE, KeyframeEase, PVT, KIT };

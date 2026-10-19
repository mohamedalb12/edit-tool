/* EditFast Motion \u2014 ExtendScript host for After Effects (globals EFM / EFMAPI / efm_call: AE's engine is shared by every panel).
 * ES3 only (ExtendScript): no let/const, arrow functions, Array.indexOf, JSON, String.trim.
 * Every public function goes through efm_call(name, jsonArgs) and returns a JSON string {ok, data|error}.
 */

var EFM = {};

/* ---------------- JSON (ExtendScript has none) ---------------- */
EFM.json = {
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
    if (t === 'string') return EFM.json.esc(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      parts = [];
      for (i = 0; i < v.length; i++) parts.push(EFM.json.stringify(v[i]));
      return '[' + parts.join(',') + ']';
    }
    if (t === 'object') {
      parts = [];
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) parts.push(EFM.json.esc(k) + ':' + EFM.json.stringify(v[k]));
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  },
  parse: function (s) { if (!s) return {}; return eval('(' + s + ')'); }
};

/* ---------------- helpers ---------------- */
EFM.isArr = function (v) { return Object.prototype.toString.call(v) === '[object Array]' || (v !== null && typeof v === 'object' && typeof v.length === 'number' && typeof v !== 'string'); };
/** set a value, or (when the property is animated) apply the same change to every keyframe */
EFM.change = function (p, fn) { var i; if (p.numKeys > 0) { for (i = 1; i <= p.numKeys; i++) p.setValueAtKey(i, fn(p.keyValue(i))); } else p.setValue(fn(p.value)); };
EFM.has = function (arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; };
EFM.comp = function () {
  var c = app.project.activeItem;
  if (!c || !(c instanceof CompItem)) throw new Error('\u0627\u0641\u062a\u062d \u0643\u0648\u0645\u0628\u0648\u0632\u064a\u0634\u0646 \u0627\u0644\u0623\u0648\u0644 (\u062f\u0648\u0633 \u0639\u0644\u064a\u0647 \u0641\u064a \u0627\u0644\u062a\u0627\u064a\u0645\u0644\u0627\u064a\u0646)');
  return c;
};
EFM.selected = function (comp, need) {
  var s = comp.selectedLayers, out = [], i;
  for (i = 0; i < s.length; i++) out.push(s[i]);
  if (!out.length && need !== false) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0644\u064a\u0631 (\u0623\u0648 \u0623\u0643\u062a\u0631) \u0641\u064a \u0627\u0644\u062a\u0627\u064a\u0645\u0644\u0627\u064a\u0646 \u0627\u0644\u0623\u0648\u0644');
  return out;
};
EFM.undo = function (name, fn) {
  app.beginUndoGroup('EditFast: ' + name);
  try { return fn(); } finally { app.endUndoGroup(); }
};
EFM.layerType = function (L) {
  if (L instanceof CameraLayer) return 'camera';
  if (L instanceof LightLayer) return 'light';
  if (L instanceof TextLayer) return 'text';
  if (L instanceof ShapeLayer) return 'shape';
  if (L.nullLayer) return 'null';
  try { if (L.source instanceof CompItem) return 'precomp'; } catch (e) {}
  try { if (L.source && L.source.mainSource instanceof SolidSource) return 'solid'; } catch (e2) {}
  try { if (L.source && L.source.mainSource instanceof FileSource) return L.source.hasVideo ? 'footage' : 'audio'; } catch (e3) {}
  return 'other';
};
EFM.tr = function (L, name) { return L.property('ADBE Transform Group').property(name); };
EFM.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
/** every property of a layer (walk the tree), calling fn(prop) on leaf properties */
EFM.walk = function (group, fn, depth) {
  var i, p;
  if ((depth || 0) > 12) return;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (!p) continue;
    if (p.propertyType === PropertyType.PROPERTY) fn(p);
    else EFM.walk(p, fn, (depth || 0) + 1);
  }
};
/** the EditFast controls layer of a comp: a guide null holding the sliders / colours the template exposes */
EFM.controls = function (comp) {
  var i, L;
  for (i = 1; i <= comp.numLayers; i++) { L = comp.layer(i); if (L.name === 'EF Controls') return L; }
  L = comp.layers.addNull(comp.duration);
  L.name = 'EF Controls'; L.guideLayer = true; L.enabled = false; L.shy = true;
  try { L.label = 11; } catch (e) {}
  return L;
};
EFM.effect = function (L, matchName, name) {
  var fx = L.property('ADBE Effect Parade'), i, e;
  for (i = 1; i <= fx.numProperties; i++) { e = fx.property(i); if (e.name === name) return e; }
  e = fx.addProperty(matchName); e.name = name; return e;
};
/** set an EGP name (AE 16.1+), falling back to the plain add */
EFM.expose = function (prop, comp, name) {
  try { if (prop.canAddToMotionGraphicsTemplate && !prop.canAddToMotionGraphicsTemplate(comp)) return false; } catch (e) {}
  try { if (prop.addToMotionGraphicsTemplateAs) return prop.addToMotionGraphicsTemplateAs(comp, name) !== false; } catch (e2) {}
  try { return prop.addToMotionGraphicsTemplate(comp) !== false; } catch (e3) { return false; }
};
EFM.colorKey = function (c) { return Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255); };
EFM.toHex = function (c) { var s = '#', i, v; for (i = 0; i < 3; i++) { v = Math.round(EFM.clamp(c[i], 0, 1) * 255).toString(16); s += v.length < 2 ? '0' + v : v; } return s; };
EFM.fromHex = function (h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255, 1]; };

/** AE only lets scripts write files with Preferences > Scripting & Expressions > "Allow Scripts to Write Files and Access Network" */
EFM.canWrite = function () {
  try { return app.preferences.getPrefAsLong('Main Pref Section', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 1; } catch (e) { return true; }
};
EFM.needWrite = function () {
  if (!EFM.canWrite()) throw new Error('\u0641\u0639\u0651\u0644 \u0641\u064a \u0627\u0644\u0623\u0641\u062a\u0631: Settings (Preferences) \u2190 Scripting & Expressions \u2190 "Allow Scripts to Write Files and Access Network" \u2014 \u0645\u0646 \u063a\u064a\u0631\u0647\u0627 \u0627\u0644\u0623\u0641\u062a\u0631 \u0645\u0634 \u0628\u064a\u0633\u0645\u062d \u0644\u0644\u0625\u0636\u0627\u0641\u0629 \u062a\u062d\u0641\u0638 \u0627\u0644\u0642\u0627\u0644\u0628 \u0623\u0648 \u0627\u0644\u0631\u064a\u0646\u062f\u0631');
};

var EFMAPI = {};

EFMAPI.ping = function () { return { app: 'After Effects', version: app.version, project: app.project.file ? app.project.file.fsName : null, canWrite: EFM.canWrite() }; };

/** the active comp and what's selected (for the panel's header and the AI) */
EFMAPI.compInfo = function () {
  var c = app.project.activeItem, out = { project: app.project.file ? app.project.file.fsName : null, comp: null };
  if (!c || !(c instanceof CompItem)) return out;
  var sel = [], i, L, layers = [];
  for (i = 0; i < c.selectedLayers.length; i++) { L = c.selectedLayers[i]; sel.push({ index: L.index, name: L.name, type: EFM.layerType(L) }); }
  for (i = 1; i <= Math.min(c.numLayers, 60); i++) { L = c.layer(i); layers.push({ index: i, name: L.name, type: EFM.layerType(L), threeD: !!L.threeDLayer, inPoint: L.inPoint, outPoint: L.outPoint }); }
  out.comp = { id: c.id, name: c.name, width: c.width, height: c.height, fps: 1 / c.frameDuration, duration: c.duration, time: c.time, layers: layers, selected: sel, renderer: c.renderer };
  return out;
};

/* ======================= templates (MOGRT for Premiere) ======================= */
/**
 * What could be made editable in this comp, so the panel can ask before saving.
 * \u2192 { texts, colors:[hex], animated, layers, media, controls }
 */
EFMAPI.templateScan = function () {
  var c = EFM.comp(), texts = [], colors = {}, ncol = 0, animated = 0, media = 0, controls = 0, i, L;
  for (i = 1; i <= c.numLayers; i++) {
    L = c.layer(i);
    if (L.name === 'EF Controls') continue;
    var type = EFM.layerType(L);
    if (type === 'text') {
      try {
        var tdoc = L.property('ADBE Text Properties').property('ADBE Text Document').value, tck = EFM.colorKey(tdoc.fillColor);
        texts.push(String(tdoc.text).substr(0, 40));
        if (!colors[tck]) { colors[tck] = EFM.toHex(tdoc.fillColor); ncol++; }
      } catch (e) {}
    }
    if (type === 'footage') media++;
    EFM.walk(L, function (p) {
      try {
        if (p.numKeys > 1 && !p.expressionEnabled) animated++;
        if (p.propertyValueType === PropertyValueType.COLOR && /Fill Color|Stroke Color|Vector Fill Color|Vector Stroke Color/i.test(p.matchName + p.name)) {
          var k = EFM.colorKey(p.value); if (!colors[k]) { colors[k] = EFM.toHex(p.value); ncol++; }
        }
        if (/^ADBE (Slider|Color|Checkbox|Point|Angle) Control-0001$/.test(p.matchName)) controls++;
      } catch (e2) {}
    });
  }
  var list = []; for (var k2 in colors) if (colors.hasOwnProperty(k2)) list.push(colors[k2]);
  return { comp: c.name, duration: c.duration, width: c.width, height: c.height, texts: texts, colors: list, animated: animated, layers: c.numLayers, media: media, controls: controls };
};

/**
 * Turn a copy of the active comp into a template and export it as a .mogrt Premiere can use.
 * a: { name, path (mogrt file), editable: { text, colors, motion, transform, media, controls } }
 * The user's comp is never touched: everything happens on a duplicate kept in the project ("EditFast Templates").
 */
EFMAPI.templateSave = function (a) {
  var src = EFM.comp(), ed = a.editable || {};
  EFM.needWrite();
  if (!app.project.file) throw new Error('\u0627\u062d\u0641\u0638 \u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0623\u0641\u062a\u0631 \u0627\u0644\u0623\u0648\u0644 (File \u2190 Save) \u2014 \u0627\u0644\u0642\u0627\u0644\u0628 \u0628\u064a\u062a\u0639\u0645\u0644 \u0645\u0646 \u0645\u0634\u0631\u0648\u0639 \u0645\u062d\u0641\u0648\u0638');
  return EFM.undo('\u0642\u0627\u0644\u0628 ' + a.name, function () {
    var c = src.duplicate(), i, L, exposed = [], n;
    c.name = a.name + ' (EditFast)';
    try { c.parentFolder = EFM.folder('EditFast Templates'); } catch (e) {}
    var ctl = null;
    function controls() { if (!ctl) ctl = EFM.controls(c); return ctl; }
    // 1) text: every text layer's words
    if (ed.text) {
      n = 0;
      for (i = 1; i <= c.numLayers; i++) {
        L = c.layer(i);
        if (!(L instanceof TextLayer)) continue;
        n++;
        if (EFM.expose(L.property('ADBE Text Properties').property('ADBE Text Document'), c, n === 1 ? '\u0627\u0644\u0643\u0644\u0627\u0645' : '\u0627\u0644\u0643\u0644\u0627\u0645 ' + n)) exposed.push('text');
      }
    }
    // 2) colours: one control per colour used (fills / strokes sharing a colour change together)
    if (ed.colors) {
      var groups = {}, order = [];
      for (i = 1; i <= c.numLayers; i++) {
        L = c.layer(i);
        if (L.name === 'EF Controls') continue;
        EFM.walk(L, function (p) {
          try {
            if (p.propertyValueType !== PropertyValueType.COLOR || p.expressionEnabled || p.numKeys > 0) return;
            if (!/^ADBE Vector (Fill|Stroke) Color$/.test(p.matchName) && !/^ADBE (Fill|Tint|Change To Color)-/.test(p.matchName)) return;
            var k = EFM.colorKey(p.value);
            if (!groups[k]) { groups[k] = { value: p.value, props: [] }; order.push(k); }
            groups[k].props.push(p);
          } catch (e3) {}
        });
        // text colour: a Fill effect on the text layer, so its colour can be exposed without touching the words
        if (L instanceof TextLayer) {
          try {
            var td = L.property('ADBE Text Properties').property('ADBE Text Document').value, fc = td.fillColor;
            var fill = EFM.effect(L, 'ADBE Fill', 'EF Text Color');
            fill.property('ADBE Fill-0002').setValue([fc[0], fc[1], fc[2], 1]);
            var tk = EFM.colorKey(fc);
            if (!groups[tk]) { groups[tk] = { value: [fc[0], fc[1], fc[2], 1], props: [] }; order.push(tk); }
            groups[tk].props.push(fill.property('ADBE Fill-0002'));
          } catch (e4) {}
        }
      }
      for (i = 0; i < order.length && i < 8; i++) {
        var g = groups[order[i]], cc = EFM.effect(controls(), 'ADBE Color Control', 'EF Color ' + (i + 1));
        cc.property('ADBE Color Control-0001').setValue(g.value);
        for (var j = 0; j < g.props.length; j++) g.props[j].expression = 'thisComp.layer("EF Controls").effect("EF Color ' + (i + 1) + '")("ADBE Color Control-0001")';
        if (EFM.expose(cc.property('ADBE Color Control-0001'), c, '\u0644\u0648\u0646 ' + (i + 1))) exposed.push('color');
      }
    }
    // 3) motion: one "speed" and one "strength" slider drive every keyframed property
    if (ed.motion) {
      var sp = EFM.effect(controls(), 'ADBE Slider Control', 'EF Speed'), st = EFM.effect(controls(), 'ADBE Slider Control', 'EF Strength');
      sp.property('ADBE Slider Control-0001').setValue(100); st.property('ADBE Slider Control-0001').setValue(100);
      var expr = 'var c=thisComp.layer("EF Controls");var s=Math.max(1,c.effect("EF Speed")("ADBE Slider Control-0001"))/100;var k=c.effect("EF Strength")("ADBE Slider Control-0001")/100;' +
        'if(numKeys>1){var t0=key(1).time;var v=valueAtTime(t0+(time-t0)*s);var b=valueAtTime(t0);add(b,mul(sub(v,b),k));}else value';
      var driven = 0;
      for (i = 1; i <= c.numLayers; i++) {
        L = c.layer(i);
        if (L.name === 'EF Controls') continue;
        EFM.walk(L, function (p) {
          try {
            if (p.numKeys < 2 || p.expressionEnabled || !p.canSetExpression) return;
            if (p.propertyValueType === PropertyValueType.TEXT_DOCUMENT || p.propertyValueType === PropertyValueType.SHAPE || p.propertyValueType === PropertyValueType.MARKER) return;
            p.expression = expr; driven++;
          } catch (e5) {}
        });
      }
      if (EFM.expose(sp.property('ADBE Slider Control-0001'), c, '\u0633\u0631\u0639\u0629 \u0627\u0644\u062d\u0631\u0643\u0629 %')) exposed.push('speed');
      if (EFM.expose(st.property('ADBE Slider Control-0001'), c, '\u0642\u0648\u0629 \u0627\u0644\u062d\u0631\u0643\u0629 %')) exposed.push('strength');
    }
    // 4) place + size: a rig null the free layers hang on
    if (ed.transform) {
      var rig = c.layers.addNull(c.duration);
      rig.name = 'EF Rig'; rig.guideLayer = true;
      EFM.tr(rig, 'ADBE Position').setValue([c.width / 2, c.height / 2]);
      for (i = 1; i <= c.numLayers; i++) { L = c.layer(i); if (L !== rig && L.name !== 'EF Controls' && !L.parent && !(L instanceof CameraLayer)) { try { L.parent = rig; } catch (e6) {} } }
      if (EFM.expose(EFM.tr(rig, 'ADBE Position'), c, '\u0627\u0644\u0645\u0643\u0627\u0646')) exposed.push('position');
      if (EFM.expose(EFM.tr(rig, 'ADBE Scale'), c, '\u0627\u0644\u062d\u062c\u0645')) exposed.push('scale');
      if (EFM.expose(EFM.tr(rig, 'ADBE Opacity'), c, '\u0627\u0644\u0634\u0641\u0627\u0641\u064a\u0629')) exposed.push('opacity');
    }
    // 5) your own Expression Controls (sliders, colours, checkboxes) \u2014 exposed with their own names
    if (ed.controls) {
      for (i = 1; i <= c.numLayers; i++) {
        L = c.layer(i);
        if (L.name === 'EF Controls') continue;
        var fx = L.property('ADBE Effect Parade');
        for (var q = 1; q <= fx.numProperties; q++) {
          var eff = fx.property(q), mn = eff.matchName;
          if (!/^ADBE (Slider|Color|Checkbox|Point|Angle) Control$/.test(mn)) continue;
          if (EFM.expose(eff.property(1), c, eff.name)) exposed.push('control');
        }
      }
    }
    // 6) footage that can be swapped in Premiere (media replacement, AE 2019+)
    if (ed.media) {
      for (i = 1; i <= c.numLayers; i++) {
        L = c.layer(i);
        if (EFM.layerType(L) !== 'footage') continue;
        try { if (EFM.expose(L.property('ADBE Layer Source Alternate'), c, '\u0635\u0648\u0631\u0629/\u0641\u064a\u062f\u064a\u0648 ' + i)) exposed.push('media'); } catch (e7) {}
      }
    }
    c.motionGraphicsTemplateName = a.name;
    var f = new File(a.path);
    if (f.parent && !f.parent.exists) f.parent.create();
    app.project.save();
    var ok = c.exportAsMotionGraphicsTemplate(true, f.fsName);
    if (ok === false || !f.exists) throw new Error('\u0627\u0644\u0623\u0641\u062a\u0631 \u0645\u0627\u0631\u0636\u064a\u0634 \u064a\u0637\u0644\u0651\u0639 \u0627\u0644\u0640 MOGRT \u2014 \u0627\u062a\u0623\u0643\u062f \u0625\u0646 \u0627\u0644\u0643\u0648\u0645\u0628 \u0645\u0641\u064a\u0647\u0648\u0634 \u0644\u064a\u0631\u0632 \u0645\u0634 \u0645\u062f\u0639\u0648\u0645\u0629 \u0641\u064a Essential Graphics');
    var thumb = null;
    try { if (a.thumb && c.saveFrameToPng) { c.saveFrameToPng(Math.min(c.duration * 0.5, c.duration - c.frameDuration), new File(a.thumb)); thumb = a.thumb; } } catch (e8) {}
    return { compId: c.id, compName: c.name, project: app.project.file.fsName, path: f.fsName, exposed: exposed, duration: c.duration, width: c.width, height: c.height, thumb: thumb };
  });
};

/** re-export a template comp after editing it (same .mogrt path: Premiere picks up the new version) */
EFMAPI.templateUpdate = function (a) {
  var c = EFM.compById(a.compId, a.compName);
  if (!c) throw new Error('\u0627\u0644\u0643\u0648\u0645\u0628 \u0628\u062a\u0627\u0639 \u0627\u0644\u0642\u0627\u0644\u0628 \u0645\u0634 \u0641\u064a \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u062f\u0647 \u2014 \u0627\u0641\u062a\u062d \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0644\u064a \u0627\u062a\u0639\u0645\u0644 \u0645\u0646\u0647 \u0627\u0644\u0642\u0627\u0644\u0628');
  app.project.save();
  var ok = c.exportAsMotionGraphicsTemplate(true, new File(a.path).fsName);
  if (ok === false) throw new Error('\u0627\u0644\u062a\u062d\u062f\u064a\u062b \u0641\u0634\u0644');
  return { path: a.path, compName: c.name };
};
/** open a template's comp to edit it (opens its project first if it's another one) */
EFMAPI.templateOpen = function (a) {
  if (a.project && (!app.project.file || app.project.file.fsName !== new File(a.project).fsName)) {
    if (!new File(a.project).exists) throw new Error('\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0642\u0627\u0644\u0628 \u0645\u0634 \u0645\u0648\u062c\u0648\u062f: ' + a.project);
    app.open(new File(a.project));
  }
  var c = EFM.compById(a.compId, a.compName);
  if (!c) throw new Error('\u0627\u0644\u0643\u0648\u0645\u0628 \u0628\u062a\u0627\u0639 \u0627\u0644\u0642\u0627\u0644\u0628 \u0645\u0634 \u0645\u0648\u062c\u0648\u062f \u0641\u064a \u0627\u0644\u0645\u0634\u0631\u0648\u0639');
  c.openInViewer();
  return { compName: c.name };
};
EFM.compById = function (id, name) {
  var i, it, byName = null;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (!(it instanceof CompItem)) continue;
    if (it.id === id) return it;
    if (name && it.name === name) byName = it;
  }
  return byName;
};
EFM.folder = function (name) {
  var i, it;
  for (i = 1; i <= app.project.numItems; i++) { it = app.project.item(i); if (it instanceof FolderItem && it.name === name) return it; }
  return app.project.items.addFolder(name);
};

/* ======================= motion ======================= */
/**
 * Write a motion preset (EditFast's 28) on the selected layers.
 * a: { mode: in|out|at, duration, props: { scale:[{t,v,interp,bz}], pos, rotation, opacity } }
 */
EFMAPI.applyMotion = function (a) {
  var c = EFM.comp(), layers = EFM.selected(c);
  return EFM.undo('\u062d\u0631\u0643\u0629', function () {
    var n = 0, i;
    for (i = 0; i < layers.length; i++) n += EFM.motionOn(c, layers[i], a);
    return { layers: layers.length, keys: n };
  });
};
EFM.motionOn = function (c, L, a) {
  var dur = a.duration || 0.5, t0 = a.mode === 'in' ? L.inPoint : a.mode === 'out' ? Math.max(L.inPoint, L.outPoint - dur) : c.time, n = 0, key, keys, p, base, i, v, kt, idx;
  for (key in a.props) {
    if (!a.props.hasOwnProperty(key)) continue;
    keys = a.props[key];
    p = key === 'pos' ? EFM.tr(L, 'ADBE Position') : key === 'scale' ? EFM.tr(L, 'ADBE Scale') : key === 'rotation' ? EFM.tr(L, L.threeDLayer ? 'ADBE Rotate Z' : 'ADBE Rotate Z') : key === 'opacity' ? EFM.tr(L, 'ADBE Opacity') : null;
    if (!p || !keys || !keys.length) continue;
    try { if (p.dimensionsSeparated) p.dimensionsSeparated = false; } catch (e0) {}
    base = p.numKeys ? p.valueAtTime(t0, false) : p.value;
    for (i = 0; i < keys.length; i++) {
      kt = t0 + keys[i].t; v = keys[i].v;
      if (key === 'pos') v = base.length > 2 ? [base[0] + v[0] * c.width, base[1] + v[1] * c.height, base[2]] : [base[0] + v[0] * c.width, base[1] + v[1] * c.height];
      else if (key === 'scale') v = base.length > 2 ? [base[0] * v / 100, base[1] * v / 100, base[2]] : [base[0] * v / 100, base[1] * v / 100];
      else if (key === 'rotation') v = base + v;
      else if (key === 'opacity') v = base * v / 100;
      idx = p.addKey(kt); p.setValueAtKey(idx, v); n++;
    }
    // smooth segments: Bezier with the preset's own curve (influence / speed like a cubic-bezier)
    for (i = 0; i < keys.length - 1; i++) if (keys[i].bz) EFM.easeSegment(p, p.nearestKeyIndex(t0 + keys[i].t), p.nearestKeyIndex(t0 + keys[i + 1].t), keys[i].bz);
  }
  return n;
};
/**
 * Ease one segment (key a \u2192 key b) like a CSS cubic-bezier(x1,y1,x2,y2): influence = x, speed from the slope.
 */
EFM.easeSegment = function (p, ka, kb, bz) {
  if (ka < 1 || kb <= ka || kb > p.numKeys) return;
  var t0 = p.keyTime(ka), t1 = p.keyTime(kb), dt = t1 - t0, va = p.keyValue(ka), vb = p.keyValue(kb), dims, i, dist = 0;
  if (dt <= 0) return;
  var spatial = false;
  try { spatial = p.isSpatial; } catch (e) {}
  if (EFM.isArr(va)) { for (i = 0; i < va.length; i++) dist += (vb[i] - va[i]) * (vb[i] - va[i]); dist = Math.sqrt(dist); } else dist = Math.abs(vb - va);
  var avg = dist / dt;
  var x1 = EFM.clamp(bz[0], 0.001, 1), y1 = bz[1], x2 = EFM.clamp(bz[2], 0, 0.999), y2 = bz[3];
  var outSpeed = avg * (y1 / x1), inSpeed = avg * ((1 - y2) / (1 - x2));
  var outInf = EFM.clamp(x1 * 100, 0.1, 100), inInf = EFM.clamp((1 - x2) * 100, 0.1, 100);
  dims = (EFM.isArr(va) && !spatial) ? va.length : 1;
  function eases(sp, inf) { var arr = [], d; for (d = 0; d < dims; d++) arr.push(new KeyframeEase(sp, inf)); return arr; }
  p.setInterpolationTypeAtKey(ka, p.keyInInterpolationType(ka), KeyframeInterpolationType.BEZIER);
  p.setInterpolationTypeAtKey(kb, KeyframeInterpolationType.BEZIER, p.keyOutInterpolationType(kb));
  p.setTemporalEaseAtKey(ka, p.keyInTemporalEase(ka), eases(outSpeed, outInf));
  p.setTemporalEaseAtKey(kb, eases(inSpeed, inInf), p.keyOutTemporalEase(kb));
};

/** ease the selected keyframes (Flow-style): every pair of neighbouring selected keys gets the curve */
EFMAPI.applyEase = function (a) {
  var c = EFM.comp(), props = c.selectedProperties, n = 0, i, j, p, ks;
  return EFM.undo('\u0645\u0646\u062d\u0646\u0649', function () {
    for (i = 0; i < props.length; i++) {
      p = props[i];
      if (p.propertyType !== PropertyType.PROPERTY || !p.numKeys) continue;
      ks = p.selectedKeys && p.selectedKeys.length > 1 ? p.selectedKeys : null;
      if (!ks) { ks = []; for (j = 1; j <= p.numKeys; j++) ks.push(j); }
      for (j = 0; j < ks.length - 1; j++) { EFM.easeSegment(p, ks[j], ks[j + 1], a.bezier); n++; }
    }
    if (!n) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0643\u064a \u0641\u0631\u064a\u0645\u0632 (\u0623\u0648 \u062e\u0627\u0635\u064a\u0629 \u0641\u064a\u0647\u0627 \u0643\u064a \u0641\u0631\u064a\u0645\u0632) \u0627\u0644\u0623\u0648\u0644');
    return { segments: n };
  });
};

/** move the selected layers in time one after the other (stagger) */
EFMAPI.stagger = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), step = (a.frames || 3) * c.frameDuration, i, order = [];
  for (i = 0; i < L.length; i++) order.push(L[i]);
  if (a.order === 'down') order.sort(function (x, y) { return x.index - y.index; });
  else if (a.order === 'up') order.sort(function (x, y) { return y.index - x.index; });
  else if (a.order === 'random') for (i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
  return EFM.undo('\u0633\u062a\u0627\u062c\u0631', function () {
    var base = order[0].startTime;
    for (i = 0; i < order.length; i++) order[i].startTime = base + i * step;
    return { layers: order.length, step: a.frames || 3 };
  });
};

/** anchor point to a corner / edge / centre of the layer's content, without the layer moving */
EFMAPI.anchor = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), i, n = 0;
  var fx = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] }[a.where || 'c'];
  return EFM.undo('\u0623\u0646\u0643\u0631 \u0628\u0648\u064a\u0646\u062a', function () {
    for (i = 0; i < L.length; i++) {
      var ly = L[i];
      if (ly instanceof CameraLayer || ly instanceof LightLayer) continue;
      var r = ly.sourceRectAtTime(c.time, false), ap = EFM.tr(ly, 'ADBE Anchor Point'), pos = EFM.tr(ly, 'ADBE Position'), sc = EFM.tr(ly, 'ADBE Scale').value;
      if (ap.numKeys || pos.numKeys) continue; // animated: moving the anchor would break the animation
      var na = [r.left + r.width * fx[0], r.top + r.height * fx[1]], oa = ap.value;
      var dx = (na[0] - oa[0]) * sc[0] / 100, dy = (na[1] - oa[1]) * sc[1] / 100;
      var rot = EFM.tr(ly, 'ADBE Rotate Z').value * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot);
      var p = pos.value, np = [p[0] + dx * cs - dy * sn, p[1] + dx * sn + dy * cs];
      if (oa.length > 2) { na.push(oa[2]); np.push(p[2]); }
      ap.setValue(na); pos.setValue(np); n++;
    }
    return { layers: n };
  });
};

/** a null in the middle of the selected layers, and the layers parented to it */
EFMAPI.nullController = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), i, x = 0, y = 0;
  return EFM.undo('\u0646\u0644 \u0643\u0646\u062a\u0631\u0648\u0644\u0631', function () {
    for (i = 0; i < L.length; i++) { var p = EFM.tr(L[i], 'ADBE Position').value; x += p[0]; y += p[1]; }
    var nl = c.layers.addNull(c.duration);
    nl.name = (a && a.name) || 'EF Controller';
    nl.moveBefore(L[0]);
    var any3d = false; for (i = 0; i < L.length; i++) if (L[i].threeDLayer) any3d = true;
    if (any3d) nl.threeDLayer = true;
    EFM.tr(nl, 'ADBE Position').setValue(any3d ? [x / L.length, y / L.length, 0] : [x / L.length, y / L.length]);
    for (i = 0; i < L.length; i++) if (!L[i].parent) L[i].parent = nl;
    return { name: nl.name, layers: L.length };
  });
};

/* ---------------- expressions in one click ---------------- */
EFM.EXPR = {
  wiggle: { label: 'Wiggle', sliders: [['EF Wiggle Freq', 2], ['EF Wiggle Amp', 30]], expr: 'wiggle(effect("EF Wiggle Freq")("ADBE Slider Control-0001"), effect("EF Wiggle Amp")("ADBE Slider Control-0001"))' },
  loopCycle: { label: 'Loop', expr: 'loopOut("cycle")', keys: true },
  loopPingpong: { label: 'Ping-pong', expr: 'loopOut("pingpong")', keys: true },
  bounce: { label: 'Inertial bounce', sliders: [['EF Bounce Amp', 0.06], ['EF Bounce Freq', 2.5], ['EF Bounce Decay', 6]], keys: true,
    expr: 'var amp=effect("EF Bounce Amp")("ADBE Slider Control-0001"),freq=effect("EF Bounce Freq")("ADBE Slider Control-0001"),decay=effect("EF Bounce Decay")("ADBE Slider Control-0001");var n=0;if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time)n--;}var t=0;if(n>0)t=time-key(n).time;if(n>0&&t<1){var v=velocityAtTime(key(n).time-thisComp.frameDuration/10);value+v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);}else value' },
  autoFade: { label: 'Auto fade', sliders: [['EF Fade Frames', 8]], prop: 'opacity',
    expr: 'var f=effect("EF Fade Frames")("ADBE Slider Control-0001")*thisComp.frameDuration;Math.min(linear(time,inPoint,inPoint+f,0,100),linear(time,outPoint-f,outPoint,100,0))' },
  flicker: { label: 'Flicker', sliders: [['EF Flicker', 40]], prop: 'opacity', expr: 'var a=effect("EF Flicker")("ADBE Slider Control-0001");seedRandom(Math.floor(time*24),true);value-random(a)' },
  spin: { label: 'Spin', sliders: [['EF Spin deg/s', 90]], prop: 'rotation', expr: 'value+time*effect("EF Spin deg/s")("ADBE Slider Control-0001")' },
  'float': { label: 'Float', sliders: [['EF Float Amp', 12], ['EF Float Speed', 1]], prop: 'position', expr: 'var a=effect("EF Float Amp")("ADBE Slider Control-0001"),s=effect("EF Float Speed")("ADBE Slider Control-0001");value+[0,Math.sin(time*s*2*Math.PI)*a]' },
  typewriter: { label: 'Typewriter', sliders: [['EF Chars/s', 18]], prop: 'text', expr: 'var n=Math.floor((time-inPoint)*effect("EF Chars/s")("ADBE Slider Control-0001"));text.sourceText.substr(0,Math.max(0,n))' }
};
/**
 * Add an expression (with its own sliders) to the selected properties, or to the property it's made for on the
 * selected layers (fade \u2192 opacity, float \u2192 position, typewriter \u2192 source text).
 */
EFMAPI.addExpression = function (a) {
  var c = EFM.comp(), X = EFM.EXPR[a.kind];
  if (!X) throw new Error('\u0625\u0643\u0633\u0628\u0631\u064a\u0634\u0646 \u0645\u0634 \u0645\u0639\u0631\u0648\u0641: ' + a.kind);
  return EFM.undo(X.label, function () {
    var targets = [], i, p, L;
    var sp = c.selectedProperties;
    for (i = 0; i < sp.length; i++) if (sp[i].propertyType === PropertyType.PROPERTY && sp[i].canSetExpression) targets.push(sp[i]);
    if (!targets.length) {
      L = EFM.selected(c);
      for (i = 0; i < L.length; i++) {
        var want = X.prop || 'position';
        p = want === 'opacity' ? EFM.tr(L[i], 'ADBE Opacity') : want === 'rotation' ? EFM.tr(L[i], 'ADBE Rotate Z') : want === 'text' ? (L[i] instanceof TextLayer ? L[i].property('ADBE Text Properties').property('ADBE Text Document') : null) : EFM.tr(L[i], 'ADBE Position');
        if (p) targets.push(p);
      }
    }
    if (!targets.length) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0644\u064a\u0631 \u0623\u0648 \u062e\u0627\u0635\u064a\u0629 \u0627\u0644\u0623\u0648\u0644');
    var n = 0, skipped = 0;
    for (i = 0; i < targets.length; i++) {
      p = targets[i];
      if (X.keys && p.numKeys < 1) { skipped++; continue; }
      L = p.propertyGroup(p.propertyDepth);
      if (X.sliders) for (var s = 0; s < X.sliders.length; s++) { var e = EFM.effect(L, 'ADBE Slider Control', X.sliders[s][0]); if (!e.property('ADBE Slider Control-0001').expressionEnabled && e.property('ADBE Slider Control-0001').value === 0) e.property('ADBE Slider Control-0001').setValue(X.sliders[s][1]); }
      var ex = X.expr;
      if (a.kind === 'float' && p.value && p.value.length > 2) ex = ex.replace('[0,Math.sin(time*s*2*Math.PI)*a]', '[0,Math.sin(time*s*2*Math.PI)*a,0]');
      p.expression = ex; n++;
    }
    if (!n) throw new Error('\u0627\u0644\u0625\u0643\u0633\u0628\u0631\u064a\u0634\u0646 \u062f\u0647 \u0645\u062d\u062a\u0627\u062c \u0643\u064a \u0641\u0631\u064a\u0645\u0632 \u0639\u0644\u0649 \u0627\u0644\u062e\u0627\u0635\u064a\u0629 (\u0627\u0639\u0645\u0644 \u062d\u0631\u0643\u0629 \u0627\u0644\u0623\u0648\u0644)');
    return { applied: n, skipped: skipped };
  });
};

/* ---------------- text animators ---------------- */
/**
 * Character / word / line reveals on the selected text layers.
 * a: { preset: fadeUp|typewriter|blurIn|scalePop|slideIn|tracking, by: chars|words|lines, duration, start: in|now }
 */
EFMAPI.textAnimate = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), n = 0, i;
  return EFM.undo('\u0623\u0646\u064a\u0645\u064a\u0634\u0646 \u0643\u0644\u0627\u0645', function () {
    for (i = 0; i < L.length; i++) {
      if (!(L[i] instanceof TextLayer)) continue;
      var t0 = a.start === 'now' ? c.time : L[i].inPoint, d = a.duration || 1;
      var anims = L[i].property('ADBE Text Properties').property('ADBE Text Animators');
      var an = anims.addProperty('ADBE Text Animator');
      an.name = 'EF ' + (a.preset || 'fadeUp');
      var sel = an.property('ADBE Text Selectors').addProperty('ADBE Text Selector');
      var adv = sel.property('ADBE Text Range Advanced');
      try { adv.property('ADBE Text Range Units').setValue(1); } catch (e0) {}
      try { adv.property('ADBE Text Range Type2').setValue(a.by === 'words' ? 3 : a.by === 'lines' ? 4 : 1); } catch (e1) {}
      try { adv.property('ADBE Text Range Shape').setValue(a.preset === 'typewriter' ? 1 : 3); adv.property('ADBE Text Levels Max Ease').setValue(a.preset === 'typewriter' ? 0 : 60); } catch (e2) {}
      var props = an.property('ADBE Text Animator Properties'), P = a.preset || 'fadeUp';
      if (P === 'fadeUp' || P === 'typewriter' || P === 'blurIn' || P === 'scalePop' || P === 'slideIn') props.addProperty('ADBE Text Opacity').setValue(0);
      if (P === 'fadeUp') props.addProperty('ADBE Text Position 3D').setValue([0, 40, 0]);
      if (P === 'slideIn') props.addProperty('ADBE Text Position 3D').setValue([-80, 0, 0]);
      if (P === 'blurIn') props.addProperty('ADBE Text Blur').setValue([30, 30]);
      if (P === 'scalePop') props.addProperty('ADBE Text Scale 3D').setValue([0, 0, 100]);
      if (P === 'tracking') props.addProperty('ADBE Text Tracking Amount').setValue(-40);
      // the selector's offset sweeps 0 \u2192 100 % (start at "everything affected" = hidden, end at none)
      var off = sel.property('ADBE Text Percent Offset');
      off.setValueAtTime(t0, 0); off.setValueAtTime(t0 + d, 100);
      if (P !== 'typewriter') { EFM.easeSegment(off, 1, 2, [0.25, 0.1, 0.25, 1]); }
      // the selector range covers the whole text; "start" 0 / "end" 100 and offset pushes it out
      try { sel.property('ADBE Text Percent Start').setValue(0); sel.property('ADBE Text Percent End').setValue(100); } catch (e3) {}
      n++;
    }
    if (!n) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0644\u064a\u0631 \u0643\u0644\u0627\u0645 (Text) \u0627\u0644\u0623\u0648\u0644');
    return { layers: n };
  });
};

/* ---------------- shapes, lower thirds ---------------- */
EFM.rectShape = function (layer, w, h, r, color, name) {
  var root = layer.property('ADBE Root Vectors Group'), g = root.addProperty('ADBE Vector Group');
  g.name = name || 'Box';
  var v = g.property('ADBE Vectors Group'), rect = v.addProperty('ADBE Vector Shape - Rect');
  rect.property('ADBE Vector Rect Size').setValue([w, h]);
  rect.property('ADBE Vector Rect Roundness').setValue(r || 0);
  var fill = v.addProperty('ADBE Vector Graphic - Fill');
  fill.property('ADBE Vector Fill Color').setValue(color);
  return g;
};
/** a simple shape on its own layer: box, circle, line (underline), ring */
EFMAPI.addShape = function (a) {
  var c = EFM.comp();
  return EFM.undo('\u0634\u0643\u0644', function () {
    var L = c.layers.addShape(), col = EFM.fromHex(a.color || '#F97316'), w = a.width || Math.round(c.width * 0.3), h = a.height || Math.round(c.height * 0.12);
    L.name = 'EF ' + (a.kind || 'box');
    var root = L.property('ADBE Root Vectors Group'), g = root.addProperty('ADBE Vector Group'), v = g.property('ADBE Vectors Group');
    if (a.kind === 'circle' || a.kind === 'ring') { var el = v.addProperty('ADBE Vector Shape - Ellipse'); el.property('ADBE Vector Ellipse Size').setValue([h * 2, h * 2]); }
    else { var rc = v.addProperty('ADBE Vector Shape - Rect'); rc.property('ADBE Vector Rect Size').setValue(a.kind === 'line' ? [w, Math.max(4, Math.round(h / 10))] : [w, h]); rc.property('ADBE Vector Rect Roundness').setValue(a.kind === 'line' ? 4 : (a.round || 18)); }
    if (a.kind === 'ring') { var st = v.addProperty('ADBE Vector Graphic - Stroke'); st.property('ADBE Vector Stroke Color').setValue(col); st.property('ADBE Vector Stroke Width').setValue(Math.max(4, h / 6)); }
    else v.addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue(col);
    EFM.tr(L, 'ADBE Position').setValue([c.width / 2, c.height / 2]);
    L.startTime = 0; L.inPoint = c.time;
    return { name: L.name, index: L.index };
  });
};
/**
 * A lower third built from editable layers (bar + accent + name + title) that animates in and out \u2014
 * ready to tweak, or to save as a template right away.
 */
EFMAPI.lowerThird = function (a) {
  var c = EFM.comp(), t0 = c.time, dur = a.duration || 5, col = EFM.fromHex(a.color || '#EA580C'), acc = EFM.fromHex(a.accent || '#FBBF24');
  return EFM.undo('\u0644\u0648\u0648\u0631 \u062b\u064a\u0631\u062f', function () {
    var x = Math.round(c.width * (a.side === 'right' ? 0.66 : 0.06)), y = Math.round(c.height * 0.78), w = Math.round(c.width * 0.3), h = Math.round(c.height * 0.1);
    var bar = c.layers.addShape(); bar.name = 'LT Bar';
    EFM.rectShape(bar, w, h, 10, col, 'Bar');
    EFM.tr(bar, 'ADBE Anchor Point').setValue([-w / 2, 0]);
    EFM.tr(bar, 'ADBE Position').setValue([x, y]);
    var line = c.layers.addShape(); line.name = 'LT Accent';
    EFM.rectShape(line, 8, h, 4, acc, 'Accent');
    EFM.tr(line, 'ADBE Position').setValue([x - 8, y]);
    var name = c.layers.addText(a.name || '\u0627\u0644\u0627\u0633\u0645'); name.name = 'LT Name';
    var title = c.layers.addText(a.title || '\u0627\u0644\u0645\u0633\u0645\u0651\u0649'); title.name = 'LT Title';
    function style(L, size, fill) {
      var p = L.property('ADBE Text Properties').property('ADBE Text Document'), d = p.value;
      d.fontSize = size; d.fillColor = fill; d.applyFill = true; d.applyStroke = false;
      try { d.justification = ParagraphJustification.LEFT_JUSTIFY; } catch (e) {}
      p.setValue(d);
    }
    style(name, Math.round(h * 0.42), [1, 1, 1]); style(title, Math.round(h * 0.26), [1, 0.93, 0.84]);
    EFM.tr(name, 'ADBE Position').setValue([x + 24, y - h * 0.06]);
    EFM.tr(title, 'ADBE Position').setValue([x + 24, y + h * 0.3]);
    var all = [bar, line, name, title], i;
    for (i = 0; i < all.length; i++) { all[i].startTime = 0; all[i].inPoint = t0; all[i].outPoint = Math.min(c.duration, t0 + dur); }
    // in: the bar grows from the left, the words rise and fade; out: everything slides back
    var sc = EFM.tr(bar, 'ADBE Scale');
    sc.setValueAtTime(t0, [0, 100]); sc.setValueAtTime(t0 + 0.45, [100, 100]); sc.setValueAtTime(t0 + dur - 0.4, [100, 100]); sc.setValueAtTime(t0 + dur, [0, 100]);
    EFM.easeSegment(sc, 1, 2, [0.16, 1, 0.3, 1]); EFM.easeSegment(sc, 3, 4, [0.7, 0, 0.84, 0]);
    var words = [name, title];
    for (i = 0; i < words.length; i++) {
      var op = EFM.tr(words[i], 'ADBE Opacity'), d0 = t0 + 0.2 + i * 0.08;
      op.setValueAtTime(d0, 0); op.setValueAtTime(d0 + 0.35, 100); op.setValueAtTime(t0 + dur - 0.35, 100); op.setValueAtTime(t0 + dur - 0.1, 0);
      var ps = EFM.tr(words[i], 'ADBE Position'), pv = ps.value;
      ps.setValueAtTime(d0, [pv[0], pv[1] + 18]); ps.setValueAtTime(d0 + 0.4, pv);
      EFM.easeSegment(ps, 1, 2, [0.16, 1, 0.3, 1]);
    }
    return { layers: 4, start: t0, duration: dur };
  });
};

/* ======================= 3D ======================= */
EFM.camera = function (c) {
  var i; for (i = 1; i <= c.numLayers; i++) if (c.layer(i) instanceof CameraLayer) return c.layer(i);
  return null;
};
/**
 * A camera with a rig null and a ready move: push (slow dolly in), orbit, dolly (side), float (handheld drift).
 * The rig null carries the move, so the camera itself stays easy to adjust.
 */
EFMAPI.cameraRig = function (a) {
  var c = EFM.comp();
  return EFM.undo('\u0643\u0627\u0645\u064a\u0631\u0627 ' + a.kind, function () {
    var cam = c.layers.addCamera('EF Camera', [c.width / 2, c.height / 2]);
    var rig = c.layers.addNull(c.duration); rig.name = 'EF Camera Rig'; rig.threeDLayer = true;
    EFM.tr(rig, 'ADBE Position').setValue([c.width / 2, c.height / 2, 0]);
    cam.parent = rig;
    var t0 = c.time, t1 = Math.min(c.duration, t0 + (a.duration || 5)), amt = a.amount || 1;
    var pos = EFM.tr(rig, 'ADBE Position'), ry = EFM.tr(rig, 'ADBE Rotate Y'), p0 = pos.value;
    if (a.kind === 'push') { pos.setValueAtTime(t0, p0); pos.setValueAtTime(t1, [p0[0], p0[1], p0[2] + 400 * amt]); EFM.easeSegment(pos, 1, 2, [0.42, 0, 0.58, 1]); }
    else if (a.kind === 'orbit') { ry.setValueAtTime(t0, -20 * amt); ry.setValueAtTime(t1, 20 * amt); EFM.easeSegment(ry, 1, 2, [0.42, 0, 0.58, 1]); }
    else if (a.kind === 'dolly') { pos.setValueAtTime(t0, [p0[0] - 220 * amt, p0[1], p0[2]]); pos.setValueAtTime(t1, [p0[0] + 220 * amt, p0[1], p0[2]]); EFM.easeSegment(pos, 1, 2, [0.42, 0, 0.58, 1]); }
    else { pos.expression = 'value+[Math.sin(time*0.7)*' + (14 * amt) + ',Math.cos(time*0.5)*' + (9 * amt) + ',Math.sin(time*0.3)*' + (30 * amt) + ']'; EFM.tr(rig, 'ADBE Rotate Z').expression = 'Math.sin(time*0.4)*' + (0.6 * amt); }
    return { camera: cam.name, rig: rig.name, kind: a.kind };
  });
};
/**
 * Parallax: the selected layers become 3D and spread in depth (top of the stack nearest), each scaled so it
 * still looks the same size through the camera \u2014 move the camera and you get real depth.
 */
EFMAPI.parallax = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), i, cam = EFM.camera(c);
  var zoom = cam ? cam.property('ADBE Camera Options Group').property('ADBE Camera Zoom').value : c.width / 2 / Math.tan(39.6 / 2 * Math.PI / 180);
  L.sort(function (x, y) { return x.index - y.index; });
  return EFM.undo('\u0628\u0627\u0631\u0627\u0644\u0627\u0643\u0633', function () {
    var gap = a.depth || 300;
    for (i = 0; i < L.length; i++) {
      var ly = L[i];
      if (ly instanceof CameraLayer || ly instanceof LightLayer) continue;
      ly.threeDLayer = true;
      var z = i * gap, k = (zoom + z) / zoom;
      EFM.change(EFM.tr(ly, 'ADBE Position'), function (p) { return [p[0], p[1], z]; });
      EFM.change(EFM.tr(ly, 'ADBE Scale'), function (s) { return [s[0] * k, s[1] * k, (s.length > 2 ? s[2] : 100) * k]; });
    }
    return { layers: L.length, depth: gap * (L.length - 1) };
  });
};
/** a key light (spot, soft shadows) + ambient fill; 3D layers start casting shadows */
EFMAPI.lightRig = function () {
  var c = EFM.comp();
  return EFM.undo('\u0625\u0636\u0627\u0621\u0629', function () {
    var key = c.layers.addLight('EF Key Light', [c.width / 2, c.height / 2]);
    key.lightType = LightType.SPOT;
    EFM.tr(key, 'ADBE Position').setValue([c.width * 0.25, c.height * 0.15, -900]);
    var o = key.property('ADBE Light Options Group');
    try { o.property('ADBE Light Intensity').setValue(110); o.property('ADBE Light Casts Shadows').setValue(1); o.property('ADBE Light Shadow Diffusion').setValue(40); o.property('ADBE Light Color').setValue([1, 0.93, 0.85, 1]); } catch (e) {}
    var amb = c.layers.addLight('EF Ambient', [c.width / 2, c.height / 2]);
    amb.lightType = LightType.AMBIENT;
    try { amb.property('ADBE Light Options Group').property('ADBE Light Intensity').setValue(35); } catch (e2) {}
    var n = 0, i;
    for (i = 1; i <= c.numLayers; i++) { var L = c.layer(i); if (L.threeDLayer && !L.nullLayer && !(L instanceof LightLayer) && !(L instanceof CameraLayer)) { try { L.property('ADBE Material Options Group').property('ADBE Casts Shadows').setValue(1); n++; } catch (e3) {} } }
    return { lights: 2, casting: n };
  });
};
/** real 3D depth for text / shapes: the Advanced 3D (or Cinema 4D) renderer + extrusion */
EFMAPI.extrude = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), n = 0, i;
  return EFM.undo('\u062b\u0631\u064a \u062f\u064a', function () {
    var renderers = c.renderers || [], pick = null;
    for (i = 0; i < renderers.length; i++) if (renderers[i] === 'ADBE Advanced 3d') pick = renderers[i];
    if (!pick) for (i = 0; i < renderers.length; i++) if (renderers[i] === 'ADBE Ernst') pick = renderers[i];
    if (!pick) throw new Error('\u0646\u0633\u062e\u0629 \u0627\u0644\u0623\u0641\u062a\u0631 \u062f\u064a \u0645\u0641\u064a\u0647\u0627\u0634 Advanced 3D \u0648\u0644\u0627 Cinema 4D renderer');
    c.renderer = pick;
    for (i = 0; i < L.length; i++) {
      if (!(L[i] instanceof TextLayer) && !(L[i] instanceof ShapeLayer)) continue;
      L[i].threeDLayer = true;
      try { L[i].property('ADBE Extrsn Options Group').property('ADBE Extrsn Depth').setValue(a.depth || 40); n++; } catch (e) {}
    }
    if (!n) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0644\u064a\u0631 \u0643\u0644\u0627\u0645 \u0623\u0648 \u0634\u0643\u0644 \u0627\u0644\u0623\u0648\u0644');
    return { layers: n, renderer: pick };
  });
};

/* ======================= routine: render, clean, import, colours ======================= */
/**
 * Add the comp to the render queue with a ready output and render it (or send it to Media Encoder).
 * a: { path, template: 'alpha'|'h264'|'prores', ame }
 */
EFMAPI.render = function (a) {
  EFM.needWrite();
  var c = EFM.comp(), rq = app.project.renderQueue, item = rq.items.add(c), om = item.outputModule(1), names = om.templates || [], i, want = null;
  var prefer = a.template === 'alpha' ? [/alpha/i, /ProRes 4444/i] : a.template === 'prores' ? [/ProRes 422 HQ/i, /ProRes/i] : [/H\.264/i, /High Quality$/i];
  for (var k = 0; k < prefer.length && !want; k++) for (i = 0; i < names.length; i++) if (prefer[k].test(names[i]) && !/^_HIDDEN/.test(names[i])) { want = names[i]; break; }
  if (want) om.applyTemplate(want);
  om.file = new File(a.path);
  if (a.ame) { rq.queueInAME(true); return { path: om.file.fsName, template: want, ame: true }; }
  rq.render();
  return { path: om.file.fsName, template: want, ame: false, done: om.file.exists };
};
/** tidy the project: unused footage out, everything sorted into folders by kind */
EFMAPI.cleanup = function (a) {
  return EFM.undo('\u062a\u0646\u0636\u064a\u0641 \u0627\u0644\u0645\u0634\u0631\u0648\u0639', function () {
    var removed = 0, moved = 0, i, it;
    if (a.removeUnused) { try { removed = app.project.removeUnusedFootage(); } catch (e) {} }
    if (a.organize) {
      var F = { comps: EFM.folder('Comps'), video: EFM.folder('Footage'), audio: EFM.folder('Audio'), images: EFM.folder('Images'), solids: EFM.folder('Solids') };
      for (i = app.project.numItems; i >= 1; i--) {
        it = app.project.item(i);
        if (it instanceof FolderItem || it.parentFolder !== app.project.rootFolder) continue;
        var to = null;
        if (it instanceof CompItem) to = F.comps;
        else if (it instanceof FootageItem) {
          try { if (it.mainSource instanceof SolidSource) to = F.solids; else if (!it.hasVideo && it.hasAudio) to = F.audio; else if (it.mainSource.isStill) to = F.images; else to = F.video; } catch (e2) { to = F.video; }
        }
        if (to) { it.parentFolder = to; moved++; }
      }
    }
    return { removed: removed, moved: moved };
  });
};
/** a file from \u0645\u0643\u062a\u0628\u062a\u064a into the active comp at the current time (imported once, reused after) */
EFMAPI.importToComp = function (a) {
  var c = EFM.comp(), f = new File(a.path), i, it = null;
  if (!f.exists) throw new Error('\u0627\u0644\u0645\u0644\u0641 \u0645\u0634 \u0645\u0648\u062c\u0648\u062f: ' + a.path);
  for (i = 1; i <= app.project.numItems; i++) { var x = app.project.item(i); try { if (x instanceof FootageItem && x.file && x.file.fsName === f.fsName) { it = x; break; } } catch (e) {} }
  return EFM.undo('\u062d\u0637 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629', function () {
    if (!it) { it = app.project.importFile(new ImportOptions(f)); try { it.parentFolder = EFM.folder('EditFast Library'); } catch (e2) {} }
    var L = c.layers.add(it);
    L.startTime = c.time;
    return { name: L.name, index: L.index };
  });
};
/** the colours used in the comp's shapes (and text), most used first */
EFMAPI.paletteRead = function () {
  var c = EFM.comp(), cnt = {}, hex = {}, i, list = [];
  for (i = 1; i <= c.numLayers; i++) {
    var L = c.layer(i);
    EFM.walk(L, function (p) {
      try {
        if (p.propertyValueType !== PropertyValueType.COLOR || p.numKeys > 0 || p.expressionEnabled) return;
        if (!/^ADBE Vector (Fill|Stroke) Color$/.test(p.matchName) && !/^ADBE Fill-0002$/.test(p.matchName)) return;
        var k = EFM.colorKey(p.value); cnt[k] = (cnt[k] || 0) + 1; hex[k] = EFM.toHex(p.value);
      } catch (e) {}
    });
    if (L instanceof TextLayer) { try { var fc = L.property('ADBE Text Properties').property('ADBE Text Document').value.fillColor, tk = EFM.colorKey(fc); cnt[tk] = (cnt[tk] || 0) + 1; hex[tk] = EFM.toHex(fc); } catch (e2) {} }
  }
  for (var k2 in cnt) if (cnt.hasOwnProperty(k2)) list.push({ hex: hex[k2], count: cnt[k2] });
  list.sort(function (x, y) { return y.count - x.count; });
  return { colors: list };
};
/** swap colours everywhere in the comp: a.map = { '#old': '#new' } */
EFMAPI.paletteApply = function (a) {
  var c = EFM.comp(), n = 0, i, map = {};
  for (var k in a.map) if (a.map.hasOwnProperty(k)) map[EFM.colorKey(EFM.fromHex(k))] = EFM.fromHex(a.map[k]);
  return EFM.undo('\u0623\u0644\u0648\u0627\u0646', function () {
    for (i = 1; i <= c.numLayers; i++) {
      var L = c.layer(i);
      EFM.walk(L, function (p) {
        try {
          if (p.propertyValueType !== PropertyValueType.COLOR || p.numKeys > 0 || p.expressionEnabled) return;
          var to = map[EFM.colorKey(p.value)]; if (to) { p.setValue(to); n++; }
        } catch (e) {}
      });
      if (L instanceof TextLayer) {
        try { var sp = L.property('ADBE Text Properties').property('ADBE Text Document'), d = sp.value, t2 = map[EFM.colorKey(d.fillColor)]; if (t2 && !sp.numKeys) { d.fillColor = [t2[0], t2[1], t2[2]]; sp.setValue(d); n++; } } catch (e2) {}
      }
    }
    return { changed: n };
  });
};

/** quick checks that the AE features EditFast needs exist in this version */
EFMAPI.selfTest = function () {
  var r = { version: app.version, comp: !!(app.project.activeItem instanceof CompItem), saved: !!app.project.file, canWrite: EFM.canWrite() };
  try { r.mogrtExport = typeof CompItem.prototype.exportAsMotionGraphicsTemplate === 'function' || !!(app.project.activeItem && app.project.activeItem.exportAsMotionGraphicsTemplate); } catch (e) { r.mogrtExport = false; }
  try { r.renderers = app.project.activeItem ? app.project.activeItem.renderers : []; } catch (e2) { r.renderers = []; }
  return r;
};

function efm_call(name, jsonArgs) {
  try {
    if (!EFMAPI.hasOwnProperty(name)) throw new Error('unknown host function ' + name);
    var data = EFMAPI[name](EFM.json.parse(jsonArgs));
    return EFM.json.stringify({ ok: true, data: data });
  } catch (e) {
    return EFM.json.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line, fn: name });
  }
}

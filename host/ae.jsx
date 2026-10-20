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
  if (EFM.isArr(va)) { for (i = 0; i < va.length; i++) dist += (vb[i] - va[i]) * (vb[i] - va[i]); dist = Math.sqrt(dist); } else if (typeof va === 'number') dist = Math.abs(vb - va); // paths (Shape): influence only
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
  squash: { label: 'Squash & stretch', sliders: [['EF Squash', 25]], prop: 'scale', expr: 'var v=transform.position.velocity,sp=Math.min(1,Math.sqrt(v[0]*v[0]+v[1]*v[1])/3000)*effect("EF Squash")("ADBE Slider Control-0001")/100;[value[0]*(1-sp*0.5),value[1]*(1+sp)]' },
  pendulum: { label: 'Pendulum', sliders: [['EF Swing deg', 25], ['EF Swing Speed', 1], ['EF Swing Decay', 0.4]], prop: 'rotation', expr: 'var a=effect("EF Swing deg")("ADBE Slider Control-0001"),f=effect("EF Swing Speed")("ADBE Slider Control-0001"),d=effect("EF Swing Decay")("ADBE Slider Control-0001"),t=time-inPoint;value+a*Math.sin(t*f*Math.PI*2)*Math.exp(-d*t)' },
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
        p = want === 'opacity' ? EFM.tr(L[i], 'ADBE Opacity') : want === 'scale' ? EFM.tr(L[i], 'ADBE Scale') : want === 'rotation' ? EFM.tr(L[i], 'ADBE Rotate Z') : want === 'text' ? (L[i] instanceof TextLayer ? L[i].property('ADBE Text Properties').property('ADBE Text Document') : null) : EFM.tr(L[i], 'ADBE Position');
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
 * One text animator on one text layer, starting at t0.
 * a: { preset: fadeUp|typewriter|blurIn|scalePop|slideIn|tracking|rotateIn|dropIn, by: chars|words|lines, duration, out }
 * In: the range offset sweeps 0 \u2192 100 (everything affected = hidden \u2192 none). Out: -100 \u2192 0 (none \u2192 everything).
 */
EFM.textAnimOn = function (L, a, t0) {
  var d = a.duration || 1;
  var anims = L.property('ADBE Text Properties').property('ADBE Text Animators');
  var an = anims.addProperty('ADBE Text Animator');
  an.name = 'EF ' + (a.out ? 'out ' : '') + (a.preset || 'fadeUp');
  var sel = an.property('ADBE Text Selectors').addProperty('ADBE Text Selector');
  var adv = sel.property('ADBE Text Range Advanced');
  try { adv.property('ADBE Text Range Units').setValue(1); } catch (e0) {}
  try { adv.property('ADBE Text Range Type2').setValue(a.by === 'words' ? 3 : a.by === 'lines' ? 4 : 1); } catch (e1) {}
  try { adv.property('ADBE Text Range Shape').setValue(a.preset === 'typewriter' ? 1 : 3); adv.property('ADBE Text Levels Max Ease').setValue(a.preset === 'typewriter' ? 0 : 60); } catch (e2) {}
  var props = an.property('ADBE Text Animator Properties'), P = a.preset || 'fadeUp';
  if (P !== 'tracking') props.addProperty('ADBE Text Opacity').setValue(0);
  if (P === 'fadeUp') props.addProperty('ADBE Text Position 3D').setValue([0, 40, 0]);
  if (P === 'slideIn') props.addProperty('ADBE Text Position 3D').setValue([-80, 0, 0]);
  if (P === 'dropIn') props.addProperty('ADBE Text Position 3D').setValue([0, -90, 0]);
  if (P === 'blurIn') props.addProperty('ADBE Text Blur').setValue([30, 30]);
  if (P === 'scalePop') props.addProperty('ADBE Text Scale 3D').setValue([0, 0, 100]);
  if (P === 'rotateIn') { try { props.addProperty('ADBE Text Rotation').setValue(-70); } catch (eR) {} props.addProperty('ADBE Text Scale 3D').setValue([60, 60, 100]); }
  if (P === 'tracking') props.addProperty('ADBE Text Tracking Amount').setValue(-40);
  var off = sel.property('ADBE Text Percent Offset');
  if (a.out) { off.setValueAtTime(t0, -100); off.setValueAtTime(t0 + d, 0); }
  else { off.setValueAtTime(t0, 0); off.setValueAtTime(t0 + d, 100); }
  if (P !== 'typewriter') { EFM.easeSegment(off, 1, 2, a.out ? [0.7, 0, 0.84, 0] : [0.16, 1, 0.3, 1]); }
  try { sel.property('ADBE Text Percent Start').setValue(0); sel.property('ADBE Text Percent End').setValue(100); } catch (e3) {}
  return an;
};
/**
 * Character / word / line reveals on the selected text layers.
 * a: { preset, by: chars|words|lines, duration, start: in|now }
 */
EFMAPI.textAnimate = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), n = 0, i;
  return EFM.undo('\u0623\u0646\u064a\u0645\u064a\u0634\u0646 \u0643\u0644\u0627\u0645', function () {
    for (i = 0; i < L.length; i++) {
      if (!(L[i] instanceof TextLayer)) continue;
      EFM.textAnimOn(L[i], a, a.start === 'now' ? c.time : L[i].inPoint);
      n++;
    }
    if (!n) throw new Error('\u0627\u062e\u062a\u0627\u0631 \u0644\u064a\u0631 \u0643\u0644\u0627\u0645 (Text) \u0627\u0644\u0623\u0648\u0644');
    return { layers: n };
  });
};

/* ======================= AI director: build / edit a scene from a description ======================= */
EFM.TPROP = { position: 'ADBE Position', scale: 'ADBE Scale', rotation: 'ADBE Rotate Z', opacity: 'ADBE Opacity', anchor: 'ADBE Anchor Point', rotationX: 'ADBE Rotate X', rotationY: 'ADBE Rotate Y', orientation: 'ADBE Orientation' };
EFM.SHAPEP = { trimStart: 'ADBE Vector Trim Start', trimEnd: 'ADBE Vector Trim End', trimOffset: 'ADBE Vector Trim Offset', fillColor: 'ADBE Vector Fill Color', fillOpacity: 'ADBE Vector Fill Opacity',
  strokeColor: 'ADBE Vector Stroke Color', strokeWidth: 'ADBE Vector Stroke Width', size: ['ADBE Vector Rect Size', 'ADBE Vector Ellipse Size'], roundness: 'ADBE Vector Rect Roundness', path: 'ADBE Vector Shape',
  repeaterCopies: 'ADBE Vector Repeater Copies', repeaterOffset: 'ADBE Vector Repeater Offset', repeaterPosition: 'ADBE Vector Repeater Position', repeaterScale: 'ADBE Vector Repeater Scale', repeaterRotation: 'ADBE Vector Repeater Rotation',
  outerRadius: 'ADBE Vector Star Outer Radius', innerRadius: 'ADBE Vector Star Inner Radius', starRotation: 'ADBE Vector Star Rotation', groupPosition: 'ADBE Vector Position', groupScale: 'ADBE Vector Scale', groupRotation: 'ADBE Vector Rotation' };
EFM.MASKP = { path: 'ADBE Mask Shape', feather: 'ADBE Mask Feather', expansion: 'ADBE Mask Offset', opacity: 'ADBE Mask Opacity' };
EFM.CAMP = { zoom: 'ADBE Camera Zoom', focusDistance: 'ADBE Camera Focus Distance', aperture: 'ADBE Camera Aperture', blurLevel: 'ADBE Camera Blur Level', dof: 'ADBE Camera Depth of Field' };
EFM.LIGHTP = { intensity: 'ADBE Light Intensity', color: 'ADBE Light Color', coneAngle: 'ADBE Light Cone Angle', coneFeather: 'ADBE Light Cone Feather 2', castsShadows: 'ADBE Light Casts Shadows' };
EFM.BLEND = { normal: 'NORMAL', add: 'ADD', screen: 'SCREEN', multiply: 'MULTIPLY', overlay: 'OVERLAY', softLight: 'SOFT_LIGHT', colorDodge: 'COLOR_DODGE', lighten: 'LIGHTEN', darken: 'DARKEN', difference: 'DIFFERENCE' };
EFM.warn = [];
EFM.layerByName = function (c, name) { var i; for (i = 1; i <= c.numLayers; i++) if (c.layer(i).name === name) return c.layer(i); return null; };
/** the first property / group under `group` whose matchName (or English name, any case) is `match` \u2014 children first, then deeper */
EFM.find = function (group, match, depth) {
  var i, p, r, lm = String(match).toLowerCase();
  if ((depth || 0) > 14 || !group || !group.numProperties) return null;
  for (i = 1; i <= group.numProperties; i++) { p = group.property(i); if (p && (p.matchName === match || String(p.name).toLowerCase() === lm)) return p; }
  for (i = 1; i <= group.numProperties; i++) { p = group.property(i); if (p && p.propertyType !== PropertyType.PROPERTY) { r = EFM.find(p, match, (depth || 0) + 1); if (r) return r; } }
  return null;
};
/** the n-th property with this matchName under group (depth first, in order) */
EFM.findNth = function (group, match, n) {
  var found = null, k = 0;
  (function walk(g, d) {
    var i, p;
    if (found || d > 14 || !g || !g.numProperties) return;
    for (i = 1; i <= g.numProperties && !found; i++) { p = g.property(i); if (!p) continue; if (p.matchName === match && ++k === n) { found = p; return; } if (p.propertyType !== PropertyType.PROPERTY) walk(p, d + 1); }
  })(group, 0);
  return found;
};
/** Advanced 3D (or Cinema 4D) renderer on a comp, for extrusion / 3D models */
EFM.renderer3d = function (c) {
  var r = c.renderers || [], i;
  for (i = 0; i < r.length; i++) if (r[i] === 'ADBE Advanced 3d') { c.renderer = r[i]; return r[i]; }
  for (i = 0; i < r.length; i++) if (r[i] === 'ADBE Ernst') { c.renderer = r[i]; return r[i]; }
  EFM.warn.push('3D renderer'); return null;
};
/** the property a scene key targets: transform names, shape:\u2026, mask:n.\u2026, camera:\u2026, light:\u2026, "fx:<effect match>|<param>" */
EFM.target = function (L, key) {
  var m, fx, i, e, parts, list, j, p;
  try {
    if (key.indexOf('fxl:') === 0) {
      parts = key.substr(4).split('|'); fx = L.property('ADBE Effect Parade');
      for (i = 1; i <= fx.numProperties; i++) { e = fx.property(i); if (e.name === parts[0]) return EFM.find(e, parts[1]); }
      return null;
    }
    if (key.indexOf('fx:') === 0) {
      parts = key.substr(3).split('|'); fx = L.property('ADBE Effect Parade');
      for (i = 1; i <= fx.numProperties; i++) { e = fx.property(i); if (e.matchName === parts[0]) return EFM.find(e, parts[1]); }
      return null;
    }
    if (key === 'text') return L instanceof TextLayer ? L.property('ADBE Text Properties').property('ADBE Text Document') : null;
    m = /^shape:path\.(\d+)$/.exec(key);
    if (m) return EFM.findNth(L.property('ADBE Root Vectors Group'), 'ADBE Vector Shape', +m[1]);
    if (key.indexOf('geometry:') === 0) return EFM.find(L.property('ADBE Extrsn Options Group'), { depth: 'ADBE Extrsn Depth', bevelDepth: 'ADBE Bevel Depth', bevelStyle: 'ADBE Bevel Styles' }[key.substr(9)]);
    if (key.indexOf('shape:') === 0) {
      list = EFM.SHAPEP[key.substr(6)]; if (!list) return null;
      if (!EFM.isArr(list)) list = [list];
      for (j = 0; j < list.length; j++) { p = EFM.find(L.property('ADBE Root Vectors Group'), list[j]); if (p) return p; }
      return null;
    }
    m = /^mask:(\d+)\.(\w+)$/.exec(key);
    if (m) { var mk = L.property('ADBE Mask Parade').property(+m[1]); return mk ? mk.property(EFM.MASKP[m[2]]) : null; }
    if (key.indexOf('camera:') === 0) return EFM.find(L.property('ADBE Camera Options Group'), EFM.CAMP[key.substr(7)]);
    if (key.indexOf('light:') === 0) return EFM.find(L.property('ADBE Light Options Group'), EFM.LIGHTP[key.substr(6)]);
    return EFM.TPROP[key] ? EFM.tr(L, EFM.TPROP[key]) : null;
  } catch (eT) { return null; }
};
/** a scene path {v, i, o, c} \u2192 an AE Shape */
EFM.mkShape = function (p) { var s = new Shape(); s.vertices = p.v; s.inTangents = p.i; s.outTangents = p.o; s.closed = !!p.c; return s; };
/** value for a property: paths become Shapes, 2D / 3D arrays are padded or trimmed to what it holds */
EFM.fit = function (p, v) {
  if (v && v.v && v.i) return EFM.mkShape(v);
  if (!EFM.isArr(v)) return v;
  var cur = p.value, out = [], i;
  if (!EFM.isArr(cur)) return v[0];
  for (i = 0; i < cur.length; i++) out.push(i < v.length ? v[i] : (i === 2 && cur.length === 3 ? (p.matchName === 'ADBE Scale' ? v[0] : 0) : cur[i]));
  return out;
};
/** write keys [{t, v, bz, hold}] (times relative to the layer's own start) on a property, replacing its old ones */
EFM.writeKeys = function (p, keys, t0) {
  var i, idx;
  if (!p) return 0;
  try { if (p.dimensionsSeparated) p.dimensionsSeparated = false; } catch (e0) {}
  try { if (p.expression) p.expression = ''; } catch (eX) {}
  while (p.numKeys > 0) p.removeKey(1);
  for (i = 0; i < keys.length; i++) { idx = p.addKey(t0 + keys[i].t); p.setValueAtKey(idx, EFM.fit(p, keys[i].v)); }
  for (i = 0; i < keys.length; i++) {
    var k = p.nearestKeyIndex(t0 + keys[i].t);
    try {
      if (keys[i].hold) p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      else if (keys[i].bz && i < keys.length - 1) EFM.easeSegment(p, k, p.nearestKeyIndex(t0 + keys[i + 1].t), keys[i].bz);
    } catch (eE) {}
  }
  return keys.length;
};
/** shape contents: items (rect / ellipse / star / polygon / svg paths), then trim paths, stroke, fill, repeater */
EFM.shapeContents = function (L, S) {
  var g = L.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group'), v = g.property('ADBE Vectors Group'), i, j, it, pv, sub, path;
  g.name = 'EF Shape';
  for (i = 0; i < S.items.length; i++) {
    it = S.items[i]; pv = v;
    if (it.position) { sub = v.addProperty('ADBE Vector Group'); sub.property('ADBE Vector Transform Group').property('ADBE Vector Position').setValue(it.position); pv = sub.property('ADBE Vectors Group'); }
    if (it.kind === 'path') { for (j = 0; j < it.paths.length; j++) pv.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape').setValue(EFM.mkShape(it.paths[j])); }
    else if (it.kind === 'ellipse') { path = pv.addProperty('ADBE Vector Shape - Ellipse'); path.property('ADBE Vector Ellipse Size').setValue(it.size); }
    else if (it.kind === 'star' || it.kind === 'polygon') {
      path = pv.addProperty('ADBE Vector Shape - Star');
      try { path.property('ADBE Vector Star Type').setValue(it.kind === 'star' ? 1 : 2); path.property('ADBE Vector Star Points').setValue(it.points); path.property('ADBE Vector Star Outer Radius').setValue(it.outer); if (it.kind === 'star') path.property('ADBE Vector Star Inner Radius').setValue(it.inner); } catch (eS) {}
    } else { path = pv.addProperty('ADBE Vector Shape - Rect'); path.property('ADBE Vector Rect Size').setValue(it.size); path.property('ADBE Vector Rect Roundness').setValue(it.round || 0); }
  }
  if (S.trim) { try { var tp = v.addProperty('ADBE Vector Filter - Trim'); tp.property('ADBE Vector Trim Start').setValue(S.trim.start); tp.property('ADBE Vector Trim End').setValue(S.trim.end); tp.property('ADBE Vector Trim Offset').setValue(S.trim.offset); if (S.trim.mode) tp.property('ADBE Vector Trim Type').setValue(S.trim.mode); } catch (eTr) { EFM.warn.push('Trim Paths'); } }
  if (S.stroke) {
    var st = v.addProperty('ADBE Vector Graphic - Stroke');
    st.property('ADBE Vector Stroke Color').setValue(S.stroke); st.property('ADBE Vector Stroke Width').setValue(S.strokeWidth);
    if (S.lineCap) { try { st.property('ADBE Vector Stroke Line Cap').setValue(S.lineCap); st.property('ADBE Vector Stroke Line Join').setValue(2); } catch (eC) {} }
    if (S.dash) { try { st.property('ADBE Vector Stroke Dashes').addProperty('ADBE Vector Stroke Dash 1').setValue(S.dash); } catch (eD) {} }
  }
  if (S.fill) { var fl = v.addProperty('ADBE Vector Graphic - Fill'); fl.property('ADBE Vector Fill Color').setValue(S.fill); if (S.fillRule) { try { fl.property('ADBE Vector Fill Rule').setValue(S.fillRule); } catch (eFr) {} } }
  if (S.repeater) {
    try {
      var rp = v.addProperty('ADBE Vector Filter - Repeater'), R = S.repeater, rt = rp.property('ADBE Vector Repeater Transform');
      rp.property('ADBE Vector Repeater Copies').setValue(R.copies); rp.property('ADBE Vector Repeater Offset').setValue(R.offset);
      rt.property('ADBE Vector Repeater Position').setValue(R.position); rt.property('ADBE Vector Repeater Scale').setValue(R.scale); rt.property('ADBE Vector Repeater Rotation').setValue(R.rotation);
      rt.property('ADBE Vector Repeater Opacity 1').setValue(R.startOpacity); rt.property('ADBE Vector Repeater Opacity 2').setValue(R.endOpacity);
    } catch (eRp) { EFM.warn.push('Repeater'); }
  }
};
/** masks [{path, mode, feather, expansion, opacity, inverted}] (replacing the layer's old ones) */
EFM.setMasks = function (L, masks) {
  var mp, i, m, x, MM;
  try { mp = L.property('ADBE Mask Parade'); } catch (e0) { return; }
  if (!mp) return;
  while (mp.numProperties > 0) mp.property(1).remove();
  MM = { add: MaskMode.ADD, subtract: MaskMode.SUBTRACT, intersect: MaskMode.INTERSECT, difference: MaskMode.DIFFERENCE, none: MaskMode.NONE };
  for (i = 0; i < masks.length; i++) {
    x = masks[i];
    try {
      m = mp.addProperty('ADBE Mask Atom'); m.name = 'EF Mask ' + (i + 1);
      m.property('ADBE Mask Shape').setValue(EFM.mkShape(x.path));
      m.maskMode = MM[x.mode] || MaskMode.ADD; m.inverted = !!x.inverted;
      m.property('ADBE Mask Feather').setValue(x.feather); m.property('ADBE Mask Offset').setValue(x.expansion); m.property('ADBE Mask Opacity').setValue(x.opacity);
    } catch (e1) { EFM.warn.push('Mask ' + L.name); }
  }
};
/** track matte: AE 2023+ setTrackMatte (any layer), older AE: the matte goes right above */
EFM.setMatte = function (L, M, type) {
  if (!M || M === L) { EFM.warn.push('Matte ' + L.name); return; }
  var T = { alpha: TrackMatteType.ALPHA, alphaInverted: TrackMatteType.ALPHA_INVERTED, luma: TrackMatteType.LUMA, lumaInverted: TrackMatteType.LUMA_INVERTED }[type] || TrackMatteType.ALPHA;
  if (typeof L.setTrackMatte === 'function') { L.setTrackMatte(M, T); try { M.enabled = false; } catch (e0) {} return; }
  M.moveBefore(L); L.trackMatteType = T;
};
/** one layer of a scene \u2192 a real AE layer (still values, effects, masks, keys, text animators, expressions) */
EFM.makeLayer = function (c, o) {
  var L, i;
  if (o.type === 'text') {
    L = c.layers.addText(o.text);
    var sp = L.property('ADBE Text Properties').property('ADBE Text Document'), d = sp.value;
    d.fontSize = o.size; d.fillColor = [o.color[0], o.color[1], o.color[2]]; d.applyFill = true;
    if (o.font) { try { d.font = o.font; } catch (eF) {} }
    try { d.justification = o.align === 'left' ? ParagraphJustification.LEFT_JUSTIFY : o.align === 'right' ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.CENTER_JUSTIFY; } catch (eJ) {}
    if (o.tracking) d.tracking = o.tracking;
    if (o.leading) { try { d.autoLeading = false; d.leading = o.leading; } catch (eLd) {} }
    if (o.allCaps) { try { d.allCaps = true; } catch (eAc) {} }
    if (o.stroke) { d.applyStroke = true; d.strokeColor = [o.stroke[0], o.stroke[1], o.stroke[2]]; d.strokeWidth = o.strokeWidth; } else d.applyStroke = false;
    sp.setValue(d);
    if (o.counter) {
      var C = o.counter, q = function (s) { return "'" + String(s).replace(/['\\]/g, '') + "'"; };
      sp.expression = 'var t=Math.max(0,time-' + C.start + ');var n=linear(t,0,' + C.duration + ',' + C.from + ',' + C.to + ');' + q(C.prefix) + '+' + (C.decimals ? 'n.toFixed(' + C.decimals + ')' : 'Math.round(n)') + '+' + q(C.suffix);
    }
  } else if (o.type === 'shape') {
    L = c.layers.addShape();
    EFM.shapeContents(L, o.shape);
    EFM.tr(L, 'ADBE Position').setValue([c.width / 2, c.height / 2]);
  } else if (o.type === 'solid' || o.type === 'adjustment') {
    L = c.layers.addSolid([o.color[0], o.color[1], o.color[2]], o.name, c.width, c.height, 1, c.duration);
    if (o.type === 'adjustment') L.adjustmentLayer = true;
  } else if (o.type === 'null') L = c.layers.addNull(c.duration);
  else if (o.type === 'camera') L = c.layers.addCamera(o.name, [c.width / 2, c.height / 2]);
  else if (o.type === 'light') { L = c.layers.addLight(o.name, [c.width / 2, c.height / 2]); try { L.lightType = { spot: LightType.SPOT, point: LightType.POINT, parallel: LightType.PARALLEL, ambient: LightType.AMBIENT }[o.lightType]; } catch (eL) {} }
  else if (o.type === 'precomp') {
    var cs = o.comp, sub = app.project.items.addComp(cs.name, cs.width, cs.height, 1, cs.duration, cs.fps);
    try { sub.parentFolder = EFM.folder('EditFast Scenes'); } catch (eP) {}
    if (cs.renderer === '3d') EFM.renderer3d(sub);
    if (cs.bg) { var sbg = sub.layers.addSolid([cs.bg[0], cs.bg[1], cs.bg[2]], 'Background', sub.width, sub.height, 1, sub.duration); sbg.locked = true; }
    EFM.fillComp(sub, o.layers);
    L = c.layers.add(sub);
    if (o.collapse) { try { L.collapseTransformation = true; } catch (eCo) {} }
  } else if (o.type === 'footage') {
    var f = new File(o.file), it = null;
    if (!f.exists) throw new Error('\u0627\u0644\u0645\u0644\u0641 \u0645\u0634 \u0645\u0648\u062c\u0648\u062f: ' + o.file);
    for (i = 1; i <= app.project.numItems; i++) { var x = app.project.item(i); try { if (x instanceof FootageItem && x.file && x.file.fsName === f.fsName) { it = x; break; } } catch (eI) {} }
    if (!it) it = app.project.importFile(new ImportOptions(f));
    L = c.layers.add(it);
  }
  L.name = o.name;
  if (o.threeD && !(L instanceof CameraLayer) && !(L instanceof LightLayer)) L.threeDLayer = true;
  if (o.blend && o.blend !== 'normal') { try { L.blendingMode = BlendingMode[EFM.BLEND[o.blend]]; } catch (eB) {} }
  if (o.motionBlur) { try { L.motionBlur = true; c.motionBlur = true; } catch (eM) {} }
  // footage / precomps play from srcIn of their source at the layer's start
  try {
    L.startTime = o.type === 'footage' ? o.start - (o.srcIn || 0) : o.type === 'precomp' ? o.start : 0;
    L.inPoint = Math.min(o.start, c.duration - c.frameDuration);
    if (o.end !== null && o.end > o.start) L.outPoint = Math.min(c.duration, o.end);
  } catch (eT) {}
  EFM.applyLook(L, o, c);
  // fill the frame (scale values of the scene are % of "filled")
  if (o.type === 'footage' && o.cover && L.source && L.source.width) {
    var kf = Math.max(c.width / L.source.width, c.height / L.source.height);
    if (Math.abs(kf - 1) > 0.001) EFM.change(EFM.tr(L, 'ADBE Scale'), function (v) { var r = [], q2; for (q2 = 0; q2 < v.length; q2++) r.push(v[q2] * kf); return r; });
  }
  return L;
};
/** effects, masks, still values, keys, text animators and expressions of a scene layer, on an existing layer */
EFM.applyLook = function (L, o, c) {
  var k, i, n = 0, p, used = [];
  for (i = 0; i < (o.effects || []).length; i++) {
    var ef = o.effects[i], fx = L.property('ADBE Effect Parade'), eff = null, j;
    // each listed effect takes its own instance (two glows = two Glow effects); an existing one is updated
    for (j = 1; j <= fx.numProperties && !eff; j++) if (!EFM.has(used, j) && (ef.label ? fx.property(j).name === ef.label : fx.property(j).matchName === ef.match)) { eff = fx.property(j); used.push(j); }
    if (!eff) { try { eff = fx.addProperty(ef.match); if (ef.label) eff.name = ef.label; used.push(fx.numProperties); } catch (e2) { EFM.warn.push('\u0625\u0641\u0643\u062a \u0645\u0634 \u0645\u062a\u0633\u0637\u0628: ' + ef.match); continue; } }
    for (var pm in ef.params) if (ef.params.hasOwnProperty(pm)) {
      var q = EFM.find(eff, pm);
      if (!q) { EFM.warn.push(ef.match + ' \u2190 ' + pm); continue; }
      try { if (q.numKeys) EFM.writeKeys(q, [], 0); q.setValue(EFM.fit(q, ef.params[pm])); } catch (e3) { EFM.warn.push(ef.match + ' \u2190 ' + pm); }
    }
  }
  if (o.masks && o.masks.length) EFM.setMasks(L, o.masks);
  for (k in o.transform || {}) if (o.transform.hasOwnProperty(k)) {
    p = EFM.target(L, k);
    if (!p) { EFM.warn.push(L.name + ': ' + k); continue; }
    try { if (p.numKeys) EFM.writeKeys(p, [], 0); p.setValue(EFM.fit(p, o.transform[k])); } catch (e1) { EFM.warn.push(L.name + ': ' + k); }
  }
  for (k in o.keys || {}) if (o.keys.hasOwnProperty(k)) {
    p = EFM.target(L, k);
    if (!p) { EFM.warn.push(L.name + ': ' + k); continue; }
    try { n += EFM.writeKeys(p, o.keys[k], L.inPoint); } catch (e4) { EFM.warn.push(L.name + ': ' + k); }
  }
  if (o.textAnimators && L instanceof TextLayer) for (i = 0; i < o.textAnimators.length; i++) { try { EFM.textAnimOn(L, o.textAnimators[i], o.textAnimators[i].start); } catch (e5) { EFM.warn.push(L.name + ': text animator'); } }
  for (k in o.expressions || {}) if (o.expressions.hasOwnProperty(k)) { p = EFM.target(L, k); if (p) { try { p.expression = o.expressions[k]; } catch (e6) { EFM.warn.push(L.name + ': expression ' + k); } } }
  return n;
};
/** every layer of a list in a comp (the first ends on top), then parents and track mattes by name */
EFM.fillComp = function (c, layers) {
  var made = [], i, keys = 0;
  for (i = layers.length - 1; i >= 0; i--) { made.push({ layer: EFM.makeLayer(c, layers[i]), spec: layers[i] }); }
  for (i = 0; i < made.length; i++) {
    for (var k in made[i].spec.keys) if (made[i].spec.keys.hasOwnProperty(k)) keys += made[i].spec.keys[k].length;
    if (made[i].spec.parent) { var par = EFM.layerByName(c, made[i].spec.parent); if (par && par !== made[i].layer) { try { if (made[i].layer.setParentWithJump) made[i].layer.setParentWithJump(par); else made[i].layer.parent = par; } catch (e1) {} } else EFM.warn.push('Parent ' + made[i].spec.parent); }
  }
  for (i = 0; i < made.length; i++) if (made[i].spec.matte) { try { EFM.setMatte(made[i].layer, EFM.layerByName(c, made[i].spec.matte.layer), made[i].spec.matte.type); } catch (e2) { EFM.warn.push('Matte ' + made[i].spec.name); } }
  return { layers: made.length, keys: keys };
};
/**
 * Build a scene: a new comp (or the active one) with every layer, then parents and mattes by name.
 * a.spec = { comp: { create, name, width, height, fps, duration, bg }, layers: [...] } (already checked in Node)
 */
EFMAPI.buildScene = function (a) {
  var s = a.spec, cs = s.comp, c;
  EFM.warn = [];
  return EFM.undo('\u0645\u0634\u0647\u062f: ' + cs.name, function () {
    if (cs.create || !(app.project.activeItem instanceof CompItem)) {
      c = app.project.items.addComp(cs.name, cs.width, cs.height, 1, cs.duration, cs.fps);
      try { c.parentFolder = EFM.folder('EditFast Scenes'); } catch (e0) {}
      if (cs.bg) { var bg = c.layers.addSolid([cs.bg[0], cs.bg[1], cs.bg[2]], 'Background', c.width, c.height, 1, c.duration); bg.locked = true; }
    } else c = EFM.comp();
    if (cs.renderer === '3d') EFM.renderer3d(c);
    var r = EFM.fillComp(c, s.layers);
    c.openInViewer();
    return { comp: c.name, compId: c.id, layers: r.layers, keys: r.keys, created: !!cs.create, skipped: EFM.warn.slice(0, 30) };
  });
};
/**
 * Edit the scene by layer names (the chat's "make the title bigger / slower / orange").
 * a.ops = [{ op: 'set'|'add'|'replace'|'delete'|'retime'|'comp', layer, look, spec, factor, duration }]
 */
EFMAPI.editScene = function (a) {
  var c = EFM.comp(), done = 0, missing = [], i;
  EFM.warn = [];
  return EFM.undo('\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0634\u0647\u062f', function () {
    for (i = 0; i < a.ops.length; i++) {
      var op = a.ops[i], L = op.layer ? EFM.layerByName(c, op.layer) : null;
      if (op.op === 'add') { EFM.fillComp(c, [op.spec]); done++; continue; }
      if (op.op === 'comp') { if (op.duration) c.duration = op.duration; done++; continue; }
      if (op.op === 'retime') {
        // slower / faster: every keyframe of the comp moves by the factor (from each layer's start)
        for (var j = 1; j <= c.numLayers; j++) { var ly = c.layer(j); EFM.walk(ly, function (p) { try { if (p.numKeys > 1) EFM.scaleKeys(p, ly.inPoint, op.factor); } catch (e) {} }); }
        done++; continue;
      }
      if (!L) { missing.push(op.layer); continue; }
      if (op.op === 'delete') { L.remove(); done++; continue; }
      if (op.op === 'replace') {
        var idx = L.index; L.remove();
        var below = idx <= c.numLayers ? c.layer(idx) : null;
        EFM.fillComp(c, [op.spec]);
        var nl = EFM.layerByName(c, op.spec.name);
        if (nl && below) nl.moveBefore(below); else if (nl) { try { nl.moveToEnd(); } catch (eE) {} }
        done++; continue;
      }
      var look = op.look || {};
      if (L instanceof TextLayer && (look.text !== undefined || look.color || look.size || look.font)) {
        var sp = L.property('ADBE Text Properties').property('ADBE Text Document'), d = sp.value;
        if (look.text !== undefined) d.text = look.text;
        if (look.color) d.fillColor = [look.color[0], look.color[1], look.color[2]];
        if (look.size) d.fontSize = look.size;
        if (look.font) { try { d.font = look.font; } catch (eF) {} }
        sp.setValue(d);
      } else if (look.color) {
        EFM.walk(L, function (p) { try { if (/^ADBE Vector Fill Color$/.test(p.matchName) && !p.numKeys) p.setValue(look.color); } catch (e2) {} });
      }
      EFM.applyLook(L, look, c);
      if (look.matte) { try { EFM.setMatte(L, EFM.layerByName(c, look.matte.layer), look.matte.type); } catch (eM) {} }
      done++;
    }
    return { done: done, missing: missing, skipped: EFM.warn.slice(0, 30) };
  });
};
/** move every key of a property: t \u2192 t0 + (t - t0) * factor */
EFM.scaleKeys = function (p, t0, factor) {
  var keys = [], i;
  for (i = 1; i <= p.numKeys; i++) keys.push({ t: p.keyTime(i), v: p.keyValue(i), inE: p.keyInTemporalEase(i), outE: p.keyOutTemporalEase(i), inI: p.keyInInterpolationType(i), outI: p.keyOutInterpolationType(i) });
  while (p.numKeys > 0) p.removeKey(1);
  for (i = 0; i < keys.length; i++) { var idx = p.addKey(t0 + (keys[i].t - t0) * factor); p.setValueAtKey(idx, keys[i].v); }
  for (i = 0; i < keys.length; i++) { try { p.setInterpolationTypeAtKey(i + 1, keys[i].inI, keys[i].outI); p.setTemporalEaseAtKey(i + 1, keys[i].inE, keys[i].outE); } catch (e) {} }
};
/** what's in the active comp, short enough for the AI to edit it by names */
EFMAPI.sceneState = function () {
  var c = app.project.activeItem, out = { comp: null, layers: [] }, i;
  if (!c || !(c instanceof CompItem)) return out;
  out.comp = { name: c.name, width: c.width, height: c.height, fps: 1 / c.frameDuration, duration: c.duration, time: c.time };
  for (i = 1; i <= Math.min(c.numLayers, 80); i++) {
    var L = c.layer(i), x = { name: L.name, type: EFM.layerType(L), inPoint: +L.inPoint.toFixed(2), outPoint: +L.outPoint.toFixed(2), parent: L.parent ? L.parent.name : null, threeD: !!L.threeDLayer, animated: [], effects: [] };
    try { x.position = EFM.tr(L, 'ADBE Position').value; x.scale = EFM.tr(L, 'ADBE Scale').value; x.opacity = EFM.tr(L, 'ADBE Opacity').value; } catch (e) {}
    if (L instanceof TextLayer) { try { var td = L.property('ADBE Text Properties').property('ADBE Text Document').value; x.text = String(td.text).substr(0, 80); x.size = td.fontSize; } catch (e1) {} }
    try { var mp = L.property('ADBE Mask Parade'); if (mp && mp.numProperties) x.masks = mp.numProperties; } catch (eM) {}
    try { if (L.source instanceof CompItem) x.precomp = L.source.name; } catch (eP) {}
    EFM.walk(L, function (p) { try { if (p.numKeys && x.animated.length < 12) x.animated.push(p.name + ':' + p.numKeys); } catch (e2) {} });
    try { var fx = L.property('ADBE Effect Parade'); for (var j = 1; j <= fx.numProperties; j++) x.effects.push(fx.property(j).matchName); } catch (e3) {}
    out.layers.push(x);
  }
  return out;
};
/** PNG frames of the active comp at times (for the AI to look at what it built) */
EFMAPI.snapshot = function (a) {
  var c = EFM.comp(), out = [], i, f;
  EFM.needWrite();
  if (!c.saveFrameToPng) throw new Error('\u0627\u0644\u0623\u0641\u062a\u0631 \u062f\u0647 \u0645\u0627\u0628\u064a\u0639\u0631\u0641\u0634 \u064a\u0635\u0648\u0651\u0631 \u0641\u0631\u064a\u0645 (\u0645\u062d\u062a\u0627\u062c 2018 \u0623\u0648 \u0623\u062d\u062f\u062b)');
  for (i = 0; i < a.times.length; i++) {
    f = new File(a.dir + '/snap_' + i + '.png');
    try { c.saveFrameToPng(Math.min(a.times[i], c.duration - c.frameDuration), f); out.push(f.fsName); } catch (e) {}
  }
  return { files: out, comp: c.name };
};
/** effects installed besides AE's own (plugins: Saber, Deep Glow, Particular\u2026) \u2014 the AI may use them by match name */
EFMAPI.effectsList = function () {
  var out = [], i, e;
  try {
    for (i = 0; i < app.effects.length && out.length < 300; i++) {
      e = app.effects[i];
      if (!e || /^(ADBE |CC |APC |ADBE)/.test(e.matchName) || /Obsolete/i.test(e.category)) continue;
      out.push({ name: e.displayName, match: e.matchName, category: e.category });
    }
  } catch (x) {}
  return { effects: out };
};

/* ---------------- read shapes (for morph / reuse) ---------------- */
EFM.xfOf = function (t, names) {
  var o = {};
  try { o.anchor = t.property(names[0]).value; o.position = t.property(names[1]).value; o.scale = t.property(names[2]).value; o.rotation = t.property(names[3]).value; } catch (e) {}
  return o;
};
/** paths of a shape layer's contents at the comp time: path groups as vertices, rect / ellipse / star as their numbers */
EFM.collectPaths = function (group, chain, out, look) {
  var i, p, m, ch;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i); if (!p) continue; m = p.matchName;
    try { if (p.enabled === false) continue; } catch (eE) {}
    if (m === 'ADBE Vector Group') {
      ch = chain.slice(0);
      ch.unshift(EFM.xfOf(p.property('ADBE Vector Transform Group'), ['ADBE Vector Anchor', 'ADBE Vector Position', 'ADBE Vector Scale', 'ADBE Vector Rotation']));
      EFM.collectPaths(p.property('ADBE Vectors Group'), ch, out, look);
    } else if (m === 'ADBE Vector Shape - Group') {
      var s = p.property('ADBE Vector Shape').value;
      out.push({ v: s.vertices, i: s.inTangents, o: s.outTangents, c: s.closed, xf: chain });
    } else if (m === 'ADBE Vector Shape - Rect') out.push({ kind: 'rect', size: p.property('ADBE Vector Rect Size').value, position: p.property('ADBE Vector Rect Position') ? p.property('ADBE Vector Rect Position').value : [0, 0], round: p.property('ADBE Vector Rect Roundness').value, xf: chain });
    else if (m === 'ADBE Vector Shape - Ellipse') out.push({ kind: 'ellipse', size: p.property('ADBE Vector Ellipse Size').value, position: p.property('ADBE Vector Ellipse Position') ? p.property('ADBE Vector Ellipse Position').value : [0, 0], xf: chain });
    else if (m === 'ADBE Vector Shape - Star') {
      var g = function (n) { var q = p.property(n); return q ? q.value : 0; };
      out.push({ kind: 'star', type: g('ADBE Vector Star Type'), points: g('ADBE Vector Star Points'), outer: g('ADBE Vector Star Outer Radius'), inner: g('ADBE Vector Star Inner Radius'), rotation: g('ADBE Vector Star Rotation'), position: p.property('ADBE Vector Star Position') ? p.property('ADBE Vector Star Position').value : [0, 0], xf: chain });
    } else if (m === 'ADBE Vector Graphic - Fill' && !look.fill) look.fill = EFM.toHex(p.property('ADBE Vector Fill Color').value);
    else if (m === 'ADBE Vector Graphic - Stroke' && !look.stroke) { look.stroke = EFM.toHex(p.property('ADBE Vector Stroke Color').value); look.strokeWidth = p.property('ADBE Vector Stroke Width').value; }
  }
};
/** a text layer → its outlines (AE's "Create Shapes from Text"), or null */
EFM.textToShapes = function (c, L) {
  var id = 0, i, before = c.numLayers;
  try { id = app.findMenuCommandId('Create Shapes from Text'); } catch (e0) {}
  if (!id) id = 3781;
  for (i = 1; i <= c.numLayers; i++) c.layer(i).selected = false;
  L.selected = true;
  try { app.executeCommand(id); } catch (e1) { return null; }
  if (c.numLayers === before) return null;
  for (i = 1; i <= c.numLayers; i++) if (c.layer(i) instanceof ShapeLayer && c.layer(i).selected) return c.layer(i);
  var up = c.layer(L.index - 1);
  return up instanceof ShapeLayer ? up : null;
};
/** the selected shape / text layers' paths (+ layer transform and colours), in selection order */
EFMAPI.readShapes = function () {
  var c = EFM.comp(), L = EFM.selected(c), out = [], i;
  var sel = L.slice(0);
  return EFM.undo('قراية الأشكال', function () {
    for (i = 0; i < sel.length; i++) {
      var src = sel[i], tmp = null, S = src, look = {};
      if (src instanceof TextLayer) { tmp = EFM.textToShapes(c, src); S = tmp; try { look.fill = EFM.toHex(src.property('ADBE Text Properties').property('ADBE Text Document').value.fillColor); } catch (eF) {} }
      if (!(S instanceof ShapeLayer)) continue;
      var paths = [];
      EFM.collectPaths(S.property('ADBE Root Vectors Group'), [], paths, look);
      out.push({ name: src.name, layer: EFM.xfOf(S.property('ADBE Transform Group'), ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z']), paths: paths, fill: look.fill, stroke: look.stroke, strokeWidth: look.strokeWidth, text: src instanceof TextLayer });
      if (tmp) { try { tmp.remove(); src.enabled = true; } catch (eR) {} }
    }
    for (i = 0; i < sel.length; i++) { try { sel[i].selected = true; } catch (eS) {} }
    if (!out.length) throw new Error('اختار ليرز أشكال أو كلام الأول');
    return { comp: { width: c.width, height: c.height, duration: c.duration, time: c.time }, layers: out };
  });
};

/* ---------------- tracking ---------------- */
/** the footage to track: the selected video layer (or the first one), its file, timing and 2D transform */
EFMAPI.trackSource = function () {
  var c = EFM.comp(), i, L = null, sel = c.selectedLayers, others = [];
  for (i = 0; i < sel.length; i++) { var s = sel[i]; try { if (!L && s.source && s.source.file && s.source.hasVideo) { L = s; continue; } } catch (e0) {} try { others.push({ name: s.name, anchor: EFM.tr(s, 'ADBE Anchor Point').value, position: EFM.tr(s, 'ADBE Position').value, scale: EFM.tr(s, 'ADBE Scale').value, rotation: EFM.tr(s, 'ADBE Rotate Z').value }); } catch (eO) { others.push({ name: s.name }); } }
  if (!L) for (i = 1; i <= c.numLayers; i++) { try { if (c.layer(i).source && c.layer(i).source.file && c.layer(i).source.hasVideo) { L = c.layer(i); break; } } catch (e1) {} }
  if (!L) throw new Error('اختار لير الفيديو اللي هتتبّعه');
  var t = EFM.tr;
  return { comp: { name: c.name, width: c.width, height: c.height, fps: 1 / c.frameDuration, time: c.time, duration: c.duration },
    layer: { name: L.name, index: L.index, file: L.source.file.fsName, startTime: L.startTime, inPoint: L.inPoint, outPoint: L.outPoint, stretch: L.stretch, srcW: L.source.width, srcH: L.source.height,
      anchor: t(L, 'ADBE Anchor Point').value, position: t(L, 'ADBE Position').value, scale: t(L, 'ADBE Scale').value, rotation: t(L, 'ADBE Rotate Z').value }, others: others };
};
/**
 * Write a track. a = { name, times: [comp t], position: [[x,y]], scale?: [%], rotation?: [deg], corners?: [[4 × [x,y]]],
 *   attach: [layer names] (parented to the track null), pin: layer name (Corner Pin), stabilize: layer name, anchor: [[x,y]] }
 */
EFMAPI.applyTrack = function (a) {
  var c = EFM.comp(), i, k;
  return EFM.undo('تراكينج', function () {
    var lin = function (vals) { var ks = []; for (var j = 0; j < a.times.length; j++) ks.push({ t: a.times[j], v: vals[j], bz: null, hold: false }); return ks; };
    var out = { keys: 0 };
    if (a.position) {
      var N = c.layers.addNull(c.duration); N.name = a.name || 'EF Track';
      try { N.label = 9; } catch (eL) {}
      out.keys += EFM.writeKeys(EFM.tr(N, 'ADBE Position'), lin(a.position), 0);
      if (a.scale) { var sc = []; for (k = 0; k < a.scale.length; k++) sc.push([a.scale[k], a.scale[k]]); out.keys += EFM.writeKeys(EFM.tr(N, 'ADBE Scale'), lin(sc), 0); }
      if (a.rotation) out.keys += EFM.writeKeys(EFM.tr(N, 'ADBE Rotate Z'), lin(a.rotation), 0);
      out.track = N.name;
      // the attached layers follow from where they are now (AE keeps their place when parenting)
      var t0 = c.time; c.time = a.times[0];
      for (i = 0; i < (a.attach || []).length; i++) { var L = EFM.layerByName(c, a.attach[i]); if (L && L !== N) { try { L.parent = N; } catch (eP) {} } }
      c.time = t0;
      out.attached = (a.attach || []).length;
    }
    if (a.corners && a.pin) {
      var T = EFM.layerByName(c, a.pin);
      if (!T) throw new Error('مش لاقي اللير: ' + a.pin);
      var cp = T.property('ADBE Effect Parade').addProperty('ADBE Corner Pin');
      var names = ['ADBE Corner Pin-0001', 'ADBE Corner Pin-0002', 'ADBE Corner Pin-0003', 'ADBE Corner Pin-0004'];
      for (k = 0; k < 4; k++) { var vals = []; for (i = 0; i < a.corners.length; i++) vals.push(a.corners[i][k]); out.keys += EFM.writeKeys(cp.property(names[k]), lin(vals), 0); }
      out.pinned = T.name;
    }
    if (a.stabilize && a.anchor) {
      var S = EFM.layerByName(c, a.stabilize);
      out.keys += EFM.writeKeys(EFM.tr(S, 'ADBE Anchor Point'), lin(a.anchor), 0);
      var pos = EFM.tr(S, 'ADBE Position'); while (pos.numKeys) pos.removeKey(1); pos.setValue([c.width / 2, c.height / 2]);
      if (a.stabScale) { var ss = []; for (k = 0; k < a.stabScale.length; k++) ss.push([a.stabScale[k], a.stabScale[k]]); out.keys += EFM.writeKeys(EFM.tr(S, 'ADBE Scale'), lin(ss), 0); }
      if (a.stabRotation) out.keys += EFM.writeKeys(EFM.tr(S, 'ADBE Rotate Z'), lin(a.stabRotation), 0);
      out.stabilized = S.name;
    }
    return out;
  });
};

/* ---------------- character rig ---------------- */
/** the selected layers (or all) with their bounds and 2D transform, for the auto-rig */
EFMAPI.rigInfo = function () {
  var c = EFM.comp(), L = c.selectedLayers.length ? c.selectedLayers : [], out = [], i;
  if (!L.length) for (i = 1; i <= c.numLayers; i++) L.push(c.layer(i));
  for (i = 0; i < L.length; i++) {
    var x = L[i];
    if (x instanceof CameraLayer || x instanceof LightLayer || x.nullLayer) continue;
    try {
      var r = x.sourceRectAtTime(c.time, false), t = EFM.tr;
      out.push({ name: x.name, inPoint: x.inPoint, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, anchor: t(x, 'ADBE Anchor Point').value, position: t(x, 'ADBE Position').value, scale: t(x, 'ADBE Scale').value, rotation: t(x, 'ADBE Rotate Z').value, parent: x.parent ? x.parent.name : null, threeD: !!x.threeDLayer });
    } catch (e) {}
  }
  return { layers: out, comp: { width: c.width, height: c.height, time: c.time } };
};
/** apply a rig plan: anchors at the joints (layer stays put), parents, the controller with sliders, IK nulls, expressions */
EFMAPI.rigApply = function (a) {
  var c = EFM.comp(), P = a.plan, i, k, n = 0;
  return EFM.undo('ريج كاراكتر', function () {
    for (i = 0; i < P.layers.length; i++) {
      var L = EFM.layerByName(c, P.layers[i].name); if (!L) continue;
      var an = EFM.tr(L, 'ADBE Anchor Point'), po = EFM.tr(L, 'ADBE Position');
      if (!an.numKeys && !po.numKeys) { an.setValue(EFM.fit(an, P.layers[i].anchor)); po.setValue(EFM.fit(po, P.layers[i].position)); }
    }
    for (i = 0; i < P.layers.length; i++) {
      var C1 = EFM.layerByName(c, P.layers[i].name), par = P.layers[i].parent ? EFM.layerByName(c, P.layers[i].parent) : null;
      if (C1 && par && C1 !== par) { try { C1.parent = par; } catch (eP) {} }
    }
    var ctrl = EFM.layerByName(c, P.ctrl.name);
    if (!ctrl) { ctrl = c.layers.addNull(c.duration); ctrl.name = P.ctrl.name; try { ctrl.label = 11; } catch (eL) {} }
    EFM.tr(ctrl, 'ADBE Position').setValue(P.ctrl.position);
    for (k in P.ctrl.sliders) if (P.ctrl.sliders.hasOwnProperty(k)) { var fx = EFM.effect(ctrl, 'ADBE Slider Control', k); fx.property(1).setValue(P.ctrl.sliders[k]); }
    for (i = 0; i < (P.ik || []).length; i++) {
      var ik = EFM.layerByName(c, P.ik[i].name);
      if (!ik) { ik = c.layers.addNull(c.duration); ik.name = P.ik[i].name; try { ik.label = 2; } catch (eI) {} }
      EFM.tr(ik, 'ADBE Position').setValue(P.ik[i].position);
    }
    for (i = 0; i < P.layers.length; i++) {
      var X = EFM.layerByName(c, P.layers[i].name); if (!X) continue;
      for (k in P.layers[i].expressions) if (P.layers[i].expressions.hasOwnProperty(k)) { var p = EFM.target(X, k); if (p) { try { p.expression = P.layers[i].expressions[k]; n++; } catch (eX) { EFM.warn.push(X.name + ': ' + k); } } }
    }
    return { layers: P.layers.length, expressions: n, ik: (P.ik || []).length, ctrl: P.ctrl.name };
  });
};

/* ---------------- workflow tools (Explode Shape Layers, Motion Tools, Ray Dynamic Color-style) ---------------- */
/** every top-level group of the selected shape layers → its own layer (the original is hidden) */
EFMAPI.explodeShapes = function () {
  var c = EFM.comp(), L = EFM.selected(c), made = 0, i, j, k;
  return EFM.undo('فصل الأشكال', function () {
    for (i = 0; i < L.length; i++) {
      if (!(L[i] instanceof ShapeLayer)) continue;
      var root = L[i].property('ADBE Root Vectors Group'), n = root.numProperties;
      if (n < 2) continue;
      for (j = 1; j <= n; j++) {
        var d = L[i].duplicate(), dr = d.property('ADBE Root Vectors Group');
        for (k = dr.numProperties; k >= 1; k--) if (k !== j) dr.property(k).remove();
        d.name = L[i].name + ' • ' + root.property(j).name; d.enabled = true; made++;
      }
      L[i].enabled = false;
    }
    if (!made) throw new Error('اختار لير شيب فيه أكتر من جروب');
    return { layers: made };
  });
};
/** the layer's box in comp space (2D, no parent): from sourceRectAtTime through anchor / scale / position */
EFM.box = function (L, t) {
  var r = L.sourceRectAtTime(t, false), a = EFM.tr(L, 'ADBE Anchor Point').value, s = EFM.tr(L, 'ADBE Scale').value, p = EFM.tr(L, 'ADBE Position').value;
  var x0 = p[0] + (r.left - a[0]) * s[0] / 100, y0 = p[1] + (r.top - a[1]) * s[1] / 100, x1 = x0 + r.width * s[0] / 100, y1 = y0 + r.height * s[1] / 100;
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
};
EFM.moveBy = function (L, dx, dy) { EFM.change(EFM.tr(L, 'ADBE Position'), function (v) { var o = v.slice ? v.slice(0) : [v[0], v[1]]; o[0] += dx; o[1] += dy; return o; }); };
/** align / distribute the selected layers. a = { mode: left|hcenter|right|top|vcenter|bottom|distH|distV, to: comp|selection } */
EFMAPI.alignLayers = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), i, B = [], t = c.time;
  return EFM.undo('محاذاة', function () {
    for (i = 0; i < L.length; i++) { try { B.push({ L: L[i], b: EFM.box(L[i], t) }); } catch (e) {} }
    if (!B.length) throw new Error('اختار ليرز');
    var R = { x0: 0, y0: 0, x1: c.width, y1: c.height };
    if (a.to === 'selection' && B.length > 1) { R = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; for (i = 0; i < B.length; i++) { R.x0 = Math.min(R.x0, B[i].b.x0); R.y0 = Math.min(R.y0, B[i].b.y0); R.x1 = Math.max(R.x1, B[i].b.x1); R.y1 = Math.max(R.y1, B[i].b.y1); } }
    var m = a.mode;
    if (m === 'distH' || m === 'distV') {
      var h = m === 'distH';
      B.sort(function (p, q) { return h ? (p.b.x0 + p.b.x1) - (q.b.x0 + q.b.x1) : (p.b.y0 + p.b.y1) - (q.b.y0 + q.b.y1); });
      var first = h ? (B[0].b.x0 + B[0].b.x1) / 2 : (B[0].b.y0 + B[0].b.y1) / 2, lastB = B[B.length - 1].b, last = h ? (lastB.x0 + lastB.x1) / 2 : (lastB.y0 + lastB.y1) / 2;
      for (i = 1; i < B.length - 1; i++) { var want = first + (last - first) * i / (B.length - 1), cur = h ? (B[i].b.x0 + B[i].b.x1) / 2 : (B[i].b.y0 + B[i].b.y1) / 2; EFM.moveBy(B[i].L, h ? want - cur : 0, h ? 0 : want - cur); }
    } else {
      for (i = 0; i < B.length; i++) {
        var b = B[i].b, dx = 0, dy = 0;
        if (m === 'left') dx = R.x0 - b.x0; if (m === 'right') dx = R.x1 - b.x1; if (m === 'hcenter') dx = (R.x0 + R.x1) / 2 - (b.x0 + b.x1) / 2;
        if (m === 'top') dy = R.y0 - b.y0; if (m === 'bottom') dy = R.y1 - b.y1; if (m === 'vcenter') dy = (R.y0 + R.y1) / 2 - (b.y0 + b.y1) / 2;
        EFM.moveBy(B[i].L, dx, dy);
      }
    }
    return { layers: B.length };
  });
};
/** the selected layers one after another in time (selection order), `gap` frames apart (negative = overlap) */
EFMAPI.sequenceLayers = function (a) {
  var c = EFM.comp(), L = EFM.selected(c), i, t;
  return EFM.undo('ورا بعض', function () {
    if (L.length < 2) throw new Error('اختار ليرين أو أكتر');
    t = L[0].outPoint + (a.gap || 0) * c.frameDuration;
    for (i = 1; i < L.length; i++) { var shift = t - L[i].inPoint; L[i].startTime += shift; t = L[i].outPoint + (a.gap || 0) * c.frameDuration; }
    return { layers: L.length };
  });
};
/** one controller for every colour of the comp: "EF Colors" with a Color Control per colour, every fill / stroke linked */
EFMAPI.colorRig = function () {
  var c = EFM.comp(), map = {}, list = [], i, n = 0;
  return EFM.undo('كنترول الألوان', function () {
    var ctrl = EFM.layerByName(c, 'EF Colors');
    if (!ctrl) { ctrl = c.layers.addNull(c.duration); ctrl.name = 'EF Colors'; ctrl.guideLayer = true; try { ctrl.label = 11; } catch (eL) {} }
    for (i = 1; i <= c.numLayers; i++) {
      var L = c.layer(i); if (L === ctrl) continue;
      EFM.walk(L, function (p) {
        if (!/^(ADBE Vector Fill Color|ADBE Vector Stroke Color|ADBE Fill-0002|ADBE Color Control-0001)$/.test(p.matchName) || p.numKeys || p.expression) return;
        if (p.matchName === 'ADBE Color Control-0001' && L === ctrl) return;
        var k = EFM.colorKey(p.value);
        if (!map[k]) { var fx = EFM.effect(ctrl, 'ADBE Color Control', 'Color ' + (list.length + 1)); fx.property(1).setValue(p.value); map[k] = fx.name; list.push(EFM.toHex(p.value)); }
        p.expression = 'thisComp.layer("EF Colors").effect("' + map[k] + '")(1)'; n++;
      });
    }
    if (!n) throw new Error('مفيش ألوان أشكال أو Fill في الكومب');
    return { colors: list, linked: n };
  });
};

/* ---------------- roto / keying / camera tracking ---------------- */
/** the AI matte (a black / white video) under a copy of the footage as its luma matte → the person cut out on top */
EFMAPI.rotoApply = function (a) {
  var c = EFM.comp(), L = EFM.layerByName(c, a.layer);
  if (!L) throw new Error('مش لاقي اللير: ' + a.layer);
  return EFM.undo('روتو', function () {
    var cut = L.duplicate(); cut.name = L.name + ' (EF Cutout)';
    var item = app.project.importFile(new ImportOptions(new File(a.matte)));
    try { item.parentFolder = EFM.folder('EditFast Roto'); } catch (eF) {}
    var M = c.layers.add(item); M.name = L.name + ' (EF Matte)';
    M.startTime = a.start; M.inPoint = a.start; M.outPoint = Math.min(c.duration, a.start + item.duration);
    var t = EFM.tr, k = L.source.width / item.width;
    t(M, 'ADBE Anchor Point').setValue([t(L, 'ADBE Anchor Point').value[0] / k, t(L, 'ADBE Anchor Point').value[1] / k]);
    t(M, 'ADBE Position').setValue(t(L, 'ADBE Position').value);
    var s = t(L, 'ADBE Scale').value; t(M, 'ADBE Scale').setValue([s[0] * k, s[1] * k]);
    t(M, 'ADBE Rotate Z').setValue(t(L, 'ADBE Rotate Z').value);
    if (L.parent) M.parent = L.parent;
    cut.moveBefore(L); M.moveBefore(cut);
    EFM.setMatte(cut, M, 'luma');
    return { cutout: cut.name, matte: M.name };
  });
};
/** green / blue screen: Keylight on the footage (+ a little choke and spill clean-up) */
EFMAPI.keyApply = function (a) {
  var c = EFM.comp(), L = EFM.layerByName(c, a.layer);
  if (!L) throw new Error('مش لاقي اللير: ' + a.layer);
  return EFM.undo('كيينج', function () {
    var fx = L.property('ADBE Effect Parade'), k = null;
    try { k = fx.addProperty('Keylight 906'); } catch (e) {}
    if (!k) throw new Error('Keylight مش موجود في الأفتر ده');
    var col = a.color === 'blue' ? [0, 0.28, 1, 1] : [0, 0.85, 0.2, 1];
    var p = EFM.find(k, 'Screen Colour'); if (p) p.setValue(col);
    try { var g = EFM.find(k, 'Screen Gain'); if (g) g.setValue(105); } catch (e2) {}
    try { var ch = fx.addProperty('ADBE Simple Choker'); EFM.find(ch, 'Choke Matte').setValue(1); } catch (e3) {}
    return { keyed: L.name };
  });
};
/** AE's own 3D Camera Tracker on the footage (analysis runs in the background) */
EFMAPI.trackCamera = function (a) {
  var c = EFM.comp(), L = EFM.layerByName(c, a.layer), id = 0, i;
  if (!L) throw new Error('اختار لير الفيديو');
  for (i = 1; i <= c.numLayers; i++) c.layer(i).selected = false;
  L.selected = true;
  try { id = app.findMenuCommandId('Track Camera'); } catch (e0) {}
  if (!id) id = 3020;
  app.executeCommand(id);
  return { layer: L.name, command: id };
};

/* ---------------- one comp → every size ---------------- */
/** new comps 16:9 / 9:16 / 1:1 / 4:5 holding the active comp (fill, fit, or fit over a blurred fill), optionally rendered */
EFMAPI.multiFormat = function (a) {
  var src = EFM.comp(), out = [], i;
  if (a.render) EFM.needWrite();
  return EFM.undo('مقاسات', function () {
    for (i = 0; i < a.sizes.length; i++) {
      var z = a.sizes[i], c = app.project.items.addComp(src.name + ' ' + z.label, z.w, z.h, 1, src.duration, 1 / src.frameDuration);
      try { c.parentFolder = EFM.folder('EditFast Formats'); } catch (eF) {}
      var fill = Math.max(z.w / src.width, z.h / src.height) * 100, fit = Math.min(z.w / src.width, z.h / src.height) * 100;
      if (a.fit === 'blur') {
        var B = c.layers.add(src); B.name = 'Background'; EFM.tr(B, 'ADBE Scale').setValue([fill, fill]);
        var bl = B.property('ADBE Effect Parade').addProperty('ADBE Gaussian Blur 2'); bl.property(1).setValue(60);
        try { var ex = B.property('ADBE Effect Parade').addProperty('ADBE Exposure2'); EFM.find(ex, 'Exposure').setValue(-1); } catch (eX) {}
      }
      var L = c.layers.add(src); L.name = src.name;
      var s = a.fit === 'fill' ? fill : fit; EFM.tr(L, 'ADBE Scale').setValue([s, s]);
      var item = { comp: c.name, size: z.label };
      if (a.render) {
        var rq = app.project.renderQueue.items.add(c), om = rq.outputModule(1), names = om.templates || [], j;
        for (j = 0; j < names.length; j++) if (/H\.264/i.test(names[j]) && !/^_HIDDEN/.test(names[j])) { om.applyTemplate(names[j]); break; }
        om.file = new File(a.dir + '/' + src.name.replace(/[\\\/:*?"<>|]/g, '_') + ' ' + z.label.replace(':', 'x') + '.mp4');
        item.path = om.file.fsName;
      }
      out.push(item);
    }
    if (a.render) { if (a.ame) app.project.renderQueue.queueInAME(true); else app.project.renderQueue.render(); }
    return { comps: out };
  });
};

/* ---------------- previews: build a scene off-screen, save frames, throw it away ---------------- */
EFM.removeDeep = function (c) {
  var srcs = [], i;
  for (i = 1; i <= c.numLayers; i++) { try { var s = c.layer(i).source; if (s && (s instanceof CompItem || (s.mainSource && s.mainSource instanceof SolidSource))) srcs.push(s); } catch (e) {} }
  c.remove();
  for (i = 0; i < srcs.length; i++) { try { if (srcs[i] instanceof CompItem) EFM.removeDeep(srcs[i]); else if (!srcs[i].usedIn || !srcs[i].usedIn.length) srcs[i].remove(); } catch (e2) {} }
};
EFMAPI.scenePreview = function (a) {
  EFM.needWrite();
  var s = a.spec, cs = s.comp, keep = app.project.activeItem, out = [], i;
  EFM.warn = [];
  app.beginUndoGroup('EF preview');
  try {
    var c = app.project.items.addComp('EF Preview', cs.width, cs.height, 1, cs.duration, cs.fps);
    if (cs.renderer === '3d') EFM.renderer3d(c);
    if (cs.bg) c.layers.addSolid([cs.bg[0], cs.bg[1], cs.bg[2]], 'Background', c.width, c.height, 1, c.duration);
    EFM.fillComp(c, s.layers);
    for (i = 0; i < a.times.length; i++) { var f = new File(a.dir + '/' + i + '.png'); try { c.saveFrameToPng(Math.min(a.times[i], c.duration - c.frameDuration), f); out.push(f.fsName); } catch (e) {} }
    EFM.removeDeep(c);
  } finally { app.endUndoGroup(); }
  try { if (keep) keep.openInViewer(); } catch (e3) {}
  return { files: out };
};

/* ---------------- real-estate highlight ---------------- */
/**
 * Highlight a building / plot on a footage layer:
 *   [extra: outline, pin, card] → building (copy of the footage, masked or matted, its own tint) → "rest" adjustment
 *   (tint / dim / blur everything else) → the original footage. Every look value is a slider on "<name> Controls".
 * a = { layer, name, look, mode: 'mask'|'matte', mask: { keys: [{t, v}] (footage layer space) }, matte: { file, start }, extra: [scene layers] }
 */
EFMAPI.highlightBuild = function (a) {
  var c = EFM.comp(), F = EFM.layerByName(c, a.layer), N = a.name, k;
  if (!F) throw new Error('مش لاقي اللير: ' + a.layer);
  EFM.warn = [];
  return EFM.undo('إبراز مبنى', function () {
    var lk = a.look, q = function (s) { return 'thisComp.layer("' + N + ' Controls").effect("' + s + '")(1)'; };
    // controls
    var C = c.layers.addNull(c.duration); C.name = N + ' Controls'; try { C.label = 11; } catch (eL) {}
    var setC = function (name, match, v) { var e = EFM.effect(C, match, name); e.property(1).setValue(v); };
    setC('Building Color', 'ADBE Color Control', EFM.fromHex(lk.building.color)); setC('Building Opacity', 'ADBE Slider Control', lk.building.opacity);
    setC('Rest Color', 'ADBE Color Control', EFM.fromHex(lk.rest.color)); setC('Rest Opacity', 'ADBE Slider Control', lk.rest.opacity);
    setC('Rest Dim', 'ADBE Slider Control', lk.rest.dim || 0); setC('Rest Blur', 'ADBE Slider Control', lk.rest.blur || 0);
    setC('Feather', 'ADBE Slider Control', lk.feather === undefined ? 6 : lk.feather);
    setC('Outline Color', 'ADBE Color Control', EFM.fromHex(lk.outline.color)); setC('Outline Width', 'ADBE Slider Control', lk.outline.width); setC('Glow', 'ADBE Slider Control', lk.outline.glow);
    // everything else: tint (keeps the detail), dim, blur — mixed by the sliders
    var R = c.layers.addSolid([1, 1, 1], N + ' Rest', c.width, c.height, 1, c.duration); R.adjustmentLayer = true; R.moveBefore(F);
    try { R.inPoint = F.inPoint; R.outPoint = F.outPoint; } catch (eT) {}
    var fx = R.property('ADBE Effect Parade'), t = fx.addProperty('ADBE Tint');
    t.property('ADBE Tint-0002').expression = q('Rest Color');
    t.property('ADBE Tint-0001').expression = 'var c=' + q('Rest Color') + ';[c[0]*0.12,c[1]*0.12,c[2]*0.16,1]';
    t.property('ADBE Tint-0003').expression = q('Rest Opacity');
    try { var bc = fx.addProperty('ADBE Brightness & Contrast 2'); EFM.find(bc, 'Brightness').expression = '-' + q('Rest Dim'); } catch (eB) { EFM.warn.push('Brightness & Contrast'); }
    var bl = fx.addProperty('ADBE Gaussian Blur 2'); bl.property(1).expression = q('Rest Blur') + '*3';
    try { EFM.find(bl, 'Repeat Edge Pixels').setValue(1); } catch (eR) {}
    // the building: a copy of the footage, cut to the outline (mask) or the AI matte, with its own tint
    var B = F.duplicate(); B.name = N + ' Building'; B.moveBefore(R);
    var bt = B.property('ADBE Effect Parade').addProperty('ADBE Tint');
    bt.property('ADBE Tint-0002').expression = q('Building Color');
    bt.property('ADBE Tint-0001').expression = 'var c=' + q('Building Color') + ';[c[0]*0.18,c[1]*0.18,c[2]*0.18,1]';
    bt.property('ADBE Tint-0003').expression = q('Building Opacity');
    if (a.mode === 'mask') {
      var m = B.property('ADBE Mask Parade').addProperty('ADBE Mask Atom'); m.name = 'EF Building';
      EFM.writeKeys(m.property('ADBE Mask Shape'), a.mask.keys, B.inPoint);
      m.property('ADBE Mask Feather').expression = 'var f=' + q('Feather') + ';[f,f]';
    } else {
      var item = app.project.importFile(new ImportOptions(new File(a.matte.file)));
      try { item.parentFolder = EFM.folder('EditFast Roto'); } catch (eF) {}
      var M = c.layers.add(item); M.name = N + ' Matte';
      M.startTime = a.matte.start; M.inPoint = a.matte.start; M.outPoint = Math.min(c.duration, a.matte.start + item.duration);
      var tr = EFM.tr, kk = F.source.width / item.width, an = tr(F, 'ADBE Anchor Point').value, sc = tr(F, 'ADBE Scale').value;
      tr(M, 'ADBE Anchor Point').setValue([an[0] / kk, an[1] / kk]); tr(M, 'ADBE Position').setValue(tr(F, 'ADBE Position').value);
      tr(M, 'ADBE Scale').setValue([sc[0] * kk, sc[1] * kk]); tr(M, 'ADBE Rotate Z').setValue(tr(F, 'ADBE Rotate Z').value);
      if (F.parent) M.parent = F.parent;
      M.property('ADBE Effect Parade').addProperty('ADBE Gaussian Blur 2').property(1).expression = q('Feather') + '/2';
      M.moveBefore(B);
      EFM.setMatte(B, M, 'luma');
    }
    // outline, pin, info card (plain scene layers on top)
    var made = a.extra && a.extra.length ? EFM.fillComp(c, a.extra) : { layers: 0 };
    return { name: N, building: B.name, rest: R.name, controls: C.name, extra: made.layers, skipped: EFM.warn.slice(0, 20) };
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

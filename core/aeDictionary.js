'use strict';
// قاموس الإفكتات: الأفتر بتاع المستخدم بيقول كل إفكت باراميتراته اسمها إيه بالظبط (matchName + الاسم)، وده
// بيتقارن بتعريفاتنا. باراميتر بنكتبه برقم (ADBE Glo2-0003) لو طلع اسمه مش اللي متوقعينه يبقى بنظبط حاجة غلط من غير
// ما حد يعرف — والقاموس ده بيمسك ده من الأفتر الحقيقي نفسه.
const aeScene = require('./aeScene');

// the words the real (English) parameter name should contain, when ours is addressed by an index-style matchName
const EXPECT = {
  'blur.amount': /blurr/i,
  'glow.threshold': /threshold/i, 'glow.radius': /radius/i, 'glow.intensity': /intensity/i,
  'shadow.color': /colou?r/i, 'shadow.opacity': /opacity/i, 'shadow.direction': /direction/i, 'shadow.distance': /distance/i, 'shadow.softness': /softness/i,
  'fill.color': /colou?r/i,
  'gradient.start': /start of/i, 'gradient.startColor': /start colou?r/i, 'gradient.end': /end of/i, 'gradient.endColor': /end colou?r/i, 'gradient.shape': /shape/i,
  'tint.black': /black/i, 'tint.white': /white/i, 'tint.amount': /amount/i,
  'directionalBlur.direction': /direction/i, 'directionalBlur.length': /length/i,
  'displace.amount': /amount/i, 'displace.size': /size/i,
  'noise.amount': /amount/i,
  'slider.value': /slider/i, 'checkbox.value': /checkbox/i, 'angle.value': /angle/i, 'colorControl.color': /colou?r/i, 'pointControl.point': /point/i,
  'cornerPin.topLeft': /upper left|top left/i, 'cornerPin.topRight': /upper right|top right/i, 'cornerPin.bottomLeft': /lower left|bottom left/i, 'cornerPin.bottomRight': /lower right|bottom right/i
};
// effects the tools add directly (not through the scene language), with the params they set by name
const EXTRA = {
  'ADBE Geometry2': ['Position', 'Scale', 'Rotation', 'Opacity', 'Shutter Angle', 'Use Composition’s Shutter Angle'],
  'ADBE Shift Channels': ['Take Green From', 'Take Blue From'],
  'ADBE Simple Choker': ['Choke Matte'],
  'ADBE Offset': ['Shift Center To'],
  'ADBE Exposure2': ['Exposure'],
  'ADBE Brightness & Contrast 2': ['Brightness'],
  'Keylight 906': ['Screen Colour', 'Screen Gain']
};
const ALIAS = { scale: 'scale height' };
const norm = s => String(s).toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
const isMatch = s => /^(ADBE |CC |VIDEOCOPILOT )/.test(s) && /-\d{4}$/.test(s);

/** every effect matchName the tools use */
function matches() {
  return [...new Set(Object.values(aeScene.EFFECTS).map(e => e.match).concat(Object.keys(EXTRA)))];
}
/** find a param the way the host does: by matchName, else by display name (apostrophes / spaces / the Scale alias) */
function resolve(info, spec) {
  if (!info || !info.params) return null;
  const byMn = info.params.find(p => p.matchName === spec);
  if (byMn) return byMn;
  const n = norm(spec);
  return info.params.find(p => norm(p.name) === n) || (ALIAS[n] && info.params.find(p => norm(p.name) === ALIAS[n])) || null;
}
/**
 * dict (from the host's effectDictionary) → { ok, missing:[effect], bad:[{effect, param, spec, why}], warn:[…], checked }
 * missing = the effect isn't in this AE (a plugin not installed) · bad = a param we set doesn't exist ·
 * warn = it exists but is called something unexpected (we may be setting the wrong one)
 */
function audit(dict) {
  const out = { missing: [], bad: [], warn: [], checked: 0 };
  for (const [key, def] of Object.entries(aeScene.EFFECTS)) {
    const info = dict[def.match];
    if (!info || info.missing) { out.missing.push(key + ' (' + def.match + ')'); continue; }
    for (const [pk, spec] of Object.entries(def.params || {})) {
      out.checked++;
      const p = resolve(info, spec);
      if (!p) { out.bad.push({ effect: key, param: pk, spec, why: 'مش موجود — الموجود: ' + info.params.map(x => x.name).join('، ') }); continue; }
      const re = EXPECT[key + '.' + pk];
      if (isMatch(spec) && re && !re.test(p.name)) out.warn.push({ effect: key, param: pk, spec, why: 'اسمه "' + p.name + '"' });
    }
  }
  for (const [mn, names] of Object.entries(EXTRA)) {
    const info = dict[mn];
    if (!info || info.missing) { out.missing.push(mn); continue; }
    for (const n of names) { out.checked++; if (!resolve(info, n)) out.bad.push({ effect: mn, param: n, spec: n, why: 'مش موجود — الموجود: ' + info.params.map(x => x.name).join('، ') }); }
  }
  out.ok = !out.bad.length;
  return out;
}

module.exports = { matches, audit, resolve, EXPECT, EXTRA };

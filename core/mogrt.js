'use strict';
// القوالب المشتركة بين أفتر وبريمير: فهرس القوالب اللي اتعملت في أفتر، فولدر بريمير بتاع الـ MOGRT، وقراية الخانات
// اللي تتعدّل جوه كل قالب (كلام، ألوان، سلايدرز…) من definition.json.
const fs = require('fs');
const path = require('path');
const os = require('os');
const zip = require('./zip');

/** Premiere's own "Local Templates Folder" (Essential Graphics shows everything in it) — EditFast's sub-folder */
function premiereTemplatesDir({ platform = process.platform, env = process.env, home = os.homedir(), override } = {}) {
  if (override) return override;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Adobe', 'Common', 'Motion Graphics Templates', 'EditFast');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Adobe', 'Common', 'Motion Graphics Templates', 'EditFast');
  return path.join(home, '.editfast', 'Motion Graphics Templates', 'EditFast');
}

function indexFile(dataDir) { return path.join(dataDir, 'templates.json'); }
function load(dataDir) { try { return JSON.parse(fs.readFileSync(indexFile(dataDir), 'utf8')); } catch (_) { return []; } }
function save(dataDir, list) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(indexFile(dataDir), JSON.stringify(list, null, 1)); return list; }
function upsert(dataDir, item) {
  const list = load(dataDir).filter(x => x.id !== item.id);
  list.unshift(item);
  return save(dataDir, list);
}
function safeName(n) { return String(n || 'Template').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'Template'; }

const TYPES = { 1: 'checkbox', 2: 'slider', 3: 'angle', 4: 'color', 5: 'point', 6: 'text', 7: 'dropdown', 8: 'comment', 10: 'group' };
const str = v => (v && v.strDB && v.strDB[0] && v.strDB[0].str) || '';

/**
 * The editable fields of a .mogrt (what Premiere shows in Essential Graphics):
 * [{ id, name, type: text|color|slider|checkbox|point|angle|dropdown, value, min, max }]
 */
function readDefinition(file) {
  const entries = zip.read(fs.readFileSync(file), n => /(^|\/)definition\.json$/i.test(n) || /(^|\/)thumb\.(png|jpe?g)$/i.test(n));
  const def = entries.find(e => /definition\.json$/i.test(e.name));
  if (!def) throw new Error('الملف ده مش MOGRT سليم (مفيهوش definition.json)');
  const d = JSON.parse(def.data.toString('utf8').replace(/^﻿/, ''));
  const controls = [];
  for (const c of d.clientControls || []) {
    const type = TYPES[c.type] || 'other';
    if (type === 'group' || type === 'comment' || type === 'other') continue;
    let value = c.value;
    if (type === 'text') value = str(c.value);
    if (type === 'color' && Array.isArray(value)) value = '#' + value.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, +x)) * 255).toString(16).padStart(2, '0')).join('');
    if (type === 'point' && value && typeof value === 'object') value = [+value.x || 0, +value.y || 0];
    controls.push({ id: c.id, name: str(c.uiName) || type, type, value, min: c.min, max: c.max, ...(type === 'dropdown' && c.items ? { items: (c.items || []).map(str) } : {}) });
  }
  const thumb = entries.find(e => /thumb\.(png|jpe?g)$/i.test(e.name));
  return { name: d.capsuleName || str(d.capsuleNameLocalized) || path.basename(file, '.mogrt'), app: d.authorApp || '', controls, thumb: thumb ? thumb.data : null };
}

/** thumbnail of a .mogrt written next to the cache (null when it has none) */
function extractThumb(file, outDir) {
  try {
    const d = readDefinition(file);
    if (!d.thumb) return null;
    fs.mkdirSync(outDir, { recursive: true });
    const st = fs.statSync(file);
    const out = path.join(outDir, require('crypto').createHash('md5').update(file + '|' + st.mtimeMs).digest('hex').slice(0, 14) + '.png');
    if (!fs.existsSync(out)) fs.writeFileSync(out, d.thumb);
    return out;
  } catch (_) { return null; }
}

/** what the "editable" choices mean, in the panel's words */
const EDITABLE = [
  { id: 'text', label: 'الكلام', hint: 'كل لير كلام يبقى خانة تكتب فيها' },
  { id: 'colors', label: 'الألوان', hint: 'كل لون مستخدم يبقى خانة لون (اللي بنفس اللون بيتغيروا مع بعض)' },
  { id: 'motion', label: 'الحركة', hint: 'سلايدر "سرعة الحركة" و"قوة الحركة" بيتحكموا في كل الأنيميشن' },
  { id: 'transform', label: 'المكان والحجم', hint: 'المكان والحجم والشفافية للقالب كله' },
  { id: 'controls', label: 'الكنترولز بتاعتي', hint: 'السلايدرز والألوان (Expression Controls) اللي انت عاملها بنفسك' },
  { id: 'media', label: 'الصور والفيديو', hint: 'تبدّل الصورة/الفيديو اللي جوه القالب من بريمير (تجريبي)' }
];
const PRESETS = [
  { id: 'motion', label: 'حركة بس', editable: { motion: true } },
  { id: 'colorMotion', label: 'لون وحركة', editable: { colors: true, motion: true } },
  { id: 'title', label: 'كلام ولون', editable: { text: true, colors: true } },
  { id: 'all', label: 'كله', editable: { text: true, colors: true, motion: true, transform: true, controls: true } }
];

module.exports = { premiereTemplatesDir, load, save, upsert, safeName, readDefinition, extractThumb, EDITABLE, PRESETS, TYPES };

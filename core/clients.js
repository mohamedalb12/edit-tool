'use strict';
// العملاء: لكل عميل ملف (ستايل الكابشن، المونتاج، الألوان، الخط، اللوجو، ملاحظات)، وذاكرة بيكتب فيها Claude اللي
// اتعلمه عن ذوقه، ومحادثة لكل برنامج (بريمير / أفتر) بتكمّل من مكان ما وقفت. كله على الجهاز في ~/.editfast/clients.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const dir = () => { const d = path.join(config.dataDir(), 'clients'); fs.mkdirSync(d, { recursive: true }); return d; };
const fileOf = id => path.join(dir(), String(id).replace(/[^\w-]/g, '_') + '.json');
const now = () => new Date().toISOString();
const STYLE_FIELDS = {
  captions: 'ستايل الكابشن (مثلًا hormozi-pop أصفر، أو كلمة كلمة، مكانها تحت)',
  pace: 'إيقاع المونتاج (هادي / متوسط / سريع جدًا)',
  music: 'المزيكا (نوعها، مستواها تحت الكلام)',
  colors: 'ألوان البراند (#hex)',
  fonts: 'الخطوط',
  motion: 'الحركة والترانزيشنز (بسيطة / كتير، زووم، هوك في الأول…)',
  format: 'المقاس والمنصة (ريلز 9:16، يوتيوب 16:9…)',
  sfx: 'المؤثرات الصوتية (قليلة / كتير)'
};

function blank(name) {
  return { id: crypto.randomBytes(6).toString('hex'), name: String(name || 'عميل جديد').slice(0, 60), notes: '', logo: '', style: {}, memory: [], sessions: {}, created: now(), updated: now() };
}
function list() {
  const out = [];
  for (const f of fs.readdirSync(dir())) { if (!f.endsWith('.json')) continue; try { const c = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')); out.push({ id: c.id, name: c.name, updated: c.updated, memory: (c.memory || []).length }); } catch (_) {} }
  return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
function get(id) { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch (_) { return null; } }
function save(c) { c.updated = now(); fs.writeFileSync(fileOf(c.id), JSON.stringify(c, null, 1)); return c; }
function create(name, patch = {}) { return save(Object.assign(blank(name), clean(patch))); }
function update(id, patch) { const c = get(id); if (!c) throw new Error('العميل مش موجود'); return save(Object.assign(c, clean(patch), { style: Object.assign({}, c.style, clean(patch).style || {}) })); }
function remove(id) { try { fs.unlinkSync(fileOf(id)); return true; } catch (_) { return false; } }
function clean(p) {
  const o = {};
  if (p.name !== undefined) o.name = String(p.name).slice(0, 60);
  if (p.notes !== undefined) o.notes = String(p.notes).slice(0, 4000);
  if (p.logo !== undefined) o.logo = String(p.logo).slice(0, 500);
  if (p.style) { o.style = {}; for (const k of Object.keys(p.style)) if (STYLE_FIELDS[k] && p.style[k] !== undefined) o.style[k] = String(p.style[k]).slice(0, 400); }
  return o;
}
/** Claude learned something about this client ("الكابشن بيحبه أصفر مش أبيض") */
function remember(id, note) {
  const c = get(id); if (!c) throw new Error('العميل مش موجود');
  const t = String(note || '').trim().slice(0, 500); if (!t) return c;
  if (!c.memory.some(m => m.text === t)) c.memory.push({ at: now(), text: t });
  if (c.memory.length > 80) c.memory = c.memory.slice(-80);
  return save(c);
}
function forget(id, index) { const c = get(id); if (!c) return null; c.memory.splice(index, 1); return save(c); }
/** the client as Claude reads it */
function profileText(c) {
  if (!c) return '';
  const lines = ['العميل: ' + c.name];
  for (const k of Object.keys(STYLE_FIELDS)) if (c.style && c.style[k]) lines.push('- ' + STYLE_FIELDS[k].split(' (')[0] + ': ' + c.style[k]);
  if (c.logo) lines.push('- اللوجو: ' + c.logo);
  if (c.notes) lines.push('- ملاحظات: ' + c.notes);
  if (c.memory && c.memory.length) { lines.push('- اللي اتعلمناه عن ذوقه من الشغل اللي فات:'); for (const m of c.memory.slice(-40)) lines.push('  • ' + m.text); }
  return lines.join('\n');
}
const hashOf = c => crypto.createHash('sha1').update(profileText(c)).digest('hex').slice(0, 12);
/** this client's conversation in one app: { session, messages: [{role, text, label, status}], seen } */
function session(id, app) { const c = get(id); return (c && c.sessions && c.sessions[app]) || { session: null, messages: [], seen: null }; }
function saveSession(id, app, s) {
  const c = get(id); if (!c) return null;
  c.sessions = c.sessions || {};
  c.sessions[app] = { session: s.session || null, messages: (s.messages || []).slice(-200), seen: s.seen || null };
  return save(c);
}

module.exports = { STYLE_FIELDS, list, get, create, update, remove, remember, forget, profileText, hashOf, session, saveSession, dir };

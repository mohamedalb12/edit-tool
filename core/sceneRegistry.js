'use strict';
// سجل المشاهد: كل مشهد نزل على التايملين بيتحفظ بمواصفاته، فتقدر ترجعله وتعدّله وتعيد رندره في نفس المكان.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const MAX = 400;
function file() { return path.join(config.dataDir(), 'scenes.json'); }
function load() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (_) { return []; } }
function save(list) { fs.writeFileSync(file(), JSON.stringify(list.slice(-MAX))); }

function register(entry) {
  const list = load().filter(e => e.id !== entry.id);
  list.push({ ...entry, at: Date.now() });
  save(list);
  return entry;
}
function get(id) { return load().find(e => e.id === id) || null; }
/** the scene behind a timeline clip: nested sequence "EF Scene <id>" or a rendered file pro-<hash>.mov/mp4 */
function forClip(clip) {
  if (!clip) return null;
  const m = /EF Scene ([0-9a-f]{8})/.exec(clip.name || '');
  if (m) return get(m[1]);
  const p = String(clip.mediaPath || '').replace(/\\/g, '/');
  return load().slice().reverse().find(e => e.file && e.file.replace(/\\/g, '/') === p) || null;
}

module.exports = { register, get, forClip, load };

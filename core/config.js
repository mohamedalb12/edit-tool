'use strict';
// الإعدادات: بتتحفظ على الجهاز في ~/.editfast/settings.json (المفاتيح مبتطلعش برّه الجهاز غير للخدمة بتاعتها).
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULTS = {
  keys: { openrouter: '', elevenlabs: '', pexels: '', pixabay: '', google: '', googleCx: '', fal: '', groq: '' },
  paths: { ffmpeg: '', ffprobe: '', whisper: '', whisperModel: '', baseMogrt: '', node: '', npm: '', chrome: '', ytdlp: '' },
  models: {}, // featureId -> OpenRouter model id (override)
  defaultModel: '',
  agentLevel: 'strong',
  dialect: 'egyptian',
  transcribeEngine: 'auto', // auto (Groq when there's a key) | groq | local
  groqModel: 'whisper-large-v3',
  style: null, // ذوقك — بيتملى مرة واحدة
  quickCut: { sensitivity: 5, padding: 0.08, minSilence: 0.35, crossfadeFrames: 2, onCopy: true },
  captions: { maxWords: 4, maxDuration: 2.5, singleWord: false, snap: true },
  libraryDirs: [],
  libraryFiles: [],
  favorites: {},
  layeredScenes: false, // Pro scenes land as one clip; on = a nested sequence with one track per layer (slower)
  autoUpdate: true,
  ytdlpCookies: '', // browser to borrow cookies from when YouTube asks to sign in ('' = none)
  fillerExtra: [],
  bleepWords: [], // optional filler words the editor wants cut too (يعني، بص…)
  speechTrack: null, // audio track index the speech is on (null = first track with clips)
  spendAlert: 0, // $ في اليوم: تنبيه لو الصرف على الذكاء الاصطناعي عدّاه (0 = من غير)
  updateUrl: ''
};

function dataDir() {
  const dir = process.env.EDITFAST_HOME || path.join(os.homedir(), '.editfast');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheDir(sub = '') {
  const dir = path.join(dataDir(), 'cache', sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function settingsPath() { return path.join(dataDir(), 'settings.json'); }

function load() {
  try { return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))); }
  catch (_) { return deepMerge(DEFAULTS, {}); }
}

function save(settings) {
  const merged = deepMerge(DEFAULTS, settings);
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function update(patch) { return save(deepMerge(load(), patch)); }

module.exports = { DEFAULTS, load, save, update, dataDir, cacheDir, deepMerge };

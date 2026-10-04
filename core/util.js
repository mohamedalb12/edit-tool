'use strict';
// أدوات عامة مشتركة بين كل الموديولات.
const TICKS_PER_SECOND = 254016000000;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function round(v, d = 3) { const p = Math.pow(10, d); return Math.round(v * p) / p; }
function secondsToTicks(s) { return String(Math.round(s * TICKS_PER_SECOND)); }

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/** 3723.5 -> "01:02:03,500" */
function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** YouTube chapter style: 65 -> "01:05", 3725 -> "1:02:05" */
function ytTime(sec) {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "00:00:01,250" / "00:00:01.250" -> 1.25 */
function parseClock(str) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(str || '');
  if (!m) return NaN;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / Math.pow(10, m[4].length);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function slug(str, max = 40) {
  return String(str).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'item';
}

const ARABIC_RE = /[\u0600-\u06FF]/;
function hasArabic(s) { return ARABIC_RE.test(s || ''); }

/** Extract the first JSON object/array found in model text output. */
function extractJson(text) {
  if (text == null) throw new Error('رد فاضي من الموديل');
  if (typeof text !== 'string') return text;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  try { return JSON.parse(body.trim()); } catch (_) { /* fall through */ }
  const starts = [body.indexOf('{'), body.indexOf('[')].filter(i => i >= 0);
  if (!starts.length) throw new Error('الموديل مرجعش JSON');
  const start = Math.min(...starts);
  const open = body[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error('JSON ناقص في رد الموديل');
}

module.exports = { TICKS_PER_SECOND, clamp, round, secondsToTicks, srtTime, ytTime, parseClock, hash, slug, hasArabic, extractJson, pad };

'use strict';
// how much voice is under a time span: 50 ms RMS windows over the file's own noise floor (15th percentile) + 12 dB
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { rmsEnvelope, toDb, percentile } = require(path.join(ROOT, 'core', 'audio'));
const { decodePCM, findBinary } = require(path.join(ROOT, 'core', 'ffmpeg'));
const FF = findBinary('ffmpeg'), WIN = 0.05, cache = new Map();
async function envelope(file) {
  if (!cache.has(file)) { const pcm = await decodePCM(FF, file, { rate: 8000 }); const db = Array.from(rmsEnvelope(pcm, 8000, WIN)).map(toDb); cache.set(file, { db, floor: percentile(db, 0.15) }); }
  return cache.get(file);
}
async function voicedFraction(file, a, b, above = 12) {
  const { db, floor } = await envelope(file);
  const i0 = Math.max(0, Math.floor(a / WIN)), i1 = Math.min(db.length, Math.ceil(b / WIN));
  if (i1 <= i0) return 0;
  let n = 0; for (let i = i0; i < i1; i++) if (db[i] > floor + above) n++;
  return n / (i1 - i0);
}
module.exports = { envelope, voicedFraction, WIN };

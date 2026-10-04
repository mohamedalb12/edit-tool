'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// every test process gets a fresh folder (test files run in parallel)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'editfast-test-'));
process.env.EDITFAST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'editfast-home-'));

const FFMPEG = require('../core/ffmpeg').findBinary('ffmpeg');
const FFPROBE = require('../core/ffmpeg').findBinary('ffprobe');

/** Build an audio file from segments: [{tone: hz, dur}] or [{silence: dur}] */
function makeAudio(name, segments, { rate = 16000 } = {}) {
  const out = path.join(TMP, name);
  const inputs = [], filters = [];
  segments.forEach((s, i) => {
    if (s.silence) inputs.push('-f', 'lavfi', '-t', String(s.silence), '-i', `anullsrc=r=${rate}:cl=mono`);
    else inputs.push('-f', 'lavfi', '-t', String(s.dur), '-i', `aevalsrc=${s.amp || 0.5}*sin(2*PI*${s.tone}*t):s=${rate}:c=mono`);
    filters.push(`[${i}:a]`);
  });
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${filters.join('')}concat=n=${segments.length}:v=0:a=1[a]`, '-map', '[a]', '-ac', '1', out]);
  return out;
}

/** Click track at bpm for seconds */
function makeClicks(name, bpm, seconds, rate = 22050) {
  const n = Math.round(seconds * rate), buf = Buffer.alloc(n * 2);
  const period = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / rate, ph = t % period;
    let v = ph < 0.03 ? Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-ph * 120) * 0.9 : 0;
    v += (Math.random() * 2 - 1) * 0.005;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const raw = path.join(TMP, name + '.raw'); fs.writeFileSync(raw, buf);
  const out = path.join(TMP, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, out]);
  return out;
}

function mockResponse(body, { status = 200, binary = false, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: k => headers[k.toLowerCase()] || null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => typeof body === 'string' ? JSON.parse(body) : body,
    arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }
  };
}

module.exports = { TMP, FFMPEG, FFPROBE, makeAudio, makeClicks, mockResponse };

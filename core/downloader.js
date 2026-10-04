'use strict';
// تحميل ملفات كبيرة (زي موديل Whisper) مع نسبة التقدم.
const fs = require('fs');
const path = require('path');

const WHISPER_MODELS = [
  { id: 'base', label: 'Base (~150MB) — سريع', size: 148 },
  { id: 'small', label: 'Small (~490MB) — كويس', size: 488 },
  { id: 'medium', label: 'Medium (~1.5GB) — دقيق', size: 1530 },
  { id: 'large-v3-turbo', label: 'Large v3 Turbo (~1.6GB) — الأدق للعربي', size: 1620 }
];

function whisperUrl(id) { return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`; }

async function download(url, dest, { fetchImpl, onProgress } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const f = fetchImpl || require('./http').nodeFetch;
  const res = await f(url, { toFile: dest, onProgress, timeout: 600000 });
  if (!res.ok) throw new Error(`تحميل فشل ${res.status}`);
  if (!fs.existsSync(dest)) throw new Error('الملف ماتحمّلش');
  return { file: dest, bytes: fs.statSync(dest).size };
}

module.exports = { WHISPER_MODELS, whisperUrl, download };

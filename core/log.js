'use strict';
// سجل الأخطاء: كل فشل بيتكتب في ملف باليوم، وزرار "انسخ تقرير المشكلة" بياخد منه آخر سطور.
const fs = require('fs');
const path = require('path');

function dir(dataDir) { const d = path.join(dataDir, 'logs'); fs.mkdirSync(d, { recursive: true }); return d; }
function day(d = new Date()) { return d.toISOString().slice(0, 10); }
/** API keys never land in the log */
function redact(s) { return String(s).replace(/sk-or-[\w-]{6,}/g, 'sk-or-…').replace(/\bsk_[\w-]{6,}/g, 'sk_…').replace(/(key|token|authorization)(["':=\s]+)[\w.-]{12,}/gi, '$1$2…'); }

function append(dataDir, entry) {
  const e = { at: new Date().toISOString(), ...entry };
  const line = redact(JSON.stringify(e)) + '\n';
  try {
    const f = path.join(dir(dataDir), `editfast-${day()}.log`);
    fs.appendFileSync(f, line);
    // keep two weeks
    const old = fs.readdirSync(dir(dataDir)).filter(n => /^editfast-\d{4}-\d\d-\d\d\.log$/.test(n)).sort();
    while (old.length > 14) fs.unlinkSync(path.join(dir(dataDir), old.shift()));
  } catch (_) {}
  return e;
}

/** last n entries across the newest log files */
function tail(dataDir, n = 50) {
  try {
    const files = fs.readdirSync(dir(dataDir)).filter(x => /^editfast-.*\.log$/.test(x)).sort().reverse();
    const out = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir(dataDir), f), 'utf8').split('\n').filter(Boolean).reverse();
      for (const l of lines) { try { out.push(JSON.parse(l)); } catch (_) {} if (out.length >= n) break; }
      if (out.length >= n) break;
    }
    return out.reverse();
  } catch (_) { return []; }
}

module.exports = { append, tail, redact };

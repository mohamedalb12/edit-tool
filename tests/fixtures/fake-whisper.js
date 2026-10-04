#!/usr/bin/env node
// Fake whisper.cpp CLI for tests: writes <of>.json in the same format as `whisper-cli -oj -ml 1 -sow`.
const fs = require('fs');
const a = process.argv.slice(2);
const get = k => a[a.indexOf(k) + 1];
if (!fs.existsSync(get('-f'))) { console.error('no wav'); process.exit(2); }
const words = (process.env.FAKE_WHISPER_WORDS || 'انا قلت انشاء الله هنبدأ').split(' ');
const transcription = words.map((w, i) => ({
  timestamps: { from: '00:00:00,000', to: '00:00:00,000' },
  offsets: { from: i * 400, to: i * 400 + 300 }, text: ' ' + w
}));
transcription.splice(1, 0, { offsets: { from: 300, to: 400 }, text: ' [_TT_150]' });
process.stderr.write('whisper_print_progress_callback: progress = 50%\n');
fs.writeFileSync(get('-of') + '.json', JSON.stringify({ result: { language: get('-l') }, params: { prompt: get('--prompt') }, transcription }));

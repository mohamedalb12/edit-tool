'use strict';
// Premiere opened from the Dock gives its Node a bare PATH (/usr/bin:/bin…): Homebrew tools (ffmpeg, node, npm,
// yt-dlp and the JS runtime YouTube now needs) are invisible to every child process. Add the usual places once.
const os = require('os');
const path = require('path');

function extraDirs() {
  const home = os.homedir();
  if (process.platform === 'win32') return [];
  return ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/opt/local/bin', path.join(home, '.deno', 'bin'), path.join(home, '.local', 'bin'), path.join(home, 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
}

function fixPath() {
  if (process.platform === 'win32') return process.env.PATH;
  const have = String(process.env.PATH || '').split(':').filter(Boolean);
  const add = extraDirs().filter(d => !have.includes(d));
  if (add.length) process.env.PATH = have.concat(add).join(':');
  return process.env.PATH;
}
fixPath();

module.exports = { fixPath, extraDirs };

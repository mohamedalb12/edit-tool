'use strict';
// host/ae.jsx and host/host.jsx checked against the real After Effects 26 / Premiere 24 scripting APIs
// (Types-for-Adobe, MIT, vendored in tests/types/adobe): a call to a method or property that doesn't exist in the
// app — the kind of bug that only shows up on the user's machine — fails here. A few known false positives of the
// typings are listed with the reason they are fine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..'), TYPES = path.join(__dirname, '..', 'types', 'adobe');
const KNOWN = [
  [/Cannot find global type 'Extract'/, 'the typings use a TS lib type we don\'t load (noLib)'],
  [/on type '_PropertyClasses'/, 'property() returns a union of every property class; we know which one it is'],
  [/on type '_ItemClasses'/, 'project.item() returns a union; we checked instanceof CompItem first'],
  [/Property '(threeDLayer|source)' does not exist on type 'Layer'/, 'AVLayer properties, read on layers we know are AV layers'],
  [/Property 'addProperty' does not exist on type '_PropertyClasses'/, 'addProperty on a PropertyGroup from property()'],
  [/Cannot find name 'qe'/, 'Premiere\'s QE DOM (app.enableQE) has no typings'],
  [/Property 'name' does not exist on type 'Application'/, 'read with a fallback: app.name || \'Premiere Pro\''],
  [/Expected 4 arguments, but got 1/, 'markers.createMarker(time) — the one-argument form Adobe\'s PProPanel sample uses'],
  [/Expected 3 arguments, but got 2/, 'createCaptionTrack(item, start) — the format is optional (the typings\' own doc + PProPanel sample)'],
  [/types 'Sequence' and 'boolean' have no overlap/, 'createCaptionTrack returned false on older Premiere: kept as a guard'],
  [/is not assignable to type '\{ match: string; names:/, 'the shape of our own Motion / Transform lookup table, not an Adobe API']
];

function check(file, types) {
  const src = fs.readFileSync(path.join(ROOT, 'host', file), 'utf8');
  const name = path.join(ROOT, 'host', file.replace(/\.jsx$/, '.check.js'));
  const host = ts.createCompilerHost({});
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host), get = host.getSourceFile.bind(host);
  host.readFile = f => (path.resolve(f) === name ? src : read(f));
  host.fileExists = f => path.resolve(f) === name || exists(f);
  host.getSourceFile = (f, v) => (path.resolve(f) === name ? ts.createSourceFile(f, src, v) : get(f, v));
  const files = [path.join(TYPES, 'shared', 'JavaScript.d.ts'), path.join(TYPES, types, 'index.d.ts'), name];
  const prog = ts.createProgram(files, { allowJs: true, checkJs: true, noEmit: true, noLib: true, strict: false, target: ts.ScriptTarget.ES5, types: [] }, host);
  const out = [];
  for (const d of ts.getPreEmitDiagnostics(prog)) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (KNOWN.some(k => k[0].test(msg))) continue;
    const line = d.file ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    out.push(file + ':' + line + ' TS' + d.code + ' ' + msg.split('\n')[0] + (d.file ? '\n    ' + d.file.text.split('\n')[line - 1].trim().slice(0, 160) : ''));
  }
  return out;
}

test('ae.jsx only uses After Effects 26 scripting APIs that exist', () => {
  const bad = check('ae.jsx', 'AfterEffects/26.0');
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('host.jsx only uses Premiere scripting APIs that exist, with the right arguments', () => {
  const bad = check('host.jsx', 'Premiere/24.0');
  assert.deepEqual(bad, [], bad.join('\n'));
});

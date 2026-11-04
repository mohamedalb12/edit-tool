'use strict';
// Type-check After Effects expressions against the expression API (expression-globals-typescript, MIT, vendored in
// tests/types/ae-expressions): every member of Layer and Property is in scope unqualified, as in AE (time, value,
// wiggle, effect(), transform, loopOut…), plus thisComp / thisLayer / thisProperty. A call to a function that
// doesn't exist, or with the wrong number of arguments, is reported — before it reaches After Effects.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const LIB = path.join(__dirname, '..', 'types', 'ae-expressions', 'index.ts');

/** the names declared directly in `export class <name> … {` (fields + methods) */
function members(src, cls) {
  const m0 = new RegExp('export class ' + cls + '[ <]').exec(src);
  if (!m0) return [];
  const start = m0.index;
  let i = src.indexOf('{', start), depth = 0, body = '';
  for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) break; } body += ch; }
  const out = new Set();
  // members sit at depth 1 of the class body: "  name(" / "  name:" / "  readonly name" / "  name =" / "  get name("
  for (const m of body.matchAll(/^ {2}(?:readonly |get |static )?([A-Za-z_$][\w$]*)\s*[(:=<?]/gm)) if (!['constructor', 'private'].includes(m[1])) out.add(m[1]);
  return [...out];
}
let header = null;
function prelude() {
  if (header) return header;
  const src = fs.readFileSync(LIB, 'utf8');
  const L = members(src, 'Layer'), P = members(src, 'Property').filter(n => !L.includes(n)), PP = members(src, 'PathProperty').filter(n => !L.includes(n) && !P.includes(n));
  const lines = ['import { Layer, Comp, Property, PathProperty, Project } from "./index";',
    'declare const thisComp: Comp; declare const thisLayer: Layer; declare const thisProperty: Property<any>; declare const thisProject: Project;'];
  for (const n of L) lines.push(`declare const ${n}: Layer[${JSON.stringify(n)}];`);
  for (const n of P) lines.push(`declare const ${n}: Property<any>[${JSON.stringify(n)}];`);
  // createPath / points / tangents… are callable unqualified in a Path property's expression
  for (const n of PP) lines.push(`declare const ${n}: PathProperty[${JSON.stringify(n)}];`);
  // the value the property has is whatever it is (number, array, path…)
  lines.push('declare const value: any;');
  return (header = lines.join('\n') + '\n');
}

/**
 * list: [{ where, code }] → [{ where, code, error }] for expressions the API says are wrong.
 * ignore: [RegExp] messages that are known gaps of the typings (each with a reason at the call site).
 */
function check(list, { ignore = [] } = {}) {
  let text = prelude();
  const spans = [];
  list.forEach((e, k) => {
    const from = text.split('\n').length;
    text += `function __e${k}() {\n${e.code}\n}\n`;
    spans.push({ k, from, to: text.split('\n').length - 1 });
  });
  const name = path.join(path.dirname(LIB), '__expressions.ts');
  const host = ts.createCompilerHost({});
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host), get = host.getSourceFile.bind(host);
  host.readFile = f => (path.resolve(f) === name ? text : read(f));
  host.fileExists = f => path.resolve(f) === name || exists(f);
  host.getSourceFile = (f, v) => (path.resolve(f) === name ? ts.createSourceFile(f, text, v) : get(f, v));
  const prog = ts.createProgram([name], { noEmit: true, strict: false, noImplicitAny: false, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], skipLibCheck: true, allowUnreachableCode: true, noUnusedLocals: false }, host);
  const out = [];
  for (const d of ts.getPreEmitDiagnostics(prog)) {
    if (!d.file || path.resolve(d.file.fileName) !== name) continue;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n').split('\n')[0];
    if (ignore.some(re => re.test(msg))) continue;
    const line = d.file.getLineAndCharacterOfPosition(d.start).line + 1;
    const s = spans.find(x => line > x.from && line < x.to + 1);
    if (!s) { out.push({ where: 'prelude', code: '', error: msg }); continue; }
    out.push({ where: list[s.k].where, code: list[s.k].code, error: 'TS' + d.code + ' ' + msg });
  }
  return out;
}

module.exports = { check, members, prelude };

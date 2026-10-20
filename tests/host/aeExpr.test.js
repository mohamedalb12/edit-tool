'use strict';
// Every expression any tool writes in AE must at least parse: build everything on the strict simulator,
// collect each property's expression and run it through a JS parser (AE's engine is modern JavaScript; the value
// is the last statement, so a bare expression or an if / else at the end are both fine).
const test = require('node:test');
const assert = require('node:assert/strict');
const acorn = require('acorn');
const S = require('../../core/aeScene');
const K = require('../../core/motionKit');
const logoFx = require('../../core/logoFx');
const svgFile = require('../../core/svgFile');
const photo3d = require('../../core/photo3d');
const kinetic = require('../../core/kinetic');
const { loadAE } = require('./mockAE');
const fs = require('fs');
const path = require('path');
const { TMP } = require('../helpers');
const { makePng } = require('../../core/util');
const PX = path.join(TMP, 'ae-expr'); fs.mkdirSync(PX, { recursive: true });
for (const n of ['a', 'b']) fs.writeFileSync(path.join(PX, n + '.png'), makePng(16, 9, [200, 100, 50, 255]));

function collect(comp, label, out) {
  const walk = (g, where) => {
    for (const ch of g.children || []) {
      if (ch.children) walk(ch, where + '/' + ch.name);
      else if (ch.expression) out.push({ where: label + ' · ' + where + '/' + ch.name, code: ch.expression, comp, layer: L });
    }
  };
  let L;
  for (L of comp.layerList) {
    walk(L.root, L.name);
    if (L.source && L.source.layerList && L.source !== comp) collect(L.source, label + ' > ' + L.source.name, out);
  }
}
function syntaxErrors(list) {
  const bad = [];
  for (const e of list) {
    try { acorn.parse(e.code, { ecmaVersion: 2020, allowReturnOutsideFunction: true }); }
    catch (err) { bad.push(e.where + ' → ' + err.message + '\n    ' + e.code.slice(0, 300)); }
  }
  return bad;
}
/** layer("x") / effect("y") references that point at nothing (AE turns such an expression off with an error) */
function dangling(list) {
  const bad = [];
  const fxNames = L => { const fx = L.property('ADBE Effect Parade'); return fx ? fx.children.map(e => e.name) : []; };
  for (const e of list) {
    const code = e.code.replace(/\/\/.*$/gm, '');
    const re = /(?:thisComp\.layer\("((?:[^"\\]|\\.)*)"\)|thisLayer|^|[^.\w])\.?effect\("((?:[^"\\]|\\.)*)"\)/g;
    for (const m of code.matchAll(/thisComp\.layer\("((?:[^"\\]|\\.)*)"\)/g)) {
      const name = JSON.parse('"' + m[1] + '"');
      if (!e.comp.layerList.some(x => x.name === name)) bad.push(e.where + ' → no layer "' + name + '"');
    }
    for (const m of code.matchAll(/(thisComp\.layer\("((?:[^"\\]|\\.)*)"\)\.)?effect\("((?:[^"\\]|\\.)*)"\)/g)) {
      const owner = m[1] ? e.comp.layerList.find(x => x.name === JSON.parse('"' + m[2] + '"')) : (m.index > 0 && /[\w)\]]\.$/.test(code.slice(Math.max(0, m.index - 2), m.index)) ? null : e.layer);
      if (!owner) continue;
      const name = JSON.parse('"' + m[3] + '"');
      if (!fxNames(owner).includes(name)) bad.push(e.where + ' → layer "' + owner.name + '" has no effect "' + name + '"');
    }
    void re;
  }
  return [...new Set(bad)];
}
function build(raw) {
  const ae = loadAE(), n = S.normalize(raw, {});
  ae.call('buildScene', { spec: JSON.parse(JSON.stringify(n.spec)) });
  return ae;
}
const allComps = ae => ae.project.items ? [...(ae.project.items.list || ae.project.itemList || [])] : [];

test('every generated expression parses (scenes, kit, logo, 3D photo, kinetic, characters, host tools)', () => {
  const found = [];
  const grab = (label, ae) => { const comps = (ae.project._items || allComps(ae)).filter(c => c && c.layerList); for (const c of comps.length ? comps : [ae.project.activeItem]) if (c) collect(c, label, found); };
  const runs = [];
  for (const x of S.SCENES) runs.push(['scene:' + x.id, S.buildLibrary(x.id, {})]);
  for (const p of Object.keys(K.LIQUID)) runs.push(['liquid:' + p, { comp: { duration: 6 }, layers: K.liquidLayers({ preset: p }) }]);
  for (const t of Object.keys(K.TRANSITIONS)) runs.push(['transition:' + t, { comp: { duration: 6 }, layers: K.transitionLayers(t, 3, {}) }]);
  for (const t of Object.keys(K.CHARTS)) runs.push(['chart:' + t, K.chartScene({ type: t, data: 'A, 1\nB, 2\nC, 3', title: 'x' })]);
  for (const st of Object.keys(K.COUNTER_STYLES)) for (const fmt of [{}, { currency: 'USD' }, { percent: true }, { compact: true, arabic: true }]) runs.push(['counter:' + st + JSON.stringify(fmt), { comp: { duration: 4 }, layers: K.counterLayers(Object.assign({ style: st, label: 'L', to: 12500 }, fmt)) }]);
  for (const a of ['walk', 'wave', 'idle', 'jump', 'talk']) runs.push(['character:' + a, { comp: { duration: 4 }, layers: [{ type: 'character', name: 'A', action: a }] }]);
  runs.push(['plexus', { comp: { duration: 4 }, layers: [{ type: 'plexus', count: 6 }] }]);
  for (const p of ['dust', 'sparks', 'confetti', 'bokeh', 'snow']) runs.push(['particles:' + p, { comp: { duration: 4 }, layers: [{ type: 'particles', preset: p, count: 4 }] }]);
  for (const pr of ['fadeUp', 'typewriter', 'blurIn', 'scalePop', 'slideIn', 'tracking', 'rotateIn', 'dropIn']) runs.push(['text:' + pr, { comp: { duration: 4 }, layers: [{ type: 'text', text: 'Hi', textAnimators: [{ preset: pr }], textOut: { preset: pr } }] }]);
  const art = svgFile.parse('<svg viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="30" fill="#f97316"/><circle cx="70" cy="60" r="20" fill="#2563eb"/><path d="M10 90 L90 90" stroke="#ffffff" stroke-width="4" fill="none"/></svg>');
  const parts = logoFx.toParts(art, { width: 1920, height: 1080 });
  for (const st of Object.keys(logoFx.STYLES)) runs.push(['logo:' + st, logoFx.logoScene(parts, { style: st })]);
  for (const mv of ['push', 'orbit', 'rise', 'float']) runs.push(['photo3d:' + mv, photo3d.photoScene([{ file: path.join(PX, 'a.png'), depth: 0.2, w: 1920, h: 1080 }, { file: path.join(PX, 'b.png'), depth: 0.8, w: 1920, h: 1080 }], { width: 1920, height: 1080, move: mv })]);
  const words = [{ text: 'أهلا', start: 0, end: 0.4 }, { text: 'بيك', start: 0.45, end: 0.9 }, { text: 'هنا', start: 1.5, end: 2 }];
  for (const st of Object.keys(kinetic.STYLES)) runs.push(['kinetic:' + st, { comp: { duration: 3 }, layers: kinetic.layers(words, { style: st }) }]);
  const skipped = [];
  for (const [label, raw] of runs) {
    try { const ae = build(raw); grab(label, ae); } catch (e) { skipped.push(label + ': ' + e.message); }
  }
  assert.deepEqual(skipped, [], 'every generator builds');
  // host tools that write their own expressions
  const ae = loadAE();
  const exprKinds = Object.keys(ae.ctx.EFM.EXPR);
  for (const kind of exprKinds) {
    const a = loadAE(), c = a.newComp('T', { duration: 4 }); const t = c.layers.addText('hi'); a.project._active = c; c.selectedLayers = [t];
    const p = t.property('ADBE Transform Group').property('ADBE Position'); p.setValueAtTime(0, [0, 0]); p.setValueAtTime(1, [100, 100]);
    try { a.call('addExpression', { kind }); } catch (e) { if (!/key|كي/i.test(e.message)) skipped.push('expr:' + kind + ': ' + e.message); }
    collect(c, 'addExpression:' + kind, found);
  }
  assert.deepEqual(skipped, []);
  assert.ok(found.length > 300, 'found ' + found.length + ' expressions');
  const bad = syntaxErrors(found);
  assert.deepEqual(bad, [], bad.slice(0, 10).join('\n'));
  const refs = dangling(found);
  assert.deepEqual(refs, [], refs.slice(0, 20).join('\n'));
});

test('3D: the comp gets the real Advanced 3D (ADBE Calder) or Cinema 4D renderer — never Classic 3D, which cannot extrude', () => {
  const pick = loadAE().ctx.EFM.pick3d;
  assert.equal(pick(['ADBE Advanced 3d', 'ADBE Calder', 'ADBE Ernst', 'ADBE Picasso']), 'ADBE Calder');
  assert.equal(pick(['ADBE Advanced 3d', 'ADBE Ernst']), 'ADBE Ernst', 'older AE: Cinema 4D');
  assert.equal(pick(['ADBE Classic 3d', 'ADBE Advanced 3d', 'ADBE Cinema 4d']), 'ADBE Advanced 3d', 'the 2024 beta names');
  assert.equal(pick(['ADBE Advanced 3d']), null, 'Classic 3D only: no extrusion possible');
  const ae = build(logoFx.logoScene(logoFx.toParts(svgFile.parse('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>'), { width: 1920, height: 1080 }), { style: '3d' }));
  const c = ae.project.activeItem;
  assert.equal(c.renderer, 'ADBE Calder');
  const part = c.layerList.find(L => L.threeDLayer && L.property('ADBE Extrsn Options Group').property('ADBE Extrsn Depth').value > 0);
  assert.ok(part, 'the logo parts are extruded');
});

test('ae.jsx is pure ASCII (Arabic as \\u escapes): $.evalFile reads it in the Mac\'s own encoding, raw Arabic would come out garbled', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'host', 'ae.jsx'), 'utf8');
  const bad = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
  assert.deepEqual(bad.map(b => b[0]), []);
});

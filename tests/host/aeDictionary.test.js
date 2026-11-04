'use strict';
// The effects dictionary: After Effects itself says what every effect parameter is called, and that is checked
// against the params the tools set — a wrong index guess (ADBE Glo2-0003 not being "Radius") would otherwise set
// the wrong param silently.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../core/aeDictionary');
const { loadAE } = require('./mockAE');

test('the simulator\'s After Effects answers the dictionary: every param we set exists, none looks wrong, nothing left behind', () => {
  const ae = loadAE(); const before = ae.project._items.map(i => i.id);
  const dict = ae.call('effectDictionary', { matches: D.matches() });
  const r = D.audit(dict);
  assert.deepEqual(r.bad, []); assert.deepEqual(r.warn, []); assert.deepEqual(r.missing, []);
  assert.ok(r.checked > 80, 'checked ' + r.checked);
  assert.ok(dict['ADBE Fractal Noise'].params.some(p => p.name === 'Scale' && p.group === 'Transform'), 'params inside groups too');
  assert.deepEqual(ae.project._items.map(i => i.id), before, 'the throwaway comp + solid are gone');
});

test('the audit catches a wrong index guess, a param that is not there, and an effect that is not installed', () => {
  const dict = {};
  for (const m of D.matches()) dict[m] = { missing: true };
  dict['ADBE Glo2'] = { name: 'Glow', params: [['Glow Based On'], ['Glow Threshold'], ['Glow Intensity'], ['Glow Radius']].map((n, i) => ({ i: i + 1, matchName: 'ADBE Glo2-000' + (i + 1), name: n[0] })) };
  dict['ADBE Geometry2'] = { name: 'Transform', params: ['Anchor Point', 'Position', 'Uniform Scale', 'Scale Height', 'Scale Width', 'Rotation', 'Opacity', 'Use Composition’s Shutter Angle', 'Shutter Angle'].map((n, i) => ({ i: i + 1, matchName: 'x' + i, name: n })) };
  dict['Keylight 906'] = { name: 'Keylight', params: [{ i: 1, matchName: 'k1', name: 'Screen Colour' }] };
  const r = D.audit(dict);
  // radius and intensity swapped in this (made-up) AE → both flagged as maybe-wrong
  assert.deepEqual(r.warn.map(w => w.effect + '.' + w.param).sort(), ['glow.intensity', 'glow.radius']);
  assert.ok(r.bad.some(b => b.effect === 'Keylight 906' && b.param === 'Screen Gain'), 'a param that is not there');
  assert.ok(!r.bad.some(b => b.effect === 'ADBE Geometry2'), '"Scale" = Scale Height, and the curly apostrophe matches');
  assert.ok(r.missing.includes('CC Light Rays') || r.missing.some(m => /lightRays/.test(m)), 'a plugin effect not installed is listed, not failed');
  assert.equal(r.ok, false);
});

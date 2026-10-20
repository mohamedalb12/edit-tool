'use strict';
// "اختبر كل الأدوات" (the in-AE self-test) run against the strict simulator: every tool passes, and the test leaves
// the project exactly as it found it.
require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../core/config');
const { loadAE } = require('./mockAE');
const { AEServices } = require('../../core/aeServices');

test('self-test: every tool runs on its own scratch comp, AE checks the expressions, and everything is cleaned up after', { timeout: 600000 }, async () => {
  const ae = loadAE();
  config.save({ ...config.DEFAULTS });
  const svc = new AEServices({ host: async (n, a) => ae.call(n, JSON.parse(JSON.stringify(a))) });
  const mine = ae.newComp('My Edit', { duration: 10 }); mine.layers.addText('keep me'); ae.project._active = mine;
  const before = ae.project._items.map(i => i.id);
  const steps = [];
  const r = await svc.fullTest({ onStep: m => steps.push(m) });
  const fails = r.results.filter(x => !x.ok).map(x => x.group + ' · ' + x.name + ' → ' + (x.error || '') + (x.errors || []).join(' | '));
  assert.deepEqual(fails, [], r.report);
  assert.ok(r.total > 120, 'covers the tools: ' + r.total);
  assert.equal(r.env.pick3d, 'ADBE Calder');
  assert.ok(r.results.every(x => x.layers > 0), 'every tool made its layers');
  assert.ok(r.results.reduce((s, x) => s + x.expressions, 0) > 300, 'AE checked the expressions');
  assert.deepEqual(ae.project._items.map(i => i.id), before, 'only what the test made is removed');
  assert.equal(ae.project.activeItem, mine, 'back to your comp');
  assert.match(r.report, /النتيجة: \d+ \/ \d+ شغالين ✓/);
});

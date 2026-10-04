'use strict';
require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../../core/util');
const ranges = require('../../core/ranges');
const config = require('../../core/config');

test('util: time formats', () => {
  assert.equal(util.srtTime(3723.5), '01:02:03,500');
  assert.equal(util.ytTime(65), '01:05');
  assert.equal(util.ytTime(3725), '1:02:05');
  assert.equal(util.parseClock('00:00:01,250'), 1.25);
  assert.equal(util.secondsToTicks(1), '254016000000');
});

test('util: extractJson handles fenced / chatty model output', () => {
  assert.deepEqual(util.extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(util.extractJson('أكيد! ده الرد: {"x":[1,2,{"y":"}"}]} شكرًا'), { x: [1, 2, { y: '}' }] });
  assert.throws(() => util.extractJson('مفيش'));
});

test('ranges: merge / invert / ripple', () => {
  assert.deepEqual(ranges.merge([{ start: 2, end: 3 }, { start: 0, end: 1 }, { start: 0.5, end: 1.5 }]), [{ start: 0, end: 1.5 }, { start: 2, end: 3 }]);
  assert.deepEqual(ranges.invert([{ start: 1, end: 2 }, { start: 3, end: 4 }], 5), [{ start: 0, end: 1 }, { start: 2, end: 3 }, { start: 4, end: 5 }]);
  assert.equal(ranges.rippleTime(5, [{ start: 1, end: 2 }, { start: 4.5, end: 6 }]), 3.5);
  assert.equal(ranges.totalLength([{ start: 0, end: 1 }, { start: 2, end: 2.5 }]), 1.5);
});

test('config: save/load/update deep-merge and stays on this machine', () => {
  const s = config.update({ keys: { openrouter: 'sk-or-test' }, models: { agent_max: 'x/y' } });
  assert.equal(s.keys.openrouter, 'sk-or-test');
  assert.equal(s.keys.elevenlabs, '');
  const again = config.load();
  assert.equal(again.models.agent_max, 'x/y');
  assert.equal(again.quickCut.sensitivity, 5);
  assert.ok(config.dataDir().startsWith(process.env.EDITFAST_HOME));
});

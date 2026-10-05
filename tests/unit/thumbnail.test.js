'use strict';
require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../core/thumbnail');

test('thumbnail scoring: sharp + well exposed beats blurry, dark or blown-out frames', () => {
  const W = 160, H = 90;
  const make = f => { const g = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = f(x, y); return g; };
  const sharp = make((x, y) => ((x >> 3) + (y >> 3)) % 2 ? 200 : 50);
  const blurry = make((x) => 110 + 30 * Math.sin(x / 40));
  const dark = make((x, y) => (((x >> 3) + (y >> 3)) % 2 ? 30 : 5));
  const blown = make((x, y) => (((x >> 3) + (y >> 3)) % 2 ? 255 : 240));
  const sc = g => T.score(T.frameStats(g, W, H));
  assert.ok(sc(sharp) > sc(blurry), 'sharp > blurry');
  assert.ok(sc(sharp) > sc(dark), 'sharp > dark');
  assert.ok(sc(sharp) > sc(blown), 'sharp > blown');
  assert.equal(T.STYLES.length, 4);
});

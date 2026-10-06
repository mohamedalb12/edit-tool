'use strict';
require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const pro = require('../../core/proScene');

test('pro scenes: 26 components (incl. collage, 3D, UI, icons); AI output is validated (unknown types dropped, props coerced, times clamped, style applied)', () => {
  assert.equal(Object.keys(pro.CATALOG).length, 26);
  const s = pro.normalize({
    duration: 6, background: { type: 'galaxy' }, theme: { primary: 'red', accent: '#FFAA00' },
    elements: [
      { type: 'kineticTitle', from: -2, duration: 99, position: 'top', props: { text: 'أهلا', highlight: 'أهلا، بيكم', style: 'explode', size: '1.2' } },
      { type: 'barChart', from: 2, props: { bars: [{ label: 'أ', value: '10' }, { value: 5 }] } },
      { type: 'hack', props: {} }
    ]
  }, { width: 1080, height: 1920, fps: 25, style: { primary: '#7C3AED', font: 'Cairo' } });
  assert.equal(s.width, 1080); assert.equal(s.height, 1920); assert.equal(s.fps, 25);
  assert.equal(s.background.type, 'mesh');
  assert.equal(s.theme.primary, '#7C3AED'); // invalid "red" falls back to the editor's style
  assert.equal(s.theme.accent, '#FFAA00');
  assert.equal(s.elements.length, 2);
  const t = s.elements[0];
  assert.deepEqual([t.from, t.duration, t.position], [0, 6, 'top']);
  assert.deepEqual(t.props.highlight, ['أهلا', 'بيكم']); assert.equal(t.props.style, 'rise'); assert.equal(t.props.size, 1.2);
  assert.deepEqual(s.elements[1].props.bars, [{ label: 'أ', value: 10 }, { label: '', value: 5 }]);
  assert.throws(() => pro.normalize({ elements: [{ type: 'nope' }] }), /فاضي/);
  assert.match(pro.DIRECTOR_SYSTEM(), /kineticTitle/); assert.match(pro.DIRECTOR_SYSTEM(), /statCounter/);
});

test('pro scenes: the AI director gets the catalog + rules + style and overlay forces a transparent background', async () => {
  let seen;
  const llm = { json: async (req) => { seen = req; return { duration: 3, background: { type: 'mesh' }, elements: [{ type: 'cta', from: 0, duration: 3 }] }; } };
  const spec = await pro.direct(llm, 'm', 'اشترك في القناة', { style: { primary: '#123456' }, duration: 4, transparent: true });
  assert.equal(spec.background.type, 'transparent'); assert.equal(spec.duration, 4);
  assert.match(seen.system, /مخرج موشن جرافيك/); assert.match(seen.user, /#123456/); assert.match(seen.user, /transparent/);
  assert.equal(seen.model, 'm');
});

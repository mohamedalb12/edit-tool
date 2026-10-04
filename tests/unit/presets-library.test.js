'use strict';
const { TMP } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const curves = require('../../core/curves');
const motion = require('../../core/motionPresets');
const titles = require('../../core/titles');
const scene = require('../../core/scene');
const library = require('../../core/library');
const organize = require('../../core/organize');

test('curves: cubic-bezier solver + presets + baking keeps endpoints', () => {
  const lin = curves.cubicBezier(0, 0, 1, 1);
  for (const x of [0, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(lin(x) - x) < 1e-4);
  const ease = curves.getEasing('easeInOut');
  assert.ok(ease(0.25) < 0.25 && ease(0.75) > 0.75 && Math.abs(ease(0.5) - 0.5) < 1e-3);
  assert.ok(curves.getEasing('backOut')(0.6) > 1, 'overshoot');
  const keys = [{ t: 0, v: 100 }, { t: 1, v: 200 }, { t: 2, v: [0, 0] && 100 }];
  const baked = curves.bake(keys, 'expoOut', { fps: 10 });
  assert.equal(baked[0].v, 100); assert.equal(baked[baked.length - 1].t, 2); assert.equal(baked[baked.length - 1].v, 100);
  assert.equal(baked.length, 21);
  assert.ok(baked[3].v > 100 + 100 * 0.3 / 1 * 1, 'expo moves fast early');
  const arr = curves.bake([{ t: 0, v: [0, 0] }, { t: 1, v: [1, 2] }], 'linear', { fps: 2 });
  assert.deepEqual(arr[1].v, [0.5, 1]);
});

test('motion: 28 presets, 3 levels, all generate valid keyframes', () => {
  assert.equal(motion.PRESETS.length, 28);
  assert.deepEqual(Object.keys(motion.LEVELS), ['1', '2', '3']);
  const ids = new Set();
  for (const p of motion.PRESETS) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    for (const lvl of [1, 2, 3]) {
      const g = motion.generate(p.id, lvl, { fps: 30 });
      assert.ok(g.duration > 0, p.id);
      const props = Object.keys(g.props); assert.ok(props.length, p.id);
      for (const k of props) {
        const keys = g.props[k];
        assert.ok(keys.length >= 2, `${p.id}.${k}`);
        for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t >= keys[i - 1].t, `${p.id}.${k} sorted`);
        assert.ok(keys[keys.length - 1].t <= g.duration + 1e-3 && keys[0].t === 0, `${p.id}.${k} within [0, duration]`);
        keys.forEach(x => { const vs = [].concat(x.v); vs.forEach(v => assert.ok(Number.isFinite(v))); if (k === 'scale') assert.ok(x.v >= 0); if (k === 'opacity') assert.ok(x.v >= 0 && x.v <= 100); });
      }
    }
  }
  const soft = motion.generate('punch-in', 1), hard = motion.generate('punch-in', 3);
  assert.ok(hard.props.scale.at(-1).v - 100 > soft.props.scale.at(-1).v - 100, 'level 3 stronger');
  assert.equal(motion.generate('slide-in-left', 2).props.pos.at(-1).v.join(), '0,0', 'in-presets land at rest');
  assert.equal(motion.generate('shake', 2).props.pos.at(-1).v.join(), '0,0', 'shake settles');
  assert.deepEqual(motion.generate('shake', 2), motion.generate('shake', 2), 'deterministic');
});

test('titles: 25 templates referencing existing motion presets; scene fallback spec', () => {
  assert.equal(titles.TEMPLATES.length, 25);
  const ids = new Set(motion.PRESETS.map(p => p.id));
  for (const t of titles.TEMPLATES) {
    assert.ok(ids.has(t.in) && ids.has(t.out), t.id);
    if (t.emphasis) assert.ok(ids.has(t.emphasis));
    const s = scene.normalize(titles.toScene(t.id, 'نص', { primary: '#ff0000' }));
    assert.equal(s.transparent, true); assert.equal(s.layers[0].text, 'نص');
  }
});

test('scene engine: normalise style roles, clamp, animation states', () => {
  const s = scene.normalize({ duration: 99, fps: 5, layers: [{ text: 'أهلا', color: 'accent', in: 'pop' }, { type: 'shape', color: 'primary', in: 'weird' }] }, { accent: '#ABCDEF', primary: '#123456' });
  assert.equal(s.duration, 30); assert.equal(s.fps, 12);
  assert.equal(s.layers[0].color, '#ABCDEF'); assert.equal(s.layers[1].color, '#123456'); assert.equal(s.layers[1].in, 'fade');
  const L = s.layers[0];
  assert.equal(scene.layerState(L, 0, 4).scale, 0);
  assert.ok(Math.abs(scene.layerState(L, 1, 4).scale - 1) < 1e-6);
  assert.ok(scene.layerState({ ...L, out: 'fade' }, 3.99, 4).alpha < 0.1);
  assert.equal(scene.frameCount({ duration: 2, fps: 30 }), 60);
});

test('library: drop a whole folder → sorted into sfx / transitions / overlays / music', async () => {
  const root = path.join(TMP, 'mylib');
  const files = {
    'SFX/Whoosh/fast_whoosh_01.wav': 'sfx/whoosh', 'SFX/hits/boom impact.mp3': 'sfx/impact', 'random/pop.wav': 'sfx/pop',
    'Transitions/zoom transition.mov': 'transitions/video', 'Packs/swipe_left.mp4': 'transitions/video',
    'Overlays/Light Leaks/leak 03.mov': 'overlays/video', 'textures/dust.png': 'overlays/image',
    'music/bgm_chill.mp3': 'music/', 'presets/my.prfpset': 'transitions/preset', 'notes.txt': null
  };
  for (const f of Object.keys(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), 'x'); }
  const items = await library.scan([root]);
  for (const [f, exp] of Object.entries(files)) {
    const it = items.find(i => i.path.endsWith(f.split('/').pop()));
    if (exp === null) { assert.ok(!it, f); continue; }
    assert.equal(`${it.category}/${it.sub}`, exp, f);
  }
  assert.equal(library.classifyFile('clip.mov', { duration: 1.2 }).category, 'transitions');
  assert.equal(library.classifyFile('logo.mov', { duration: 8, alpha: true }).category, 'overlays');
  assert.equal(library.classifyFile('long.wav', { duration: 120 }).category, 'music');
  const dd = path.join(TMP, 'libdata'); fs.mkdirSync(dd, { recursive: true });
  library.saveIndex(dd, items);
  assert.equal(library.loadIndex(dd).length, items.length);
  assert.equal(library.search(items, { q: 'whoosh', category: 'sfx' }).length, 1);
});

test('organize: plan classifies by type, skips items already in place', () => {
  const p = organize.plan([
    { nodeId: '1', name: 'A001.mp4', path: '/m/A001.mp4', bin: '' },
    { nodeId: '2', name: 'whoosh.wav', path: '/sfx/whoosh.wav', bin: '' },
    { nodeId: '3', name: 'song.mp3', path: '/music/song.mp3', bin: '' },
    { nodeId: '4', name: 'Main Edit', isSequence: true, bin: '' },
    { nodeId: '5', name: 'logo.png', path: '/l/logo.png', bin: 'صور' },
    { nodeId: '6', name: 'subs.srt', path: '/s/subs.srt', bin: 'old' },
    { nodeId: '7', name: 'lower.mogrt', path: '/g/lower.mogrt', bin: '' },
    { nodeId: '8', name: 'voice.wav', path: '/v/voice.wav', bin: '' }
  ]);
  const to = Object.fromEntries(p.moves.map(m => [m.nodeId, m.to]));
  assert.deepEqual(to, { 1: 'فيديو', 2: 'صوت/مؤثرات', 3: 'صوت/موسيقى', 4: 'سيكوينسات', 6: 'كابشن', 7: 'جرافيك', 8: 'صوت' });
  assert.ok(!('5' in to));
});

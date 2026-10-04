'use strict';
// 28 قالب حركة بيكتبوا كي فريمز حقيقية على Transform — 3 مستويات قوة.
(function (root, factory) {
  // Works as a <script> in the panel AND via require() — in Premiere's mixed context both window and module exist.
  var hasModule = typeof module === 'object' && module && module.exports;
  var dep = (root && root.EFCurves) || (hasModule ? require('./curves') : null);
  var api = factory(dep);
  if (hasModule) module.exports = api;
  if (root) root.EFMotion = api;
})(typeof window !== 'undefined' ? window : null, function (curves) {

  const LEVELS = { 1: { label: 'هادي', amp: 0.55, speed: 1.25 }, 2: { label: 'متوسط', amp: 1, speed: 1 }, 3: { label: 'قوي', amp: 1.6, speed: 0.8 } };

  // props: scale (%), pos [dx,dy] (fraction of frame size), rotation (deg), opacity (%), skew (deg)
  // keys: [u (0..1 of duration), value, easing-to-next]
  const P = [
    // ——— دخول ———
    { id: 'zoom-in-reveal', name: 'زووم داخل', kind: 'in', dur: 0.6, props: { scale: [[0, 100 + 30, 'expoOut'], [1, 100]], opacity: [[0, 0, 'easeOut'], [0.5, 100]] } },
    { id: 'zoom-out-reveal', name: 'زووم من بعيد', kind: 'in', dur: 0.6, props: { scale: [[0, 100 - 25, 'expoOut'], [1, 100]], opacity: [[0, 0, 'easeOut'], [0.5, 100]] } },
    { id: 'slide-in-left', name: 'دخول من الشمال', kind: 'in', dur: 0.5, props: { pos: [[0, [-1, 0], 'expoOut'], [1, [0, 0]]] } },
    { id: 'slide-in-right', name: 'دخول من اليمين', kind: 'in', dur: 0.5, props: { pos: [[0, [1, 0], 'expoOut'], [1, [0, 0]]] } },
    { id: 'slide-in-up', name: 'طالع من تحت', kind: 'in', dur: 0.5, props: { pos: [[0, [0, 1], 'expoOut'], [1, [0, 0]]] } },
    { id: 'slide-in-down', name: 'نازل من فوق', kind: 'in', dur: 0.5, props: { pos: [[0, [0, -1], 'expoOut'], [1, [0, 0]]] } },
    { id: 'pop-in', name: 'بوب', kind: 'in', dur: 0.45, props: { scale: [[0, 0, 'backOut'], [1, 100]], opacity: [[0, 0, 'linear'], [0.2, 100]] } },
    { id: 'spin-in', name: 'لفّة دخول', kind: 'in', dur: 0.7, props: { rotation: [[0, -90, 'expoOut'], [1, 0]], scale: [[0, 40, 'expoOut'], [1, 100]], opacity: [[0, 0, 'easeOut'], [0.4, 100]] } },
    { id: 'whip-in-left', name: 'ويب من الشمال', kind: 'in', dur: 0.35, props: { pos: [[0, [-0.6, 0], 'expoOut'], [1, [0, 0]]], skew: [[0, 20, 'expoOut'], [1, 0]] } },
    { id: 'fade-in', name: 'ظهور تدريجي', kind: 'in', dur: 0.5, props: { opacity: [[0, 0, 'easeInOut'], [1, 100]] } },
    { id: 'drop-in-bounce', name: 'وقعة ونطّة', kind: 'in', dur: 0.8, props: { pos: [[0, [0, -0.6], 'bounce'], [1, [0, 0]]] } },
    { id: 'elastic-in', name: 'زووم مطاطي', kind: 'in', dur: 0.9, props: { scale: [[0, 60, 'elastic'], [1, 100]] } },
    // ——— خروج ———
    { id: 'zoom-out-exit', name: 'زووم خروج', kind: 'out', dur: 0.5, props: { scale: [[0, 100, 'expoInOut'], [1, 100 + 30]], opacity: [[0.5, 100, 'easeIn'], [1, 0]] } },
    { id: 'slide-out-left', name: 'خروج للشمال', kind: 'out', dur: 0.5, props: { pos: [[0, [0, 0], 'expoInOut'], [1, [-1, 0]]] } },
    { id: 'slide-out-right', name: 'خروج لليمين', kind: 'out', dur: 0.5, props: { pos: [[0, [0, 0], 'expoInOut'], [1, [1, 0]]] } },
    { id: 'fade-out', name: 'اختفاء تدريجي', kind: 'out', dur: 0.5, props: { opacity: [[0, 100, 'easeInOut'], [1, 0]] } },
    { id: 'pop-out', name: 'بوب خروج', kind: 'out', dur: 0.4, props: { scale: [[0, 100, 'backIn'], [1, 0]], opacity: [[0.8, 100, 'linear'], [1, 0]] } },
    { id: 'spin-out', name: 'لفّة خروج', kind: 'out', dur: 0.6, props: { rotation: [[0, 0, 'expoInOut'], [1, 90]], scale: [[0, 100, 'expoInOut'], [1, 40]], opacity: [[0.6, 100, 'easeIn'], [1, 0]] } },
    { id: 'whip-out-right', name: 'ويب لليمين', kind: 'out', dur: 0.35, props: { pos: [[0, [0, 0], 'backIn'], [1, [0.6, 0]]], skew: [[0, 0, 'easeIn'], [1, -20]] } },
    // ——— تأكيد (عند رأس التشغيل) ———
    { id: 'punch-in', name: 'بانش إن', kind: 'emphasis', dur: 0.25, hold: true, props: { scale: [[0, 100, 'expoOut'], [1, 100 + 15]] } },
    { id: 'shake', name: 'هزّة', kind: 'emphasis', dur: 0.5, gen: 'shake', amp: 0.02 },
    { id: 'handheld', name: 'كاميرا محمولة', kind: 'emphasis', dur: 4, gen: 'handheld', amp: 0.006 },
    { id: 'pulse', name: 'نبضة', kind: 'emphasis', dur: 0.4, props: { scale: [[0, 100, 'easeOut'], [0.4, 100 + 8, 'easeInOut'], [1, 100]] } },
    { id: 'heartbeat', name: 'نبض قلب', kind: 'emphasis', dur: 0.8, props: { scale: [[0, 100, 'easeOut'], [0.15, 100 + 7, 'easeIn'], [0.3, 100, 'easeOut'], [0.45, 100 + 10, 'easeInOut'], [1, 100]] } },
    { id: 'ken-burns-left', name: 'كين برنز شمال', kind: 'emphasis', dur: 5, props: { scale: [[0, 105, 'easeInOut'], [1, 105 + 10]], pos: [[0, [0.02, 0], 'easeInOut'], [1, [-0.03, 0]]] } },
    { id: 'ken-burns-right', name: 'كين برنز يمين', kind: 'emphasis', dur: 5, props: { scale: [[0, 105, 'easeInOut'], [1, 105 + 10]], pos: [[0, [-0.02, 0], 'easeInOut'], [1, [0.03, 0]]] } },
    { id: 'slow-push', name: 'دفعة بطيئة', kind: 'emphasis', dur: 3, props: { scale: [[0, 100, 'easeInOut'], [1, 100 + 10]] } },
    { id: 'glitch-jump', name: 'جليتش', kind: 'emphasis', dur: 0.4, gen: 'glitch', amp: 0.03 }
  ];

  // seeded PRNG so the same preset always gives the same keys
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  function scaleValue(prop, v, amp) {
    if (prop === 'scale') return Math.max(0, 100 + (v - 100) * amp);
    if (prop === 'pos') return v.map(x => x * Math.min(amp, 1.2));
    if (prop === 'rotation' || prop === 'skew') return v * amp;
    return v; // opacity stays absolute
  }

  /**
   * Build keyframes for a preset.
   * Returns { duration, kind, props: { scale:[{t,v}], pos:[{t,v:[dx,dy]}], rotation, opacity, skew } }
   * t is seconds from the preset start. `fps` controls baking density of the easing.
   */
  function generate(id, level = 2, { fps = 30, duration } = {}) {
    const p = P.find(x => x.id === id);
    if (!p) throw new Error('قالب حركة مش موجود: ' + id);
    const L = LEVELS[level] || LEVELS[2];
    const dur = duration || +(p.dur * (p.kind === 'emphasis' && p.dur > 2 ? 1 : L.speed)).toFixed(3);
    const out = {};
    if (p.gen) {
      const r = rng(id.length * 7919 + level);
      const n = p.gen === 'handheld' ? Math.max(4, Math.round(dur * 2)) : Math.max(4, Math.round(dur * fps / 2));
      const a = p.amp * L.amp;
      out.pos = []; out.rotation = [];
      if (p.gen === 'glitch') out.scale = [];
      for (let i = 0; i <= n; i++) {
        const t = +(dur * i / n).toFixed(4);
        const end = i === 0 || i === n;
        const decay = p.gen === 'shake' ? (1 - i / n) : 1;
        out.pos.push({ t, v: end ? [0, 0] : [(r() * 2 - 1) * a * decay, (r() * 2 - 1) * a * decay * 0.8] });
        out.rotation.push({ t, v: end ? 0 : (r() * 2 - 1) * (p.gen === 'handheld' ? 0.6 : 1.5) * L.amp * decay });
        if (out.scale) out.scale.push({ t, v: end ? 100 : 100 + (r() > 0.5 ? 6 : -3) * L.amp });
      }
      return { id, duration: dur, kind: p.kind, interpolation: p.gen === 'glitch' ? 'hold' : 'linear', props: out };
    }
    for (const prop of Object.keys(p.props)) {
      const keys = p.props[prop].map(k => ({ t: k[0] * dur, v: scaleValue(prop, k[1], L.amp), ease: k[2] }));
      const baked = [];
      for (let i = 0; i < keys.length - 1; i++) {
        const seg = curves.bake([keys[i], keys[i + 1]], keys[i].ease || 'linear', { fps });
        if (i > 0) seg.shift();
        baked.push(...seg);
      }
      // the first key of a segment that doesn't start at 0 needs a "rest" key at 0
      if (keys[0].t > 0) baked.unshift({ t: 0, v: keys[0].v });
      out[prop] = baked.map(k => ({ t: +k.t.toFixed(4), v: Array.isArray(k.v) ? k.v.map(x => +x.toFixed(5)) : +k.v.toFixed(4) }));
    }
    return { id, duration: dur, kind: p.kind, hold: !!p.hold, interpolation: 'linear', props: out };
  }

  return { PRESETS: P, LEVELS, generate };
});

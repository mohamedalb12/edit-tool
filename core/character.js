'use strict';
// كاراكتر أنيميشن (زي Duik / RubberHose / Joysticks): شخصية فلات بأطراف مطاطية بتتحرك بسلايدرز (مشي، جري، تلويح،
// كلام، نط)، وريج تلقائي لليرز بتاعتك بالأسامي (بارنتنج + أنكر في المفاصل + IK حقيقي)، وليب سينك من الصوت.
// كله إكسبريشنز عادية جوه الأفتر — مفيش بلاجن.

/* ---------------- flat rubber-hose character ---------------- */
const ACTIONS = { walk: 'ماشي', run: 'بيجري', idle: 'واقف بيتنفّس', wave: 'بيسلّم بإيده', talk: 'بيتكلم', jump: 'بينط' };
const SLIDERS = { Walk: 1, Speed: 1.1, Stride: 55, 'Arm Swing': 32, Bob: 12, Breath: 4, Blink: 1, Talk: 0, Mouth: 0, Wave: 0, Jump: 0, Look: 0 };
const PRESET_SLIDERS = {
  walk: {}, run: { Speed: 2.1, Stride: 85, 'Arm Swing': 60, Bob: 22 }, idle: { Walk: 0 }, wave: { Walk: 0, Wave: 1 }, talk: { Walk: 0, Talk: 1 }, jump: { Walk: 0, Jump: 1 }
};

/**
 * One character as plain layers (prefixed with its name, so several can live in one comp). Everything follows
 * "<name> Root" (move it to walk across) and is driven by the sliders on "<name> Ctrl".
 * L: { name, action, colors: {skin, shirt, pants, hair, shoes}, height (px), position: [x, ground y] }
 */
function flatCharacter(L, comp) {
  const N = String(L.name || "Character").slice(0, 24), k = (+L.height || comp.height * 0.6) / 880;
  const col = Object.assign({ skin: '#f2c29b', shirt: '#f97316', pants: '#1e293b', hair: '#2b1a10', shoes: '#111111', eyes: '#1b1b1b' }, L.colors || {});
  const pos = Array.isArray(L.position) ? L.position : [comp.width / 2, comp.height * 0.92];
  const sl = Object.assign({}, SLIDERS, PRESET_SLIDERS[L.action] || {}, L.sliders || {});
  const q = s => JSON.stringify(N + ' ' + s);
  const S = 'var C=thisComp.layer(' + q('Ctrl') + ');function S(n){return C.effect(n)("Slider");}var W=S("Walk"),ph=time*S("Speed")*Math.PI;';
  const J = n => 'thisComp.layer(' + q(n) + ').transform.position';
  const R = v => Math.round(v * k * 100) / 100;
  const joint = (name, expr) => ({ type: 'null', name: N + ' ' + name, expressions: { position: S + expr } });
  // arm end: rotate [0, len] by angle a (degrees)
  const hand = (sh, sign, wave) => `var s=${J(sh)},a=${sign}W*Math.sin(ph)*S("Arm Swing")+Math.sin(time*1.1)*3;${wave ? 'a=a+(150+Math.sin(time*9)*22-a)*S("Wave");' : ''}var r=a*Math.PI/180,l=${R(270)};add(s,[-l*Math.sin(r),l*Math.cos(r)])`;
  const foot = (hp, off) => `var h=${J(hp)},p=ph+${off};add(h,[W*Math.sin(p)*S("Stride")*${k.toFixed(3)},${R(360)}-W*Math.max(0,Math.cos(p))*S("Stride")*${(0.45 * k).toFixed(3)}])`;
  const limb = (name, a, b, len, side, color, width) => ({ type: 'shape', name: N + ' ' + name, transform: { position: [0, 0] },
    shape: { kind: 'path', path: 'M0 0 L1 1', fill: null, stroke: color, strokeWidth: R(width), lineCap: 'round' },
    expressions: { 'shape:path': `var a=fromComp(${J(a)}),b=fromComp(${J(b)}),L=${R(len)},d=length(a,b),m=div(add(a,b),2),u=d>0.01?div(sub(b,a),d):[0,1],n=[-u[1],u[0]],k=Math.sqrt(Math.max(0,L*L/4-d*d/4))*${side},c=add(m,mul(n,k)),t=div(sub(b,a),4);createPath([a,c,b],[[0,0],mul(t,-1),[0,0]],[[0,0],t,[0,0]],false)` } });
  const at = (name, shape, expr, extra) => Object.assign({ type: 'shape', name: N + ' ' + name, shape, expressions: Object.assign({ position: S + expr }, (extra && extra.expressions) || {}) }, extra && extra.rest);
  const head = `add(${J('Neck')},[${R(14)},${R(-108)}])`;
  const layers = [
    // front (right) side on top
    at('Hand R', { kind: 'ellipse', size: [R(46), R(46)], fill: col.skin }, J('Hand R') + ''),
    limb('Arm R', 'Shoulder R', 'Hand R', 290, 1, col.shirt, 34),
    at('Head', { kind: 'ellipse', size: [R(190), R(190)], fill: col.skin }, head, { expressions: { rotation: S + 'Math.sin(time*1.3)*2+W*Math.sin(ph*2)*1.5+S("Look")*8' } }),
    at('Hair', { kind: 'path', path: 'M -100 10 C -100 -60 -55 -100 0 -100 C 60 -100 100 -60 100 10 C 70 -20 20 -35 -40 -25 C -70 -20 -90 -5 -100 10 Z', size: [R(205), R(115)], fill: col.hair }, `add(${head},[0,${R(-58)}])`),
    at('Eye 1', { kind: 'ellipse', size: [R(17), R(24)], fill: col.eyes }, `add(${head},[${R(28)}+S("Look")*${R(12)},${R(-6)}])`, { expressions: { scale: S + 'var t=(time+0.4)%3.4;[100,(t<0.12&&S("Blink")>0)?8:100]' } }),
    at('Eye 2', { kind: 'ellipse', size: [R(17), R(24)], fill: col.eyes }, `add(${head},[${R(66)}+S("Look")*${R(12)},${R(-6)}])`, { expressions: { scale: S + 'var t=(time+0.4)%3.4;[100,(t<0.12&&S("Blink")>0)?8:100]' } }),
    at('Mouth', { kind: 'ellipse', size: [R(44), R(14)], fill: '#7c2d12' }, `add(${head},[${R(48)},${R(46)}])`, { expressions: { scale: S + 'var o=Math.max(S("Mouth"),S("Talk")*(45+Math.sin(time*17)*45));[100,18+o*1.7]' } }),
    at('Body', { kind: 'rect', size: [R(150), R(290)], round: R(60), fill: col.shirt }, `div(add(${J('Neck')},${J('Hip')}),2)`, { expressions: { rotation: S + 'W*6' } }),
    at('Pants', { kind: 'rect', size: [R(150), R(80)], round: R(30), fill: col.pants }, `add(${J('Hip')},[0,${R(-10)}])`, { expressions: { rotation: S + 'W*4' } }),
    at('Shoe R', { kind: 'rect', size: [R(88), R(36)], round: R(18), fill: col.shoes }, `add(${J('Foot R')},[${R(22)},0])`),
    limb('Leg R', 'Hip R', 'Foot R', 380, -1, col.pants, 40),
    at('Shoe L', { kind: 'rect', size: [R(88), R(36)], round: R(18), fill: col.shoes }, `add(${J('Foot L')},[${R(22)},0])`),
    limb('Leg L', 'Hip L', 'Foot L', 380, -1, col.pants, 40),
    limb('Arm L', 'Shoulder L', 'Hand L', 290, 1, col.shirt, 34),
    at('Hand L', { kind: 'ellipse', size: [R(46), R(46)], fill: col.skin }, J('Hand L') + ''),
    // the rig (invisible): joints follow the root and the sliders
    joint('Hand R', hand('Shoulder R', '-', true)),
    joint('Hand L', hand('Shoulder L', '+', false)),
    joint('Foot R', foot('Hip R', 'Math.PI')),
    joint('Foot L', foot('Hip L', '0')),
    joint('Shoulder R', `add(${J('Neck')},[${R(30)},${R(35)}])`),
    joint('Shoulder L', `add(${J('Neck')},[${R(-30)},${R(35)}])`),
    joint('Hip R', `add(${J('Hip')},[${R(22)},0])`),
    joint('Hip L', `add(${J('Hip')},[${R(-22)},0])`),
    joint('Neck', `add(${J('Hip')},[W*${R(10)},${R(-265)}+Math.sin(time*2)*S("Breath")*${k.toFixed(3)}])`),
    joint('Hip', `add(${J('Root')},[0,${R(-378)}-W*Math.abs(Math.sin(ph))*S("Bob")*${k.toFixed(3)}-S("Jump")*Math.abs(Math.sin(time*2.6))*${R(160)}])`),
    { type: 'null', name: N + ' Root', transform: { position: pos }, keys: L.walkAcross ? { position: [[0, [comp.width * -0.1, pos[1]], 'linear'], [comp.duration || 8, [comp.width * 1.1, pos[1]]]] } : {} },
    { type: 'null', name: N + ' Ctrl', transform: { position: [pos[0], pos[1] - R(1250)] }, effects: Object.keys(sl).map(n => ({ name: 'slider', label: n, params: { value: sl[n] } })) }
  ];
  return layers;
}

/* ---------------- auto-rig the user's own layers ---------------- */
const ROLES = [
  ['hand', /hand|palm|fist|ايد|إيد|\bيد\b|كف/i], ['forearm', /fore.?arm|lower.{0,5}arm|arm.{0,5}lower|elbow|ساعد|كوع/i], ['upperArm', /upper.{0,5}arm|arm.{0,5}upper|\barm\b|ذراع|دراع|كتف/i],
  ['foot', /foot|feet|shoe|boot|قدم|جزمة|كوتشي/i], ['shin', /shin|calf|knee|lower.{0,5}leg|leg.{0,5}lower|ساق|سمانة|ركبة/i], ['thigh', /thigh|upper.{0,5}leg|leg.{0,5}upper|\bleg\b|فخذ|فخد|رجل/i],
  ['eye', /eye|عين/i], ['mouth', /mouth|lips?|بق|فم|شفايف/i], ['head', /head|face|راس|رأس|دماغ|وش/i], ['hips', /hip|pelvis|waist|حوض|وسط/i], ['body', /body|torso|chest|trunk|جسم|صدر|بطن|جذع/i]
];
const PARENT = { hand: 'forearm', forearm: 'upperArm', upperArm: 'body', foot: 'shin', shin: 'thigh', thigh: 'hips', eye: 'head', mouth: 'head', head: 'body', body: 'hips', hips: null };
function sideOf(name) {
  if (/(^|[\s_.\-(])(l|left|lt)([\s_.\-)]|$)|شمال|يسار|يسرى/i.test(name)) return 'L';
  if (/(^|[\s_.\-(])(r|right|rt)([\s_.\-)]|$)|يمين|يمنى/i.test(name)) return 'R';
  return null;
}
/** 2D layer transform helpers (no parents yet — a fresh PSD / AI import) */
function toComp(p, X) { const a = X.anchor, s = X.scale, r = (X.rotation || 0) * Math.PI / 180, x = (p[0] - a[0]) * s[0] / 100, y = (p[1] - a[1]) * s[1] / 100; return [X.position[0] + x * Math.cos(r) - y * Math.sin(r), X.position[1] + x * Math.sin(r) + y * Math.cos(r)]; }
function fromComp(p, X) { const a = X.anchor, s = X.scale, r = -(X.rotation || 0) * Math.PI / 180, x = p[0] - X.position[0], y = p[1] - X.position[1]; return [(x * Math.cos(r) - y * Math.sin(r)) * 100 / s[0] + a[0], (x * Math.sin(r) + y * Math.cos(r)) * 100 / s[1] + a[1]]; }

/**
 * Layers from AE ({name, rect (layer space), anchor, position, scale, rotation}) → the rig plan:
 * roles, parents, anchors at the joints (with the position that keeps the layer in place), expressions, IK nulls.
 */
function rigPlan(layers, { ik = false, prefix = 'EF' } = {}) {
  const parts = [];
  for (const L of layers) {
    const role = (ROLES.find(r => r[1].test(L.name)) || [])[0];
    if (!role) continue;
    const rc = L.rect, corners = [[rc.left, rc.top], [rc.left + rc.width, rc.top], [rc.left, rc.top + rc.height], [rc.left + rc.width, rc.top + rc.height]].map(p => toComp(p, L));
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    parts.push({ L, role, side: sideOf(L.name), box, centre: [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2] });
  }
  if (!parts.length) throw new Error('مالقيتش ليرز بأسامي زي head / body / arm / leg (أو راس، جسم، دراع، رجل)');
  const body = parts.find(p => p.role === 'body') || parts.find(p => p.role === 'hips') || parts.find(p => p.role === 'head');
  for (const p of parts) if (!p.side && /Arm|forearm|hand|thigh|shin|foot/i.test(p.role)) p.side = p.centre[0] < body.centre[0] ? 'L' : 'R';
  const find = (role, side) => parts.find(p => p.role === role && (!side || p.side === side)) || null;
  const parentOf = p => {
    let r = PARENT[p.role];
    while (r) { const q = find(r, /Arm|forearm|hand|thigh|shin|foot/.test(r) ? p.side : null); if (q && q !== p) return q; r = PARENT[r]; }
    return p === body ? null : (body !== p ? body : null);
  };
  // joint = where the part meets its parent: the end of its box nearest the parent's centre (top / bottom / sides)
  const jointOf = (p, par) => {
    const b = p.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (!par) return p.role === 'hips' || p.role === 'body' ? [cx, b.y1 - (b.y1 - b.y0) * 0.1] : [cx, cy];
    if (p.role === 'eye' || p.role === 'mouth') return [cx, cy];
    if (p.role === 'head') return [cx, b.y1 - (b.y1 - b.y0) * 0.08];
    if (p.role === 'body') return [cx, b.y1 - (b.y1 - b.y0) * 0.1];
    const ends = endsOf(b);
    // upper arm / thigh: the shoulder / hip end — the top when the part hangs down, else the end towards the body
    if (p.role === 'upperArm' || p.role === 'thigh') {
      if (b.y1 - b.y0 >= (b.x1 - b.x0) * 0.8) return ends[0];
      return ends.slice(2).sort((u, v) => Math.abs(u[0] - body.centre[0]) - Math.abs(v[0] - body.centre[0]))[0];
    }
    // forearm / hand / shin / foot: the end nearest where the parent part ends (its far end from its own joint)
    const pe = endsOf(par.box).sort((u, v) => Math.hypot(v[0] - par.joint[0], v[1] - par.joint[1]) - Math.hypot(u[0] - par.joint[0], u[1] - par.joint[1]))[0];
    return ends.sort((u, v) => Math.hypot(u[0] - pe[0], u[1] - pe[1]) - Math.hypot(v[0] - pe[0], v[1] - pe[1]))[0];
  };
  function endsOf(b) { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return [[cx, b.y0 + (b.y1 - b.y0) * 0.06], [cx, b.y1 - (b.y1 - b.y0) * 0.06], [b.x0 + (b.x1 - b.x0) * 0.06, cy], [b.x1 - (b.x1 - b.x0) * 0.06, cy]]; }
  // parents first, so a child's joint can look at its parent's
  const order = [];
  const visit = p => { if (order.includes(p)) return; const par = parentOf(p); if (par) visit(par); order.push(p); };
  parts.forEach(visit);
  for (const p of order) { p.parent = parentOf(p); p.joint = jointOf(p, p.parent); }
  const ctrl = prefix + ' Character';
  const S = 'var C=thisComp.layer(' + JSON.stringify(ctrl) + ');function S(n){return C.effect(n)("Slider");}var W=S("Walk"),ph=time*S("Speed")*Math.PI;';
  const plan = { ctrl: { name: ctrl, position: [body.centre[0], body.box.y0 - 120], sliders: { Walk: 0, Speed: 1.1, 'Arm Swing': 30, Stride: 25, Bob: 10, Breath: 2, Blink: 1, Talk: 0, Mouth: 0, Look: 0 } }, layers: [], ik: [] };
  const sgn = p => (p.side === 'R' ? -1 : 1);
  for (const p of order) {
    const X = p.L, anchor = fromComp(p.joint, X);
    // keep the layer where it is: position moves by the anchor shift (in comp space it is exactly the joint)
    const e = {};
    if (p.role === 'upperArm') e.rotation = S + `value+${sgn(p)}*W*Math.sin(ph)*S("Arm Swing")+Math.sin(time*1.2)*2`;
    if (p.role === 'forearm') e.rotation = S + `value-W*Math.max(0,${sgn(p)}*Math.sin(ph+0.5))*S("Arm Swing")*0.7`;
    if (p.role === 'thigh') e.rotation = S + `value-${sgn(p)}*W*Math.sin(ph)*S("Stride")`;
    if (p.role === 'shin') e.rotation = S + `value+W*Math.max(0,-${sgn(p)}*Math.sin(ph+0.4))*S("Stride")*1.4`;
    if (p.role === 'foot') e.rotation = S + `value+W*Math.sin(ph${p.side === 'R' ? '+Math.PI' : ''})*S("Stride")*0.3`;
    if (p === body) { e.position = S + `sub(value,[0,W*Math.abs(Math.sin(ph))*S("Bob")])`; e.scale = S + `add(value,[0,Math.sin(time*2)*S("Breath")])`; }
    if (p.role === 'head') e.rotation = S + `value+Math.sin(time*1.3)*1.5+W*Math.sin(ph*2)*1.5+S("Look")*6`;
    if (p.role === 'eye') e.scale = S + `var t=(time+0.4)%3.4;[value[0],(t<0.12&&S("Blink")>0)?value[1]*0.08:value[1]]`;
    if (p.role === 'mouth') e.scale = S + `var o=Math.max(S("Mouth"),S("Talk")*(45+Math.sin(time*17)*45));[value[0],value[1]*(0.35+o/100*1.1)]`;
    plan.layers.push({ name: X.name, role: p.role, side: p.side, parent: p.parent ? p.parent.L.name : null, anchor, position: p.joint, expressions: e });
  }
  if (ik) {
    // two-bone IK: upper / lower rotations aim the chain at a controller null at the end joint
    for (const [up, low, end, label] of [['upperArm', 'forearm', 'hand', 'Hand'], ['thigh', 'shin', 'foot', 'Foot']]) {
      for (const side of ['L', 'R']) {
        const U = order.find(p => p.role === up && p.side === side), D = order.find(p => p.role === low && p.side === side);
        if (!U || !D) continue;
        const E = order.find(p => p.role === end && p.side === side);
        const tip = E ? E.joint : (() => { const b = D.box, ends = [[(b.x0 + b.x1) / 2, b.y0], [(b.x0 + b.x1) / 2, b.y1], [b.x0, (b.y0 + b.y1) / 2], [b.x1, (b.y0 + b.y1) / 2]]; return ends.sort((u, v) => Math.hypot(v[0] - D.joint[0], v[1] - D.joint[1]) - Math.hypot(u[0] - D.joint[0], u[1] - D.joint[1]))[0]; })();
        const tipLocal = fromComp(tip, D.L), nm = prefix + ' IK ' + label + ' ' + side;
        const sign = up === 'thigh' ? -1 : 1;
        const common = `var U=thisComp.layer(${JSON.stringify(U.L.name)}),D=thisComp.layer(${JSON.stringify(D.L.name)}),T=thisComp.layer(${JSON.stringify(nm)});var A=U.hasParent?U.parent.toComp(U.position):U.position,P=T.toComp(T.anchorPoint),v1=sub(D.position,U.anchorPoint),v2=sub([${tipLocal.map(v => v.toFixed(2))}],D.anchorPoint);var l1=length(v1)*U.scale[0]/100,l2=length(v2)*U.scale[0]/100*D.scale[0]/100,d=Math.max(0.01,Math.min(length(A,P),l1+l2-0.01));`;
        plan.ik.push({ name: nm, position: tip });
        const ul = plan.layers.find(l => l.name === U.L.name), dl = plan.layers.find(l => l.name === D.L.name);
        ul.expressions.rotation = common + `var a=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1)),base=Math.atan2(P[1]-A[1],P[0]-A[0]),pr=0;if(U.hasParent){var o=U.parent.toComp([0,0]),x=U.parent.toComp([100,0]);pr=Math.atan2(x[1]-o[1],x[0]-o[0]);}radiansToDegrees(base-(${sign})*a-Math.atan2(v1[1],v1[0])-pr)`;
        dl.expressions.rotation = common + `var g=Math.acos(clamp((l1*l1+l2*l2-d*d)/(2*l1*l2),-1,1));radiansToDegrees((${sign})*(Math.PI-g)+Math.atan2(v1[1],v1[0])-Math.atan2(v2[1],v2[0]))`;
      }
    }
  }
  return plan;
}

/* ---------------- lip sync: loudness per frame → 0…100 ---------------- */
function mouthCurve(samples, rate, fps, { floor = 8, attack = 0.6, release = 0.25 } = {}) {
  const hop = Math.max(1, Math.round(rate / fps)), env = [];
  for (let i = 0; i + hop <= samples.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += samples[j] * samples[j]; env.push(Math.sqrt(s / hop)); }
  const sorted = env.slice().sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.95)] || 1e-6;
  const out = []; let v = 0;
  for (const e of env) {
    let t = Math.min(100, e / top * 100);
    if (t < floor) t = 0;
    v += (t > v ? attack : release) * (t - v);
    if (!t && v < 6) v = 0; // the mouth closes in silence
    out.push(Math.round(v));
  }
  return out;
}

module.exports = { ACTIONS, SLIDERS, flatCharacter, rigPlan, mouthCurve, ROLES, sideOf, toComp, fromComp };

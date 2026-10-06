import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from 'remotion';
import { useExit, dirOf, hexA, Media, GradText } from '../theme.jsx';

const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reflect = (on) => (on ? { WebkitBoxReflect: 'below 6px linear-gradient(transparent 62%, rgba(255,255,255,0.32))' } : {});

const Card = ({ th, item, w, h, rounded, glow, light = 1, children, reflection, style }) => (
  <div style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: rounded, overflow: 'hidden', background: '#111',
    boxShadow: glow ? `0 0 ${w * 0.18}px ${hexA(th.primary, 0.55)}, 0 ${w * 0.08}px ${w * 0.2}px rgba(0,0,0,.5)` : `0 ${w * 0.08}px ${w * 0.2}px rgba(0,0,0,.5)`,
    border: '2px solid rgba(255,255,255,0.18)', filter: `brightness(${light})`, backfaceVisibility: 'hidden', ...reflect(reflection), ...style }}>
    <Media item={item} th={th} />
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.22), transparent 38%)', pointerEvents: 'none' }} />
    {children}
  </div>
);
// the back of a card (seen through the ring): dark glass instead of a mirrored picture
const CardBack = ({ th, w, h, rounded }) => (
  <div style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: rounded, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden',
    background: `linear-gradient(145deg, ${hexA(th.primary, 0.35)}, rgba(10,10,16,0.85))`, border: '2px solid rgba(255,255,255,0.12)' }} />
);

/**
 * 3D carousel of 2–10 photos/videos.
 * layout: ring (spinning cylinder) | coverflow (one item at a time in front) | helix (rising spiral) | stack (deck that flips through)
 */
export const Carousel3D = ({ th, dur, media = [], layout = 'ring', speed = 1, direction = 'left', tilt = 10, radius = 1, cardSize = 1, aspect = '4:5', reflection = true, glow = true, rounded = 26, title = '' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 14);
  const items = (Array.isArray(media) && media.length ? media : ['1', '2', '3', '4', '5', '6']).slice(0, 10);
  const n = items.length;
  const ar = ASPECTS[aspect] || 0.8;
  const base = Math.min(width, height) * 0.5 * clamp(cardSize, 0.4, 1.8);
  const cw = ar >= 1 ? base * 1.45 : base * ar * 1.25, ch = cw / ar;
  const dir = direction === 'right' ? -1 : 1;
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 70 } });
  const t = frame / fps;
  const persp = Math.max(width, height) * 1.6;

  let cards;
  if (layout === 'coverflow' || layout === 'stack') {
    // walk through the items: hold on each, glide to the next
    const per = Math.max(0.6, (dur / fps) / Math.max(1, n - 0.6)) / clamp(speed, 0.2, 4);
    const raw = t / per; const k = Math.floor(raw), f = raw - k;
    const pos = Math.min(n - 1, k + Easing.inOut(Easing.cubic)(clamp((f - 0.35) / 0.65, 0, 1)));
    cards = items.map((it, i) => {
      const d = (i - pos) * dir;
      if (layout === 'stack') {
        const gone = clamp(-d, 0, 1);
        const behind = Math.max(0, d);
        const tr = `translate3d(${gone * -cw * 1.6 * dir}px, ${behind * -ch * 0.06 + gone * -ch * 0.1}px, ${-behind * cw * 0.28 + gone * cw * 0.3}px) rotateY(${gone * -50 * dir}deg) rotateZ(${behind * 3 * (i % 2 ? 1 : -1) + gone * -14 * dir}deg)`;
        return { i, z: gone > 0 ? 1 + gone : -behind, tr, light: 1 - Math.min(0.5, behind * 0.18), op: 1 - clamp((gone - 0.55) / 0.45, 0, 1) };
      }
      const ad = Math.abs(d), sgn = Math.sign(d);
      const x = sgn * (Math.min(ad, 1) * cw * 0.72 + Math.max(0, ad - 1) * cw * 0.34);
      const tr = `translate3d(${x}px, 0, ${-Math.min(ad, 1) * cw * 0.55 - Math.max(0, ad - 1) * cw * 0.12}px) rotateY(${-sgn * Math.min(ad, 1) * 58}deg)`;
      return { i, z: -ad, tr, light: 1 - Math.min(0.55, ad * 0.28), op: ad > 3.2 ? 0 : 1 };
    });
    return (
      <div style={{ position: 'absolute', inset: 0, perspective: persp, opacity: exit }}>
        <div style={{ position: 'absolute', left: '50%', top: title ? '46%' : '50%', transformStyle: 'preserve-3d', transform: `translateZ(${(1 - intro) * -cw * 2}px) rotateX(${-tilt * 0.4}deg)` }}>
          {cards.sort((a, b) => a.z - b.z).map(c => (
            <div key={c.i} style={{ position: 'absolute', transformStyle: 'preserve-3d', transform: c.tr, opacity: c.op * Math.min(1, intro * 1.4) }}>
              <Card th={th} item={items[c.i]} w={cw} h={ch} rounded={rounded} glow={glow && c.z > -0.5} light={c.light} reflection={reflection && layout !== 'stack'} />
            </div>
          ))}
        </div>
        {title ? <CarouselTitle th={th} text={title} frame={frame} height={height} /> : null}
      </div>
    );
  }

  // ring / helix: a spinning cylinder of cards
  const step = 360 / n;
  const R = Math.max(cw * 0.75, (cw * 1.18 * n) / (2 * Math.PI)) * clamp(radius, 0.5, 2);
  const deg = (t * 32 * clamp(speed, 0, 4) + (1 - intro) * 90) * dir;
  const helix = layout === 'helix';
  const rise = helix ? ch * 0.2 : 0;
  const camY = helix ? interpolate(frame, [0, dur], [-(n - 1) * rise * 0.5, (n - 1) * rise * 0.5]) : 0;
  cards = items.map((it, i) => {
    const a = i * step - deg;
    const facing = Math.cos((a * Math.PI) / 180);
    const y = helix ? (i - (n - 1) / 2) * rise : 0;
    return { i, facing, tr: `translateY(${y}px) rotateY(${i * step}deg) translateZ(${R}px)` };
  });
  const scale = Math.min(1, (width * 1.05) / (R * 2 + cw)) * (0.75 + 0.25 * intro) * (title ? 0.86 : 1);
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: persp, opacity: exit }}>
      <div style={{ position: 'absolute', left: '50%', top: '72%', width: R * 2.6 * scale, height: R * 0.5 * scale, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(closest-side, ${hexA(th.primary, 0.35)}, transparent)`, filter: 'blur(10px)', opacity: intro }} />
      <div style={{ position: 'absolute', left: '50%', top: title ? '41%' : '48%', transformStyle: 'preserve-3d', transform: `scale(${scale}) translateY(${-camY}px) translateZ(${-R}px) rotateX(${-tilt}deg) rotateY(${-deg}deg)` }}>
        {cards.map(c => (
          <div key={c.i} style={{ position: 'absolute', transformStyle: 'preserve-3d', transform: c.tr }}>
            <Card th={th} item={items[c.i]} w={cw} h={ch} rounded={rounded} glow={glow && c.facing > 0.85} light={0.4 + 0.6 * ((c.facing + 1) / 2)} reflection={reflection && !helix} />
            <CardBack th={th} w={cw} h={ch} rounded={rounded} />
          </div>
        ))}
      </div>
      {title ? <CarouselTitle th={th} text={title} frame={frame} height={height} /> : null}
    </div>
  );
};

const CarouselTitle = ({ th, text, frame, height }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: '7%', textAlign: 'center', fontFamily: th.fontStack, fontWeight: 900, fontSize: height * 0.065, direction: dirOf(text),
    opacity: interpolate(frame, [12, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), transform: `translateY(${interpolate(frame, [12, 26], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`, filter: `drop-shadow(0 6px 24px ${hexA(th.primary, 0.7)})` }}>
    <GradText th={th}>{text}</GradText>
  </div>
);

/** One photo/video on a glossy card that flips in and floats in 3D. */
export const Card3D = ({ th, dur, media = [], title = '', subtitle = '', aspect = '16:9' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 14);
  const ar = ASPECTS[aspect] || 16 / 9;
  const w = Math.min(width * 0.62, height * 0.62 * ar), h = w / ar;
  const s = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const ry = (1 - s) * -80 + Math.sin(frame / 34) * 9, rx = 8 + Math.cos(frame / 41) * 5;
  const sheen = interpolate(frame % 90, [0, 90], [-60, 160]);
  const item = Array.isArray(media) ? media[0] : media;
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: width * 1.4, opacity: exit }}>
      <div style={{ position: 'absolute', left: '50%', top: title ? '44%' : '50%', transformStyle: 'preserve-3d', transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${0.7 + 0.3 * s})` }}>
        <Card th={th} item={item} w={w} h={h} rounded={28} glow reflection>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${sheen - 20}%, rgba(255,255,255,0.28) ${sheen}%, transparent ${sheen + 20}%)` }} />
        </Card>
      </div>
      {title ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '8%', textAlign: 'center', direction: dirOf(title), opacity: interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: height * 0.065, color: th.text, textShadow: `0 6px 30px ${hexA(th.primary, 0.8)}` }}>{title}</div>
          {subtitle ? <div style={{ fontFamily: th.fontStack, fontWeight: 600, fontSize: height * 0.03, color: hexA(th.text, 0.8) }}>{subtitle}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

/** Rotating cube: each face shows a word (or a photo); it tumbles from one face to the next. */
export const Cube3D = ({ th, dur, words: faces = ['سريع', 'سهل', 'ذكي', 'احترافي'], media = [], prefix = '' }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12);
  const list = (Array.isArray(media) && media.length ? media : faces).slice(0, 4);
  const n = Math.max(2, list.length);
  const s = height * 0.28;
  const per = dur / n;
  const k = Math.floor(frame / per), f = (frame % per) / per;
  const turn = k + Easing.inOut(Easing.back(1.6))(clamp((f - 0.6) / 0.4, 0, 1));
  const ang = Math.min(turn, n - 1) * 90;
  const isMedia = Array.isArray(media) && media.length;
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const pw = prefix ? s * 0.9 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.25, direction: dirOf(prefix || String(list[0] || '')), opacity: exit, transform: `scale(${pop})` }}>
      {prefix ? <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: s * 0.42, color: th.text, whiteSpace: 'nowrap' }}>{prefix}</div> : null}
      <div style={{ width: isMedia ? s * 1.6 : s * 2.4, height: s, perspective: s * 4 + pw }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `translateZ(${-s / 2}px) rotateX(${-ang}deg)` }}>
          {list.map((x, i) => (
            <div key={i} style={{ position: 'absolute', inset: 0, transform: `rotateX(${i * 90}deg) translateZ(${s / 2}px)`, backfaceVisibility: 'hidden', borderRadius: 18, overflow: 'hidden',
              background: `linear-gradient(135deg, ${i % 2 ? th.secondary : th.primary}, ${i % 2 ? th.primary : th.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `inset 0 2px 0 rgba(255,255,255,.4), 0 0 40px ${hexA(th.primary, 0.5)}`, border: '2px solid rgba(255,255,255,.25)' }}>
              {isMedia ? <Media item={x} th={th} /> : <span style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: s * 0.5, color: '#fff', direction: dirOf(x), textShadow: '0 4px 14px rgba(0,0,0,.35)' }}>{x}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Extruded 3D text that swings slowly. */
export const Text3D = ({ th, dur, text = 'ثري دي', depth = 14, color, size = 1 }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12);
  const s = spring({ frame, fps, config: { damping: 13, stiffness: 90 } });
  const fs = height * 0.17 * size;
  const ry = (1 - s) * 70 + Math.sin(frame / 30) * 18, rx = 12 + Math.cos(frame / 37) * 6;
  const face = color || th.text;
  const layers = Math.round(clamp(depth, 4, 30));
  const common = { position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, lineHeight: 1.2, direction: dirOf(text) };
  return (
    <div style={{ perspective: fs * 8, opacity: exit }}>
      <div style={{ position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${0.5 + 0.5 * s})` }}>
        <div style={{ ...common, position: 'relative', visibility: 'hidden' }}>{text}</div>
        {Array.from({ length: layers }, (_, i) => (
          <div key={i} style={{ ...common, color: i === layers - 1 ? th.primary : `color-mix(in srgb, ${th.primary} ${40 + (i / layers) * 40}%, #000)`, transform: `translateZ(${-(layers - i) * fs * 0.022}px)` }}>{text}</div>
        ))}
        <div style={{ ...common, transform: 'translateZ(1px)' }}><GradText th={th} colors={[face, th.accent, face]}>{text}</GradText></div>
      </div>
    </div>
  );
};

/** Full-frame photo/video with a slow push (Ken Burns) and an optional 3D tilt — the base of style edits. */
export const MediaFull = ({ th, dur, media = [], zoom = 'in', tilt3d = false, frameStyle = 'none' }) => {
  const frame = useCurrentFrame(); const { width } = useVideoConfig();
  const item = Array.isArray(media) ? media[0] : media;
  const z = zoom === 'out' ? interpolate(frame, [0, dur], [1.18, 1.04]) : interpolate(frame, [0, dur], [1.04, 1.18]);
  const inset = frameStyle === 'none' ? 0 : width * 0.05;
  const ry = tilt3d ? interpolate(frame, [0, dur], [-14, 14]) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: width * 1.2 }}>
      <div style={{ position: 'absolute', inset, overflow: 'hidden', borderRadius: frameStyle === 'rounded' ? 34 : 0, transform: `rotateY(${ry}deg)`, background: frameStyle === 'paper' ? '#FFFDF7' : 'transparent', padding: frameStyle === 'paper' ? inset * 0.25 : 0,
        boxShadow: frameStyle === 'none' ? 'none' : '0 30px 80px -20px rgba(0,0,0,.6)' }}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}><div style={{ width: '100%', height: '100%', transform: `scale(${z})` }}><Media item={item} th={th} /></div></div>
      </div>
    </div>
  );
};


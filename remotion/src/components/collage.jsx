import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { useExit, dirOf, hexA, Media, rnd, words } from '../theme.jsx';

const PAPERS = ['#FFFDF7', '#F7E9C9', '#1C1C1C', '#E63946', '#FFD166', '#118AB2', '#F4A6B7'];
const inkOn = (bg) => (['#1C1C1C', '#E63946', '#118AB2'].includes(bg) ? '#FFFDF7' : '#1C1C1C');

/** torn-paper edge: a jagged polygon around a box */
function torn(seed, j = 2.2) {
  const pts = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) pts.push(`${(i / steps) * 100}% ${rnd(seed + 't' + i, 0, j)}%`);
  for (let i = 0; i <= steps; i++) pts.push(`${100 - rnd(seed + 'r' + i, 0, j)}% ${(i / steps) * 100}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${(i / steps) * 100}% ${100 - rnd(seed + 'b' + i, 0, j)}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${rnd(seed + 'l' + i, 0, j)}% ${(i / steps) * 100}%`);
  return `polygon(${pts.join(',')})`;
}

const Tape = ({ seed, w, angle = 0, style }) => (
  <div style={{ position: 'absolute', width: w, height: w * 0.32, background: 'rgba(240,228,190,0.78)', boxShadow: '0 2px 6px rgba(0,0,0,.18)', transform: `rotate(${angle}deg)`,
    clipPath: 'polygon(3% 0,97% 4%,100% 30%,96% 55%,100% 100%,2% 96%,0 70%,4% 40%)', mixBlendMode: 'multiply', ...style }} />
);

/** Ransom-note / cut-out title: every word (Latin: every letter) on its own scrap of paper. */
export const CutoutTitle = ({ th, dur, text = 'كولاج آرت', size = 1, seed = 'c' }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12); const fs = height * 0.085 * size;
  const rtl = dirOf(text) === 'rtl';
  const chunks = rtl ? words(text) : String(text).split('').map(c => (c === ' ' ? null : c));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: fs * (rtl ? 0.18 : 0.06), direction: rtl ? 'rtl' : 'ltr', maxWidth: height * 1.5, opacity: exit }}>
      {chunks.map((c, i) => {
        if (c === null) return <div key={i} style={{ width: fs * 0.3 }} />;
        const bg = PAPERS[Math.floor(rnd(seed + i, 0, PAPERS.length))];
        const s = spring({ frame: frame - i * 3, fps, config: { damping: 9, stiffness: 160, mass: 0.6 } });
        const rot = rnd(seed + 'a' + i, -7, 7);
        return (
          <div key={i} style={{ position: 'relative', background: bg, color: inkOn(bg), fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * rnd(seed + 's' + i, 0.88, 1.12), lineHeight: 1.15,
            padding: `${fs * 0.06}px ${fs * 0.22}px ${fs * 0.12}px`, clipPath: torn(seed + i, 3), transform: `rotate(${rot}deg) scale(${s}) translateY(${(1 - s) * -40}px)`,
            filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.28))', textTransform: rtl ? 'none' : (i % 3 ? 'uppercase' : 'none') }}>{c}</div>
        );
      })}
    </div>
  );
};

/** Hand-drawn doodle that draws itself: circle, underline, arrow, star, heart, zigzag, burst. */
const DOODLES = {
  circle: 'M50 8 C80 6 96 26 94 50 C92 78 66 94 44 92 C18 90 4 70 6 46 C8 22 30 8 58 12',
  underline: 'M4 60 C28 52 52 66 96 54 M10 72 C40 64 70 74 92 66',
  arrow: 'M8 80 C30 60 52 40 86 22 M86 22 L64 22 M86 22 L80 44',
  star: 'M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z',
  heart: 'M50 88 C20 66 4 46 12 28 C20 10 42 12 50 30 C58 12 80 10 88 28 C96 46 80 66 50 88 Z',
  zigzag: 'M4 50 L16 34 L28 64 L40 34 L52 64 L64 34 L76 64 L88 34 L96 50',
  burst: 'M50 4 L50 26 M50 74 L50 96 M4 50 L26 50 M74 50 L96 50 M18 18 L34 34 M66 66 L82 82 M82 18 L66 34 M34 66 L18 82'
};
export const Scribble = ({ th, dur, kind = 'circle', color, size = 1, text = '', delay = 0 }) => {
  const frame = useCurrentFrame(); const { height } = useVideoConfig();
  const exit = useExit(dur, 10);
  const p = interpolate(frame - delay, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const s = height * 0.32 * size; const col = color || th.accent;
  const d = DOODLES[kind] || DOODLES.circle;
  return (
    <div style={{ position: 'relative', width: s, height: s, opacity: exit }}>
      <svg viewBox="0 0 100 100" width={s} height={s} style={{ overflow: 'visible', filter: `drop-shadow(0 3px 0 ${hexA('#000000', 0.18)})` }}>
        {[0, 1].map(k => <path key={k} d={d} pathLength="1" fill="none" stroke={col} strokeWidth={k ? 2.2 : 4.2} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="1" strokeDashoffset={1 - Math.min(1, p * (k ? 0.92 : 1))} transform={k ? 'translate(1.5 -1.2) rotate(1.5 50 50)' : undefined} opacity={k ? 0.8 : 1} />)}
      </svg>
      {text ? <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(-4deg) scale(${interpolate(p, [0.5, 1], [0.6, 1], { extrapolateLeft: 'clamp' })})`, opacity: interpolate(p, [0.4, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        fontFamily: th.fontStack, fontWeight: 900, fontSize: s * 0.2, color: col, whiteSpace: 'nowrap', direction: dirOf(text) }}>{text}</div> : null}
    </div>
  );
};

/** A single photo/video as a polaroid with a caption, dropped onto the table. */
export const Polaroid = ({ th, dur, media = [], caption = '', tilt = -4, size = 1 }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12); const w = height * 0.62 * Math.max(0.3, Math.min(1.4, size));
  const s = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
  const item = Array.isArray(media) ? media[0] : media;
  const zoom = interpolate(frame, [0, dur], [1.04, 1.14]);
  return (
    <div style={{ position: 'relative', width: w, padding: `${w * 0.05}px ${w * 0.05}px ${w * 0.2}px`, background: '#FFFDF7', boxShadow: '0 30px 60px -18px rgba(0,0,0,.55)',
      transform: `rotate(${tilt + (1 - s) * 14}deg) scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * -height * 0.4}px)`, opacity: Math.min(1, s * 2) * exit }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#222' }}>
        <div style={{ width: '100%', height: '100%', transform: `scale(${zoom})` }}><Media item={item} th={th} /></div>
      </div>
      {caption ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: w * 0.045, textAlign: 'center', fontFamily: th.fontStack, fontWeight: 800, fontSize: w * 0.075, color: '#1C1C1C', direction: dirOf(caption) }}>{caption}</div> : null}
      <Tape seed="p" w={w * 0.36} angle={-3} style={{ left: '32%', top: -w * 0.05 }} />
    </div>
  );
};

// where the photos land, per photo count (x, y in frame fractions, size, rotation)
const SLOTS = {
  1: [[0.5, 0.46, 0.62, -3]],
  2: [[0.33, 0.45, 0.5, -6], [0.68, 0.5, 0.5, 5]],
  3: [[0.25, 0.42, 0.44, -7], [0.52, 0.52, 0.48, 3], [0.78, 0.4, 0.42, 8]],
  4: [[0.24, 0.32, 0.38, -6], [0.5, 0.56, 0.42, 4], [0.77, 0.34, 0.38, 7], [0.3, 0.72, 0.34, 9]],
  5: [[0.2, 0.3, 0.34, -8], [0.45, 0.5, 0.4, 3], [0.73, 0.3, 0.36, 6], [0.8, 0.68, 0.32, -5], [0.25, 0.7, 0.32, 7]],
  6: [[0.18, 0.28, 0.32, -7], [0.43, 0.3, 0.3, 5], [0.7, 0.26, 0.32, -4], [0.3, 0.66, 0.32, 6], [0.56, 0.62, 0.34, -6], [0.82, 0.64, 0.3, 8]]
};

/** Collage art: photos/frames as cut-outs with tape + a cut-out title + doodles, slow camera drift. */
export const Collage = ({ th, dur, media = [], title = '', subtitle = '', doodles = true, seed = 'k' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 12);
  const items = (Array.isArray(media) && media.length ? media : ['', '', '']).slice(0, 6);
  const slots = SLOTS[items.length] || SLOTS[3];
  const vertical = height > width;
  const cam = interpolate(frame, [0, dur], [1, 1.07]);
  const camR = interpolate(frame, [0, dur], [-0.6, 0.6]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `scale(${cam}) rotate(${camR}deg)`, opacity: exit }}>
      {items.map((m, i) => {
        const [x, y, sz, rot] = vertical ? [slots[i][1], slots[i][0] * 0.9 + 0.05, slots[i][2] * 1.5, slots[i][3]] : slots[i];
        const s = spring({ frame: frame - 4 - i * 6, fps, config: { damping: 12, stiffness: 140, mass: 0.7 } });
        const w = Math.min(width, height) * sz * (vertical ? 0.9 : 1.25);
        const bg = i % 3 === 1 ? '#F7E9C9' : '#FFFDF7';
        return (
          <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: w, transform: `translate(-50%,-50%) rotate(${rot + (1 - s) * rnd(seed + i, -25, 25)}deg) scale(${0.4 + 0.6 * s})`, opacity: Math.min(1, s * 2.2) }}>
            <div style={{ background: bg, padding: w * 0.035, clipPath: torn(seed + 'p' + i, 1.6), filter: 'drop-shadow(0 18px 18px rgba(0,0,0,.35))' }}>
              <div style={{ width: '100%', aspectRatio: i % 2 ? '4 / 5' : '4 / 3', overflow: 'hidden', background: '#333' }}>
                <div style={{ width: '100%', height: '100%', transform: `scale(${interpolate(frame, [0, dur], [1.02, 1.12])})`, filter: 'contrast(1.06) saturate(1.08)' }}><Media item={m} th={th} /></div>
              </div>
            </div>
            <Tape seed={seed + 'tp' + i} w={w * 0.32} angle={rnd(seed + 'ta' + i, -12, 12)} style={{ left: `${rnd(seed + 'tx' + i, 10, 55)}%`, top: -w * 0.06 }} />
          </div>
        );
      })}
      {doodles ? (
        <>
          <div style={{ position: 'absolute', left: vertical ? '70%' : '84%', top: vertical ? '8%' : '10%' }}><Scribble th={th} dur={dur} kind="star" size={0.42} color={th.accent} delay={18} /></div>
          <div style={{ position: 'absolute', left: vertical ? '6%' : '6%', top: vertical ? '74%' : '64%' }}><Scribble th={th} dur={dur} kind="arrow" size={0.5} color={th.primary} delay={24} /></div>
          <div style={{ position: 'absolute', left: vertical ? '10%' : '40%', top: vertical ? '4%' : '4%' }}><Scribble th={th} dur={dur} kind="zigzag" size={0.36} color={th.secondary} delay={30} /></div>
        </>
      ) : null}
      {title ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? '12%' : '7%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: height * 0.012 }}>
          <CutoutTitle th={th} dur={dur + 12} text={title} seed={seed + 'title'} size={vertical ? 0.8 : 1} />
          {subtitle ? <div style={{ background: '#1C1C1C', color: '#FFFDF7', fontFamily: th.fontStack, fontWeight: 800, fontSize: height * 0.03, padding: '4px 18px', transform: 'rotate(-1.5deg)', direction: dirOf(subtitle),
            opacity: interpolate(frame, [20, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{subtitle}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

import React from 'react';
import { staticFile, spring, interpolate, useCurrentFrame, useVideoConfig, Img, OffthreadVideo, random } from 'remotion';

export const FONT = 'EFCairo';
export const fontFaceCss = `
@font-face { font-family: ${FONT}; src: url('${staticFile('fonts/cairo-arabic-wght-normal.woff2')}') format('woff2'); font-weight: 200 1000; unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }
@font-face { font-family: ${FONT}; src: url('${staticFile('fonts/cairo-latin-wght-normal.woff2')}') format('woff2'); font-weight: 200 1000; }
`;

export const DEFAULT_THEME = { primary: '#8B5CF6', accent: '#FBBF24', text: '#FFFFFF', background: '#0B0A12', secondary: '#EC4899', font: FONT };

export function themeFrom(t) {
  const th = { ...DEFAULT_THEME, ...(t || {}) };
  if (!th.secondary) th.secondary = '#EC4899';
  th.fontStack = `${th.font && th.font !== FONT ? `"${th.font}", ` : ''}${FONT}, "Segoe UI", Arial, sans-serif`;
  return th;
}

export const isArabic = (s) => /[\u0600-\u06FF]/.test(String(s || ''));
export const dirOf = (s) => (isArabic(s) ? 'rtl' : 'ltr');

/** spring that starts at `delay` frames */
export function useSpring(delay = 0, config = { damping: 14, stiffness: 120, mass: 0.8 }, durationInFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config, durationInFrames });
}

/** 1 → 0 during the last `len` frames of the element (exit) */
export function useExit(dur, len = 12) {
  const frame = useCurrentFrame();
  return interpolate(frame, [dur - len, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export function hexA(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

/** Placement wrapper: where an element sits in the frame */
export const Place = ({ position = 'center', x, y, children, style }) => {
  const pos = {
    center: { alignItems: 'center', justifyContent: 'center' },
    top: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: '8%' },
    bottom: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '8%' },
    left: { alignItems: 'flex-start', justifyContent: 'center', paddingLeft: '7%' },
    right: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: '7%' },
    lowerThird: { alignItems: 'flex-start', justifyContent: 'flex-end', paddingLeft: '6%', paddingBottom: '9%' },
    lowerThirdRight: { alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: '6%', paddingBottom: '9%' },
    topLeft: { alignItems: 'flex-start', justifyContent: 'flex-start', padding: '6%' },
    topRight: { alignItems: 'flex-end', justifyContent: 'flex-start', padding: '6%' }
  }[position] || {};
  if (typeof x === 'number' || typeof y === 'number') {
    return <div style={{ position: 'absolute', left: `${(x ?? 0.5) * 100}%`, top: `${(y ?? 0.5) * 100}%`, transform: 'translate(-50%,-50%)', ...style }}>{children}</div>;
  }
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', ...pos, ...style }}>{children}</div>;
};

/** Frosted glass card used by many components */
export const Glass = ({ th, children, style, glow = true }) => (
  <div style={{
    position: 'relative', borderRadius: 34, padding: '34px 46px',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
    border: '1.5px solid rgba(255,255,255,0.22)',
    boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.65)${glow ? `, 0 0 90px -20px ${hexA(th.primary, 0.75)}` : ''}`,
    backdropFilter: 'blur(26px) saturate(170%)', WebkitBackdropFilter: 'blur(26px) saturate(170%)',
    ...style
  }}>{children}</div>
);

/** Gradient text */
export const GradText = ({ th, children, style, colors }) => (
  <span style={{
    background: `linear-gradient(100deg, ${(colors || [th.text, th.accent, th.secondary]).join(', ')})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', ...style
  }}>{children}</span>
);

/** Split text into words (keeps Arabic letters joined) */
export function words(text) { return String(text || '').split(/\s+/).filter(Boolean); }

/** A photo or video from the editor's disk (served by render.mjs), or a soft placeholder. */
export const Media = ({ item, style, fit = 'cover', startFrom = 0, th }) => {
  const box = { width: '100%', height: '100%', objectFit: fit, display: 'block', ...style };
  if (item && item.src && item.kind === 'video') return <OffthreadVideo src={item.src} muted startFrom={startFrom} style={box} />;
  if (item && item.src) return <Img src={item.src} style={box} />;
  const label = typeof item === 'string' ? item : '';
  const t = th || DEFAULT_THEME;
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${t.primary}, ${t.secondary || '#EC4899'} 60%, ${t.accent})`, color: '#fff', fontFamily: t.fontStack || FONT, fontWeight: 900, fontSize: 48, textAlign: 'center', direction: dirOf(label) }}>{label}</div>
  );
};

/** Deterministic pseudo-random in [a,b) */
export function rnd(seed, a = 0, b = 1) { return a + random(String(seed)) * (b - a); }

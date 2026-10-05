import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { useExit, dirOf, words, GradText, hexA, Glass } from '../theme.jsx';

/** Word-by-word kinetic headline. styles: rise | scale | blur | split | typewriter */
export const KineticTitle = ({ th, dur, text = 'عنوان قوي', subtitle, style = 'rise', highlight = [], size = 1 }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 14);
  const ws = words(text);
  const fs = Math.round(height * 0.125 * size * (ws.join(' ').length > 30 ? 0.78 : 1));
  const hl = new Set((highlight || []).map(String));
  const typed = style === 'typewriter' ? Math.floor(interpolate(frame, [0, Math.max(10, text.length * 2)], [0, text.length], { extrapolateRight: 'clamp' })) : null;
  const subIn = spring({ frame: frame - ws.length * 4 - 8, fps, config: { damping: 18 } });
  return (
    <div style={{ direction: dirOf(text), textAlign: 'center', opacity: exit, transform: `scale(${0.96 + 0.04 * exit})`, filter: `blur(${(1 - exit) * 8}px)`, padding: '0 6%' }}>
      <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, lineHeight: 1.15, color: th.text, letterSpacing: dirOf(text) === 'rtl' ? 0 : -1 }}>
        {style === 'typewriter'
          ? <span>{text.slice(0, typed)}<span style={{ opacity: frame % 16 < 8 ? 1 : 0, color: th.accent }}>|</span></span>
          : ws.map((w, i) => {
            const s = spring({ frame: frame - i * 4, fps, config: { damping: 13, stiffness: 140, mass: 0.7 } });
            const tf = {
              rise: `translateY(${(1 - s) * fs * 0.9}px) rotate(${(1 - s) * (i % 2 ? 6 : -6)}deg)`,
              scale: `scale(${0.2 + 0.8 * s})`,
              blur: `translateY(${(1 - s) * 20}px)`,
              split: `translateX(${(1 - s) * (i % 2 ? 1 : -1) * 160}px)`
            }[style] || '';
            const isHl = hl.has(w);
            return (
              <span key={i} style={{ display: 'inline-block', margin: '0 0.14em', transform: tf, opacity: Math.min(1, s * 1.4), filter: style === 'blur' ? `blur(${(1 - s) * 14}px)` : 'none',
                textShadow: isHl ? `0 0 40px ${hexA(th.accent, 0.65)}` : `0 8px 30px rgba(0,0,0,0.45)` }}>
                {isHl ? <GradText th={th} colors={[th.accent, th.secondary]}>{w}</GradText> : w}
              </span>
            );
          })}
      </div>
      {subtitle ? (
        <div style={{ marginTop: fs * 0.25, fontFamily: th.fontStack, fontWeight: 600, fontSize: fs * 0.36, color: hexA(th.text, 0.82), opacity: subIn, transform: `translateY(${(1 - subIn) * 20}px)`, direction: dirOf(subtitle) }}>
          <span style={{ display: 'inline-block', width: interpolate(subIn, [0, 1], [0, fs * 0.6]), height: 4, background: th.accent, borderRadius: 4, verticalAlign: 'middle', margin: '0 16px', boxShadow: `0 0 18px ${th.accent}` }} />
          {subtitle}
          <span style={{ display: 'inline-block', width: interpolate(subIn, [0, 1], [0, fs * 0.6]), height: 4, background: th.accent, borderRadius: 4, verticalAlign: 'middle', margin: '0 16px', boxShadow: `0 0 18px ${th.accent}` }} />
        </div>
      ) : null}
    </div>
  );
};

/** Marker-style highlight sweeping behind chosen words */
export const Highlight = ({ th, dur, text = 'الفكرة الأهم في الفيديو', words: hw = [] }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12); const fs = Math.round(height * 0.085);
  const set = new Set(hw.length ? hw : words(text).slice(-2));
  return (
    <div style={{ direction: dirOf(text), fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: th.text, textAlign: 'center', opacity: exit, padding: '0 8%', lineHeight: 1.5 }}>
      {words(text).map((w, i) => {
        const s = spring({ frame: frame - i * 3, fps, config: { damping: 16 } });
        const m = interpolate(frame, [12 + i * 3, 26 + i * 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const on = set.has(w);
        return (
          <span key={i} style={{ position: 'relative', isolation: 'isolate', display: 'inline-block', margin: '0 0.12em', opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
            {on ? <span style={{ position: 'absolute', left: -14, right: -14, top: '18%', bottom: '10%', background: `linear-gradient(90deg, ${th.accent}, ${th.secondary})`, borderRadius: 10, transformOrigin: dirOf(text) === 'rtl' ? 'right' : 'left', transform: `scaleX(${m}) skewX(-8deg)`, opacity: 0.9, zIndex: -1 }} /> : null}
            <span style={{ position: 'relative', color: on ? '#0B0A12' : th.text, textShadow: on ? 'none' : '0 6px 24px rgba(0,0,0,.5)' }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

/** Quote card with big quote marks and word reveal */
export const Quote = ({ th, dur, text = 'النجاح مش صدفة، النجاح عادة.', author }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 14); const fs = Math.round(height * 0.06);
  const card = spring({ frame, fps, config: { damping: 16 } });
  return (
    <div style={{ opacity: exit, transform: `scale(${0.85 + 0.15 * card}) translateY(${(1 - card) * 40}px)`, maxWidth: width * 0.72 }}>
      <Glass th={th} style={{ padding: `${fs * 1.1}px ${fs * 1.3}px` }}>
        <div style={{ position: 'absolute', top: -fs * 1.2, [dirOf(text) === 'rtl' ? 'right' : 'left']: fs * 0.6, fontSize: fs * 4, lineHeight: 1, fontFamily: 'Georgia, serif', color: th.accent, textShadow: `0 0 40px ${hexA(th.accent, 0.7)}`, transform: `scale(${card})` }}>“</div>
        <div style={{ direction: dirOf(text), fontFamily: th.fontStack, fontWeight: 800, fontSize: fs, color: th.text, lineHeight: 1.45 }}>
          {words(text).map((w, i) => { const s = spring({ frame: frame - 8 - i * 2.5, fps, config: { damping: 18 } }); return <span key={i} style={{ display: 'inline-block', margin: '0 0.12em', opacity: s, filter: `blur(${(1 - s) * 8}px)` }}>{w}</span>; })}
        </div>
        {author ? <div style={{ marginTop: fs * 0.6, direction: dirOf(author), fontFamily: th.fontStack, fontWeight: 600, fontSize: fs * 0.55, color: th.accent, opacity: interpolate(frame, [20, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>— {author}</div> : null}
      </Glass>
    </div>
  );
};

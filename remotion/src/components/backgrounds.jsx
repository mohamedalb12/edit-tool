import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random } from 'remotion';
import { hexA } from '../theme.jsx';

export const Background = ({ th, type = 'mesh', colors }) => {
  const frame = useCurrentFrame(); const { width, height, durationInFrames } = useVideoConfig();
  const c = colors && colors.length ? colors : [th.background, th.primary, th.secondary, th.accent];
  if (type === 'transparent') return null;
  if (type === 'solid') return <AbsoluteFill style={{ background: c[0] }} />;
  if (type === 'gradient') {
    const ang = interpolate(frame, [0, durationInFrames], [120, 160]);
    return <AbsoluteFill style={{ background: `linear-gradient(${ang}deg, ${c[0]}, ${c[1] || th.primary} 60%, ${c[2] || th.secondary})` }} />;
  }
  if (type === 'grid') {
    const off = (frame * 2) % 80;
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, ${hexA(th.primary, 0.35)}, ${c[0]} 70%)`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '-50%', right: '-50%', bottom: '-10%', height: '44%', transform: 'perspective(500px) rotateX(62deg)', transformOrigin: '50% 100%',
          backgroundImage: `linear-gradient(${hexA(th.primary, 0.55)} 2px, transparent 2px), linear-gradient(90deg, ${hexA(th.primary, 0.55)} 2px, transparent 2px)`, backgroundSize: '80px 80px', backgroundPosition: `0 ${off}px`,
          maskImage: 'linear-gradient(to top, #000 10%, transparent 90%)', WebkitMaskImage: 'linear-gradient(to top, #000 10%, transparent 90%)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '80%', height: 2, opacity: 0.6, background: `linear-gradient(90deg, transparent, ${th.secondary}, transparent)`, boxShadow: `0 0 40px 8px ${hexA(th.secondary, 0.6)}` }} />
      </AbsoluteFill>
    );
  }
  if (type === 'particles') {
    const dots = Array.from({ length: 70 }, (_, i) => {
      const x = random('x' + i) * width, sp = 0.3 + random('s' + i) * 1.2, y = (random('y' + i) * height - frame * sp * 2 + height * 2) % (height + 40) - 20;
      const r = 1 + random('r' + i) * 3.5, tw = 0.4 + 0.6 * Math.abs(Math.sin(frame / 18 + i));
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: r * 2, height: r * 2, borderRadius: '50%', background: i % 3 ? th.text : th.accent, opacity: tw * 0.7, boxShadow: `0 0 ${r * 4}px ${i % 3 ? th.primary : th.accent}` }} />;
    });
    return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 60%, ${hexA(th.primary, 0.3)}, ${c[0]} 70%)` }}>{dots}</AbsoluteFill>;
  }
  if (type === 'spotlight') {
    const x = 50 + Math.sin(frame / 40) * 18;
    return <AbsoluteFill style={{ background: `radial-gradient(circle at ${x}% 40%, ${hexA(th.primary, 0.55)}, ${c[0]} 55%)` }} />;
  }
  // mesh (default): drifting blurred blobs
  const blobs = [[c[1] || th.primary, 0.25, 0.3, 0.55], [c[2] || th.secondary, 0.75, 0.35, 0.5], [c[3] || th.accent, 0.55, 0.8, 0.4], [th.primary, 0.1, 0.85, 0.35]];
  return (
    <AbsoluteFill style={{ background: c[0], overflow: 'hidden' }}>
      {blobs.map(([col, bx, by, s], i) => {
        const t = frame / 60 + i * 1.7;
        return <div key={i} style={{ position: 'absolute', width: width * s, height: width * s, left: `${bx * 100 + Math.sin(t) * 8}%`, top: `${by * 100 + Math.cos(t * 0.8) * 8}%`, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: col, opacity: 0.55, filter: `blur(${width * 0.08}px)` }} />;
      })}
    </AbsoluteFill>
  );
};

export const Overlays = ({ grain = true, vignette = true, sweep = false }) => {
  const frame = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  return (
    <>
      {vignette ? <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55))', pointerEvents: 'none' }} /> : null}
      {sweep ? <AbsoluteFill style={{ background: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)', backgroundSize: '300% 100%', backgroundPosition: `${interpolate(frame, [0, durationInFrames], [120, -20])}% 0` }} /> : null}
      {grain ? (
        <AbsoluteFill style={{ opacity: 0.07, mixBlendMode: 'overlay' }}>
          <svg width="100%" height="100%"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 10} /></filter><rect width="100%" height="100%" filter="url(#g)" /></svg>
        </AbsoluteFill>
      ) : null}
    </>
  );
};

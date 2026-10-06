import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random } from 'remotion';
import { hexA } from '../theme.jsx';

export const Background = ({ th, type = 'mesh', colors }) => {
  const frame = useCurrentFrame(); const { width, height, durationInFrames } = useVideoConfig();
  const c = colors && colors.length ? colors : [th.background, th.primary, th.secondary, th.accent];
  if (type === 'transparent') return null;
  if (type === 'solid') return <AbsoluteFill style={{ background: c[0] }} />;
  if (type === 'paper') {
    // warm paper with fibres + a few torn coloured scraps drifting in the corners
    const base = colors && colors[0] ? colors[0] : '#F3EADB';
    const scraps = [[th.primary, -4, -6, 26, 14, -8], [th.accent, 78, 80, 30, 16, 6], [th.secondary, 86, -4, 18, 22, 12], ['#1C1C1C', -6, 84, 22, 10, -4]];
    return (
      <AbsoluteFill style={{ background: base, overflow: 'hidden' }}>
        {scraps.map(([col, x, y, w, h, r], i) => (
          <div key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y + Math.sin(frame / 50 + i) * 0.8}%`, width: `${w}%`, height: `${h}%`, background: col, opacity: 0.9, transform: `rotate(${r}deg)`,
            clipPath: 'polygon(0 6%,12% 0,30% 5%,48% 1%,70% 6%,88% 0,100% 8%,97% 40%,100% 70%,95% 100%,70% 95%,45% 100%,20% 94%,0 100%,4% 60%)', boxShadow: '0 6px 14px rgba(0,0,0,.2)' }} />
        ))}
        <AbsoluteFill style={{ opacity: 0.35, mixBlendMode: 'multiply' }}>
          <svg width="100%" height="100%"><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves="3" seed="7" /><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.55 0" /></filter><rect width="100%" height="100%" filter="url(#paper)" /></svg>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(90,60,30,0.22))' }} />
      </AbsoluteFill>
    );
  }
  if (type === 'halftone') {
    const sz = Math.round(height / 40), ang = interpolate(frame, [0, durationInFrames], [0, 8]);
    return (
      <AbsoluteFill style={{ background: c[1] || th.primary, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '-20%', transform: `rotate(${ang}deg)`, backgroundImage: `radial-gradient(${hexA(c[3] || th.accent, 0.9)} ${sz * 0.22}px, transparent ${sz * 0.26}px)`, backgroundSize: `${sz}px ${sz}px`,
          maskImage: 'radial-gradient(ellipse at 30% 40%, #000 10%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, #000 10%, transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: `conic-gradient(from ${frame / 2}deg at 50% 50%, transparent 0 10deg, ${hexA('#ffffff', 0.08)} 10deg 20deg, transparent 20deg 40deg, ${hexA('#ffffff', 0.08)} 40deg 50deg, transparent 50deg 70deg, ${hexA('#ffffff', 0.08)} 70deg 80deg, transparent 80deg)` }} />
      </AbsoluteFill>
    );
  }
  if (type === 'speedlines') {
    // manga speed lines bursting from the centre
    const n = 64, rot = frame * 0.4;
    const rays = Array.from({ length: n }, (_, i) => { const a = (i / n) * 360 + random('sl' + i) * 4; const w = 0.4 + random('w' + i) * 1.6; return `${hexA('#000000', 0.85)} ${a}deg ${a + w}deg, transparent ${a + w}deg ${a + 360 / n}deg`; }).join(', ');
    return (
      <AbsoluteFill style={{ background: (colors && colors[0]) || '#FFFFFF', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '-40%', background: `conic-gradient(from ${rot}deg at 50% 50%, ${rays})`, maskImage: 'radial-gradient(circle at center, transparent 18%, #000 45%)', WebkitMaskImage: 'radial-gradient(circle at center, transparent 18%, #000 45%)', opacity: 0.85 }} />
      </AbsoluteFill>
    );
  }
  if (type === 'sunset') {
    // synthwave: striped sun over a moving neon grid
    const off = (frame * 3) % 80;
    return (
      <AbsoluteFill style={{ background: `linear-gradient(180deg, #120428 0%, #3b0a5c 45%, #ff3c8e 62%, #120428 62.1%)`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: '18%', width: height * 0.62, height: height * 0.62, transform: 'translateX(-50%)', borderRadius: '50%', background: 'linear-gradient(180deg, #ffe35a, #ff6b3d 55%, #ff2fa0)',
          maskImage: 'linear-gradient(180deg, #000 55%, transparent 55% 59%, #000 59% 68%, transparent 68% 71%, #000 71% 79%, transparent 79% 83%, #000 83%)', WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent 55% 59%, #000 59% 68%, transparent 68% 71%, #000 71% 79%, transparent 79% 83%, #000 83%)', boxShadow: '0 0 120px #ff3c8e' }} />
        <div style={{ position: 'absolute', left: '-50%', right: '-50%', top: '62%', bottom: '-10%', transform: 'perspective(400px) rotateX(70deg)', transformOrigin: '50% 0%',
          backgroundImage: 'linear-gradient(#ff3cf0 2px, transparent 2px), linear-gradient(90deg, #ff3cf0 2px, transparent 2px)', backgroundSize: '70px 70px', backgroundPosition: `0 ${off}px`, filter: 'drop-shadow(0 0 6px #ff3cf0)' }} />
      </AbsoluteFill>
    );
  }
  if (type === 'blueprint') {
    return (
      <AbsoluteFill style={{ background: '#0b3d91', backgroundImage: 'linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
        backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px', backgroundPosition: `${-frame * 0.5}px 0, ${-frame * 0.5}px 0, ${-frame * 0.5}px 0, ${-frame * 0.5}px 0` }} />
    );
  }
  if (type === 'chalkboard') {
    return (
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, #2f4f3a, #18281f 80%)' }}>
        <AbsoluteFill style={{ opacity: 0.25, mixBlendMode: 'screen' }}>
          <svg width="100%" height="100%"><filter id="chalk"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 -0.25" /></filter><rect width="100%" height="100%" filter="url(#chalk)" /></svg>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (type === 'grunge') {
    return (
      <AbsoluteFill style={{ background: colors && colors[0] ? colors[0] : '#1b1a17' }}>
        <AbsoluteFill style={{ opacity: 0.55, mixBlendMode: 'overlay' }}>
          <svg width="100%" height="100%"><filter id="grunge"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="5" seed={7} /><feColorMatrix values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.75  0 0 0 1.2 -0.35" /></filter><rect width="100%" height="100%" filter="url(#grunge)" /></svg>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7))' }} />
      </AbsoluteFill>
    );
  }
  if (type === 'flat') {
    // explainer style: flat colour + soft floating shapes
    const shapes = [[0.12, 0.2, 0.16, 'circle', th.accent], [0.85, 0.25, 0.12, 'square', th.secondary], [0.8, 0.8, 0.2, 'circle', th.primary], [0.15, 0.82, 0.1, 'square', th.accent]];
    return (
      <AbsoluteFill style={{ background: c[0], overflow: 'hidden' }}>
        {shapes.map(([x, y, sz, kind, col], i) => (
          <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100 + Math.sin(frame / 40 + i) * 2}%`, width: height * sz, height: height * sz, transform: `translate(-50%,-50%) rotate(${kind === 'square' ? frame * 0.3 + i * 20 : 0}deg)`, borderRadius: kind === 'circle' ? '50%' : height * sz * 0.18, background: col, opacity: 0.35 }} />
        ))}
      </AbsoluteFill>
    );
  }
  if (type === 'studio') {
    // dark 3D studio: back wall, glossy floor, two moving spotlights
    const sx = 50 + Math.sin(frame / 45) * 12;
    return (
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${c[0]} 0%, #050508 62%, #0c0c12 62.2%, #020203 100%)`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: `${sx - 30}%`, top: '-20%', width: '60%', height: '100%', background: `radial-gradient(ellipse at 50% 0%, ${hexA(th.primary, 0.45)}, transparent 65%)` }} />
        <div style={{ position: 'absolute', left: `${100 - sx - 25}%`, top: '-10%', width: '50%', height: '90%', background: `radial-gradient(ellipse at 50% 0%, ${hexA(th.secondary, 0.3)}, transparent 60%)` }} />
        <div style={{ position: 'absolute', left: '-10%', right: '-10%', top: '62%', bottom: 0, background: `radial-gradient(ellipse at ${sx}% 0%, ${hexA(th.primary, 0.28)}, transparent 55%)` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', height: 2, background: `linear-gradient(90deg, transparent, ${hexA(th.text, 0.25)}, transparent)` }} />
      </AbsoluteFill>
    );
  }
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

/** Look overlays: vhs (scanlines, colour bleed, REC + date), glitch (RGB slices), scanlines, lightleak, ticker */
export const LookOverlay = ({ type, th, text = '' }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  if (!type) return null;
  if (type === 'vhs') {
    const s = Math.floor(frame / fps), track = (frame * 7) % height;
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 2px, transparent 2px 4px)', mixBlendMode: 'multiply' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: track, height: height * 0.03, background: 'linear-gradient(transparent, rgba(255,255,255,.18), transparent)', filter: 'blur(2px)' }} />
        <AbsoluteFill style={{ boxShadow: `inset 3px 0 0 rgba(255,0,80,.25), inset -3px 0 0 rgba(0,200,255,.25)` }} />
        <div style={{ position: 'absolute', left: '5%', top: '6%', fontFamily: 'monospace', fontWeight: 700, fontSize: height * 0.045, color: '#fff', textShadow: '2px 0 #f05, -2px 0 #0cf', letterSpacing: 2 }}>
          <span style={{ opacity: Math.floor(frame / 15) % 2 ? 1 : 0.2, color: '#ff2a2a' }}>●</span> REC
        </div>
        <div style={{ position: 'absolute', right: '5%', bottom: '7%', fontFamily: 'monospace', fontWeight: 700, fontSize: height * 0.04, color: '#fff', textShadow: '2px 0 #f05, -2px 0 #0cf', direction: 'ltr' }}>
          {`PLAY ▶  00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`}<br />{text || 'JAN. 01 1999'}
        </div>
      </AbsoluteFill>
    );
  }
  if (type === 'glitch') {
    const on = random('g' + Math.floor(frame / 3)) > 0.72;
    if (!on) return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.12) 0 1px, transparent 1px 3px)' }} />;
    const bars = Array.from({ length: 5 }, (_, i) => { const y = random('y' + frame + i) * height, h = 4 + random('h' + frame + i) * height * 0.05; return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y, height: h, background: i % 2 ? 'rgba(255,0,90,.35)' : 'rgba(0,240,255,.35)', transform: `translateX(${(random('x' + frame + i) - 0.5) * width * 0.1}px)`, mixBlendMode: 'screen' }} />; });
    return <AbsoluteFill style={{ pointerEvents: 'none' }}>{bars}</AbsoluteFill>;
  }
  if (type === 'scanlines') return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px)' }} />;
  if (type === 'lightleak') {
    const x = 20 + Math.sin(frame / 50) * 30;
    return <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', background: `radial-gradient(ellipse at ${x}% 10%, rgba(255,140,40,.55), transparent 50%), radial-gradient(ellipse at ${100 - x}% 90%, rgba(255,40,90,.35), transparent 45%)` }} />;
  }
  if (type === 'ticker') {
    const msg = (text || 'عاجل • EditFast • ') .repeat(6);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '5%', height: height * 0.07, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.95)', overflow: 'hidden' }}>
          <div style={{ flex: 'none', height: '100%', padding: `0 ${height * 0.03}px`, display: 'flex', alignItems: 'center', background: th.primary, color: '#fff', fontFamily: th.fontStack, fontWeight: 900, fontSize: height * 0.035, zIndex: 1 }}>عاجل</div>
          <div style={{ whiteSpace: 'nowrap', fontFamily: th.fontStack, fontWeight: 800, fontSize: height * 0.032, color: '#111', transform: `translateX(${frame * 4 % (width)}px)`, direction: 'rtl' }}>{msg}</div>
        </div>
      </AbsoluteFill>
    );
  }
  return null;
};

export const Overlays = ({ grain = true, vignette = true, sweep = false, letterbox = false }) => {
  const frame = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  return (
    <>
      {letterbox ? <AbsoluteFill style={{ pointerEvents: 'none' }}><div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '10%', background: '#000' }} /><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '10%', background: '#000' }} /></AbsoluteFill> : null}
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

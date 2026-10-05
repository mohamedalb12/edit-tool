import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring, random } from 'remotion';
import { useExit, dirOf, hexA, Glass, GradText, words } from '../theme.jsx';

/** Modern lower third: glass bar + accent line + name/role */
export const LowerThird = ({ th, dur, name = 'محمد أيمن', role = 'مونتير ومصمم موشن' }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const fs = height * 0.05; const rtl = dirOf(name + role) === 'rtl';
  const a = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const b = spring({ frame: frame - 6, fps, config: { damping: 18 } });
  const outS = spring({ frame: frame - (dur - 16), fps, config: { damping: 20 } });
  const k = a * (1 - outS);
  return (
    <div style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', alignItems: 'stretch', gap: 0, transform: `translateX(${(1 - k) * (rtl ? 120 : -120)}px)`, opacity: Math.min(1, k * 1.5) }}>
      <div style={{ width: 10, borderRadius: 10, background: `linear-gradient(180deg, ${th.accent}, ${th.secondary})`, boxShadow: `0 0 26px ${th.accent}`, transform: `scaleY(${k})` }} />
      <div style={{ overflow: 'hidden', clipPath: `inset(0 ${rtl ? 0 : (1 - b) * 100}% 0 ${rtl ? (1 - b) * 100 : 0}% round 20px)`, marginInlineStart: 14 }}>
        <Glass th={th} glow={false} style={{ borderRadius: 20, padding: `${fs * 0.35}px ${fs * 0.8}px` }}>
          <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: th.text, whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontFamily: th.fontStack, fontWeight: 600, fontSize: fs * 0.55, color: th.accent, whiteSpace: 'nowrap', opacity: interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{role}</div>
        </Glass>
      </div>
    </div>
  );
};

/** Logo / channel reveal with light burst, shards and tagline */
export const LogoReveal = ({ th, dur, text = 'EditFast', tagline = 'مونتاج أسرع بالذكاء الاصطناعي' }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 16); const fs = height * 0.15;
  const pop = spring({ frame: frame - 6, fps, config: { damping: 10, stiffness: 120 } });
  const flash = interpolate(frame, [4, 10, 26], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ring = interpolate(frame, [4, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tag = spring({ frame: frame - 22, fps, config: { damping: 18 } });
  const shards = Array.from({ length: 18 }, (_, i) => {
    const ang = (i / 18) * Math.PI * 2 + random('a' + i) * 0.4, dist = interpolate(frame, [6, 50], [0, (0.25 + random('d' + i) * 0.25) * width], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const o = interpolate(frame, [6, 14, 50], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 10 + random('s' + i) * 26, height: 4, borderRadius: 4, background: i % 2 ? th.accent : th.secondary, opacity: o, transform: `translate(-50%,-50%) translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) rotate(${ang}rad)`, boxShadow: `0 0 14px ${i % 2 ? th.accent : th.secondary}` }} />;
  });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: exit }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: height * 1.2 * ring, height: height * 1.2 * ring, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `3px solid ${hexA(th.accent, 1 - ring)}`, boxShadow: `0 0 60px ${hexA(th.primary, (1 - ring) * 0.8)}` }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: height * 0.9, height: height * 0.9, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, ${hexA('#ffffff', flash * 0.9)}, ${hexA(th.primary, flash * 0.5)} 30%, transparent 65%)` }} />
      {shards}
      <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, letterSpacing: dirOf(text) === 'rtl' ? 0 : -2, transform: `scale(${0.3 + 0.7 * pop})`, filter: `drop-shadow(0 0 40px ${hexA(th.primary, 0.9)})`, direction: dirOf(text) }}>
        <GradText th={th} colors={[th.text, th.accent, th.secondary, th.text]} style={{ backgroundSize: '300% 100%', backgroundPosition: `${interpolate(frame, [0, dur], [100, 0])}% 0` }}>{text}</GradText>
      </div>
      {tagline ? <div style={{ marginTop: fs * 0.15, fontFamily: th.fontStack, fontWeight: 700, fontSize: fs * 0.26, color: hexA(th.text, 0.9), letterSpacing: dirOf(tagline) === 'rtl' ? 0 : 4, opacity: tag, transform: `translateY(${(1 - tag) * 24}px)`, direction: dirOf(tagline) }}>{tagline}</div> : null}
    </div>
  );
};

/** Subscribe call-to-action: button, animated cursor click, bell ring */
export const CallToAction = ({ th, dur, text = 'اشترك', sub = 'وفعّل الجرس عشان يوصلك كل جديد', color = '#FF2D55' }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 14); const fs = height * 0.055;
  const pop = spring({ frame, fps, config: { damping: 11 } });
  const click = 34;
  const cx = interpolate(frame, [8, click - 4], [fs * 7, fs * 1.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cy = interpolate(frame, [8, click - 4], [fs * 4, fs * 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pressed = frame >= click && frame < click + 6;
  const done = frame >= click;
  const bell = done ? Math.sin((frame - click) * 0.9) * 22 * Math.exp(-(frame - click) / 18) : 0;
  const rip = interpolate(frame, [click, click + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: exit, transform: `scale(${pop})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: fs * 0.5, direction: dirOf(text) }}>
        <div style={{ position: 'relative', padding: `${fs * 0.42}px ${fs * 1.2}px`, borderRadius: 999, fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: '#fff',
          background: done ? 'linear-gradient(135deg,#3a3a46,#24242c)' : `linear-gradient(135deg, ${color}, ${hexA(color, 0.8)})`, transform: `scale(${pressed ? 0.92 : 1})`,
          boxShadow: done ? '0 10px 30px -10px rgba(0,0,0,.6)' : `0 14px 40px -10px ${hexA(color, 0.9)}, inset 0 2px 0 rgba(255,255,255,.35)` }}>
          {done ? (dirOf(text) === 'rtl' ? 'تم الاشتراك ✓' : 'Subscribed ✓') : text}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `3px solid ${hexA(color, 1 - rip)}`, transform: `scale(${1 + rip * 0.5})` }} />
        </div>
        <div style={{ fontSize: fs * 1.15, transform: `rotate(${bell}deg)`, transformOrigin: '50% 10%', filter: done ? `drop-shadow(0 0 16px ${th.accent})` : 'grayscale(0.4)' }}>🔔</div>
      </div>
      {sub ? <div style={{ marginTop: fs * 0.45, fontFamily: th.fontStack, fontWeight: 700, fontSize: fs * 0.5, color: hexA(th.text, 0.9), direction: dirOf(sub), opacity: interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{sub}</div> : null}
      <svg width={fs * 1.1} height={fs * 1.1} viewBox="0 0 24 24" style={{ position: 'absolute', left: '50%', top: 0, transform: `translate(${cx}px, ${cy}px) scale(${pressed ? 0.85 : 1})`, opacity: interpolate(frame, [6, 12, click + 20, click + 30], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5))' }}>
        <path d="M4 2l15 9.5-6.5 1.2 3.8 7.3-2.8 1.4-3.7-7.3L4 19z" fill="#fff" stroke="#111" strokeWidth="1.2" />
      </svg>
    </div>
  );
};

/** Social post card (X / Instagram style) */
export const SocialPost = ({ th, dur, name = 'EditFast', handle = '@editfast', text = 'المونتاج بقى أسرع ١٠ مرات 🚀', likes = 12400, platform = 'x' }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 14); const fs = height * 0.034;
  const s = spring({ frame, fps, config: { damping: 14 } });
  const likeP = interpolate(frame, [20, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const heart = spring({ frame: frame - 24, fps, config: { damping: 8, stiffness: 200 } });
  return (
    <div style={{ opacity: exit, transform: `perspective(1200px) rotateX(${(1 - s) * 25}deg) translateY(${(1 - s) * 80}px) scale(${0.9 + 0.1 * s})` }}>
      <div style={{ width: Math.min(width * 0.5, fs * 22), borderRadius: 28, background: 'rgba(255,255,255,0.96)', boxShadow: '0 40px 90px -20px rgba(0,0,0,.7)', padding: fs * 1.1, direction: dirOf(text) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: fs * 0.5 }}>
          <div style={{ width: fs * 2.2, height: fs * 2.2, borderRadius: '50%', background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: '#111' }}>{name} <span style={{ color: '#1d9bf0' }}>✔</span></div>
            <div style={{ fontFamily: th.fontStack, fontSize: fs * 0.75, color: '#666', direction: 'ltr', textAlign: dirOf(text) === 'rtl' ? 'right' : 'left' }}>{handle}</div>
          </div>
          <div style={{ fontFamily: 'Arial', fontWeight: 900, fontSize: fs * 1.2, color: '#111' }}>{platform === 'instagram' ? '◎' : '𝕏'}</div>
        </div>
        <div style={{ marginTop: fs * 0.7, fontFamily: th.fontStack, fontWeight: 600, fontSize: fs * 1.15, color: '#111', lineHeight: 1.5 }}>{text}</div>
        <div style={{ marginTop: fs * 0.7, display: 'flex', alignItems: 'center', gap: fs * 0.4, fontFamily: th.fontStack, fontWeight: 800, fontSize: fs * 0.9, color: '#e0245e', direction: 'ltr' }}>
          <span style={{ display: 'inline-block', transform: `scale(${0.6 + heart * 0.6})` }}>❤</span>
          {Math.round(likes * likeP).toLocaleString('en-US')}
        </div>
      </div>
    </div>
  );
};

/** Emoji burst + short line */
export const EmojiBurst = ({ th, dur, emoji = '🔥', text = 'مستوى تاني!' }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 12); const fs = height * 0.2;
  const s = spring({ frame, fps, config: { damping: 7, stiffness: 160 } });
  const parts = Array.from({ length: 12 }, (_, i) => {
    const ang = i / 12 * Math.PI * 2, d = interpolate(frame, [2, 30], [0, height * 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const o = interpolate(frame, [2, 8, 30], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', fontSize: fs * 0.25, opacity: o, transform: `translate(-50%,-50%) translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px)` }}>{emoji}</div>;
  });
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: exit }}>
      {parts}
      <div style={{ fontSize: fs, transform: `scale(${s}) rotate(${(1 - s) * -30}deg)`, filter: `drop-shadow(0 0 40px ${hexA(th.accent, 0.8)})` }}>{emoji}</div>
      {text ? <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * 0.35, color: th.text, direction: dirOf(text), textShadow: '0 8px 30px rgba(0,0,0,.6)', transform: `translateY(${(1 - spring({ frame: frame - 8, fps })) * 40}px)` }}>{text}</div> : null}
    </div>
  );
};

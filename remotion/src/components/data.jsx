import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from 'remotion';
import { useExit, dirOf, hexA, Glass, GradText } from '../theme.jsx';

const fmtNum = (v, decimals) => {
  const s = v.toFixed(decimals);
  const [a, b] = s.split('.');
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : '');
};

/** Big number counting up, optional progress ring */
export const StatCounter = ({ th, dur, value = 100, prefix = '', suffix = '', label = 'إحصائية', ring = true, decimals }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 14);
  const dec = decimals ?? (Math.abs(value) < 10 && value % 1 ? 1 : 0);
  const p = interpolate(frame, [6, Math.max(7, Math.min(dur - 20, 60))], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const R = height * 0.2, C = 2 * Math.PI * R, fs = Math.round(height * 0.13);
  const pct = ring ? Math.max(0, Math.min(1, (suffix === '%' ? value / 100 : 1))) : 0;
  const box = R * 2.5;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: exit, transform: `scale(${(0.6 + 0.4 * pop) * (0.95 + 0.05 * exit)})` }}>
      <div style={{ position: 'relative', width: ring ? box : 'auto', height: ring ? box : 'auto', display: 'grid', placeItems: 'center' }}>
        {ring ? (
          <svg width={box} height={box} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', overflow: 'visible' }}>
            <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor={th.primary} /><stop offset="1" stopColor={th.accent} /></linearGradient></defs>
            <circle cx={box / 2} cy={box / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={R * 0.09} />
            <circle cx={box / 2} cy={box / 2} r={R} fill="none" stroke="url(#rg)" strokeWidth={R * 0.09} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct * p)} style={{ filter: `drop-shadow(0 0 18px ${hexA(th.primary, 0.9)})` }} />
          </svg>
        ) : null}
        <div style={{ position: 'relative', fontFamily: th.fontStack, fontWeight: 900, fontSize: ring ? Math.min(fs, R * 0.75) : fs, lineHeight: 1, direction: 'ltr', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 60px ${hexA(th.primary, 0.6)}` }}>
          <GradText th={th} colors={[th.text, th.accent]}>{prefix}{fmtNum(value * p, dec)}{suffix}</GradText>
        </div>
      </div>
      <div style={{ marginTop: fs * 0.12, fontFamily: th.fontStack, fontWeight: 700, fontSize: fs * 0.32, color: hexA(th.text, 0.88), direction: dirOf(label), textShadow: '0 4px 20px rgba(0,0,0,.6)', opacity: interpolate(frame, [14, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{label}</div>
    </div>
  );
};

/** Animated bar chart in a glass card */
export const BarChart = ({ th, dur, title = 'النتائج', bars = [{ label: 'يناير', value: 40 }, { label: 'فبراير', value: 65 }, { label: 'مارس', value: 90 }], unit = '' }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 14); const max = Math.max(...bars.map(b => +b.value || 0), 1);
  const card = spring({ frame, fps, config: { damping: 16 } });
  const H = height * 0.36, fs = height * 0.034;
  const rtl = dirOf(title) === 'rtl';
  return (
    <div style={{ opacity: exit, transform: `translateY(${(1 - card) * 60}px) scale(${0.9 + 0.1 * card})` }}>
      <Glass th={th} style={{ width: Math.min(width * 0.62, 260 * bars.length + 200), padding: `${fs * 1.2}px ${fs * 1.5}px` }}>
        <div style={{ direction: dirOf(title), fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * 1.4, color: th.text, marginBottom: fs }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: fs * 1.1, height: H }}>
          {bars.map((b, i) => {
            const s = spring({ frame: frame - 8 - i * 5, fps, config: { damping: 15, stiffness: 90 } });
            const v = (+b.value || 0) * s, h = Math.max(6, (H - fs * 3) * ((+b.value || 0) / max) * s);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: th.accent, direction: 'ltr', opacity: s, marginBottom: 8 }}>{Math.round(v)}{unit}</div>
                <div style={{ width: '100%', height: h, borderRadius: '14px 14px 6px 6px', background: `linear-gradient(180deg, ${th.accent}, ${th.primary})`, boxShadow: `0 0 30px -4px ${hexA(th.primary, 0.9)}, inset 0 2px 0 rgba(255,255,255,0.5)` }} />
                <div style={{ marginTop: 10, fontFamily: th.fontStack, fontWeight: 700, fontSize: fs * 0.8, color: hexA(th.text, 0.85), direction: dirOf(b.label) }}>{b.label}</div>
              </div>
            );
          })}
        </div>
      </Glass>
    </div>
  );
};

/** Bullet list revealing one by one */
export const ListReveal = ({ th, dur, title = 'أهم النقاط', items = ['النقطة الأولى', 'النقطة التانية', 'النقطة التالتة'] }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 14); const fs = height * 0.045;
  const card = spring({ frame, fps, config: { damping: 16 } });
  const rtl = dirOf(title + items.join(' ')) === 'rtl';
  return (
    <div style={{ opacity: exit, transform: `translateX(${(1 - card) * (rtl ? 80 : -80)}px)` }}>
      <Glass th={th} style={{ minWidth: width * 0.4, maxWidth: width * 0.6, padding: `${fs}px ${fs * 1.3}px`, direction: rtl ? 'rtl' : 'ltr' }}>
        <div style={{ fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * 1.3, color: th.text, marginBottom: fs * 0.6 }}><GradText th={th}>{title}</GradText></div>
        {items.map((it, i) => {
          const s = spring({ frame: frame - 10 - i * 8, fps, config: { damping: 15 } });
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: fs * 0.5, margin: `${fs * 0.35}px 0`, opacity: s, transform: `translateX(${(1 - s) * (rtl ? 60 : -60)}px)` }}>
              <div style={{ width: fs * 1.1, height: fs * 1.1, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})`, boxShadow: `0 0 20px ${hexA(th.primary, 0.8)}`, fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * 0.6, color: '#fff', transform: `scale(${s})` }}>{i + 1}</div>
              <div style={{ fontFamily: th.fontStack, fontWeight: 700, fontSize: fs, color: th.text }}>{it}</div>
            </div>
          );
        })}
      </Glass>
    </div>
  );
};

/** Process steps on a line with a moving progress dot */
export const Steps = ({ th, dur, title, steps = ['الفكرة', 'التصوير', 'المونتاج', 'النشر'] }) => {
  const frame = useCurrentFrame(); const { fps, height, width } = useVideoConfig();
  const exit = useExit(dur, 14); const fs = height * 0.034;
  const rtl = dirOf(steps.join(' ')) === 'rtl';
  const prog = interpolate(frame, [10, Math.max(30, dur - 30)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const W = width * 0.7, n = steps.length;
  return (
    <div style={{ opacity: exit, width: W }}>
      {title ? <div style={{ textAlign: 'center', direction: dirOf(title), fontFamily: th.fontStack, fontWeight: 900, fontSize: fs * 1.8, color: th.text, marginBottom: fs * 1.6 }}>{title}</div> : null}
      <div style={{ position: 'relative', height: fs * 6, direction: 'ltr' }}>
        <div style={{ position: 'absolute', top: fs * 1.2, left: 0, right: 0, height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', top: fs * 1.2, [rtl ? 'right' : 'left']: 0, width: `${prog * 100}%`, height: 6, borderRadius: 6, background: `linear-gradient(90deg, ${th.primary}, ${th.accent})`, boxShadow: `0 0 20px ${th.primary}` }} />
        {steps.map((st, i) => {
          const at = n === 1 ? 0.5 : i / (n - 1);
          const on = prog >= at - 0.001;
          const s = spring({ frame: frame - 6 - i * 6, fps, config: { damping: 13 } });
          const left = (rtl ? 1 - at : at) * 100;
          return (
            <div key={i} style={{ position: 'absolute', left: `${left}%`, top: 0, transform: `translateX(-50%) scale(${s})`, display: 'flex', flexDirection: 'column', alignItems: 'center', width: fs * 7 }}>
              <div style={{ width: fs * 2.4, height: fs * 2.4, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: th.fontStack, fontWeight: 900, fontSize: fs, color: '#fff',
                background: on ? `linear-gradient(135deg, ${th.primary}, ${th.secondary})` : 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', boxShadow: on ? `0 0 30px ${hexA(th.primary, 0.9)}` : 'none' }}>{i + 1}</div>
              <div style={{ marginTop: fs * 0.6, fontFamily: th.fontStack, fontWeight: 800, fontSize: fs * 0.95, color: on ? th.text : hexA(th.text, 0.5), direction: dirOf(st), whiteSpace: 'nowrap' }}>{st}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { useExit, dirOf, hexA, Glass, Media } from '../theme.jsx';

const ci = (f, a, b, x, y) => interpolate(f, [a, b], [x, y], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Phone push notification that drops in, waits and slides away. */
export const Notification = ({ th, dur, app = 'EditFast', title = 'فيديو جديد نزل', text = 'دوس وشوف المونتاج الجديد', icon = '🔔', time = 'الآن' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 13, stiffness: 140 } });
  const outS = spring({ frame: frame - (dur - 14), fps, config: { damping: 20 } });
  const w = Math.min(width * 0.86, height * 0.95); const fs = w * 0.042; const rtl = dirOf(title + text) === 'rtl';
  return (
    <div style={{ width: w, transform: `translateY(${(1 - inS) * -height * 0.4 - outS * height * 0.4}px) scale(${0.9 + 0.1 * inS})`, direction: rtl ? 'rtl' : 'ltr' }}>
      <Glass th={th} glow={false} style={{ borderRadius: w * 0.06, padding: `${fs * 0.9}px ${fs * 1.1}px`, background: 'linear-gradient(145deg, rgba(40,40,48,0.72), rgba(20,20,26,0.6))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: fs * 0.6 }}>
          <div style={{ width: fs * 2.2, height: fs * 2.2, borderRadius: fs * 0.55, background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs * 1.2, flex: 'none' }}>{icon}</div>
          <div style={{ flex: 1, fontFamily: th.fontStack }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: hexA('#ffffff', 0.6), fontSize: fs * 0.72, fontWeight: 600 }}><span>{app}</span><span>{time}</span></div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: fs }}>{title}</div>
            <div style={{ color: hexA('#ffffff', 0.85), fontWeight: 500, fontSize: fs * 0.86 }}>{text}</div>
          </div>
        </div>
      </Glass>
    </div>
  );
};

/** Search bar that types a query, then shows results. */
export const SearchBar = ({ th, dur, query = 'ازاي أمنتج أسرع', results = ['EditFast — مونتاج بالذكاء الاصطناعي', 'أسرع طريقة لقص السكوت', 'ترجمة تلقائية للفيديو'], engine = 'Search' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 12); const w = Math.min(width * 0.8, height * 1.25); const fs = w * 0.036;
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const typeEnd = 10 + query.length * 2;
  const shown = query.slice(0, Math.max(0, Math.floor((frame - 10) / 2)));
  const caret = frame < typeEnd + 10 && Math.floor(frame / 8) % 2 === 0;
  const pressed = frame >= typeEnd + 6;
  const rtl = dirOf(query) === 'rtl';
  return (
    <div style={{ width: w, opacity: exit, transform: `scale(${0.85 + 0.15 * pop})`, direction: rtl ? 'rtl' : 'ltr', fontFamily: th.fontStack }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: fs * 0.7, padding: `${fs * 0.7}px ${fs * 1}px`, borderRadius: 999, background: '#fff', boxShadow: `0 20px 60px -10px rgba(0,0,0,.5), 0 0 0 ${pressed ? 4 : 0}px ${hexA(th.primary, 0.5)}` }}>
        <svg width={fs * 1.3} height={fs * 1.3} viewBox="0 0 24 24" fill="none" stroke={th.primary} strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <div style={{ flex: 1, fontSize: fs * 1.1, fontWeight: 700, color: '#15151A', whiteSpace: 'nowrap', overflow: 'hidden' }}>{shown}<span style={{ opacity: caret ? 1 : 0, color: th.primary }}>|</span></div>
        <div style={{ fontSize: fs * 0.7, fontWeight: 800, color: hexA('#15151A', 0.4) }}>{engine}</div>
      </div>
      <div style={{ marginTop: fs * 0.6 }}>
        {(results || []).slice(0, 4).map((r, i) => {
          const s = spring({ frame: frame - typeEnd - 10 - i * 5, fps, config: { damping: 16 } });
          return (
            <div key={i} style={{ opacity: s, transform: `translateY(${(1 - s) * 20}px)`, marginTop: fs * 0.4, padding: `${fs * 0.55}px ${fs * 1}px`, borderRadius: fs * 0.6, background: 'rgba(255,255,255,0.92)', color: '#15151A', fontSize: fs * 0.9, fontWeight: 700, boxShadow: '0 10px 30px -12px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', gap: fs * 0.5 }}>
              <div style={{ width: fs * 0.5, height: fs * 0.5, borderRadius: '50%', background: i ? hexA(th.primary, 0.4) : th.primary }} />{r}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Chat bubbles: alternating messages with a typing indicator before each reply. */
export const Chat = ({ th, dur, messages = ['عملت المونتاج إمتى؟', 'في 5 دقايق بس 😎', 'إزاي؟!', 'EditFast 🔥'], app = '' }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 12); const w = Math.min(width * 0.7, height * 0.8); const fs = w * 0.05;
  const list = (messages || []).slice(0, 6);
  const per = Math.max(14, Math.floor((dur - 20) / Math.max(1, list.length)));
  return (
    <div style={{ width: w, display: 'flex', flexDirection: 'column', gap: fs * 0.5, opacity: exit, fontFamily: th.fontStack }}>
      {list.map((m, i) => {
        const me = i % 2 === 1; const at = 4 + i * per;
        const typing = !me && i > 0 && frame >= at - 12 && frame < at;
        const s = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 160 } });
        if (frame < at - 12) return null;
        const rtl = dirOf(m) === 'rtl';
        return (
          <div key={i} style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            {typing ? (
              <div style={{ padding: `${fs * 0.5}px ${fs * 0.8}px`, borderRadius: fs, background: 'rgba(255,255,255,0.92)', display: 'flex', gap: fs * 0.25 }}>
                {[0, 1, 2].map(d => <div key={d} style={{ width: fs * 0.35, height: fs * 0.35, borderRadius: '50%', background: '#888', transform: `translateY(${Math.sin((frame + d * 4) / 3) * fs * 0.12}px)` }} />)}
              </div>
            ) : frame >= at ? (
              <div style={{ transform: `scale(${s})`, transformOrigin: me ? '100% 100%' : '0% 100%', padding: `${fs * 0.5}px ${fs * 0.85}px`, borderRadius: fs * 0.9, fontSize: fs, fontWeight: 700, direction: rtl ? 'rtl' : 'ltr',
                background: me ? `linear-gradient(135deg, ${th.primary}, ${th.secondary})` : 'rgba(255,255,255,0.94)', color: me ? '#fff' : '#15151A',
                borderBottomRightRadius: me ? fs * 0.2 : fs * 0.9, borderBottomLeftRadius: me ? fs * 0.9 : fs * 0.2, boxShadow: '0 10px 30px -12px rgba(0,0,0,.45)' }}>{m}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** Browser window: the URL types itself, then the page (photo/video) slides in. */
export const Browser = ({ th, dur, url = 'editfast.app', title = '', media = [] }) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const exit = useExit(dur, 12); const w = Math.min(width * 0.72, height * 1.15); const h = w * 0.62; const bar = w * 0.07;
  const pop = spring({ frame, fps, config: { damping: 15 } });
  const typed = url.slice(0, Math.max(0, Math.floor((frame - 8) / 1.5)));
  const page = spring({ frame: frame - 12 - url.length * 1.5, fps, config: { damping: 16 } });
  const item = Array.isArray(media) ? media[0] : media;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.025, overflow: 'hidden', background: '#16161C', boxShadow: `0 40px 100px -30px rgba(0,0,0,.7), 0 0 80px -20px ${hexA(th.primary, 0.6)}`, border: '1.5px solid rgba(255,255,255,.14)',
      transform: `perspective(${w * 2}px) rotateX(${(1 - pop) * 20}deg) scale(${0.8 + 0.2 * pop})`, opacity: Math.min(1, pop * 1.5) * exit }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: bar * 0.18, padding: `0 ${bar * 0.35}px`, background: '#23232B', direction: 'ltr' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <div key={c} style={{ width: bar * 0.24, height: bar * 0.24, borderRadius: '50%', background: c }} />)}
        <div style={{ flex: 1, marginLeft: bar * 0.3, height: bar * 0.56, borderRadius: bar, background: '#121217', display: 'flex', alignItems: 'center', padding: `0 ${bar * 0.3}px`, color: '#ddd', fontFamily: th.fontStack, fontSize: bar * 0.3, fontWeight: 600 }}>
          🔒&nbsp;{typed}<span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }}>|</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: h - bar, transform: `translateY(${(1 - page) * (h - bar)}px)` }}>
        <Media item={item || title || url} th={th} />
        {title ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: bar * 0.4, background: 'linear-gradient(transparent, rgba(0,0,0,.75))', color: '#fff', fontFamily: th.fontStack, fontWeight: 900, fontSize: bar * 0.5, direction: dirOf(title), opacity: ci(frame, 30, 40, 0, 1) }}>{title}</div> : null}
      </div>
    </div>
  );
};

/** Animated icon (Lucide stroke icons draw themselves; brand logos pop in). */
export const IconAnim = ({ th, dur, svg = '', mode = 'stroke', anim = 'draw', color, size = 1, badge = 'none', label = '', glow = true }) => {
  const frame = useCurrentFrame(); const { fps, height } = useVideoConfig();
  const exit = useExit(dur, 10);
  const s = height * 0.22 * size; const col = color || th.text;
  const sp = spring({ frame, fps, config: anim === 'bounce' ? { damping: 6, stiffness: 180, mass: 0.7 } : { damping: 12, stiffness: 140 } });
  const draw = ci(frame, 2, 26, 0, 1);
  let tr = '';
  if (anim === 'pop' || anim === 'bounce') tr = `scale(${sp})`;
  else if (anim === 'spin') tr = `rotate(${(1 - sp) * -360}deg) scale(${0.3 + 0.7 * sp})`;
  else if (anim === 'pulse') tr = `scale(${(0.4 + 0.6 * sp) * (1 + Math.sin(frame / 5) * 0.06)})`;
  else if (anim === 'shake') tr = `scale(${sp}) rotate(${Math.sin(frame / 2) * 12 * Math.exp(-frame / 30)}deg)`;
  else if (anim === 'slide') tr = `translateY(${(1 - sp) * s * 1.2}px)`;
  else tr = `scale(${0.85 + 0.15 * sp})`;
  const isStroke = mode === 'stroke';
  const drawn = anim === 'draw' ? draw : 1;
  const markup = isStroke
    ? svg.replace(/<(path|circle|line|rect|polyline|polygon|ellipse)\b/g, '<$1 pathLength="1"')
    : svg;
  const badgeStyle = badge === 'circle' ? { borderRadius: '50%', background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})`, padding: s * 0.22 }
    : badge === 'square' ? { borderRadius: s * 0.26, background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})`, padding: s * 0.2 }
    : badge === 'glass' ? { borderRadius: s * 0.3, background: 'linear-gradient(145deg, rgba(255,255,255,.22), rgba(255,255,255,.05))', border: '1.5px solid rgba(255,255,255,.3)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,.5)', backdropFilter: 'blur(20px)', padding: s * 0.2 }
    : {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s * 0.12, opacity: exit }}>
      <div style={{ transform: tr, ...badgeStyle, filter: glow ? `drop-shadow(0 0 ${s * 0.12}px ${hexA(th.primary, 0.85)})` : 'none' }}>
        <svg viewBox="0 0 24 24" width={s} height={s} fill={isStroke ? 'none' : col} stroke={isStroke ? col : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ overflow: 'visible', ['--d']: 1 - drawn, opacity: isStroke ? 1 : (anim === 'draw' ? ci(frame, 0, 14, 0, 1) : 1) }}>
          <style>{isStroke ? '.efi *{stroke-dasharray:1;stroke-dashoffset:var(--d)}' : ''}</style>
          <g className="efi" dangerouslySetInnerHTML={{ __html: markup }} />
        </svg>
      </div>
      {label ? <div style={{ fontFamily: th.fontStack, fontWeight: 800, fontSize: s * 0.22, color: th.text, direction: dirOf(label), opacity: ci(frame, 12, 22, 0, 1), transform: `translateY(${ci(frame, 12, 24, 14, 0)}px)` }}>{label}</div> : null}
    </div>
  );
};

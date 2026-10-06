import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { themeFrom, fontFaceCss, Place } from './theme.jsx';
import { Background, Overlays, LookOverlay } from './components/backgrounds.jsx';
import { KineticTitle, Highlight, Quote } from './components/text.jsx';
import { StatCounter, BarChart, ListReveal, Steps } from './components/data.jsx';
import { LowerThird, LogoReveal, CallToAction, SocialPost, EmojiBurst } from './components/brand.jsx';
import { Collage, CutoutTitle, Scribble, Polaroid } from './components/collage.jsx';
import { Carousel3D, Card3D, Cube3D, Text3D, MediaFull } from './components/three.jsx';
import { Notification, SearchBar, Chat, Browser, IconAnim } from './components/ui.jsx';

export const COMPONENTS = {
  kineticTitle: KineticTitle, highlight: Highlight, quote: Quote, statCounter: StatCounter, barChart: BarChart, list: ListReveal, steps: Steps, lowerThird: LowerThird, logoReveal: LogoReveal, cta: CallToAction, socialPost: SocialPost, emojiBurst: EmojiBurst,
  collage: Collage, cutoutTitle: CutoutTitle, scribble: Scribble, polaroid: Polaroid,
  carousel3D: Carousel3D, card3D: Card3D, cube3D: Cube3D, text3D: Text3D, mediaFull: MediaFull,
  notification: Notification, searchBar: SearchBar, chat: Chat, browser: Browser, icon: IconAnim
};
const FULLSCREEN = { logoReveal: true, collage: true, carousel3D: true, card3D: true, mediaFull: true };
const DEFAULT_POS_EXTRA = { notification: 'top' };
// whole-scene colour looks
const FILTERS = { bw: 'grayscale(1) contrast(1.25) brightness(0.95)', sepia: 'sepia(0.65) contrast(1.1) saturate(0.9)', warm: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg)', cool: 'saturate(1.1) hue-rotate(12deg) brightness(1.02)', vivid: 'saturate(1.5) contrast(1.12)', faded: 'contrast(0.85) saturate(0.75) brightness(1.08)' };
const DEFAULT_POS = { lowerThird: 'lowerThird', cta: 'bottom', list: 'center' };

export const Scene = ({ spec }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const th = themeFrom(spec.theme);
  const transparent = (spec.background || {}).type === 'transparent';
  return (
    <AbsoluteFill style={{ fontFamily: th.fontStack, filter: FILTERS[spec.filter] || undefined }}>
      <style>{fontFaceCss}</style>
      <Background th={th} type={(spec.background || {}).type || 'mesh'} colors={(spec.background || {}).colors} />
      {(spec.elements || []).map((el, i) => {
        const C = COMPONENTS[el.type]; if (!C) return null;
        const from = Math.max(0, Math.round((el.from || 0) * fps));
        const dur = Math.max(6, Math.min(durationInFrames - from, Math.round((el.duration || (durationInFrames / fps - (el.from || 0))) * fps)));
        const body = <C th={th} dur={dur} {...(el.props || {})} />;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="absolute-fill">
            {FULLSCREEN[el.type] ? body : <Place position={el.position || DEFAULT_POS[el.type] || DEFAULT_POS_EXTRA[el.type] || 'center'} x={el.x} y={el.y}>{body}</Place>}
          </Sequence>
        );
      })}
      <LookOverlay type={spec.overlay} th={th} text={spec.overlayText} />
      {!transparent ? <Overlays grain={spec.grain !== false} vignette={spec.vignette !== false} sweep={!!spec.sweep} letterbox={!!spec.letterbox} /> : null}
    </AbsoluteFill>
  );
};

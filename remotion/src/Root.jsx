import React from 'react';
import { Composition } from 'remotion';
import { Scene } from './Scene.jsx';

const SAMPLE = {
  width: 1920, height: 1080, fps: 30, duration: 5,
  theme: {}, background: { type: 'mesh' },
  elements: [{ type: 'kineticTitle', from: 0, duration: 5, props: { text: 'مشهد احترافي بالذكاء الاصطناعي', subtitle: 'EditFast Pro', highlight: ['احترافي'] } }]
};

export const Root = () => (
  <Composition
    id="Scene"
    component={Scene}
    width={1920} height={1080} fps={30} durationInFrames={150}
    defaultProps={{ spec: SAMPLE }}
    calculateMetadata={({ props }) => {
      const s = props.spec || SAMPLE;
      const fps = s.fps || 30;
      return { width: s.width || 1920, height: s.height || 1080, fps, durationInFrames: Math.max(1, Math.round((s.duration || 5) * fps)) };
    }}
  />
);

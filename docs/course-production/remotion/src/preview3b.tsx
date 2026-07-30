import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Lesson3B, LESSON_3B_FRAMES} from './Lesson3B';

// Standalone entry for Lesson 3B ONLY — avoids the shared RemotionRoot (src/index.ts), which
// currently fails to bundle because another tab's Lesson2B import references a
// public/lesson2B/manifest.json that doesn't exist yet. Keeps 3B renderable in isolation.
const Root: React.FC = () => (
  <Composition
    id="Lesson3B"
    component={Lesson3B}
    durationInFrames={LESSON_3B_FRAMES}
    fps={30}
    width={1600}
    height={900}
  />
);

registerRoot(Root);

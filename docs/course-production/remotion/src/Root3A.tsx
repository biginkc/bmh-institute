import React from 'react';
import {Composition} from 'remotion';
import {Lesson3A, LESSON_3A_FRAMES} from './Lesson3A';

// Isolated root — registers ONLY Lesson3A so a broken sibling composition in Root.tsx
// (e.g. another tab's Lesson2B importing a not-yet-built manifest) can't break this render.
export const Root3A: React.FC = () => (
  <Composition id="Lesson3A" component={Lesson3A} durationInFrames={LESSON_3A_FRAMES} fps={30} width={1600} height={900} />
);

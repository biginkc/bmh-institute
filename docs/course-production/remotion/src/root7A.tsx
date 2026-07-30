// Isolated render root for Lesson7A only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson7A, LESSON_7A_FRAMES} from './Lesson7A';

export const Root7A: React.FC = () => (
  <Composition id="Lesson7A" component={Lesson7A} durationInFrames={LESSON_7A_FRAMES} fps={30} width={1600} height={900} />
);

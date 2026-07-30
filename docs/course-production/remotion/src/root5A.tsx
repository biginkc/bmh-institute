// Isolated render root for Lesson5A only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson5A, LESSON_5A_FRAMES} from './Lesson5A';

export const Root5A: React.FC = () => (
  <Composition id="Lesson5A" component={Lesson5A} durationInFrames={LESSON_5A_FRAMES} fps={30} width={1600} height={900} />
);

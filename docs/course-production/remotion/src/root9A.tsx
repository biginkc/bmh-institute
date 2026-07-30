// Isolated render root for Lesson9A only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson9A, LESSON_9A_FRAMES} from './Lesson9A';

export const Root9A: React.FC = () => (
  <Composition id="Lesson9A" component={Lesson9A} durationInFrames={LESSON_9A_FRAMES} fps={30} width={1600} height={900} />
);

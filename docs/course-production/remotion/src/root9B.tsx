// Isolated render root for Lesson9B only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson9B, LESSON_9B_FRAMES} from './Lesson9B';

export const Root9B: React.FC = () => (
  <Composition id="Lesson9B" component={Lesson9B} durationInFrames={LESSON_9B_FRAMES} fps={30} width={1600} height={900} />
);

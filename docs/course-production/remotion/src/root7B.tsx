// Isolated render root for Lesson7B only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson7B, LESSON_7B_FRAMES} from './Lesson7B';

export const Root7B: React.FC = () => (
  <Composition id="Lesson7B" component={Lesson7B} durationInFrames={LESSON_7B_FRAMES} fps={30} width={1600} height={900} />
);

// Isolated render root for Lesson5B only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson5B, LESSON_5B_FRAMES} from './Lesson5B';

export const Root5B: React.FC = () => (
  <Composition id="Lesson5B" component={Lesson5B} durationInFrames={LESSON_5B_FRAMES} fps={30} width={1600} height={900} />
);

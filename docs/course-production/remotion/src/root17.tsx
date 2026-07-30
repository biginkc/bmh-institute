// Isolated render root for Lesson17 only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson17, LESSON_17_FRAMES} from './Lesson17';

export const Root17: React.FC = () => (
  <Composition id="Lesson17" component={Lesson17} durationInFrames={LESSON_17_FRAMES} fps={30} width={1600} height={900} />
);

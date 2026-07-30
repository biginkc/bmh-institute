// Isolated render root for Lesson8A only — bypasses the shared Root.tsx (other tabs registered
// lessons whose manifests may not exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson8A, LESSON_8A_FRAMES} from './Lesson8A';

export const Root8A: React.FC = () => (
  <Composition id="Lesson8A" component={Lesson8A} durationInFrames={LESSON_8A_FRAMES} fps={30} width={1600} height={900} />
);

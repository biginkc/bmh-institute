// Isolated render root for Lesson6A only — bypasses the shared Root.tsx (other tabs registered
// compositions whose manifests don't exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson6A, LESSON_6A_FRAMES} from './Lesson6A';

export const Root6A: React.FC = () => (
  <Composition id="Lesson6A" component={Lesson6A} durationInFrames={LESSON_6A_FRAMES} fps={30} width={1600} height={900} />
);

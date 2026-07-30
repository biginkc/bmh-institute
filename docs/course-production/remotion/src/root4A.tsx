// Isolated render root for Lesson4A only — bypasses Root.tsx (a prior tab registered
// Lesson3BPreviewB3 / LESSON_3B_PREVIEW_B3_FRAMES which Lesson3B.tsx does not export, breaking the
// shared bundle). Same escape hatch as root2A.tsx. Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson4A, LESSON_4A_FRAMES} from './Lesson4A';

export const Root4A: React.FC = () => (
  <Composition id="Lesson4A" component={Lesson4A} durationInFrames={LESSON_4A_FRAMES} fps={30} width={1600} height={900} />
);

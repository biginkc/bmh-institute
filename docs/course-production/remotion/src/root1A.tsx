// Isolated render root for LessonA only — bypasses the shared Root.tsx so other
// tabs' in-progress lessons can't break the 1A v6 fix render. Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {LessonA, LESSON_A_FRAMES} from './LessonA';

export const Root1A: React.FC = () => (
  <Composition id="LessonA" component={LessonA} durationInFrames={LESSON_A_FRAMES} fps={30} width={1600} height={900} />
);

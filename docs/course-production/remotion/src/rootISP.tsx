import React from 'react';
import {Composition} from 'remotion';
import {LessonISP, LESSON_ISP_FRAMES} from './LessonISP';

export const RootISP: React.FC = () => (
  <Composition id="LessonISP" component={LessonISP} durationInFrames={LESSON_ISP_FRAMES} fps={30} width={1600} height={900} />
);

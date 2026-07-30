import React from 'react';
import {Composition} from 'remotion';
import {Lesson11A, LESSON_11A_FRAMES} from './Lesson11A';

export const Root11A: React.FC = () => (
  <Composition id="Lesson11A" component={Lesson11A} durationInFrames={LESSON_11A_FRAMES} fps={30} width={1600} height={900} />
);

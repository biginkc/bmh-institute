import React from 'react';
import {Composition} from 'remotion';
import {Lesson10A, LESSON_10A_FRAMES} from './Lesson10A';

export const Root10A: React.FC = () => (
  <Composition id="Lesson10A" component={Lesson10A} durationInFrames={LESSON_10A_FRAMES} fps={30} width={1600} height={900} />
);

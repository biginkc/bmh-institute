import React from 'react';
import {Composition} from 'remotion';
import {Lesson13A, LESSON_13A_FRAMES} from './Lesson13A';

export const Root13A: React.FC = () => (
  <Composition id="Lesson13A" component={Lesson13A} durationInFrames={LESSON_13A_FRAMES} fps={30} width={1600} height={900} />
);

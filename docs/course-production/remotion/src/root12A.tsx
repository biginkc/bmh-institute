import React from 'react';
import {Composition} from 'remotion';
import {Lesson12A, LESSON_12A_FRAMES} from './Lesson12A';

export const Root12A: React.FC = () => (
  <Composition id="Lesson12A" component={Lesson12A} durationInFrames={LESSON_12A_FRAMES} fps={30} width={1600} height={900} />
);

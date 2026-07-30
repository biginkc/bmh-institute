import React from 'react';
import {Composition} from 'remotion';
import {Lesson18A, LESSON_18A_FRAMES} from './Lesson18A';

export const Root18A: React.FC = () => (
  <Composition id="Lesson18A" component={Lesson18A} durationInFrames={LESSON_18A_FRAMES} fps={30} width={1600} height={900} />
);

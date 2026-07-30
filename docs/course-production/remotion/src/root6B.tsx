import React from 'react';
import {Composition} from 'remotion';
import {Lesson6B, LESSON_6B_FRAMES} from './Lesson6B';

export const Root6B: React.FC = () => (
  <Composition id="Lesson6B" component={Lesson6B} durationInFrames={LESSON_6B_FRAMES} fps={30} width={1600} height={900} />
);

import React from 'react';
import {Composition} from 'remotion';
import {Lesson4B, LESSON_4B_FRAMES} from './Lesson4B';

export const Root4B: React.FC = () => (
  <Composition id="Lesson4B" component={Lesson4B} durationInFrames={LESSON_4B_FRAMES} fps={30} width={1600} height={900} />
);

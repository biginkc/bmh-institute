import React from 'react';
import {Composition} from 'remotion';
import {Lesson2B, LESSON_2B_FRAMES} from './Lesson2B';
export const Root2B: React.FC = () => (
  <>
    <Composition id="Lesson2B" component={Lesson2B} durationInFrames={LESSON_2B_FRAMES} fps={30} width={1600} height={900} />
  </>
);

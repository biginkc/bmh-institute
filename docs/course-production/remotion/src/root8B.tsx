import React from 'react';
import {Composition} from 'remotion';
import {Lesson8B, LESSON_8B_FRAMES} from './Lesson8B';

export const Root8B: React.FC = () => (
  <Composition id="Lesson8B" component={Lesson8B} durationInFrames={LESSON_8B_FRAMES} fps={30} width={1600} height={900} />
);

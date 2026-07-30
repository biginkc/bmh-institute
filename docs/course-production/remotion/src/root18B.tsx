import React from 'react';
import {Composition} from 'remotion';
import {Lesson18B, LESSON_18B_FRAMES} from './Lesson18B';

export const Root18B: React.FC = () => (
  <Composition id="Lesson18B" component={Lesson18B} durationInFrames={LESSON_18B_FRAMES} fps={30} width={1600} height={900} />
);

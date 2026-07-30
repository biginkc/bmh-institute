// Isolated render root for Lesson2A only — bypasses Root.tsx (another tab registered a Lesson2B/Lesson3A
// whose manifest doesn't exist yet, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {Lesson2A, LESSON_2A_FRAMES} from './Lesson2A';

export const Root2A: React.FC = () => (
  <Composition id="Lesson2A" component={Lesson2A} durationInFrames={LESSON_2A_FRAMES} fps={30} width={1600} height={900} />
);

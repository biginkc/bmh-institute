// Isolated render root for Lesson TECH-A only — bypasses the shared Root.tsx (other tabs'
// registered lessons may lack manifests, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {LessonTECHA, LESSON_TECHA_FRAMES} from './LessonTECHA';

export const RootTECHA: React.FC = () => (
  <Composition id="LessonTECHA" component={LessonTECHA} durationInFrames={LESSON_TECHA_FRAMES} fps={30} width={1600} height={900} />
);

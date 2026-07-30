// Isolated render root for Lesson GLO-A only — bypasses the shared Root.tsx (other tabs'
// registered lessons may lack manifests, which breaks the shared bundle). Do not touch their files.
import React from 'react';
import {Composition} from 'remotion';
import {LessonGLOA, LESSON_GLOA_FRAMES} from './LessonGLOA';

export const RootGLOA: React.FC = () => (
  <Composition id="LessonGLOA" component={LessonGLOA} durationInFrames={LESSON_GLOA_FRAMES} fps={30} width={1600} height={900} />
);

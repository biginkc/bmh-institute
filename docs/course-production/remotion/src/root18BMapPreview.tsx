import React from 'react';
import {Composition} from 'remotion';
import {Lesson18BMapPreview, LESSON_18B_MAP_PREVIEW_FRAMES} from './Lesson18BMapPreview';

export const Root18BMapPreview: React.FC = () => (
  <Composition
    id="Lesson18BMapPreview"
    component={Lesson18BMapPreview}
    durationInFrames={LESSON_18B_MAP_PREVIEW_FRAMES}
    fps={30}
    width={1600}
    height={900}
  />
);

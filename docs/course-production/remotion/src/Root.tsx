import React from 'react';
import {Composition} from 'remotion';
import {CashProof} from './Video';
import {EffectsShowcase} from './Showcase';
import {LongWelcome} from './LongWelcome';
import {PilotCashAsis} from './PilotCashAsis';
import {LessonA, LESSON_A_FRAMES} from './LessonA';
import {LessonB, LESSON_B_FRAMES} from './LessonB';
import {LessonC, LESSON_C_FRAMES} from './LessonC';
import {Lesson2A, LESSON_2A_FRAMES} from './Lesson2A';
import {Lesson2B, LESSON_2B_FRAMES} from './Lesson2B';
import {Lesson3A, LESSON_3A_FRAMES} from './Lesson3A';
import {Lesson3B as Lesson3BPreviewB3, LESSON_3B_FRAMES as LESSON_3B_PREVIEW_B3_FRAMES} from './Lesson3B';
import {Lesson4A, LESSON_4A_FRAMES} from './Lesson4A';
import {Lesson19, LESSON_19_FRAMES} from './Lesson19';
import {LessonTECHA, LESSON_TECHA_FRAMES} from './LessonTECHA';
import {TextStyles} from './Sticker';
import {
  AndreaWelcomeBridge,
  ANDREA_WELCOME_BRIDGE_FRAMES,
} from './AndreaWelcomeBridge';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="CashProof" component={CashProof} durationInFrames={165} fps={30} width={1600} height={900} />
      <Composition id="EffectsShowcase" component={EffectsShowcase} durationInFrames={385} fps={30} width={1600} height={900} />
      <Composition id="LongWelcome" component={LongWelcome} durationInFrames={935} fps={30} width={1600} height={900} />
      <Composition id="PilotCashAsis" component={PilotCashAsis} durationInFrames={182} fps={30} width={1600} height={900} />
      <Composition id="TextStyles" component={TextStyles} durationInFrames={60} fps={30} width={1600} height={900} />
      <Composition id="LessonA" component={LessonA} durationInFrames={LESSON_A_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="LessonB" component={LessonB} durationInFrames={LESSON_B_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="LessonC" component={LessonC} durationInFrames={LESSON_C_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="Lesson2A" component={Lesson2A} durationInFrames={LESSON_2A_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="Lesson2B" component={Lesson2B} durationInFrames={LESSON_2B_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="Lesson3A" component={Lesson3A} durationInFrames={LESSON_3A_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="PreviewB3" component={Lesson3BPreviewB3} durationInFrames={LESSON_3B_PREVIEW_B3_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="Lesson4A" component={Lesson4A} durationInFrames={LESSON_4A_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="Lesson19" component={Lesson19} durationInFrames={LESSON_19_FRAMES} fps={30} width={1600} height={900} />
      <Composition id="LessonTECHA" component={LessonTECHA} durationInFrames={LESSON_TECHA_FRAMES} fps={30} width={1600} height={900} />
      <Composition
        id="AndreaWelcomeBridge"
        component={AndreaWelcomeBridge}
        durationInFrames={ANDREA_WELCOME_BRIDGE_FRAMES}
        fps={30}
        width={1600}
        height={900}
      />
    </>
  );
};

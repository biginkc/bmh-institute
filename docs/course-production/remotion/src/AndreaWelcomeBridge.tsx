import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';

export const ANDREA_COMMUTE_FRAMES = 2408;
export const WELCOME_1A_FRAMES = 7384;
export const LOCATION_CHANGE_FRAMES = 15;

export const ANDREA_WELCOME_BRIDGE_FRAMES =
  ANDREA_COMMUTE_FRAMES + WELCOME_1A_FRAMES - LOCATION_CHANGE_FRAMES;

const FullFrameVideo: React.FC<{
  src: string;
  durationInFrames: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  muteRange?: [number, number];
}> = ({src, durationInFrames, fadeIn = false, fadeOut = false, muteRange}) => {
  const frame = useCurrentFrame();

  const fadeInVolume = fadeIn
    ? interpolate(frame, [0, LOCATION_CHANGE_FRAMES], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const fadeOutVolume = fadeOut
    ? interpolate(
        frame,
        [durationInFrames - LOCATION_CHANGE_FRAMES, durationInFrames],
        [1, 0],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      )
    : 1;

  const mutedForAction = muteRange
    ? frame >= muteRange[0] && frame < muteRange[1]
    : false;

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <OffthreadVideo
        src={staticFile(src)}
        volume={mutedForAction ? 0 : Math.min(fadeInVolume, fadeOutVolume)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

export const AndreaWelcomeBridge: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={ANDREA_COMMUTE_FRAMES}>
          <FullFrameVideo
            src="andrea-welcome/andrea-commute.mp4"
            durationInFrames={ANDREA_COMMUTE_FRAMES}
            fadeOut
            // Exact parking-lot pull-in shot: 61.125s through the cut at 65.167s.
            muteRange={[1834, 1955]}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({direction: 'from-right'})}
          timing={linearTiming({durationInFrames: LOCATION_CHANGE_FRAMES})}
        />

        <TransitionSeries.Sequence durationInFrames={WELCOME_1A_FRAMES}>
          <FullFrameVideo
            src="andrea-welcome/welcome-1a-v9-qc-fixes-voice-pending.mp4"
            durationInFrames={WELCOME_1A_FRAMES}
            fadeIn
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

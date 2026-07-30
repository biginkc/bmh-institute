import React from 'react';
import {AbsoluteFill, Audio, Img, Loop, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {Sticker} from './Sticker';
import manifest from '../public/lesson6A/manifest.json';

/**
 * Lesson6A "Discovery" — audio = master clock (one continuous master.m4a, 1.0s inter-beat gaps).
 * Cafe-Andrea hero bookends (b01 badge, b09 outro). Office (b02) + fork (b07) Seedance scene clips.
 * b03 iceberg = code-motion "bob" (whole still rocks ±8px). b04 mask = two-phase "maskreveal"
 * (Andrea front clip until swapFrame, then mask still with push-in). Remaining stills push-in.
 * Every beat carries a word-timed white Sticker.
 */

const BLUE = '#62b3f3';

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  video?: string;
  clipFrames?: number;
  heroFrames?: number;
  label?: string;
  labelDelay?: number;
  badge?: boolean;
  swapFrame?: number;
  durationInFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const Label: React.FC<{beat: Beat}> = ({beat}) =>
  beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 12} bottomCenter /> : null;

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    <Label beat={beat} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const clip = beat.clipFrames ?? dur;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Loop durationInFrames={clip}>
        <OffthreadVideo muted src={staticFile(beat.video!)} style={{position: 'absolute', width: 1600, height: 900}} />
      </Loop>
      <Label beat={beat} />
    </AbsoluteFill>
  );
};

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1.0, 1.06], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Label beat={beat} />
    </AbsoluteFill>
  );
};

// b03 iceberg: whole still rocks like it floats — rigid ±8px vertical sine @ 0.22Hz.
const BobBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const y = 8 * Math.sin((2 * Math.PI * 0.22 * frame) / fps);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `translateY(${y}px)`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Label beat={beat} />
    </AbsoluteFill>
  );
};

// b04 mask: Andrea front clip plays until swapFrame, then cut to the mask still with a push-in.
const MaskRevealBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const swap = beat.swapFrame ?? 0;
  if (frame < swap && beat.hero) {
    return (
      <AbsoluteFill style={{backgroundColor: BLUE}}>
        <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
        <Label beat={beat} />
      </AbsoluteFill>
    );
  }
  const scale = interpolate(frame, [swap, dur], [1.0, 1.06], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Label beat={beat} />
    </AbsoluteFill>
  );
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'video') return <VideoBeat beat={b} dur={dur} />;
  if (b.mode === 'bob') return <BobBeat beat={b} dur={dur} />;
  if (b.mode === 'maskreveal') return <MaskRevealBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

const T = 12;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: 14};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(3)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

export const Lesson6A: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1]) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={b.tag} durationInFrames={b.durationInFrames + pad}>
              {beatContent(b, b.durationInFrames + pad)}
            </TransitionSeries.Sequence>
          );
          return trans
            ? [
                seq,
                <TransitionSeries.Transition
                  key={`${b.tag}-t`}
                  presentation={trans.presentation}
                  timing={linearTiming({durationInFrames: trans.frames})}
                />,
              ]
            : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_6A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

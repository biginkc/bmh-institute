import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {Sticker} from './Sticker';
import manifest from '../public/lesson11A/manifest.json';

const BLUE = '#62b3f3';

type Overlay = {
  text: string;
  delay: number;
};

type Beat = {
  tag: string;
  mode: 'hero' | 'video';
  hero?: string;
  videos?: string[];
  videoFrames?: number[];
  still?: string;
  overlays?: Overlay[];
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const OverlaySticker: React.FC<{overlay: Overlay}> = ({overlay}) => {
  const role = overlay.text.length > 22 ? 'caption' : 'label';
  return <Sticker text={overlay.text} role={role} bg="white" delay={overlay.delay} bottomCenter />;
};

const LABEL_EXIT_FRAMES = 10;
const LABEL_GAP_FRAMES = 4;

const Overlays: React.FC<{items?: Overlay[]}> = ({items = []}) => {
  const frame = useCurrentFrame();
  const sorted = [...items].sort((a, b) => a.delay - b.delay);
  const index = sorted.findIndex((overlay, i) => {
    const nextDelay = sorted[i + 1]?.delay ?? Number.POSITIVE_INFINITY;
    return frame >= overlay.delay && frame < nextDelay - LABEL_GAP_FRAMES;
  });
  if (index < 0) {
    return null;
  }

  const active = sorted[index];
  const nextDelay = sorted[index + 1]?.delay ?? Number.POSITIVE_INFINITY;
  const exitStart = nextDelay - LABEL_GAP_FRAMES - LABEL_EXIT_FRAMES;
  const exit = Number.isFinite(exitStart)
    ? interpolate(frame, [exitStart, exitStart + LABEL_EXIT_FRAMES], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - exit, transform: `translateY(${Math.round(exit * 34)}px)`}}>
      <OverlaySticker key={`${active.text}-${active.delay}`} overlay={active} />
    </div>
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo
        muted
        src={staticFile(beat.hero)}
        style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}}
      />
    ) : null}
    <Overlays items={beat.overlays} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const clips = beat.videos ?? [];
  const lens = beat.videoFrames ?? [];
  const starts: number[] = [];
  let acc = 0;
  for (const len of lens) {
    starts.push(acc);
    acc += len;
  }
  const tailStart = Math.min(acc, dur);

  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={Math.min(lens[i] ?? dur, dur)}>
          <OffthreadVideo
            muted
            src={staticFile(src)}
            style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}}
          />
        </Sequence>
      ))}
      {beat.still && frame >= tailStart ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      <Overlays items={beat.overlays} />
    </AbsoluteFill>
  );
};

const TRANSITION_FRAMES = 13;

const pickTransition = (prev: Beat, next: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: TRANSITION_FRAMES};
};

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') {
    return <HeroBeat beat={beat} />;
  }
  return <VideoBeat beat={beat} dur={dur} />;
};

export const Lesson11A: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const transition = i < beats.length - 1 ? pickTransition(beat, beats[i + 1]) : null;
          const pad = transition ? transition.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={beat.tag} durationInFrames={beat.durationInFrames + pad}>
              {beatContent(beat, beat.durationInFrames + pad)}
            </TransitionSeries.Sequence>
          );
          return transition
            ? [
                seq,
                <TransitionSeries.Transition
                  key={`${beat.tag}-transition`}
                  presentation={transition.presentation}
                  timing={linearTiming({durationInFrames: transition.frames})}
                />,
              ]
            : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_11A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

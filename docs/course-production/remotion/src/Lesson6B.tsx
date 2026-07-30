import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import manifest from '../public/lesson6B/manifest.json';

const baloo = loadBaloo();
const BLUE = '#62b3f3';
const WHITE = '#ffffff';
const INK = '#111111';
const TRANSITION = 15;
const LABEL_EXIT = 10;
const LABEL_GAP = 4;

type Label = {text: string; delay: number};
type Progress = {src: string; delay: number};
type Beat = {
  tag: string;
  mode: 'hero' | 'progressive' | 'corner' | 'still' | 'scene';
  durationInFrames: number;
  voFrames: number;
  transitionIn: 'fade' | 'slide' | 'cut';
  transitionOut: 'fade' | 'slide' | 'cut';
  hero?: string;
  still?: string;
  anim?: string;
  circle?: string;
  labels?: Label[];
  progress?: Progress[];
  push?: boolean;
  badge?: boolean;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95, zIndex: 40}}
  />
);

const Labels: React.FC<{labels?: Label[]}> = ({labels = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ordered = [...labels].sort((a, b) => a.delay - b.delay);
  const index = ordered.findIndex((label, itemIndex) => {
    const next = ordered[itemIndex + 1]?.delay ?? Number.POSITIVE_INFINITY;
    return frame >= label.delay && frame < next - LABEL_GAP;
  });
  if (index < 0) return null;
  const label = ordered[index];
  const next = ordered[index + 1]?.delay ?? Number.POSITIVE_INFINITY;
  const enter = spring({frame: frame - label.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
  const exitStart = Number.isFinite(next) ? Math.max(label.delay + 18, next - LABEL_GAP - LABEL_EXIT) : Number.POSITIVE_INFINITY;
  const exit = Number.isFinite(exitStart)
    ? interpolate(frame, [exitStart, next - LABEL_GAP], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 0;
  const opacity = Math.min(1, enter * 1.3) * (1 - exit);
  const y = (1 - enter) * 22 + exit * 34;
  const scale = 0.92 + Math.min(1, enter) * 0.08 - exit * 0.04;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 54,
        transform: `translateX(-50%) translateY(${y}px) scale(${scale})`,
        opacity,
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: 46,
        lineHeight: 1.05,
        color: INK,
        background: WHITE,
        padding: '10px 26px',
        borderRadius: 18,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        whiteSpace: 'nowrap',
        zIndex: 35,
      }}
    >
      {label.text}
    </div>
  );
};

const Progressive: React.FC<{progress: Progress[]; boardScale?: boolean}> = ({progress, boardScale = false}) => {
  const frame = useCurrentFrame();
  const active = [...progress].sort((a, b) => a.delay - b.delay).filter((item) => frame >= item.delay).at(-1) ?? progress[0];
  return (
    <Img
      src={staticFile(active.src)}
      style={boardScale
        ? {position: 'absolute', width: 1376, height: 774, left: 112, top: 0, objectFit: 'contain'}
        : {width: 1600, height: 900, objectFit: 'cover'}}
    />
  );
};

const AndreaCircle: React.FC<{src: string}> = ({src}) => (
  <div
    style={{
      position: 'absolute',
      right: 24,
      bottom: 24,
      width: 440,
      height: 440,
      borderRadius: '50%',
      overflow: 'hidden',
      border: '10px solid white',
      backgroundColor: BLUE,
      boxSizing: 'border-box',
      zIndex: 24,
    }}
  >
    <OffthreadVideo
      muted
      src={staticFile(src)}
      style={{position: 'absolute', width: 1600, height: 900, left: -580, top: 65}}
    />
  </div>
);

const BeatVisual: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const duration = beat.durationInFrames;
  let x = 0;
  let opacity = 1;
  if (beat.transitionIn === 'slide') {
    x += interpolate(frame, [0, TRANSITION], [1600, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  } else if (beat.transitionIn === 'fade') {
    opacity *= interpolate(frame, [0, TRANSITION], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  }
  if (beat.transitionOut === 'slide') {
    x += interpolate(frame, [duration - TRANSITION, duration - 1], [0, -1600], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  } else if (beat.transitionOut === 'fade') {
    opacity *= interpolate(frame, [duration - TRANSITION, duration - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  }
  const push = beat.push || (beat.mode === 'scene' && !beat.anim);
  const scale = push ? interpolate(frame, [0, duration - 1], [1, 1.045], {extrapolateRight: 'clamp'}) : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden', opacity, transform: `translateX(${x}px)`}}>
      <AbsoluteFill style={{transform: `scale(${scale})`}}>
        {beat.mode === 'hero' && beat.hero ? (
          <OffthreadVideo muted src={staticFile(beat.hero)} style={{width: 1600, height: 900, objectFit: 'cover'}} />
        ) : null}
        {beat.mode === 'progressive' && beat.progress ? (
          <Progressive progress={beat.progress} boardScale={beat.tag === 'b02_crmnotes' || beat.tag === 'b06_checklist'} />
        ) : null}
        {(beat.mode === 'still' || beat.mode === 'scene' || beat.mode === 'corner') && beat.anim ? (
          <OffthreadVideo muted src={staticFile(beat.anim)} style={{width: 1600, height: 900, objectFit: 'cover'}} />
        ) : null}
        {(beat.mode === 'still' || beat.mode === 'scene' || beat.mode === 'corner') && !beat.anim && beat.still ? (
          <Img src={staticFile(beat.still)} style={{width: 1600, height: 900, objectFit: 'cover'}} />
        ) : null}
      </AbsoluteFill>
      {beat.mode === 'corner' && beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {beat.badge ? <BmhBadge /> : null}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

export const LESSON_6B_FRAMES = manifest.totalFrames;

export const Lesson6B: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      {(manifest.beats as Beat[]).map((beat) => {
        const start = cursor;
        cursor += beat.durationInFrames;
        return (
          <Sequence key={beat.tag} from={start} durationInFrames={beat.durationInFrames}>
            <BeatVisual beat={beat} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

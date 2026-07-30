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
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import type {StickerRole} from './Sticker';
import manifest from '../public/lesson8B/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const CREAM = '#FFF7DE';
const YELLOW = '#FFD23F';
const ORANGE = '#FF7A00';
const INK = '#111111';
const WHITE = '#FFFFFF';
const TRANSITION = 13;
const LABEL_EXIT_FRAMES = 10;
const LABEL_GAP_FRAMES = 4;

type Label = {
  text: string;
  delay: number;
  place?: string;
  role?: StickerRole;
  top?: number;
  left?: number;
  bottomCenter?: boolean;
  until?: number;
};
type Beat = {
  tag: string;
  mode: 'hero' | 'video' | 'scene' | 'framework';
  durationInFrames: number;
  voFrames: number;
  hero?: string;
  heroStill?: string;
  still?: string;
  anim?: string;
  video?: string;
  tail?: string;
  tailFrame?: string;
  animFrames?: number;
  videoFrames?: number;
  labels?: Label[];
  stickers?: Label[];
  circle?: string;
  badge?: boolean;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95, zIndex: 35}}
  />
);

const LABEL_SIZES: Record<StickerRole, {fontSize: number; pad: string; radius: number}> = {
  title: {fontSize: 84, pad: '18px 44px', radius: 26},
  label: {fontSize: 46, pad: '10px 26px', radius: 18},
  caption: {fontSize: 32, pad: '8px 20px', radius: 14},
};

const metricPosition = (place: string) => {
  const index = Number(place.replace('metric', '')) || 1;
  const tops = [92, 268, 444, 648];
  return {left: 1128, top: tops[Math.max(0, Math.min(3, index - 1))], width: 398};
};

const CIRCLE = 340;
const AndreaCircle: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const bob = 5 * Math.sin((2 * Math.PI * frame) / 150);
  return (
    <div
      style={{
        position: 'absolute',
        left: 1600 - CIRCLE - 60,
        top: 900 - CIRCLE - 60,
        width: CIRCLE,
        height: CIRCLE,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '10px solid #ffffff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        transform: `translateY(${bob}px)`,
        backgroundColor: BLUE,
        zIndex: 18,
      }}
    >
      <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1984, height: 1116, left: -786, top: -183}} />
    </div>
  );
};

const Labels: React.FC<{labels?: Label[]}> = ({labels = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ordered = [...labels].sort((a, b) => a.delay - b.delay);
  const activeIndex = ordered.findIndex((label, i) => {
    const nextDelay = ordered[i + 1]?.delay ?? Number.POSITIVE_INFINITY;
    return frame >= label.delay && frame < nextDelay - LABEL_GAP_FRAMES;
  });

  if (activeIndex < 0) return null;

  const label = ordered[activeIndex];
  const role = label.role ?? 'label';
  const size = LABEL_SIZES[role];
  const nextDelay = ordered[activeIndex + 1]?.delay ?? Number.POSITIVE_INFINITY;
  const enter = spring({
    frame: frame - label.delay,
    fps,
    config: {damping: 11, stiffness: 170},
    durationInFrames: 20,
  });
  const exitStart = Number.isFinite(nextDelay)
    ? Math.max(label.delay + 20, nextDelay - LABEL_GAP_FRAMES - LABEL_EXIT_FRAMES)
    : Number.POSITIVE_INFINITY;
  const exit = Number.isFinite(exitStart)
    ? interpolate(frame, [exitStart, nextDelay - LABEL_GAP_FRAMES], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const opacity = Math.min(1, enter * 1.35) * (1 - exit);
  const y = (1 - enter) * 22 + exit * 34;
  const scale = 0.92 + Math.min(1, enter) * 0.08 - exit * 0.04;
  const metric = Boolean(label.place?.startsWith('metric'));
  const spatial = !metric && typeof label.top === 'number' && typeof label.left === 'number';

  return (
    <div
      key={`${label.text}-${label.delay}`}
      style={{
        position: 'absolute',
        ...(metric
          ? metricPosition(label.place ?? 'metric1')
          : spatial
            ? {top: label.top, left: label.left, transform: `translateY(${y}px) scale(${scale})`}
            : {bottom: 58, left: '50%', transform: `translateX(-50%) translateY(${y}px) scale(${scale})`}),
        ...(metric ? {transform: `translateY(${y}px) scale(${scale})`, transformOrigin: 'center center'} : {}),
        opacity,
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: metric ? 24 : spatial ? 30 : size.fontSize,
        lineHeight: metric || spatial ? 1.0 : 1.05,
        letterSpacing: 0,
        color: INK,
        background: WHITE,
        padding: metric ? '8px 16px' : size.pad,
        boxSizing: 'border-box',
        borderRadius: metric ? 12 : size.radius,
        textAlign: 'center',
        whiteSpace: metric || spatial ? 'pre-line' : 'nowrap',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        zIndex: 28,
      }}
    >
      {label.text}
    </div>
  );
};

const Text: React.FC<{
  children: React.ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  center?: boolean;
  style?: React.CSSProperties;
}> = ({children, size = 42, weight = 800, color = INK, center = false, style}) => (
  <div
    style={{
      fontFamily: baloo.fontFamily,
      fontWeight: weight,
      fontSize: size,
      color,
      lineHeight: 1.04,
      letterSpacing: 0,
      textAlign: center ? 'center' : 'left',
      ...style,
    }}
  >
    {children}
  </div>
);

const ListingOverlay: React.FC = () => (
  <>
    <Text size={25} style={{position: 'absolute', left: 270, top: 647, width: 620, zIndex: 20}}>
      7428 Sandbar Loop, Phoenix, AZ
    </Text>
    <Text size={47} style={{position: 'absolute', left: 270, top: 590, width: 610, zIndex: 20}}>
      $284,900
    </Text>
    {['3 beds', '2 baths', '1,842 sqft'].map((text, i) => (
      <Text key={text} size={23} center style={{position: 'absolute', left: 246 + i * 272, top: 748, width: 184, zIndex: 20}}>
        {text}
      </Text>
    ))}
    <Text size={30} center style={{position: 'absolute', left: 1078, top: 156, width: 245, zIndex: 20}}>
      Get a cash offer
    </Text>
    <Text size={22} center style={{position: 'absolute', left: 1092, top: 245, width: 224, lineHeight: 1.15, zIndex: 20}}>
      Fast close
      <br />
      No repairs
      <br />
      No commissions
    </Text>
  </>
);

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} /> : null}
    {!beat.hero && beat.heroStill ? <Img src={staticFile(beat.heroStill)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} /> : null}
    <Labels labels={beat.labels ?? beat.stickers} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const tail = beat.tail ?? beat.tailFrame;
  const anim = beat.anim ?? beat.video;
  const tailStart = beat.animFrames ?? beat.videoFrames ?? 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {tail && frame >= tailStart ? (
        <Img src={staticFile(tail)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      {!tail && beat.still ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      {anim ? (
        <Sequence from={0} durationInFrames={Math.min(tailStart, dur)}>
          <OffthreadVideo muted src={staticFile(anim)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
        </Sequence>
      ) : null}
      {beat.tag === 'b02_flip_profit' ? <ListingOverlay /> : null}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      <Labels labels={beat.labels ?? beat.stickers} />
    </AbsoluteFill>
  );
};

const FrameworkBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = [
    {text: 'LISTEN', delay: 40, fontSize: 36},
    {text: 'ACKNOWLEDGE', delay: 118, fontSize: 27},
    {text: 'ASK', delay: 186, fontSize: 36},
    {text: 'REDIRECT', delay: 270, fontSize: 32},
  ];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 205, top: 448, width: 1188, height: 14, background: INK, borderRadius: 14}} />
      <div
        style={{
          position: 'absolute',
          left: 108,
          top: 385,
          width: 92,
          height: 92,
          borderRadius: 28,
          border: `7px solid ${INK}`,
          background: WHITE,
          transform: 'rotate(-12deg)',
          zIndex: 5,
        }}
      >
        <div style={{position: 'absolute', left: 21, top: 28, width: 50, height: 28, borderRadius: 18, background: ORANGE}} />
      </div>
      <div style={{position: 'absolute', right: 112, top: 398, width: 105, height: 64, zIndex: 5}}>
        <div style={{position: 'absolute', left: 0, top: 25, width: 70, height: 14, borderRadius: 10, background: INK}} />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 5,
            width: 0,
            height: 0,
            borderTop: '31px solid transparent',
            borderBottom: '31px solid transparent',
            borderLeft: `44px solid ${INK}`,
          }}
        />
      </div>
      {steps.map((step, i) => {
        const p = Math.max(
          0,
          Math.min(1, spring({frame: frame - step.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18})),
        );
        return (
          <div
            key={step.text}
            style={{
              position: 'absolute',
              left: 235 + i * 305,
              top: 330,
              width: 250,
              height: 180,
              borderRadius: 22,
              background: i === 1 ? YELLOW : CREAM,
              border: `7px solid ${INK}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + p * 0.1})`,
              opacity: p,
              boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
              zIndex: 10,
            }}
          >
            <Text size={step.fontSize} center>
              {step.text}
            </Text>
          </div>
        );
      })}
      <Labels labels={beat.labels ?? beat.stickers} />
    </AbsoluteFill>
  );
};

const FadeEnvelope: React.FC = () => {
  const frame = useCurrentFrame();
  const total = (manifest as {totalFrames: number}).totalFrames;
  const fadeIn = interpolate(frame, [0, 16], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [Math.max(0, total - 18), total], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.max(fadeIn, fadeOut);
  return <AbsoluteFill style={{backgroundColor: BLUE, opacity, pointerEvents: 'none', zIndex: 60}} />;
};

const noTransition = (prev: Beat, next: Beat) => {
  const key = `${prev.tag}->${next.tag}`;
  return key === 'b07_belongings_relief->b08_pattern_framework' || key === 'b08_pattern_framework->b09_heart_of_the_work';
};

const pickTransition = (_prev: Beat, _next: Beat) => ({presentation: slide({direction: 'from-right' as const}), frames: TRANSITION});

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} />;
  if (beat.mode === 'framework') return <FrameworkBeat beat={beat} />;
  return <VideoBeat beat={beat} dur={dur} />;
};

export const Lesson8B: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const next = beats[i + 1];
          const trans = next && !noTransition(beat, next) ? pickTransition(beat, next) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={beat.tag} durationInFrames={beat.durationInFrames + pad}>
              {beatContent(beat, beat.durationInFrames + pad)}
            </TransitionSeries.Sequence>
          );
          return trans
            ? [
                seq,
                <TransitionSeries.Transition
                  key={`${beat.tag}-transition`}
                  presentation={trans.presentation}
                  timing={linearTiming({durationInFrames: trans.frames})}
                />,
              ]
            : [seq];
        })}
      </TransitionSeries>
      <FadeEnvelope />
    </AbsoluteFill>
  );
};

export const LESSON_8B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

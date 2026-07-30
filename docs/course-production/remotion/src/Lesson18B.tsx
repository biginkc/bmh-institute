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
import manifest from '../public/lesson18B/manifest.json';

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

type Label = {text: string; delay: number; place: string; role?: StickerRole};
type Row = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: 'hero' | 'video' | 'scene' | 'norms' | 'systems' | 'smsExchange';
  durationInFrames: number;
  voFrames: number;
  hero?: string;
  heroFreezeFrame?: string;
  heroFreezeFromFrame?: number;
  still?: string;
  anim?: string;
  tail?: string;
  animFrames?: number;
  labels?: Label[];
  rows?: Row[];
  badge?: boolean;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95, zIndex: 30}}
  />
);

const LABEL_SIZES: Record<StickerRole, {fontSize: number; pad: string; radius: number}> = {
  title: {fontSize: 84, pad: '18px 44px', radius: 26},
  label: {fontSize: 48, pad: '10px 26px', radius: 18},
  caption: {fontSize: 34, pad: '8px 22px', radius: 14},
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

  return (
    <div
      key={`${label.text}-${label.delay}`}
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: `translateX(-50%) translateY(${y}px) scale(${scale})`,
        opacity,
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: size.fontSize,
        lineHeight: 1.05,
        letterSpacing: 0,
        color: INK,
        background: WHITE,
        padding: size.pad,
        borderRadius: size.radius,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        zIndex: 25,
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

const pop = (frame: number, fps: number, delay: number) =>
  Math.max(0, Math.min(1, spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18})));

const PhoneShell: React.FC<{side: 'left' | 'right'}> = ({side}) => {
  const left = side === 'left' ? 95 : 1075;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 122,
        width: 430,
        height: 640,
        borderRadius: 48,
        background: CREAM,
        border: `8px solid ${INK}`,
        boxSizing: 'border-box',
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 52,
          width: 354,
          height: 512,
          borderRadius: 32,
          background: WHITE,
          border: `6px solid ${INK}`,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{position: 'absolute', left: 118, top: 18, width: 118, height: 14, borderRadius: 12, background: INK}} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 48,
              top: 116 + i * 98,
              width: 242,
              height: 56,
              borderRadius: 22,
              border: `4px solid ${INK}`,
              background: i % 2 === 0 ? CREAM : WHITE,
              opacity: 0.28,
            }}
          />
        ))}
      </div>
      <div style={{position: 'absolute', left: 142, bottom: 30, width: 146, height: 14, borderRadius: 14, background: INK}} />
    </div>
  );
};

const bubbleEase = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

const TravelingMessage: React.FC<{
  frame: number;
  offset: number;
  direction: 'ltr' | 'rtl';
  lane: number;
  text: string;
  fill: string;
}> = ({frame, offset, direction, lane, text, fill}) => {
  const cycle = 240;
  const activeFrames = 120;
  const phase = (((frame - offset) % cycle) + cycle) % cycle;
  if (phase >= activeFrames) return null;

  const progress = phase / activeFrames;
  const eased = bubbleEase(progress);
  const leftStart = 235;
  const rightStart = 1160;
  const x = direction === 'ltr' ? leftStart + (rightStart - leftStart) * eased : rightStart - (rightStart - leftStart) * eased;
  const y = 220 + lane * 100 + Math.sin((progress * Math.PI * 2 + lane) * 0.65) * 7;
  const opacity = interpolate(progress, [0, 0.1, 0.82, 1], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(progress, [0, 0.1, 0.9, 1], [0.88, 1, 1, 0.92], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 220,
        minHeight: 64,
        borderRadius: 26,
        background: fill,
        border: `6px solid ${INK}`,
        boxSizing: 'border-box',
        padding: '12px 18px',
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: 14,
        boxShadow: '0 10px 18px rgba(0,0,0,0.10)',
      }}
    >
      <Text size={28} weight={800} center>
        {text}
      </Text>
    </div>
  );
};

const SmsExchangeBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const messages = [
    {offset: 0, direction: 'ltr' as const, lane: 0, text: 'Draft text', fill: YELLOW},
    {offset: 60, direction: 'rtl' as const, lane: 2, text: 'Reviewing', fill: WHITE},
    {offset: 120, direction: 'ltr' as const, lane: 1, text: 'Can send?', fill: CREAM},
    {offset: 180, direction: 'rtl' as const, lane: 3, text: 'Approved', fill: ORANGE},
  ];

  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      <PhoneShell side="left" />
      <PhoneShell side="right" />
      {messages.map((message) => (
        <TravelingMessage key={`${message.text}-${message.offset}`} frame={frame} {...message} />
      ))}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const HeroBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const freezeFrom = beat.heroFreezeFromFrame;
  const freezeActive = Boolean(beat.heroFreezeFrame && typeof freezeFrom === 'number' && frame >= freezeFrom);
  const freezePush =
    freezeActive && typeof freezeFrom === 'number'
      ? interpolate(frame, [freezeFrom, Math.max(freezeFrom + 1, dur)], [1, 1.024], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.hero && !freezeActive ? (
        <Sequence from={0} durationInFrames={typeof freezeFrom === 'number' ? freezeFrom : dur}>
          <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
        </Sequence>
      ) : null}
      {freezeActive && beat.heroFreezeFrame ? (
        <Img
          src={staticFile(beat.heroFreezeFrame)}
          style={{
            position: 'absolute',
            width: 1600,
            height: 900,
            objectFit: 'cover',
            transform: `scale(${freezePush})`,
            transformOrigin: 'center center',
          }}
        />
      ) : null}
      <Labels labels={beat.labels} />
      {beat.badge ? <BmhBadge /> : null}
    </AbsoluteFill>
  );
};

const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const tailStart = beat.animFrames ?? 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.tail && frame >= tailStart ? (
        <Img src={staticFile(beat.tail)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      {!beat.tail && beat.still ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      {beat.anim ? (
        <Sequence from={0} durationInFrames={Math.min(tailStart, dur)}>
          <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
        </Sequence>
      ) : null}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.025], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover', transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const NormsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rows = beat.rows ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Text size={64} center style={{position: 'absolute', top: 94, left: 0, width: 1600}}>
        TEAM NORMS
      </Text>
      {rows.map((row, i) => {
        const a = pop(frame, fps, row.delay);
        return (
          <div
            key={row.text}
            style={{
              position: 'absolute',
              left: 260,
              top: 240 + i * 145,
              width: 1080,
              height: 104,
              borderRadius: 18,
              background: i === 0 ? YELLOW : WHITE,
              border: `6px solid ${INK}`,
              transform: `translateX(${(1 - a) * -46}px) scale(${0.9 + a * 0.1})`,
              opacity: a,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
            }}
          >
            <Text size={42} center>
              {row.text}
            </Text>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const SystemsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rows = beat.rows ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Text size={60} center style={{position: 'absolute', top: 92, left: 0, width: 1600}}>
        DAY-TO-DAY FLOW
      </Text>
      <div style={{position: 'absolute', left: 180, top: 342, width: 1240, height: 14, background: INK, borderRadius: 10}} />
      {rows.map((row, i) => {
        const a = pop(frame, fps, row.delay);
        return (
          <React.Fragment key={row.text}>
            {i < rows.length - 1 ? (
              <Text size={62} color={INK} center style={{position: 'absolute', left: 475 + i * 390, top: 300, opacity: a}}>
                →
              </Text>
            ) : null}
            <div
              style={{
                position: 'absolute',
                left: 140 + i * 440,
                top: 250,
                width: 340,
                height: 205,
                borderRadius: 22,
                background: i === 1 ? YELLOW : CREAM,
                border: `7px solid ${INK}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 24px',
                boxSizing: 'border-box',
                transform: `translateY(${(1 - a) * 30}px) scale(${0.9 + a * 0.1})`,
                opacity: a,
                boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
              }}
            >
              <Text size={32} center>
                {row.text}
              </Text>
            </div>
          </React.Fragment>
        );
      })}
      <Text size={38} center color={ORANGE} style={{position: 'absolute', bottom: 132, left: 0, width: 1600}}>
        LEARN THE FLOW. FOLLOW THE PROCESS.
      </Text>
    </AbsoluteFill>
  );
};

const pickTransition = (prev: Beat, next: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: TRANSITION};
};

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} dur={dur} />;
  if (beat.mode === 'scene') return <SceneBeat beat={beat} dur={dur} />;
  if (beat.mode === 'norms') return <NormsBeat beat={beat} />;
  if (beat.mode === 'systems') return <SystemsBeat beat={beat} />;
  if (beat.mode === 'smsExchange') return <SmsExchangeBeat beat={beat} />;
  return <VideoBeat beat={beat} dur={dur} />;
};

export const Lesson18B: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const trans = i < beats.length - 1 ? pickTransition(beat, beats[i + 1]) : null;
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
    </AbsoluteFill>
  );
};

export const LESSON_18B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

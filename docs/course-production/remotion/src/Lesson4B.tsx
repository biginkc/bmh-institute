import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import manifest from '../public/lesson4B/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const WHITE = '#FFFFFF';
const INK = '#111111';

type Label = {
  text: string;
  delay: number;
  placement: 'top' | 'bottom';
};

type Beat = {
  tag: string;
  mode: 'hero' | 'framework' | 'scene' | 'structure' | 'rule8020';
  step: number;
  still?: string;
  hero?: string;
  heroFrames?: number;
  videos?: string[];
  videoFrames?: number[];
  tailFrame?: string;
  labels?: Label[];
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
  animationStatus: string;
};

const STEPS = ['INTRO', 'FACT FIND', 'PITCH', 'OFFER', 'CLOSE'];

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const LabelPill: React.FC<{label: Label; exitAt?: number}> = ({label, exitAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - label.delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 18});
  const exit = exitAt === undefined ? 1 : interpolate(frame, [exitAt, exitAt + 10], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const visible = clamp01(enter) * exit;
  const y = exitAt !== undefined && frame >= exitAt ? interpolate(frame, [exitAt, exitAt + 10], [0, 28], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 150,
        left: '50%',
        transform: `translateX(-50%) translateY(${y}px) scale(${visible})`,
        opacity: visible,
        background: WHITE,
        borderRadius: 18,
        padding: '10px 30px',
        fontFamily: baloo.fontFamily,
        fontWeight: 800,
        fontSize: label.text.length > 22 ? 34 : 42,
        color: INK,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
      }}
    >
      {label.text}
    </div>
  );
};

const Labels: React.FC<{labels?: Label[]; dur: number}> = ({labels = [], dur}) => {
  const frame = useCurrentFrame();
  const queue = [...labels].sort((a, b) => a.delay - b.delay);
  const activeIndex = queue.findIndex((label, i) => {
    const next = queue[i + 1];
    const end = next ? Math.max(label.delay, next.delay - 10) : dur;
    return frame >= label.delay && frame < end + 10;
  });
  if (activeIndex < 0) return null;
  const label = queue[activeIndex];
  const next = queue[activeIndex + 1];
  const exitAt = next ? Math.max(label.delay, next.delay - 10) : undefined;
  return <LabelPill key={`${label.text}-${label.delay}`} label={label} exitAt={exitAt} />;
};

const StepStrip: React.FC<{active: number; y?: number; compact?: boolean}> = ({active, y = 760, compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const w = compact ? 210 : 260;
  const gap = compact ? 12 : 18;
  const h = compact ? 72 : 88;
  const total = STEPS.length * w + (STEPS.length - 1) * gap;
  const left0 = (1600 - total) / 2;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: 1600, height: 900}}>
      <div
        style={{
          position: 'absolute',
          left: left0 + w / 2,
          top: y + h / 2 - 3,
          width: total - w,
          height: 6,
          background: INK,
          opacity: 0.18,
          borderRadius: 6,
        }}
      />
      {STEPS.map((name, i) => {
        const n = i + 1;
        const isActive = active === n;
        const isDone = active > n;
        const delay = i * 5;
        const pop = spring({frame: frame - delay, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 16});
        const bg = isActive ? YELLOW : isDone ? CREAM : WHITE;
        const opacity = active === 0 || isActive || isDone ? 1 : 0.72;
        return (
          <div
            key={name}
            style={{
              position: 'absolute',
              left: left0 + i * (w + gap),
              top: y,
              width: w,
              height: h,
              borderRadius: 18,
              background: bg,
              opacity: Math.min(opacity, Math.max(0, pop * 1.4)),
              transform: `scale(${0.9 + 0.1 * Math.max(0, Math.min(1, pop))})`,
              boxShadow: '0 8px 22px rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: baloo.fontFamily,
              color: INK,
            }}
          >
            <span style={{fontWeight: 900, fontSize: compact ? 28 : 34, lineHeight: 1}}>{n}</span>
            <span style={{fontWeight: 800, fontSize: compact ? 19 : 23, lineHeight: 1.05, textAlign: 'center'}}>{name}</span>
          </div>
        );
      })}
    </div>
  );
};

const SceneStill: React.FC<{beat: Beat; dur: number; push?: number}> = ({beat, dur, push = 1.025}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1, push], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (!beat.still) return null;
  return (
    <Img
      src={staticFile(beat.still)}
      style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
    />
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const clips = beat.videos ?? [];
  const lens = beat.videoFrames ?? [];
  const hasClips = clips.length > 0 && lens.length === clips.length;
  const starts: number[] = [];
  let acc = 0;
  for (const len of lens) {
    starts.push(acc);
    acc += len;
  }
  const tailStart = Math.min(acc, dur);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {!hasClips ? <SceneStill beat={beat} dur={dur} /> : null}
      {clips.map((src, i) => {
        const remaining = dur - starts[i];
        if (remaining <= 0) return null;
        return (
          <Sequence key={src} from={starts[i]} durationInFrames={Math.min(lens[i], remaining)}>
            <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
          </Sequence>
        );
      })}
      {hasClips && beat.tailFrame && tailStart < dur ? (
        <Sequence from={tailStart} durationInFrames={dur - tailStart}>
          <Img src={staticFile(beat.tailFrame)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {beat.step > 0 ? <StepStrip active={beat.step} /> : null}
      <Labels labels={beat.labels} dur={dur} />
    </AbsoluteFill>
  );
};

const FrameworkBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <SceneStill beat={beat} dur={dur} push={1.01} />
    <StepStrip active={beat.step} />
    <Labels labels={beat.labels} dur={dur} />
  </AbsoluteFill>
);

const StructureBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s1 = spring({frame: frame - 20, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 20});
  const s2 = spring({frame: frame - 95, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 20});
  const card = (left: number, top: number, title: string, sub: string, scale: number) => (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 560,
        height: 260,
        borderRadius: 24,
        background: WHITE,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        transform: `scale(${0.9 + 0.1 * Math.max(0, Math.min(1, scale))})`,
        opacity: Math.min(1, scale * 1.4),
        fontFamily: baloo.fontFamily,
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{fontWeight: 900, fontSize: 58}}>{title}</div>
      <div style={{fontWeight: 700, fontSize: 34, marginTop: 10}}>{sub}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <StepStrip active={0} y={96} compact />
      {card(190, 360, 'PIPELINE', 'where the lead is', s1)}
      {card(850, 360, 'FRAMEWORK', 'how the call moves', s2)}
      <Labels labels={beat.labels} dur={dur} />
    </AbsoluteFill>
  );
};

const Rule8020Beat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const grow = spring({frame: frame - 85, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 24});
  const personW = interpolate(Math.max(0, Math.min(1, grow)), [0, 1], [0, 760]);
  const houseW = interpolate(Math.max(0, Math.min(1, grow)), [0, 1], [0, 190]);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <SceneStill beat={beat} dur={dur} push={1.015} />
      <div style={{position: 'absolute', left: 335, bottom: 88, width: 930, height: 44, borderRadius: 22, background: WHITE, boxShadow: '0 10px 30px rgba(0,0,0,0.10)', overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, top: 0, height: 44, width: personW, background: YELLOW}} />
        <div style={{position: 'absolute', right: 0, top: 0, height: 44, width: houseW, background: CREAM}} />
      </div>
      <Labels labels={beat.labels} dur={dur} />
    </AbsoluteFill>
  );
};

const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.videos?.length) return <SceneBeat beat={b} dur={dur} />;
  if (b.mode === 'framework') return <FrameworkBeat beat={b} dur={dur} />;
  if (b.mode === 'structure') return <StructureBeat beat={b} dur={dur} />;
  if (b.mode === 'rule8020') return <Rule8020Beat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const Lesson4B: React.FC = () => {
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

export const LESSON_4B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

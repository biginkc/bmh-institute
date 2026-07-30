import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
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
import manifest from '../public/lesson19/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const INK = '#111111';

type Label = {text: string; delay: number; place: string};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  heroTakes?: string[];
  heroTakeFrames?: number[];
  circle?: string;
  side?: string;
  labels: Label[];
  badge?: boolean;
  durationInFrames: number;
  voFrames?: number;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

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
        zIndex: 20,
      }}
    >
      <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1920, height: 1080, left: -790, top: -17}} />
    </div>
  );
};

const pop = (frame: number, fps: number, delay: number) =>
  Math.max(0, Math.min(1, spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18})));

const labelPosition = (place: string): React.CSSProperties => {
  const center = {left: '50%', transform: 'translateX(-50%)'};
  const base: Record<string, React.CSSProperties> = {
    title: {top: 56, ...center},
    top: {top: 62, ...center},
    bottom: {bottom: 64, ...center},
    bottom2: {bottom: 142, ...center},
    b08callout: {right: 54, top: 18},
    center: {top: 380, ...center},
    closeAction: {top: 560, ...center},
    left: {left: 70, top: 250},
    left2: {left: 70, top: 330},
    left3: {left: 70, top: 410},
    right: {right: 70, top: 250},
    topleft: {left: 70, top: 70},
    topright: {right: 70, top: 70},
    score1: {left: 500, top: 154},
    score2: {left: 500, top: 286},
    score3: {left: 500, top: 420},
    score4: {left: 500, top: 556},
    score5: {left: 500, top: 692},
  };
  return base[place] ?? base.bottom;
};

const OverlayLabel: React.FC<{label: Label; i?: number; hideAt?: number}> = ({label, i = 0, hideAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = pop(frame, fps, label.delay);
  const fadeOut =
    hideAt === undefined
      ? 1
      : interpolate(frame, [Math.min(hideAt - 1, Math.max(label.delay + 18, hideAt - 12)), hideAt], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  const pos = labelPosition(label.place);
  const long = label.text.length > 22;
  const title = label.place === 'title';
  const compact = label.place === 'b08callout';
  const transformPrefix = typeof pos.transform === 'string' ? `${pos.transform} ` : '';
  return (
    <div
      style={{
        position: 'absolute',
        ...pos,
        transform: `${transformPrefix}scale(${a})`,
        transformOrigin: label.place.includes('right') || pos.right !== undefined ? 'right center' : 'center center',
        opacity: Math.min(1, a * 1.35) * fadeOut,
        zIndex: 30 + i,
        background: '#ffffff',
        color: INK,
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: title ? 76 : compact ? (long ? 30 : 36) : long ? 34 : 43,
        lineHeight: 1.05,
        padding: title ? '18px 42px' : compact ? '8px 18px' : '10px 24px',
        borderRadius: title ? 24 : 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.11)',
        whiteSpace: 'nowrap',
      }}
    >
      {label.text}
    </div>
  );
};

const SceneStill: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, Math.max(1, dur)], [1, 1.035], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const queued = ['b03_clean_handoffs', 'b05_complex_leads_mentor', 'b08_management_path'].includes(beat.tag);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{
            position: 'absolute',
            width: 1600,
            height: 900,
            transform: `scale(${k})`,
            transformOrigin: 'center center',
          }}
        />
      ) : null}
      {beat.labels.map((label, i) => {
        const hideAt = queued && beat.labels[i + 1] ? Math.max(label.delay + 18, beat.labels[i + 1].delay - 2) : undefined;
        return <OverlayLabel key={`${label.text}-${i}`} label={label} i={i} hideAt={hideAt} />;
      })}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
    </AbsoluteFill>
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const isFinalClose = beat.tag === 'b13_course_close';
  const takes = beat.heroTakes ?? [];
  const lens = beat.heroTakeFrames ?? [];
  const cut = lens[0] ?? Math.round(beat.durationInFrames / 2);
  const secondLength = lens[1] ?? Math.max(1, beat.durationInFrames - cut);
  const takeFrames = cut + secondLength;
  const closeFade = isFinalClose
    ? interpolate(frame, [beat.durationInFrames - 18, beat.durationInFrames - 2], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const heroStyle: React.CSSProperties = {position: 'absolute', width: 1600, height: 900};
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={heroStyle} /> : null}
      {takes[0] ? (
        <Sequence from={0} durationInFrames={Math.max(1, cut)}>
          <OffthreadVideo muted src={staticFile(takes[0])} style={heroStyle} />
        </Sequence>
      ) : null}
      {takes[1] ? (
        <Sequence from={cut} durationInFrames={Math.max(1, secondLength)}>
          <OffthreadVideo muted src={staticFile(takes[1])} style={heroStyle} />
        </Sequence>
      ) : null}
      {isFinalClose && takes[1] && beat.durationInFrames > takeFrames ? (
        <Sequence from={takeFrames} durationInFrames={beat.durationInFrames - takeFrames}>
          <Freeze frame={Math.max(0, secondLength - 1)}>
            <OffthreadVideo muted src={staticFile(takes[1])} style={heroStyle} />
          </Freeze>
        </Sequence>
      ) : null}
      {beat.labels.map((label, i) => <OverlayLabel key={`${label.text}-${i}`} label={label} i={i} />)}
      {beat.badge ? <BmhBadge /> : null}
      {isFinalClose ? <AbsoluteFill style={{backgroundColor: BLUE, opacity: closeFade, pointerEvents: 'none'}} /> : null}
    </AbsoluteFill>
  );
};

const RowCard: React.FC<{text: string; delay: number; top: number; left?: number; width?: number; done?: boolean}> = ({text, delay, top, left = 330, width = 930, done = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = pop(frame, fps, delay);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height: 74,
        borderRadius: 18,
        background: '#ffffff',
        boxShadow: '0 9px 24px rgba(0,0,0,0.11)',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 24px',
        opacity: a,
        transform: `translateY(${(1 - a) * 22}px) scale(${0.96 + 0.04 * a})`,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          border: '5px solid #111',
          background: done ? YELLOW : CREAM,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: baloo.fontFamily,
          fontWeight: 900,
          fontSize: 30,
        }}
      >
        {done ? '✓' : ''}
      </div>
      <div style={{fontFamily: baloo.fontFamily, fontWeight: 800, fontSize: text.length > 24 ? 34 : 42, color: INK}}>{text}</div>
    </div>
  );
};

const SCORE_ROWS = [
  {boxTop: 194, labelTop: 202},
  {boxTop: 322, labelTop: 330},
  {boxTop: 450, labelTop: 458},
  {boxTop: 578, labelTop: 586},
  {boxTop: 706, labelTop: 714},
];

const ScorecardRow: React.FC<{label: Label; row: number}> = ({label, row}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = pop(frame, fps, label.delay);
  const pos = SCORE_ROWS[row];
  const long = label.text.length > 22;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 384,
          top: pos.boxTop,
          width: 88,
          height: 86,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: baloo.fontFamily,
          fontWeight: 900,
          fontSize: 58,
          color: INK,
          opacity: a,
          transform: `scale(${a})`,
          transformOrigin: 'center center',
          zIndex: 12,
        }}
      >
        ✓
      </div>
      <div
        style={{
          position: 'absolute',
          left: 500,
          top: pos.labelTop,
          minWidth: long ? 480 : 280,
          height: 70,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderRadius: 14,
          background: '#ffffff',
          color: INK,
          boxShadow: '0 7px 18px rgba(0,0,0,0.10)',
          fontFamily: baloo.fontFamily,
          fontWeight: 800,
          fontSize: long ? 31 : 39,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          opacity: a,
          transform: `translateY(${(1 - a) * 12}px) scale(${0.97 + a * 0.03})`,
          transformOrigin: 'left center',
          zIndex: 11,
        }}
      >
        {label.text}
      </div>
    </>
  );
};

const ScorecardBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, Math.max(1, beat.durationInFrames)], [1, 1.018], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          width: 1600,
          height: 900,
          transform: `scale(${k})`,
          transformOrigin: 'center center',
        }}
      >
        {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
        {beat.labels.map((label, i) => <ScorecardRow key={label.text} label={label} row={i} />)}
      </div>
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
    </AbsoluteFill>
  );
};

const CheckpointBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <div style={{position: 'absolute', left: 250, top: 95, width: 1100, height: 670, borderRadius: 28, background: CREAM, border: '7px solid #111', boxShadow: '0 16px 34px rgba(0,0,0,0.12)'}} />
    <OverlayLabel label={{text: 'READINESS CHECKPOINT', delay: 6, place: 'top'}} />
    {beat.labels.map((label, i) => (
      <RowCard key={label.text} text={label.text} delay={label.delay} top={190 + i * 92} />
    ))}
  </AbsoluteFill>
);

const FeedbackBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <OverlayLabel label={{text: 'COACHABILITY LOOP', delay: 6, place: 'top'}} />
    <div style={{position: 'absolute', left: 170, top: 160, width: 1260, height: 190}}>
      {['SHARE', 'FEEDBACK', 'FIX', 'BETTER'].map((t, i) => (
        <div key={t} style={{position: 'absolute', left: i * 315, top: i % 2 ? 48 : 0, width: 230, height: 130, borderRadius: 22, background: i % 2 ? CREAM : YELLOW, border: '6px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: baloo.fontFamily, fontSize: 34, fontWeight: 850}}>
          {t}
        </div>
      ))}
    </div>
    {beat.labels.map((label, i) => (
      <RowCard key={label.text} text={label.text} delay={label.delay} top={350 + i * 88} left={330} width={940} />
    ))}
  </AbsoluteFill>
);

const RevenueBeat: React.FC<{beat: Beat}> = ({beat}) => {
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <OverlayLabel label={{text: 'REVENUE CREATES OPPORTUNITY', delay: 8, place: 'top'}} />
      <div style={{position: 'absolute', left: 250, top: 155, width: 1100, height: 640, borderRadius: 30, background: CREAM, border: '7px solid #111', boxShadow: '0 16px 34px rgba(0,0,0,0.12)'}} />
      {beat.labels.map((label, i) => (
        <RowCard key={label.text} text={label.text} delay={label.delay} top={195 + i * 88} left={315} width={970} />
      ))}
    </AbsoluteFill>
  );
};

const SideBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: 650, height: 900, overflow: 'hidden'}}>
      {beat.side ? <OffthreadVideo muted src={staticFile(beat.side)} style={{position: 'absolute', width: 1600, height: 900, left: -460, top: 0}} /> : null}
    </div>
    <div style={{position: 'absolute', right: 90, top: 120, width: 820, height: 640, borderRadius: 28, background: CREAM, border: '7px solid #111', boxShadow: '0 16px 34px rgba(0,0,0,0.12)'}} />
    <OverlayLabel label={{text: 'PROMOTION CRITERIA', delay: 8, place: 'topright'}} />
    {beat.labels.map((label, i) => (
      <RowCard key={label.text} text={label.text} delay={label.delay} top={230 + i * 100} left={830} width={570} />
    ))}
  </AbsoluteFill>
);

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} />;
  if (beat.mode === 'scorecard') return <ScorecardBeat beat={beat} />;
  if (beat.mode === 'checkpoint') return <CheckpointBeat beat={beat} />;
  if (beat.mode === 'feedback') return <FeedbackBeat beat={beat} />;
  if (beat.mode === 'revenue') return <RevenueBeat beat={beat} />;
  if (beat.mode === 'side') return <SideBeat beat={beat} />;
  return <SceneStill beat={beat} dur={dur} />;
};

const directions = ['from-right', 'from-left', 'from-bottom', 'from-top'] as const;
const transitionFrames = 12;

export const Lesson19: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const hasTransition = i < beats.length - 1;
          const pad = hasTransition ? transitionFrames : 0;
          const seq = (
            <TransitionSeries.Sequence key={beat.tag} durationInFrames={beat.durationInFrames + pad}>
              {beatContent(beat, beat.durationInFrames + pad)}
            </TransitionSeries.Sequence>
          );
          return hasTransition
            ? [
                seq,
                <TransitionSeries.Transition
                  key={`${beat.tag}-t`}
                  presentation={slide({direction: directions[i % directions.length]})}
                  timing={linearTiming({durationInFrames: transitionFrames})}
                />,
              ]
            : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_19_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

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
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import {Sticker} from './Sticker';
import manifest from '../public/lesson1C/manifest.json';

const baloo = loadBaloo();

/**
 * Lesson 1C "Conversation Flow" — audio = master clock (master.m4a with 1.75s inter-beat gaps).
 * Five car-Andrea hero beats (b01/b10/b13/b20/b22). Six Seedance clips play full-frame with a
 * hold-still tail (triple-clamp clips end on the start pose, so the handoff to the still is
 * invisible). b19 = code drive rig: car plate bobs over a seamlessly tiling scenery strip.
 * b15 = three-month calendar, real dates + 30/90-day highlight rendered in code.
 */

const BLUE = '#62b3f3';

type Extras = {
  q1?: number;
  q2?: number;
  step1?: number;
  step2?: number;
  step3?: number;
  arrows?: number;
};

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  anim?: string;
  hero?: string;
  drive?: {car: string; strip: string};
  switchFrame?: number;
  label?: string;
  labelDelay?: number;
  extras?: Extras;
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
};

const ANIM_FRAMES = Math.round(15 * 30); // Seedance clips are 15s @ our 30fps timeline

// ---------- BMH badge (standing rule: opening scene of every module) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- fit-computed FRAME transforms (never clip art; verify with per-beat stills) ----------
const FRAMES: Record<string, {scale: number; dx: number; dy: number}> = {};

// ---------- generic scene / card ----------
const CardPop: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 20});
  return (
    <AbsoluteFill style={{transform: `scale(${0.9 + 0.1 * s})`, opacity: Math.min(1, s * 1.5)}}>
      {children}
    </AbsoluteFill>
  );
};

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const f = FRAMES[beat.tag];
  const animEnd = beat.anim ? Math.min(ANIM_FRAMES, dur) : 0;
  const push =
    beat.mode === 'scene' && !beat.anim
      ? interpolate(frame, [0, dur], [1.0, 1.07], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const img = beat.still ? (
    <Img
      src={staticFile(beat.still)}
      style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
    />
  ) : null;
  const inner = f ? (
    <div
      style={{
        position: 'absolute',
        width: 1600,
        height: 900,
        transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`,
        transformOrigin: 'center center',
      }}
    >
      {img}
    </div>
  ) : (
    img
  );
  const ex = beat.extras ?? {};
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* anim clips are ALPHA (code owns the blue); hold-still only AFTER the clip
          ends (clip ends on start pose) — under an alpha clip it would ghost/double */}
      {beat.anim ? (
        <>
          <Sequence from={0} durationInFrames={animEnd}>
            <OffthreadVideo muted transparent src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
          </Sequence>
          {dur > animEnd ? (
            <Sequence from={animEnd} durationInFrames={dur - animEnd}>
              {inner}
            </Sequence>
          ) : null}
        </>
      ) : (
        beat.mode === 'card' ? <CardPop>{inner}</CardPop> : inner
      )}
      {/* b03: the two intel questions, word-timed */}
      {ex.q1 !== undefined ? (
        <Sticker text="“How have the other investors treated you?”" role="caption" bg="white" delay={ex.q1} top={110} left={330} />
      ) : null}
      {ex.q2 !== undefined ? (
        <Sticker text="“What did your real estate agent say?”" role="caption" bg="white" delay={ex.q2} top={265} left={140} />
      ) : null}
      {/* b08: stair step labels, word-timed to the rewritten 1-2-3 line */}
      {ex.step1 !== undefined ? <Sticker text="1 · GATHER" role="label" bg="white" delay={ex.step1} top={640} left={210} /> : null}
      {ex.step2 !== undefined ? <Sticker text="2 · TEST CASH" role="label" bg="white" delay={ex.step2} top={430} left={620} /> : null}
      {ex.step3 !== undefined ? <Sticker text="3 · OPEN CREATIVE" role="label" bg="white" delay={ex.step3} top={210} left={1010} /> : null}
      {/* b12: sign words are baked into the still (AGENT/WAIT/RENT, Jarrad 2026-07-04) */}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- hero (full-frame avatar clip, muted; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- movie beat: clapper + first-night house, word-timed label ----------
const MovieBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const at = beat.labelDelay ?? 30;
  const s = spring({frame: frame - at + 14, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 20});
  const push = interpolate(frame, [0, dur], [1.0, 1.06], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Img
        src={staticFile(beat.still!)}
        style={{
          position: 'absolute',
          width: 1600,
          height: 900,
          transform: `scale(${(0.92 + 0.08 * Math.max(0, Math.min(1, s))) * push})`,
          transformOrigin: 'center center',
        }}
      />
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={at} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- b15 calendar: 3 blank month frames + real dates + 30/90-day highlight (code) ----------
// Month page rects MEASURED on m01_LC_b15_win-window_v2.png via 100px grid overlay (2026-07-04).
// Cell area only (below the orange header band); 7 cols × 5 rows.
const MONTH_PAGES = [
  {x: 62, y: 300, w: 438, h: 348, headerY: 200},
  {x: 585, y: 300, w: 435, h: 348, headerY: 200},
  {x: 1100, y: 300, w: 435, h: 348, headerY: 200},
];
// July/August/September 2026: first-weekday offsets (Sun=0) and day counts
const MONTHS = [
  {name: 'JULY', offset: 3, days: 31},
  {name: 'AUGUST', offset: 6, days: 31},
  {name: 'SEPTEMBER', offset: 2, days: 30},
];
const CalendarBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const frame = useCurrentFrame();
  const appear = beat.labelDelay ?? 8;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      {MONTH_PAGES.map((p, m) => {
        const {name, offset, days} = MONTHS[m];
        const cells: React.ReactNode[] = [];
        for (let d = 1; d <= days; d++) {
          let i = offset + d - 1;
          const folded = i >= 35; // calendar-fold: day 30/31 shares the row-5 cell one week up
          if (folded) i -= 7;
          const r = Math.floor(i / 7);
          const c = i % 7;
          // 30-day mark ≈ Aug 3 · 90-day mark ≈ Oct 2 → highlight Aug 3 through Sep 30
          const inWindow = (m === 1 && d >= 3) || m === 2;
          const on = frame >= appear + m * 10;
          cells.push(
            <div
              key={d}
              style={{
                position: 'absolute',
                left: p.x + (p.w / 7) * c,
                top: p.y + (p.h / 5) * r,
                width: p.w / 7,
                height: p.h / 5,
                display: 'flex',
                alignItems: folded ? 'flex-end' : 'center',
                justifyContent: folded ? 'flex-end' : 'center',
                paddingRight: folded ? 6 : 0,
                paddingBottom: folded ? 2 : 0,
                boxSizing: 'border-box',
                fontFamily: baloo.fontFamily,
                fontWeight: 700,
                fontSize: folded ? 16 : 24,
                color: '#111',
                background: on && inWindow && !folded ? 'rgba(255,210,63,0.55)' : 'transparent',
                borderRadius: 8,
                opacity: on ? 1 : 0,
              }}
            >
              {folded ? `/${d}` : d}
            </div>
          );
        }
        return (
          <React.Fragment key={name}>
            <div
              style={{
                position: 'absolute',
                left: p.x,
                top: p.headerY,
                width: p.w,
                height: 70,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: baloo.fontFamily,
                fontWeight: 800,
                fontSize: 42,
                color: '#FFF7DE',
                opacity: frame >= appear + m * 10 ? 1 : 0,
              }}
            >
              {name}
            </div>
            {cells}
          </React.Fragment>
        );
      })}
      {/* 30/90 DAYS stickers removed (Jarrad 2026-07-04) */}
      {beat.label ? <Sticker text={beat.label} role="caption" bg="white" delay={(beat.labelDelay ?? 8) + 40} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- b19: Andrea speaks first, hard cut to the drive rig on "Craigslist" ----------
const DriveBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const sw = beat.hero && beat.switchFrame ? Math.min(beat.switchFrame, dur - 1) : 0;
  // scroll clock starts at the cut so the strip begins at its seam
  const driveFrame = frame - sw;
  const SPEED = 3.2; // px/frame
  const x = -((Math.max(driveFrame, 0) * SPEED) % 1600);
  const bob = 4 * Math.sin((2 * Math.PI * Math.max(driveFrame, 0)) / 22);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.hero && sw > 0 ? (
        <Sequence from={0} durationInFrames={sw}>
          <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {beat.drive ? (
        <Sequence from={sw} durationInFrames={dur - sw}>
          <Img src={staticFile(beat.drive.strip)} style={{position: 'absolute', width: 1600, height: 900, left: x}} />
          <Img src={staticFile(beat.drive.strip)} style={{position: 'absolute', width: 1600, height: 900, left: x + 1600}} />
          {/* +140px sets the car's wheels on the strip's ground line (car is centered in its plate) */}
          <Img
            src={staticFile(beat.drive.car)}
            style={{position: 'absolute', width: 1600, height: 900, transform: `translateY(${bob + 140}px)`}}
          />
        </Sequence>
      ) : null}
      {beat.label ? <Sticker text={beat.label} role="caption" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- transitions (1A behavior: fades = intro/outro only, slides rotate 4 ways) ----------
const T = 12;
const T_CARD = 5; // 1A's snappy card pop
const pickTransition = (prev: Beat, next: Beat) => {
  // fade only into the lesson (b01→b02) and out of it (b21→b22); mid-lesson heroes slide
  if (prev.tag === 'b01_intro' || next.tag === 'b22_outro') return {presentation: fade(), frames: 14};
  if (prev.mode === 'card' || next.mode === 'card') return {presentation: slide({direction: 'from-right' as const}), frames: T_CARD};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  // seed on chars 1+2 (the VARYING digits) — char 3 is '_' in every tag (1A formula; PLAYBOOK 7.13)
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'movie') return <MovieBeat beat={b} dur={dur} />;
  if (b.mode === 'calendar') return <CalendarBeat beat={b} dur={dur} />;
  if (b.mode === 'drive') return <DriveBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const LessonC: React.FC = () => {
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

export const LESSON_C_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

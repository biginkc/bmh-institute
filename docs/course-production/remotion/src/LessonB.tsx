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
import {Sticker} from './Sticker';
import manifest from '../public/lessonB/manifest.json';

/**
 * LessonB "Mindset" v2 — audio = master clock (one continuous master.m4a).
 * Motion is CODE ONLY (Grok repaints our doodle characters off-brand — ARCHITECTURE.md FINAL VERDICT).
 * v2 (Jarrad's watch-through notes): corner-circle Andrea on doctor + map; centered cards;
 * cafe Andrea returns mid-lesson (b08a) and closes (b17); clapper word-timed to "movie" then
 * slides to the fork; landlord 2-frame wiggle + code droplet; calendar page-flips; recap cascade;
 * BMH badge on the opening scene (standing rule for every module).
 */

const BLUE = '#62b3f3';

type Extras = {
  movie?: number;
  fork?: number;
  end?: number;
  life?: number;
};

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  still2?: string; // movie beat: fork | landlord: pose B
  hero?: string;
  circle?: string;
  videos?: string[];
  videoFrames?: number[];
  label?: string;
  labelDelay?: number;
  extras?: Extras;
  badge?: boolean;
  durationInFrames: number;
};

// ---------- BMH badge (standing rule: opening scene of every module) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- Andrea corner circle (ported from LessonA) ----------
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
      }}
    >
      <OffthreadVideo
        muted
        src={staticFile(src)}
        style={{position: 'absolute', width: 1920, height: 1080, left: -790, top: -17}}
      />
    </div>
  );
};

// ---------- fit-computed FRAME transforms (never clip art) ----------
const FRAMES: Record<string, {scale: number; dx: number; dy: number}> = {
  b04_doctor: {scale: 1.3, dx: 250, dy: 20}, // fill frame, keep BR pocket for circle
  b06a_p1: {scale: 1.0, dx: 237, dy: 0}, // center left-weighted card
  b10_p5: {scale: 1.0, dx: 210, dy: 0},
};

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
  const push =
    beat.mode === 'scene' || beat.mode === 'map'
      ? interpolate(frame, [0, dur], [1.0, beat.mode === 'map' ? 1.14 : 1.07], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const origin = beat.mode === 'map' ? '44% 52%' : 'center center';
  const img = beat.still ? (
    <Img
      src={staticFile(beat.still)}
      style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: origin}}
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
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.mode === 'card' ? <CardPop>{inner}</CardPop> : inner}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
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
    {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- video beat: sequential animation clips (max-length, never looped) + hold-still tail ----------
const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const clips = beat.videos ?? [];
  const lens = beat.videoFrames ?? [];
  const starts: number[] = [];
  let acc = 0;
  for (const l of lens) {
    starts.push(acc);
    acc += l;
  }
  const tailStart = acc;
  const push = interpolate(frame, [tailStart, dur], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* hold-still tail underneath (clips end on the exact still pose, so the handoff is seamless) */}
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${frame >= tailStart ? push : 1})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ))}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- movie beat: clapper pops on "movie", slides to fork for the questions ----------
const MovieBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ex = beat.extras ?? {};
  const movieAt = ex.movie ?? 30;
  const forkAt = ex.fork ?? Math.round(dur * 0.5);
  const endAt = ex.end ?? forkAt + 20;
  // clapper pop (word-timed to "movie")
  const s = spring({frame: frame - movieAt, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 20});
  // camera-travel slide to fork
  const slideX = interpolate(frame, [forkAt, forkAt + 18], [0, -1600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', width: 1600, height: 900, transform: `translateX(${slideX}px)`}}>
        {/* clapper panel (centered via dx) */}
        <div style={{position: 'absolute', width: 1600, height: 900, transform: 'translateX(190px)'}}>
          <Img
            src={staticFile(beat.still!)}
            style={{
              position: 'absolute',
              width: 1600,
              height: 900,
              transform: `scale(${0.85 + 0.15 * Math.max(0, Math.min(1, s))})`,
              opacity: frame < movieAt ? 0 : Math.min(1, s * 1.5),
            }}
          />
        </div>
      </div>
      <div style={{position: 'absolute', width: 1600, height: 900, transform: `translateX(${slideX + 1600}px)`}}>
        {beat.still2 ? <Img src={staticFile(beat.still2)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
        <Sticker text="Start at the end" role="label" bg="white" delay={endAt} bottomCenter />
      </div>
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- calendar beat: code day-grid + top-hinged page flips ----------
// page rect measured on the generated calendar frame (set in PAGE below after gating)
const PAGE = {x: 245, y: 220, w: 1110, h: 570};
const DayGrid: React.FC<{seed: number}> = ({seed}) => {
  const cols = 7;
  const rows = 4;
  const cells: React.ReactNode[] = [];
  const colors = ['#FFD23F', '#FF8A3D', '#FFF7DE', '#FFFFFF'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      cells.push(
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (PAGE.w / cols) * c + 8,
            top: (PAGE.h / rows) * r + 8,
            width: PAGE.w / cols - 16,
            height: PAGE.h / rows - 16,
            borderRadius: 10,
            background: colors[(i + seed) % colors.length],
            border: '4px solid #111',
          }}
        />
      );
    }
  }
  return <>{cells}</>;
};

const CalendarBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const FLIPS = 4;
  const per = Math.floor(dur / (FLIPS + 1));
  const page = Math.min(FLIPS, Math.floor(frame / per));
  const t = (frame % per) / per;
  // current page flips up (rotateX) during the last 30% of its window
  const flip = t > 0.7 ? interpolate(t, [0.7, 1], [0, -178]) : 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      <div style={{position: 'absolute', left: PAGE.x, top: PAGE.y, width: PAGE.w, height: PAGE.h, perspective: 1400}}>
        {/* next page underneath */}
        <div style={{position: 'absolute', inset: 0}}>
          <DayGrid seed={page + 1} />
        </div>
        {/* current page flipping away (top-hinged) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'top center',
            transform: `rotateX(${flip}deg)`,
            backfaceVisibility: 'hidden',
            background: '#FFF7DE',
          }}
        >
          <DayGrid seed={page} />
        </div>
      </div>
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- recap: cascading 10 principle labels beside the tablet ----------
const RECAP_LABELS = [
  '1 · SERVICE OVER SELF',
  '2 · ALIGNMENT',
  '3 · CLARITY BEATS PRESSURE',
  '4 · DETACH',
  '5 · CURIOSITY',
  '6 · EQUAL STATUS',
  '7 · LONG GAME',
  '8 · PUZZLES, NOT WALLS',
  '9 · REPS CREATE CALM',
  '10 · SAME LENS',
];
const RecapBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  // Standing rule (Jarrad 2026-07-08): ONE label visible at a time, bottom-center. Each
  // principle pops in, then EXITS before the next comes about — no multi-column board.
  const head = 12;
  const per = Math.max(18, Math.floor((dur - head) / RECAP_LABELS.length));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      {RECAP_LABELS.map((t, i) => {
        const start = head + i * per;
        return (
          <Sticker
            key={t}
            text={t}
            role="label"
            bg="white"
            delay={start}
            until={start + per - 5}
            bottomCenter
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- transitions ----------
const T = 12;
// Standing rule (Jarrad 2026-07-08): 1A-style camera-travel SLIDES for every beat-to-beat move
// (reads as the camera panning to a new location on a plane). Fades ONLY at the open/close
// bookends — never mid-lesson, including the mid-lesson cafe hero (b08a).
const pickTransition = (prev: Beat, next: Beat, i: number, total: number) => {
  const isBookend = i === 0 || i === total - 2;
  if (isBookend) return {presentation: fade(), frames: 14};
  if (prev.mode === 'card' || next.mode === 'card') return {presentation: slide({direction: 'from-right' as const}), frames: T};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(3)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'video' || b.mode === 'videoseq') return <VideoBeat beat={b} dur={dur} />;
  if (b.mode === 'movie') return <MovieBeat beat={b} dur={dur} />;
  if (b.mode === 'recap') return <RecapBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const LessonB: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1], i, beats.length) : null;
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

export const LESSON_B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

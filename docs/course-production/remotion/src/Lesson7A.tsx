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
import manifest from '../public/lesson7A/manifest.json';

// PLAYBOOK 7.8: custom TSX text MUST use the loadFont handle — a bare `fontFamily: 'Baloo 2'`
// silently falls back to serif in the render bundle. Same source as Sticker.tsx.
const baloo = loadBaloo();

/**
 * Lesson 7A "Objection Architecture" (Module 07) — audio = master clock (one continuous master.m4a).
 *
 * Motion policy (Jarrad, STANDING 2026-07-05): every illustrated slide is animated via Seedance;
 * Remotion does ONLY word-timed text pop-ins (Sticker) + slide-to-slide transitions. Seedance clips are
 * alpha ProRes .mov composited over the CODE blue; the base still holds ONLY as the seamless tail after
 * the 15s clip (clips end on their start pose) — never underneath the clip, so no double-character.
 *
 * Two teaching constructs so "categorize" ≠ "respond": the 4 response TYPES = a code 2×2 grid (b05),
 * each later filled one cell at a time via a small QuadIndicator on b06–b09; the 4-STEP framework = a
 * code left→right staircase (b10) + a 4-pill lockup (b11). Cafe-Andrea hero bookends (b01 +badge / b13),
 * headset corner-circles on b03 / b05 / b11.
 *
 * Modes: hero | video | calltype | grid4 | steps | lockup.
 */

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const INK = '#111111';

type Step = {text: string; delay: number};

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  circle?: string;
  videos?: string[];
  videoFrames?: number[];
  label?: string;
  labelDelay?: number;
  labelPlace?: string; // bottom | top | center
  caption?: string;
  captionDelay?: number;
  quad?: number;
  badge?: boolean;
  // calltype (b04)
  coldClip?: string;
  coldFrames?: number;
  coldStill?: string;
  coldLabel?: string;
  coldDelay?: number;
  warmClip?: string;
  warmFrames?: number;
  warmStill?: string;
  warmLabel?: string;
  warmDelay?: number;
  slideFrame?: number;
  // steps (b10)
  steps?: Step[];
  durationInFrames: number;
  voFrames?: number;
};

// ---------- BMH badge (standing rule: opening scene of every module) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- Andrea corner circle (LessonB crop) ----------
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
      <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1920, height: 1080, left: -790, top: -17}} />
    </div>
  );
};

// ---------- label placement helper (bottom / top-center) ----------
const LabelSticker: React.FC<{text: string; delay: number; place?: string}> = ({text, delay, place}) => {
  if (place === 'top') return <Sticker text={text} role="label" bg="white" delay={delay} topCenter top={70} />;
  // 'bottom' (default) and 'center' render a single-line label bottom-center
  return <Sticker text={text} role="label" bg="white" delay={delay} bottomCenter />;
};

// ---------- quad indicator: small 2×2 top-left, active cell yellow (ties b06–09 to the b05 grid) ----------
const QuadIndicator: React.FC<{active: number}> = ({active}) => {
  const S = 48;
  const G = 8;
  const OX = 54;
  const OY = 54;
  return (
    <div style={{position: 'absolute', left: OX, top: OY, width: S * 2 + G, height: S * 2 + G}}>
      {[1, 2, 3, 4].map((n) => {
        const c = (n - 1) % 2;
        const r = Math.floor((n - 1) / 2);
        const on = n === active;
        return (
          <div
            key={n}
            style={{
              position: 'absolute',
              left: c * (S + G),
              top: r * (S + G),
              width: S,
              height: S,
              borderRadius: 12,
              background: on ? YELLOW : 'rgba(255,255,255,0.28)',
              border: '4px solid #111',
              boxShadow: on ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
};

// ---------- hero (full-frame cafe-Andrea clip, opaque; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- video beat: alpha anim clip over code blue; still holds ONLY as the tail (no double char) ----------
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
  // caption sits on the edge opposite the primary label
  const capPlace = beat.labelPlace === 'top' ? 'bottom' : 'top';
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* freeze tail — the clip's OWN last frame, held STATIC (no Ken-Burns drift). Shown only after
          the clip ends; identical pixels to the clip's final frame, so the handoff is invisible. */}
      {beat.still && frame >= tailStart ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
      ) : null}
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo muted transparent src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ))}
      {typeof beat.quad === 'number' ? <QuadIndicator active={beat.quad} /> : null}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {beat.label ? <LabelSticker text={beat.label} delay={beat.labelDelay ?? 8} place={beat.labelPlace} /> : null}
      {beat.caption ? (
        capPlace === 'bottom' ? (
          <Sticker text={beat.caption} role="caption" bg="white" delay={beat.captionDelay ?? 20} bottomCenter />
        ) : (
          <Sticker text={beat.caption} role="caption" bg="white" delay={beat.captionDelay ?? 20} topCenter top={70} />
        )
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- calltype (b04): 2-panel horizontal slide, COLD -> WARM, camera pans on "warmed" ----------
const CallTypeBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const slideAt = beat.slideFrame ?? Math.round(dur * 0.5);
  const slideX = interpolate(frame, [slideAt, slideAt + 16], [0, -1600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const coldFrames = beat.coldFrames ?? 0;
  const warmFrames = beat.warmFrames ?? 0;
  const warmStart = slideAt; // warm clip begins as the camera arrives at panel B
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', width: 3200, height: 900, transform: `translateX(${slideX}px)`}}>
        {/* Panel A — COLD (x: 0..1600) */}
        <div style={{position: 'absolute', left: 0, top: 0, width: 1600, height: 900, backgroundColor: BLUE, overflow: 'hidden'}}>
          {beat.coldStill && frame >= coldFrames ? (
            <Img src={staticFile(beat.coldStill)} style={{position: 'absolute', width: 1600, height: 900}} />
          ) : null}
          {beat.coldClip ? (
            <Sequence from={0} durationInFrames={Math.max(1, coldFrames)}>
              <OffthreadVideo muted transparent src={staticFile(beat.coldClip)} style={{position: 'absolute', width: 1600, height: 900}} />
            </Sequence>
          ) : null}
          {beat.coldLabel ? <Sticker text={beat.coldLabel} role="label" bg="white" delay={beat.coldDelay ?? 8} top={70} left={80} /> : null}
        </div>
        {/* Panel B — WARM (x: 1600..3200) */}
        <div style={{position: 'absolute', left: 1600, top: 0, width: 1600, height: 900, backgroundColor: BLUE, overflow: 'hidden'}}>
          {beat.warmStill && frame >= warmStart + warmFrames ? (
            <Img src={staticFile(beat.warmStill)} style={{position: 'absolute', width: 1600, height: 900}} />
          ) : null}
          {beat.warmClip ? (
            <Sequence from={warmStart} durationInFrames={Math.max(1, warmFrames)}>
              <OffthreadVideo muted transparent src={staticFile(beat.warmClip)} style={{position: 'absolute', width: 1600, height: 900}} />
            </Sequence>
          ) : null}
          {beat.warmLabel ? <Sticker text={beat.warmLabel} role="label" bg="white" delay={beat.warmDelay ?? 8} top={70} left={80} /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- grid4 (b05): code 2×2 empty grid + numbers 1–4 springs in, title + circle ----------
const GRID_W = 760;
const GRID_H = 520;
const GRID_X = (1600 - GRID_W) / 2;
const GRID_Y = 170;
const Grid4Beat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 13, stiffness: 140}, durationInFrames: 22});
  const k = Math.max(0, Math.min(1, s));
  const cellW = GRID_W / 2;
  const cellH = GRID_H / 2;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div
        style={{
          position: 'absolute',
          left: GRID_X,
          top: GRID_Y,
          width: GRID_W,
          height: GRID_H,
          transform: `scale(${0.85 + 0.15 * k})`,
          transformOrigin: 'center center',
          opacity: Math.min(1, s * 1.5),
        }}
      >
        {[1, 2, 3, 4].map((n) => {
          const c = (n - 1) % 2;
          const r = Math.floor((n - 1) / 2);
          return (
            <div
              key={n}
              style={{
                position: 'absolute',
                left: c * cellW + 10,
                top: r * cellH + 10,
                width: cellW - 20,
                height: cellH - 20,
                borderRadius: 24,
                background: 'rgba(255,255,255,0.14)',
                border: '6px solid #111',
              }}
            >
              <div style={{position: 'absolute', left: 26, top: 12, fontFamily: baloo.fontFamily, fontWeight: 800, fontSize: 68, color: CREAM, WebkitTextStroke: '3px #111'}}>
                {n}
              </div>
            </div>
          );
        })}
      </div>
      {beat.label ? <Sticker text={beat.label} role="title" bg="white" delay={beat.labelDelay ?? 8} topCenter top={54} /> : null}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
    </AbsoluteFill>
  );
};

// ---------- steps (b10): rising L→R staircase; each numbered step pops on its trigger word ----------
const StepsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = beat.steps ?? [];
  const n = steps.length || 4;
  const marginX = 120;
  const spanW = 1600 - marginX * 2;
  const stepW = spanW / n;
  const baseY = 740; // bottom of the lowest step
  const rise = 128; // each step this much higher than the previous
  const h = 100;
  const appears = steps.map((st) =>
    Math.max(0, Math.min(1, spring({frame: frame - st.delay, fps, config: {damping: 12, stiffness: 160}, durationInFrames: 18})))
  );
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {steps.map((st, i) => {
        const a = appears[i];
        const x = marginX + i * stepW + 14;
        const w = stepW - 28;
        const top = baseY - (i + 1) * rise;
        const nextA = i < n - 1 ? appears[i + 1] : 0;
        return (
          <React.Fragment key={st.text}>
            {/* connector arrow up to the next (higher) step */}
            {i < n - 1 ? (
              <div
                style={{
                  position: 'absolute',
                  left: x + w - 10,
                  top: top - rise / 2 - 4,
                  fontFamily: baloo.fontFamily,
                  fontWeight: 800,
                  fontSize: 60,
                  color: INK,
                  opacity: nextA,
                  transform: `scale(${nextA})`,
                }}
              >
                ↗
              </div>
            ) : null}
            <div
              style={{
                position: 'absolute',
                left: x,
                top,
                width: w,
                height: h,
                borderRadius: 20,
                background: CREAM,
                border: '6px solid #111',
                transform: `translateY(${(1 - a) * 34}px) scale(${0.85 + 0.15 * a})`,
                opacity: a,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
              }}
            >
              <span style={{fontFamily: baloo.fontFamily, fontWeight: 700, fontSize: 36, color: INK, whiteSpace: 'nowrap'}}>
                <span style={{color: '#e8892b', marginRight: 12, fontWeight: 800}}>{i + 1}</span>
                {st.text}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- lockup (b11): the 4-word framework as white pills spring in, centered + circle ----------
const LockupBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = (beat.label ?? '')
    .split('·')
    .map((w) => w.trim())
    .filter(Boolean);
  const base = beat.labelDelay ?? 8;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', gap: 24, flexWrap: 'wrap', maxWidth: 1360, justifyContent: 'center', transform: 'translateY(-70px)'}}>
        {words.map((w, i) => {
          const s = spring({frame: frame - (base + i * 10), fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
          const a = Math.max(0, Math.min(1, s));
          return (
            <div
              key={w}
              style={{
                background: '#ffffff',
                color: INK,
                fontFamily: baloo.fontFamily,
                fontWeight: 700,
                fontSize: 52,
                padding: '16px 34px',
                borderRadius: 20,
                boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                transform: `scale(${a})`,
                opacity: a,
              }}
            >
              {w}
            </div>
          );
        })}
      </div>
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
    </AbsoluteFill>
  );
};

// ---------- transitions: fade at hero boundaries; signature horizontal slides otherwise ----------
const T = 12;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: 14};
  return {presentation: slide({direction: 'from-right' as const}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'calltype') return <CallTypeBeat beat={b} dur={dur} />;
  if (b.mode === 'grid4') return <Grid4Beat beat={b} />;
  if (b.mode === 'steps') return <StepsBeat beat={b} />;
  if (b.mode === 'lockup') return <LockupBeat beat={b} />;
  return <VideoBeat beat={b} dur={dur} />;
};

export const Lesson7A: React.FC = () => {
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

export const LESSON_7A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

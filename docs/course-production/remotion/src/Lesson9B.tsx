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
import {Sticker} from './Sticker';
import manifest from '../public/lesson9B/manifest.json';

/**
 * Lesson 9B "Seller FAQ Decoder: Questions 6-10" (Module 09 / Slot 13) — 7B drill format.
 * Seller avatars (rekeyed onto canonical blue) ask Q6-Q10 on camera; park-bench Andrea answers;
 * standing 1A Andrea closes (Jarrad redline 2026-07-10).
 * TRANSITIONS (Jarrad redline 2026-07-10): the 1A camera-travel SLIDE between every beat —
 * ported from Lesson9A.tsx. Fades ONLY at the true open (from blue) and close (to blue).
 * Labels: single bottom-center queue (rule 3b); seller beats hold the SPOKEN QUESTION verbatim
 * as a static caption (redline: no more "QUESTION N"). Decoder chips REMOVED (redline).
 * Clips hold their own decoded last frame natively (no PNG tails — v1 pop bug).
 */

const BLUE = '#62b3f3';
const baloo = loadBaloo();
const FADE = 18;

type Overlay = {text: string; delay: number; hold?: boolean};
type Tile = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: string;
  clips: string[];
  clipFrames: number[];
  tail: string;
  overlays?: Overlay[];
  tiles?: Tile[];
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}} />
);

// Single bottom-center label queue (rule 3b) — one visible at a time, out-then-in.
const LABEL_EXIT_FRAMES = 10;
const LABEL_GAP_FRAMES = 4;
const Overlays: React.FC<{items?: Overlay[]}> = ({items = []}) => {
  const frame = useCurrentFrame();
  const sorted = [...items].sort((a, b) => a.delay - b.delay);
  const index = sorted.findIndex((o, i) => {
    const nextDelay = sorted[i + 1]?.delay ?? Number.POSITIVE_INFINITY;
    return frame >= o.delay && frame < nextDelay - LABEL_GAP_FRAMES;
  });
  if (index < 0) return null;
  const active = sorted[index];
  const nextDelay = sorted[index + 1]?.delay ?? Number.POSITIVE_INFINITY;
  const exitStart = nextDelay - LABEL_GAP_FRAMES - LABEL_EXIT_FRAMES;
  const exit = Number.isFinite(exitStart)
    ? interpolate(frame, [exitStart, exitStart + LABEL_EXIT_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 0;
  const role = active.text.length > 22 ? 'caption' : 'label';
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - exit, transform: `translateY(${Math.round(exit * 34)}px)`}}>
      <Sticker key={`${active.text}-${active.delay}`} text={active.text} role={role} bg="white"
        delay={active.delay} bottomCenter />
    </div>
  );
};

// b08 practice tiles: CAR · HOME · MIRROR · LIVE CALL pop word-timed into a centered row in the
// empty sky (top of frame) — the bench/Andrea zone stays clear (v1 QC: bottom row crossed her legs).
const TilesRow: React.FC<{tiles: Tile[]}> = ({tiles}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const w = 250, gap = 26;
  const rowW = tiles.length * w + (tiles.length - 1) * gap;
  const ox = (1600 - rowW) / 2;
  return (
    <>
      {tiles.map((t, i) => {
        const s = spring({frame: frame - t.delay, fps, config: {damping: 13, stiffness: 160}, durationInFrames: 16});
        return (
          <div key={t.text} style={{position: 'absolute', left: ox + i * (w + gap), top: 56, width: w,
            textAlign: 'center', fontFamily: baloo.fontFamily, fontWeight: 700, fontSize: 38, color: '#111',
            background: '#FFF7DE', padding: '12px 0', borderRadius: 16,
            boxShadow: '0 8px 22px rgba(0,0,0,0.10)', transform: `scale(${s})`, opacity: Math.min(1, s * 1.3)}}>
            {t.text}
          </div>
        );
      })}
    </>
  );
};

// One beat = its clip(s) straight-cut in sequence. The LAST clip's Sequence extends to the end of
// the (transition-padded) beat: OffthreadVideo clamps past media end and holds its own decoded
// last frame natively — no PNG tail (v1 QC: the PNG round-trip shifted levels, a 4-5 colour pop
// at every boundary, same class as the 7A tail pop). Seller clips outlast their beats and just cut.
const BeatFill: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const starts: number[] = [];
  let acc = 0;
  for (const l of beat.clipFrames) { starts.push(acc); acc += l; }
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.clips.map((src, i) => {
        const last = i === beat.clips.length - 1;
        const durFrames = last ? dur - starts[i] : beat.clipFrames[i];
        return (
          <Sequence key={src} from={starts[i]} durationInFrames={durFrames}>
            <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
          </Sequence>
        );
      })}
      {beat.tiles ? <TilesRow tiles={beat.tiles} /> : null}
      <Overlays items={beat.overlays} />
      {beat.badge ? <BmhBadge /> : null}
    </AbsoluteFill>
  );
};

// The 1A camera-travel SLIDE between every beat (Jarrad redline 2026-07-10) — ported from
// Lesson9A.tsx. Direction seeded by tag so it varies but stays deterministic. Each slide runs
// 13 frames inside the outgoing beat's 1.0s gap; the incoming beat's frame 0 still lands exactly
// on its audio boundary (TransitionSeries overlap math), so word-timed labels stay aligned.
const TRANSITION_FRAMES = 13;
const pickTransition = (prev: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: TRANSITION_FRAMES};
};

export const Lesson9B: React.FC = () => {
  const beats = manifest.beats as Beat[];
  const frame = useCurrentFrame();
  const total = (manifest as {totalFrames: number}).totalFrames;
  // Bookend fades only: from blue at the true open, to blue at the true close.
  const fadeIn = interpolate(frame, [0, FADE], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [total - FADE, total], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const veil = Math.max(fadeIn, fadeOut);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* Master audio drives the clock; every clip is muted. */}
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={b.tag} durationInFrames={b.durationInFrames + pad}>
              <BeatFill beat={b} dur={b.durationInFrames + pad} />
            </TransitionSeries.Sequence>
          );
          return trans
            ? [seq, <TransitionSeries.Transition key={`${b.tag}-t`} presentation={trans.presentation}
                timing={linearTiming({durationInFrames: trans.frames})} />]
            : [seq];
        })}
      </TransitionSeries>
      {veil > 0 ? (
        <AbsoluteFill style={{backgroundColor: BLUE, opacity: veil, pointerEvents: 'none'}} />
      ) : null}
    </AbsoluteFill>
  );
};

export const LESSON_9B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

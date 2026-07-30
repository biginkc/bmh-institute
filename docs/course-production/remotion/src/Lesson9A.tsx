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
import manifest from '../public/lesson9A/manifest.json';

/**
 * Lesson 9A "Seller FAQ Decoder" (Module 09 / Slot 12).
 * TEXT RULE (Jarrad 2026-07-08, matches approved 11A): every transient teaching label is a SINGLE
 * bottom-center queue — one visible at a time; the current one animates OUT (down+fade) before the
 * next comes in. No stacked/positioned chips. (Corner circle = avatar presence, not a text label.)
 * TRANSITIONS (Jarrad 2026-07-08): the Lesson 1A camera-travel SLIDE exclusively — no fades anywhere.
 * Full-scene Seedance clips composite full-frame + own-last-frame freeze tail (PLAYBOOK 8.4/11.7).
 * Modes: hero | video | tiles.
 */

const BLUE = '#62b3f3';
const baloo = loadBaloo();

type Overlay = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  circle?: string;
  videos?: string[];
  videoFrames?: number[];
  overlays?: Overlay[];
  badge?: boolean;
  durationInFrames: number;
  voFrames?: number;
};

const BmhBadge: React.FC = () => (
  <Img src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}} />
);

const CIRCLE = 340;
const AndreaCircle: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const bob = 5 * Math.sin((2 * Math.PI * frame) / 150);
  return (
    <div style={{position: 'absolute', left: 1600 - CIRCLE - 60, top: 900 - CIRCLE - 60,
      width: CIRCLE, height: CIRCLE, borderRadius: '50%', overflow: 'hidden',
      border: '10px solid #ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      transform: `translateY(${bob}px)`, backgroundColor: BLUE}}>
      <OffthreadVideo muted src={staticFile(src)}
        style={{position: 'absolute', width: 1920, height: 1080, left: -790, top: -17}} />
    </div>
  );
};

const LABEL_EXIT_FRAMES = 10;
const LABEL_GAP_FRAMES = 4;
const OverlaySticker: React.FC<{overlay: Overlay}> = ({overlay}) => {
  const role = overlay.text.length > 22 ? 'caption' : 'label';
  return <Sticker text={overlay.text} role={role} bg="white" delay={overlay.delay} bottomCenter />;
};
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
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - exit, transform: `translateY(${Math.round(exit * 34)}px)`}}>
      <OverlaySticker key={`${active.text}-${active.delay}`} overlay={active} />
    </div>
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
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
  for (const l of lens) { starts.push(acc); acc += l; }
  const tailStart = acc;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, opacity: frame >= tailStart ? 1 : 0}} />
      ) : null}
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ))}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      <Overlays items={beat.overlays} />
    </AbsoluteFill>
  );
};

const TilesBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cols = 5, rows = 2;
  const cellW = 240, cellH = 240, gap = 40;
  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = rows * cellH + (rows - 1) * gap;
  const ox = (1600 - gridW) / 2;
  const oy = (900 - gridH) / 2 - 30;
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const covered = i < 5;
      const pop = spring({frame: frame - (6 + i * 5), fps, config: {damping: 13, stiffness: 160}, durationInFrames: 16});
      tiles.push(
        <div key={i} style={{position: 'absolute', left: ox + c * (cellW + gap), top: oy + r * (cellH + gap),
          width: cellW, height: cellH, borderRadius: 26, border: '6px solid #111',
          background: covered ? '#FFD23F' : '#FFF7DE', transform: `scale(${pop})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: baloo.fontFamily, fontWeight: 700, fontSize: 120, color: '#111',
          opacity: covered ? 1 : 0.62}}>
          ?
        </div>
      );
    }
  }
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {tiles}
      <Overlays items={beat.overlays} />
    </AbsoluteFill>
  );
};

const TRANSITION_FRAMES = 13;
const pickTransition = (prev: Beat, _next: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: TRANSITION_FRAMES};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'tiles') return <TilesBeat beat={b} dur={dur} />;
  return <VideoBeat beat={b} dur={dur} />;
};

export const Lesson9A: React.FC = () => {
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
            ? [seq, <TransitionSeries.Transition key={`${b.tag}-t`} presentation={trans.presentation}
                timing={linearTiming({durationInFrames: trans.frames})} />]
            : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_9A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

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
import manifest from '../public/lesson8A/manifest.json';

// PLAYBOOK 7.8: custom TSX text MUST use the loadFont handle.
const baloo = loadBaloo();

/**
 * Lesson 8A "Complex Objections" (Module 08) — audio = master clock (one continuous master.m4a).
 *
 * Motion policy (11.6): every illustrated slide is a Seedance clip; Remotion does word-timed text +
 * transitions only. Clips are alpha ProRes over CODE blue; the base still holds ONLY as the freeze
 * tail after the 15s clip — and the tail is the clip's OWN last frame (11.7), never a re-normalized
 * start still. b08 is a FROZEN STILL (scene mode, gentle push-in) — Seedance failed twice on that
 * composition; Jarrad-approved freeze, same treatment as 5A b08 (10.7).
 *
 * BEACH Andrea everywhere (Jarrad 2026-07-06): hero bookends b01/b10 full-frame, corner circles on
 * b04/b07/b09 cropped from the SAME beach clips — crop numbers MEASURED off a native frame (9.4):
 * head center (617,215) in the 1280x720 source, shown at 1.19x in the 340px circle.
 *
 * Modes: hero | video | scene.
 */

const BLUE = '#62b3f3';
const CREAM = '#FFF7DE';
const INK = '#111111';

type Pill = {text: string; delay: number};

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
  labelOut?: number; // exit-anim start — set when a caption/pill-stack follows (one label at a time)
  caption?: string;
  captionDelay?: number;
  pills?: Pill[];
  pillsPlace?: string; // topleft | right
  pillsOut?: number; // whole-stack exit start — set when a caption follows the stack
  badge?: boolean;
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

// ---------- Andrea corner circle — BEACH clip crop, measured per 9.4 ----------
// Source 1280x720, head center (617,215), hair spans x520-715 (195px). Proof pass showed 1.19x too
// wide (torso + umbrella in frame) — tightened to 1.55x (same zoom class as the proven 1A circle):
// video 1984x1116; head center lands at (956,333); target inside the 340 circle is (170,150).
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
      <OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1984, height: 1116, left: -786, top: -183}} />
    </div>
  );
};

// ---------- exit envelope: 10f slide-down + fade, starting at outF (undefined = never exits) ----------
const useExit = (outF?: number) => {
  const frame = useCurrentFrame();
  if (outF === undefined) return {gone: false, opacity: 1, dy: 0};
  const t = Math.max(0, Math.min(1, (frame - outF) / 10));
  return {gone: t >= 1, opacity: 1 - t, dy: 48 * t};
};

// ---------- word-timed pill stack (narrated enumerations, rule 6b — positioned for a purpose) ----------
// topleft (b08): the stack must clear the left neighbor's head (hair top ~y345; 4 pills end y~344).
// When a caption follows (pillsOut), the WHOLE stack exits first — one text element at a time (Jarrad
// 2026-07-07): a label moves away before the next comes about.
const PillStack: React.FC<{pills: Pill[]; place: string; outF?: number}> = ({pills, place, outF}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exit = useExit(outF);
  if (exit.gone) return null;
  const right = place === 'right';
  const left = right ? 1040 : 70;
  const top0 = right ? 210 : 56;
  const gapY = right ? 84 : 74;
  const fontSize = right ? 38 : 36;
  return (
    <>
      {pills.map((p, i) => {
        const s = spring({frame: frame - p.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
        const a = Math.max(0, Math.min(1, s));
        return (
          <div
            key={p.text}
            style={{
              position: 'absolute',
              left,
              top: top0 + i * gapY,
              background: '#ffffff',
              color: INK,
              fontFamily: baloo.fontFamily,
              fontWeight: 700,
              fontSize,
              padding: '11px 24px',
              borderRadius: 16,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              transform: `scale(${a}) translateY(${exit.dy}px)`,
              transformOrigin: 'left center',
              opacity: a * exit.opacity,
              whiteSpace: 'nowrap',
            }}
          >
            {p.text}
          </div>
        );
      })}
    </>
  );
};

// ---------- the single bottom-center text slot (Jarrad 2026-07-07 standing rule) ----------
// Every label/caption lives here unless positioned for a specific purpose (pill stacks). Only one
// visible at a time: the sitting card slides down+fades out (labelOut), THEN the next springs in —
// delays are built 14f after the previous exit start, so entry begins 4f after the exit lands.
const BottomCard: React.FC<{text: string; inF: number; outF?: number; size?: number}> = ({text, inF, outF, size = 46}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exit = useExit(outF);
  if (exit.gone) return null;
  const s = spring({frame: frame - inF, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 20});
  const a = Math.max(0, Math.min(1, s));
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: '50%',
        background: '#ffffff',
        color: INK,
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: size,
        padding: '12px 30px',
        borderRadius: 18,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        transform: `translateX(-50%) scale(${a}) translateY(${(1 - a) * 30 + exit.dy}px)`,
        transformOrigin: 'center bottom',
        opacity: a * exit.opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

// ---------- shared text/overlay layer ----------
const Overlays: React.FC<{beat: Beat}> = ({beat}) => (
  <>
    {beat.pills ? <PillStack pills={beat.pills} place={beat.pillsPlace ?? 'topleft'} outF={beat.pillsOut} /> : null}
    {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
    {beat.label ? <BottomCard text={beat.label} inF={beat.labelDelay ?? 8} outF={beat.labelOut} size={46} /> : null}
    {beat.caption ? <BottomCard text={beat.caption} inF={beat.captionDelay ?? 20} size={40} /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </>
);

// ---------- hero (full-frame beach-Andrea clip, opaque; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- video beat: alpha anim clip over code blue; the clip's OWN last frame holds as the tail ----------
const VideoBeat: React.FC<{beat: Beat}> = ({beat}) => {
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
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* freeze tail — clip's OWN last frame, held STATIC; shown only after the clip ends (11.2/11.7) */}
      {beat.still && frame >= tailStart ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
      ) : null}
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo muted transparent src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ))}
      <Overlays beat={beat} />
    </AbsoluteFill>
  );
};

// ---------- scene beat (b08): frozen approved still, gentle push-in (10.7), overlays on top ----------
const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1.0, 1.035], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Overlays beat={beat} />
    </AbsoluteFill>
  );
};

// ---------- transitions: slides everywhere; fade ONLY at the b01/b10 bookends (10.6, gated on TAGS) ----------
const T = 12;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.tag === 'b01_intro' || next.tag === 'b10_outro') return {presentation: fade(), frames: 14};
  return {presentation: slide({direction: 'from-right' as const}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'scene') return <SceneBeat beat={b} dur={dur} />;
  return <VideoBeat beat={b} />;
};

export const Lesson8A: React.FC = () => {
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

export const LESSON_8A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

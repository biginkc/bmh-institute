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
import manifest from '../public/lesson17/manifest.json';

// PLAYBOOK 7.8: custom TSX text MUST use the loadFont handle — a bare `fontFamily: 'Baloo 2'`
// silently falls back to serif in the render bundle. Same source as Sticker.tsx.
const baloo = loadBaloo();

/**
 * Lesson 17 "Compensation Engine" (Slot 17) — v3 script "master texture, no numbers", v5.1 board,
 * 12 beats. Copied from the Lesson7A pattern: audio = master clock (one continuous master.m4a,
 * 1.0s inter-beat gaps), camera-travel slide transitions mid-lesson, fades ONLY at the open and
 * close bookends.
 *
 * Motion policy (Jarrad, STANDING 2026-07-05): every illustrated slide is animated via Seedance;
 * Remotion does ONLY word-timed text pop-ins (Sticker) + slide-to-slide transitions. Seedance clips
 * are alpha ProRes .mov composited over the CODE blue; the freeze tail = the clip's OWN last frame
 * (PLAYBOOK 11.7) — never the start-pose still under the clip, so no double-character.
 * Anim clips are OPTIONAL here: a video beat with no clip yet falls back to its static
 * canonical-blue-normalized still with a gentle code push-in. b05 + b11 are ALWAYS code push-in
 * (board v5.1) and never receive Seedance clips.
 *
 * Beat specials: b02 is a code-rendered LOCKUP beat (7A b11 lockup pattern) — three white
 * pill-cards (BASE / PERFORMANCE PAY / BONUSES) pop word-timed with the narration, centered over
 * canonical blue (its stacked-blocks still was rejected). b07 is a TEXT-ONLY beat (no still —
 * word-timed Sticker title centered over canonical blue). b11 pins a small code-rendered white
 * Sticker label "OFFER LETTER" onto the front document of the still, riding INSIDE the push-in
 * transform. b10 is a HEROMID beat — full-screen Andrea clip mid-lesson (wallet split retired):
 * opaque muted clip, freeze tail = its own last frame, bottom sticker stays, and its transitions
 * stay SLIDE (mid-lesson fades are banned; only the b01 open and b12 close get fades). b12 is the
 * hero outro built from TWO HeyGen takes with a straight cut at the take1 audio seam, fade-out
 * (to canonical blue) only at the very end.
 *
 * Modes: hero | video | lockup | text | heromid | hero2.
 */

const BLUE = '#62b3f3';
const INK = '#111111';

type Pill = {text: string; delay: number};

type Beat = {
  tag: string;
  mode: string; // hero | video | lockup | text | heromid | hero2
  pills?: Pill[];
  still?: string;
  hero?: string;
  heroFrames?: number;
  heroTakes?: string[];
  heroTakeFrames?: number[];
  videos?: string[];
  videoFrames?: number[];
  pushIn?: boolean;
  pin?: string;
  pinDelay?: number;
  pinX?: number;
  pinY?: number;
  label?: string;
  labelDelay?: number;
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

// ---------- hero (full-frame cafe-Andrea clip, opaque; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- heromid (b10): full-screen Andrea clip MID-LESSON (opaque, muted; master audio carries
// sound). Freeze tail = the clip's OWN last frame held STATIC through the 1.0s gap (PLAYBOOK 11.7).
// NOT a bookend hero — isHero() must NOT match this mode, so transitions in/out stay SLIDE. ----------
const HeroMidBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const clipFrames = beat.heroFrames ?? 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still && frame >= clipFrames ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
      ) : null}
      {beat.hero ? (
        <Sequence from={0} durationInFrames={Math.max(1, clipFrames)}>
          <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- hero2 (b12 outro): TWO HeyGen takes, straight cut at the take1 audio seam ----------
// (b12_outro.wav = take1.wav + take2.wav concatenated, so the video cut lands exactly on the
// audio seam). Fade-out to canonical blue ONLY at the very end — the close bookend.
const OUTRO_FADE_FRAMES = 18;
const HeroOutroBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const takes = beat.heroTakes ?? [];
  const lens = beat.heroTakeFrames ?? [];
  const cut = lens[0] ?? Math.round(dur / 2);
  const fadeOut = interpolate(frame, [Math.max(0, dur - OUTRO_FADE_FRAMES), Math.max(1, dur - 2)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {takes[0] ? (
        <Sequence from={0} durationInFrames={Math.max(1, cut)}>
          <OffthreadVideo muted src={staticFile(takes[0])} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {takes[1] ? (
        <Sequence from={cut} durationInFrames={Math.max(1, dur - cut)}>
          <OffthreadVideo muted src={staticFile(takes[1])} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      <AbsoluteFill style={{backgroundColor: BLUE, opacity: fadeOut, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};

// ---------- video beat: alpha anim clip over code blue; still holds ONLY as the tail (no double char).
// No clip yet (or NEVER, for b05/b11) -> static normalized still + gentle code push-in. The b11
// pinned label sits INSIDE the push-in transform so it rides the move. ----------
const PUSH_SCALE = 1.06; // gentle push-in end scale
const PIN_DEFAULT_X = 728; // over the front document's blank yellow title bar (QC-tunable)
const PIN_DEFAULT_Y = 272;
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
  const hasClips = clips.length > 0;
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, PUSH_SCALE], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {hasClips ? (
        <>
          {/* freeze tail — the clip's OWN last frame, held STATIC (no Ken-Burns drift). Shown only after
              the clip ends; identical pixels to the clip's final frame, so the handoff is invisible
              (PLAYBOOK 11.7). */}
          {beat.still && frame >= tailStart ? (
            <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
          ) : null}
          {clips.map((src, i) => (
            <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
              <OffthreadVideo muted transparent src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
            </Sequence>
          ))}
        </>
      ) : beat.still ? (
        <div
          style={{
            position: 'absolute',
            width: 1600,
            height: 900,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
          {beat.pin ? (
            <Sticker
              text={beat.pin}
              role="caption"
              bg="white"
              delay={beat.pinDelay ?? 8}
              top={beat.pinY ?? PIN_DEFAULT_Y}
              left={beat.pinX ?? PIN_DEFAULT_X}
            />
          ) : null}
        </div>
      ) : null}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- lockup (b02): word-timed white pills pop left-to-right, centered over blue (7A b11 pattern).
// The row is pre-laid-out centered; each pill springs into its final slot on its trigger word. ----------
const LockupBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pills = beat.pills ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', gap: 24, flexWrap: 'wrap', maxWidth: 1360, justifyContent: 'center', transform: 'translateY(-70px)'}}>
        {pills.map((p) => {
          const s = spring({frame: frame - p.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
          const a = Math.max(0, Math.min(1, s));
          return (
            <div
              key={p.text}
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
              {p.text}
            </div>
          );
        })}
      </div>
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- text (b07): TEXT-ONLY beat — word-timed Sticker title centered over canonical blue ----------
const TEXT_TOP = 376; // vertical center for a title-role sticker on the 900px canvas (QC-tunable)
const TextBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.label ? <Sticker text={beat.label} role="title" bg="white" delay={beat.labelDelay ?? 8} topCenter top={TEXT_TOP} /> : null}
  </AbsoluteFill>
);

// ---------- transitions: fade at BOOKEND hero boundaries ONLY (b01 open / b12 close); signature
// slides otherwise. 'heromid' is deliberately EXCLUDED from isHero — mid-lesson fades are banned,
// so b09→b10 and b10→b11 stay slide (from-right). ----------
const T = 12;
const isHero = (b: Beat) => b.mode === 'hero' || b.mode === 'hero2';
const pickTransition = (prev: Beat, next: Beat) => {
  if (isHero(prev) || isHero(next)) return {presentation: fade(), frames: 14};
  return {presentation: slide({direction: 'from-right' as const}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'hero2') return <HeroOutroBeat beat={b} dur={dur} />;
  if (b.mode === 'heromid') return <HeroMidBeat beat={b} />;
  if (b.mode === 'lockup') return <LockupBeat beat={b} />;
  if (b.mode === 'text') return <TextBeat beat={b} />;
  return <VideoBeat beat={b} dur={dur} />;
};

export const Lesson17: React.FC = () => {
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

export const LESSON_17_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

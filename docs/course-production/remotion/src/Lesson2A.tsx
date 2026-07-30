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
import manifest from '../public/lesson2A/manifest.json';

/**
 * Lesson2A "Who Sells to Us" (Module 02) — audio = master clock (one continuous master.m4a).
 * Motion is CODE ONLY (Grok repaints our doodle characters off-brand — ARCHITECTURE.md FINAL VERDICT),
 * except 2 Seedance single-character idle clips (b03, b05) composited as alpha ProRes.
 * Grid spine: 6 distraught-seller portraits — b02 intro (faces) → b04 labeled situations → b08 thumbnails.
 * Cafe Andrea bookends (b01 +badge, b09); headset corner circle on b05.
 * Transitions: fade at hero boundaries, deterministic from-right slides otherwise (sidesteps PLAYBOOK 7.13 seed bug).
 */

const BLUE = '#62b3f3';

type LabelItem = {text: string; delay: number};

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  still2?: string;
  hero?: string;
  circle?: string;
  videos?: string[];
  videoFrames?: number[];
  grid?: string[];
  gridLabels?: string[];
  gridLabelDelays?: number[];
  labels?: LabelItem[];
  takeaways?: LabelItem[];
  label?: string;
  labelDelay?: number;
  labelTop?: boolean;
  extras?: {fork?: number};
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

// ---------- Andrea corner circle ----------
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

// ---------- generic scene / card ----------
const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const push =
    beat.mode === 'scene'
      ? interpolate(frame, [0, dur], [1.0, 1.06], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
      : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {beat.label ? (
        beat.labelTop
          ? <Sticker text={beat.label} role="title" bg="white" delay={beat.labelDelay ?? 8} topCenter />
          : <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter />
      ) : null}
    </AbsoluteFill>
  );
};


// ---------- hero (full-frame avatar clip, muted; master audio carries sound) ----------
// herolabels: same, plus a right-stacked cascade of labels (b17 disqualifiers over full-body Andrea)
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    {(beat.labels ?? []).map((it, i) => (
      <Sticker key={it.text} text={it.text} role="caption" bg="white" delay={it.delay} top={175 + i * 122} left={1030} />
    ))}
    {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- card: single big centered title on blue (b16 "write it down") ----------
const CardBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - (beat.labelDelay ?? 8), fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          transform: `scale(${Math.max(0, Math.min(1, s))})`,
          opacity: Math.min(1, s * 1.5),
          background: '#ffffff',
          borderRadius: 26,
          padding: '18px 48px',
          fontFamily: 'Baloo 2, sans-serif',
          fontWeight: 800,
          fontSize: 84,
          color: '#111',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}
      >
        {beat.label}
      </div>
    </AbsoluteFill>
  );
};

// ---------- anim beat: single Seedance clip (alpha ProRes) + hold-still tail ----------
const AnimBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const clips = beat.videos ?? [];
  const lens = beat.videoFrames ?? [];
  const tailStart = lens.reduce((a, b) => a + b, 0);
  const push = interpolate(frame, [tailStart, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const starts: number[] = [];
  let acc = 0;
  for (const l of lens) {
    starts.push(acc);
    acc += l;
  }
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* still ONLY in the hold tail — never under the anim, or its static limbs ghost through the
          alpha clip when the character moves (the b18 "duplicate", 2026-07-04). During the anim the
          clip's transparent areas show the code canonical blue. */}
      {beat.still && frame >= tailStart ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo muted transparent src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ))}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- grid spine: 6 distraught-seller portraits (b02 faces / b04 labeled) ----------
const GM = 80; // outer margin
const GAP = 24;
const GCOLS = 3;
const GROWS = 2;
const CW = (1600 - 2 * GM - (GCOLS - 1) * GAP) / GCOLS; // 464
const CH = (900 - 2 * GM - (GROWS - 1) * GAP) / GROWS; // 358

const GridCell: React.FC<{src: string; i: number; labelText?: string; labelDelay?: number}> = ({src, i, labelText, labelDelay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const r = Math.floor(i / GCOLS);
  const c = i % GCOLS;
  const x = GM + c * (CW + GAP);
  const y = GM + r * (CH + GAP);
  const pop = spring({frame: frame - i * 4, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 18});
  const bob = 4 * Math.sin((2 * Math.PI * (frame + i * 26)) / 150);
  const ls = labelDelay != null ? spring({frame: frame - labelDelay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 16}) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + bob,
        width: CW,
        height: CH,
        borderRadius: 24,
        overflow: 'hidden',
        border: '8px solid #ffffff',
        backgroundColor: BLUE,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        transform: `scale(${0.82 + 0.18 * Math.max(0, Math.min(1, pop))})`,
        opacity: Math.min(1, pop * 1.5),
      }}
    >
      <Img
        src={staticFile(src)}
        style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 38%'}}
      />
      {labelText && labelDelay != null ? (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: `translateX(-50%) scale(${Math.max(0, Math.min(1, ls))})`,
            opacity: Math.min(1, ls * 1.5),
            background: '#ffffff',
            borderRadius: 14,
            padding: '6px 16px',
            fontFamily: 'Baloo 2, sans-serif',
            fontWeight: 700,
            fontSize: 26,
            color: '#111',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          {labelText}
        </div>
      ) : null}
    </div>
  );
};

const GridBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const cells = beat.grid ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {cells.map((src, i) => (
        <GridCell
          key={src}
          src={src}
          i={i}
          labelText={beat.gridLabels?.[i]}
          labelDelay={beat.gridLabelDelays?.[i]}
        />
      ))}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- vs beat: motivated | curious two-panel camera-travel slide ----------
const VsBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const forkAt = beat.extras?.fork ?? Math.round(dur * 0.5);
  const slideX = interpolate(frame, [forkAt, forkAt + 18], [0, -1600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', width: 1600, height: 900, transform: `translateX(${slideX}px)`}}>
        {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
        <Sticker text="MOTIVATED" role="title" bg="white" delay={10} topCenter />
      </div>
      <div style={{position: 'absolute', width: 1600, height: 900, transform: `translateX(${slideX + 1600}px)`}}>
        {beat.still2 ? <Img src={staticFile(beat.still2)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
        <Sticker text="CURIOUS" role="title" bg="white" delay={forkAt + 8} topCenter />
      </div>
    </AbsoluteFill>
  );
};

// ---------- cascade beat: N labels stack in word-time over a backdrop still (b07) ----------
const CascadeBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const items = beat.labels ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      {items.map((it, i) => (
        <Sticker key={it.text} text={it.text} role="caption" bg="white" delay={it.delay} top={150 + i * 104} left={430} />
      ))}
    </AbsoluteFill>
  );
};

// ---------- recap grid: 6 thumbnails return across the top + 5 takeaway lines cascade ----------
const TW = (1600 - 2 * 60 - 5 * 16) / 6; // thumbnail width ≈ 233
const TH = TW * 0.78;
const RecapGridBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const cells = beat.grid ?? [];
  const takeaways = beat.takeaways ?? [];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {cells.map((src, i) => {
        const x = 60 + i * (TW + 16);
        return (
          <div
            key={src}
            style={{
              position: 'absolute',
              left: x,
              top: 50,
              width: TW,
              height: TH,
              borderRadius: 16,
              overflow: 'hidden',
              border: '6px solid #ffffff',
              backgroundColor: BLUE,
              boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
            }}
          >
            <Img src={staticFile(src)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 38%'}} />
          </div>
        );
      })}
      {takeaways.map((t, i) => (
        <Sticker key={t.text} text={t.text} role="caption" bg="white" delay={t.delay} top={330 + i * 96} left={360} />
      ))}
    </AbsoluteFill>
  );
};

// ---------- transitions (1A rule, Rev3): FADE whenever an Andrea/hero beat is involved, directional
// slides between scene beats. b01(office)→b02(1A-avatar-on-blue) fades between DIFFERENT looks, so it
// no longer reads as fading into the same office scene. Seed on the VARYING tag digits (PLAYBOOK 7.13).
const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  // Rev7: office avatar dropped, intro is one continuous 1A take → no fade anywhere. Horizontal camera-travel
  // slides between ALL beats (vertical slides flip like a coin — Jarrad, v5).
  const dirs = ['from-left', 'from-right'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero' || b.mode === 'herolabels') return <HeroBeat beat={b} />;
  if (b.mode === 'card') return <CardBeat beat={b} />;
  if (b.mode === 'anim') return <AnimBeat beat={b} dur={dur} />;
  if (b.mode === 'grid') return <GridBeat beat={b} dur={dur} />;
  if (b.mode === 'vs') return <VsBeat beat={b} dur={dur} />;
  if (b.mode === 'cascade') return <CascadeBeat beat={b} dur={dur} />;
  if (b.mode === 'recapgrid') return <RecapGridBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const Lesson2A: React.FC = () => {
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

export const LESSON_2A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

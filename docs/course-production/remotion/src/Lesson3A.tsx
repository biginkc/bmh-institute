import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import {Sticker} from './Sticker';
import manifest from '../public/lesson3A/manifest.json';

const baloo = loadBaloo();

/**
 * Lesson3A "BMH Offer Playbook A" — audio = master clock (one continuous master.m4a, 1.0s gaps).
 * Motion is CODE ONLY (Jarrad's staged actions are all code two-state/prop moves; zero Seedance).
 * Office-Andrea hero bookends (b01 badge / b18 tease). Headset-Andrea drawn as the in-scene rep.
 * New renderers vs LessonB: PanelBeat (still + positioned white-card stickers), WandBeat
 * (b04 disrepair→restored crossfade + sparkle), RoadmapBeat (b07–b11 step lighting).
 * Transition-seed fix (PLAYBOOK 7.13): charCodeAt(1)+charCodeAt(2) — char 3 was always '_'.
 */

const BLUE = '#62b3f3';
const W = 1600;
const H = 900;

type Stick = {text: string; delay: number; top?: number; left?: number; bg?: string; role?: string; bottomCenter?: boolean};
type BoardLine = {text: string; delay: number; top: number; left: number; size?: number};

type Beat = {
  tag: string;
  mode: string;
  still?: string;
  house1?: string;
  house2?: string;
  hero?: string;
  videos?: string[];
  videoFrames?: number[];
  alpha?: boolean; // clip is alpha-keyed (character composited over the canonical field)
  label?: string;
  labelDelay?: number;
  stickers?: Stick[];
  boardLines?: BoardLine[]; // b15/b16 ink text written inside the whiteboard
  step?: number; // roadmap: 1..4, or 0 = all
  transformFrame?: number; // wand
  push?: boolean;
  badge?: boolean;
  durationInFrames: number;
};

// ---------- BMH badge (standing rule: opening scene) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- positioned white-card stickers ----------
const Stickers: React.FC<{items?: Stick[]}> = ({items}) => (
  <>
    {(items ?? []).map((s, i) => (
      <Sticker
        key={`${s.text}-${i}`}
        text={s.text}
        role={(s.role as 'label' | 'title' | 'caption') ?? 'label'}
        bg={(s.bg as 'yellow' | 'cream' | 'white' | 'ink') ?? 'white'}
        delay={s.delay}
        top={s.top}
        left={s.left}
        bottomCenter={s.bottomCenter}
      />
    ))}
  </>
);

// ---------- hero (full-frame avatar clip, muted; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      beat.alpha ? (
        // portrait avatar (b17): bars cropped + bg alpha-keyed → center full-height on canonical blue
        <OffthreadVideo
          transparent
          muted
          src={staticFile(beat.hero)}
          style={{position: 'absolute', height: H, width: (H * 480) / 720, left: (W - (H * 480) / 720) / 2, top: 0}}
        />
      ) : (
        <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: W, height: H}} />
      )
    ) : null}
    <Stickers items={beat.stickers} />
    {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- panel: still (optional gentle push) + positioned stickers + optional label ----------
const PanelBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const push = beat.push
    ? interpolate(frame, [0, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: W, height: H, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Stickers items={beat.stickers} />
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- sparkle burst (code) ----------
const Sparkle: React.FC<{x: number; y: number; at: number}> = ({x, y, at}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - at, fps, config: {damping: 10, stiffness: 120}, durationInFrames: 24});
  const fade2 = interpolate(frame, [at, at + 8, at + 40], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const arm = (rot: number, len: number) => (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: len,
        height: 12,
        background: '#FFF7DE',
        borderRadius: 8,
        transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(${s})`,
        transformOrigin: 'center center',
      }}
    />
  );
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade2}}>
      {/* soft flash */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 220,
          height: 220,
          marginLeft: -110,
          marginTop: -110,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,247,222,0.9) 0%, rgba(255,247,222,0) 70%)',
          transform: `scale(${0.4 + s})`,
        }}
      />
      {arm(0, 180)}
      {arm(90, 180)}
      {arm(45, 120)}
      {arm(-45, 120)}
    </div>
  );
};

// ---------- wand transform: rep points, house crosses disrepair -> restored + sparkle ----------
// rep occupies left; houses occupy right. Clip each so neither's flat-blue field covers the other.
// bigger re-rolled house fills center-right → tighter CLIP closes the rep↔house gap.
const CLIP = 560;
const WandBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const at = beat.transformFrame ?? 120;
  const reveal = interpolate(frame, [at, at + 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const clipLeft = `inset(0 ${W - CLIP}px 0 0)`;
  const repVid = beat.videos?.[0];
  const repFrames = beat.videoFrames?.[0] ?? 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* houses full-frame (canonical blue everywhere); their blue-left is the rep's backdrop */}
      {beat.house1 ? (
        <Img src={staticFile(beat.house1)} style={{position: 'absolute', width: W, height: H}} />
      ) : null}
      {beat.house2 ? (
        <Img src={staticFile(beat.house2)} style={{position: 'absolute', width: W, height: H, opacity: reveal}} />
      ) : null}
      {/* rep waving the wand — ALPHA clip composited full-frame (no seam), plays for its duration */}
      {repVid ? (
        <Sequence from={0} durationInFrames={repFrames}>
          <OffthreadVideo transparent muted src={staticFile(repVid)} style={{position: 'absolute', width: W, height: H}} />
        </Sequence>
      ) : null}
      {/* static rep tail (clipped left so its blue never covers the house) after the clip returns */}
      {beat.still ? (
        <Sequence from={repVid ? repFrames : 0}>
          <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H, clipPath: clipLeft}} />
        </Sequence>
      ) : null}
      <Sparkle x={540} y={360} at={at} />
      <Stickers items={beat.stickers} />
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- roadmap: steps-board + ACTIVE STEP RECOLORED (yellow→orange) + step label ----------
// The stop circles are baked yellow with a black numeral; we overlay a same-size orange disc
// (matched black outline) and redraw the numeral so the active step visibly changes color.
// measured on the road+icons-only board: circles sit ON the wavy road under each icon
const STOPS = [
  {cx: 250, cy: 556},
  {cx: 640, cy: 548},
  {cx: 1010, cy: 560},
  {cx: 1330, cy: 554},
];
// ALL FOUR numbered circles are drawn in CODE (the still is now road + icons only) — no baked
// numbers to peek through, and every step renders identically (active = orange, inactive = yellow).
const STOP_D = 132;
const Stop: React.FC<{cx: number; cy: number; n: number; active: boolean}> = ({cx, cy, n, active}) => (
  <div
    style={{
      position: 'absolute',
      left: cx,
      top: cy,
      width: STOP_D,
      height: STOP_D,
      marginLeft: -STOP_D / 2,
      marginTop: -STOP_D / 2,
      borderRadius: '50%',
      background: active ? '#FF8A3D' : '#FFD23F',
      border: '6px solid #111',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: baloo.fontFamily,
      fontWeight: 700,
      fontSize: 62,
      color: '#111',
    }}
  >
    {n}
  </div>
);
const RoadmapBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const active = beat.step ?? 0; // 0 = all
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H}} /> : null}
      {/* "OFFER" written on the step-3 document icon */}
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 348,
          transform: 'translate(-50%,-50%) rotate(-4deg)',
          fontFamily: baloo.fontFamily,
          fontWeight: 700,
          fontSize: 30,
          color: '#111',
        }}
      >
        OFFER
      </div>
      {STOPS.map((st, i) => (
        <Stop key={i} cx={st.cx} cy={st.cy} n={i + 1} active={active === 0 || active === i + 1} />
      ))}
      <Stickers items={beat.stickers} />
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- board: whiteboard still + INK text written INSIDE it (no card, no shadow) ----------
const BoardBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H}} /> : null}
      {/* the REAL doodle BMH logo (green B|M|H badge) in the board's top-right corner */}
      <Img src={staticFile('lessonA/bmh-endcard.png')} style={{position: 'absolute', left: 1058, top: 162, width: 112}} />
      {(beat.boardLines ?? []).map((ln, i) => {
        const s = spring({frame: frame - ln.delay, fps, config: {damping: 13, stiffness: 160}, durationInFrames: 16});
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: ln.top,
              left: ln.left,
              fontFamily: baloo.fontFamily,
              fontWeight: 700,
              fontSize: ln.size ?? 50,
              color: '#111',
              whiteSpace: 'nowrap',
              transform: `scale(${s})`,
              transformOrigin: 'left center',
              opacity: Math.min(1, s * 1.5),
            }}
          >
            {ln.text}
          </div>
        );
      })}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- video: full-frame animation clip (b12 walk-and-talk) + hold-still tail ----------
const VideoBeat: React.FC<{beat: Beat}> = ({beat}) => {
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
      {clips.map((src, i) => (
        <Sequence key={src} from={starts[i]} durationInFrames={lens[i]}>
          <OffthreadVideo transparent={!!beat.alpha} muted src={staticFile(src)} style={{position: 'absolute', width: W, height: H}} />
        </Sequence>
      ))}
      {/* hold-still tail AFTER the clip(s) — keeps alpha clips from ghosting over a static copy */}
      {beat.still ? (
        <Sequence from={tailStart}>
          <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H}} />
        </Sequence>
      ) : null}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 8} bottomCenter /> : null}
    </AbsoluteFill>
  );
};

// ---------- transitions (ported from LessonA/1A) ----------
// 1A rules: fade at hero bookends; else directional slide seeded on chars 1+2 (T=13).
// 3A addition: the roadmap run (b07–b11 share one board) crossfades softly so the board stays
// put and the active step just recolors — consistent, no jarring directional slide between steps.
const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'roadmap' && next.mode === 'roadmap') return {presentation: fade(), frames: 8};
  if (prev.mode.startsWith('hero') || next.mode.startsWith('hero')) return {presentation: fade(), frames: T};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'wand') return <WandBeat beat={b} />;
  if (b.mode === 'roadmap') return <RoadmapBeat beat={b} />;
  if (b.mode === 'board') return <BoardBeat beat={b} />;
  if (b.mode === 'video') return <VideoBeat beat={b} />;
  return <PanelBeat beat={b} dur={dur} />;
};

export const Lesson3A: React.FC = () => {
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

export const LESSON_3A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

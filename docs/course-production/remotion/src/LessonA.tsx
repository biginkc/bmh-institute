import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import manifest from '../public/lessonA/manifest.json';

/**
 * LessonA v2.1 — audio = master clock; canonical blue #62b3f3 everywhere.
 * Modes: hero-solo | hero-office | corner-circle | voice-only | vignettes.
 * Corner scenes get a FRAME transform (fill the frame, keep only a corner pocket).
 * Grok windows ride inside the FRAME wrapper so coords transform together.
 * No <Loop>: clips are beat-length or palindromed (Grok drifts past ~5s).
 */

const BLUE = '#62b3f3';

type Beat = {
  tag: string;
  mode: string;
  hg?: string;
  still?: string;
  durationInFrames: number;
};

// ---------- hero (full-frame talking Andrea, alpha webm) ----------
const HeroSolo: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hg ? (
      <OffthreadVideo
        transparent
        src={staticFile(beat.hg.replace('.mp4', '_hero.webm'))}
        style={{position: 'absolute', width: 593, height: 900, left: 503, top: 0}}
      />
    ) : null}
  </AbsoluteFill>
);

// ---------- hero-office (b17 outro: office-scene avatar, raw full frame) ----------
const HeroOffice: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hg ? (
      <OffthreadVideo
        src={staticFile(beat.hg.replace('.mp4', '_office.mp4'))}
        style={{position: 'absolute', width: 1600, height: 900}}
      />
    ) : null}
  </AbsoluteFill>
);

// ---------- Andrea corner circle ----------
const CIRCLE = 340;
const AndreaCircle: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const bob = 5 * Math.sin((2 * Math.PI * frame) / 150);
  if (!beat.hg) return null;
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
        src={staticFile(beat.hg)}
        transparent={beat.hg.endsWith('.webm')}
        style={{position: 'absolute', width: 1920, height: 1080, left: -790, top: -17}}
      />
    </div>
  );
};

// ---------- Grok windows (inside FRAME wrapper — untransformed coords) ----------
const GROK_WINDOWS: Record<
  string,
  {src: string; window: [number, number, number, number]; video: [number, number]; offset: [number, number]}
> = {
  'b03_people-burden': {src: 'lessonA/s03_pair-white-skin-alpha.webm', window: [144, 230, 718, 651], video: [1581, 900], offset: [10, 0]},
  'b06_fulfilling-work': {src: 'lessonA/s06_pair-white-skin-alpha.webm', window: [120, 80, 830, 730], video: [1600, 900], offset: [0, 0]},
  'b15_consult-not-sell': {src: 'lessonA/s15_pair.mp4', window: [100, 110, 960, 640], video: [1600, 900], offset: [0, 0]},
};

const GrokWindow: React.FC<{cfg: (typeof GROK_WINDOWS)[string]}> = ({cfg}) => (
  <div
    style={{
      position: 'absolute',
      left: cfg.window[0],
      top: cfg.window[1],
      width: cfg.window[2],
      height: cfg.window[3],
      overflow: 'hidden',
      // Alpha character clips move over a matching static pose.  Clear the
      // clipped replacement area first so the static pose cannot protrude
      // behind the moving figure as black blocks/halos.
      backgroundColor: cfg.src.endsWith('.webm') ? BLUE : undefined,
    }}
  >
    <OffthreadVideo
      src={staticFile(cfg.src)}
      muted
      transparent={cfg.src.endsWith('.webm')}
      style={{
        position: 'absolute',
        left: cfg.offset[0] - cfg.window[0],
        top: cfg.offset[1] - cfg.window[1],
        width: cfg.video[0],
        height: cfg.video[1],
      }}
    />
  </div>
);

// ---------- FRAME transforms: fill the frame, keep only a corner pocket ----------
// scale/dx/dy applied to a 1600x900 wrapper holding still + grok window together.
// Fit-computed per cleaned still: scale/offset chosen so NO content reaches a frame
// edge (rule: transforms must never clip art). Corner beats leave the 420px pocket.
const FRAMES: Record<string, {scale: number; dx: number; dy: number}> = {
  'b03_people-burden': {scale: 1.35, dx: 208, dy: -128},
  'b05_cash-asis': {scale: 1.3, dx: 240, dy: 130},
  'b06_fulfilling-work': {scale: 1.35, dx: 364, dy: -47}, // voice-only now: fully centered
  'b12_script-tool': {scale: 1.05, dx: 63, dy: -5},
  'b13_guide-path': {scale: 1.2, dx: 174, dy: -30},
  'b15_consult-not-sell': {scale: 1.25, dx: 71, dy: 25},
};

// alpha-video overlays (keyed Grok clips laid over the still full-frame)
const ALPHA_OVERLAYS: Record<string, string> = {};

// walking overlay swept across the frame (clip walk-cycle + code traversal)
const AlphaSweep: React.FC<{src: string; d: number}> = ({src, d}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, d], [-120, 420], {extrapolateRight: 'clamp'});
  return (
    <OffthreadVideo
      transparent
      src={staticFile(src)}
      muted
      style={{position: 'absolute', width: 1600, height: 900, transform: `translateX(${x}px)`}}
    />
  );
};

// ---------- scene beat ----------
const SceneBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const f = FRAMES[beat.tag];
  const inner = (
    <>
      {beat.still ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
      ) : null}
      {GROK_WINDOWS[beat.tag] ? <GrokWindow cfg={GROK_WINDOWS[beat.tag]} /> : null}
      {ALPHA_OVERLAYS[beat.tag] ? <AlphaSweep src={ALPHA_OVERLAYS[beat.tag]} d={beat.durationInFrames} /> : null}
    </>
  );
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {f ? (
        <div
          style={{
            position: 'absolute',
            width: 1600,
            height: 900,
            transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`,
            transformOrigin: 'center center',
          }}
        >
          {inner}
        </div>
      ) : (
        inner
      )}
      {beat.mode === 'corner-circle' ? <AndreaCircle beat={beat} /> : null}
      {beat.mode !== 'corner-circle' && beat.hg ? (
        <OffthreadVideo src={staticFile(beat.hg)} style={{opacity: 0, width: 1, height: 1}} />
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- b02: exterior -> zoom into a window -> busy office interior ----------
const BuildingZoom: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const d = beat.durationInFrames;
  // phases: hold 0-22%, push 22-58%, interior 52%-end (fade overlaps the push apex)
  const push = interpolate(frame, [d * 0.22, d * 0.58], [1, 3.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const interiorIn = interpolate(frame, [d * 0.52, d * 0.6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* exterior pushing toward the upper-left window (origin tuned to the sign-adjacent window) */}
      <Img
        src={staticFile('lessonA/stills/m01_LA_s02_bmh-building.png')}
        style={{
          position: 'absolute',
          width: 1600,
          height: 900,
          transform: `scale(${push})`,
          transformOrigin: '22% 32%',
        }}
      />
      {/* interior reveal — Priya + Sam animated in their windows */}
      <AbsoluteFill style={{opacity: interiorIn, backgroundColor: BLUE}}>
        <Img
          src={staticFile('lessonA/stills/m01_LA_s02b_office-interior.png')}
          style={{position: 'absolute', width: 1600, height: 900}}
        />
        <div style={{position: 'absolute', left: 10, top: 330, width: 620, height: 560, overflow: 'hidden'}}>
          <OffthreadVideo muted src={staticFile('lessonA/int_priya.mp4')}
            style={{position: 'absolute', left: -10, top: -330, width: 1600, height: 900}} />
        </div>
        <div style={{position: 'absolute', left: 920, top: 120, width: 470, height: 460, overflow: 'hidden'}}>
          <OffthreadVideo muted src={staticFile('lessonA/int_sam.mp4')}
            style={{position: 'absolute', left: -920, top: -120, width: 1600, height: 900}} />
        </div>
      </AbsoluteFill>
      {beat.hg ? <OffthreadVideo src={staticFile(beat.hg)} style={{opacity: 0, width: 1, height: 1}} /> : null}
    </AbsoluteFill>
  );
};

// ---------- b04b vignettes: door / tombstone / disrepair pop with the narration list ----------
// timed to Elizabeth's exact words via /v3/voices/speech word_timestamps
const VIGNETTES = [
  {src: 'lessonA/vignettes/vignette_door.png', at: 0.365, x: 120, y: 200, w: 400},
  {src: 'lessonA/vignettes/vignette_tombstone.png', at: 0.452, x: 620, y: 230, w: 360},
  {src: 'lessonA/vignettes/vignette_disrepair.png', at: 0.644, x: 1060, y: 210, w: 400},
];

const VignettePop: React.FC<{src: string; delay: number; x: number; y: number; w: number}> = ({
  src,
  delay,
  x,
  y,
  w,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 20});
  return (
    <Img
      src={staticFile(src)}
      style={{position: 'absolute', left: x, top: y, width: w, transform: `scale(${s})`, opacity: Math.min(1, s * 1.5)}}
    />
  );
};

const VignettesBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {VIGNETTES.map((v) => (
      <VignettePop key={v.src} src={v.src} delay={Math.round(beat.durationInFrames * v.at)} x={v.x} y={v.y} w={v.w} />
    ))}
    {beat.hg ? <OffthreadVideo src={staticFile(beat.hg)} style={{opacity: 0, width: 1, height: 1}} /> : null}
  </AbsoluteFill>
);

// ---------- logo end-card ----------
const END_CARD_FRAMES = 75;
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center'}}>
      <Img src={staticFile('lessonA/bmh-endcard.png')} style={{width: 560, opacity}} />
    </AbsoluteFill>
  );
};

// ---------- transitions ----------
const T = 13;
const T_CARD = 5;
const isCard = (tag: string) =>
  tag.startsWith('b07') || tag.startsWith('b08') || tag.startsWith('b09') || tag.startsWith('b10');

const pickTransition = (prev: Beat, next: Beat) => {
  if (isCard(prev.tag) || isCard(next.tag)) {
    return {presentation: slide({direction: 'from-right' as const}), frames: T_CARD};
  }
  if (prev.mode.startsWith('hero') || next.mode.startsWith('hero')) {
    return {presentation: fade(), frames: T};
  }
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const CardPop: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 12, stiffness: 160}, durationInFrames: 18});
  return <AbsoluteFill style={{transform: `scale(${0.85 + 0.15 * s})`}}>{children}</AbsoluteFill>;
};

const beatContent = (b: Beat) => {
  if (b.mode === 'hero-solo') return <HeroSolo beat={b} />;
  if (b.mode === 'hero-office') return <HeroOffice beat={b} />;
  if (b.mode === 'vignettes') return <VignettesBeat beat={b} />;
  if (b.tag === 'b02_sincerity') return <BuildingZoom beat={b} />;
  if (isCard(b.tag))
    return (
      <CardPop>
        <SceneBeat beat={b} />
      </CardPop>
    );
  return <SceneBeat beat={b} />;
};

export const LessonA: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1]) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={b.tag} durationInFrames={b.durationInFrames + pad}>
              {beatContent(b)}
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
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
        <TransitionSeries.Sequence durationInFrames={END_CARD_FRAMES}>
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_A_FRAMES: number =
  (manifest as {totalFrames: number}).totalFrames + END_CARD_FRAMES + 15;

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
import manifest from '../public/lesson5A/manifest.json';

/**
 * Lesson 5A "Opening the Call" (Module 05 / Slot 07, cues 1-10).
 * Audio = master clock (one master.m4a with 1.0s silence between beats).
 * Motion model (Jarrad 2026-07-05): Remotion = transitions + word-timed Sticker text + code
 * concept graphics ONLY. Scene beats (b03/b07/b08/b10) are Seedance clips over a hold-still tail.
 */

const BLUE = '#62b3f3';
// HeyGen pads portrait avatars with light-gray bars inside the 16:9 frame. For those
// clips (heroInset), clip to the centered blue strip and back with the strip's own blue
// so no gray shows. Strip measured at native x=400..879 (1280w) → element 500..1100 (1600w).
const HERO_BLUE = '#56aaee';
const P = {yellow: '#FFD23F', orange: '#F5871F', cream: '#FFF7DE', white: '#FFFFFF', ink: '#111111'};

type Stick = {
  text: string;
  delay: number;
  role?: 'label' | 'title' | 'caption';
  top?: number;
  left?: number;
  topCenter?: boolean;
  bottomCenter?: boolean;
};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  video?: string;
  videoFrames?: number;
  stickers?: Stick[];
  cues?: {approved?: number; denied?: number};
  badge?: boolean;
  heroInset?: boolean;
  durationInFrames: number;
};

// ---------- BMH badge (standing rule: opening beat of every module) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const Stickers: React.FC<{items?: Stick[]}> = ({items}) => (
  <>
    {(items ?? []).map((s, i) => (
      <Sticker
        key={i}
        text={s.text}
        role={s.role ?? 'label'}
        bg="white"
        delay={s.delay}
        top={s.top}
        left={s.left}
        topCenter={s.topCenter}
        bottomCenter={s.bottomCenter}
      />
    ))}
  </>
);

// ---------- hero (full-frame avatar clip, muted; master audio carries sound) ----------
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: beat.heroInset ? HERO_BLUE : BLUE}}>
    {beat.hero ? (
      <OffthreadVideo
        muted
        src={staticFile(beat.hero)}
        style={{
          position: 'absolute',
          width: 1600,
          height: 900,
          ...(beat.heroInset ? {clipPath: 'inset(0 506px 0 506px)'} : {}),
        }}
      />
    ) : null}
    <Stickers items={beat.stickers} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- prop (approved still full-frame + gentle life) ----------
const PropBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pulse = beat.tag === 'b02_15sec' ? 1 + 0.02 * Math.sin((2 * Math.PI * frame) / 45) : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push * pulse})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- video (Seedance clip, then hold-still tail; clip ends on start pose) ----------
const VideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const clipLen = beat.videoFrames ?? 450;
  const push = interpolate(frame, [clipLen, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${frame >= clipLen ? push : 1})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {beat.video ? (
        <Sequence from={0} durationInFrames={clipLen}>
          <OffthreadVideo muted src={staticFile(beat.video)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- flip (b04): a card flips from "being sold to" to "being evaluated" ----------
const FlipBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const flipAt = Math.round(dur * 0.42);
  const rot = interpolate(frame, [flipAt, flipAt + 22], [0, 180], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const face = (bg: string, top: string, sub: string, back: boolean): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    background: bg,
    border: '7px solid #111',
    borderRadius: 28,
    backfaceVisibility: 'hidden',
    transform: back ? 'rotateY(180deg)' : undefined,
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{width: 900, height: 380, perspective: 1600}}>
        <div style={{position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateY(${rot}deg)`}}>
          <div style={face(P.cream, '', '', false)}>
            <div style={{fontFamily: 'sans-serif', fontWeight: 800, fontSize: 40, color: '#7a5b00'}}>THEY FEEL</div>
            <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 72, color: P.ink}}>SOLD&nbsp;TO&nbsp;✕</div>
          </div>
          <div style={face(P.yellow, '', '', true)}>
            <div style={{fontFamily: 'sans-serif', fontWeight: 800, fontSize: 40, color: '#7a5b00'}}>NOW THEY FEEL</div>
            <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 72, color: P.ink}}>EVALUATED&nbsp;✓</div>
          </div>
        </div>
      </div>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- fork (b06): a clock ticking + two outcome paths ----------
const ForkBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const min = (frame / dur) * 300; // sweep
  const hand = (len: number, deg: number, w: number) => (
    <line
      x1={130}
      y1={130}
      x2={130 + len * Math.sin((deg * Math.PI) / 180)}
      y2={130 - len * Math.cos((deg * Math.PI) / 180)}
      stroke={P.ink}
      strokeWidth={w}
      strokeLinecap="round"
    />
  );
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* clock */}
      <div style={{position: 'absolute', left: 660, top: 210, width: 280, height: 280}}>
        <svg viewBox="0 0 260 260" width={280} height={280}>
          <circle cx={130} cy={130} r={120} fill={P.cream} stroke={P.ink} strokeWidth={10} />
          {Array.from({length: 12}).map((_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            return <line key={i} x1={130 + 100 * Math.sin(a)} y1={130 - 100 * Math.cos(a)} x2={130 + 112 * Math.sin(a)} y2={130 - 112 * Math.cos(a)} stroke={P.ink} strokeWidth={5} />;
          })}
          {hand(60, (min / 12) % 360, 10)}
          {hand(95, min % 360, 6)}
          <circle cx={130} cy={130} r={9} fill={P.ink} />
        </svg>
      </div>
      {/* two paths */}
      <svg viewBox="0 0 1600 900" width={1600} height={900} style={{position: 'absolute', inset: 0}}>
        <path d="M800 500 C 620 560, 430 560, 320 610" fill="none" stroke={P.white} strokeWidth={12} strokeLinecap="round" strokeDasharray="4 20" />
        <path d="M800 500 C 980 560, 1170 560, 1230 610" fill="none" stroke={P.white} strokeWidth={12} strokeLinecap="round" strokeDasharray="4 20" />
      </svg>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- gauge (b09): compliance meter fills, check lands ----------
const GaugeBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [20, dur - 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ang = -90 + t * 180;
  const {fps} = useVideoConfig();
  const chk = spring({frame: frame - (dur - 45), fps, config: {damping: 11, stiffness: 160}, durationInFrames: 18});
  const arc = (frac: number, color: string, w: number) => {
    const a0 = Math.PI, a1 = Math.PI * (1 - frac);
    const x0 = 200 + 150 * Math.cos(a0), y0 = 200 - 150 * Math.sin(a0);
    const x1 = 200 + 150 * Math.cos(a1), y1 = 200 - 150 * Math.sin(a1);
    return <path d={`M ${x0} ${y0} A 150 150 0 0 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />;
  };
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'relative', width: 560, height: 340, marginTop: 40}}>
        <svg viewBox="0 0 400 220" width={560} height={330} style={{position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)'}}>
          {arc(1, P.cream, 30)}
          {arc(t, P.yellow, 30)}
          <line x1={200} y1={200} x2={200 + 150 * Math.cos(((ang - 90) * Math.PI) / 180)} y2={200 + 150 * Math.sin(((ang - 90) * Math.PI) / 180)} stroke={P.ink} strokeWidth={10} strokeLinecap="round" />
          <circle cx={200} cy={200} r={15} fill={P.ink} />
        </svg>
        {/* drawn check (palette-safe; no green emoji) */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: `translateX(-50%) scale(${Math.max(0, chk)})`,
            width: 120,
            height: 120,
            borderRadius: 28,
            background: P.yellow,
            border: '7px solid #111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 78,
            fontWeight: 900,
            color: P.ink,
          }}
        >
          ✓
        </div>
      </div>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- bar (b12): 80/20 listen-vs-talk ----------
const BarBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [15, 55], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const W = 1100;
  const cell = (w: number, bg: string, big: string, small: string): React.CSSProperties => ({
    width: w,
    height: 150,
    background: bg,
    border: '7px solid #111',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', width: W, borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.15)'}}>
        <div style={cell(W * 0.8 * grow, P.yellow, '', '')}>
          <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 52, color: P.ink, whiteSpace: 'nowrap'}}>LISTEN&nbsp;&nbsp;80%</div>
        </div>
        <div style={cell(W * 0.2 * grow, P.orange, '', '')}>
          <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 30, color: P.ink, whiteSpace: 'nowrap'}}>TALK 20%</div>
        </div>
      </div>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- stopwatch (b02): real ticking second hand ----------
const StopwatchBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sec = Math.floor(frame / fps); // discrete tick each second
  const secDeg = (sec % 60) * 6;
  const minDeg = (frame / fps / 60) * 6; // slow continuous
  const CX = 300, CY = 360, R = 232;
  const hand = (len: number, deg: number, w: number, color: string) => (
    <line
      x1={CX}
      y1={CY}
      x2={CX + len * Math.sin((deg * Math.PI) / 180)}
      y2={CY - len * Math.cos((deg * Math.PI) / 180)}
      stroke={color}
      strokeWidth={w}
      strokeLinecap="round"
    />
  );
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <svg viewBox="0 0 600 660" width={620} height={682}>
        {/* top button + stem */}
        <rect x={272} y={26} width={56} height={36} rx={12} fill={P.yellow} stroke={P.ink} strokeWidth={8} />
        <rect x={284} y={58} width={32} height={44} rx={6} fill={P.orange} stroke={P.ink} strokeWidth={8} />
        {/* bezel + face */}
        <circle cx={CX} cy={CY} r={R + 16} fill={P.ink} />
        <circle cx={CX} cy={CY} r={R} fill={P.cream} />
        {/* 60 ticks, majors every 5 */}
        {Array.from({length: 60}).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const major = i % 5 === 0;
          const r0 = R - (major ? 30 : 16);
          return (
            <line
              key={i}
              x1={CX + r0 * Math.sin(a)}
              y1={CY - r0 * Math.cos(a)}
              x2={CX + (R - 6) * Math.sin(a)}
              y2={CY - (R - 6) * Math.cos(a)}
              stroke={P.ink}
              strokeWidth={major ? 7 : 3}
            />
          );
        })}
        {hand(120, minDeg, 14, P.ink)}
        {hand(200, secDeg, 7, P.orange)}
        <circle cx={CX} cy={CY} r={15} fill={P.ink} />
      </svg>
    </AbsoluteFill>
  );
};

// ---------- stamp (b05): APPROVED / DENIED rubber stamps slam down word-timed ----------
const StampBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cues = beat.cues ?? {};
  const stamp = (label: string, at: number | undefined, color: string, tilt: number, x: number, y: number) => {
    if (at == null) return null;
    const t = frame - at;
    if (t < 0) return null;
    const s = spring({frame: t, fps, config: {damping: 9, stiffness: 210, mass: 0.6}, durationInFrames: 14});
    const scale = 2.5 - 1.5 * Math.min(1, s);
    return (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `translate(-50%,-50%) rotate(${tilt}deg) scale(${scale})`,
          opacity: Math.min(1, t / 4),
          border: `9px solid ${color}`,
          color,
          borderRadius: 14,
          padding: '10px 40px',
          fontFamily: 'sans-serif',
          fontWeight: 900,
          fontSize: 74,
          letterSpacing: 3,
          background: 'transparent',
        }}
      >
        {label}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* the application/document the stamps land on */}
      <div style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 780, height: 580, background: P.cream, border: '7px solid #111', borderRadius: 18}}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{position: 'absolute', left: 64, top: 64 + i * 74, width: i % 2 ? 440 : 620, height: 16, borderRadius: 8, background: '#e6dcb4'}} />
        ))}
      </div>
      {stamp('APPROVED', cues.approved, P.orange, -13, 600, 360)}
      {stamp('DENIED', cues.denied, P.ink, 11, 1010, 470)}
    </AbsoluteFill>
  );
};

// ---------- transitions ----------
const T = 12;
// Transitions match Lesson 1A: slides in/out everywhere, fade ONLY at the cafe bookends
// (into the opening b01, out to the closing b13). Mid-lesson hero beats (b03 lip-Andrea,
// b04a full-body) now SLIDE like the rest — no mid-lesson fade-ins. Jarrad 2026-07-05.
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.tag === 'b01_intro' || next.tag === 'b13_outro') return {presentation: fade(), frames: 14};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length; // 1A formula (PLAYBOOK 7.13)
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  switch (b.mode) {
    case 'hero':
      return <HeroBeat beat={b} />;
    case 'video':
      return <VideoBeat beat={b} dur={dur} />;
    case 'stopwatch':
      return <StopwatchBeat beat={b} dur={dur} />;
    case 'stamp':
      return <StampBeat beat={b} dur={dur} />;
    case 'flip':
      return <FlipBeat beat={b} dur={dur} />;
    case 'fork':
      return <ForkBeat beat={b} dur={dur} />;
    case 'gauge':
      return <GaugeBeat beat={b} dur={dur} />;
    case 'bar':
      return <BarBeat beat={b} dur={dur} />;
    default:
      return <PropBeat beat={b} dur={dur} />;
  }
};

export const Lesson5A: React.FC = () => {
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

export const LESSON_5A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

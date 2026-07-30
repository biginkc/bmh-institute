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
import manifest from '../public/lesson5B/manifest.json';

/**
 * Lesson 5B "The Fact Find" (Module 05 / Slot 07, cues 11-16 + 17 outro).
 * Audio = master clock (one master.m4a with 1.0s silence between beats).
 * Motion model (Jarrad 2026-07-05): Remotion = transitions + word-timed Sticker text + code concept
 * graphics. Scene beats (b02 interrogation/conversation) are Seedance clips over a hold-still tail
 * (added after the still gate; v1 uses the approved stills with a code cut).
 */

const BLUE = '#62b3f3';
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
type Row = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  video?: string;
  videoFrames?: number;
  stillA?: string;
  stillB?: string;
  switchAt?: number;
  card?: {title: string; rows: Row[]};
  emphasis?: {main: string; sub: string; at: number};
  stickers?: Stick[];
  badge?: boolean;
  durationInFrames: number;
};

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
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    <Stickers items={beat.stickers} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- prop (approved still full-frame + gentle push-in) ----------
const PropBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- contrast (b02): interrogation (WRONG) cuts to conversation (RIGHT) on the word ----------
const cornerStyle = (color: string): React.CSSProperties => ({
  position: 'absolute',
  top: 40,
  left: 40,
  background: color,
  color: P.white,
  fontFamily: 'sans-serif',
  fontWeight: 900,
  fontSize: 36,
  letterSpacing: 1,
  padding: '10px 26px',
  borderRadius: 14,
  border: '5px solid #111',
});
const ContrastBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const at = beat.switchAt ?? Math.round(dur * 0.45);
  const showB = frame >= at;
  const fadeB = interpolate(frame, [at, at + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const src = showB ? beat.stillB : beat.stillA;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {src ? (
        <Img src={staticFile(src)} style={{position: 'absolute', width: 1600, height: 900, opacity: showB ? fadeB : 1}} />
      ) : null}
      {showB ? (
        <div style={cornerStyle(P.orange)}>A CONVERSATION&nbsp;&nbsp;✓</div>
      ) : (
        <div style={cornerStyle(P.ink)}>NOT AN INTERROGATION&nbsp;&nbsp;✕</div>
      )}
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- checklist / mistakes (b04, b08): titled card, rows pop word-timed ----------
const ChecklistBeat: React.FC<{beat: Beat; dur: number; mark: 'check' | 'cross'}> = ({beat, mark}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const card = beat.card;
  if (!card) return <AbsoluteFill style={{backgroundColor: BLUE}} />;
  const rowH = 118;
  const cardW = 1180;
  const cardH = 200 + card.rows.length * rowH;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          width: cardW,
          minHeight: cardH,
          background: P.cream,
          border: '8px solid #111',
          borderRadius: 28,
          padding: '36px 48px',
          boxShadow: '0 14px 34px rgba(0,0,0,0.16)',
        }}
      >
        <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 52, color: P.ink, marginBottom: 22, letterSpacing: 1}}>
          {card.title}
        </div>
        {card.rows.map((r, i) => {
          const s = spring({frame: frame - r.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
          const op = Math.min(1, Math.max(0, s));
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                height: rowH,
                opacity: op,
                transform: `translateX(${(1 - op) * 40}px)`,
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  width: 66,
                  height: 66,
                  borderRadius: 16,
                  background: mark === 'check' ? P.yellow : P.white,
                  border: '5px solid #111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 42,
                  fontWeight: 900,
                  color: P.ink,
                }}
              >
                {mark === 'check' ? '✓' : '✕'}
              </div>
              <div style={{fontFamily: 'sans-serif', fontWeight: 700, fontSize: 44, color: P.ink}}>{r.text}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- emphasis (b06): the power question, big; reveal then pain→urgency ----------
const EmphasisBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const em = beat.emphasis;
  if (!em) return <AbsoluteFill style={{backgroundColor: BLUE}} />;
  const s = spring({frame: frame - em.at, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 20});
  const scale = 0.7 + 0.3 * Math.min(1, s);
  const subOp = interpolate(frame, [dur - 55, dur - 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40}}>
      <div
        style={{
          transform: `scale(${scale})`,
          opacity: Math.min(1, s * 1.3),
          background: P.yellow,
          border: '9px solid #111',
          borderRadius: 32,
          padding: '44px 72px',
          maxWidth: 1240,
          textAlign: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 900,
          fontSize: 86,
          lineHeight: 1.08,
          color: P.ink,
          whiteSpace: 'pre-line',
        }}
      >
        {em.main}
      </div>
      <div style={{opacity: subOp, fontFamily: 'sans-serif', fontWeight: 800, fontSize: 46, color: P.white, background: P.orange, border: '6px solid #111', borderRadius: 20, padding: '10px 34px'}}>
        {em.sub}
      </div>
    </AbsoluteFill>
  );
};

// ---------- smile (b07): flat face vs big smile, dull vs lively soundwave ----------
const face = (smile: boolean, frame: number): React.ReactNode => {
  const bars = 7;
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34}}>
      <svg viewBox="0 0 260 260" width={300} height={300}>
        <circle cx={130} cy={130} r={112} fill={P.cream} stroke={P.ink} strokeWidth={9} />
        <circle cx={98} cy={112} r={9} fill={P.ink} />
        <circle cx={162} cy={112} r={9} fill={P.ink} />
        {smile ? (
          <path d="M86 150 Q130 200 174 150" fill="none" stroke={P.ink} strokeWidth={9} strokeLinecap="round" />
        ) : (
          <line x1={92} y1={166} x2={168} y2={166} stroke={P.ink} strokeWidth={9} strokeLinecap="round" />
        )}
      </svg>
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 10, height: 120}}>
        {Array.from({length: bars}).map((_, i) => {
          const base = smile ? 40 + 60 * Math.abs(Math.sin(frame / 6 + i)) : 16 + 4 * Math.abs(Math.sin(frame / 20 + i));
          return <div key={i} style={{width: 18, height: base, borderRadius: 8, background: smile ? P.orange : '#c9bd92', border: '3px solid #111'}} />;
        })}
      </div>
      <div style={{fontFamily: 'sans-serif', fontWeight: 900, fontSize: 40, color: P.ink}}>{smile ? 'BIG SMILE' : 'FLAT'}</div>
    </div>
  );
};
const SmileBeat: React.FC<{beat: Beat; dur: number}> = ({beat}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', gap: 160, alignItems: 'center'}}>
        {face(false, frame)}
        {face(true, frame)}
      </div>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// ---------- transitions ----------
const T = 12;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: 14};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(4)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  switch (b.mode) {
    case 'hero':
      return <HeroBeat beat={b} />;
    case 'prop':
      return <PropBeat beat={b} dur={dur} />;
    case 'contrast':
      return <ContrastBeat beat={b} dur={dur} />;
    case 'checklist':
      return <ChecklistBeat beat={b} dur={dur} mark="check" />;
    case 'mistakes':
      return <ChecklistBeat beat={b} dur={dur} mark="cross" />;
    case 'emphasis':
      return <EmphasisBeat beat={b} dur={dur} />;
    case 'smile':
      return <SmileBeat beat={b} dur={dur} />;
    default:
      return <PropBeat beat={b} dur={dur} />;
  }
};

export const Lesson5B: React.FC = () => {
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

export const LESSON_5B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

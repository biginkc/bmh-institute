import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
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
import manifest from '../public/lesson3B/manifest.json';

const baloo = loadBaloo();
const BLUE = '#62b3f3';
const W = 1600;
const H = 900;

/**
 * Lesson3B "BMH Offer Playbook B" — audio = master clock (one master.m4a, 1.0s inter-beat gaps).
 * All text/marks are CODE, revealed word-timed, and NEVER show a placeholder before their trigger
 * word (Jarrad 2026-07-05). Checklist/exclusion rows and callout stickers all pop in on the exact
 * word the narrator says. 1A solo-Andrea hero bookends; B6 = talking-doodle homeowner (own voice).
 * Transition-seed fix (PLAYBOOK 7.13): charCodeAt(1)+charCodeAt(2) — char 3 is always '_'.
 */

type Row = {label: string; delay: number};
type Stick = {text: string; delay: number; top?: number; left?: number; bg?: string; role?: string; bottomCenter?: boolean};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  still2?: string;
  hero?: string;
  video?: string;
  clip?: number;
  rows?: Row[];
  rowKind?: 'check' | 'x';
  rowsTop?: number;
  rowStep?: number;
  title?: string;
  stickers?: Stick[];
  slideFrame?: number;
  badge?: boolean;
  push?: boolean;
  durationInFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img src={staticFile('lessonA/bmh-endcard.png')} style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}} />
);

const Check: React.FC<{s: number}> = ({s}) => (
  <svg width={44} height={44} viewBox="0 0 24 24" style={{transform: `scale(${s})`}}>
    <path d="M4 12 l5 5 l10 -12" fill="none" stroke="#111" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Xmark: React.FC<{s: number}> = ({s}) => (
  <svg width={40} height={40} viewBox="0 0 24 24" style={{transform: `scale(${s})`}}>
    <path d="M6 6 l12 12 M18 6 l-12 12" fill="none" stroke="#111" strokeWidth={3.4} strokeLinecap="round" />
  </svg>
);

const BOX_X = 800;
const BOX = 66;
const LABEL_X = 892;

const RowItem: React.FC<{row: Row; y: number; kind: 'check' | 'x'}> = ({row, y, kind}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < row.delay) return null;
  const s = spring({frame: frame - row.delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18});
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: BOX_X,
          top: y,
          width: BOX,
          height: BOX,
          borderRadius: 14,
          border: '5px solid #111',
          background: kind === 'check' ? '#FF8A3D' : '#FFFFFF',
          transform: `scale(${s})`,
          transformOrigin: 'center center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {kind === 'check' ? <Check s={s} /> : <Xmark s={s} />}
      </div>
      <div
        style={{
          position: 'absolute',
          left: LABEL_X,
          top: y + 3,
          transform: `scale(${s})`,
          transformOrigin: 'left center',
          opacity: Math.min(1, s * 1.4),
          background: '#FFFFFF',
          color: '#111',
          fontFamily: baloo.fontFamily,
          fontWeight: 700,
          fontSize: 40,
          padding: '10px 24px',
          borderRadius: 16,
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 22px rgba(0,0,0,0.10)',
        }}
      >
        {row.label}
      </div>
    </>
  );
};

const TitlePill: React.FC<{text: string}> = ({text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 12, stiffness: 160}, durationInFrames: 16});
  return (
    <div style={{position: 'absolute', left: BOX_X, top: 72, transform: `scale(${s})`, transformOrigin: 'left center', background: '#FFD23F', color: '#3a2c00', fontFamily: baloo.fontFamily, fontWeight: 700, fontSize: 46, padding: '12px 30px', borderRadius: 18, whiteSpace: 'nowrap'}}>
      {text}
    </div>
  );
};

const RowsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const rows = beat.rows ?? [];
  const top = beat.rowsTop ?? 205;
  const step = beat.rowStep ?? 112;
  const kind = beat.rowKind ?? 'check';
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H, clipPath: `inset(0 ${W - (beat.clip ?? 785)}px 0 0)`}} />
      ) : null}
      {beat.title ? <TitlePill text={beat.title} /> : null}
      {rows.map((r, i) => (
        <RowItem key={i} row={r} y={top + i * step} kind={kind} />
      ))}
    </AbsoluteFill>
  );
};

const Stickers: React.FC<{items?: Stick[]}> = ({items}) => (
  <>
    {(items ?? []).map((s, i) => (
      <Sticker key={i} text={s.text} role={(s.role as 'label' | 'title' | 'caption') ?? 'label'} bg={(s.bg as 'yellow' | 'cream' | 'white' | 'ink') ?? 'white'} delay={s.delay} top={s.top} left={s.left} bottomCenter={s.bottomCenter} />
    ))}
  </>
);

const PanelBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const push = beat.push ? interpolate(frame, [0, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H, transform: `scale(${push})`, transformOrigin: 'center center'}} /> : null}
      {beat.title ? <TitlePill text={beat.title} /> : null}
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

const TransformBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const at = beat.slideFrame ?? 90;
  const shift = interpolate(frame, [at, at + 22], [0, -W], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      <div style={{position: 'absolute', width: 2 * W, height: H, transform: `translateX(${shift}px)`}}>
        {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', left: 0, width: W, height: H}} /> : null}
        {beat.still2 ? <Img src={staticFile(beat.still2)} style={{position: 'absolute', left: W, width: W, height: H}} /> : null}
      </div>
      <Stickers items={beat.stickers} />
    </AbsoluteFill>
  );
};

// The 1A solo-Andrea avatar is a PORTRAIT source, so HeyGen pads the 16:9 clip with light-gray
// side bars. Clip the video to Andrea's blue strip and back the beat with HeyGen's own blue
// (HERO_BLUE, sampled from the clip) so the strip blends seamlessly — Andrea centered on blue,
// no gray, no seam. Clip is nudged ~12px inside the blue edge to skip the boundary gradient.
const HERO_BLUE = '#56aaee';
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: HERO_BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: W, height: H, clipPath: 'inset(0 513px 0 512px)'}} />
    ) : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const MonologueBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.video ? (
      <OffthreadVideo muted src={staticFile(beat.video)} style={{position: 'absolute', width: W, height: H}} />
    ) : beat.still ? (
      <Img src={staticFile(beat.still)} style={{position: 'absolute', width: W, height: H}} />
    ) : null}
  </AbsoluteFill>
);

const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: T};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'rows') return <RowsBeat beat={b} />;
  if (b.mode === 'transform') return <TransformBeat beat={b} />;
  if (b.mode === 'monologue') return <MonologueBeat beat={b} />;
  return <PanelBeat beat={b} dur={dur} />;
};

export const Lesson3B: React.FC = () => {
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
            ? [seq, <TransitionSeries.Transition key={`${b.tag}-t`} presentation={trans.presentation} timing={linearTiming({durationInFrames: trans.frames})} />]
            : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_3B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

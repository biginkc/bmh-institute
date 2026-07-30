import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {wipe} from '@remotion/transitions/wipe';
import {clockWipe} from '@remotion/transitions/clock-wipe';

const BG = '#5B9BD5';
const FONT = '"Arial Black", "Helvetica Neue", sans-serif';

const Sparkle: React.FC<{x: number; y: number; delay?: number; size?: number}> = ({x, y, delay = 0, size = 60}) => {
  const frame = useCurrentFrame();
  const t = frame + delay;
  const s = 0.7 + 0.3 * Math.sin(t / 8);
  const dy = 10 * Math.sin(t / 14);
  return (
    <div style={{position: 'absolute', left: x, top: y + dy, transform: `scale(${s}) rotate(${Math.sin(t / 20) * 12}deg)`}}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M50 6 L58 42 L94 50 L58 58 L50 94 L42 58 L6 50 L42 42 Z" fill="#FFD23F" stroke="#111" strokeWidth={7} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// kinetic word that springs up into place
const Word: React.FC<{text: string; delay: number; size: number; top: number; left: number; bg?: string}> = ({text, delay, size, top, left, bg = '#FFF7DE'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 120}});
  const y = interpolate(s, [0, 1], [50, 0]);
  const op = interpolate(s, [0, 1], [0, 1]);
  return (
    <div style={{position: 'absolute', top, left, transform: `translateY(${y}px)`, opacity: op, fontFamily: FONT, fontWeight: 900, fontSize: size, color: '#111', background: bg, padding: '6px 22px', borderRadius: 18, border: '5px solid #111', whiteSpace: 'nowrap'}}>
      {text}
    </div>
  );
};

const TitleCard: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: BG}}>
    <Word text="THE BMH WAY" delay={0} size={96} top={320} left={430} bg="#FFD23F" />
    <Word text="Welcome & Mindset" delay={16} size={44} top={480} left={560} />
    <Sparkle x={360} y={300} />
    <Sparkle x={1190} y={340} size={54} />
    <Sparkle x={780} y={640} size={44} delay={30} />
  </AbsoluteFill>
);

// scene with Ken Burns zoom + a callout label that pops in
const SceneCallout: React.FC<{src: string; label: string}> = ({src, label}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = interpolate(frame, [0, 90], [1.0, 1.07], {extrapolateRight: 'clamp'});
  const pop = spring({frame: frame - 18, fps, config: {damping: 10, stiffness: 130}});
  const ls = interpolate(pop, [0, 1], [0.4, 1]);
  const lop = interpolate(pop, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{backgroundColor: BG, overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `scale(${scale})`}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <div style={{position: 'absolute', top: 110, right: 90, transform: `scale(${ls})`, opacity: lop, fontFamily: FONT, fontWeight: 900, fontSize: 46, color: '#111', background: '#fff', padding: '10px 24px', borderRadius: 16, border: '5px solid #111', maxWidth: 520, textAlign: 'center'}}>
        {label}
      </div>
      <Sparkle x={1230} y={560} size={44} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = spring({frame, fps, config: {damping: 8, stiffness: 90}});
  const sc = interpolate(b, [0, 1], [0.3, 1]);
  const rot = interpolate(b, [0, 1], [-6, 0]);
  return (
    <AbsoluteFill style={{backgroundColor: BG, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{transform: `scale(${sc}) rotate(${rot}deg)`, fontFamily: FONT, fontWeight: 900, fontSize: 84, color: '#111', background: '#FFD23F', padding: '18px 44px', borderRadius: 26, border: '7px solid #111'}}>
        Now let's get to work
      </div>
      <Sparkle x={410} y={300} />
      <Sparkle x={1150} y={330} size={58} delay={20} />
    </AbsoluteFill>
  );
};

export const EffectsShowcase: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={90}><TitleCard /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
    <TransitionSeries.Sequence durationInFrames={90}><SceneCallout src="scene-people.png" label="Every lead is a real person" /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({direction: 'from-right'})} timing={linearTiming({durationInFrames: 15})} />
    <TransitionSeries.Sequence durationInFrames={90}><SceneCallout src="scene-cash.png" label="Cash. As-is." /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({direction: 'from-left'})} timing={linearTiming({durationInFrames: 15})} />
    <TransitionSeries.Sequence durationInFrames={90}><SceneCallout src="scene-clarity.png" label="Help them picture it" /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={clockWipe({width: 1600, height: 900})} timing={linearTiming({durationInFrames: 20})} />
    <TransitionSeries.Sequence durationInFrames={90}><EndCard /></TransitionSeries.Sequence>
  </TransitionSeries>
);

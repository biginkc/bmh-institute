import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';

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

const Scene: React.FC<{src: string; dur: number}> = ({src, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = interpolate(frame, [0, dur], [1.0, 1.08], {extrapolateRight: 'clamp'});
  // gentle "settle" pop as the scene enters
  const pop = spring({frame, fps, config: {damping: 200}, durationInFrames: 20});
  const enter = interpolate(pop, [0, 1], [0.985, 1]);
  return (
    <AbsoluteFill style={{backgroundColor: '#5B9BD5', overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `scale(${scale * enter})`}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <Sparkle x={1160} y={230} delay={0} />
      <Sparkle x={1330} y={470} delay={22} size={44} />
      <Sparkle x={1090} y={640} delay={44} size={52} />
    </AbsoluteFill>
  );
};

export const CashProof: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90}>
        <Scene src="scene-cash.png" dur={90} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({direction: 'from-right'})} timing={linearTiming({durationInFrames: 15})} />
      <TransitionSeries.Sequence durationInFrames={90}>
        <Scene src="scene-clarity.png" dur={90} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

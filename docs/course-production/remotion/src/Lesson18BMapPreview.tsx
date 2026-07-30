import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const ORANGE = '#FF7A00';
const CREAM = '#FFF7DE';

const pulses = [
  {x: 409, y: 91, w: 104, h: 68, color: YELLOW, delay: 0},
  {x: 586, y: 88, w: 62, h: 136, color: ORANGE, delay: 24},
  {x: 614, y: 244, w: 80, h: 72, color: YELLOW, delay: 48},
  {x: 775, y: 292, w: 92, h: 76, color: ORANGE, delay: 72},
  {x: 958, y: 420, w: 68, h: 125, color: ORANGE, delay: 96},
  {x: 1118, y: 545, w: 76, h: 83, color: YELLOW, delay: 120},
];

const CountyPulse: React.FC<(typeof pulses)[number]> = ({x, y, w, h, color, delay}) => {
  const frame = useCurrentFrame();
  const cycle = ((frame - delay) % 180 + 180) % 180;
  const opacity = interpolate(cycle, [0, 18, 62, 86], [0, 0.38, 0.34, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(cycle, [0, 22, 86], [0.94, 1.04, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 10,
        border: '6px solid #111111',
        backgroundColor: color,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        boxShadow: `0 0 0 ${Math.round(12 * opacity)}px ${CREAM}`,
        mixBlendMode: 'multiply',
      }}
    />
  );
};

export const Lesson18BMapPreview: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Img src={staticFile('lesson18B/b02_county_channels.png')} style={{position: 'absolute', width: 1600, height: 900}} />
      {pulses.map((pulse) => (
        <CountyPulse key={`${pulse.x}-${pulse.y}`} {...pulse} />
      ))}
    </AbsoluteFill>
  );
};

export const LESSON_18B_MAP_PREVIEW_FRAMES = 450;

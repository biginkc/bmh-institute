import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

export type LogoSlug =
  | 'sandra'
  | 'propstream'
  | 'dealmachine'
  | 'deal_sniper'
  | 'dialpad'
  | 'closer_lab'
  | 'hubstaff'
  | 'slack'
  | 'bmh_institute'
  | 'google_docs'
  | 'google_drive'
  | 'gmail';

export type LogoCalloutItem = {
  slug: LogoSlug;
  name: string;
  startFrame: number;
  durationFrames?: number;
  position?: 'topRight' | 'topLeft';
};

const LOGO_BASE = 'logo-callouts/techstack-v3-actual-no-box';

export const LOGO_FILES: Record<LogoSlug, string> = {
  sandra: `${LOGO_BASE}/sandra.png`,
  propstream: `${LOGO_BASE}/propstream.png`,
  dealmachine: `${LOGO_BASE}/dealmachine.png`,
  deal_sniper: `${LOGO_BASE}/deal_sniper.png`,
  dialpad: `${LOGO_BASE}/dialpad.png`,
  closer_lab: `${LOGO_BASE}/closer_lab.png`,
  hubstaff: `${LOGO_BASE}/hubstaff.png`,
  slack: `${LOGO_BASE}/slack.png`,
  bmh_institute: `${LOGO_BASE}/bmh_institute.png`,
  google_docs: `${LOGO_BASE}/google_docs.png`,
  google_drive: `${LOGO_BASE}/google_drive.png`,
  gmail: `${LOGO_BASE}/gmail.png`,
};

// 8 seconds at the course-standard 30fps, per Jarrad's latest logo-callout timing note.
export const DEFAULT_LOGO_CALLOUT_DURATION_FRAMES = 240;

const positionStyle = (position: LogoCalloutItem['position']): React.CSSProperties => {
  if (position === 'topLeft') {
    return {top: 42, left: 48};
  }
  return {top: 42, right: 48};
};

export const LogoCallout: React.FC<{item: LogoCalloutItem}> = ({item}) => {
  const frame = useCurrentFrame();
  const duration = item.durationFrames ?? DEFAULT_LOGO_CALLOUT_DURATION_FRAMES;
  const enter = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [duration - 14, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [0, 10], [0.94, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      aria-label={`${item.name} logo callout`}
      style={{
        position: 'absolute',
        ...positionStyle(item.position),
        width: 310,
        height: 310,
        opacity: Math.min(1, enter * 1.25) * exit,
        transform: `scale(${scale})`,
        transformOrigin: item.position === 'topLeft' ? 'top left' : 'top right',
      }}
    >
      <Img
        src={staticFile(LOGO_FILES[item.slug])}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.16))',
        }}
      />
    </div>
  );
};

export const LogoCalloutOverlay: React.FC<{items: LogoCalloutItem[]}> = ({items}) => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    {items.map((item) => (
      <Sequence
        key={`${item.slug}-${item.startFrame}`}
        from={item.startFrame}
        durationInFrames={item.durationFrames ?? DEFAULT_LOGO_CALLOUT_DURATION_FRAMES}
      >
        <LogoCallout item={item} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

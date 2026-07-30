import React from 'react';
import {AbsoluteFill, Img, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * PilotCashAsis — proves the locked motion stack on one real scene.
 * Layers (back to front):
 *   1. bg.png            — still plate (house/yard, ambient elements blanked)
 *   2. pair.mp4          — Grok Video clip of the handshake pair, cropped back
 *                          into its exact source box (scene 295,270 400x390)
 *   3. ambient sprites   — Remotion-animated (clouds drift, sparkle twinkles,
 *                          cash bobs, birds float) — all integer sine cycles
 *                          over the comp length => perfect loop
 *   4. Andrea corner-circle (PLACEHOLDER static image until the HeyGen
 *                          Avatar IV test — same position/size as the real one)
 *
 * Geometry: pair canvas was 1280x720 with the 400x390 crop at (440,165).
 * Grok returned 1344x768 => scale by 1280/1344, then window it.
 */

const TWO_PI = Math.PI * 2;

export const PilotCashAsis: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const t = frame / durationInFrames; // 0..1, loop-safe with integer cycles

  // ambient motions — integer sine cycles for a seamless loop
  const cloud1X = 6 * Math.sin(TWO_PI * t);
  const cloud2X = -8 * Math.sin(TWO_PI * t + Math.PI / 3);
  const sparkleS = 1 + 0.08 * Math.sin(TWO_PI * 2 * t);
  const sparkleO = 0.9 + 0.1 * Math.sin(TWO_PI * 2 * t + Math.PI / 2);
  const cashY = 6 * Math.sin(TWO_PI * 2 * t);
  const cashR = 2 * Math.sin(TWO_PI * t);
  const birdsY = 4 * Math.sin(TWO_PI * t);
  const andreaY = 5 * Math.sin(TWO_PI * t + Math.PI / 4);

  // pair video window: scene box (295,270) 400x390; inside the (scaled) video
  // that content sits at (440,165)
  const VIDEO_W = 1280; // after scaling 1344 -> 1280
  const VIDEO_H = 720;

  return (
    <AbsoluteFill style={{backgroundColor: '#62b3f3'}}>
      {/* 1 — still background plate */}
      <Img src={staticFile('pilot/bg.png')} style={{position: 'absolute', width: 1600, height: 900}} />

      {/* 2 — Grok pair clip, windowed back into its source box */}
      <div
        style={{
          position: 'absolute',
          left: 295,
          top: 270,
          width: 400,
          height: 390,
          overflow: 'hidden',
        }}
      >
        {/* Grok clip is ~5.04s; loop it so it covers Andrea's full line */}
        <Loop durationInFrames={151}>
          <OffthreadVideo
            src={staticFile('pilot/pair.mp4')}
            muted
            style={{
              position: 'absolute',
              left: -440,
              top: -165,
              width: VIDEO_W,
              height: VIDEO_H,
            }}
          />
        </Loop>
      </div>

      {/* 3 — ambient sprites (Remotion-animated, perfect loops) */}
      <Img
        src={staticFile('pilot/cloud1_t.png')}
        style={{position: 'absolute', left: 125, top: 30, width: 140, transform: `translateX(${cloud1X}px)`}}
      />
      <Img
        src={staticFile('pilot/cloud2_t.png')}
        style={{position: 'absolute', left: 475, top: 50, width: 180, transform: `translateX(${cloud2X}px)`}}
      />
      <Img
        src={staticFile('pilot/sparkle_t.png')}
        style={{
          position: 'absolute',
          left: 670,
          top: 140,
          width: 160,
          opacity: sparkleO,
          transform: `scale(${sparkleS})`,
        }}
      />
      <Img
        src={staticFile('pilot/cash_t.png')}
        style={{
          position: 'absolute',
          left: 670,
          top: 295,
          width: 215,
          transform: `translateY(${cashY}px) rotate(${cashR}deg)`,
        }}
      />
      <Img
        src={staticFile('pilot/birds_t.png')}
        style={{position: 'absolute', left: 20, top: 60, width: 120, transform: `translateY(${birdsY}px)`}}
      />

      {/* 4 — Andrea corner-circle: REAL HeyGen Avatar IV clip (talking, Hope voice),
          face-cropped from the full-body 1280x720 video — one clip serves all modes */}
      <div
        style={{
          position: 'absolute',
          left: 1140,
          top: 420,
          width: 360,
          height: 360,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '10px solid #ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          transform: `translateY(${andreaY}px)`,
          backgroundColor: '#62b3f3',
        }}
      >
        <OffthreadVideo
          src={staticFile('pilot/andrea_hg.mp4')}
          style={{position: 'absolute', width: 1213, height: 682, left: -530, top: -9}}
        />
      </div>
    </AbsoluteFill>
  );
};

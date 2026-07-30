import React from 'react';
import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {loadFont as loadMarker} from '@remotion/google-fonts/PermanentMarker';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';

/**
 * Sticker — the on-screen text system (see scene-card-v2.md "Text style").
 * Text is ALWAYS rendered here, never baked into AI images (generated text garbles).
 * Look = the sticker system itself: flat fill, thick black border, rounded corners,
 * spring pop-in with a tiny rotation. Colors locked to the brand palette.
 *
 * Roles:
 *  - label  : 1–4 word callout (key vocab) — yellow or cream pill
 *  - title  : big lockup for lesson/title beats
 *  - caption: longer line, bottom-center strip (never over Andrea's corner)
 */

const marker = loadMarker();
const baloo = loadBaloo();

export type StickerFont = 'marker' | 'baloo';
export type StickerRole = 'label' | 'title' | 'caption';

const PALETTE = {
  yellow: '#FFD23F',
  cream: '#FFF7DE',
  white: '#FFFFFF',
  ink: '#111111',
};

const SIZES: Record<StickerRole, {fontSize: number; pad: string; radius: number; border: number}> = {
  title: {fontSize: 84, pad: '18px 44px', radius: 26, border: 7},
  label: {fontSize: 48, pad: '10px 26px', radius: 18, border: 5},
  caption: {fontSize: 34, pad: '8px 22px', radius: 14, border: 4},
};

export const Sticker: React.FC<{
  text: string;
  role?: StickerRole;
  font?: StickerFont; // default baloo (V1 locked)
  bg?: keyof typeof PALETTE;
  delay?: number; // frames before pop-in
  top?: number;
  left?: number;
  bottomCenter?: boolean; // caption strip placement
  topCenter?: boolean; // top-center placement (mirror of bottomCenter)
  until?: number; // frame when the sticker finishes exiting
  rotate?: number; // resting tilt, degrees
}> = ({text, role = 'label', font = 'baloo', bg = 'yellow', delay = 0, top, left, bottomCenter, topCenter, until, rotate = -2}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 20});
  const exit =
    until === undefined || frame <= until - 8
      ? 1
      : frame >= until
        ? 0
        : Math.max(0, Math.min(1, (until - frame) / 8));
  const sz = SIZES[role];
  const family = font === 'marker' ? marker.fontFamily : baloo.fontFamily;
  return (
    <div
      style={{
        // LOCKED style V1 (Jarrad 2026-07-03): plain white card, no outline, soft shadow
        position: 'absolute',
        ...(bottomCenter ? {bottom: 60, left: '50%'} : topCenter ? {top: top ?? 64, left: '50%'} : {top, left}),
        transform: `${bottomCenter || topCenter ? 'translateX(-50%) ' : ''}scale(${s * (0.94 + 0.06 * exit)})`,
        opacity: Math.min(1, s * 1.4) * exit,
        fontFamily: family,
        fontWeight: font === 'baloo' ? 700 : 400,
        fontSize: sz.fontSize,
        color: PALETTE.ink,
        background: PALETTE.white,
        padding: sz.pad,
        borderRadius: sz.radius,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
      }}
    >
      {text}
    </div>
  );
};

/** Showcase comp — white-background text treatments (v2, per Jarrad: "not comic — white background"). */
export const TextStyles: React.FC = () => {
  const card = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    background: '#FFFFFF',
    color: '#111111',
    fontFamily: baloo.fontFamily,
    fontWeight: 700,
    ...extra,
  });
  return (
    <div style={{position: 'absolute', width: 1600, height: 900, backgroundColor: '#62b3f3'}}>
      {/* V1 — clean white card, NO border, soft shadow */}
      <div style={card({top: 60, left: 60, fontSize: 72, padding: '20px 48px', borderRadius: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.10)'})}>
        The Ideal Prospect
      </div>
      <div style={card({top: 200, left: 60, fontSize: 40, padding: '12px 28px', borderRadius: 14, boxShadow: '0 6px 18px rgba(0,0,0,0.10)', fontWeight: 600})}>
        V1 — plain white card, no outline
      </div>

      {/* V2 — white card, hairline ink border */}
      <div style={card({top: 330, left: 60, fontSize: 72, padding: '20px 48px', borderRadius: 20, border: '3px solid #111'})}>
        The Ideal Prospect
      </div>
      <div style={card({top: 470, left: 60, fontSize: 40, padding: '12px 28px', borderRadius: 14, border: '3px solid #111', fontWeight: 600})}>
        V2 — thin outline
      </div>

      {/* V3 — full-width white band (lower third) */}
      <div style={{position: 'absolute', bottom: 120, left: 0, width: 1600, background: '#FFFFFF', padding: '26px 0', textAlign: 'center', fontFamily: baloo.fontFamily, fontWeight: 700, fontSize: 56, color: '#111', boxShadow: '0 -6px 24px rgba(0,0,0,0.08)'}}>
        V3 — full-width white band: You are here to consult, not to sell.
      </div>
    </div>
  );
};

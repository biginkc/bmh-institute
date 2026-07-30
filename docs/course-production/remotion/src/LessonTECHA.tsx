import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import {getInputProps} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {Sticker} from './Sticker';
import manifest from '../public/lessonTECHA/manifest.json';

// cleanPlates: tail-extraction mode (`remotion still --props '{"cleanPlates":true}'`) —
// renders the scene layer only (no labels/logos/circle) so hold PNGs carry no baked
// overlays that would ghost under the live ones during long holds. Same renderer decode
// path as the final render, so the anim->tail color match holds (PLAYBOOK 7.11 class).
const CLEAN_PLATES = Boolean((getInputProps() as {cleanPlates?: boolean}).cleanPlates);

/**
 * Lesson TECH-A "Tech Stack" — audio = master clock (master.m4a with 1.0s gaps).
 * Rules of record: 1e no code scene visuals (this file only places images, runs transitions,
 * pops word-timed labels); 3b one bottom-center label at a time (queue); 3c clean opener;
 * slides ONLY for location moves, cuts between diagrams; fades only at the b01/b17 bookends
 * (opener fade-in, close fade-out — b01→b02 is a straight cut per the scenecards).
 * Anim beats (full-frame opaque Seedance) hold their clip's OWN last frame (PLAYBOOK 7.7/11.7).
 * LOGO CUTAWAYS (Jarrad 2026-07-10): straight cut to a full-frame doodle logo card on the
 * tool's first mention (manifest logoFrame), hold ~8s (logoUntil), straight cut back.
 */

const BLUE = '#62b3f3';

type Label = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  anim?: string;
  animFrames?: number;
  loop?: boolean;
  hero?: string;
  circle?: string;
  logo?: string;
  logoAnim?: string;
  logoFrame?: number;
  logoUntil?: number;
  labels?: Label[];
  badge?: boolean;
  closeFade?: boolean;
  voFrames: number;
  durationInFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- one-at-a-time bottom-center label queue (rule 3b) ----------
const LabelQueue: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const labels = beat.labels ?? [];
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((l, i) => {
        const until = i < labels.length - 1 ? labels[i + 1].delay - 4 : dur - 6;
        if (until <= l.delay) return null;
        return <Sticker key={`${beat.tag}-${i}`} text={l.text} role="label" bg="white" delay={l.delay} until={until} bottomCenter />;
      })}
    </>
  );
};

// ---------- Andrea corner circle — crop measured for the 1A solo standing avatar ----------
// native 1280x720 alpha clip: body x[542,740], head y[40,175], head cx 637 (measured from
// the keyed frame). 1.4x (1792x1008) at left -722 / top 0 = head+shoulders portrait.
const CIRCLE = 340;
const AndreaCircle: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const bob = 5 * Math.sin((2 * Math.PI * frame) / 150);
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
        muted
        transparent
        src={staticFile(src)}
        style={{position: 'absolute', width: 1792, height: 1008, left: -722, top: 0}}
      />
    </div>
  );
};

// ---------- full-frame doodle logo card: opens the beat (frame 0), holds ~8s, cuts to scene.
// logoAnim (e.g. the Sandra starfield card) plays as video during the hold; static cards use Img.
const LogoCutaway: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  if (!beat.logo || beat.logoFrame === undefined || beat.logoUntil === undefined) return null;
  if (frame < beat.logoFrame || frame >= beat.logoUntil) return null;
  if (beat.logoAnim) {
    return (
      <Sequence from={beat.logoFrame} durationInFrames={beat.logoUntil - beat.logoFrame}>
        <OffthreadVideo muted src={staticFile(beat.logoAnim)} style={{position: 'absolute', width: 1600, height: 900}} />
      </Sequence>
    );
  }
  return <Img src={staticFile(beat.logo)} style={{position: 'absolute', width: 1600, height: 900}} />;
};

// ---------- scene: still (gentle push) or full-frame anim clip.
// PERMANENT RULE (Jarrad 2026-07-10): no freeze-into-zoom holds. Clamped clips (loop:true,
// start frame = end frame) LOOP seamlessly for the whole beat; unclamped clips hold their own
// exact last frame via <Freeze> on the SAME video (same decode path — no color-shift seam).
const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const animEnd = beat.anim ? Math.min(beat.animFrames ?? 0, dur) : 0;
  const push = interpolate(frame, [0, dur], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.anim ? (
        beat.loop === false ? (
          <>
            <Sequence from={0} durationInFrames={animEnd}>
              <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
            </Sequence>
            <Sequence from={animEnd}>
              <Freeze frame={animEnd - 1}>
                <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
              </Freeze>
            </Sequence>
          </>
        ) : (
          <Loop durationInFrames={animEnd}>
            <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
          </Loop>
        )
      ) : beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {!CLEAN_PLATES && beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      {!CLEAN_PLATES ? <LogoCutaway beat={beat} /> : null}
      {/* labels hide while a logo card is up — a bottom-center sticker collides with the
          card's baked wordmark (caught on b16 v2). Timing elsewhere stays word-exact. */}
      {!CLEAN_PLATES &&
      !(beat.logo && beat.logoFrame !== undefined && frame >= beat.logoFrame && frame < (beat.logoUntil ?? 0)) ? (
        <LabelQueue beat={beat} dur={dur} />
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- hero: full-frame standing-Andrea clip; bookend fades live here ----------
const HeroBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const openFade = beat.badge ? interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  // tightened close (Jarrad 2026-07-10): fade begins ~1s after the final label pops so the
  // hero never sits frozen on screen; label fades out with the frame.
  const closeFade = beat.closeFade
    ? interpolate(frame, [dur - 30, dur - 4], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <AbsoluteFill style={{opacity: openFade * closeFade}}>
        {beat.hero ? (
          <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
        ) : null}
        {/* clean opener (3c): b01 carries no labels — enforced by manifest having none for b01 */}
        <LabelQueue beat={beat} dur={dur} />
        {beat.badge ? <BmhBadge /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- transitions: explicit per-boundary map from the approved scenecards ----------
// slide = location move between tool stations; cut = same station / diagram change.
const T = 12;
const DIRS = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
const BOUNDARY: Record<string, 'slide' | 'cut'> = {
  b01_open: 'cut',        // opener -> overview diagram (scenecard: straight cut)
  b02_why: 'slide',       // overview map -> Sandra station (location)
  b03_sandra: 'cut',      // same Sandra station, tighter view
  b04_sandra_wf: 'slide', // merged b04+b05 (v4) -> PropStream data station (location)
  b06_propstream: 'slide',// -> DealMachine neighborhood (location)
  b07_dealmachine: 'slide', // -> Deal Sniper offer station (location)
  b08_dealsniper: 'slide',  // -> DialPad call station (location)
  b09_dialpad: 'cut',     // same DialPad station, coaching review
  b10_coaching: 'slide',  // -> Closer Lab training booth (location)
  b11_closerlab: 'slide', // -> Sandra task station (location)
  b12_tasks: 'slide',     // -> HubStaff timekeeping (location)
  b13_hubstaff: 'slide',  // -> Slack team comms (location)
  b14_slack: 'slide',     // -> BMH Institute training path (location)
  b15_institute: 'slide', // -> Google Drive docs station (location)
  b16_drive: 'slide',     // -> office recap bookend (location)
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const LessonTECHA: React.FC = () => {
  const beats = manifest.beats as Beat[];
  let slideCount = 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const kind = i < beats.length - 1 ? BOUNDARY[b.tag] ?? 'slide' : null;
          const trans =
            kind === 'slide'
              ? {presentation: slide({direction: DIRS[slideCount++ % DIRS.length]}), frames: T}
              : null;
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

export const LESSON_TECHA_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

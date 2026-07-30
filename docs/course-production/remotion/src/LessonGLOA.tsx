import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {Sticker} from './Sticker';
import manifest from '../public/lessonGLOA/manifest.json';

/**
 * Lesson GLO-A "Terms Glossary A" — audio = master clock (master.m4a with 1.0s gaps).
 * Rules of record: 1e no code scene visuals (this file only places images, runs transitions,
 * pops word-timed labels); 3b one bottom-center label at a time (queue); 3c clean opener;
 * slides ONLY for location moves, cuts between diagrams; fades only at the b01/b21 bookends.
 * Anim beats (full-frame opaque Seedance) hold their clip's OWN last frame (PLAYBOOK 7.7/11.7).
 */

const BLUE = '#62b3f3';

type Label = {text: string; delay: number};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  anim?: string;
  animFrames?: number;
  tail?: string;
  hero?: string;
  circle?: string;
  labels?: Label[];
  swapFrame?: number;
  badge?: boolean;
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

// ---------- scene: still (gentle push) or full-frame anim clip -> own-last-frame tail ----------
const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const animEnd = beat.anim ? Math.min(beat.animFrames ?? 0, dur) : 0;
  const push = interpolate(frame, [animEnd, dur], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.anim ? (
        <>
          {/* own-last-frame tail — shown ONLY after the clip ends (no double-character risk) */}
          {frame >= animEnd && beat.tail ? (
            <Img src={staticFile(beat.tail)} style={{position: 'absolute', width: 1600, height: 900}} />
          ) : null}
          <Sequence from={0} durationInFrames={animEnd}>
            <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
          </Sequence>
        </>
      ) : beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}
      <LabelQueue beat={beat} dur={dur} />
    </AbsoluteFill>
  );
};

// ---------- hero: full-frame standing-Andrea clip ----------
const HeroBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    {/* clean opener (3c): b01 carries no labels — enforced by manifest having none for b01 */}
    <LabelQueue beat={beat} dur={dur} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// ---------- swap: Andrea hero take, straight cut to the diagram still on the trigger word ----------
const SwapBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const cut = Math.min(beat.swapFrame ?? Math.round(dur * 0.3), dur - 30);
  const push = interpolate(frame, [cut, dur], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {frame < cut && beat.hero ? (
        <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
      ) : beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${push})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <LabelQueue beat={beat} dur={dur} />
    </AbsoluteFill>
  );
};

// ---------- transitions: explicit per-boundary map from the approved scenecards ----------
// slide = location move; cut = diagram/graphic change; fade = b01/b21 bookends only.
const T = 12;
const DIRS = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
const BOUNDARY: Record<string, 'fade' | 'slide' | 'cut'> = {
  b01_open: 'fade',          // out of the opener bookend
  b02_library: 'slide',      // library -> distressed split (location)
  b03_distressed: 'slide',   // -> roadside (location)
  b04_car: 'slide',          // -> Andrea hero (location reset)
  b05_why: 'slide',          // -> as-is interior (location)
  b06_asis: 'slide',         // -> split call (location)
  b07_asis_call: 'slide',    // -> beautiful house (location)
  b08_offmarket: 'cut',      // house -> bullseye graphic
  b09_sweetspot: 'cut',      // bullseye -> Zillow card (diagram to diagram)
  b10_mls: 'slide',          // card -> listed house scene (location)
  b11_onmarket: 'cut',       // both in listing-status space
  b12_listed_expired: 'cut', // panels -> calendar diagram
  b13_dom: 'slide',          // calendar -> front-yard FSBO (location)
  b14_fsbo: 'slide',         // -> garage sale (location)
  b15_garage_sale: 'slide',  // -> deal-flow scene (location)
  b16_wholesale_re: 'cut',   // flow -> assignment diagram
  b17_assignment: 'cut',     // -> double-close diagram
  b18_double_close: 'slide', // -> subject-to scene (location)
  b19_subject_to: 'slide',   // -> kitchen table (location)
  b20_seller_fin: 'fade',    // into the b21 close bookend
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} dur={dur} />;
  if (b.mode === 'swap') return <SwapBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const LessonGLOA: React.FC = () => {
  const beats = manifest.beats as Beat[];
  let slideCount = 0;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const kind = i < beats.length - 1 ? BOUNDARY[b.tag] ?? 'slide' : null;
          const trans =
            kind === 'fade'
              ? {presentation: fade(), frames: 14}
              : kind === 'slide'
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

export const LESSON_GLOA_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

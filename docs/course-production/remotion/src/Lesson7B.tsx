import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming, TransitionPresentation} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Sticker} from './Sticker';
import manifest from '../public/lesson7B/manifest.json';

const BLUE = '#62b3f3';
type Beat = {tag: string; mode: string; hero?: string; clip?: string; still?: string; label?: string; lineEnd?: number; drill?: number; badge?: boolean; durationInFrames: number;};

const BmhBadge: React.FC = () => (
  <Img src={staticFile('lessonA/bmh-endcard.png')} style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}} />
);

// SHOT B (and bookends): cafe-Andrea full-frame, audio from master track.
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// SHOT A: seller (already recomposited onto canonical blue) speaks, then holds. "YOUR TURN" pops in
// once the line ends and stays through the silent hold — the learner's window to answer out loud.
// Sticker `until` is clipped to this beat's real content (before the outgoing transition's pad zone),
// so it always fully exits before the next beat's label can appear (PLAYBOOK §16.1: one label at a time).
const SellerBeat: React.FC<{beat: Beat; padIn: number}> = ({beat, padIn}) => {
  const turnStart = beat.lineEnd != null ? Math.max(beat.lineEnd + 12, padIn) : null;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.clip ? <OffthreadVideo muted src={staticFile(beat.clip)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      {turnStart != null ? (
        <Sequence from={turnStart}>
          <Sticker text="YOUR TURN" role="label" bg="yellow" delay={0} bottomCenter until={beat.durationInFrames - turnStart} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

// Theme divider still with a gentle card pop. Label waits for the incoming transition to fully settle
// (delay >= padIn) and exits before the outgoing transition starts (until = durationInFrames) — same
// one-label-at-a-time guarantee as SellerBeat (PLAYBOOK §16.1).
const ThemeBeat: React.FC<{beat: Beat; padIn: number}> = ({beat, padIn}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 14, stiffness: 150}, durationInFrames: 18});
  const k = 0.94 + 0.06 * Math.max(0, Math.min(1, s));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${k})`, transformOrigin: 'center center'}} /> : null}
      {beat.label ? <Sticker text={beat.label} role="title" bg="white" delay={padIn + 2} bottomCenter until={beat.durationInFrames} /> : null}
    </AbsoluteFill>
  );
};

const beatContent = (b: Beat, padIn: number) => {
  if (b.mode === 'seller') return <SellerBeat beat={b} padIn={padIn} />;
  if (b.mode === 'theme') return <ThemeBeat beat={b} padIn={padIn} />;
  return <HeroBeat beat={b} />;
};

// The 1A camera-travel SLIDE is reserved EXCLUSIVELY for cuts where the camera genuinely appears to
// move to a different location (Jarrad, 2026-07-08 — see PLAYBOOK §16.2 + the matching Lesson 6B rule).
// Every beat pair in 7B is a subject/reaction cut between disconnected shot types (hero-video cafe /
// seller-on-blue / a static theme card) — none of them share a location a camera could travel across —
// so NO pair here qualifies for slide. Fade stays reserved for the true open/close bookends; every other
// cut is a straight hard cut (no transition, zero pad — `pickTransition` returns null).
type Transition = {presentation: TransitionPresentation<any>; frames: number} | null;
const pickTransition = (prev: Beat, next: Beat): Transition => {
  if (prev.tag === 'intro' || next.tag === 'outro') return {presentation: fade(), frames: 14};
  return null;
};

export const Lesson7B: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {/* Master audio drives the clock; every clip is muted. */}
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1]) : null;
          const padOut = trans ? trans.frames : 0;
          const padIn = i > 0 ? (pickTransition(beats[i - 1], b)?.frames ?? 0) : 0;
          const seq = (
            <TransitionSeries.Sequence key={b.tag} durationInFrames={b.durationInFrames + padOut}>
              {beatContent(b, padIn)}
            </TransitionSeries.Sequence>
          );
          return trans ? [seq, <TransitionSeries.Transition key={`${b.tag}-t`} presentation={trans.presentation} timing={linearTiming({durationInFrames: trans.frames})} />] : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const LESSON_7B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

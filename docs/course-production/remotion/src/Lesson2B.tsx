import React from 'react';
import {AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {Sticker} from './Sticker';
import manifest from '../public/lesson2B/manifest.json';
const BLUE = '#62b3f3';
type Beat = {tag: string; mode: string; still?: string; scene?: string; hasTag?: boolean; clip?: string; tagClip?: string; tagClipFrames?: number; tagHold?: string; hero?: string; grid?: string[]; lineStart?: number; lineEnd?: number; label?: string; labelDelay?: number; badge?: boolean; durationInFrames: number;};
const BmhBadge: React.FC = () => (<Img src={staticFile('lessonA/bmh-endcard.png')} style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}} />);
const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
    {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 10} bottomCenter /> : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);
const SellerBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const ls = beat.lineStart ?? 0;
  const le = beat.lineEnd ?? dur;
  const push = interpolate(frame, [0, dur], [1.0, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Setup + seller line show the situational SCENE (push-in); the Andrea "tag" shows the clean portrait —
  // UNLESS this beat has a tagClip (Carol), in which case the tag plays an animated alpha clip over blue.
  // Ray (hasTag=false) has no tag segment, so keep the scene through his trailing gap.
  const showScene = frame < le || !beat.hasTag;
  const clipFrames = beat.tagClipFrames ?? 0;
  // Tag: the argument clip plays and LOOPS to fill the tag window (17s > Seedance's 15s). The Seedance
  // same-frame clamp ends the clip on its exact start pose, so the loop point is seamless (Jarrad 2026-07-05).
  const baseSrc = showScene ? (beat.scene ?? beat.still) : (beat.tagClip ? null : (beat.still ?? beat.scene));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {baseSrc ? (<Img src={staticFile(baseSrc)} style={{position: 'absolute', width: 1600, height: 900, transform: showScene ? `scale(${push})` : 'none', transformOrigin: 'center center'}} />) : null}
      {beat.clip ? (<Sequence from={ls} durationInFrames={Math.max(1, le - ls)}><OffthreadVideo muted src={staticFile(beat.clip)} style={{position: 'absolute', width: 1600, height: 900}} /></Sequence>) : null}
      {beat.tagClip ? (<Sequence from={le} durationInFrames={Math.max(1, dur - le)}><Loop durationInFrames={Math.max(1, clipFrames)}><OffthreadVideo muted transparent src={staticFile(beat.tagClip)} style={{position: 'absolute', width: 1600, height: 900}} /></Loop></Sequence>) : null}
      {beat.label ? <Sticker text={beat.label} role="caption" bg="white" delay={beat.labelDelay ?? 15} bottomCenter /> : null}
    </AbsoluteFill>
  );
};
const GridBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = beat.grid ?? [];
  const tw = 288; const th = Math.round((tw * 9) / 16); const gap = 22;
  const totalW = items.length * tw + (items.length - 1) * gap;
  const x0 = (1600 - totalW) / 2; const y = 310;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {items.map((src, i) => {
        const s = spring({frame: frame - (10 + i * 8), fps, config: {damping: 13, stiffness: 150}, durationInFrames: 18});
        const k = Math.max(0, Math.min(1, s));
        return (<div key={src} style={{position: 'absolute', left: x0 + i * (tw + gap), top: y, width: tw, height: th, borderRadius: 16, overflow: 'hidden', border: '5px solid #111', transform: `scale(${0.8 + 0.2 * k})`, opacity: Math.min(1, s * 1.5)}}><Img src={staticFile(src)} style={{position: 'absolute', width: tw, height: th}} /></div>);
      })}
      {beat.label ? <Sticker text={beat.label} role="label" bg="white" delay={beat.labelDelay ?? 15} bottomCenter /> : null}
    </AbsoluteFill>
  );
};
const T = 12;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: 14};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(3)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};
const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'grid') return <GridBeat beat={b} />;
  if (b.mode === 'seller') return <SellerBeat beat={b} dur={dur} />;
  return <HeroBeat beat={b} />;
};
export const Lesson2B: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1]) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (<TransitionSeries.Sequence key={b.tag} durationInFrames={b.durationInFrames + pad}>{beatContent(b, b.durationInFrames + pad)}</TransitionSeries.Sequence>);
          return trans ? [seq, <TransitionSeries.Transition key={`${b.tag}-t`} presentation={trans.presentation} timing={linearTiming({durationInFrames: trans.frames})} />] : [seq];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
export const LESSON_2B_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

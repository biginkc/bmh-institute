import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import {Sticker} from './Sticker';
import manifest from '../public/lesson10A/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const INK = '#111111';
const WHITE = '#ffffff';
const YELLOW = '#FFD23F';

type Stick = {
  text: string;
  delay: number;
  role?: 'label' | 'title' | 'caption';
  top?: number;
  left?: number;
  topCenter?: boolean;
  bottomCenter?: boolean;
};

type CalendarMark = {
  text: string;
  delay: number;
  day: number;
};

type MessageMark = {
  text: string;
  delay: number;
  slot: number;
};

type Beat = {
  tag: string;
  mode: 'hero' | 'scene' | 'calendar' | 'messages';
  still?: string;
  hero?: string;
  heroAlpha?: boolean;
  video?: string;
  videoFrames?: number;
  tailFrame?: string;
  stickers?: Stick[];
  calendarMarks?: CalendarMark[];
  messageMarks?: MessageMark[];
  stopSignText?: boolean;
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
  animationStatus: string;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const isSpatialSticker = (s: Stick) => typeof s.top === 'number' && typeof s.left === 'number';

const Stickers: React.FC<{items?: Stick[]}> = ({items}) => {
  const list = items ?? [];
  return (
    <>
      {list.map((s, i) => {
        const nextGeneralDelay = !isSpatialSticker(s)
          ? list
              .filter((candidate) => !isSpatialSticker(candidate) && candidate.delay > s.delay)
              .map((candidate) => candidate.delay)
              .sort((a, b) => a - b)[0]
          : undefined;
        return (
          <Sticker
            key={`${s.text}-${i}`}
            text={s.text}
            role={s.role ?? 'label'}
            bg="white"
            delay={s.delay}
            until={nextGeneralDelay ? Math.max(s.delay + 12, nextGeneralDelay - 6) : undefined}
            top={s.top}
            left={s.left}
            topCenter={s.topCenter}
            bottomCenter={s.bottomCenter}
          />
        );
      })}
    </>
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo
        muted
        transparent={Boolean(beat.heroAlpha)}
        src={staticFile(beat.hero)}
        style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}}
      />
    ) : null}
    <Stickers items={beat.stickers} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const SceneMedia: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const clipLen = Math.min(beat.videoFrames ?? 0, dur);
  const hasVideo = Boolean(beat.video && clipLen > 0);
  return (
    <>
      {!hasVideo && beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} /> : null}
      {hasVideo && beat.video ? (
        <Sequence from={0} durationInFrames={clipLen}>
          <OffthreadVideo muted src={staticFile(beat.video)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
        </Sequence>
      ) : null}
      {hasVideo && beat.tailFrame && clipLen < dur ? (
        <Sequence from={clipLen} durationInFrames={dur - clipLen}>
          <Img src={staticFile(beat.tailFrame)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {hasVideo && !beat.tailFrame && beat.still && clipLen < dur ? (
        <Sequence from={clipLen} durationInFrames={dur - clipLen}>
          <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
    </>
  );
};

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <SceneMedia beat={beat} dur={dur} />
    {beat.stopSignText ? <StopSignText /> : null}
    <Stickers items={beat.stickers} />
  </AbsoluteFill>
);

const StopSignText: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: 320,
      transform: 'translateX(-50%)',
      fontFamily: baloo.fontFamily,
      fontWeight: 900,
      fontSize: 116,
      lineHeight: 1,
      letterSpacing: 0,
      color: WHITE,
    }}
  >
    STOP
  </div>
);

const CalendarOverlay: React.FC<{marks?: CalendarMark[]}> = ({marks = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const left = 213;
  const top = 181;
  const cellW = 1188 / 7;
  const cellH = 635 / 5;
  return (
    <>
      {marks.map((m) => {
        const i = m.day - 1;
        const col = i % 7;
        const row = Math.floor(i / 7);
        const x = left + col * cellW + cellW / 2;
        const y = top + row * cellH + cellH / 2;
        const s = spring({frame: frame - m.delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 18});
        return (
          <div key={m.text} style={{position: 'absolute', left: x - 62, top: y - 45, width: 124, opacity: Math.min(1, s * 1.4), transform: `scale(${s})`}}>
            <div
              style={{
                width: 54,
                height: 54,
                margin: '0 auto 4px',
                borderRadius: 18,
                background: YELLOW,
                border: `5px solid ${INK}`,
                color: INK,
                fontFamily: baloo.fontFamily,
                fontWeight: 900,
                fontSize: 36,
                lineHeight: '46px',
                textAlign: 'center',
              }}
            >
              ✓
            </div>
            <div
              style={{
                background: WHITE,
                borderRadius: 12,
                padding: '3px 7px',
                fontFamily: baloo.fontFamily,
                fontWeight: 800,
                fontSize: 23,
                color: INK,
                textAlign: 'center',
                boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
              }}
            >
              {m.text}
            </div>
          </div>
        );
      })}
    </>
  );
};

const CalendarBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <SceneMedia beat={beat} dur={dur} />
    <CalendarOverlay marks={beat.calendarMarks} />
  </AbsoluteFill>
);

const MESSAGE_POS = [
  {left: 622, top: 154, width: 354, height: 126},
  {left: 618, top: 325, width: 326, height: 118},
  {left: 642, top: 491, width: 342, height: 118},
  {left: 618, top: 654, width: 326, height: 116},
];

const MessageOverlay: React.FC<{marks?: MessageMark[]}> = ({marks = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <>
      {marks.map((m) => {
        const pos = MESSAGE_POS[m.slot] ?? MESSAGE_POS[0];
        const s = spring({frame: frame - m.delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 18});
        return (
          <div
            key={m.text}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
              padding: '0 20px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: Math.min(1, s * 1.4),
              transform: `scale(${s})`,
              transformOrigin: 'center center',
              fontFamily: baloo.fontFamily,
              fontWeight: 900,
              fontSize: m.text.length > 12 ? 28 : 32,
              color: INK,
              textAlign: 'center',
              lineHeight: 1.05,
            }}
          >
            {m.text}
          </div>
        );
      })}
    </>
  );
};

const MessagesBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <SceneMedia beat={beat} dur={dur} />
    <MessageOverlay marks={beat.messageMarks} />
  </AbsoluteFill>
);

const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: T};
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  if (b.mode === 'calendar') return <CalendarBeat beat={b} dur={dur} />;
  if (b.mode === 'messages') return <MessagesBeat beat={b} dur={dur} />;
  return <SceneBeat beat={b} dur={dur} />;
};

export const Lesson10A: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const trans = i < beats.length - 1 ? pickTransition(b, beats[i + 1]) : null;
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
                  key={`${b.tag}-transition`}
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

export const LESSON_10A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

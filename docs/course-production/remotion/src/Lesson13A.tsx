import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import {Sticker, StickerRole} from './Sticker';
import manifest from '../public/lesson13A/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const ORANGE = '#f28b22';
const INK = '#111111';
const WHITE = '#ffffff';

type Label = {text: string; delay: number; place: string; role?: StickerRole};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  heroTransparent?: boolean;
  anim?: string;
  tail?: string;
  animFrames?: number;
  labels: Label[];
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
};

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95, zIndex: 40}}
  />
);

const pop = (frame: number, fps: number, delay: number) =>
  Math.max(0, Math.min(1, spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18})));

const stickerPlace = (place: string): Partial<React.ComponentProps<typeof Sticker>> => {
  const p: Record<string, Partial<React.ComponentProps<typeof Sticker>>> = {
    top: {topCenter: true, top: 54},
    bottom: {bottomCenter: true},
    bottom2: {topCenter: true, top: 720},
    left: {top: 250, left: 70},
    right: {top: 250, left: 1035},
    leftLow: {top: 610, left: 70},
    card1: {top: 360, left: 135},
    card2: {top: 360, left: 575},
    card3: {top: 360, left: 1030},
    tier1: {top: 208, left: 145},
    tier2: {top: 360, left: 145},
    tier3: {top: 512, left: 145},
    input1: {top: 245, left: 150},
    input2: {top: 365, left: 150},
    math1: {top: 330, left: 820},
  };
  return p[place] ?? p.bottom;
};

const Labels: React.FC<{labels?: Label[]}> = ({labels = []}) => (
  <>
    {labels.map((label, i) => (
      <Sticker
        key={`${label.text}-${i}`}
        text={label.text}
        role={label.role ?? 'label'}
        bg="white"
        delay={label.delay}
        {...stickerPlace(label.place)}
      />
    ))}
  </>
);

const Text: React.FC<{
  children: React.ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  center?: boolean;
  style?: React.CSSProperties;
}> = ({children, size = 36, weight = 800, color = INK, center = false, style}) => (
  <div
    style={{
      fontFamily: baloo.fontFamily,
      fontWeight: weight,
      fontSize: size,
      color,
      lineHeight: 1.05,
      letterSpacing: 0,
      textAlign: center ? 'center' : 'left',
      ...style,
    }}
  >
    {children}
  </div>
);

const Panel: React.FC<React.PropsWithChildren<{style?: React.CSSProperties}>> = ({children, style}) => (
  <div
    style={{
      background: WHITE,
      borderRadius: 18,
      boxShadow: '0 10px 30px rgba(0,0,0,0.11)',
      ...style,
    }}
  >
    {children}
  </div>
);

const SmallCard: React.FC<{text: string; x: number; y: number; w?: number; h?: number; bg?: string}> = ({text, x, y, w = 320, h = 120, bg = WHITE}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 18,
      border: `6px solid ${INK}`,
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 20px',
      boxSizing: 'border-box',
    }}
  >
    <Text size={34} center>
      {text}
    </Text>
  </div>
);

const HeroMoneyLine: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const k = pop(frame, fps, 120);
  return (
    <>
      <div style={{position: 'absolute', left: 138, bottom: 130, width: 500, height: 92, zIndex: 4}}>
        <SmallCard text="DAILY WORK" x={0} y={0} w={220} h={92} bg={CREAM} />
        <div style={{position: 'absolute', left: 235, top: 40, width: 170 * k, height: 10, background: INK, borderRadius: 8}} />
        <div style={{position: 'absolute', left: 382 + 170 * k, top: 21, width: 0, height: 0, borderTop: '24px solid transparent', borderBottom: '24px solid transparent', borderLeft: `38px solid ${INK}`, opacity: k}} />
        <SmallCard text="PAYCHECK" x={430} y={0} w={220} h={92} bg={YELLOW} />
      </div>
      <Labels labels={beat.labels} />
    </>
  );
};

const HeroAttribution: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const points = ['WORKED', 'HANDOFF', 'SIGNED', 'CLOSED'];
  return (
    <>
      <Panel style={{position: 'absolute', left: 120, right: 120, bottom: 108, height: 150, zIndex: 5}}>
        <div style={{position: 'absolute', left: 105, right: 105, top: 72, height: 10, background: CREAM, border: `4px solid ${INK}`, borderRadius: 10}} />
        {points.map((p, i) => {
          const a = pop(frame, fps, 30 + i * 18);
          return (
            <div
              key={p}
              style={{
                position: 'absolute',
                left: 95 + i * 315,
                top: 32,
                width: 180,
                height: 84,
                borderRadius: 18,
                background: i === points.length - 1 ? YELLOW : WHITE,
                border: `5px solid ${INK}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${a})`,
                opacity: a,
              }}
            >
              <Text size={28} center>
                {p}
              </Text>
            </div>
          );
        })}
      </Panel>
      <Labels labels={beat.labels} />
    </>
  );
};

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} /> : null}
    {beat.tag === 'b01_money_connection' ? <HeroMoneyLine beat={beat} /> : <Labels labels={beat.labels} />}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const AttributionHeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo
        muted
        transparent={beat.heroTransparent}
        src={staticFile(beat.hero)}
        style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}}
      />
    ) : null}
    <div style={{position: 'absolute', left: 497, top: 0, width: 8, height: 900, background: BLUE}} />
    <div style={{position: 'absolute', left: 1096, top: 0, width: 8, height: 900, background: BLUE}} />
    <HeroAttribution beat={beat} />
  </AbsoluteFill>
);

const PiecesBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pieces = [
    ['BASE PAY', 'Ramp income', 130, CREAM],
    ['COMMISSIONS', 'Closed deals', 570, YELLOW],
    ['BONUSES', 'Kept appointments', 1010, CREAM],
  ] as const;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 120, top: 150, width: 1360, height: 610, padding: 44, boxSizing: 'border-box'}}>
        <Text size={64} center>
          COMPENSATION ENGINE
        </Text>
        {pieces.map(([title, sub, x, bg], i) => {
          const a = pop(frame, fps, 40 + i * 28);
          return (
            <div
              key={title}
              style={{
                position: 'absolute',
                left: x,
                top: 250,
                width: 330,
                height: 250,
                borderRadius: 22,
                border: `7px solid ${INK}`,
                background: bg,
                transform: `translateY(${(1 - a) * 34}px) scale(${0.85 + a * 0.15})`,
                opacity: a,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text size={40} center>
                {title}
              </Text>
              <Text size={28} center style={{marginTop: 18}}>
                {sub}
              </Text>
            </div>
          );
        })}
      </Panel>
      <Labels labels={beat.labels.filter((l) => l.place === 'top')} />
    </AbsoluteFill>
  );
};

const RampBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / 185);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <SmallCard text="BASE PAY" x={115} y={365} w={300} h={130} bg={CREAM} />
      <SmallCard text="FULL COMMISSION" x={1185} y={365} w={300} h={130} bg={YELLOW} />
      <div style={{position: 'absolute', left: 440, top: 420, width: 710, height: 18, background: CREAM, border: `5px solid ${INK}`, borderRadius: 20}} />
      <div style={{position: 'absolute', left: 445, top: 425, width: 700 * progress, height: 8, background: ORANGE, borderRadius: 12}} />
      {Array.from({length: 30}).map((_, i) => (
        <div key={i} style={{position: 'absolute', left: 457 + i * 23, top: 475, width: 11, height: 42, borderRadius: 8, background: i / 29 < progress ? YELLOW : WHITE, border: `3px solid ${INK}`}} />
      ))}
      <Text size={44} center style={{position: 'absolute', left: 540, top: 270, width: 510}}>
        30-DAY KPI STREAK
      </Text>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const SceneVideoBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const tailStart = beat.animFrames ?? 0;
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.025], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const showTail = !beat.anim || frame >= tailStart;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {showTail && (beat.tail || beat.still) ? (
        <Img
          src={staticFile(beat.tail ?? beat.still ?? '')}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {beat.anim ? (
        <Sequence from={0} durationInFrames={tailStart}>
          <OffthreadVideo muted transparent src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900}} />
        </Sequence>
      ) : null}
      {beat.tag === 'b04_your_deal' ? (
        <>
          <SmallCard text="2ND" x={250} y={742} w={120} h={70} bg={WHITE} />
          <SmallCard text="1ST" x={728} y={682} w={120} h={70} bg={YELLOW} />
          <SmallCard text="3RD" x={1170} y={760} w={120} h={70} bg={WHITE} />
        </>
      ) : null}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const TiersBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tiers = [
    ['1-2 DEALS', '$500', 170, CREAM],
    ['3-4 DEALS', '$750', 330, WHITE],
    ['5+ DEALS', '$1,000', 490, YELLOW],
  ] as const;
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 120, top: 120, width: 1360, height: 650, padding: 42, boxSizing: 'border-box'}}>
        {tiers.map(([range, pay, y, bg], i) => {
          const a = pop(frame, fps, 25 + i * 36);
          return (
            <div key={range} style={{position: 'absolute', left: 410, top: y, width: 590, height: 106, borderRadius: 18, background: bg, border: `6px solid ${INK}`, opacity: a, transform: `translateX(${(1 - a) * -50}px)`}}>
              <Text size={36} style={{position: 'absolute', left: 32, top: 31}}>
                {range}
              </Text>
              <Text size={48} color={ORANGE} style={{position: 'absolute', right: 32, top: 23}}>
                {pay}
              </Text>
            </div>
          );
        })}
        {Array.from({length: 5}).map((_, i) => (
          <div key={i} style={{position: 'absolute', left: 1045 + i * 60, top: 536, width: 52, height: 52, borderRadius: '50%', background: frame > 145 ? YELLOW : CREAM, border: `5px solid ${INK}`, transform: `scale(${pop(frame, fps, 120 + i * 8)})`}} />
        ))}
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const AppointmentsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const count = Math.min(50, Math.round(interpolate(frame, [20, 180], [0, 50], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 130, top: 130, width: 1340, height: 640, padding: 42, boxSizing: 'border-box'}}>
        <Text size={62} center>
          KEPT APPOINTMENT TRACKER
        </Text>
        <Text size={130} color={ORANGE} center style={{position: 'absolute', left: 0, top: 210, width: 1340}}>
          {count}
        </Text>
        {[25, 50].map((n, i) => (
          <div key={n} style={{position: 'absolute', left: 250 + i * 620, top: 520, width: 260, height: 95, borderRadius: 18, background: count >= n ? YELLOW : CREAM, border: `6px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Text size={38} center>
              {n} = ${n / 25 * 250}
            </Text>
          </div>
        ))}
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const FormulaRow: React.FC<{left: string; right: string; y: number; active?: boolean}> = ({left, right, y, active = false}) => (
  <div style={{position: 'absolute', left: 150, top: y, width: 1010, height: 84, display: 'grid', gridTemplateColumns: '1fr 360px', alignItems: 'center', background: active ? YELLOW : CREAM, border: `5px solid ${INK}`, borderRadius: 16, padding: '0 30px', boxSizing: 'border-box'}}>
    <Text size={36}>{left}</Text>
    <Text size={42} color={ORANGE} center>{right}</Text>
  </div>
);

const ExampleBeat: React.FC<{beat: Beat; tier: 2 | 3}> = ({beat, tier}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <Panel style={{position: 'absolute', left: 140, top: 115, width: 1320, height: 660, padding: 42, boxSizing: 'border-box'}}>
      <Text size={64} center>
        {tier === 2 ? 'WORKED EXAMPLE' : 'IMPROVEMENT EXAMPLE'}
      </Text>
      {tier === 2 ? (
        <>
          <FormulaRow left="Appointment bonus" right="$250" y={230} />
          <FormulaRow left="3 deals at Tier 2" right="$2,250" y={345} />
          <FormulaRow left="Bonus + commission" right="$2,500" y={500} active />
        </>
      ) : (
        <>
          <FormulaRow left="Appointment bonus" right="$250" y={230} />
          <FormulaRow left="5 deals at Tier 3" right="$5,000" y={345} />
          <FormulaRow left="Total this month" right="$5,250" y={500} active />
        </>
      )}
    </Panel>
    <Labels labels={beat.labels} />
  </AbsoluteFill>
);

const CurveBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const x2 = interpolate(frame, [0, 140], [300, 1220], {extrapolateRight: 'clamp'});
  const y2 = interpolate(frame, [0, 140], [650, 230], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', left: 220, top: 650, width: 1040, height: 8, background: INK, borderRadius: 8}} />
      <div style={{position: 'absolute', left: 220, top: 220, width: 8, height: 430, background: INK, borderRadius: 8}} />
      <svg width="1600" height="900" style={{position: 'absolute', inset: 0}}>
        <path d={`M 260 620 C 520 550, 740 360, ${x2} ${y2}`} stroke={ORANGE} strokeWidth="18" fill="none" strokeLinecap="round" />
      </svg>
      <SmallCard text="FOLLOW-UP" x={260} y={690} w={260} h={90} bg={CREAM} />
      <SmallCard text="QUALIFICATION" x={570} y={690} w={330} h={90} bg={WHITE} />
      <SmallCard text="COMMISSIONS" x={1020} y={210} w={330} h={90} bg={YELLOW} />
      <div style={{position: 'absolute', left: 1180, top: 90, width: 170, height: 70, borderRadius: 18, border: `6px solid ${INK}`, borderBottom: 'none', background: WHITE, transform: `translateY(${frame > 130 ? -70 : 0}px)`, opacity: frame > 185 ? 0 : 1}} />
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const TopEarnersBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.035], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`}} /> : null}
      <Panel style={{position: 'absolute', left: 80, bottom: 82, width: 510, height: 94, padding: 18, boxSizing: 'border-box'}}>
        <Text size={34} center>
          {'QUALITY CONVERSATIONS -> CLEAN CLOSES'}
        </Text>
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} />;
  if (beat.mode === 'attributionHero') return <AttributionHeroBeat beat={beat} />;
  if (beat.mode === 'pieces') return <PiecesBeat beat={beat} />;
  if (beat.mode === 'ramp') return <RampBeat beat={beat} />;
  if (beat.mode === 'sceneVideo') return <SceneVideoBeat beat={beat} dur={dur} />;
  if (beat.mode === 'tiers') return <TiersBeat beat={beat} />;
  if (beat.mode === 'appointments') return <AppointmentsBeat beat={beat} />;
  if (beat.mode === 'example2') return <ExampleBeat beat={beat} tier={2} />;
  if (beat.mode === 'example3') return <ExampleBeat beat={beat} tier={3} />;
  if (beat.mode === 'curve') return <CurveBeat beat={beat} />;
  if (beat.mode === 'topEarners') return <TopEarnersBeat beat={beat} dur={dur} />;
  return <AbsoluteFill style={{backgroundColor: BLUE}}><Labels labels={beat.labels} /></AbsoluteFill>;
};

const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.tag === 'b01_money_connection' || next.tag === 'b13_operator_playbook_tease') return {presentation: fade(), frames: T};
  const dirs = ['from-left', 'from-right', 'from-top', 'from-bottom'] as const;
  const seed = (prev.tag.charCodeAt(1) + next.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

export const Lesson13A: React.FC = () => {
  const beats = manifest.beats as Beat[];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const trans = i < beats.length - 1 ? pickTransition(beat, beats[i + 1]) : null;
          const pad = trans ? trans.frames : 0;
          const seq = (
            <TransitionSeries.Sequence key={beat.tag} durationInFrames={beat.durationInFrames + pad}>
              {beatContent(beat, beat.durationInFrames + pad)}
            </TransitionSeries.Sequence>
          );
          return trans
            ? [
                seq,
                <TransitionSeries.Transition
                  key={`${beat.tag}-transition`}
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

export const LESSON_13A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

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
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import manifest from '../public/lesson18A/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const ORANGE = '#ff7500';
const INK = '#111111';
const WHITE = '#ffffff';
const LABEL_EXIT_FRAMES = 12;
const LABEL_GAP_FRAMES = 5;
const LABEL_END_PAD_FRAMES = 10;
const MIN_LABEL_FRAMES = 38;
const TRANSITION_FRAMES = 12;

type Label = {text: string; delay: number; place: string; role?: 'label' | 'caption' | 'title'};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  anim?: string;
  tail?: string;
  animFrames?: number;
  labels: Label[];
  badge?: boolean;
  durationInFrames: number;
  voFrames: number;
  animationStatus: string;
};

export const LESSON_18A_FRAMES = (manifest as {totalFrames: number}).totalFrames;
const beats = (manifest as {beats: Beat[]}).beats;

const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

const LABEL_SIZES: Record<NonNullable<Label['role']>, {fontSize: number; pad: string; radius: number}> = {
  title: {fontSize: 56, pad: '13px 34px', radius: 18},
  label: {fontSize: 44, pad: '10px 28px', radius: 16},
  caption: {fontSize: 34, pad: '8px 22px', radius: 14},
};

type LabelSlot = {label: Label; start: number; end: number};

const buildLabelSlots = (labels: Label[], durationInFrames: number): LabelSlot[] => {
  const hardEnd = Math.max(0, durationInFrames - LABEL_END_PAD_FRAMES);
  let cursor = 0;

  return [...labels]
    .sort((a, b) => a.delay - b.delay)
    .map((label, i, ordered) => {
      const start = Math.max(label.delay, cursor);
      const nextDelay = ordered[i + 1]?.delay;
      const requestedEnd =
        nextDelay === undefined
          ? hardEnd
          : Math.min(hardEnd, Math.max(start + MIN_LABEL_FRAMES, nextDelay - LABEL_GAP_FRAMES));
      const end = Math.min(hardEnd, Math.max(start + MIN_LABEL_FRAMES, requestedEnd));
      cursor = end + LABEL_GAP_FRAMES;
      return {label, start, end};
    })
    .filter((slot) => slot.end > slot.start + LABEL_EXIT_FRAMES);
};

// Ordinary Remotion labels use one bottom-center lane. Purpose-specific callouts should be built as separate scene UI.
const Labels: React.FC<{labels?: Label[]; durationInFrames: number}> = ({labels = [], durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const slots = buildLabelSlots(labels, durationInFrames);
  const activeSlot = slots.find((slot) => frame >= slot.start && frame < slot.end);

  if (!activeSlot) return null;

  const {label, start, end} = activeSlot;
  const role = label.role ?? 'label';
  const size = LABEL_SIZES[role];
  const enter = spring({
    frame: frame - start,
    fps,
    config: {damping: 11, stiffness: 170},
    durationInFrames: 20,
  });
  const exitStart = Math.max(start + 20, end - LABEL_EXIT_FRAMES);
  const exit = interpolate(frame, [exitStart, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(1, enter * 1.35) * (1 - exit);
  const y = (1 - enter) * 22 + exit * 34;
  const scale = 0.92 + Math.min(1, enter) * 0.08 - exit * 0.04;

  return (
    <div
      key={`${label.text}-${start}`}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 58,
        transform: `translateX(-50%) translateY(${y}px) scale(${scale})`,
        opacity,
        zIndex: 40,
        pointerEvents: 'none',
        maxWidth: 1180,
        boxSizing: 'border-box',
        fontFamily: baloo.fontFamily,
        fontWeight: 700,
        fontSize: size.fontSize,
        lineHeight: 1.05,
        letterSpacing: 0,
        color: INK,
        textAlign: 'center',
        whiteSpace: 'normal',
        overflowWrap: 'break-word',
        background: WHITE,
        padding: size.pad,
        borderRadius: size.radius,
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
      }}
    >
      {label.text}
    </div>
  );
};

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

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
    ) : null}
    <Labels labels={beat.labels} durationInFrames={beat.durationInFrames} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const PriyaDeskScene: React.FC<{still?: string; variant: 'research' | 'admin'; frame: number}> = ({still, variant, frame}) => {
  const handLift = Math.sin(frame / 6) * 2.5;
  const admin = variant === 'admin';

  return (
    <div style={{position: 'absolute', width: 1600, height: 900}}>
      <div style={{position: 'absolute', left: 430, top: 250, width: 286, height: 440, borderRadius: 42, background: INK, opacity: 0.96, zIndex: 1}} />
      {still ? (
        <Img
          src={staticFile(still)}
          style={{
            position: 'absolute',
            left: admin ? 455 : 430,
            top: admin ? 120 : 115,
            width: admin ? 360 : 375,
            height: 'auto',
            clipPath: 'inset(0 0 31% 0)',
            zIndex: 2,
          }}
        />
      ) : null}

      <div style={{position: 'absolute', left: 250, top: 548, width: 1110, height: 126, border: `7px solid ${INK}`, borderRadius: 22, background: CREAM, zIndex: 4}} />
      <div style={{position: 'absolute', left: 312, top: 664, width: 26, height: 172, borderRadius: 14, background: INK, zIndex: 3}} />
      <div style={{position: 'absolute', left: 1258, top: 664, width: 26, height: 172, borderRadius: 14, background: INK, zIndex: 3}} />

      <div style={{position: 'absolute', left: 580, top: 570 + handLift, width: 150, height: 34, border: `6px solid ${INK}`, borderRadius: 24, background: YELLOW, transform: 'rotate(8deg)', zIndex: 5}} />
      <div style={{position: 'absolute', left: 734, top: 572 - handLift, width: 124, height: 32, border: `6px solid ${INK}`, borderRadius: 22, background: YELLOW, transform: 'rotate(-6deg)', zIndex: 5}} />
      <div style={{position: 'absolute', left: 706, top: 593 + handLift, width: 50, height: 36, border: `5px solid ${INK}`, borderRadius: '50%', background: WHITE, zIndex: 9}} />
      <div style={{position: 'absolute', left: 827, top: 591 - handLift, width: 48, height: 36, border: `5px solid ${INK}`, borderRadius: '50%', background: WHITE, zIndex: 9}} />

      {admin ? (
        <>
          <div style={{position: 'absolute', left: 792, top: 286, width: 430, height: 266, border: `7px solid ${INK}`, borderRadius: 20, background: CREAM, transform: 'rotate(-2deg)', zIndex: 6}} />
          <div style={{position: 'absolute', left: 972, top: 538, width: 58, height: 96, border: `7px solid ${INK}`, borderRadius: 10, background: INK, zIndex: 6}} />
          <div style={{position: 'absolute', left: 903, top: 620, width: 200, height: 28, borderRadius: '50%', background: INK, zIndex: 6}} />
          <div style={{position: 'absolute', left: 678, top: 592, width: 300, height: 48, border: `6px solid ${INK}`, borderRadius: 14, background: WHITE, zIndex: 8}} />
          {Array.from({length: 10}, (_, i) => (
            <div key={i} style={{position: 'absolute', left: 698 + (i % 5) * 50, top: 604 + Math.floor(i / 5) * 17, width: 30, height: 7, borderRadius: 7, background: INK, opacity: 0.88, zIndex: 9}} />
          ))}
          <div style={{position: 'absolute', left: 1135, top: 455, width: 132, height: 148, border: `7px solid ${INK}`, borderRadius: 20, background: INK, transform: 'rotate(5deg)', zIndex: 8}} />
          <div style={{position: 'absolute', left: 1168, top: 477, width: 52, height: 24, borderRadius: 6, background: WHITE, zIndex: 9}} />
          {Array.from({length: 9}, (_, i) => (
            <div key={i} style={{position: 'absolute', left: 1161 + (i % 3) * 28, top: 518 + Math.floor(i / 3) * 22, width: 12, height: 12, borderRadius: '50%', background: WHITE, zIndex: 9}} />
          ))}
          <div style={{position: 'absolute', left: 376, top: 593, width: 190, height: 30, border: `5px solid ${INK}`, borderRadius: 10, background: YELLOW, zIndex: 8}} />
        </>
      ) : (
        <>
          <div style={{position: 'absolute', left: 735, top: 350, width: 360, height: 244, border: `7px solid ${INK}`, borderRadius: 20, background: CREAM, transform: 'rotate(-3deg)', zIndex: 6}} />
          <div style={{position: 'absolute', left: 881, top: 451, width: 46, height: 46, border: `6px solid ${INK}`, borderRadius: '50%', background: WHITE, zIndex: 7}} />
          <div style={{position: 'absolute', left: 653, top: 607, width: 414, height: 48, border: `6px solid ${INK}`, borderRadius: 16, background: WHITE, transform: 'rotate(1deg)', zIndex: 8}} />
          <div style={{position: 'absolute', left: 1090, top: 588, width: 170, height: 56, border: `5px solid ${INK}`, borderRadius: 10, background: YELLOW, transform: 'rotate(-3deg)', zIndex: 8}} />
        </>
      )}
    </div>
  );
};

const ResearchPrepBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const showAndrea = frame >= 450;

  if (showAndrea) {
    return (
      <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
        {beat.hero ? (
          <OffthreadVideo muted src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
        ) : null}
        <Labels labels={beat.labels} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.anim ? (
        <OffthreadVideo muted src={staticFile(beat.anim)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : beat.still ? (
        <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : null}
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const AdminDeskBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.03], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          width: 1600,
          height: 900,
          transform: `translate(-35px, -28px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <PriyaDeskScene still={beat.still} variant="admin" frame={frame} />
      </div>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const SceneBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.035], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const animFrames = beat.animFrames ?? 0;
  const showAnim = beat.anim && frame < Math.min(animFrames, dur);
  const showTail = beat.tail && animFrames > 0 && frame >= Math.min(animFrames, dur);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {showAnim ? (
        <OffthreadVideo muted src={staticFile(beat.anim!)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : showTail ? (
        <Img src={staticFile(beat.tail!)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} />
      ) : beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const LeadTickerBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const activeColumn = Math.floor(frame / 42) % 5;
  const columns = [
    {
      status: 'NO CONTACT',
      addresses: [
        ['123 Harbor Ln', 'Providence, RI'],
        ['810 Pine St', 'Boise, ID'],
      ],
    },
    {
      status: 'NURTURE',
      addresses: [
        ['44 Elm Ave', 'Raleigh, NC'],
        ['19 Maple Dr', 'Tucson, AZ'],
      ],
    },
    {
      status: 'FOLLOW-UP',
      addresses: [
        ['502 Cedar Rd', 'Spokane, WA'],
        ['76 Spruce Way', 'Tampa, FL'],
      ],
    },
    {
      status: 'APPT SET',
      addresses: [
        ['2309 Main St', 'Columbus, OH'],
        ['6 Brook Ct', 'Reno, NV'],
      ],
    },
    {
      status: 'DEAD',
      addresses: [
        ['91 Walnut Ave', 'Richmond, VA'],
        ['1402 Ash St', 'Salt Lake City, UT'],
      ],
    },
  ];

  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.still ? <Img src={staticFile(beat.still)} style={{position: 'absolute', width: 1600, height: 900, objectFit: 'cover'}} /> : null}
      <div
        style={{
          position: 'absolute',
          left: 92,
          top: 58,
          width: 1416,
          height: 340,
          border: `7px solid ${INK}`,
          borderRadius: 26,
          background: CREAM,
          boxShadow: '0 12px 0 rgba(0,0,0,0.10)',
          padding: 22,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16}}>
          {columns.map((column, columnIndex) => (
            <div key={column.status}>
              <div
                style={{
                  height: 50,
                  borderRadius: 12,
                  background: columnIndex === activeColumn ? ORANGE : YELLOW,
                  border: `5px solid ${INK}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 8px',
                  boxSizing: 'border-box',
                }}
              >
                <Text size={21} center color={columnIndex === activeColumn ? WHITE : INK}>
                  {column.status}
                </Text>
              </div>
              <div style={{display: 'grid', gap: 12, marginTop: 13}}>
                {column.addresses.map(([street, city], addressIndex) => (
                  <div
                    key={`${street}-${city}`}
                    style={{
                      height: 88,
                      borderRadius: 14,
                      border: `5px solid ${INK}`,
                      background: WHITE,
                      padding: '10px 10px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <Text size={18} center>
                      {street}
                    </Text>
                    <Text size={15} center style={{marginTop: addressIndex === 0 ? 6 : 5}}>
                      {city}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const SecondBlockBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const dials = Math.min(150, Math.round(interpolate(frame, [15, 205], [82, 142], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 135, top: 142, width: 840, height: 585, padding: 42, boxSizing: 'border-box'}}>
        <Text size={54}>CALL BLOCK 2</Text>
        {['FOLLOW-UPS', 'NEW LEADS', 'RE-CONTACTS', 'TEXTS', 'EMAILS'].map((row, i) => (
          <div
            key={row}
            style={{
              marginTop: i === 0 ? 42 : 20,
              height: 62,
              border: `5px solid ${INK}`,
              borderRadius: 14,
              background: i <= Math.floor(frame / 55) ? YELLOW : CREAM,
              padding: '9px 18px',
              boxSizing: 'border-box',
            }}
          >
            <Text size={30}>{row}</Text>
          </div>
        ))}
      </Panel>
      <Panel style={{position: 'absolute', right: 145, top: 190, width: 380, height: 350, padding: 36, boxSizing: 'border-box'}}>
        <Text size={36} center>
          BY LUNCH
        </Text>
        <Text size={92} color={ORANGE} center style={{marginTop: 22}}>
          {dials}
        </Text>
        <Text size={30} center>
          DIALS
        </Text>
      </Panel>
      <Panel style={{position: 'absolute', right: 145, bottom: 145, width: 380, height: 122, padding: 28, boxSizing: 'border-box', background: CREAM}}>
        <Text size={36} center>
          REAL FOOD
        </Text>
      </Panel>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const FinalPushBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const dials = Math.min(200, Math.round(interpolate(frame, [10, 170], [150, 198], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 135, top: 150, width: 1330, height: 575, padding: 48, boxSizing: 'border-box'}}>
        <Text size={54}>FINAL CALLING BLOCK</Text>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 22, marginTop: 62}}>
          {['REMAINING LEADS', 'MORNING NO-PICKS', 'SCHEDULED TODAY'].map((label, i) => (
            <div key={label} style={{height: 250, border: `6px solid ${INK}`, borderRadius: 18, background: i <= Math.floor(frame / 65) ? YELLOW : CREAM, padding: 24}}>
              <Text size={34} center>
                {label}
              </Text>
              <Text size={76} color={ORANGE} center style={{marginTop: 36}}>
                {i === 0 ? '24' : i === 1 ? '18' : 'ALL'}
              </Text>
            </div>
          ))}
        </div>
        <div
          style={{
            height: 82,
            marginTop: 24,
            border: `6px solid ${INK}`,
            borderRadius: 18,
            background: CREAM,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text size={48} color={ORANGE} center>
            {dials} TOTAL
          </Text>
        </div>
      </Panel>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const WorkedDayBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const rows = ['DIAL TARGET', 'SCHEDULED FOLLOW-UPS', 'DETAILED NOTES', 'TEXTS + EMAILS', 'STAGES UPDATED', 'NEXT ACTIONS', 'PIPELINE CLEAN', 'FULL HOURS'];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 250, top: 128, width: 1100, height: 620, padding: 54, boxSizing: 'border-box'}}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8}}>
          {rows.map((row, i) => {
            const active = frame > 55 + i * 28;
            return (
              <div key={row} style={{height: 88, border: `5px solid ${INK}`, borderRadius: 14, background: active ? YELLOW : CREAM, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 16}}>
                <div style={{width: 36, height: 36, borderRadius: 8, border: `5px solid ${INK}`, background: active ? ORANGE : WHITE}} />
                <Text size={28}>{row}</Text>
              </div>
            );
          })}
        </div>
      </Panel>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const ConsistencyBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const frame = useCurrentFrame();
  const days = Array.from({length: 25}, (_, i) => i);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 175, top: 132, width: 1250, height: 620, padding: 50, boxSizing: 'border-box'}}>
        <Text size={54}>CONTROL BOARD</Text>
        <div style={{position: 'absolute', left: 72, top: 160, width: 650, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14}}>
          {days.map((day) => {
            const active = frame > 20 + day * 8;
            return (
              <div key={day} style={{height: 70, border: `5px solid ${INK}`, borderRadius: 14, background: active ? YELLOW : CREAM}} />
            );
          })}
        </div>
        <div style={{position: 'absolute', right: 72, top: 192, width: 360}}>
          {['SHOW UP', 'MAKE CALLS', 'LOG NOTES', 'FOLLOW THROUGH'].map((lever, i) => (
            <div key={lever} style={{height: 78, marginBottom: 22, border: `5px solid ${INK}`, borderRadius: 18, background: frame > 45 + i * 35 ? ORANGE : WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <Text size={31} center color={frame > 45 + i * 35 ? WHITE : INK}>
                {lever}
              </Text>
            </div>
          ))}
        </div>
      </Panel>
      <Labels labels={beat.labels} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

const BeatContent: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} />;
  if (beat.mode === 'researchPrep') return <ResearchPrepBeat beat={beat} dur={dur} />;
  if (beat.mode === 'adminDesk') return <AdminDeskBeat beat={beat} dur={dur} />;
  if (beat.mode === 'leadTicker') return <LeadTickerBeat beat={beat} dur={dur} />;
  if (beat.mode === 'secondBlock') return <SecondBlockBeat beat={beat} dur={dur} />;
  if (beat.mode === 'finalPush') return <FinalPushBeat beat={beat} dur={dur} />;
  if (beat.mode === 'workedDay') return <WorkedDayBeat beat={beat} dur={dur} />;
  if (beat.mode === 'consistency') return <ConsistencyBeat beat={beat} dur={dur} />;
  return <SceneBeat beat={beat} dur={dur} />;
};

const pickTransition = (_prev: Beat, _next: Beat) => fade();

export const Lesson18A: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <Audio src={staticFile((manifest as {audio: string}).audio)} />
    <TransitionSeries>
      {beats.flatMap((beat, i) => {
        const hasNext = i < beats.length - 1;
        const pad = hasNext ? TRANSITION_FRAMES : 0;
        const duration = beat.durationInFrames + pad;
        const sequence = (
          <TransitionSeries.Sequence key={beat.tag} durationInFrames={duration}>
            <BeatContent beat={beat} dur={duration} />
          </TransitionSeries.Sequence>
        );

        if (!hasNext) return [sequence];

        return [
          sequence,
          <TransitionSeries.Transition
            key={`${beat.tag}-transition`}
            presentation={pickTransition(beat, beats[i + 1])}
            timing={linearTiming({durationInFrames: TRANSITION_FRAMES})}
          />,
        ];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);

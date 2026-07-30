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
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import {Sticker} from './Sticker';
import manifest from '../public/lesson12A/manifest.json';

const baloo = loadBaloo();

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const ORANGE = '#ff7500';
const INK = '#111111';
const WHITE = '#ffffff';

type Label = {text: string; delay: number; place: string; role?: 'label' | 'caption' | 'title'};
type Beat = {
  tag: string;
  mode: string;
  still?: string;
  hero?: string;
  labels: Label[];
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

const pop = (frame: number, fps: number, delay: number) =>
  Math.max(0, Math.min(1, spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 18})));

const place = (p: string): Partial<React.ComponentProps<typeof Sticker>> => {
  if (p === 'propTop') return {topCenter: true, top: 54};
  if (p === 'propLeft') return {top: 235, left: 70};
  if (p === 'propRight') return {top: 235, left: 1060};
  if (p === 'propCenter') return {top: 390, left: 560};
  return {bottomCenter: true};
};

const Labels: React.FC<{labels?: Label[]}> = ({labels = []}) => {
  const frame = useCurrentFrame();
  const activeLabels = labels
    .map((label, i) => ({label, i}))
    .filter(({label}) => frame >= label.delay)
    .sort((a, b) => a.label.delay - b.label.delay || a.i - b.i);
  const active = activeLabels[activeLabels.length - 1];

  if (!active) return null;

  const {label, i} = active;
  return (
    <Sticker
      key={`${label.text}-${label.delay}-${i}`}
      text={label.text}
      role={label.role ?? 'label'}
      bg="white"
      delay={0}
      {...place(label.place)}
    />
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
    <Labels labels={beat.labels} />
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

const StillBeat: React.FC<{beat: Beat; dur: number; children?: React.ReactNode}> = ({beat, dur, children}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, dur)], [1, 1.035], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: BLUE, overflow: 'hidden'}}>
      {beat.still ? (
        <Img
          src={staticFile(beat.still)}
          style={{position: 'absolute', width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'center center'}}
        />
      ) : null}
      {children}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const MetricChip: React.FC<{text: string; x: number; y: number; w?: number; active?: boolean}> = ({text, x, y, w = 190, active}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: 84,
      borderRadius: 16,
      background: active ? YELLOW : WHITE,
      border: `5px solid ${INK}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 12px',
      boxSizing: 'border-box',
    }}
  >
    <Text size={30} center>
      {text}
    </Text>
  </div>
);

const GapBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const points = [
    [190, 440],
    [340, 270],
    [490, 395],
    [640, 220],
    [790, 360],
    [940, 285],
    [1090, 450],
    [1240, 325],
    [1390, 405],
  ];
  const progress = interpolate(frame, [20, 150], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 130, top: 140, width: 1340, height: 610, padding: 38, boxSizing: 'border-box'}}>
        <svg width="1264" height="515" viewBox="0 0 1264 515" style={{position: 'absolute', left: 38, top: 58}}>
          {[0, 1, 2, 3].map((i) => (
            <line key={`h-${i}`} x1="115" x2="1205" y1={145 + i * 95} y2={145 + i * 95} stroke={CREAM} strokeWidth="6" strokeLinecap="round" />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`v-${i}`} x1={190 + i * 250} x2={190 + i * 250} y1="90" y2="480" stroke={CREAM} strokeWidth="6" strokeLinecap="round" />
          ))}
          <line x1="115" y1="480" x2="1205" y2="480" stroke={INK} strokeWidth="10" strokeLinecap="round" />
          <line x1="115" y1="80" x2="115" y2="480" stroke={INK} strokeWidth="10" strokeLinecap="round" />
          <path
            d={path}
            fill="none"
            stroke={ORANGE}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1800"
            strokeDashoffset={1800 * (1 - progress)}
          />
          {points.map(([x, y], i) => {
            const visible = progress >= i / (points.length - 1);
            return <circle key={`${x}-${y}`} cx={x} cy={y} r="17" fill={visible ? YELLOW : WHITE} stroke={INK} strokeWidth="7" opacity={visible ? 1 : 0.18} />;
          })}
        </svg>
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const Gauge: React.FC<{label: string; value: number; x: number; y: number}> = ({label, value, x, y}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = pop(frame, fps, 20);
  const deg = -120 + 240 * value * a;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 330, height: 260}}>
      <div style={{position: 'absolute', left: 15, top: 0, width: 300, height: 300, borderRadius: '50%', background: CREAM, border: `8px solid ${INK}`}} />
      <div style={{position: 'absolute', left: 165, top: 150, width: 112, height: 8, background: INK, transformOrigin: 'left center', transform: `rotate(${deg}deg)`, borderRadius: 8}} />
      <div style={{position: 'absolute', left: 147, top: 132, width: 44, height: 44, borderRadius: '50%', background: ORANGE, border: `5px solid ${INK}`}} />
      <Text size={34} center style={{position: 'absolute', left: 0, top: 205, width: 330}}>
        {label}
      </Text>
    </div>
  );
};

const GaugeBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <Panel style={{position: 'absolute', left: 170, top: 170, width: 1260, height: 560, padding: 42, boxSizing: 'border-box'}}>
      <Gauge label="ON TRACK" value={0.72} x={80} y={145} />
      <Gauge label="STRONG" value={0.86} x={465} y={145} />
      <Gauge label="FIX" value={0.22} x={850} y={145} />
    </Panel>
    <Labels labels={beat.labels} />
  </AbsoluteFill>
);

const PipelineBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const stages = ['DIALS', 'CONNECTIONS', 'QUALITY', 'PROCESS', 'OFFERS', 'CONTRACTS'];
  const activeIndex = Math.min(stages.length - 1, Math.floor(frame / 38));
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', left: 215, right: 215, top: 397, height: 10, background: CREAM, border: `5px solid ${INK}`, borderRadius: 10}} />
      {stages.map((s, i) => (
        <MetricChip key={s} text={s} x={120 + i * 235} y={360} w={205} active={i <= activeIndex} />
      ))}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const DialBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const effortRows = ['Pick up the phone', 'Dial the next lead', 'Leave clean notes', 'Keep working the list'];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 130, top: 150, width: 600, height: 570, padding: 46, boxSizing: 'border-box'}}>
        <Text size={54}>OUTBOUND CALLS</Text>
        <div style={{position: 'absolute', left: 78, right: 78, top: 190, height: 280, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'end', columnGap: 20}}>
          {Array.from({length: 5}).map((_, i) => {
            const a = pop(frame, 30, 30 + i * 18);
            return (
              <div key={i} style={{height: 74 + i * 32, borderRadius: 20, background: i % 2 ? CREAM : YELLOW, border: `6px solid ${INK}`, transform: `scaleY(${Math.max(0.15, a)})`, transformOrigin: 'bottom center'}} />
            );
          })}
        </div>
        <Text size={40} center style={{position: 'absolute', left: 60, right: 60, bottom: 62}}>
          REAL EFFORT
        </Text>
      </Panel>
      <Panel style={{position: 'absolute', right: 130, top: 150, width: 600, height: 570, padding: 46, boxSizing: 'border-box'}}>
        <Text size={54}>YOU CONTROL</Text>
        {effortRows.map((t, i) => (
          <div key={t} style={{display: 'flex', alignItems: 'center', gap: 24, marginTop: 48}}>
            <div style={{width: 46, height: 46, borderRadius: 12, background: frame > 32 + i * 24 ? YELLOW : CREAM, border: `5px solid ${INK}`}} />
            <Text size={38}>{t}</Text>
          </div>
        ))}
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const ConnectionBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const issues = ['Spam flag', 'Stale list', 'Bad call time'];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <FlowCard x={160} y={320} top="DIALS" bottom="Outbound attempts" active />
      <Arrow x={520} y={395} w={240} />
      <FlowCard x={800} y={320} top="PICKUPS" bottom="Actual conversations" active={frame > 55} />
      <Panel style={{position: 'absolute', right: 120, top: 170, width: 390, height: 310, padding: 28}}>
        <Text size={38}>IF IT DROPS</Text>
        {issues.map((issue, i) => (
          <div key={issue} style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 22}}>
            <div style={{width: 34, height: 34, borderRadius: 10, background: frame > 80 + i * 18 ? YELLOW : CREAM, border: `4px solid ${INK}`}} />
            <Text size={30}>{issue}</Text>
          </div>
        ))}
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const FlowCard: React.FC<{x: number; y: number; top: string; bottom: string; active?: boolean}> = ({x, y, top, bottom, active}) => (
  <div style={{position: 'absolute', left: x, top: y, width: 270, height: 220, borderRadius: 40, background: active ? WHITE : CREAM, border: `7px solid ${INK}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
    <Text size={50} color={ORANGE} center>{top}</Text>
    <Text size={30} center style={{marginTop: 12}}>{bottom}</Text>
  </div>
);

const MetricBubble: React.FC<{x: number; y: number; top: string; bottom: string}> = ({x, y, top, bottom}) => (
  <div style={{position: 'absolute', left: x, top: y, width: 270, height: 220, borderRadius: 40, background: WHITE, border: `7px solid ${INK}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
    <Text size={78} color={ORANGE} center>{top}</Text>
    <Text size={34} center>{bottom}</Text>
  </div>
);

const Arrow: React.FC<{x: number; y: number; w: number}> = ({x, y, w}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: 12, background: INK, borderRadius: 10}}>
    <div style={{position: 'absolute', right: -2, top: -23, width: 0, height: 0, borderTop: '29px solid transparent', borderBottom: '29px solid transparent', borderLeft: `46px solid ${INK}`}} />
  </div>
);

const QualityBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <Funnel stages={['PICKED UP', 'WRONG # OUT', 'DNC OUT', 'ZERO INTEREST OUT', 'QUALITY CONVERSATION']} />
    <Labels labels={beat.labels} />
  </AbsoluteFill>
);

const Funnel: React.FC<{stages: string[]; showText?: boolean}> = ({stages, showText = true}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {stages.map((s, i) => {
        const w = 1040 - i * 150;
        const a = pop(frame, 30, i * 20);
        return (
          <div key={`${i}-${s}`} style={{position: 'absolute', left: 800 - w / 2, top: 190 + i * 105, width: w, height: 78, borderRadius: 18, background: i === stages.length - 1 ? YELLOW : WHITE, border: `5px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
            {showText ? <Text size={34} center>{s}</Text> : null}
          </div>
        );
      })}
    </>
  );
};

const ProcessBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const rows = ['Questions covered', 'Confirmed qualification', 'Property details gathered', 'Next step ready'];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 150, top: 160, width: 620, height: 570, padding: 42, boxSizing: 'border-box'}}>
        <Text size={54}>PROCESS CALL</Text>
        {rows.map((r, i) => (
          <div key={r} style={{display: 'flex', alignItems: 'center', gap: 20, marginTop: 36}}>
            <div style={{width: 44, height: 44, borderRadius: 12, background: frame > 40 + i * 26 ? YELLOW : CREAM, border: `5px solid ${INK}`}} />
            <Text size={34}>{r}</Text>
          </div>
        ))}
      </Panel>
      <Panel style={{position: 'absolute', right: 150, top: 250, width: 560, height: 300, padding: 38, boxSizing: 'border-box'}}>
        <Text size={48}>CALL RECORDING</Text>
        <div style={{position: 'absolute', left: 50, right: 50, bottom: 75, height: 110, display: 'flex', alignItems: 'center', gap: 9}}>
          {Array.from({length: 32}).map((_, i) => (
            <div key={i} style={{width: 9, height: 22 + Math.abs(Math.sin((frame + i * 7) / 8)) * 72, background: i % 3 ? INK : ORANGE, borderRadius: 9}} />
          ))}
        </div>
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const OffersBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => <StillBeat beat={beat} dur={dur} />;

const ContractsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const signed = pop(frame, 30, 55);
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', left: 520, top: 185, width: 560, height: 600, borderRadius: 24, background: CREAM, border: `8px solid ${INK}`, transform: 'rotate(-2deg)', boxSizing: 'border-box'}}>
        <div style={{position: 'absolute', left: 70, right: 70, top: 56}}>
          <Text size={52} center>CONTRACT</Text>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{position: 'absolute', left: 78, top: 150 + i * 62, width: i === 4 ? 270 : 400, height: 9, borderRadius: 9, background: INK, opacity: 0.88}} />
        ))}
        <svg width="300" height="95" viewBox="0 0 300 95" style={{position: 'absolute', left: 78, bottom: 72, opacity: signed}}>
          <path d="M8 60 C50 10, 65 92, 112 45 C143 15, 143 80, 186 48 C220 22, 220 76, 286 45" fill="none" stroke={ORANGE} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{position: 'absolute', right: 76, bottom: 76, width: 102, height: 102, borderRadius: '50%', background: YELLOW, border: `7px solid ${INK}`, opacity: signed}} />
      </div>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const BreakdownBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  const rows = [
    ['Low dials', 'Effort'],
    ['Low connections', 'Number / list'],
    ['Few quality conversations', 'Audience / opening'],
    ['Few process calls', 'Discovery'],
    ['Few offers', 'Handoff'],
    ['Few contracts', 'Negotiation'],
  ];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 170, top: 130, width: 1260, height: 650, padding: 38, boxSizing: 'border-box'}}>
        {rows.map((r, i) => {
          const active = i === Math.min(rows.length - 1, Math.floor(frame / 55));
          return (
            <div key={r[0]} style={{position: 'absolute', left: 70, top: 95 + i * 82, width: 1120, height: 62, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 28px', boxSizing: 'border-box', background: active ? YELLOW : CREAM, border: `4px solid ${INK}`, borderRadius: 14}}>
              <Text size={32}>{r[0]}</Text>
              <Text size={32}>{r[1]}</Text>
            </div>
          );
        })}
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const FunnelHealthBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    <Funnel stages={['DIALS', 'CONNECTIONS', 'QUALITY CONVOS', 'PROCESS CALLS', 'HANDOFF']} />
    <Labels labels={beat.labels} />
  </AbsoluteFill>
);

const TargetsBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const rows = [
    'Dials reviewed',
    'Connections checked',
    'Quality conversations scored',
    'Next coaching action',
  ];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <Panel style={{position: 'absolute', left: 250, top: 135, width: 1100, height: 650, padding: 56, boxSizing: 'border-box'}}>
        <Text size={56} center>COACHING WORKSHEET</Text>
        <div style={{marginTop: 48}}>
          {rows.map((row, i) => (
            <div key={row} style={{height: 96, display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'center', borderBottom: i === rows.length - 1 ? 'none' : `5px solid ${INK}`}}>
              <div style={{width: 42, height: 42, borderRadius: 12, background: i === rows.length - 1 ? YELLOW : WHITE, border: `5px solid ${INK}`}} />
              <Text size={38}>{row}</Text>
            </div>
          ))}
        </div>
      </Panel>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const ReportCardBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const rows = [
    ['Dial Count', 'A-'],
    ['Connection Rate', 'C'],
    ['Quality Conversations', 'B+'],
    ['Process Calls', 'D+'],
    ['Offers Made', 'C-'],
    ['Contracts Signed', 'B'],
  ];
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      <div style={{position: 'absolute', left: 215, top: 104, width: 1170, height: 690, borderRadius: 22, background: CREAM, border: `9px solid ${INK}`, boxSizing: 'border-box'}}>
        <div style={{position: 'absolute', left: 60, top: 42, right: 60, height: 92, border: `5px solid ${INK}`, display: 'grid', gridTemplateColumns: '1fr 245px', alignItems: 'center', padding: '0 34px', boxSizing: 'border-box'}}>
          <Text size={56}>KPI REPORT CARD</Text>
          <Text size={40} center>GRADE</Text>
        </div>
        <div style={{position: 'absolute', left: 60, top: 170, right: 60, bottom: 34}}>
          {rows.map((r, i) => (
            <div key={r[0]} style={{position: 'absolute', left: 0, top: i * 76, width: '100%', height: 76, borderBottom: i === rows.length - 1 ? 'none' : `5px solid ${INK}`, display: 'grid', gridTemplateColumns: '1fr 245px', alignItems: 'center'}}>
              <Text size={36} style={{paddingLeft: 36}}>{r[0]}</Text>
              <div style={{height: 58, width: 138, justifySelf: 'center', borderRadius: 17, background: i === 0 ? YELLOW : WHITE, border: `5px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Text size={42} center>{r[1]}</Text>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const PrinciplesBeat: React.FC<{beat: Beat}> = ({beat}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {['NOT MICROMANAGE', 'NOT PUNISH'].map((t, i) => (
        <div key={t} style={{position: 'absolute', left: 180 + i * 520, top: 235, width: 420, height: 145, borderRadius: 18, background: CREAM, border: `6px solid ${INK}`, transform: `rotate(${i ? 4 : -4}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Text size={44} center>{t}</Text>
          <div style={{position: 'absolute', left: 40, right: 40, top: 68, height: 8, background: ORANGE, transform: 'rotate(-12deg)'}} />
        </div>
      ))}
      {['FIND GAPS', 'CLOSE GAPS', 'IMPROVE FASTEST'].map((t, i) => (
        <div key={t} style={{position: 'absolute', left: 250 + i * 360, top: 545, width: 300, height: 115, borderRadius: 18, background: i === 1 ? YELLOW : WHITE, border: `6px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pop(frame, 30, 70 + i * 22)})`}}>
          <Text size={36} center>{t}</Text>
        </div>
      ))}
      <Labels labels={beat.labels} />
    </AbsoluteFill>
  );
};

const beatContent = (beat: Beat, dur: number) => {
  if (beat.mode === 'hero') return <HeroBeat beat={beat} />;
  if (beat.mode === 'gap') return <GapBeat beat={beat} />;
  if (beat.mode === 'gauges') return <GaugeBeat beat={beat} />;
  if (beat.mode === 'pipeline') return <PipelineBeat beat={beat} />;
  if (beat.mode === 'dial') return <DialBeat beat={beat} />;
  if (beat.mode === 'dialQuality') return <StillBeat beat={beat} dur={dur} />;
  if (beat.mode === 'connection') return <ConnectionBeat beat={beat} />;
  if (beat.mode === 'quality') return <QualityBeat beat={beat} />;
  if (beat.mode === 'process') return <ProcessBeat beat={beat} />;
  if (beat.mode === 'offers') return <OffersBeat beat={beat} dur={dur} />;
  if (beat.mode === 'contracts') return <ContractsBeat beat={beat} />;
  if (beat.mode === 'breakdown') return <BreakdownBeat beat={beat} />;
  if (beat.mode === 'funnelHealth') return <FunnelHealthBeat beat={beat} />;
  if (beat.mode === 'targets') return <TargetsBeat beat={beat} />;
  if (beat.mode === 'reportcard') return <ReportCardBeat beat={beat} />;
  if (beat.mode === 'principles') return <PrinciplesBeat beat={beat} />;
  return <StillBeat beat={beat} dur={dur} />;
};

const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'] as const;
  const seed = (prev.tag.charCodeAt(1) || 0) + (next.tag.charCodeAt(2) || 0);
  return {presentation: slide({direction: dirs[seed % dirs.length]}), frames: T};
};

export const Lesson12A: React.FC = () => {
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

export const LESSON_12A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

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
  interpolate,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {fade} from '@remotion/transitions/fade';
import {loadFont as loadBaloo} from '@remotion/google-fonts/Baloo2';
import manifest from '../public/lesson4A/manifest.json';

// PLAYBOOK 7.8: custom TSX text MUST use the loadFont handle — a bare `fontFamily: 'Baloo 2'`
// silently falls back to serif in the render bundle. Same source as Sticker.tsx.
const baloo = loadBaloo();

/**
 * Lesson4A "Sales Pipeline & Stage Ownership" (Module 04) — audio = master clock (one master.m4a).
 *
 * TEXT-DENSITY v2 (Option B, Jarrad `walk` 2026-07-05): the previous cut stacked the full six-pill row
 * PLUS layered annotations (four qualify checks, a six-row CRM card, four ownership verbs, EXIT captions,
 * double brackets) on top of every beat — all of it re-typing Andrea's narration. That was the "slop."
 * Now: the full six-stage pipeline row (PipelinePills) appears ONLY on the two MAP beats — b02 overview
 * ("here are the six stages", built L→R) and b09 ownership ("here's what you own", 1-4 yellow / 5-6 cream
 * + one bracket + one caption). Every TEACHING beat shows just its vignette art + Andrea's voice + a
 * SINGLE active-stage pill ("3 · DISCOVERY", SingleStagePill) — the only per-beat text. Everything the
 * voice already says is gone.
 *
 * All motion is Remotion code (Jarrad `walk`: ZERO Seedance repaints). Grok anim clips + full-body
 * Andrea clips composite as alpha ProRes. Cafe-Andrea hero bookends (b01 +badge / b10). FACE-ONLY
 * headset corner circle on b02 / b09.
 * Transitions: fade at hero boundaries, deterministic horizontal slides otherwise. Seed =
 * charCodeAt(1)+charCodeAt(2) (1A formula, PLAYBOOK 7.13 — NOT the LessonB/C charCodeAt(3) bug).
 */

const BLUE = '#62b3f3';
const YELLOW = '#FFD23F';
const CREAM = '#FFF7DE';
const INK = '#111111';

type LabelItem = {text: string; delay: number};

type Beat = {
  tag: string;
  mode: string; // hero | pipeline | crm
  stage: number; // 1-6 active node; 0 = ownership recap
  still?: string;
  hero?: string;
  heroFrames?: number;
  circle?: string;
  videos?: string[]; // P1 anim clip (alpha)
  videoFrames?: number[];
  andrea?: string; // P2 full-body Andrea clip (alpha)
  andreaCut?: number; // frame where P1 → P2
  label?: string;
  labelDelay?: number;
  exit?: string;
  exitDelay?: number;
  checkLabels?: LabelItem[]; // b04
  crmFields?: LabelItem[]; // b05b
  recap?: LabelItem[]; // b09
  badge?: boolean;
  durationInFrames: number;
};

// ---------- BMH badge (standing rule: opening scene of every module) ----------
const BmhBadge: React.FC = () => (
  <Img
    src={staticFile('lessonA/bmh-endcard.png')}
    style={{position: 'absolute', width: 130, right: 36, bottom: 30, opacity: 0.95}}
  />
);

// ---------- Andrea corner circle (LessonB AndreaCircle) — FACE ONLY (head-and-shoulders) ----------
// Source is 1280x720 full-BODY Andrea on a ~480px-wide blue strip centered at x≈630. MEASURED from a
// native frame (not guessed): hair-top ≈ y35, chin ≈ y200, so the HEAD CENTER is ≈ (630, 120) — the old
// y=210 was her shoulders, which shoved the head up out of the circle. Zoom is only ~1.2× now (was 1.9×,
// which upscaled a small region into mush AND cropped her hair). We frame ~283px of source (hair-top →
// mid-torso) into the 340 circle: head-and-shoulders, crisp, nothing clipped.
const CIRCLE = 340;
const HEAD_SRC_X = 630; // head center x in the 1280-wide source (measured)
const HEAD_SRC_Y = 165; // framing center — between head (y120) and shoulders (y230) so both fit w/ margin
const CIRCLE_ZOOM = 1.2; // source region ≈ 283px → 340 circle (mild 1.2× upscale, stays crisp)
const AndreaCircle: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const bob = 5 * Math.sin((2 * Math.PI * frame) / 150);
  const VW = 1280 * CIRCLE_ZOOM; // displayed clip width
  const VH = 720 * CIRCLE_ZOOM; // displayed clip height (aspect kept)
  // place the head center at the middle of the circle
  const left = CIRCLE / 2 - HEAD_SRC_X * CIRCLE_ZOOM;
  const top = CIRCLE / 2 - HEAD_SRC_Y * CIRCLE_ZOOM;
  // Lift the circle so its bottom clears BOTH the pill row (PILL_Y ≈ 764) AND the b09 ownership-bracket
  // labels that sit ~y=652 under pills 5-6: bottom of circle ≈ 634 (PILL_Y - CIRCLE - 130 + 340).
  const circleTop = PILL_Y - CIRCLE - 130;
  return (
    <div
      style={{
        position: 'absolute',
        left: 1600 - CIRCLE - 60,
        top: circleTop,
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
      {/* zoom onto her head-and-shoulders only (face, not full body) */}
      <OffthreadVideo
        muted
        src={staticFile(src)}
        style={{position: 'absolute', width: VW, height: VH, left, top}}
      />
    </div>
  );
};

// ============================================================================
// PIPELINE PILLS — the core diagram (v2: bottom-pill layout, no top track).
// Six small Sticker-style white pills run along the BOTTOM of the frame (number-over-name).
// A yellow lead token rides ABOVE the active pill. Active=yellow / done=cream / future=dim white;
// stages 5-6 = cream when active (other-team). Ownership brackets sit ABOVE the pill row (b09).
// ============================================================================
const NODES = [
  {n: 1, name: 'LEAD CAPTURE'},
  {n: 2, name: 'QUALIFICATION'},
  {n: 3, name: 'DISCOVERY'},
  {n: 4, name: 'HANDOFF'},
  {n: 5, name: 'OFFER REVIEW'},
  {n: 6, name: 'CONTRACT'},
];
const PILL_MARGIN = 40;
const PILL_GAP = 14;
const PILL_W = (1600 - 2 * PILL_MARGIN - (NODES.length - 1) * PILL_GAP) / NODES.length; // ≈ 240
const PILL_H = 92;
const PILL_Y = 900 - PILL_H - 44; // bottom row baseline (top of pill ≈ y=764)
const TOKEN_R = 24;

const pillCenterX = (i: number) => PILL_MARGIN + i * (PILL_W + PILL_GAP) + PILL_W / 2;

const PipelinePills: React.FC<{
  stage: number; // 1-6 active; 0 = ownership (whole track lit, no single token)
  popStagger?: boolean; // b02: pills build in L→R
  tokenDelay?: number; // frame the token drops onto the active pill
  brackets?: boolean; // b09 ownership brackets (above the pills)
}> = ({stage, popStagger, tokenDelay = 0, brackets}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const activeIdx = stage - 1; // -1 when stage=0

  return (
    <div style={{position: 'absolute', top: 0, left: 0, width: 1600, height: 900}}>
      {NODES.map((node, i) => {
        const isActive = stage !== 0 && i === activeIdx;
        const isDone = stage !== 0 && i < activeIdx;
        const otherTeam = i >= 4; // pills 5-6 = acquisition/transaction
        let bg = '#ffffff';
        let opacity = 1;
        if (stage === 0) {
          bg = i < 4 ? YELLOW : CREAM; // ownership: 1-4 YOU (yellow), 5-6 dim cream
          opacity = i < 4 ? 1 : 0.85;
        } else if (isActive) {
          bg = otherTeam ? CREAM : YELLOW;
        } else if (isDone) {
          bg = CREAM;
        } else {
          bg = '#ffffff';
          opacity = 0.55; // future = dim
        }
        const popDelay = popStagger ? i * 6 : 0;
        const pop = spring({frame: frame - popDelay, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 16});
        const activeBump = isActive
          ? 1 + 0.06 * Math.max(0, Math.min(1, spring({frame: frame - tokenDelay, fps, config: {damping: 12, stiffness: 170}, durationInFrames: 14})))
          : 1;
        const cx = pillCenterX(i);
        return (
          <div
            key={node.n}
            style={{
              // LOCKED Sticker V1 look: white card, no border, soft shadow, black Baloo2 text
              position: 'absolute',
              left: cx - PILL_W / 2,
              top: PILL_Y,
              width: PILL_W,
              height: PILL_H,
              borderRadius: 18,
              background: bg,
              opacity: Math.min(opacity, popStagger ? Math.min(1, pop * 1.4) : 1),
              transform: `scale(${(popStagger ? 0.8 + 0.2 * Math.max(0, Math.min(1, pop)) : 1) * activeBump})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 22px rgba(0,0,0,0.14)',
              fontFamily: baloo.fontFamily,
            }}
          >
            <div style={{fontWeight: 800, fontSize: 34, color: INK, lineHeight: 1}}>{node.n}</div>
            <div style={{fontWeight: 700, fontSize: 17, color: INK, marginTop: 3, textAlign: 'center', padding: '0 6px', letterSpacing: 0.2}}>
              {node.name}
            </div>
          </div>
        );
      })}

      {stage !== 0 ? <LeadToken idx={activeIdx} delay={tokenDelay} /> : null}
      {brackets ? <OwnershipBrackets /> : null}
    </div>
  );
};

const LeadToken: React.FC<{idx: number; delay: number}> = ({idx, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const drop = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 150}, durationInFrames: 18});
  const cx = pillCenterX(idx);
  const bob = 3 * Math.sin((2 * Math.PI * frame) / 90);
  // token drops down onto the top edge of the active pill
  const y = interpolate(Math.max(0, Math.min(1, drop)), [0, 1], [PILL_Y - 78, PILL_Y - 30]);
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - TOKEN_R,
        top: y + bob,
        width: TOKEN_R * 2,
        height: TOKEN_R * 2,
        borderRadius: '50%',
        background: YELLOW,
        border: '4px solid #111',
        opacity: Math.min(1, drop * 1.5),
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
      }}
    />
  );
};

// ownership bracket (b09) — ONE text-free yellow bracket hugging the four stages YOU own (1-4),
// drawn just above the pill row. No labels: the single "YOU OWN STAGES 1 → 4" caption says it once,
// and the pill recolor (1-4 yellow / 5-6 cream) carries the rest visually. (The old version added a
// "YOU" label AND a second "ACQUISITION + TRANSACTION" bracket — both re-typed the narration.)
const OwnershipBrackets: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 8, fps, config: {damping: 13, stiffness: 150}, durationInFrames: 18});
  const op = Math.min(1, s * 1.4);
  const bTop = PILL_Y - 40;
  const youL = pillCenterX(0) - PILL_W / 2;
  const youR = pillCenterX(3) + PILL_W / 2;
  return (
    <>
      <div style={{position: 'absolute', top: bTop, left: youL, width: youR - youL, height: 8, background: YELLOW, opacity: op, borderRadius: 4}} />
      {/* legs point DOWN toward the pills */}
      <div style={{position: 'absolute', top: bTop, left: youL, width: 8, height: 20, background: YELLOW, opacity: op, borderRadius: 4}} />
      <div style={{position: 'absolute', top: bTop, left: youR - 8, width: 8, height: 20, background: YELLOW, opacity: op, borderRadius: 4}} />
    </>
  );
};

// vignette region — the full upper area above the pill row (y ≈ 120–720), bigger & centered
// Full-frame vignette: the still IS the frame (1600x900, 16:9), shown edge-to-edge so NOTHING is cropped.
// (The old version windowed the art to top=120/height=600 and cut 150px off the top AND bottom of every
// still — Jarrad flagged it as "things are cut off.") A gentle Ken-Burns push (1.0→1.035 from center)
// adds life but only ever tightens IN from a fully-visible start, so the first frame of every beat shows
// the whole illustration. Stills are bg-normalized to canonical blue, so the edges match the frame. The
// single stage pill floats in the art's bottom blue margin, below the subject.
const Vignette: React.FC<{still?: string; dur: number}> = ({still, dur}) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, dur], [1.0, 1.035], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (!still) return null;
  return (
    <Img
      src={staticFile(still)}
      style={{position: 'absolute', width: 1600, height: 900, top: 0, left: 0, transform: `scale(${push})`, transformOrigin: 'center center'}}
    />
  );
};

// ---------- SINGLE active-stage pill (Option B: the ONLY per-beat text on teaching beats) ----------
// One "N · NAME" chip, bottom-center, over the vignette art. Yellow for the four stages YOU own (1-4),
// cream for the acquisition/transaction stages (5-6) — same ownership color code as the map-beat row.
// Pops (word-timed to the stage-name mention via `delay`) and holds. Replaces the persistent six-pill
// row on every non-map beat, and all the annotation overlays that used to echo the narration.
const SingleStagePill: React.FC<{stage: number; delay?: number}> = ({stage, delay = 8}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (stage < 1 || stage > NODES.length) return null;
  const node = NODES[stage - 1];
  const s = spring({frame: frame - delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 20});
  const k = Math.max(0, Math.min(1, s));
  return (
    <div style={{position: 'absolute', bottom: 56, left: 0, width: 1600, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          // Sticker V1 (LOCKED, Jarrad 2026-07-03): plain WHITE card, black Baloo2, soft shadow, no
          // outline — the SAME text system every other module uses. (Was yellow/cream; Jarrad flagged the
          // inconsistency. Ownership color-coding lives on the map beats, not on these labels.)
          transform: `scale(${0.9 + 0.1 * k})`,
          opacity: Math.min(1, s * 1.4),
          background: '#ffffff',
          borderRadius: 18,
          padding: '10px 30px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          fontFamily: baloo.fontFamily,
          color: INK,
          whiteSpace: 'nowrap',
          boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
        }}
      >
        <span style={{fontWeight: 800, fontSize: 40, lineHeight: 1}}>{node.n}</span>
        <span style={{fontWeight: 700, fontSize: 34, letterSpacing: 0.3}}>{node.name}</span>
      </div>
    </div>
  );
};

// ============================================================================
// BEAT RENDERERS
// ============================================================================

const HeroBeat: React.FC<{beat: Beat}> = ({beat}) => (
  <AbsoluteFill style={{backgroundColor: BLUE}}>
    {beat.hero ? (
      <OffthreadVideo muted transparent src={staticFile(beat.hero)} style={{position: 'absolute', width: 1600, height: 900}} />
    ) : null}
    {beat.badge ? <BmhBadge /> : null}
  </AbsoluteFill>
);

// MAP beats: the only two beats that show the FULL six-stage pipeline row — b02 (overview: "six
// stages", built L→R) and b09 (ownership: 1-4 yellow / 5-6 cream + bracket + one caption). Every other
// beat is a teaching beat → single active-stage pill only.
const MAP_BEATS = new Set(['b02_overview', 'b09_ownership']);

// ---------- pipeline beat: vignette/clips + (map row OR single pill) + optional circle ----------
const PipelineBeat: React.FC<{beat: Beat; dur: number}> = ({beat, dur}) => {
  const isOwnership = beat.stage === 0;
  const isMap = MAP_BEATS.has(beat.tag);
  const twoPhase = !!beat.andrea && !!beat.videos && beat.videos.length > 0;
  const cut = beat.andreaCut ?? Math.round(dur * 0.45);
  const p1Len = beat.videoFrames?.[0] ?? cut;
  // Andrea takes over exactly when the anim clip ENDS (or at the designed cut, whichever is earlier).
  // The anim clips (361f@24fps ≈ 451 frame-slots / 193f ≈ 241) end BEFORE their old cut (713/284), which
  // left a blank-blue gap mid-beat (QC 2026-07-05). p1End closes it; Andrea clips are long enough to cover.
  const p1End = Math.min(cut, p1Len);

  return (
    <AbsoluteFill style={{backgroundColor: BLUE}}>
      {twoPhase ? (
        <>
          <Sequence from={0} durationInFrames={p1End}>
            <OffthreadVideo muted transparent src={staticFile(beat.videos![0])} style={{position: 'absolute', width: 1600, height: 900}} />
          </Sequence>
          <Sequence from={p1End} durationInFrames={dur - p1End}>
            {/* shrink full-body Andrea (94%) and drop her a touch so her head clears the single pill */}
            <OffthreadVideo
              muted
              transparent
              src={staticFile(beat.andrea!)}
              style={{position: 'absolute', width: 1440, height: 810, left: 80, top: 18}}
            />
          </Sequence>
        </>
      ) : null}

      {!twoPhase && beat.still ? <Vignette still={beat.still} dur={dur} /> : null}

      {/* MAP beats get the full pipeline row; teaching beats get one active-stage pill. */}
      {isMap ? (
        <PipelinePills
          stage={beat.stage}
          popStagger={beat.tag === 'b02_overview'}
          tokenDelay={beat.tag === 'b02_overview' ? (beat.labelDelay ?? 8) : 0}
          brackets={isOwnership}
        />
      ) : (
        <SingleStagePill stage={beat.stage} delay={beat.labelDelay ?? 8} />
      )}

      {beat.circle ? <AndreaCircle src={beat.circle} /> : null}

      {/* b09 ownership: the ONE surviving caption ("YOU OWN STAGES 1 → 4"). It's the beat's punchline
          and pairs with the yellow recolor + bracket of pills 1-4. No other captions anywhere — the
          voice says the rest. Sits upper-center, clear of the circle and the pill row. */}
      {beat.tag === 'b09_ownership' && beat.label ? (
        <div style={{position: 'absolute', top: 300, left: 0, width: 1600, display: 'flex', justifyContent: 'center'}}>
          <SummaryPill text={beat.label} delay={beat.labelDelay ?? 8} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const SummaryPill: React.FC<{text: string; delay: number}> = ({text, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 20});
  return (
    <div
      style={{
        transform: `scale(${Math.max(0, Math.min(1, s))})`,
        opacity: Math.min(1, s * 1.4),
        background: '#ffffff',
        borderRadius: 18,
        padding: '10px 30px',
        fontFamily: baloo.fontFamily,
        fontWeight: 800,
        fontSize: 48,
        color: INK,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
      }}
    >
      {text}
    </div>
  );
};

// (b05b's old CRM-card beat is retired — it now holds the discovery vignette + a single pill, so it
// routes through PipelineBeat like every other teaching beat. Its manifest `mode` is now "pipeline".)

// ---------- transitions: fade at hero boundaries; horizontal slides otherwise.
// Seed = charCodeAt(1)+charCodeAt(2) (1A formula — PLAYBOOK 7.13, NOT charCodeAt(3)).
const T = 13;
const pickTransition = (prev: Beat, next: Beat) => {
  if (prev.mode === 'hero' || next.mode === 'hero') return {presentation: fade(), frames: T};
  const dirs = ['from-left', 'from-right'] as const;
  const seed = (prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length;
  return {presentation: slide({direction: dirs[seed]}), frames: T};
};

const beatContent = (b: Beat, dur: number) => {
  if (b.mode === 'hero') return <HeroBeat beat={b} />;
  return <PipelineBeat beat={b} dur={dur} />;
};

export const Lesson4A: React.FC = () => {
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

export const LESSON_4A_FRAMES: number = (manifest as {totalFrames: number}).totalFrames;

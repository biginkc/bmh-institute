import {DEFAULT_LOGO_CALLOUT_DURATION_FRAMES, type LogoCalloutItem} from './LogoCallout';

const FPS = 30;
const sec = (value: number) => Math.round(value * FPS);

// Source of truth:
// ~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md
// section "## Slot 03 — Tech Stack (Ch8)".
//
// These are overlay-only callouts for the real Tech Stack lesson assembly.
// Do not use Remotion to draw or animate the scene visuals.
export const TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES = DEFAULT_LOGO_CALLOUT_DURATION_FRAMES;

export const TECH_STACK_LOGO_CALLOUTS: LogoCalloutItem[] = [
  {slug: 'sandra', name: 'Sandra', startFrame: sec(45.14), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'propstream', name: 'PropStream', startFrame: sec(94.198), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'dealmachine', name: 'DealMachine', startFrame: sec(134.191), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'deal_sniper', name: 'Deal Sniper', startFrame: sec(163.631), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'dialpad', name: 'Dialpad', startFrame: sec(195.944), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'closer_lab', name: 'Closer Lab', startFrame: sec(236.095), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'slack', name: 'Slack', startFrame: sec(297.091), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'hubstaff', name: 'Hubstaff', startFrame: sec(305.241), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'bmh_institute', name: 'BMH Institute', startFrame: sec(342.674), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'google_docs', name: 'Google Docs', startFrame: sec(360.176), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
  {slug: 'google_drive', name: 'Google Drive', startFrame: sec(371.35), durationFrames: TECH_STACK_LOGO_CALLOUT_DURATION_FRAMES},
];

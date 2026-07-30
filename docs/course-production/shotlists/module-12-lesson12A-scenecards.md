# Module 12 - Lesson 12A "KPIs & Sales Telemetry" scene cards (2026-07-07)

Script: `lesson-12A-script-clean.txt` (locked master Slot 16, `Chapter 11 - FINAL.srt`, cues 1-16, with Jarrad-directed evergreen deviations for v5). Format follows `scene-card-v2.md` with later guide/playbook overrides: Andrea voice speed stays `1.0`; all text is code-rendered via `Sticker`; no text is baked into generated stills.

**Current gate:** v5 render must stop at Claude QC. Do not self-declare final; Jarrad watch-through remains the final gate after Claude QC.

## Source cleanup
- SRT cue numbers, timestamps, blank lines, and code fences stripped.
- No stage directions were present.
- Andrea narrator wording was changed only where Jarrad directed evergreen, role-agnostic edits.
- Diff artifact: `lesson-12A-source-clean-vs-master.diff`.
- v5 master deviations: role-variable targets and benchmark ratios removed from b06, b07, b08, b09, and b12; the role-specific target beat was removed; the old next-topic teaser was replaced with a neutral lesson close.

## Scope call
This remains one cohesive lesson. I do **not** recommend an A/B split because cues 5-14 build one left-to-right metric funnel, and cues 15-16 close the same idea by explaining how coaching uses the numbers. Splitting it would either strand half the funnel or repeat the setup.

## Cast and visual rules
- Narrator = Andrea: cafe hero bookends (`b2cd0545...`) on b01 and b18. Opening beat carries `<BmhBadge/>` lower-right and no labels/stickers.
- KPI visuals are primarily code-rendered charts, counters, dashboards, funnels, diagnostic rows, and callout labels.
- Generated stills are reserved for behavior/coaching context, not for the KPI numbers themselves.
- Remotion owns all text, numeric targets, dials/connections/conversation labels, gauges, funnels, dashboards, and warning states.
- Do not generate or bake text into stills. Every number and label appears later via `Sticker`/code overlays.
- Seedance only animates approved illustrated scene beats later; pure dashboards stay code-driven.
- Transitions later: slide/camera-travel between teaching beats; fade only into b01 and out of b18.

## Storyboard

| Beat | Cue | Andrea mode | Transcript context | Visual idea | Motion / assembly plan | Text via Sticker/code (trigger) |
|---|---|---|---|---|---|---|
| b01_numbers_work | 1 | hero-cafe + BMH badge | "how we know if any of that is actually working" / "feelings don't close deals. Numbers do." | Cafe Andrea opener on cornflower blue. | HeyGen hero; BMH badge on opener; fade in only at open. | none; clean opener |
| b02_gaps_not_guesses | 2 | voice-only | "look at their numbers, figure out where the gaps are, and fix them" / "guesses and hopes" | Code split-screen: left side soft "busy feeling" activity blur; right side clean gap-fix board with a highlighted broken segment getting repaired. | Pure Remotion diagram. No still needed unless Jarrad wants a human behavior plate. | `LOOK AT THE NUMBERS` (numbers), `FIND THE GAP` (gaps), `FIX IT` (fix) |
| b03_kpi_definition | 3 | corner-circle | "KPI stands for Key Performance Indicator" / "dashboard in your car" / "fuel gauge is on empty" | Car-dashboard metaphor as a code-rendered gauge cluster: fuel/health gauge, KPI label, strength/fix zones. Andrea circle stays bottom-right. | Pure Remotion gauges/counters with word-timed needle moves. | `KEY PERFORMANCE INDICATOR` (KPI), `NEEDS FIXING` (fixing) |
| b04_flying_blind | 4 | voice-only | "flying blind" / "busy and productive are two completely different things" | Doodle still: **Priya/BMH rep** standing upright in open space, wearing dark sunglasses and holding a white walking stick/cane. No desk, no chair, no table, no computer, no monitor, no dashboard screen. | Use static still or subtle push-in only. Priya identity lock: black back ponytail, orange headset/headband, yellow top, cream pants. | `BUSY IS NOT PRODUCTIVE` (productive), `KPIs SEPARATE THEM` (separates) |
| b05_six_metrics_funnel | 5 | voice-only | "six metrics" / "from left to right" / "trace it back to exactly where it broke" | Full-width code pipeline/funnel with six empty stages from lead entry to signed contract; one broken segment can pulse later. | Pure Remotion pipeline; all stage names code-rendered. | `6 METRICS` (six), `LEFT TO RIGHT` (left), `TRACE THE BREAK` (broke) |
| b06_dial_count | 6 | voice-only | "first metric is dial count" / "clearest measures of outbound effort" / "real effort and consistency" | Role-agnostic effort visual: outbound-call bars and a checklist of controllable actions. No fixed counters, ranges, or targets. | Pure Remotion effort bars and checklist. | `DIAL COUNT` (dial count) |
| b07_dial_quality | 7 | voice-only | "strict dial count as the goal by itself" / "speed-dialing" / "No real conversations. No quality." | Approved Priya phone still only, no clock/keypad overlays and no popup labels. | Static still with subtle push-in only. | none |
| b08_connection_rate | 8 | voice-only | "connection rate" / "phone number is getting flagged as spam" / "stale" / "bad times" | Generic connection flow from dials to pickups with an issue list. No fixed percentages, counts, thresholds, or target cards. | Pure Remotion flow cards; issue list appears once and holds. | `CONNECTION RATE` (connection), `FLAG IT` (flag) |
| b09_quality_conversations | 9 | voice-only | "quality conversations" / "genuinely want to sell" / filters out wrong numbers, people who ask to be removed, and zero-interest calls | Funnel bars with text inside the bars: picked up, wrong number out, DNC out, zero interest out, quality conversation. No bottom-center popup labels. | Pure Remotion funnel animation that plays once and holds. | none |
| b10_process_calls | 10 | voice-only | "process calls" / "full fact find" / "coaching moment" / "call recordings" | Code process-call panel: checklist fills, then a call-recording waveform appears when process calls lag. | Pure Remotion checklist/waveform; no still required. | `PROCESS CALLS` (process), `COACHING MOMENT` (coaching) |
| b11_offers_made | 11 | voice-only | "offers made" / "tracked on their side" / "quality of leads you're handing off" | Approved handoff/offer-desk still with no counter overlay or target-looking number. | Still with subtle push-in. | `LOOK INTO IT` (looking) |
| b12_contracts_signed | 12a | voice-only | "contracts signed" / "negotiation or pricing process" | Simple clean contract document titled `CONTRACT`, with signature and seal. No folded corner, ratios, benchmarks, or numeric callouts. | Pure Remotion contract document. | `CONTRACTS SIGNED` (contracts) |
| b13_breakdown_map | 12b | voice-only | "pinpoint exactly where the breakdown is happening" / the six diagnostic examples | Full left-to-right diagnostic map. Each scenario lights the failing stage: low dials, low connections, few quality conversations, few process calls, few offers, few contracts. | Pure Remotion map; one row lights per spoken problem. | `PINPOINT THE BREAKDOWN` (pinpoint), stage-specific alerts timed to each "Low/Good..." phrase |
| b14_funnel_health | 13 | voice-only | "Each step narrows the funnel" / "stages you control" / "dials through handoff" | Large clean funnel narrowing from dials to handoff, with the controlled portion bracketed from dials through handoff. | Pure Remotion funnel. | `KEEP THE FUNNEL HEALTHY` (healthy), `YOU CONTROL: DIALS -> HANDOFF` (control) |
| b16_coaching_questions | 15a | voice-only | "where's the gap" / "pull up your recordings and listen together" / "whole point of tracking" | **Report card / scorecard still with visible code-rendered grades**: six KPI category rows and a grade column showing a clear A/B/C/D spread. | Use the approved report-card still as the base; code-render the row labels and grade letters in Remotion. | `WHERE'S THE GAP?` (gap), `WHAT DO WE DO ABOUT IT?` (what do we do) |
| b17_embrace_numbers | 15b | hero-cafe | "Not to micromanage. Not to punish. To find the gaps and close them." / "know your numbers" | Andrea avatar speaking clip, no labels. | HeyGen avatar clip from existing b17 audio. | none |
| b18_final_close | 16 | hero-cafe | "I hope this information was helpful for you" / "I'll see you in the next lesson" | Cafe Andrea close on blue, no labels and no topic tease. | HeyGen hero clip regenerated from new b18 audio; fade out only at close. | none |

## Planned stills after approval
- `m12_L12A_b04_flying-blind_priya-standing-cane-redo.png` - APPROVED by Jarrad: Priya/BMH rep standing in open space, not at a desk, with sunglasses and a white walking stick/cane. No computers, monitors, dashboards, desks, chairs, or tables.
- `m12_L12A_b07_dial-quality_priya-phone-front-v5.png` - current B07 still candidate for Jarrad review: Priya/BMH rep speed-dialing with pure-white face/hands, phone centered directly in front of Priya on the desk, keypad reachable from her side, blank documents on left/right, and visible clock. Do not reuse the old `m12_L12A_b07_dial-quality_priya.png`, `m12_L12A_b07_dial-quality_priya-front.png`, or crude `m12_L12A_b07_dial-quality_priya-phone-front-controlled.*` start frames.
- `m12_L12A_b11_offers-made.png` - optional acquisition handoff/offer desk if the code panel needs a human anchor.
- `m12_L12A_b16_report-card.png` - blank report-card / scorecard base still.
- `m12_L12A_b16_report-card_grades-preview.png` - code-rendered review preview with six KPI categories and visible A/B/C/D grades.

## Pure code beats after approval
- b02: gaps vs guesses split-screen.
- b03: KPI car-dashboard gauge cluster.
- b05: six-metric left-to-right funnel.
- b06: dial count counter and control columns.
- b08: connection-rate conversion and warning branch.
- b09: quality-conversation filter funnel.
- b10: process-call checklist and call-recording waveform.
- b12: clean contract document.
- b13: breakdown diagnostic map.
- b14: controlled-stage funnel.

## Andrea clips after approval
- b01 cafe Andrea opening, with BMH badge.
- b03 and b16 headset/corner-circle source clips, if using Andrea circle over the dashboard/coaching beats.
- b18 cafe Andrea neutral closing.

## Animation candidates after still approval
- b04 flying blind: approved still only for now; no desk/computer/dashboard screen.
- b07 dial quality:
  - v1 rejected by Jarrad: `course-assets/scenes/module-12/m12_L12A_b07_dial-quality_seedance-v1.mp4` (Higgsfield job `59c19495-4306-43d3-a703-d6940229ea28`, 4.04s, 1280x720, 24fps). Reason: skin tone drift; too short / not loopable enough.
  - v2 rejected by Jarrad: `course-assets/scenes/module-12/m12_L12A_b07_dial-quality_seedance-v2-loop.mp4` (Higgsfield job `dc271951-0c81-4daa-ae9d-542a2ae59688`, 12.04s, 1280x720, 24fps). Reasons: skin tone still wrong; phone and documents face away / wrong staging.
  - v3 rejected by Jarrad: `course-assets/scenes/module-12/m12_L12A_b07_dial-quality_seedance-v3-loop15.mp4` (Higgsfield job `ac5bd1ba-ab8f-40a2-a081-43baf65907e7`, 15.04s, 1280x720, 24fps). Reason: source still put the phone in a camera-facing position that did not look physically usable by Priya.
  - v4 rejected by Jarrad: Higgsfield job `70eb5d3f-e450-4da0-89e1-ad50221e7695`. Reason: generated from crude hand-built control frame; unacceptable visual quality even though the phone orientation was forced. Do not use `m12_L12A_b07_dial-quality_priya-phone-front-controlled.*` as a production source.
  - v5 still candidate: `course-assets/scenes/module-12/m12_L12A_b07_dial-quality_priya-phone-front-v5.png`. Do not animate until Jarrad approves the still.
- b11 offers made: only if using a generated handoff desk still; subtle packet/desk motion.
- b16 coaching questions: no character animation planned after redline; use static report-card still with code overlays.

All animation must use Seedance triple-clamp with style refs after approval. If Higgsfield/MCP is unavailable, use static stills with code push-in and flag the fallback.

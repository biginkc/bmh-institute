# Module 04 - Lesson 4B - "The Five-Step Conversation Framework"

**Created 2026-07-05.** Chapter 4 / Slot 06 overflow teaching video. Storyboard/still status:
APPROVED TO MOVE FORWARD after Jarrad's B7 correction request was applied. Format: scene-card-v2.
Reference: Lesson 4A diagram-spine, but all paths are 4B-scoped.

Script: `lesson-4B-script-clean.txt` from locked master Slot 06 cues 13-17, about 430 words / about
2:31 before pacing gaps. The outro is the exact master cue 17 handoff to Slot 07.

Voices planned: Elizabeth-Friendly `55f8c0f5` for body beats; Elizabeth-Excited `91120f72` only if
the approved outro should match 4A's upbeat sendoff.

Avatars planned: Cafe Andrea `b2cd0545` for b01/b09 hero bookends; Headset Andrea `e527528e` for
optional b03/b07 corner-circle emphasis.

Motion stance: animation-heavy. Remotion assembles, times labels, normalizes backgrounds, and handles
transitions only. Subject movement comes from AI-video clips generated from Jarrad-approved stills.
No still, animation clip, or cut is self-approved by Codex.

## Visual Spine

Code-rendered five-step conversation strip on canonical blue `#62b3f3`, mirroring 4A's pipeline strip.
Each node is a white Sticker-style card with code-rendered text only:

1. INTRO
2. FACT FIND
3. PITCH
4. OFFER
5. CLOSE

Active node pops yellow `#FFD23F`; completed nodes turn cream; future nodes dim. A small conversation
token moves left to right. The 80/20 rule is code-rendered as a person-vs-house bar: large person side,
small house side, with all labels rendered in Remotion, not baked into images.

## Beat Table

| Beat | Cue | Mode | Visual | Text trigger |
|---|---|---|---|---|
| b01_bridge | 13a | hero-cafe + BmhBadge | Cafe Andrea picks up from 4A; faint five-step strip enters behind/under her | - |
| b02_step1_intro | 13b | voice-only | Step strip, node 1 active; v1_framework still as AI-video base; cards/tokens subtly move | "STEP 1 / INTRO" on "Step one" |
| b03_step2_factfind | 13c | voice-only | Node 2 active; corrected fact-find still as AI-video base: rep listens/takes notes while seller talks; no floating speech bubble | "STEP 2 / FACT FIND" on "Step two"; "80% LISTEN" on "eighty" |
| b04a_pitch | 13d-a | voice-only | Node 3 active; property/pitch still as AI-video base: rep and seller review a grounded simple house/property visual | "STEP 3 / PITCH" on "Pitch" |
| b04b_offer | 13d-b | voice-only | Node 4 active; offer/handoff still: rep tees up next step/handoff while seller reacts; AI-video animated | "STEP 4 / OFFER" on "Offer"; "TEE UP THE HANDOFF" on "handoff" |
| b05_step5_close | 14 | voice-only | Node 5 active; close-up of BMH representative's face while she talks with headset; AI-video animated | "STEP 5 / CLOSE" on "step five"; "GET COMMITMENT" on "commitment" |
| b06_structure_vs_execution | 15 | voice-only | Pipeline/framework visual as AI-video base; Remotion adds timed labels only | "PIPELINE = WHERE" on "organizational"; "FRAMEWORK = HOW" on "execute" |
| b07_8020_rule | 16a | voice-only | 80/20 person-situation still: seller's real-life situation is primary; no background house icon; AI-video animated | "80% PERSON / 20% HOUSE" on "eighty"; "THE HOUSE IS NOT THE PROBLEM" on "house is not the problem" |
| b08_slow_down | 16b | voice-only | Relationship/care still: exact rep and exact seller in a calm conversation; no racing token; AI-video animated | "SLOW DOWN" on "Slow down"; "CARE FIRST" on "care" |
| b09_outro | 17 | hero-cafe | Cafe Andrea exact master handoff to Slot 07 | - |

## Wordless Still Plan

All stills are planned for `course-assets/scenes/module-04-lesson4B/`, 1600x900, canonical course
doodle style, no baked words, no numbers, no UI text, no ambient filler.

- `m04_L4B_v1_framework.png` - five connected blank conversation cards; no floating phone or speech icon.
- `m04_L4B_v2_factfind_listen_nobubble.png` - BMH rep listening closely while seller talks; notebook with blank lines only; no speech bubble.
- `m04_L4B_v4a_pitch_grounded.png` - Step 3 Pitch: rep and seller review a grounded simple house/property visual; no floating key/card.
- `m04_L4B_v4b_offer_handoff_animated_base.png` - Step 4 Offer: rep tees up next step/handoff while seller reacts; no dollar amount, contract, or blank card.
- `m04_L4B_v5_rep_closeup_headset.png` - Step 5 Close: tight close-up of BMH representative's face while she talks with headset.
- `m04_L4B_v7_person_situation_8020.png` - 80/20 rule: seller's situation is primary, with no house/background icon.
- `m04_L4B_v8_slow_down_care_reroll.png` - slow down/care: exact BMH rep and exact seller in calm relationship-building conversation.

Rejected prior stills:
- `m04_L4B_v4_offer_handoff_locked.png` - confusing floating blank card; does not clearly show the Step 4 offer/handoff.
- `m04_L4B_v5_close_commitment_locked.png` - wide handshake scene; replaced by close-up headset rep.
- `m04_L4B_v6_person_situation_locked.png` - vague seller/phone/tiny-house setup; does not teach the 80/20 rule clearly.
- `m04_L4B_v8_slow_down_care_locked.png` - seller nose/identity drift; do not animate.

## Standing Rules Applied

- 4B owns only `*lesson4B*` / `module-04-lesson4B` paths. Do not write into 4A paths, including
  `course-assets/scenes/module-04/`.
- Full storyboard approval gate before audio, image, HeyGen, Higgsfield, or final assembly spend.
- Text is code-rendered with Remotion Sticker components, never baked into stills.
- Cafe Andrea bookends; BMH badge on open; 1.0s inter-beat gaps at manifest build.
- Visuals must teach the exact current words. No ambient doodles, no generic real-estate filler.
- No floating speech bubbles, cards, phones, calendars, keys, motion marks, or abstract helper props in stills.
  Props must be held, placed on furniture, attached to the scene, or rendered later as Remotion overlays.
- Seller identity: curly black-haired man, orange sweater, cream pants, tiny centered two-stroke/comma nose.
- BMH rep identity: headset woman, black back ponytail, orange/yellow headband, yellow top, cream pants.
- Andrea appears only in narrator/company-avatar beats, not as the seller or homeowner.
- Animation gate: after still approval, run a model bake-off on approved B4 Offer and B5 Close-up stills
  before full animation. Candidate models: `seedance_2_0`, `kling3_0`, `wan2_7`, `minimax_hailuo`,
  `veo3_1_lite`. Jarrad judges the winning model.
- Duration rule: after audio, use `_state.json` beat durations. Cover full beat duration with adjacent
  generated clips as needed; no loops, ping-pong motion, or long static tails.
- Custom video QC required before any delivered cut.

## Status

Storyboard/still gate advanced after Jarrad's B7 background-house removal request was applied. Clean
beat-split script is verified against the master, audio and `_state.json` word timestamps are generated,
cafe-Andrea bookends are generated, and the B4B/B5 animation bake-off package is ready for Jarrad/Claude
judgment. A static Remotion timing draft exists for deterministic review only:
`course-assets/review-lesson4B/LESSON-4B-static-timing-draft.mp4`.

Current gate: Jarrad/Claude chooses the winning animation model from
`module-04-lesson4B-animation-bakeoff.md`; then generate full animation coverage for B2/B3/B4A/B4B/B5/B6/B7/B8.
Codex must not self-approve the stills, animation clips, model choice, or final cut.

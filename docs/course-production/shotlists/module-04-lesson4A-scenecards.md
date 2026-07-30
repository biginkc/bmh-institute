# Module 04 · Lesson 4A — "Sales Pipeline & Stage Ownership"

**Created 2026-07-05.** Chapter 4 / Slot 06 teaching video. Storyboard APPROVED by Jarrad (`walk`).
Format: scene-card-v2. Reference: LessonB / Lesson2A (diagram-spine). 13 beats.
Script: `lesson-4A-script.txt` (master Slot 06 cues 1-12, ~1016 body words + derived outro ≈ 6:44
speech). Diff vs master = EXACT (similarity 1.0 after numeral-spellout normalization; only b10
outro is a flagged deviation, derived from master cue-13 bridge).

Voices: Elizabeth-Friendly `55f8c0f5` (body) · Elizabeth-Excited `91120f72` (b10). speed 1.0.
Avatars: Cafe Andrea `b2cd0545` (b01/b10 hero) · Headset Andrea `e527528e` (b02/b09 circle).
Motion: ALL Remotion code motion, ZERO Seedance (Jarrad `walk`).

## Pipeline diagram spine (code-rendered, Sticker.tsx)
Horizontal six-node track (Sticker V1 white cards, Baloo 2) on #62b3f3. A lead token advances one
node per stage beat (L->R). Active node = yellow #FFD23F pop; done = cream; future = dim. Stages
5-6 tinted cream (other-team). Nodes: 1 LEAD CAPTURE / 2 QUALIFICATION / 3 DISCOVERY / 4 HANDOFF /
5 OFFER REVIEW / 6 CONTRACT. Each stage beat pops a word-timed "EXIT ->" caption (its handoff
criterion). ALL text is code; AI stills are wordless vignettes only.

## Beat table (VO verbatim from master cues 1-12; b10 outro derived from cue 13)
| Beat | Cue | Mode | Visual | Text (trigger) |
|---|---|---|---|---|
| b01_intro | 1 | hero-cafe + BmhBadge | cafe Andrea | - |
| b02_overview | 2+3 | corner-circle | 6-node track builds; token drops node 1 | "6 STAGES" (six) |
| b03a_capture | 4 | voice-only | node1 lit + v1_capture (card->CRM tray) | "STAGE 1 / LEAD CAPTURE" (Capture) |
| b03b_firstcontact | 5 | voice-only | node1 + v2_firstcontact (figure calling) | "EXIT -> a real, live conversation" (conversation) |
| b04_qualify | 6 | voice-only | node2 lit + v3_qualify (checklist+house) | "STAGE 2 / QUALIFICATION"; "EXIT -> owner / fits / motivated" |
| b05a_discovery | 7 | voice-only | node3 lit + v4_discovery (two leaning in) | "STAGE 3 / DISCOVERY" (Discovery) |
| b05b_discovery_exit | 8 | voice-only | node3 + CRM fields fill (code) | "EXIT -> you can explain why they sell" (explain) |
| b06a_handoff | 9a | voice-only | node4 lit + v6_handoff (folder pass) | "STAGE 4 / HANDOFF"; "sloppy handoff kills deals" |
| b06b_handoff_clean | 9b | voice-only | node4 + package slides rep->AM | "EXIT -> acquisitions accepted it" (accepted) |
| b07_offer | 10 | voice-only | node5 lit (cream) + v7_offer (reviewing) | "STAGE 5 / OFFER REVIEW"; "acq team runs this" |
| b08_contract | 11 | voice-only | node6 lit (cream) + v8_contract (sign) | "STAGE 6 / CONTRACT"; "transaction team closes it" |
| b09_ownership | 12 | corner-circle | brackets: 1-4 YOU (yellow), 5-6 dim | "YOU OWN STAGES 1 -> 4" (own) |
| b10_outro | 13* | hero-cafe (Excited) | cafe Andrea | - |

## Wordless Codex vignette stills (7) — course-assets/scenes/module-04/, 1600x900
- m04_L4A_v1_capture.png   — lead card (person icon + blank dash-lines) dropping into CRM tray. [PASS]
- m04_L4A_v2_firstcontact.png — one figure making first contact (phone + signal arcs).
- m04_L4A_v3_qualify.png   — clipboard checklist + house under magnifier. [green-check palette note]
- m04_L4A_v4_discovery.png — two figures leaning in, genuine conversation. [PASS]
- m04_L4A_v6_handoff.png   — rep (cap) passes folder to acquisition manager. [PASS]
- m04_L4A_v7_offer.png     — homeowner reviewing offer doc ($ single symbol). [PASS]
- m04_L4A_v8_contract.png  — contract + pen signing + tiny handshake.

## Standing rules applied
Cafe Andrea opens/closes; BMH badge b01; 1.0s inter-beat gaps (manifest, not baked); all text
code-rendered Sticker V1 word-timed from _state.json; voice-only beats centered; transition seed =
1A formula charCodeAt(1)+charCodeAt(2) (NOT LessonB/C charCodeAt(3) bug, PLAYBOOK 7.13);
camera-travel slides between stages, fades on hero bookends; lead token L->R; palette locked;
Codex generates / Claude judges / Jarrad approves; every artifact gated individually; custom-video-qc
before any cut; shared HeyGen/Higgsfield credit pools — 402 => STOP + tell Jarrad.

## Status
Audio 13/13 done (_state.json, word timestamps). 4 Andrea clips done (hero_b01/b10, circle_b02/b09).
7 stills generating/landed. Next: Lesson4A.tsx (copy LessonB + PipelineDiagram component + seed fix)
-> register Root.tsx -> build_manifest_4A.py -> proof stills -> render -> QC -> deliver.

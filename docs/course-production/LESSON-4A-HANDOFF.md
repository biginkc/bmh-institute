# Lesson 4A — HANDOFF (2026-07-05)

**State: b06a PRIYA SWAP RENDERED, AWAITING CLAUDE QC (2026-07-10).**
`course-assets/review-lesson4A/LESSON-4A-v3.mp4` supersedes the shipped v1 candidate for review only.
The cap-guy placeholder is replaced by canonical Priya handing the folder to a distinct acquisition
manager. The Kling clip and the Remotion animation-to-Andrea boundary passed dense self-check. v3 is
6:58.88, 1600x900 H.264/AAC, yuv420p limited-range BT.709. Do not swap the Drive final until Claude
QC passes and Jarrad approves. `LESSON-4A-v2.mp4` is an unqueued technical intermediate because its
H.264 stream lacked explicit BT.709 transfer and primaries tags.

<details><summary>Original build-state notes (superseded)</summary>

**State: composition BUILT and rendering, but it needs a TEXT-DENSITY SIMPLIFICATION pass before any full render. Do NOT render until the clutter is fixed.**

</details>

Module 04 / Chapter 4 / Slot 06 — "Sales Pipeline & Stage Ownership". Follows
`MODULE-PRODUCTION-GUIDE.md` + `PLAYBOOK.md`. Owns `*lesson4A*` / `module-04` paths only.

---

## ⚠️ THE PROBLEM TO FIX FIRST (Jarrad's call — "too much text, it's slop")
The composition violates "one text element at a time" **by accumulation**. Too much shows at once:
- **b04_qualify**: six bottom pills + four popping "Decision maker/Wants to sell/…" labels + clipboard art — overwhelming.
- **b09_ownership**: six pills + YOU bracket + "ACQUISITION+TRANSACTION" bracket + four verb pills + "YOU OWN 1→4" summary pill + face circle — far too busy.
- Most pipeline beats stack: 6 persistent pills + an EXIT/tag caption + the vignette.

**Fix (needs Jarrad's direction on how minimal):** drastically cut simultaneous on-screen text. Options to propose to him:
1. Replace the persistent six-pill row with a SINGLE small active-stage pill (e.g. just "3 · DISCOVERY"), no full row.
2. Drop the popping label lists (b04 four labels, b09 four verbs) — let Andrea's voice + the vignette carry it.
3. Show at most ONE text element per moment; stagger so a label fully clears before the next.
Get his pick before rebuilding. The vignette art + the voice should do most of the work; text is a garnish, not the meal.

## WHAT'S DONE AND CORRECT (don't redo)
- **Audio**: 13 beats, `remotion/public/lesson4A/master.m4a` (6:58). Includes the **"lead"->"leed" pronunciation fix** (b01,b02,b03a,b06a,b06b,b09 respelled — flagged as a master pronunciation-deviation). Word timestamps in `course-assets/heygen/lesson4A/_state.json`.
- **Font fix**: Baloo2 now `loadFont`-ed properly in `Lesson4A.tsx` (was silently rendering serif — PLAYBOOK 7.8). Keep it.
- **Layout (Jarrad-approved)**: six stages as bottom PILLS (no top track); FACE-ONLY corner circle. Keep these; just reduce the text volume around them.
- **Stills** (`course-assets/scenes/module-04/`): use `m04_L4A_v3_qualify_v3.png` (gray bars, not black), `m04_L4A_v8_contract_v2.png` (says "CONTRACT"), plus v1_capture, v2_firstcontact, v4_discovery, v6_handoff, v7_offer.
- **Andrea clips** (`course-assets/heygen/lesson4A/`): cafe heroes `hero_b01_intro.mp4`/`hero_b10_outro.mp4`; headset circles `circle_b02.mp4`/`circle_b09.mp4`; full-body mid-beat cuts `hero_b05a_andrea.mp4`/`hero_b06a_andrea.mp4`.
- **Anims** (`.../grok/`): `anim_b05a_discovery_v2.mp4` (Seedance, continuous-talk, PASS); `kling_b06a_priya-handoff-v2.mp4` (Kling 3.0 Turbo, canonical Priya walk-in handoff, 8s, dense-sweep PASS). The old `kling_handoff_A.mp4` remains superseded source history.

## FOLLOW-UPS
1. **Text simplification** (above) — the blocker.
2. **Priya handoff** — EXECUTED 2026-07-10. Start still: `course-assets/scenes/module-04/m04_L4A_b06a_priya-handoff-v2.png`. Motion clip: `course-assets/heygen/lesson4A/grok/kling_b06a_priya-handoff-v2.mp4`. Canonical Priya stays left with ponytail and orange headset; a distinct short-haired acquisition manager walks in from the right and receives the single folder. Exactly two people, one folder, no blank placeholder shapes. Candidate render is v3 and remains gated on Claude QC plus Jarrad approval before Drive swap.
3. **Shared `Root.tsx` is broken by the 3B tab** (imports `Lesson3BPreviewB3`/`LESSON_3B_PREVIEW_B3_FRAMES` which `Lesson3B.tsx` doesn't export). Do NOT touch 3B. Lesson4A renders via the ISOLATED entry `src/index4A.ts` (+ `root4A.tsx`) — same escape hatch as `root2A.tsx`.

## FILES / PATHS
- Composition: `docs/course-production/remotion/src/Lesson4A.tsx` (components: PipelinePills, CheckLabels, CrmCard, RecapVerbs, AndreaCircle (face-only), two-phase PipelineBeat for b05a/b06a, HeroBeat).
- Render entry (isolated): `src/index4A.ts` + `src/root4A.tsx`.
- Manifest builder: `scripts/build_manifest_4A.py` -> `remotion/public/lesson4A/manifest.json` (13 beats, 12565 frames). Alpha-keys anim/andrea clips to ProRes .mov.
- Proof stills: `remotion/out/proof-4A/<beat>.png`.
- Scene cards: `shotlists/module-04-lesson4A-scenecards.md`. Scripts: `shotlists/lesson-4A-script.txt` (+ `lesson-4B-script.txt` overflow for a future 4B tab).
- Current QC candidate: `course-assets/review-lesson4A/LESSON-4A-v3.mp4`.

## HOW TO RENDER
- Proof one beat: `cd docs/course-production/remotion && npx remotion still src/index4A.ts Lesson4A out/proof-4A/<beat>.png --frame=<N>` (beat frame offsets: cumulative from manifest `durationInFrames`; fps 30).
- Rebuild manifest after asset/beat changes: `cd docs/course-production/scripts && python3 build_manifest_4A.py`.
- Full render: `npx remotion render src/index4A.ts Lesson4A out/lesson4A-v1.mp4`. Then run the **`custom-video-qc`** skill before delivery.

## SPLIT NOTE
4A = master Slot 06 **cues 1-12** only (oversized slot). Cues 13-17 (the five-step conversation framework + 80/20) are saved as `shotlists/lesson-4B-script.txt` for a **future 4B tab** — its outro should use the master's real closing line (cue 17 -> Slot 07).

## STANDING RULES (compiled)
Cafe Andrea opens/closes · BMH badge on b01 · 1.0s inter-beat gaps · ALL text code-rendered Baloo2
via `loadFont` (never bare string) · transition seed `charCodeAt(1)+charCodeAt(2)` · Codex generates
stills / Claude judges / Jarrad approves · every artifact gated individually · `custom-video-qc`
before any cut · shared HeyGen/Higgsfield credit pools (402 = STOP, tell Jarrad).

## UNRELATED VAULT DRIFT (not 4A)
`~/BMH-OS` flags stale PR #301 -> #306 refs in `_Active.md` / `STRATEGY.md` / `mocs/MOC - v1.md`
(Sandra bulk-SMS->Campaigns fix). Reconcile per `_meta/contradictions.md` when convenient.

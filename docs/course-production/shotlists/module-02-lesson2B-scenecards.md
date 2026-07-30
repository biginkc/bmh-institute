# Module 02 · Lesson 2B — "Humanizing the Lead B / Meet the Sellers"

**Created 2026-07-04.** Chapter 2B seller-stories video. Format: scene-card-v2. Reference pattern: LessonB.tsx.
Source: locked master `_master-transcripts.md` Slot 04-B (`Chapter 2B.srt`) + 3 authored first-person additions (logged in master, approved Jarrad 2026-07-04).

> **v2 (Jarrad-approved, delivered 2026-07-05) — `review-lesson2B/LESSON-2B-v2-FULL.mp4`.** ONE delta from v1: each seller **setup** now shows a full situational SCENE still (seller inside their problem, face identity-matched to the portrait) with a code push-in, instead of the plain portrait. Talking-avatar unchanged; the **tag** still returns to the clean portrait — EXCEPT **Carol (b05)**, whose tag is a **looping Seedance animation of Carol arguing with the contractor** (both angry; same-frame clamp → seamless loop across the ~17s tag). Ray (b04) has no tag. Scene stills `m02_L2B_{david,beth,ray,carol,marcus}_scene.png` (David flat rental+PAST DUE · Beth living room + elderly mother's memorial photo, Beth stays 40s · Ray kitchen+letter · Carol door+LIEN+abandoned repair · Marcus driveway+multi-story dream house); Carol argue still `m02_L2B_carol_argue.png` → `anim/anim_carol_argue.mov` (alpha ProRes). Code: `build_manifest_2B.py` (scene, `TAGCLIPS`, `rekey_anim`, tagClip/tagClipFrames/tagHold, hasTag) + `Lesson2B.tsx` SellerBeat. Render via isolated root `src/index2b.ts`.
>
> **v3 (Jarrad-approved, delivered 2026-07-05) — `review-lesson2B/LESSON-2B-v3-FULL.mp4` (5:58).** Audio-only fixes on top of v2 (watch-through notes): b03a "St. Louis"→spelled "Saint Lewis" in `gen_audio_2B.py` to fix the "St. Louey" TTS mispronunciation (on-screen card unchanged); new fuller **outro** b09 (7.7s→28.8s, Option A: recap five sellers → "that someone is you" → tease profile lesson → "I'll see you there", Excited voice) with the terminal-"calls" clipping fixed by keeping "calls" mid-sentence; rebuilt `andrea_b09.mp4` (desk Andrea) with **calm resting hands** (re-rolled once — first motion prompt too expressive). No scene/anim/code changes from v2.
Script: `module-02-lesson2B-script-clean.txt`. ~9 beats.

**The device:** five seller portraits, each speaking one first-person line in their OWN voice, wrapped by Andrea's narration. This is the "humanizing" payoff — you hear them, not just hear about them.

**Voices (Jarrad picking in HeyGen — paste voice_ids):**
Andrea narration = Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682` · Excited `91120f72682e4459a19e311ba2ee4cb2` (b09 only).

**Andrea avatar (hero bookends b01/b09 + b08 corner):** Office/desk Andrea `8200f90176d6444a8d6943a664a71c1a` ("Office Andrea BMH", seated at her office desk) — the SAME avatar Lesson 2A uses (Jarrad: match 2A, NOT cafe). Motion prompt "seated at her office desk, warm and friendly, minimal natural gestures". (Source image is 2A's `m02_L2A_office_andrea_v4a.png`; avatar already built in HeyGen — reference the id, don't rebuild / don't touch 2A files.)
- David → Warm William `31e2fd6e7c924bc9be987ac4cfaac5e8` · Ray → Aaron `66da5fabd6b944b3a42f35aed9631ad2` · Marcus → Jude `3295c84534da424db838ee9a0085f24d`
- Beth → Calm Chloe `77a8b81df32f482f851684c5e2ebb0d2` · Carol → Margaret `f0240e6cefd541ac8031eeb9f3b71a82`
- (Picked by Jarrad 2026-07-05 from 2-candidate auditions per seller; all speed 1.0, decoupled `/v3/voices/speech`.)

**Seller doodle portraits (Codex gen → Claude judge → Jarrad approve), in `course-assets/scenes/module-02-lesson2B/`:**
`m02_L2B_david.png` · `m02_L2B_beth.png` · `m02_L2B_ray.png` · `m02_L2B_carol.png` · `m02_L2B_marcus.png`.
Briefs (who + look only — style block handles the rest): David = man ~50s, heavyset, thinning hair, short grey beard, weary. Ray = man ~40s, average build, short receding hair, clean-shaven, hollow-eyed. Marcus = man ~30s, lean, fuller dark hair, clean-shaven, tense. Beth = woman ~40s, medium build, shoulder-length hair, tired but composed. Carol = woman ~60s, glasses, short curly hair, frustrated.

**Speaking-avatar build:** each seller portrait → HeyGen photo-avatar (doodle-avatar flow, proven) → talking clip lip-synced to that seller's voice, covering their first-person line ONLY. Andrea's setup/tag play voice-only over the seller's still portrait.

---

## Beat table

| Beat | Mode | On screen | Voice(s) | Text (trigger) |
|---|---|---|---|---|
| b01_intro | hero + **BmhBadge** | Andrea (office desk) | Elizabeth-Friendly | — |
| b02_david | seller-portrait → talking-avatar → portrait | David portrait; David talking-avatar on his line | Andrea (setup/tag) + **David** (monologue) | DAVID · Tired Landlord · Kansas City |
| b03_beth | same pattern | Beth portrait / talking-avatar | Andrea + **Beth** [ADDED line] | BETH · Inherited Estate · St. Louis |
| b04_ray | same pattern | Ray portrait / talking-avatar | Andrea (setup) + **Ray** (monologue) | RAY · Behind on Payments · Dayton |
| b05_carol | same pattern | Carol portrait / talking-avatar | Andrea + **Carol** [ADDED line] | CAROL · Title Lien · Lake of the Ozarks |
| b06_marcus | same pattern | Marcus portrait / talking-avatar | Andrea + **Marcus** [ADDED line] | MARCUS · Underwater · Kansas City |
| b07_recap | recap (grid thumbs) | 5 seller portraits, 2×3-ish cascade | Elizabeth-Friendly | FAST · CERTAIN · SIMPLE |
| b08_you | circle | Andrea corner over blue | Elizabeth-Friendly | PROVIDE OPTIONS |
| b09_outro | hero (Excited) | Andrea (office desk) + wave | Elizabeth-Excited | — |

---

## Per-beat audio structure (multi-voice — NEW for this lesson)
Seller beats (b02–b06) concat within the beat: `[Andrea setup wav] + [seller monologue wav] + [Andrea tag wav]` → beat master clock. Each speaker rendered by its own `voice_id` via `/v3/voices/speech` (speed 1.0, loudnorm −16), then concatenated in order. Word timestamps captured per sub-segment for the name-card sticker pop (trigger = seller's first name).

## Motion / animation
- Seller "setup" (Andrea VO over portrait): code push-in (Remotion). Optional Seedance idle TBD — HeyGen talking-avatar already supplies motion on the seller's line; add idles only if setup reads static. Single-character rule if any Seedance idle IS generated: "EXACTLY ONE PERSON, no clone" + NEGATIVE.
- Seller "monologue": HeyGen talking-avatar (built from portrait), lip-sync to seller voice.
- b07 recap: portraits cascade in as thumbnails (RecapBeat pattern).

## Standing rules applied
Office/desk Andrea opens & closes (avatar 8200f9…, matches 2A) · BMH badge on b01 · **1.0s inter-beat gaps** (guide Stage-2, revised — NOT 1.5–2s) · palette locked 5-color on `#62b3f3` · text code-rendered (Sticker V1 white card) · every artifact gated to Jarrad individually · QC dense-sweep before delivery · outro tease = master's own closing line (→ ISP profile lesson), no invented next-module tease.

## OPEN before generation
1. Voice IDs → ✅ ALL 5 PICKED by Jarrad 2026-07-05 (David/Warm William · Ray/Aaron · Marcus/Jude · Beth/Calm Chloe · Carol/Margaret). No blockers remain — clear to generate.
2. Seedance idles for seller setups → RESOLVED: code push-in only (Jarrad walk).
3. Seller portraits → ✅ GENERATED & APPROVED by Jarrad 2026-07-04 (`m02_L2B_{david,beth,ray,carol,marcus}.png`; consistent cream face / half-height scale / icon-level detail; David = v3, Marcus/Ray/Beth re-rolled to match the set).

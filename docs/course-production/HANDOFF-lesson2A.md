# HANDOFF — Lesson 2A "Who Sells to Us" (Module 02, Chapter 2.1)

**Written 2026-07-05. Purpose:** resume the Lesson 2A video build in a fresh tab. Read this top-to-bottom,
then **verify actual disk state before doing anything** (many steps ran as background jobs; don't trust
this doc's "done" claims without checking files). The authoritative rev history + rationale lives in the
plan file: `/Users/jarradhenry/.claude/plans/produce-the-chapter-2-snazzy-patterson.md` — read it too.

---

## 0. WHAT THIS IS
A ~7:35 doodle-brand teaching video, Chapter 2 Lesson 2.1 of the BMH training course. Teaches new
agents/VAs **who BMH's sellers are and why they sell** (situations, motivated-vs-curious, disqualifiers,
the trust/empathy close). 21 beats. Andrea narrates (HeyGen avatar on-camera for some beats; doodle
scenes + 2 Seedance animations for the rest).

**Runbook (read first if unfamiliar):** `docs/course-production/MODULE-PRODUCTION-GUIDE.md`,
`PLAYBOOK.md`, `ARCHITECTURE.md`, `scene-card-v2.md`. Reference lesson pattern: `LessonC.tsx` / `LessonA.tsx`.

**SOURCE OF TRUTH for the script** (this bit the first attempt):
`~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md` -> **Slot 04 "Humanizing the Lead A"
(Chapter 2A)**. The narration is NEAR-VERBATIM from that transcript. v1 was wrongly drafted from
`~/Sites/zillow crawler/training-course-outline.md` (topic bullets only) — that produced invented
disqualifiers and dropped the trust close. DO NOT use the outline as source; use the master transcript.

---

## 1. NAMING & PATHS (module-02 / lesson2A)
- **Stills (Codex gpt-image-2):** `course-assets/scenes/module-02/m02_L2A_*.png`
- **Audio + HeyGen clips + state:** `course-assets/heygen/lesson2A/` — `*.wav`, `_state.json`
  (per-beat text + duration + word_timestamps), `_clips.json` / `_avatars.json` (avatar clip ids),
  `anim/*.mp4` (raw Seedance clips)
- **Remotion assets:** `docs/course-production/remotion/public/lesson2A/` — `manifest.json`, `master.m4a`,
  `stills/` (blue-normalized), `hero/` (avatar clips), `circle/`, `anim/` (alpha ProRes .mov)
- **Component:** `docs/course-production/remotion/src/Lesson2A.tsx` (registered in `Root.tsx` as comp id `Lesson2A`)
- **Scripts:** `docs/course-production/scripts/` — see section 4
- **Renders:** `docs/course-production/remotion/out/lesson2A-vN.mp4`
- **Deliverables:** `course-assets/review-lesson2A/`
- **Design refs (for Codex stills):** `docs/design/style-ref-1.png`, `style-ref-2.png`, `cast-board.png`;
  approved Andrea face `course-assets/avatar-candidates/andrea_headset_v2.png`; BMH logo lockup
  `docs/course-production/remotion/public/lessonA/bmh-endcard.png` (470x180, has a CORRECT serif M) +
  `/Users/jarradhenry/Sites/bmh-training-videos/public/bmh-logo.png`.

**Multi-tab claim:** Module 02 is claimed in `docs/course-production/NEXT-SESSION.md` (IN PRODUCTION).
Other tabs may own other lessons — do NOT touch LessonB.tsx/LessonC.tsx/Lesson3A.tsx or their asset dirs.

---

## 2. CREDENTIALS & PROVIDER RECIPES
- **HeyGen API key:** `~/.config/bmh-course/heygen.key` (read in scripts, never print).
- **Voices** (`/v3/voices/speech`, speed 0.95): Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682` (body) ·
  Elizabeth-Excited `91120f72682e4459a19e311ba2ee4cb2` (b21 outro only).
- **Avatars** (`/v3/videos {type:avatar}`):
  - **1A headset Andrea** `e527528e584a404f9da68ee4faca1353` — Andrea on plain cornflower blue (the
    "hero-solo" look). Per Rev 3, b02/b17/b19/b21 use THIS.
  - **Office Andrea** — built THIS session from `m02_L2A_office_andrea_v4*.png` (Andrea SEATED at a desk,
    facing camera, BMH plaque on wall). Used for **b01 only** (establishing shot). Its avatar_id is in
    `course-assets/heygen/lesson2A/_avatars.json` (or `_clips*.json`) — READ it, don't guess.
  - cafe Andrea `b2cd05454d284058ad8d7303545821e6` — no longer used (was v1 cafe bookends).
- **Avatar clip flow:** upload wav -> `POST /v3/assets` (curl -F file=@wav) -> asset_id ->
  `POST /v3/videos {type:avatar, avatar_id, audio_asset_id, resolution:720p, aspect_ratio:16:9,
  expressiveness:low, motion_prompt}` -> poll `/v3/videos/{id}` -> download. See `gen_avatar_2A.py`.
  Then rekey the downloaded clip to ALPHA ProRes so code owns the blue (see build_manifest rekey_clip).
- **Seedance (Higgsfield MCP)** — animations. Balance was ~1141 credits (ultra). Flow:
  `media_upload {files:[{filename,path}]}` -> curl PUT bytes -> `media_confirm {type:"image", media_id}` ->
  `generate_video`. **generate_video REQUIRES a `params` wrapper:** `{params:{model:"seedance_2_0",
  mode:"std", resolution:"720p", duration:15, generate_audio:false, medias:[...], prompt:"..."}}`.
  **Triple-clamp recipe:** medias = start_image=still, end_image=SAME still, image_references=cast-board
  + style-ref. **Reusable ref media_ids:** cast-board `c86e1fa9-df75-4cbc-ba32-8479b0829538`, style-ref-1
  `b345db3c-3cf3-44e8-b890-53b1b80f6a91`. **Angry-caller still already uploaded:** media_id
  `3068d5dd-a90c-40a3-9619-b47a4973678a`. **Preset bounce:** first call returns a `preset_recommendation`
  ("3D RENDER", triggered by "3D render" in the NEGATIVE) -> re-fire adding
  `declined_preset_id:"5a77643c-b6cc-4efd-bdc6-ab8ff48dfa82"`. Single-person clamp: put "EXACTLY ONE
  PERSON, no clone/twin/extra limb" in prompt + NEGATIVE. Poll `job_status {jobId}` -> download `results.rawUrl`.

---

## 3. THE 21 BEATS (near-verbatim Chapter 2A) — mode, asset, label
Audio = master clock. Per-beat VO text is in `course-assets/heygen/lesson2A/_state.json`.

| Beat | Mode | Visual / asset | On-screen label (word-timed) |
|---|---|---|---|
| b01_intro | hero | office Andrea clip + BMH badge | — |
| b02_why | hero | 1A headset Andrea (Rev3) | — |
| b03_situations | grid | 6-cell grid (grid1..6) | — |
| b04_inherited | scene | grid1_inherited | INHERITED PROPERTY |
| b05_financial | scene | grid5_payments | FINANCIAL PRESSURE |
| b06_landlord | scene | grid2_landlord | TIRED LANDLORD |
| b07_condition | anim | tired-house Seedance (anim_b03_profile) | PROPERTY CONDITION |
| b08_divorce | scene | grid3_divorce | DIVORCE |
| b09_life | scene | grid4_relocating | LIFE HAPPENS |
| b10_outofstate | scene | b10_outofstate (snow/beach split) | OUT-OF-STATE OWNER |
| b11_vs | vs (two-panel slide) | b12_motivated_stand and b13_curious_stand | MOTIVATED / CURIOUS (top) |
| b12_motivated | scene | b12_motivated_stand (standing, looks up) | MOTIVATED (labelTop) |
| b13_unmotivated | scene | b13_curious_stand (standing, looks up) | JUST CURIOUS (labelTop) |
| b14_notobvious | scene | b14_overshoulder (back-to-camera, glance back) | NOT ALWAYS OBVIOUS |
| b15_phrases | cascade | (blue) 6 seller-quote pills cascade | seller quotes |
| b16_writedown | scene | b16_notes (CRM profile + NOTES screen) | — (no text card) |
| b17_disqualifiers | herolabels | 1A headset Andrea + 4 labels cascade right | Listed w/Realtor, Not the owner, No equity, Commercial/vacant |
| b18_empathy | anim | angry-caller Seedance (2 multi-shot clips) | — |
| b19_different | hero | 1A headset Andrea | — |
| b20_trust | scene | b20_handshake (WHITE hands, cream+orange sleeves) | THEY TRUST US |
| b21_outro | hero | 1A headset Andrea (Excited voice) | — |

Reused-from-v1 stills that are FINE: grid1..6, tired-house anim (anim_b03_profile). The old
b06_motivated/b06_curious (seated) and b05_motivation cash-clock anim are NO LONGER USED.

---

## 4. SCRIPTS (all in `docs/course-production/scripts/`)
- **`gen_audio_2A_v2.py`** — 21-beat audio. Edit BEATS text, delete the target `*.wav` + its `_state.json`
  entry to force regen (script skips beats that already have a wav). Runs `/v3/voices/speech` +
  loudnorm -16 LUFS. (Latest edit: b09 = "A job relocation on short notice." to fix "Jobe" mispronunciation.)
- **`gen_stills_2A_v2.sh`** — v2 stills (office_andrea, b10 outofstate, b18 angrycaller, b20 handshake). Pattern:
  `zsh gen_stills_2A_v2.sh <key>` — one lane per image; fire all keys in parallel background.
- **`gen_stills_2A_v4.sh`** — Rev4 stills: keys `b12 b13 b14 b16 b20`. Same gen() pattern (codex exec -i
  style-ref-1 -i style-ref-2 -i cast-board). Fire: `for k in b12 b13 b14 b16 b20; do zsh gen_stills_2A_v4.sh $k >/tmp/v4_$k.log 2>&1 & done`.
- **`gen_avatar_2A.py`** (+ office/1A variants created this session) — HeyGen avatar clips. Swap avatar_id
  + CLIPS table (name, beat tag, avatar_id, motion_prompt).
- **`build_manifest_2A.py`** — THE assembler. BEATS table (tag, mode, still, still2, anim, hero, badge),
  LABELS, CASCADE, GRID. Builds master.m4a (GAP inter-beat silence — now 0.9s), normalizes stills to
  canonical blue `#62b3f3`, rekeys anim mp4s -> alpha ProRes .mov, writes manifest.json. Prints `missing:[]`.
  Run: `python3 build_manifest_2A.py`. Missing hero/anim -> graceful fallback (hero->blue, herolabels->cascade,
  anim->scene), so it always produces a renderable manifest; re-run after the real assets land.
- **Render:** `cd remotion && npx remotion still src/index.ts Lesson2A out/proofX.png --frame=N` (per-beat proof,
  CHEAP — always do before full render); full: `npx remotion render src/index.ts Lesson2A out/lesson2A-vN.mp4`.

---

## 5. REVISION HISTORY (why the current shape) — full detail in the plan file
- **Rev 1 (scrapped):** wrong source (outline). Grid-of-6-sellers concept, cafe Andrea. Abandoned.
- **Rev near-verbatim:** rebuilt from master Chapter 2A -> 21 beats. New office-Andrea avatar (BMH logo
  behind her). NOTE: BMH logo TEXT garbles to "BNH" in gpt-image — fix by generating the plaque in OPEN
  wall space and/or compositing the real `bmh-endcard.png`; the v4 office image used a seated-at-desk plaque.
- **Rev 2 (watch-through on v3):**
  - b18 transcript: "By the time that lead gets to you" -> "seller" (TTS mis-reads heteronym "lead").
  - **b18 "duplicate" ROOT CAUSE (critical):** the RAW Seedance clip is clean (one person). The ghost
    extra-limb appears only in the COMPOSITED render because `AnimBeat` rendered the static still UNDER the
    alpha anim; on big moves (hands up) the still's phone-arm bled through the anim's transparent areas.
    **FIX: in `AnimBeat`, render the still ONLY in the hold tail (`frame >= tailStart`), never during the
    anim window.** QC lesson: dense-sweep the COMPOSITED RENDER's anim window (hands-up frames), not just the raw clip.
  - b18 regen: span the full ~30s narration via 2 distinct 15s multi-shot clips (different camera
    angles; drop locked-camera) chained in `videos:[c1,c2]`; re-QC at 0.25s cadence + zoom the back third.
  - b16 "Write it down" -> drop text card; show a CRM profile-with-NOTES screen.
  - Transitions -> (superseded by Rev 3).
- **Rev 3 (office intro -> 1A avatar + 1A transitions):** the ~19s "weird transition" was a fade between two
  near-identical OFFICE shots. Fix: b01 stays office Andrea (establishing); b02/b17/b19/b21 regen with
  1A headset Andrea (on plain blue) so the cut goes office -> a genuinely different look.
  **Transitions -> copy 1A's `pickTransition` (LessonA.tsx):** fade when a hero/Andrea beat is involved (T=13),
  directional slides between scene beats (seed `charCodeAt(1)+charCodeAt(2)`, PLAYBOOK 7.13), card pop T_CARD=5.
- **Rev 4 (v5 watch-through) — IN PROGRESS, see section 6.**

---

## 6. REV 4 — WHAT'S LEFT (resume here)
Eight changes from the v5 watch-through. Verify each against disk before redoing.

**Applied (edits landed this session):**
1. DONE: b09 audio text reworded in `gen_audio_2A_v2.py` ("A job relocation..."). (Still must REGEN the wav:
   `rm course-assets/heygen/lesson2A/b09_life.wav`, delete b09 entry from `_state.json`, rerun gen_audio_2A_v2.py.)
2. DONE: `build_manifest_2A.py` GAP 1.5 -> 0.9.
3. DONE: `build_manifest_2A.py` BEATS: b11/b12/b13/b14 swapped to new stills (b12_motivated_stand,
   b13_curious_stand, b14_overshoulder).
4. DONE: `build_manifest_2A.py`: b12/b13 get `labelTop=True`.
5. DONE: `Lesson2A.tsx`: added `labelTop?: boolean` to the Beat type.

**NOT done (do these):**
6. TODO: 5 Rev4 stills generating (background job `bwsppohdn` launched `gen_stills_2A_v4.sh` for
   b12,b13,b14,b16,b20). Check `course-assets/scenes/module-02/` for: `m02_L2A_b12_motivated_stand.png`,
   `m02_L2A_b13_curious_stand.png`, `m02_L2A_b14_overshoulder.png`, `m02_L2A_b16_notes.png` (BLACK monitor
   frame — palette exception, Jarrad-approved), `m02_L2A_b20_handshake.png` (WHITE hands, cream+orange sleeves).
   Judge each vs style rules; if any missing/garbled, re-fire that key. Send each to Jarrad individually.
7. TODO: `Lesson2A.tsx` — finish `labelTop` rendering. The type field is added but NOT the render. In
   `SceneBeat`, when `beat.labelTop` is set, render the label as a top-centered pill (not `bottomCenter`).
   Suggested: add a `TopLabel` component (flex-centered wrapper at `top:60` with a spring-pop white pill,
   Baloo 2, ~56px) and branch: `beat.labelTop ? <TopLabel .../> : <Sticker ... bottomCenter/>`. b11 (vs mode)
   already renders MOTIVATED/CURIOUS titles at top via VsBeat — keep those.
8. TODO: b01 office clip regen — calmer arms. The office Andrea b01 clip's arms are too expressive/unnatural.
   Regen that ONE clip with a calmer `motion_prompt` ("seated, hands resting still on the desk, barely
   any movement, minimal natural gestures", expressiveness low). Use the office avatar_id from `_avatars.json`.
9. TODO: Confirm Rev-2/Rev-3 items are actually in the current render (they ran as background jobs — VERIFY):
   AnimBeat still-tail ghost fix present in `Lesson2A.tsx`? b18 = 2 multi-shot clips in manifest? b02/b17/b19/b21
   using 1A headset avatar (alpha, on blue)? pickTransition = 1A style? If any regressed, reapply.

**Then finish:** regen b09 wav + b01 clip + the 5 stills -> `python3 build_manifest_2A.py` (expect `missing:[]`) ->
per-beat proof stills for b01,b11,b12,b13,b14,b16,b18,b20 -> full render `lesson2A-v6.mp4` -> QC (section 7) ->
copy to `course-assets/review-lesson2A/LESSON-2A-v1-FULL.mp4` -> deliver to Jarrad (SendUserFile) -> update
NEXT-SESSION.md, scene cards, PLAYBOOK, vault `_inbox` capture, `_meta/log.md`.

---

## 7. QC (mandatory before Jarrad sees a cut)
Run the `custom-video-qc` skill on the render. It checks: canonical blue `#62b3f3` sky samples,
edge-clip, audio silence gaps + loudness (mean ~-20 dB), per-beat visual judgment vs standing rules.
Extra for this lesson: dense-sweep the b18 anim window in the COMPOSITED RENDER (hands-up frames, 0.25s
cadence, zoom back third) — that's where the ghost hid. Fix at source -> rebuild -> re-render -> re-QC until all-PASS.

## 8. STANDING RULES / GOTCHAS (learned this build)
- Every artifact (stills, anim clips, avatar clips) -> Jarrad individually, filename + one-line purpose,
  the moment it's done. Never batch. Claude judges STYLE; Jarrad judges COMMUNICATION.
- Palette locked 5-color on `#62b3f3`; approved exceptions this lesson: b10 snow/beach colors, b16 BLACK
  monitor frame. Text is code-rendered (Sticker), never baked into art (one caps word max in-image, e.g. NOTES).
- Anim: Seedance 15s max, never loop; single-person clamp; multi-shot camera angles are WANTED (not defects).
  Rekey anim bg -> alpha ProRes (`prores_ks -profile:v 4444 -pix_fmt yuva444p10le`), composite `<OffthreadVideo
  muted transparent>`; code owns the blue (baking blue into yuv shifts colors — PLAYBOOK 7.11).
- gpt-image garbles logo/long text (BMH->BNH). For the BMH plaque, gen it in open wall space and/or
  composite `bmh-endcard.png` (has a correct M). One short caps word is usually OK; judge for garbling.
- Fire stills in PARALLEL (one background lane per image). MCP calls (Higgsfield) can't run inside background
  bash — call them inline.
- If the safety classifier is flapping ("opus temporarily unavailable, can't determine safety"), just retry
  the Write/Edit/Bash — reads always work.
- Shared HeyGen/Higgsfield credit pools with other tabs — on an insufficient-credit error, STOP and tell Jarrad.

## 9. UNRELATED (do not action unless asked)
Vault drift gate is flagging 2 Sandra PR contradictions (`_Active.md`, `mocs/MOC - v1.md` cite PR #301,
superseded by #306). Nothing to do with this video.

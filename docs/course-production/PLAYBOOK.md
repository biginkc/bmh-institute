# BMH Course Video Production PLAYBOOK
**The exhaustive findings record — every pivot, patch, and hard-won rule from building Lesson 1A (2026-07-03).**
Read this BEFORE producing any lesson. Companions: `ARCHITECTURE.md` (stack), `scene-card-v2.md` (format + standing rules), `custom-video-qc` skill (render QC), `NEXT-SESSION.md` (state).

---

## 0. The pipeline at a glance
```
Scene cards (verbatim VO per beat, Andrea mode, layers)
  → Codex stills (parallel, Claude style-judge)
  → JARRAD GATE #1: every still approved, animate-list marked
  → Clean audio: /v3/voices/speech (Elizabeth-Excited, loudnorm −16 LUFS, word timestamps saved)
  → Avatar videos: /v3/videos {audio_asset_id} lip-sync (NEVER script+voice_id — echo)
  → Grok plates (isolated, ≤5s or palindrome, canvas-at-native-coords)
  → JARRAD GATE #2: every clip/animation approved
  → build_manifest (ffprobe durations = master clock; bg-normalize stills)
  → Remotion render → custom-video-qc loop until all-PASS → deliver
```

---

## 1. Still generation (Codex `gpt-image-2`)

| # | Rule | The incident that taught it |
|---|------|------------------------------|
| 1.1 | Prompt via **stdin**; refs via `-i` (variadic — it eats positional prompts) | Established in first pilot |
| 1.2 | **One background process per image.** Never a serial loop | Jarrad interrupted twice over serialized 20-min queues |
| 1.3 | Claude judges **style**; Jarrad judges **communication**. Generators never self-grade | Covered chair read as "box with a chair"; boxes read as gifts |
| 1.4 | Single CAPS word in-image is safe (FORECLOSURE, B\|M\|H). Anything more garbles | FORECLOSURE + sign both rendered perfectly first try |
| 1.5 | Palette locked (5 colors). Object-realism exception ONLY when meaning fails (cardboard kraft) — not a palette change | Orange boxes → "gifts"; brown fixed it |
| 1.6 | Codex drifts off-palette occasionally → **selectivecolor remap** the offending hue; don't re-roll a good image | Green bushes → gold via `selectivecolor=greens=…` twice + yellows pass |
| 1.7 | `ffprobe` every output — dimensions vary (1672×941 appeared instead of 1600×900) | s03's odd size broke window math downstream |
| 1.8 | Elements that must animate independently → generate as **separate plates** (vignettes) | door/tombstone/disrepair pop individually |
| 1.9 | Need widescreen from a portrait image → **Higgsfield outpaint** (extends scene, keeps approved art) — don't regenerate | Office Andrea 1024×1536 → 2752×1536 seamlessly |
| 1.10 | **No ambient doodles.** Subject + necessary props only. No hearts/sparkles/notes/thought-bubbles/motion-marks | Jarrad stripped them twice; "no ambient doodles" is now absolute |
| 1.11 | Compositions: voice-only beats = **centered**; corner-circle beats = clear a ~420px bottom-right pocket ONLY (not half the frame) | "Why so much negative space?" |

## 2. Character animation (Grok via Higgsfield)

| # | Rule | Incident |
|---|------|----------|
| 2.1 | **Isolate.** Animate single characters/groups on plates; whole scenes boil and drift | First full-scene test broke the handshake apart |
| 2.2 | **Canvas trick:** place plate at its NATIVE scene coords on a full-size canonical-blue canvas → composite-back geometry is identity | Eliminates per-clip window math |
| 2.3 | Job metadata **lies about dimensions** — ffprobe the downloaded file (reported 1344×768; actual 1280×720; s03 came back 1264×720 with aspect trim) | Misalignment bug in v2.1 |
| 2.4 | Grok shifts the background blue (~4 pts) → **re-key to #62b3f3**, bt709 forced BOTH directions, similarity 0.15 / blend 0.02 | Visible rectangle band in composites; narrow similarity left gradient residue |
| 2.5 | **≤5s is the clean window.** Longer generations hallucinate/redraw furniture. Cover longer beats with **palindrome** (forward+reverse — invisible on idles) or accept a judged 15s if content is simple | s06 10s/11s grew phones and monitors; David's 15s passed |
| 2.6 | **First ~1.2s often contains hallucinated ticks/drops that vanish.** Dense-sample 0–2s of EVERY clip; trim past the artifact window | Jarrad caught it on the David clip after my QC missed it |
| 2.7 | **Never fight hallucinations with negative prompts** ("do not add…") — Grok rewrites the whole scene instead | s06 "no doodles" attempt spawned new furniture |
| 2.8 | Some "hallucinated" elements are actually in-plate originals — check the plate before re-rolling | s06 heart/note were real art |
| 2.9 | First `generate_video` call bounces with a preset recommendation → re-fire with `declined_preset_id` | Every session, every first call |
| 2.10 | Walk cycles traverse unreliably (backwards-walking gait) → prefer redesigning the shot (zoom-to-interior replaced walkers) or hybrid clip-gait + Remotion translateX | Pedestrians axed by Jarrad |
| 2.11 | Model choice: `grok_video` (loop-back winner) > grok_video_v15 / Veo3 / Kling for this style. Veo rewrites prompts + forces 8s | Bake-off, day one |

## 3. Narration & avatar (HeyGen)

| # | Rule | Incident |
|---|------|----------|
| 3.1 | **DECOUPLED AUDIO PIPELINE — the big one.** `/v3/videos {script, voice_id}` internal TTS produces **echoey, degraded audio**. Always: `/v3/voices/speech` (clean wav + word_timestamps) → `loudnorm I=-16:TP=-1.5` → upload via `/v3/assets` → `/v3/videos {audio_asset_id}` | Jarrad A/B confirmed echo lives only in the video-pipeline path |
| 3.2 | `/v3/voices/speech` = Starfish-engine voices only (Hope is NOT supported; Elizabeth is) | "VoiceProvider.STARFISH not supported" |
| 3.3 | **Voice: Elizabeth-Friendly (`55f8c0f546884f9cbdefa113f5e7b682`) = narrator for ALL beats; Elizabeth-Excited (`91120f72682e4459a19e311ba2ee4cb2`) = finale only (mission + send-off).** Soothing/Serious sound fine in 10s samples but become comically slow at paragraph length — never register-map body beats | v3's Soothing philosophy beat was unusable; Jarrad picked Friendly narrator + Excited close |
| 3.4 | Emotion capability is per-voice (`emotion_support` flag). Hope = false = permanently flat. Elizabeth persona = 5 separate voice_ids per register | Why the original narration couldn't be fixed |
| 3.5 | SSML pauses work on the video endpoint in **seconds** format (`<break time="0.8s"/>`, not `800ms`); the `support_pause` flag is unreliable for this path | Proven with Hope despite flag=false |
| 3.6 | Photo avatars: `/v3/assets` → `/v3/avatars {type:photo}` → engine `avatar_iv`. A doodle face with a tiny line mouth WORKS — Avatar IV invents an in-style cartoon mouth | The original gamble that unlocked everything |
| 3.7 | Scene-avatars: build the avatar FROM a widescreen scene image and the whole scene talks (office outro) | b17 |
| 3.8 | Avatar output framing: content pillarboxed in 16:9 with **white** bars; content bounds vary by source aspect — corner-sample to find them, then crop + alpha-key (vp9 yuva420p webm). Check bottom rows for junk bands | Square source = 720px strip at x400; earlier junk band needed trim |
| 3.9 | `motion_prompt`/`expressiveness` accepted but weak — hands calmed, but "waves goodbye" never materialized. Don't promise gestures | b17 wave attempt |
| 3.10 | `voice_settings.speed` works (0.5–1.5). **Default is 1.0** — 0.95 reads as slow-mo at paragraph length (caught on 7B opening, 2026-07-06). (0.9 with Hope was still flat — pace wasn't the real problem) | |
| 3.11 | **API credits are a separate balance** ("api credits"). Mid-batch exhaustion is survivable: state-file resume. BUT clear `error` entries before rerun — a resume that skips-if-video_id re-polls dead jobs forever | 5-clip failure at $0 balance; resume bug |
| 3.12 | Key management: keys display ONCE at creation. Old keys die silently (401 on all endpoints). The 1P service account is **read-only** — Jarrad must paste new keys into 1Password himself. Current key: `bmh-course-agent` (in session keychain question — ASK Jarrad where it landed) | 40-minute key hunt |
| 3.13 | `word_timestamps` from the speech endpoint = the timing spine. Vignette pops, future text stickers — no Whisper needed. SAVE them per beat in `_state.json` | b04b word-perfect pops |

## 4. Composition (Remotion)

| # | Rule | Incident |
|---|------|----------|
| 4.1 | **Audio = master clock.** Manifest built from `ffprobe` of every clip; beat duration = clip duration | Core architecture |
| 4.2 | **`transparent` prop is REQUIRED on OffthreadVideo for alpha webm** — without it alpha is ignored and the keyed color channels render opaque | Pedestrians hid the whole building; hero "band" mystery solved |
| 4.3 | Alpha webm (vp9 `yuva420p`) beats color-matching for compositing avatars — banding becomes impossible | v2.1 hero fix |
| 4.4 | Every ffmpeg re-encode touching color: force **bt709 in AND out** + tag the output. Untagged roundtrips shift every color | The "whole window brightened" bug |
| 4.5 | Canonical blue `#62b3f3`: every asset background normalized at ingest (colorkey→repaint pass in build_manifest); verify in QC by pixel-sampling | "Two different blues" review note |
| 4.6 | FRAME transforms (fill-the-frame) must be **fit-computed from content bounds** — arbitrary scales clip art. Verify per-beat with `remotion still` proofs BEFORE full render | Desk cut off at right edge |
| 4.7 | Grok windows live INSIDE the FRAME wrapper so coords transform together | |
| 4.8 | TransitionSeries: pad each sequence by its transition length; slides play over the frozen tail; audio never overlaps | "Camera travels" language |
| 4.9 | `remotion still` per beat = cheap iteration. Never debug with full renders | |
| 4.10 | JSX: don't stack `//` comments + `{/* */}` inside ternary parens — esbuild fails cryptically | v2 render failure |
| 4.11 | **Silent edit failures:** python `str.replace` no-ops when the target already changed — verify edits landed; and never `tail -2` a render log (it ate the real error and left a STALE mp4 that looked fresh) | v2.1 shipped with old beat structure once |
| 4.12 | MCP calls can't run inside background bash — submit inline right after their prerequisite lands | Lane orchestration |

## 5. Process (how we work)

| # | Rule |
|---|------|
| 5.1 | **Full pre-assembly approval gate:** EVERY artifact (stills, clips, voice samples, end-cards) to Jarrad in one review package BEFORE assembly. He approves/flags per item |
| 5.2 | **Show completed work immediately** — never batch deliveries behind other work. Files must be SENT and saved somewhere browsable (`course-assets/…`, never session scratchpad). **Present each asset individually: filename + one-line purpose with the image** (1:1 correlation — no numbered multi-image bundles) |
| 5.3 | **Parallel lanes by default.** Independent work fires in one turn as background jobs. In-lane dependencies live inside one self-contained script |
| 5.4 | **QC every render with `custom-video-qc` before delivery** — per-beat frames, blue verify, clip-edge check, audio gaps, dense first-2s on animation clips, no verdicts from compressed grids |
| 5.5 | Voice/register experiments: audition on FULL paragraphs, not 10s stock previews — length changes everything |
| 5.6 | Iterate scenes as isolated units (solo stills/clips), assemble late |
| 5.7 | Billing (credits, plans) is Jarrad-only. Batches must fail soft and resume (state files) |
| 5.8 | Cost reality: full 18-beat narration regen ≈ $12–15 HeyGen API; a Grok plate ≈ pennies (Higgsfield credits); Codex images effectively free in-plan. Don't penny-pinch regens at the cost of a review round-trip |

## 6. Asset registry (Lesson 1A canonical)
- Avatars: standing headset Andrea `e527528e584a404f9da68ee4faca1353` · office Andrea `63396931e03943f19c7261cdc675e623` (both group-approved by Jarrad)
- Voice: Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682` (narrator) + Elizabeth-Excited `91120f72682e4459a19e311ba2ee4cb2` (finale b16/b17); speed 1.0 (default; 0.95 reads as slow — 7B opening, 2026-07-06), loudnorm −16
- Logo: `~/Sites/bmh-training-videos/public/bmh-logo.png` — SEPARATE repo, not under BMH Institute (path confusion cost a failed lane on 1C); (+white variant); doodle sign version lives in the building still; end-card crop `remotion/public/lessonA/bmh-endcard.png`
- Text style: V1 white card, Baloo 2, no outline (`remotion/src/Sticker.tsx`)
- HeyGen key: `bmh-course-agent` (2026-07-03) — **1Password update still pending Jarrad's paste**
- Beat state + word timestamps: `course-assets/heygen/lessonA-v5/_state.json`

### Rule: character consistency needs the REAL avatar image attached (2026-07-03, 1B)
Generating Andrea in a new setting (cafe, yoga) with only style refs drifts the face
(detailed eyes/brows/lips instead of dot eyes). Two lessons:
1. Always attach the approved avatar source (`course-assets/avatar-candidates/andrea_headset_v2.png`)
   and demand "IDENTICAL face: dot eyes, tiny nose, simple smile" explicitly.
2. `codex exec -i <missing-file>` FAILS SILENTLY — the image still generates, just without
   the reference. Verify every `-i` path exists before firing a lane (Jarrad caught the drift).

### Rule: feed Grok FULL 16:9 frames, never tight crops (2026-07-03, 1B)
1B Grok plates came back off-brand — the doodle man re-rendered as a peach-skinned
cel-shaded cartoon in a beige room; the back-view fork figure grew a floating eyeball.
Root cause: I cropped tight PORTRAIT plates (e.g. 700x800) and handed those to grok_video,
which outputs 16:9 — so it padded and "creatively" rebuilt the whole scene off-style.
1A worked because it fed Grok the full 1600x900 doodle frame and window-cropped the
RESULT in Remotion (GROK_WINDOWS). 
**Fix / rule:** ALWAYS submit the full native 16:9 scene PNG to Grok; do the window crop
on the OUTPUT in the compositor, never on the input. Prompt "keep this exact illustration
unchanged, add only subtle motion, do not redraw or restyle." QC every clip's style before use.


## 7. Lesson 1C findings (2026-07-04 — first concurrent-tab lesson)

| # | Rule | Incident |
|---|------|----------|
| 7.1 | **Seedance duration = 15s (model max), never loop** — same-frame triple clamp lands the clip on its start pose, so the compositor's hold-still tail extends any beat seamlessly | Standing rule from Jarrad; guide's 4–5s superseded |
| 7.2 | **No walk-cycle traversals in Seedance** — a walking character vanished mid-clip and teleported to the other road branch. Design idles (character standing/gesturing); add traversal later via Remotion translateX if needed | b21 v1 FAIL → idle re-roll PASS (Grok rule 2.10's cousin) |
| 7.3 | Camera push-in + hallucinated furniture in a composited clip → re-roll with "NO new furniture or objects EVER appear; the whole still frame stays fully in view at all times; no zoom, no push-in, no pan" | b06 v1 FAIL → one-shot fix |
| 7.4 | `/v3/avatars` **requires `name`** — omitting it 400s | car-avatar build failed silently pre-restart |
| 7.5 | **Inter-beat gaps: 1.5–2s silence between beats in master.m4a**, inserted at manifest build (GAP const); beat durationInFrames includes its gap so the scene lingers | Jarrad standing request, 1C |
| 7.6 | **Drive rig:** scrolling-background beats need the moving subject as an ALPHA cutout plate — an opaque plate covers the strip entirely; ground the subject on the strip's ground line (translateY) | b19 proof: floating car over invisible scenery |
| 7.7 | Code-rendered dates/labels on generated art need MEASURED rects (100px drawgrid overlay on the still → read cell bounds); calendar months that overflow 5 rows fold day 30/31 into the prior week's cell | b15 proof: dates on borders, highlights spilling off-page |
| 7.8 | Custom TSX text (non-Sticker divs) must `loadFont` from `@remotion/google-fonts/Baloo2` — bare `fontFamily: 'Baloo 2'` silently falls back to a serif | b15 dates rendered in Times |
| 7.9 | Per-beat proof stills BEFORE full render caught every one of 7.6–7.8 — the proof pass is not optional (reaffirms 4.6/4.9) | 3 broken beats, zero wasted full renders |
| 7.10 | Shared-file contention is real: MODULE-PRODUCTION-GUIDE edits collided with the 1B tab mid-session — re-read before every edit to shared files (guide/PLAYBOOK/NEXT-SESSION/Root.tsx), keep edits small and anchored | First live two-tab session |
| 7.11 | **Never bake the canonical blue into a video clip.** Remotion's decode shifts baked-blue yuv clips ±4/channel (60b0ef vs 62b3f3) no matter which matrix/tag the re-key encode uses — two full renders proved bt601 and bt709 encodes land on the same wrong value. Fix: key anim clips to ALPHA (`prores_ks -profile:v 4444 -pix_fmt yuva444p10le` .mov), play with `<OffthreadVideo transparent>`, and let the code `backgroundColor` own the blue. Corollary: hide the hold-still while the alpha clip plays (sequence it AFTER `animEnd`) or moving characters ghost over their static copies | 1C v1+v2 renders: all 6 anim beats failed the ±3 blue check; v3 = alpha pipeline |
| 7.12 | **Seedance can splice its reference images INTO the clip as a "shot"** — the cast-board character sheet appeared ~1s mid-clip at 9s, framed like a cutaway. Pin the prompt: "ONE SINGLE CONTINUOUS SHOT for the entire duration — no cuts, no scene changes, no other images ever shown" + NEGATIVE "reference sheets or character lineups appearing, cuts, scene changes". Only the 0.5s-cadence full sweep catches it (12-frame sampling straddled it) | b17 v1 FAIL → v2 one-shot PASS |
| 7.13 | **Transition seed must use the VARYING tag chars.** `pickTransition` seeded on `charCodeAt(1)+charCodeAt(3)` — but char 3 is `_` in every `bNN_` tag, so whole decades of beats slide the SAME direction (b02–b09 identical, b11–b19 identical). 1A's formula `charCodeAt(1)+charCodeAt(2)` rotates all 4 directions. Also: fades ONLY at lesson open/close — a lesson with mid-lesson heroes otherwise turns ⅓ of its cuts into fades, which Jarrad reads as "the transitions are missing." **⚠️ LessonB.tsx carries the same seed bug (1B tab: fix on your next pass)** | Jarrad watch-through, 1C v1 |
| 7.14 | **Inter-beat gap default = 1.0s** (revises 7.5). 1.75s read as "the video sounds slowed down" — the voice was measurably identical to 1B (2.73 vs 2.70 w/s); dead air is what the ear hears as slow | Jarrad watch-through, 1C v1 |
| 7.15 | **Outro pattern: recap hook + one-line tease of the NEXT module.** "Stand up, stretch, and hydrate" retired after 1C (Jarrad: not necessary, was heading into all 19 modules via the template). The "yoga" entry in `make_photo_avatar_TEMPLATE.py` is tied to the retired line | Jarrad watch-through, 1C v1 |

### Rule: match visuals to the WORDS they illustrate, not the principle slot (2026-07-03, 1B v2)
The clapperboard ("write the movie") card sat in the "clarity beats pressure" beat because that's
where the ASSET was slotted — but the movie line is spoken in the NEXT beat. Jarrad caught it
("the clapper should start when she talks about the movie, not before"). When assigning stills to
beats, check the still's concept against the verbatim VO span, and word-time the reveal to its
trigger phrase. Also from the same review: on an abstract blue field, kept "props" (cloud, mug)
read as random artifacts — scenes carry ONLY elements that serve the narration.


## 8. Lesson 3A findings (2026-07-05 — Module 03, "BMH Offer Playbook A")

| # | Rule | Incident |
|---|------|----------|
| 8.1 | **Seedance CAN hold two doodle characters on-brand** — the documented two-char repaint/clone risk did NOT occur on b12's walk-and-talk. Recipe: start_image + cast-board + style-ref as `image_references`, **NON-clamped** (no end_image), hard style-lock prompt naming BOTH characters' exact look, `count:2` + select. Dense 0.5s sweep of both candidates = clean | b12 first two-char walk, PASS |
| 8.2 | **Non-clamped Seedance ≠ loop** — a scrolling background / traversal REQUIRES dropping the same-frame end clamp (the clamp forces a loop-back to the start pose, which kills any real scroll). Trade: slightly higher drift risk, so QC harder | b12 needed a scrolling street |
| 8.3 | **Hold-tail for a non-clamped clip = the clip's OWN last frame**, extracted with `ffmpeg -sseof`, NOT the start still — else the tail pose-jumps AND blue-jumps when the clip ends (clip end pose ≠ start pose; raw clip blue ≠ normalized canonical). Caught in QC, not review | b12 20.3s beat vs 15s clip → 5.2s tail |
| 8.4 | **Video/hero SCENE beats are exempt from the canonical-blue check** — their background is their own rendered content (HeyGen office wall, Seedance neighborhood sky), not the shared blue field. Don't re-key a full-scene clip's sky to canonical (risky color shift); accept its native blue, let slide transitions mask the boundary | 3A QC false-flags on b01/b12/b18 |
| 8.5 | **On-screen text ON a prop (whiteboard) = plain INK text, not the white-card Sticker** — Stickers hardcode a white bg + drop shadow (V1 lock), so on a white board they float OUTSIDE and cast weird shadows. Render board text as Baloo `#111` divs (loadFont per 7.8), positioned inside the measured board rect | b15/b16 v1: "content outside the board, weird drop shadow" |
| 8.6 | **"Active step" on a baked diagram = RECOLOR the element, not a ring around it** — a white glow ring "wasn't reading." Overlay a same-size orange disc on the baked yellow stop + redraw the numeral in code. Palette-true and unambiguous | roadmap b07–b11, Jarrad Rev1 |
| 8.7 | **A recurring customer character must NOT resemble the Andrea avatar** — the b02 family mom came back black-curly-haired like Andrea and read as her. Prompt customer characters with an explicitly DIFFERENT look (hair color/style, no headset) | b02 v1 → re-roll |
| 8.8 | **Codex occasionally returns a corrupted/dithered image** (not off-palette — actual halftone noise). Re-roll with "clean flat sticker-doodle, NO dithering/texture/hatching" added — one-shot fix. Also: a "clock" needs a real face (hands, ticks, numerals); "no numbers" made a blank disc | b04 disrepair v1 garbled; b06 clock blank |
| 8.9 | **Office Andrea is a valid hero avatar** (`63396931…`) — Jarrad overrode the cafe-bookend standing rule for 3A; the office photo-avatar talks fine in `/v3/videos`. Bookend setting is a per-lesson directorial call, not fixed | 3A open/close |
| 8.10 | **TTS mispronounces a proper noun → respell it phonetically in the script text, not the on-screen card.** "St. Louis" read "St. Louey" → spell it **"Saint Lewis"** in `gen_audio` SEGS (Lewis = "LOO-is" ≈ St. Louis). The code-rendered name card keeps the correct spelling; only the spoken text changes | 2B v3 b03a |
| 8.11 | **The Excited voice clips a terminal consonant (esp. a plural S) at a sentence-end pause** — "...on real calls." came out "...real call." Keep the word MID-sentence so a following word protects the S ("on your calls with real people. I'll see you there.") | 2B v3 b09 |

## 9. Lesson 4A findings (2026-07-05 — Module 04, "Sales Pipeline & Stage Ownership")

| # | Rule | Incident |
|---|------|----------|
| 9.1 | **Two-phase beat: Andrea must take over the frame when the anim clip ENDS, not at a separate `andreaCut`.** If the anim clip is shorter than `andreaCut` (clip 361f@24fps ≈ 451 frame-slots vs cut 713), the P1 sequence ends and P2 hasn't started → a **blank-blue gap** (just the pill) mid-beat. Fix: `const p1End = Math.min(cut, p1Len)`; play anim `from 0 dur p1End`, Andrea `from p1End`. Verify the Andrea clip is long enough to cover `dur - p1End` | b05a ~8.7s + b06a ~1.4s blank gaps, caught in QC (proof stills sampled INSIDE the anim window and missed it) |
| 9.2 | **QC must sample the anim-end → cut WINDOW, not just inside the clip.** A mid-beat proof still lands inside the animation and looks fine; the gap lives between clip-end and the next element. Sample every two-phase beat at ~60–90% of P1's expected span AND just after the clip's known frame length | same as 9.1 |
| 9.3 | **Vignette stills are FULL-FRAME 16:9 — never window them to a sub-height.** An old `top:120/height:600` window silently cropped 150px off the top AND bottom of every still (clipboard clip, contract corners gone). The art IS the frame (bg-normalized to canonical blue) — draw it 1600×900 edge-to-edge; a gentle center push (1.0→1.035) is safe. Jarrad: "things are cut off" | 4A v1 proofs |
| 9.4 | **Corner-avatar circle: MEASURE the head off a native frame, don't guess; keep zoom low.** Code assumed head at y210 (actually her shoulders) and zoomed 1.9× → head shoved out the top of the circle + upscaled to mush. Extract a native frame, measure (head center ≈ 630,120 in the 1280×720 source), frame ~283px of source into the 340 circle (≈1.2× = crisp) | 4A v1, Jarrad "avatar cut off, quality terrible" |
| 9.5 | **Standalone stage/label pills = the WHITE Sticker V1 card, ALWAYS. Never invent a colored variant.** Colored the single stage pill yellow/cream (to encode ownership) → off-brand vs every other module. `Sticker.tsx` hardcodes white; match it. Encode semantics (ownership) on the diagram/map beats, not on the label chrome | 4A, Jarrad "consistency, consistency, consistency" |
| 9.6 | **Text density: on a diagram lesson, show the FULL node row only on the 1–2 "map" beats; every teaching beat = art + voice + ONE stage pill.** Stacking the 6-pill row + per-beat annotation lists (checks, CRM rows, verbs, exit captions) that re-type the narration reads as "slop." Rule: on-screen text only where the voice does NOT already say it | 4A text-density pass (Jarrad `walk` Option B) |
| 9.7 | **The review harness itself can hide defects — QC it too.** The proof gallery used `object-fit: cover`, cropping the frames being shown for approval (clipped versions of already-clipped art). Show proof frames at their true aspect (`height:auto`, no cover) | 4A gallery |
| 8.12 | **To calm an over-gesturing HeyGen avatar, the `motion_prompt` WORDING is the lever, not `expressiveness:low`** (which wasn't enough). Say it explicitly: "hands resting still, barely any hand movement, NO large or sweeping gestures; only a small wave at the very end" | 2B v3 outro re-roll |

## 10. Lesson 5A findings (2026-07-05 — Module 05, "Opening the Call", v2 revision pass)

| # | Rule | Incident |
|---|------|----------|
| 10.1 | **A portrait HeyGen avatar's gray-pad inset is CROP-SPECIFIC — MEASURE it per clip, never copy another lesson's value.** 3B's 1A-avatar clip used `inset(0 513px 0 512px)`; blindly reusing it on 5A's b04a would have cropped INTO Andrea. Measured 5A's clip: blue strip at native x400–879 of 1280 (symmetric 480px) → scaled to the 1600px HeroBeat element = strip 500–1100 → `clipPath: inset(0 506px 0 506px)` (6px over-crop into the strip kills the anti-alias fringe). Verify: sample a mid-height row, find the first/last "blue" pixel, and confirm the strip bg (`#5baded`) ≈ the `HERO_BLUE #56aaee` backing so the seam is invisible | b04a full-body 1A avatar; measured vs the handoff's assumed 513/512 |
| 10.2 | **`heroInset` is a per-beat manifest flag, gated in `HeroBeat`** — `build_manifest_5A.py` carries a `HERO_INSET = {tag}` set → emits `e["heroInset"]=True`; `HeroBeat` switches `backgroundColor` to `HERO_BLUE` and applies the `clipPath` only when the flag is set (normal hero beats untouched). Clean, additive, no risk to b01/b03/b13 | 5A b04a |
| 10.3 | **A ticking clock hand = discrete per-second step, in code.** `StopwatchBeat`: `sec = Math.floor(frame/fps); secDeg = (sec%60)*6` gives a real tick (6°/s jump), NOT a smooth sweep — reads as a working stopwatch. `useCurrentFrame()` is BEAT-relative, so proof-frame math must add the beat's absolute start | b02 "real stopwatch, ticking" note |
| 10.4 | **Spring-slam stamps land on the trigger WORD via `beat.cues`** — `StampBeat` reads word-timed cue frames (approved/denied) from the manifest (`CUES` → `word_frame`), each stamp `spring`s from scale 2.5→1.0 with a punchy `{damping:9, stiffness:210}`. Two tilted rubber stamps (APPROVED orange / DENIED ink) reading clearly on a code document beats a two-doors metaphor | b05 doors→stamps |
| 10.5 | **This composition uses NAIVE cumulative beat positioning (no transition-overlap reduction) — proof-frame math is a plain durationInFrames cumsum.** I over-thought it with overlap subtraction and rendered a b05 proof 33 frames early (still showing b04b). Just sum `durationInFrames`; land proof frames comfortably inside the interior | 5A proof pass, b05 mis-framed once |
| 10.6 | **Transitions = SLIDE in/out everywhere; `fade()` ONLY at the open/close bookends — never mid-lesson, incl. mid-lesson hero beats.** The generic "fade if prev/next is `hero`" rule fades every mid-lesson avatar cut, which Jarrad reads as "the fading in" he dislikes. Gate the fade on the bookend TAGS (`prev.tag==='b01…' \|\| next.tag==='b13…'`), not the mode, so mid-lesson heroes slide like everything else. STANDING preference (memory `course-transitions-slide-not-fade`) — apply to every lesson. Reaffirms 7.13 | 5A v2→v3, Jarrad watch-through |
| 10.7 | **A Seedance "person reaches for X" clip often fails the intent — freeze it to the still.** b08's seller-off-couch clip never convincingly grabbed the pen (read as an awkward shuffle/"walking"); Jarrad: just make it a still. The Seedance SOURCE still (`prop` mode + gentle push-in) is already on hand and reads cleanly — a frozen reach is fine, an unconvincing animated one is not. Prefer a still over re-rolling a subtle intentful action | 5A v3, b08 |

## 11. Lesson 7A findings (2026-07-05 — Module 07, "Objection Architecture")

| # | Rule | Incident |
|---|------|----------|
| 11.1 | **Deliver large full cuts to Jarrad's phone via the Google Drive for Desktop MOUNT, not the inline-base64 MCP.** The `create_file` Drive MCP only takes inline `base64Content` — a 62 MB cut = ~83 MB base64 = millions of tokens through context, impossible (the mobile note's "≤14KB" limit is why: that path is PREVIEW-only). Real path: copy into `~/Library/CloudStorage/GoogleDrive-jarrad@bmhgroupkc.com/My Drive/BMH Lesson <X> — <Title>/` (auto-syncs). Then confirm + get the share link with the Drive `search_files` MCP (`title = '<file>'` → `viewUrl`). gcloud's token has no Drive scope here; no rclone. | 62 MB 7A cut; 97 MB 6A cut already on Drive via the same mount |
| 11.2 | **Alpha Seedance clip over CODE blue: render the base still ONLY as the hold-tail (`frame >= sum(clipFrames)`), NEVER underneath the clip.** The clip is transparent-bg alpha ProRes; if the still sits under it the whole time, the still's character shows THROUGH the clip's transparent areas = two overlapping characters. Clips end-on-start-pose, so gating the still to the tail is seamless. (LessonB's VideoBeat renders the still unconditionally — that only worked because its clips were opaque.) | 7A VideoBeat design |
| 11.3 | **2-panel "slide" beat (calltype b04): one 3200-wide container, `translateX 0→−1600` eased on the trigger word; each 1600-wide panel is its own clip→still-tail; labels are `position:absolute` INSIDE their panel so they travel with the camera.** Cold panel A → warm panel B on "warmed". | b04 cold-caller → warmed-up |
| 11.4 | **Tie a later per-item beat back to an earlier overview grid with a small corner "quad" indicator** (2×2, active cell yellow) — b06–09 each light cell 1→4 of the b05 "4 RESPONSE TYPES" grid. Pair a word-timed label (top) with the response caption (bottom, opposite edge). | 7A type beats |
| 11.5 | **Dump every word-timed delay and eyeball it BEFORE rendering — a trigger word can land at the very end of its beat.** "wait" was b06's closing word (22.0s of 22.6s) → the "→ GIVE SPACE, WAIT" caption flashed 1.6s; retriggered on "space" (15.2s) for an 8s read. Same pass confirms substring matches didn't misfire ("real" not "Realtor", "ask" not "asking") and steps stay monotonic. | b06 caption near-miss |
| 11.6 | **STANDING policy patch (supersedes §2/§4 "code motion for characters"):** every illustrated slide is animated via **Seedance** (triple-clamp); Remotion does word-timed text + transitions ONLY. Code motion is reserved for pure-diagram beats (grid, staircase, lockup) and all text. Jarrad: "code drawing motion is terrible." | 7A / Jarrad 2026-07-05 |
| 11.7 | **Hold a clip's OWN last frame for the freeze-tail, never a separately-generated still — and QC the seam by DIFFING CONSECUTIVE FRAMES, not eyeballing start/mid/end.** 7A v1 held each 15s Seedance clip with its normalized *start-pose* still; same pose, but the video-decoded frame and the PNG went through different colour pipelines → a **1-frame ~4–5/255 whole-frame pop** at every clip→still handoff (×9). Static start/mid/end sampling can't see it (both sides look identical); it only shows on playback, and Jarrad caught it. FIX: `ffmpeg -sseof -0.06 -i clip.mov -frames:v 1 -pix_fmt rgba tail.png` — the clip's actual last frame (same pipeline) → held STATIC in the tsx (drop the Ken-Burns push so it's a true freeze). Re-diff verified the jump fell to <0.5 (from ~4–5). QC skill patched: consecutive-frame diff at every boundary, flag any 1-frame Δ>1.5. | 7A v1→v1.1 freeze-tail |

## 12. Lesson 5B findings (2026-07-06 — Module 05, "The Fact Find")

| # | Rule | Incident |
|---|------|----------|
| 12.1 | **Anchor EVERY recurring character, not just Andrea — a non-Andrea character with no `-i` ref drifts between gens.** 5B's seller was generated independently in the interrogation still and the conversation still → two different-looking people (bun+yellow vs curly+orange); Jarrad caught it ("always make this the seller"). FIX: pick the canonical instance, **crop it** (`ffmpeg crop=W:H:X:0` → `course-assets/scenes/<mod>-<lesson>/_anchors/<char>.png`), and feed that crop as an extra `-i` ref on every other gen that includes the character, with "IDENTICAL to the attached reference: <hair, outfit, face>". Extends the §110 Andrea rule to the whole cast — each recurring seller/customer needs its own anchor image | b02 interrogation vs conversation seller mismatch |
| 12.2 | **A style-helper that takes a `label`/text arg but returns only a style object renders an EMPTY element — pass the text as children.** `ContrastBeat`'s `cornerTag('NOT AN INTERROGATION ✕', color)` returned `React.CSSProperties`; `<div style={cornerTag(...)} />` had no children, so the corner pill rendered blank (sized by padding only). FIX: `cornerStyle(color)` returns the style, `<div style={cornerStyle(c)}>NOT AN INTERROGATION ✕</div>`. Caught only because I proof-QC'd the b02 frame — a per-beat frame check catches "text-missing" bugs a compile never will | 5B v1 render, empty corner pills |
| 12.3 | **DON'T spawn a git worktree when the pipeline lives UNCOMMITTED in the main tree.** The whole `docs/course-production` pipeline (remotion/src, scripts, badge) is uncommitted at HEAD, and `course-assets/` is gitignored — so a fresh `git worktree` checkout is empty of `Lesson*.tsx`, node_modules, badge, and every asset. Isolation here is the guide-§6 mechanism: **disjoint `*lesson<X>*` / `module-<NN>-lesson<X>` paths in the main tree** + a NEXT-SESSION claim, NOT a worktree. (A worktree only helps once the source is committed.) Confirmed the live 5A tab and all siblings coexist this way | 5B setup; created a worktree, found it empty, tore it down |
| 12.4 | **Code concept-beats scale cleanly — reuse one component across beats via a manifest `mark`/data field.** 5B's `ChecklistBeat` serves both b04 (ownership, `mark:'check'`, yellow ✓ boxes) and b08 (mistakes, `mark:'cross'`, white ✕ boxes) off `beat.card = {title, rows:[{text,delay}]}` with word-timed row springs; `EmphasisBeat`/`SmileBeat`/`ContrastBeat` are similarly data-driven. New modes cost a `case` in `beatContent` + a manifest dict — no per-beat bespoke code | 5B b04/b06/b07/b08 all code beats |

## 13. Lesson 9A findings (2026-07-06 — Module 09, "Seller FAQ Decoder")

| # | Rule | Incident |
|---|------|----------|
| 13.1 | **Noses must MATCH the canonical cast-board style — a small subtle curved hook/comma line — NOT removed, NOT big/pointed/bracket-shaped.** Codex kept drawing wrong-shaped noses (pointed/curved-beak/bracket); Jarrad's note was "make the nose match the previous modules," which I first mis-read as "remove noses" (WRONG — cost a full re-roll round). Correct fix: in the still prompt say "small subtle curved nose exactly like the attached cast board (a tiny hook/comma), NOT large/pointed/bracket," keep the cast board as an `-i` ref, and Claude-QC the nose SHAPE against `cb_andrea`/shipped `m02_L2A_b06_motivated` before the gate. Noses stay — every shipped module (1A–8A) has them. **LESSON: don't extrapolate a style note into a bigger rule than stated; match the reference, don't invent a new convention.** | 9A still gate, v1 wrong-noses → v2 wrongly-noseless → v3 matched |
| 13.2 | **A recurring non-Andrea character needs a clearly DIFFERENT hair color/style, not just a different prop — even if the cast board makes them look similar.** 9A's Beth (cast-board: dark curly hair + yellow top, same as Andrea) read "far too close to Andrea." Prop/clip differences aren't enough. FIX: diverge the hair (Beth → light-brown ponytail) + top color (→ orange) while keeping her role signifier (moving box + orange clip). Extends 8.7 (customer ≠ Andrea) and 12.1 (anchor each character) | 9A b08 Beth re-roll |



## 14. Lesson 6A v2 findings (2026-07-06 — Module 06, "Discovery")

| # | Rule | Incident |
|---|------|----------|
| 14.1 | **"phone representative" in an edit prompt makes nano_banana draw a literal smartphone-with-a-face mascot — name the CAST character + anchor its crop.** 6A v2's iceberg/dig edits said "add a BMH phone representative doodle" with no ref -> nano invented a phone mascot (Jarrad rejected). The real rep is **Priya** (`docs/design/cast-board.png`, bottom row: black ponytail, orange headset+boom mic, yellow top). FIX: `ffmpeg crop` a clean label-free Priya from the cast-board -> upload as a Higgsfield media -> pass as a role:"image" ref, prompt "replace X with the woman in the SECOND image." Extends 12.1 to ADDED characters, not just recurring stills. | 6A v2 iceberg+dig phone-mascot |
| 14.2 | **nano_banana_2 multi-image edits: role MUST be `image` (not `image_references`), and the server routes to `nano_banana_flash` @1k.** role "image_references" 400s ("Allowed: [image]"). Two `image` medias = base-to-edit + character-ref. Output drops to 1376x768 (1k) vs 2k single-image edits — fine composited to 1600x900, just softer. | 6A v2 Priya swap |
| 14.3 | **Force FLAT WHITE faces on edited characters — nano adds peach skin + pink cheeks by default.** dig-Priya came back skin-toned; Jarrad: "she's supposed to be white." One more pass: "face and hands a FLAT PLAIN WHITE fill, NO peach/tan skin tone, NO pink cheeks." Palette rule #4 applies to AI edits too. | 6A v2 dig face |
| 14.4 | **Office "walk-through" motion: START-IMAGE ONLY (no end_image clamp) or walkers march in place.** v1 used start=end same-frame clamp -> the 2 standing people marched in place. v2 bake-off (5 models, start_image only): `seedance_2_0` won (walk across & exit, reps idle, camera locked). `veo3_1_lite` DQ'd (background morphed to a 3D pendant-lit office + push-in + painterly drift); `wan2_7` clone-merge; `kling3_0` huddled instead of exiting. Even when relaxing no-new-characters for background traffic, NEGATIVE-list duplicate/morph/style-change/3D/zoom. | 6A v2 b02 bake-off |
| 14.5 | **`bob` + `maskreveal` Remotion modes (Lesson6A.tsx).** `bob` = whole still rocks +-8px vertical sine @0.22Hz (floats rigidly — fixes a detached-element look with no keying). `maskreveal` = `beat.hero` OffthreadVideo (muted) until `beat.swapFrame`, then the still with push-in; manifest `SWAP={tag:frame}` (b04 swap=370=12.319s: Andrea to camera, then cut to the mask still). | 6A v2 b03 iceberg, b04 mask |

## 15. Lesson 8A findings (2026-07-07 — Module 08, "Complex Objections")

| # | Rule | Incident |
|---|------|----------|
| 15.1 | **Seedance clips are 24fps / 361 frames for a "15s" generation — and Remotion's near-EOF frame picking may never display the file's FINAL frames.** If the triple-clamp's snap-back-to-start-pose lands in those last instants (a drifting camera returning home), the `-sseof` tail png (wide pose) pops 6-7/255 against the on-screen (still-drifted) frame. FIX: per-tag `TRIM` dict in the builder — freeze earlier (b06: 14.5s) and extract the tail at that SAME timestamp with `-ss`, so the held frame is the one actually shown. The boundary-diff QC (11.7) is what catches this; static sampling cannot. | 8A b06: 6.94 luma pop at clip→tail, fixed to 0.78 |
| 15.2 | **QC scripts can silently lie: ffmpeg `signalstats/metadata=print` writes to STDERR with `key=value` format.** My first harness parsed stdout for `YAVG:` — every boundary "passed" with sentinel −1. Treat a sentinel/parse-failure value as PARSE-ERR, never OK, and eyeball one raw ffmpeg output before trusting a new measurement. A wrong QC pass is worse than no QC. | 8A first QC run faked 6 passing handoffs |
| 15.3 | **A photo avatar built from a SEATED full-scene image needs its own circle crop measurement (9.4 again) AND scale ~1.55x, not the head-math from a standing avatar.** Computed 1.19x "measured" crop still showed torso+scenery; the proven look is face+hair filling the circle (1A zoom class). Beach circle: video 1984×1116 at left −786, top −183. | 8A b04/b07/b09 circles, proof pass |
| 15.4 | **Long labels anchored top-right MUST be right-anchored (own V1-style card with `right:60` + transformOrigin right), not left-positioned Stickers.** Shared `Sticker.tsx` only anchors from the left; two 8A labels clipped at the 1600px edge in proofs. `RightLabel` in Lesson8A.tsx is the pattern to copy. | 8A b07/b09 labels clipped |
| 15.5 | **Same-frame-clamp end snaps are a MOTION-design risk on drifting cameras:** "gentle slow drift/push-in" + end_image clamp = the model hides the return-to-start in the final frames. Either lock the camera, or expect to TRIM the tail. Camera energy on scene beats remains desired — just budget for the trim. | 8A b06 vs the 5 clean drift clips |
| 15.6 | **Prompting the SAME literal instruction louder doesn't move gpt-image-2 off a compositional prior — redesign the shot instead.** b09's "rotate the document" failed 7 times (page pinned at ~15° lean regardless of wording, arm at ~40°); making Ray HOLD the portrait page made the geometry structural and it landed first try. Cousin of 2.7 ("don't fight hallucinations, redesign"). Also: measure the geometry (angles off the actual pixels) before claiming a spatial note is fixed — Jarrad caught two "fixed" versions that weren't. | 8A b09 v1–v8 saga |

## 16. Global Remotion Text + Transition Rules (2026-07-08)

| # | Rule | Incident |
|---|------|----------|
| 16.1 | **Default transient Remotion labels to bottom-center and show only ONE label at a time.** Unless the scene card gives a specific reason for another placement (diagram pointer, panel-local label, avoiding Andrea, etc.), every label/caption should appear bottom-center. When the next label arrives, the previous label must exit/clear first; never let stickers accumulate into a stacked label pile. Non-bottom labels are allowed only when they point to a specific prop/diagram/object and that purpose is documented in the scene card. | 11A v1 stacked labels; Jarrad clarified the standing rule: "one label should move away and then the next should come about" |
| 16.2 | **Use 1A-style camera-travel slide transitions exclusively for normal beat changes.** Seed directions with the varying beat tag chars (`charCodeAt(1)+charCodeAt(2)`), so the transition feels like the camera moves to a different location on one flat blue plane. Fades are reserved for explicit true open/close/end-card moments; cuts/pop-ins only inside an explicitly designed title-card/diagram sequence. | 11A v1 used a closing fade and non-1A transition logic; Jarrad clarified that beat changes should look like camera movement on a plane |

## 12.x — Lesson 17 findings (2026-07-10, approved "best video yet")
- **Selective camera lock/free (NEW default):** lock Seedance's camera ONLY where overlays/geometry demand it (grids, split panels, path diagrams); prompt "subtle cinematic camera energy" on character/scene beats. Jarrad specifically praised the resulting push-ins (b04 handoff, b09 finish line).
- **HeyGen photo-avatar plate seam:** avatar plate bg renders on a *different* blue than the requested background fill (measured 10/255 seam). Fix at source in the manifest builder: sample the seam x-bounds, crop inside the plate, `lutrgb` the plate onto exact canonical, pad back to 16:9 with canonical fill. Never ship a heromid clip unmeasured.
- **heromid mode exists** (Lesson17.tsx): mid-lesson full-screen Andrea clip, freeze-tail on own last frame, bottom sticker retained, SLIDE transitions (mid-lesson fades stay banned — isHero() must exclude heromid).
- **Seedance cute-ification:** inanimate objects can grow smiley faces near clip end (b03 envelope). Negative line that fixed it one-shot: "no faces on objects, no eyes or mouths appearing on X, object never changes". Also: soft drop-shadows appear under traveling objects — "stays perfectly flat on the 2D plane, NO drop shadow" fixed it.
- **Beats with no art:** when a graphic is semantically empty (rejected three-blocks), word-timed lockup pills carry the meaning better than a metaphor. 7A lockup pattern reuses cleanly.
- **QuickTime delivery:** Remotion raw = yuvj420p full-range → freezes QuickTime frame 1. Always deliver a `-QT` re-encode (`scale=in_range=full:out_range=tv,format=yuv420p`, bt709 tags) for local review.

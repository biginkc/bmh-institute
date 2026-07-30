# MODULE PRODUCTION GUIDE — the complete runbook (v1, 2026-07-04)

**Audience: a FRESH Claude session with zero prior context**, assigned to produce one course module's videos concurrently with other tabs. Follow this top to bottom. Where this guide conflicts with older notes, THIS GUIDE + `PLAYBOOK.md` win.

**Read order for a new tab:** this file → `PLAYBOOK.md` (every hard-won rule) → `ARCHITECTURE.md` (motion recipes) → `scene-card-v2.md` (beat format + standing rules) → `NEXT-SESSION.md` (live state). Reference lessons: `shotlists/module-01-lessonA-scenecards.md`, `shotlists/module-01-lessonB-scenecards.md`, compositions `remotion/src/LessonA.tsx` / `LessonB.tsx` (LessonB is the newer pattern — copy it).

---

## 0. The product

Doodle-style training videos for BMH Group's 19-module Follow-Up Specialist course. Each lesson ≈ 3–6 min: **Andrea** (HeyGen avatar) narrates; flat doodle scenes illustrate; Remotion assembles. Locked visual brand: flat sticker-sheet doodle, thick wobbly black outlines, flat fills, **5-color palette (yellow #FFD23F-ish, orange, cream #FFF7DE, white, black) on cornflower blue `#62b3f3`** — no gradients, no shading, no skin tones, no text baked into AI images.

## 1. The three layers (who does what)

| Layer | Owns | Never |
|---|---|---|
| **HeyGen** (API) | Andrea only — talking avatar clips (hero full-frame + corner circle) | never animate Andrea any other way |
| **Seedance 2.0** (Higgsfield MCP) | Scene/character animation clips from approved stills | **Grok is RETIRED** (drifts, ignores refs) |
| **Remotion** (`remotion/`) | Assembly: transitions, word-timed text, code motion, compositing | no baked-in AI text — all text is code (`Sticker.tsx`, V1 white card, Baloo 2) |

Still images: **Codex `gpt-image-2` generates, Claude judges** (generator never self-grades). Voice: **Elizabeth-Friendly** all narration; **Elizabeth-Excited** only for a finale beat.

## 2. Credentials & IDs (durable)

- **HeyGen API key:** `~/.config/bmh-course/heygen.key` (read it in scripts; NEVER print it). 1Password item "HeyGen - API" may still hold a dead key.
- **Voices:** Friendly `55f8c0f546884f9cbdefa113f5e7b682` · Excited `91120f72682e4459a19e311ba2ee4cb2` (soothing/serious exist, unused).
- **Avatars (photo/talking ids used in /v3/videos):** headset Andrea `e527528e584a404f9da68ee4faca1353` (corner circles + generic hero) · office Andrea `63396931e03943f19c7261cdc675e623` · cafe Andrea `b2cd05454d284058ad8d7303545821e6` (1B bookends) · yoga Andrea `bbb4c71f220545a5b907fd6fe0239b75` (built, rejected — don't use).
- **Design refs (repo):** `docs/design/style-ref-1.png`, `style-ref-2.png`, `cast-board.png`, `object-board.png`. Approved Andrea identity image: `course-assets/avatar-candidates/andrea_headset_v2.png`.
- **Higgsfield ref media_ids (already uploaded, reusable):** style-ref-1 `b345db3c-3cf3-44e8-b890-53b1b80f6a91` · object-board `ff847fda-ecb4-450e-b1f9-0293e9bc1edb` · cast-board `c86e1fa9-df75-4cbc-ba32-8479b0829538`.

## 3. Directory map (per lesson `<X>` = e.g. `2A`)

```
course-assets/scenes/module-<NN>/          # stills (m<NN>_L<X>_<tag>.png)
course-assets/heygen/lesson<X>/            # wavs, _state.json (word timestamps!), avatar clips
course-assets/heygen/lesson<X>/grok/       # animation clips (Seedance) — name anim_<tag>.mp4
course-assets/review-lesson<X>/            # deliverables to Jarrad
docs/course-production/remotion/public/lesson<X>/   # manifest.json, master.m4a, stills/, hero/, circle/
docs/course-production/remotion/src/Lesson<X>.tsx   # composition (copy LessonB.tsx)
docs/course-production/scripts/            # TEMPLATE scripts — copy per lesson, edit the BEATS/CLIPS tables
docs/course-production/shotlists/          # scripts + scene cards
```

## 4. Pipeline — stage by stage

### Stage 1 — Script & beats
0. **SOURCE OF TRUTH: `~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md` (the locked master).** Every per-lesson script derives from its slot there — DIFF the derived script against the master before generating any audio, and pull the outro's next-module tease from the master's own closing line (it names the next slot — 1C's "terms" tease was wrong; the master said "Next stop: the close"). Approved downstream wording changes (visual-driven rewrites) are fine but must be flagged to Jarrad as master deviations.
1. Source script → clean: rename narrator to **Andrea**, strip stage directions, **dedup repeated sentences/fragments** (script splits leave duplicates — 1C had two), split at natural topic pivots (lesson ≈ 5–6 min ≈ 800–900 words; save overflow as the next lesson's script).
2. Split into beats (one visual idea each; a "principle + story" pair = two beats `bNNa`/`bNNb`). Write scene cards (`scene-card-v2.md` format): tag, verbatim VO span, Andrea mode (`hero` / `corner-circle` / `voice-only`), visual, motion, word-timed text + trigger word.
3. **Gate the storyboard with Jarrad in text form before generating anything.**

### Stage 2 — Audio (echo-free decoupled pipeline; NEVER script+voice_id in /v3/videos)
Copy `scripts/gen_audio_TEMPLATE.py`, edit BEATS list. Per beat: `POST /v3/voices/speech {text, voice_id, speed:1.0}` → download wav → `loudnorm=I=-16:TP=-1.5:LRA=11` → save + **word_timestamps into `_state.json`** (drives every word-timed pop). ~1.5s pause between calls.
**`speed:1.0` is the default; 0.95 reads as slow-mo at paragraph length — 7B opening, 2026-07-06.**
**Inter-beat gaps (standing, revised Jarrad 2026-07-04): the master audio gets 1.0s of silence BETWEEN beats** — insert at manifest build (see `build_manifest_1C.py` GAP: silence wav interleaved into the concat; each beat's durationInFrames includes its gap so the scene lingers through it). Don't bake gaps into beat wavs. 1.5–2s tested in 1C v1 and read to Jarrad as "the video sounds slowed down" (PLAYBOOK 7.14).

### Stage 3 — Stills (Codex generates, Claude judges, Jarrad approves)
Copy `scripts/gen_stills_TEMPLATE.sh` pattern: prompt via stdin to `codex exec -i <refs> --skip-git-repo-check --sandbox workspace-write`, one background lane per image, all lanes in ONE turn.
- **Verify every `-i` ref path exists first** — missing refs FAIL SILENTLY.
- Recurring character in a new pose/setting → attach the approved identity image + "IDENTICAL face: small dot eyes, tiny nose, simple smile".
- STYLE block (see template) + "No text or words anywhere" (exception: one caps word/numeral, judge for garbling).
- Claude judges each still vs standing rules (no ambient doodles: hearts/sparkles/notes/bubbles/motion-marks; palette; centered for voice-only; nothing clipped). Fix with native-bg `drawbox` fills (sample the still's own bg hex — they vary slightly; normalization to canonical blue happens later at manifest build).
- **Send each still to Jarrad INDIVIDUALLY: filename + one-line purpose.** Full pre-assembly gate: EVERY artifact before assembly.

### Stage 4 — Andrea clips (HeyGen)
Copy `scripts/gen_avatar_clips_TEMPLATE.py`, edit CLIPS. Upload beat wav as asset → `POST /v3/videos {type:avatar, avatar_id, audio_asset_id, resolution:720p, aspect_ratio:16:9, expressiveness:low, motion_prompt}` → poll → download. Hero beats = full-frame; corner-circle beats use the headset avatar (crop happens in Remotion). New setting avatar: image → `/v3/assets` → `/v3/avatars {type:photo, name:"<label>", file:{type:asset_id, asset_id}}` → id at `data.avatar_item.id`, wait ~45s → test clip → **gate with Jarrad before batch**. (**`name` is REQUIRED** — omitting it 400s; found 2026-07-04.)

### Stage 5 — Animation clips (Seedance triple-clamp — THE recipe, tested 2026-07-04)
Via Higgsfield MCP (`mcp__higgsfield__*`, ToolSearch "higgsfield"):
1. `media_upload {files:[{filename, path}]}` → curl PUT the bytes → `media_confirm {type:"image", media_id}`.
2. `generate_video params: {model:"seedance_2_0", mode:"std", resolution:"720p", duration:15, generate_audio:false, medias:[{value:<still>, role:"start_image"}, {value:<SAME still>, role:"end_image"}, {value:<cast-board>, role:"image_references"}, {value:<style-ref>, role:"image_references"}], prompt:"<style lock + SCENE/MOTION + locked camera + NEGATIVE line>"}` — full prompt spine in ARCHITECTURE.md "NEW MOTION RECIPE OF RECORD".
   **Duration 15s = the standing rule** (model max; clips never loop — the same-frame clamp lands the clip back on its start pose, so a hold-still tail extends longer beats seamlessly). Superseded the earlier 4–5s guidance 2026-07-04 (1C).
   **Motion design (1C-proven):** idles/gestures, NOT walk-cycle traversals (a walker vanished mid-clip and reappeared on the wrong path — Seedance shares PLAYBOOK 2.10's failure). If a roll pushes in or grows furniture where geometry must hold, re-roll adding "NO new furniture or objects EVER appear; the whole still frame stays fully in view at all times" — one-shot fix on 1C.
3. If it bounces with `preset_recommendation` → re-fire adding `declined_preset_id`.
4. `job_status {jobId}` → download `results.rawUrl`.
5. **QC before Jarrad sees it:** DENSE-SWEEP the whole clip at 0.5s cadence (30 frames/15s; grids for sweep, full-res zoom on suspects); judge duplicate/new characters, morphing props, STYLE drift, and key content leaving frame. Camera movement/multi-shot reframes are WELCOME (Jarrad prefers them — prompt "subtle cinematic camera energy" on scene beats); lock the camera only where word-timed stickers/circle pockets/window composites need stable geometry. Single-character scenes: "EXACTLY ONE PERSON at all times" + duplicate/clone in the NEGATIVE line. No seeds exist — reject-and-rerun or batch `count` and select. Reuse good clips; `motion_control` can transfer proven motion.
6. Gate clips with Jarrad individually.

### Stage 6 — Assembly (Remotion)
Copy `LessonB.tsx` → `Lesson<X>.tsx`; register in `Root.tsx`. Copy `scripts/build_manifest_TEMPLATE.py`, edit BEATS/LABELS/EXTRAS:
- Audio = master clock: builder concats beat wavs → `master.m4a`; beat durations from wav via ffprobe.
- Stills normalized to canonical blue at ingest (sample native bg → colorkey → overlay on `#62b3f3`).
- Word-timed labels: `labelDelay` computed from `_state.json` word timestamps (trigger word per beat). Principle/story text = V1 white-card `Sticker` (never baked into art). Transient teaching labels default to **bottom-center** and render as a **single-label queue**: one label visible at a time, replaced by the next label on its trigger. Non-bottom placement is only for an explicit prop/diagram purpose documented in the scene card.
- Modes available in LessonB.tsx: `hero` (avatar clip full-frame, muted — master audio carries sound), `scene` (push-in), `card` (pop), `map`, `landlord`-style (still + code droplet), `movie` (two-phase: pop word-timed then slide), `calendar`, `recap` (cascade), + `circle` overlay (AndreaCircle: 1A crop numbers `width 1920 height 1080 left -790 top -17`), + `<BmhBadge/>` on the OPENING beat (standing rule).
- Animation clips composite as `<OffthreadVideo muted>` in place of/over the still; re-key clip blue to scene blue with bt709 in AND out if colors pop (PLAYBOOK).
- Fit-computed FRAME transforms for centering/corner pockets — nothing may clip; voice-only beats centered; corner beats keep the 420px bottom-right pocket clear.

### Stage 7 — QC (mandatory, before delivery)
Run the `custom-video-qc` skill procedure: per-beat frame harvest (transition-safe offsets), canonical-blue pixel check, edge-clip check, `silencedetect`/`volumedetect` (mean −20±6dB), Claude visual judgment of EVERY harvested frame vs standing rules, dense-sample animation clips' first 2s. Fix at the source → rebuild → re-render → re-QC. Loop until all-PASS.

### Stage 8 — Deliver & record
Copy render → `course-assets/review-lesson<X>/LESSON-<X>-v1-FULL.mp4` → SendUserFile to Jarrad with known-placeholder notes. Update `NEXT-SESSION.md` + scene cards + PLAYBOOK (new lessons learned) + vault `_inbox` capture + `_meta/log.md`.

## 5. Non-negotiable standing rules (compiled)
1. Full pre-assembly approval gate — every artifact to Jarrad first, individually (filename + one-line purpose).
2. Show completed work immediately; never batch deliveries behind other work.
3. Parallel lanes by default; one background process per generation; fire all independent lanes in ONE turn.
4. No ambient doodles. No skin tones. Palette locked (object-realism exception, e.g. kraft cardboard, is one-off).
5. Text always code-rendered (V1 white card, Baloo 2), word-timed from speech timestamps. Transient labels default bottom-center and one visible at a time; positioned labels require a documented prop/diagram purpose. One caps word/numeral max in art.
6. Voice-only beats centered; transforms fit-computed, never clip; Lesson 1A directional slide/camera-travel transitions for beat changes; fades only for explicit true open/close/end-card moments.
7. Match visuals to the WORDS they illustrate (clapperboard ≠ "clarity" beat — it belongs on "write the movie").
8. Generator never self-grades; Claude judges; Jarrad approves communication.
9. Never deliver un-QC'd; never claim "on-brand" without a side-by-side sanity check.
10. BMH badge lower-right on every module's opening beat.

## 6. Multi-tab coordination
- **One lesson per tab.** Claim it by adding a line to `NEXT-SESSION.md` §"IN PRODUCTION" (lesson + date). Don't touch another tab's lesson dirs or `Lesson<X>.tsx`.
- Shared, contention-safe: design refs, templates, uploaded Higgsfield ref media_ids, avatar/voice IDs.
- Shared, MUTABLE — append, don't rewrite: `Root.tsx` (add your one Composition line), `NEXT-SESSION.md`, `PLAYBOOK.md`.
- Credits (HeyGen + Higgsfield) are a shared pool — budget ≈ 20 HeyGen clips + ≈ 6–10 Seedance clips per lesson; if a provider errors with insufficient credit, STOP and tell Jarrad; don't drain the pool retrying.
- Jarrad's attention is the scarcest resource: batch your gate into clear individual sends; one decision at a time.

## 7. Known failure modes → fixes (details in PLAYBOOK.md)
echo in narration → you used /v3/videos TTS, use decoupled pipeline · quiet/slow audio → loudnorm −16 · style drift in animation → you're not on the triple-clamp recipe / control-test the day · character face drift in stills → identity image not attached · silent no-op edits → verify `str in file` before replace; never `tail -2` a build log · alpha webm shows opaque → OffthreadVideo needs `transparent` · Grok/Seedance dims lie → ffprobe the file · colors shift on re-encode → force bt709 both directions · `codex exec` in background → `< /dev/null` · HeyGen avatar id → `data.avatar_item.id` · Higgsfield medias schema → `{value, role}`.

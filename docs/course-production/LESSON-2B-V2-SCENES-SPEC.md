# Lesson 2B v2 — Situational Scene Stills (execution spec)

**Created 2026-07-05.** Self-contained handoff for a FRESH tab to build Lesson 2B v2. Everything you need is here + the standing runbook. Read `MODULE-PRODUCTION-GUIDE.md` first for pipeline conventions, then this file.

---

## 0. What 2B is + what v1 already shipped
Lesson 2B "Humanizing the Lead B / Meet the Sellers" (Chapter 2B of the BMH course). Five distressed sellers each tell their story **in their own voice**; Andrea (desk avatar) bookends. **v1 is DONE and Jarrad-approved-as-a-mechanic** — delivered as `course-assets/review-lesson2B/LESSON-2B-v1-FULL.mp4` (5:36, 9 beats). This spec is the ONE change v1→v2.

Source of truth for script: locked master `~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md` Slot 04-B (+ 3 authored seller additions logged there, approved 2026-07-04). Per-lesson script: `shotlists/module-02-lesson2B-script-clean.txt`. Scene cards: `shotlists/module-02-lesson2B-scenecards.md`.

## 1. THE CHANGE (only this)
Today each **seller beat** shows a plain head-and-shoulders **portrait** on blue during Andrea's setup narration, then cuts to the talking avatar when the seller speaks. Jarrad wants the setup to instead show a **full situational scene still that depicts the seller's problem, with the seller in the scene.** Talking-avatar mechanic is UNCHANGED.

**New per-seller-beat rhythm (Jarrad-locked 2026-07-05):**
1. **Setup** (Andrea describes, frames `0 → lineStart`) → NEW **situational scene still** (gentle push-in).
2. **Line** (seller speaks, `lineStart → lineEnd`) → talking-avatar clip (unchanged).
3. **Tag** (Andrea's closing line, `lineEnd → end`) → **clean head-shoulders portrait** on blue = existing `m02_L2B_<seller>.png`.

Ray (b04) has NO tag segment (setup→line only) — no portrait phase for Ray.
Recap grid (b07) keeps the head-shoulders portraits — DO NOT change.

## 2. The 5 situational scenes to generate
Full doodle scenes, cornflower-blue bg, brand style, **the canonical seller character inside the scene**. One caps word allowed per style exception (PAST DUE / LIEN) — judge for garbling, fall back to a Remotion sticker if it fails. **EXACTLY ONE PERSON per scene** + NEGATIVE (no clone).

- **david_scene** — David outside his tired east-side rental: sagging/gapped roof, a **PAST DUE** notice on the door, phone buzzing in his hand. Weary posture.
- **beth_scene** — Beth on the porch of her late mother's empty house: keys in one hand, a mortgage envelope in the other, a lone moving box + framed photo on the step. Quiet/dark house.
- **ray_scene** — Ray at his kitchen table staring at a lender's letter (red stamp), a wall clock behind him, an empty jacket over the chair (lost job). Overwhelmed.
- **carol_scene** — Carol at her front door holding a **LIEN** paper, a half-finished repair beside her (ladder + paint can, contractor gone). Frustrated.
- **marcus_scene** — Marcus beside his house with a rising water line around its base (underwater) and a tilted owe-vs-worth seesaw. Hands in pockets, stuck.

Output: `course-assets/scenes/module-02-lesson2B/m02_L2B_<seller>_scene.png` (1600×900).

### Generation recipe
Copy the `scripts/gen_stills_2B.sh` pattern (already exists, has the STYLE block). For EACH scene, the `codex exec` MUST attach the seller's approved portrait as an identity ref so the face matches the talking avatar:
```
codex exec -i docs/design/style-ref-1.png -i docs/design/style-ref-2.png -i docs/design/cast-board.png \
  -i course-assets/scenes/module-02-lesson2B/m02_L2B_<seller>.png \
  --skip-git-repo-check --sandbox workspace-write
```
Prompt = "Generate one image with gpt-image-2 … the person is the SAME character as the attached portrait m02_L2B_<seller>.png — IDENTICAL face: small dot eyes, tiny nose, simple features, same hair/build. SCENE: <situational description>. STYLE: <the gen_stills_2B.sh STYLE block>. EXACTLY ONE PERSON, no clone."
Fire all 5 as background lanes in one turn ([[parallel-lanes-by-default]]). **Claude judges each vs brand + the set (side-by-side, not in isolation — that miss cost a re-roll cycle in v1). Send each to Jarrad INDIVIDUALLY, filename + one-line purpose, and GATE — do not render until Jarrad approves all 5.**

## 3. Code changes (2 files)
### `docs/course-production/scripts/build_manifest_2B.py`
- In `BEATS`, add a `scene` filename to each seller row (david/beth/ray/carol/marcus → `m02_L2B_<seller>_scene.png`).
- In the seller-beat branch: normalize the scene still (`normalize_still`), set `e["scene"] = <scene lesson2B/stills path>`. Keep `e["still"] = <portrait path>` (used for the tag) and `e["clip"]` unchanged. `lineStart`/`lineEnd` already computed.

### `docs/course-production/remotion/src/Lesson2B.tsx` → `SellerBeat`
- Add `scene?: string` to the `Beat` type.
- Render **scene** still while `frame < lineEnd` (setup + underneath the clip); render **portrait** (`beat.still`) while `frame >= lineEnd` (tag). Keep `<Sequence from={lineStart} durationInFrames={lineEnd-lineStart}>` avatar-clip overlay. Push-in applies to the scene.
  (i.e. `{frame < le ? <Img scene push-in/> : <Img portrait/>}` + the clip Sequence as-is.)

No other files change.

## 4. Durable IDs / assets (all already exist — do NOT regenerate)
- **Portraits (approved):** `course-assets/scenes/module-02-lesson2B/m02_L2B_{david,beth,ray,carol,marcus}.png`
- **Seller talking clips:** `course-assets/heygen/lesson2B/seller_david_test.mp4`, `seller_{beth,ray,carol,marcus}.mp4`
- **Desk-Andrea clips:** `course-assets/heygen/lesson2B/andrea_{b01,b08,b09}.mp4`
- **Audio:** 18 wavs in `course-assets/heygen/lesson2B/` (`b01`, `b02a_andrea`,`b02b_david`,`b02c_andrea`, `b03a_andrea`,`b03b_beth`,`b03c_andrea`, `b04a_andrea`,`b04b_ray`, `b05a_andrea`,`b05b_carol`,`b05c_andrea`, `b06a_andrea`,`b06b_marcus`,`b06c_andrea`, `b07`,`b08`,`b09`) + `_state.json` (word timestamps) + `master.m4a`
- **Seller avatar IDs** (`_seller_avatars.json`): david `3ae5b20aaa5449c9a5c5eda01e5dccde` · beth `5452d7256aaa4a73b130e3011b3690dc` · ray `4fa0ef3ac09e4e0fa65954178e6cd5ae` · carol `99ed79b852224fbc874182d567979f02` · marcus `827c9d8331c84437913990c5ad290386`
- **Desk-Andrea avatar:** `8200f90176d6444a8d6943a664a71c1a` (matches 2A)
- **Voices:** David/Warm William `31e2fd6e7c924bc9be987ac4cfaac5e8` · Ray/Aaron `66da5fabd6b944b3a42f35aed9631ad2` · Marcus/Jude `3295c84534da424db838ee9a0085f24d` · Beth/Calm Chloe `77a8b81df32f482f851684c5e2ebb0d2` · Carol/Margaret `f0240e6cefd541ac8031eeb9f3b71a82` · Andrea Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682` / Excited `91120f72682e4459a19e311ba2ee4cb2`
- **HeyGen key:** `~/.config/bmh-course/heygen.key` (read in scripts, never print)

## 5. Render + QC + deliver
1. Generate 5 scenes → judge → **Jarrad approves each** (gate).
2. `cd docs/course-production/remotion && python3 ../scripts/build_manifest_2B.py` → confirm `missing: []`.
3. **Render via the ISOLATED root** (the shared `Root.tsx` is BROKEN — the 3B tab renamed its export `Lesson3BPreviewB3`→`Lesson3B` and left `Root.tsx` importing the dead name, so any render off the main root fails "component undefined"):
   `npx remotion render src/index2b.ts Lesson2B out/lesson2B.mp4`
   (`src/index2b.ts` + `src/Root2B.tsx` already exist and register only Lesson2B.)
4. QC (custom-video-qc): per seller, extract a setup frame + a line frame + a tag frame — confirm **scene → talking-avatar → portrait** plays in order, the face matches across all three, canonical blue `#62b3f3`, name-card sticker present, audio ≈ −20±6dB, no clones/ambient doodles, BMH badge on b01. Fix at source → rebuild → re-render → re-QC until clean.
5. `cp out/lesson2B.mp4 course-assets/review-lesson2B/LESSON-2B-v2-FULL.mp4` → SendUserFile to Jarrad. Update `NEXT-SESSION.md`, `shotlists/module-02-lesson2B-scenecards.md`, `~/BMH-OS/_meta/log.md`.

## 6. Standing rules + gotchas
- **Full pre-assembly gate:** every scene still to Jarrad individually before render; nothing renders unapproved.
- **Claude judges style; Codex/gpt-image-2 never self-grades.** Judge the SET side-by-side (v1 lesson).
- Palette locked 5-color on `#62b3f3`; no ambient doodles (hearts/sparkles/notes); no skin tones (cream faces); text code-rendered except the one caps-word exception.
- **Platform "safety gate" flap:** during v1 the classifier intermittently 400'd write/run tools ("claude-opus-4-8 temporarily unavailable"). Mitigations that worked: retry the same command 1–3×; write scripts via `cat > file <<'EOF'` heredoc; launch long jobs detached (`nohup python3 x.py </dev/null >log 2>&1 &`) so a flap can't kill them; read-only ops (ls/Read) bypass the gate. If fully stuck, schedule a wakeup to auto-retry.
- HeyGen/Higgsfield credit pools are shared across tabs — if a provider 402s, STOP and tell Jarrad. (v2 shouldn't need HeyGen — avatars/audio all exist; only Codex image-gen + Remotion.)
- Also open (not this task): fix the shared `Root.tsx`↔`Lesson3B` export mismatch; reconcile vault PR #301→#306 drift.

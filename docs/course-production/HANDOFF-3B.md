# HANDOFF — Lesson 3B "BMH Offer Playbook B" (Module 03 / Slot 05-B)

**Written 2026-07-05 for a fresh Claude tab.** Picking up mid-**Revision 2**. Lesson 3B v1 was built,
QC'd, and delivered; Jarrad watched it and gave 4 revision notes; I applied the script/manifest edits and
kicked off the still regeneration — **that regen was still running when context was cleared.** Your job:
finish Revision 2, QC, and reveal the updated cut. Read this whole file, then `MODULE-PRODUCTION-GUIDE.md`.

## 0. Environment (critical)
- **Write/command safety-classifier is flapping** ("claude-opus-4-8 is temporarily unavailable…") and
  blocks ~half to two-thirds of Write/Edit/Bash. **Just retry** — it lands eventually. Reads never block.
  Anthropic infra, not your code. If a batch fails partway, one op per turn.
- **Jarrad can't see `SendUserFile` or tool output.** Show him files with **`open -R "<path>"`** (Finder)
  or `open "<file>"` (QuickTime autoplay for audio). Inline `show_widget` works for a *faithful* mechanic
  demo only.
- **QC a rendered frame yourself BEFORE revealing.** ("check before you show me.") A failed render leaves
  the OLD mp4 on disk — read the render log first, never `[ -f ] && open` blindly.
- Short/plain replies; blunt pushback welcome; one decision at a time.

## 1. What 3B is
8 beats, verbatim from master `~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md` **Slot 05-B**
(`Chapter 3A.srt`, lines 1099-1175). Seller-profile/empathy deep-dive, second half after 3A. Runs 3:52.
Beats (1.0s gaps): b01 hero-Andrea+badge · b02 As-Is-Cash house+cash · b03 6-item checklist (ticks
word-timed, APPROVED) · b04 4 disqualifiers X word-timed · b05 run-down house+callouts · b06 talking
homeowner (Morgan voice) · b07 transformation slide · b08 hero-Andrea+outro tease (master line 1174).

**REVEAL MECHANIC (core rule):** stills are BACKGROUNDS; all text/checks/X/callouts are CODE and appear
ONLY on the exact word narrated — never an empty box before the word, never baked in. Non-negotiable.

## 2. IDs / paths
- HeyGen key `~/.config/bmh-course/heygen.key`. Andrea hero avatar `e527528e584a404f9da68ee4faca1353`
  (PORTRAIT → gray bars → `HeroBeat` clips `inset(0 513px 0 512px)` + `HERO_BLUE #56aaee` bg). B6 avatar
  `203ac03b07394344a3f796d032e14bf8` + voice Mature Morgan `e31e9614d31d4678be3377da14d99d3b` (APPROVED,
  clip `char_b06_homeowner.mp4` built). Andrea voice Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682`.
- Own ONLY `*lesson3B*` paths + `scripts/*_3B.*` + `scripts/gen_stills_3B.sh`. NOT `scenes/module-03/` (3A).
- **RENDER via standalone entry** (shared Root won't bundle: 2B tab's `public/lesson2B/manifest.json`
  missing): `npx remotion render src/preview3b.tsx Lesson3B out/lesson3B-full.mp4`.

## 3. Revision 2 (WHAT YOU'RE FINISHING — all approved; script+manifest edits DONE)
- R1 B2: cash → money-GREEN (palette exception for money); manifest already keeps ONLY the bottom caption
  "As-is · close fast · no repairs, no commissions" (top title dropped).
- R2 B4: crossed sign → `m03_L3B_s04_andrea-stop.png` = headset-Andrea, front-facing, arm up, palm-out
  "STOP", LEFT ~40% (inside clip=785). X-list stays right. Manifest b04 already points here.
- R3 B7: `m03_L3B_s07_relieved-seller.png` = relieved seller w/ green cash walking from the SAME distressed
  house as B5 (leaky roof, boarded window, weeds), yard sign reads SOLD. We buy as-is; house NOT renovated.
- Global: cash green everywhere (b02 + b07).

## 4. DONE vs PENDING
DONE: v1 delivered; `gen_stills_3B.sh` edited (STYLEG/STYLEGSOLD variants, `offer`=green, `notafit` case
RENAMED to `andreastop`, `relieved`=distressed+green+SOLD); `build_manifest_3B.py` edited (b02 caption-only,
b04→andrea-stop); `Lesson3B.tsx`+`preview3b.tsx` complete; B6 clip + heroes generated.

PENDING:
1. Regenerate+judge 3 stills: `cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production"`;
   `for k in offer andreastop relieved; do echo ">>> $k"; zsh scripts/gen_stills_3B.sh "$k" < /dev/null; done`.
   Read+judge in `course-assets/scenes/module-03-lesson3B/`: s02 green cash reads no-people; s04 ONE
   headset-Andrea palm-out inside left ~750px no-clone; s07 DISTRESSED house match s05 + green cash +
   legible SOLD + one person. Re-roll fails (SOLD garble → code Sticker fallback).
2. `python3 scripts/build_manifest_3B.py` then `cd remotion && npx remotion render src/preview3b.tsx Lesson3B out/lesson3B-full.mp4`.
3. QC frames (ffmpeg -ss, Read): b01~10 b02~40 b03~68 b04~100 b05~137 b06~158 b07~212 b08~222 s. Fix+re-render until clean. No reveal unchecked.
4. `cp out/lesson3B-full.mp4 ".../review-lesson3B/LESSON-3B-v1-FULL.mp4"`; `open -R` it; tell Jarrad.
5. Bump `NEXT-SESSION.md` 3B entry to note Rev2 applied.

## 5. Gotchas
Palette 5-color (yellow #FFD23F, orange, cream #FFF7DE, white, black on blue #62b3f3); GREEN authorized
for MONEY ONLY. No ambient doodles/skin tones; "one person no clone". Codex refs
`docs/design/{style-ref-1,style-ref-2,cast-board}.png`. Old-session bg jobs don't carry over — re-run.

## 6. Deferred (NOT 3B; mention only)
Drift gate: `_Active.md` + `mocs/MOC - v1.md` say Sandra fix "PR #301 OPEN" but it's now **PR #306**
(`decisions/Sandra PR 306 merge gate rules.md`). Update to #306, re-check June-19 backfill, tick
`_meta/contradictions.md`. Only if Jarrad asks.

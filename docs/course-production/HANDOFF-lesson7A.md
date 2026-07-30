# HANDOFF — Lesson 7A "Objection Architecture" (Module 07 / Slot 09)

**Status: Stage 6 (Remotion assembly). Everything upstream DONE + Jarrad-APPROVED. Resume by writing
`Lesson7A.tsx` + isolated render entry, then build manifest → render → QC → deliver.**

New tab: read `MODULE-PRODUCTION-GUIDE.md` first. Owns `*lesson7A*` / `module-07` ONLY; other tabs are on
this repo — stay namespaced, append-only to `NEXT-SESSION.md`/`Root.tsx`. Plan: `~/.claude/plans/deep-questing-hejlsberg.md`.

## DONE + approved (do NOT redo)
- **Scripts:** `shotlists/lesson-7A-script-clean.txt` (866 words, 13 beats, verbatim master Slot 09 cues 1–11+17+18); `shotlists/lesson-7A-part2-script.txt` (cues 12–16 → 7B).
- **Scene cards:** `shotlists/module-07-lesson7A-scenecards.md` (full storyboard + cast + fields). Claim in `NEXT-SESSION.md`.
- **Audio:** 13 wavs + word timestamps in `course-assets/heygen/lesson7A/` (`_state.json`). Elizabeth-Friendly, loudnorm −16. ~6:00 with gaps.
- **Stills (9, approved):** `course-assets/scenes/module-07/m07_L7A_{b02_goodsign,b03_reframe,b04cold_mark,b04warm_jim,b06_silence,b07_complaints,b08_reactionary,b09_real,b12_doorway}.png`. Anchors in `_anchors/{jim,mark,david}.png`.
- **Andrea clips (5):** `course-assets/heygen/lesson7A/{hero_b01_intro,hero_b13_outro,circle_b03,circle_b05,circle_b11}.mp4` (cafe `b2cd0545…` heroes; headset `e527528e…` circles on #62b3f3).
- **Seedance anims (9, QC'd+approved):** `course-assets/heygen/lesson7A/grok/anim_{b02_goodsign,b03_reframe,b04cold,b04warm,b06_silence,b07_complaints,b08_reactionary,b09_real,b12_doorway}.mp4` (1280×720, 15s, end-on-start-pose).

## CAST (locked, consistent every scene): rep=ANDREA; JIM=b02/b03/b04warm/b06/b09/b12; MARK=b04cold/b08; DAVID=b07.

## STANDING RULE (patch guide+PLAYBOOK, still say "code motion for characters"):
Every illustrated slide animated via Seedance; Remotion = word-timed text + transitions ONLY. (Jarrad: "code drawing motion is terrible.")

## MOBILE DELIVERY (Jarrad on phone): video does NOT render inline. Upload to his Google Drive via `mcp__75580d5d-…__create_file` (base64Content, mime video/mp4, disableConversionToGoogleType true). Keep file ≤~14KB so base64 (`base64 -i f|tr -d '\n'>f.b64`) fits ONE `Read` (Bash/Read truncate big output). Compact grid: `ffmpeg -i grid.mp4 -t 8 -vf scale=456:256 -r 7 -crf 42 -movflags +faststart out.mp4`. Images DO render inline via `SendUserFile(display:'render')`.

## REMAINING
1. **`scripts/build_manifest_7A.py`** — author by analogy to `build_manifest_2B.py` (has rekey_anim: Seedance→alpha ProRes .mov over code blue) + `build_manifest_4A.py` (hero/circle/word_frame/normalize/gaps). Fields per beat below.
2. **`remotion/src/Lesson7A.tsx`** — copy `LessonB.tsx`; keep hero/VideoBeat/Sticker/AndreaCircle/BmhBadge/transitions; add modes below.
3. **Isolated entry** (shared Root.tsx BROKEN): `remotion/src/root7A.tsx` (one `<Composition id="Lesson7A" durationInFrames={LESSON_7A_FRAMES} fps=30 1600×900/>`) + `remotion/src/index7A.ts` (`registerRoot`).
4. `python3 scripts/build_manifest_7A.py` → `cd remotion && npx remotion render src/index7A.ts Lesson7A out/lesson7A.mp4`.
5. `custom-video-qc` skill → fix→rebuild→re-render until all-PASS.
6. Deliver `review-lesson7A/LESSON-7A-v1-FULL.mp4` (Drive for Jarrad). Update NEXT-SESSION/PLAYBOOK/_inbox/_meta/log.

## Manifest fields + Lesson7A.tsx modes
Manifest `{fps:30,beats,audio:"lesson7A/master.m4a",totalFrames}`. Beat: `tag,mode,durationInFrames,voFrames` +:
- **hero** (b01,b13): `hero`(cafe mp4 full-frame, opaque), `badge`(b01). = LessonB HeroBeat.
- **video** (b02,b03,b06,b07,b08,b09,b12): `videos[0]`(alpha .mov), `still`(hold-tail), `label`+`labelDelay`+`labelPlace`(top/bottom/topcenter), `caption`+`captionDelay`(2nd Sticker opposite edge, b06–09), `circle`(b03), `quad`(1–4 → small 2×2 indicator top-left, active cell yellow). Alpha .mov over blue: test `transparent` prop on OffthreadVideo.
- **calltype** (b04): 2-panel slide. A=`coldClip`+`coldStill`+`coldLabel`@`coldDelay`; B=`warmClip`+`warmStill`+`warmLabel`@`warmDelay`. translateX 0→−1600 over ~16f from `slideFrame` (word "warmed"). Each clip a Sequence, still holds after clipFrames.
- **grid4** (b05): CODE 2×2 empty cells + numbers 1–4, title `label`("4 RESPONSE TYPES", topCenter, delay `labelDelay`), `circle`.
- **steps** (b10): CODE rising staircase L→R; `steps[k]={text,delay}` each pops on trigger; LISTEN→ACKNOWLEDGE→ASK→REDIRECT numbered 1–4, arrows.
- **lockup** (b11): CODE 4 white pills "LISTEN · ACKNOWLEDGE · ASK · REDIRECT" spring-in centered, `circle`.
Transitions: fades into/out of heroes; horizontal slides between others. Export `LESSON_7A_FRAMES=manifest.totalFrames`.

Word triggers (from _state.json): b02 good · b03 rejection · b04 cold/warmed · b05 four · b06 silence/wait · b07 complaints/redirect · b08 reactionary/bait · b09 real/framework · b10 listen/acknowledge/ask/redirect · b12 doorway.

## SAVE these memories (writes were blocked when noted):
1. `mobile-delivery-google-drive` (reference): Jarrad on mobile — video won't render inline; upload to his Google Drive via create_file base64; keep ≤~14KB so base64 survives one Read. Images render inline via SendUserFile.
2. `seedance-animates-all-slides` (feedback): animate every illustrated slide via Seedance; Remotion = text+transitions only; supersedes "code motion for characters."

## Credits used: ~608/1760 Higgsfield. Render entry pattern proven by 2A/3B/4A (isolated src/index*.ts).

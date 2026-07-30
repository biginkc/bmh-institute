# Lesson 9B continuity dossier from Lesson 9A

Status: binding continuity spec for the 9B lane.

This dossier extracts the Lesson 9A look from the checked course-production files plus the delivered 9A review file. It is intentionally adversarial because the 9A records do not all describe the same visual system.

Critical continuity finding

- Delivered final file: `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`, modified `Jul 7 03:14:49 2026`.
- Current Remotion source: `docs/course-production/remotion/src/Lesson9A.tsx`, modified `Jul 8 02:58:35 2026`.
- Current manifest: `docs/course-production/remotion/public/lesson9A/manifest.json`, modified `Jul 8 02:58:41 2026`.
- Current source and current manifest are a post-final retrofit. They use a single bottom-center label queue and explicitly say `No stacked/positioned chips`.
- The delivered 7/7 file still shows the earlier FAQ treatment: upper-center question cards, a top-left active chip, and stacked left labels on question beats.
- No surviving `QuestionCard` or `ChipRow` implementation exists under `docs/course-production/remotion/src/Lesson9A.tsx` or the 9A scripts. Exact old card and chip positions below are measured from the delivered MP4 frames, not copied from a surviving TSX component.

Binding source surface inspected

- `docs/course-production/NEXT-SESSION.md`
- `docs/course-production/shotlists/module-09-lesson9A-scenecards.md`
- `docs/course-production/scripts/build_manifest_9A.py`
- `docs/course-production/scripts/gen_audio_9A.py`
- `docs/course-production/scripts/gen_avatar_9A.py`
- `docs/course-production/scripts/gen_avatar_9A_v2.py`
- `docs/course-production/scripts/gen_b09_9A.py`
- `docs/course-production/scripts/gen_stills_9A.sh`
- `docs/course-production/scripts/gen_stills_9A_v2.sh`
- `docs/course-production/scripts/gen_stills_9A_v3.sh`
- `docs/course-production/scripts/gen_stills_9A_v4.sh`
- `docs/course-production/remotion/src/Lesson9A.tsx`
- `docs/course-production/remotion/src/Sticker.tsx`
- `docs/course-production/remotion/src/index9A.ts`
- `docs/course-production/remotion/src/root9A.tsx`
- `docs/course-production/remotion/public/lesson9A/manifest.json`
- `course-assets/heygen/lesson9A/_state.json`
- `course-assets/heygen/lesson9A/_avatars.json`
- `course-assets/heygen/lesson9A/_clips.json`
- `course-assets/scenes/module-09/`
- `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`
- `.planning/quick/260706-generate-m09-l9a-bench-andrea/SUMMARY.md`

## 1. Park-bench Andrea and HeyGen settings

Final delivered cut:

- `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`
- `3:19`, `9 beats`, `1600x900`, `5961` video frames, `30 fps`

Park-bench Andrea source still:

- Final still path: `course-assets/scenes/module-09/m09_L9A_bench_andrea.png`
- Dimensions: `1600x900`
- Approved v5 source image, preserved outside the repo: `/Users/jarradhenry/.codex/generated_images/019f3b88-6ec0-7723-91e2-5b209fbf742c/ig_03066222d5a8b2a0016a4caeb6137c819188fa4650a2c4a0c9.png`
- Replacement palette after flattening: `#111111`, `#62B3F3`, `#FF7A00`, `#FFD310`, `#FFF7DE`, `#FFFFFF`
- Required face rule from `NEXT-SESSION.md`: anchor hard to `course-assets/scenes/module-08/m08_L8A_andrea-beach.png`; prompt for a soft rounded face, small gentle closed-ish smile, soft curved nose, natural neck; compare face against the beach reference every time.
- Additional 9A ref noted by `NEXT-SESSION.md`: `course-assets/scenes/module-01/andrea_cafe.png`
- Do not repeat the rejected path: `andrea_headset_v2` plus `andrea_cafe` drifted into a skeletal/pinched face, then a stark-white-disc face.

HeyGen photo avatar state:

```json
{
  "bench": {
    "image_asset": "9bf0cd2e00a64fd59dfd1310cb509e86",
    "avatar_id": "05fa4c66c4504b929d4d7dd6f679cd4b"
  }
}
```

HeyGen avatar body used by `gen_avatar_9A_v2.py`:

```json
{
  "type": "photo",
  "name": "Doodle Andrea park-bench v5 (course)",
  "file": {
    "type": "asset_id",
    "asset_id": "9bf0cd2e00a64fd59dfd1310cb509e86"
  }
}
```

Voice:

- Voice label in scene card: `Elizabeth-Friendly`
- Voice id: `55f8c0f546884f9cbdefa113f5e7b682`
- Speech endpoint: `POST https://api.heygen.com/v3/voices/speech`
- Speech body shape in `gen_audio_9A.py`: `{"text":text,"voice_id":"55f8c0f546884f9cbdefa113f5e7b682","speed":1.0}`
- Speed: `1.0`
- Per-beat loudnorm target: `loudnorm=I=-16:TP=-1.5:LRA=11`
- Per-beat WAV sample rate after normalization: `44100`

Bench hero video settings:

```json
{
  "type": "avatar",
  "avatar_id": "05fa4c66c4504b929d4d7dd6f679cd4b",
  "resolution": "720p",
  "aspect_ratio": "16:9",
  "expressiveness": "low"
}
```

Bench hero clips:

| clip | beat | audio asset | video id | file | motion prompt |
|---|---|---|---|---|---|
| `hero_b01_intro` | `b01_intro` | `0a084153cd5f4f3194cb7d33d403abd1` | `09765d12a4d446a4a926648bdae0a09d` | `course-assets/heygen/lesson9A/hero_b01_intro.mp4` | `seated on the park bench, relaxed and warm, minimal natural gestures, gentle smile` |
| `hero_b09_outro` | `b09_outro` | `5561df1d83454fd3bfb3443126eea2b5` | `c46d11d0ae994648a247ab340962d79f` | `course-assets/heygen/lesson9A/hero_b09_outro.mp4` | `seated on the park bench, relaxed and warm, minimal natural gestures, friendly send-off` |

Headset Andrea corner-circle clips:

- Avatar id: `e527528e584a404f9da68ee4faca1353`
- Background: `{"type":"color","value":"#62b3f3"}`
- Resolution: `720p`
- Aspect ratio: `16:9`
- Expressiveness: `low`
- Motion prompt: `standing still, hands relaxed at sides, minimal gestures, warm reassuring smile`

| clip | beat | audio asset | video id | file |
|---|---|---|---|---|
| `circle_b02` | `b02_decoder` | `92a1c830fc8042dc9547fa0236d80fcd` | `cb686531d7a54ee2a4f60882896fd9b5` | `course-assets/heygen/lesson9A/circle_b02.mp4` |
| `circle_b06` | `b06_q3` | `3ac8877d1a48457aadbd774415382f38` | `f45c37d23f774444be37f92e6473a8b8` | `course-assets/heygen/lesson9A/circle_b06.mp4` |

Current Remotion circle crop in `Lesson9A.tsx`:

- `const CIRCLE = 340`
- wrapper `left: 1600 - CIRCLE - 60`
- wrapper `top: 900 - CIRCLE - 60`
- wrapper `width: CIRCLE`
- wrapper `height: CIRCLE`
- wrapper `borderRadius: '50%'`
- wrapper `overflow: 'hidden'`
- wrapper `border: '10px solid #ffffff'`
- wrapper `boxShadow: '0 8px 24px rgba(0,0,0,0.15)'`
- wrapper `backgroundColor: '#62b3f3'`
- bob: `5 * Math.sin((2 * Math.PI * frame) / 150)`
- video style: `width: 1920`, `height: 1080`, `left: -790`, `top: -17`

## 2. Question cards and decoder chips

There are two incompatible records.

Current source record, Jul 8 retrofit:

- `Lesson9A.tsx` has no `QuestionCard` component.
- `Lesson9A.tsx` has no `ChipRow` component.
- `Lesson9A.tsx` comment says: `every transient teaching label is a SINGLE bottom-center queue`, `No stacked/positioned chips`, and `Modes: hero | video | tiles`.
- Current question-like overlays are just entries in `manifest.json` rendered through `OverlaySticker` -> `Sticker`.
- Current `OverlaySticker` role rule: `overlay.text.length > 22 ? 'caption' : 'label'`.
- Current placement for every overlay: `<Sticker ... bottomCenter />`.
- Current bottom-center placement from `Sticker.tsx`: `bottom: 60`, `left: '50%'`, transform prefix `translateX(-50%)`.

Delivered final visual record, 7/7 review MP4:

- The delivered final still shows the earlier FAQ treatment.
- No literal TSX for this older component survived in the checked source.
- The values below are measured from extracted frames of `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`.

Measured final frame `00:00:54`, b04 question card:

- Frame path used for measurement: `/tmp/lesson9a-final-b04-54s.png`
- Card text: `How does this work?`
- Card box: `x=620`, `y=54`, `width=360`, `height=71`
- Placement pattern: upper-center, horizontally centered. For this card, `left = (1600 - 360) / 2 = 620`.
- Visual style: white rounded card, black Baloo-style text, soft shadow.

Measured final frame `00:01:07`, b04 active chip plus left label stack:

- Frame path used for measurement: `/tmp/lesson9a-final-b04-67s.png`
- Active chip: `SIMPLE`
- Active chip box: `x=56`, `y=50`, `width=162`, `height=70`
- Active chip style: yellow fill, black outline, black text.
- Left label `CONVERSATION` box: `x=56`, `y=286`, `width=284`, `height=70`
- Left label `EVALUATE` box: `x=56`, `y=360`, `width=200`, `height=70`
- Final file at this sampled time shows only the active chip, not a visible full `TRUST | FAIR | SIMPLE` row.

Storyboard record:

- `module-09-lesson9A-scenecards.md` says question beats carry a small top-left chip row `TRUST · FAIR · SIMPLE`.
- It says the driving chip lights word-timed using the 7A quad-indicator mechanic.
- It says every card, chip, and label appears only on its trigger word, never as an empty placeholder.

Binding decision for 9B:

- To match the current Jul 8 9A source and later lesson rule, use only the bottom-center queue and do not implement a chip row.
- To match the delivered 7/7 9A video at a frame level, reconstruct the old system from the measured MP4 values above. Treat that as reconstruction, not a source copy.
- Do not claim there is an exact `QuestionCard` or `ChipRow` source component in current 9A. It is not there.

## 3. Sticker roles, colors, positions, and label timing

Current source `Sticker.tsx` roles:

- `StickerRole = 'label' | 'title' | 'caption'`
- `StickerFont = 'marker' | 'baloo'`
- `PALETTE.yellow = '#FFD23F'`
- `PALETTE.cream = '#FFF7DE'`
- `PALETTE.white = '#FFFFFF'`
- `PALETTE.ink = '#111111'`

Current source `Sticker.tsx` size table:

| role | fontSize | padding | radius | border value in size table |
|---|---:|---|---:|---:|
| `title` | `84` | `18px 44px` | `26` | `7` |
| `label` | `48` | `10px 26px` | `18` | `5` |
| `caption` | `34` | `8px 22px` | `14` | `4` |

Current source `Sticker.tsx` actual rendered style:

- Default role: `label`
- Default font: `baloo`
- Default bg prop: `yellow`, but the style hardcodes `background: PALETTE.white`
- Default delay: `0`
- Default rotate prop: `-2`, but current transform does not apply rotation
- Spring: `spring({frame: frame - delay, fps, config: {damping: 11, stiffness: 170}, durationInFrames: 20})`
- Exit when `until` is set: last `8` frames
- Position if `bottomCenter`: `bottom: 60`, `left: '50%'`
- Position if `topCenter`: `top: top ?? 64`, `left: '50%'`
- Else position: `{top, left}`
- Transform: `translateX(-50%) scale(...)` for center modes
- Opacity: `Math.min(1, s * 1.4) * exit`
- Font weight for Baloo: `700`
- Color: `#111111`
- Background: `#FFFFFF`
- `whiteSpace: 'nowrap'`
- `boxShadow: '0 10px 30px rgba(0,0,0,0.10)'`
- No border is actually rendered by the current component.

Current source overlay queue mechanics in `Lesson9A.tsx`:

- `LABEL_EXIT_FRAMES = 10`
- `LABEL_GAP_FRAMES = 4`
- Overlays are sorted by delay.
- Active overlay condition: `frame >= o.delay && frame < nextDelay - LABEL_GAP_FRAMES`
- Exit starts at `nextDelay - LABEL_GAP_FRAMES - LABEL_EXIT_FRAMES`
- Exit opacity: `1 - exit`
- Exit movement: `translateY(${Math.round(exit * 34)}px)`

Current source label timing from `manifest.json`:

| beat | text | delay frames | current role |
|---|---|---:|---|
| `b02_decoder` | `CAN I TRUST YOU?` | `485` | `label` |
| `b02_decoder` | `AM I GETTING A FAIR DEAL?` | `535` | `caption` |
| `b02_decoder` | `IS THIS COMPLICATED?` | `595` | `label` |
| `b03_ten` | `THE 10 MOST COMMON QUESTIONS` | `15` | `caption` |
| `b04_q1` | `HOW DOES THIS WORK?` | `23` | `label` |
| `b04_q1` | `KEEP IT SIMPLE` | `93` | `label` |
| `b04_q1` | `HAVE A CONVERSATION` | `345` | `label` |
| `b04_q1` | `PUT TOGETHER A CASH OFFER` | `476` | `caption` |
| `b04_q1` | `NO REPAIRS · NO COMMISSIONS` | `648` | `caption` |
| `b05_q2` | `HOW DO YOU COME UP WITH THE OFFER?` | `34` | `caption` |
| `b05_q2` | `NOT A RANDOM NUMBER` | `115` | `label` |
| `b05_q2` | `WHAT SIMILAR HOMES SOLD FOR` | `264` | `caption` |
| `b05_q2` | `CONDITION + REPAIR COSTS` | `366` | `caption` |
| `b05_q2` | `WORKS FOR BOTH SIDES` | `457` | `label` |
| `b06_q3` | `IS THIS A SCAM?` | `19` | `label` |
| `b06_q3` | `LICENSED TITLE COMPANY` | `366` | `label` |
| `b06_q3` | `ATTORNEY REVIEW AVAILABLE` | `415` | `caption` |
| `b06_q3` | `NO MONEY UPFRONT — EVER` | `564` | `caption` |
| `b07_q4` | `WHY CAN'T YOU OFFER MORE?` | `35` | `caption` |
| `b07_q4` | `WE BUY AS-IS · WE TAKE THE RISK` | `370` | `caption` |
| `b07_q4` | `SPEED · CERTAINTY · NO HASSLE` | `663` | `caption` |
| `b08_q5` | `HOW FAST CAN YOU CLOSE?` | `31` | `label` |
| `b08_q5` | `AS FAST AS A COUPLE OF WEEKS` | `246` | `caption` |
| `b08_q5` | `THEY PICK THE DATE` | `395` | `label` |

Current BMH badge:

- Component: `BmhBadge`
- Source image: `staticFile('lessonA/bmh-endcard.png')`
- Position: `position: 'absolute'`
- Width: `130`
- Right: `36`
- Bottom: `30`
- Opacity: `0.95`
- Manifest badge beat: `b01_intro`

Delivered final old card system, measured only:

- Question card top: about `54`
- Question card height: about `71`
- Active chip top-left: `x=56`, `y=50`, height about `70`
- Stacked left labels: `x=56`, height about `70`, vertical gap about `4`
- Old labels are positioned labels, not the current bottom-center queue.

## 4. Transitions

Current source transition implementation:

- Component stack: `TransitionSeries`
- Transition function: `pickTransition`
- Transition frames: `TRANSITION_FRAMES = 13`
- Directions array: `['from-right', 'from-bottom', 'from-left', 'from-top']`
- Seed formula: `(prev.tag.charCodeAt(1) + prev.tag.charCodeAt(2)) % dirs.length`
- Presentation: `slide({direction: dirs[seed]})`
- Timing: `linearTiming({durationInFrames: trans.frames})`
- Sequence pad: `durationInFrames={b.durationInFrames + pad}`
- Current comment: `TRANSITIONS (Jarrad 2026-07-08): the Lesson 1A camera-travel SLIDE exclusively — no fades anywhere.`

Storyboard and NEXT record:

- `module-09-lesson9A-scenecards.md` says camera-travel slides everywhere and fades only into `b01` or out of `b09`.
- `NEXT-SESSION.md` says `slide transitions (fade only at bookends)`.

Binding decision for 9B:

- Current code has no fade path at all.
- If matching current source, use `slide` only, `13` frames, seed on `charCodeAt(1)+charCodeAt(2)`.
- If matching the older final-video note, fades at bookends would require source not present in current `Lesson9A.tsx`.

## 5. Beat modes and Lesson9A implementation names

Composition entry:

- Entry: `docs/course-production/remotion/src/index9A.ts`
- Root: `Root9A`
- Composition id: `Lesson9A`
- Component: `Lesson9A`
- Duration source: `LESSON_9A_FRAMES`
- FPS: `30`
- Width: `1600`
- Height: `900`

Current implementation names:

- Main composition: `Lesson9A`
- Frame count export: `LESSON_9A_FRAMES`
- Beat router: `beatContent`
- Hero renderer: `HeroBeat`
- Video renderer: `VideoBeat`
- Tile renderer: `TilesBeat`
- Corner avatar renderer: `AndreaCircle`
- Badge renderer: `BmhBadge`
- Overlay renderer: `Overlays`
- Overlay sticker wrapper: `OverlaySticker`
- Transition picker: `pickTransition`

Manifest mode map:

| beat | mode | implementation | assets |
|---|---|---|---|
| `b01_intro` | `hero` | `HeroBeat` | `lesson9A/hero/hero_b01_intro.mp4`, badge |
| `b02_decoder` | `video` | `VideoBeat` | `lesson9A/anim/anim_b02_grace.mp4`, `lesson9A/stills/b02_decoder_tail.png`, `lesson9A/circle/circle_b02.mp4` |
| `b03_ten` | `tiles` | `TilesBeat` | code tiles only |
| `b04_q1` | `video` | `VideoBeat` | `lesson9A/anim/anim_b04_jim.mp4`, `lesson9A/stills/b04_q1_tail.png` |
| `b05_q2` | `video` | `VideoBeat` | `lesson9A/anim/anim_b05_david.mp4`, `lesson9A/stills/b05_q2_tail.png` |
| `b06_q3` | `video` | `VideoBeat` | `lesson9A/anim/anim_b06_carol.mp4`, `lesson9A/stills/b06_q3_tail.png`, `lesson9A/circle/circle_b06.mp4` |
| `b07_q4` | `video` | `VideoBeat` | `lesson9A/anim/anim_b07_scale.mp4`, `lesson9A/stills/b07_q4_tail.png` |
| `b08_q5` | `video` | `VideoBeat` | `lesson9A/anim/anim_b08_beth.mp4`, `lesson9A/stills/b08_q5_tail.png` |
| `b09_outro` | `hero` | `HeroBeat` | `lesson9A/hero/hero_b09_outro.mp4` |

Current `TilesBeat` exact values:

- `cols = 5`
- `rows = 2`
- `cellW = 240`
- `cellH = 240`
- `gap = 40`
- `gridW = 1360`
- `gridH = 520`
- `ox = 120`
- `oy = 160`
- First five tiles covered: `i < 5`
- Covered fill: `#FFD23F`
- Uncovered fill: `#FFF7DE`
- Tile border: `6px solid #111`
- Tile border radius: `26`
- Tile font: `Baloo 2`
- Font weight: `700`
- Font size: `120`
- Ink: `#111`
- Uncovered opacity: `0.62`
- Pop start per tile: `6 + i * 5`
- Spring config: `damping: 13`, `stiffness: 160`, `durationInFrames: 16`

## 6. Still-generation recipe

Final still paths:

| purpose | path |
|---|---|
| bench Andrea | `course-assets/scenes/module-09/m09_L9A_bench_andrea.png` |
| b02 Grace | `course-assets/scenes/module-09/m09_L9A_b02_grace_call.png` |
| b04 Jim | `course-assets/scenes/module-09/m09_L9A_b04_jim_shrug.png` |
| b05 David | `course-assets/scenes/module-09/m09_L9A_b05_david_papers.png` |
| b06 Carol | `course-assets/scenes/module-09/m09_L9A_b06_carol_door.png` |
| b07 scale | `course-assets/scenes/module-09/m09_L9A_b07_scale.png` |
| b08 mover | `course-assets/scenes/module-09/m09_L9A_b08_beth_boxes.png` |

All final source stills are `1600x900`.

Base script command pattern:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
echo "Generate one image with gpt-image-2 and save it to $OUT/$file (PNG, 1600x900)..." | codex exec "$@" --skip-git-repo-check --sandbox workspace-write
```

Common v3 reference array for seller scenes:

```zsh
REFS=(-i "docs/design/style-ref-1.png" -i "docs/design/style-ref-2.png" -i "docs/design/cast-board.png")
```

Reference dimensions:

| ref | dimensions |
|---|---|
| `docs/design/style-ref-1.png` | `1504x1128` |
| `docs/design/style-ref-2.png` | `1504x1128` |
| `docs/design/cast-board.png` | `1536x1024` |
| `course-assets/avatar-candidates/andrea_headset_v2.png` | `1024x1536` |
| `course-assets/scenes/module-08/m08_L8A_andrea-beach.png` | `1600x900` |
| `course-assets/scenes/module-01/andrea_cafe.png` | `1600x900` |

Common v3 style lock:

```text
STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Faces exactly match the attached cast board: small dot eyes, a SMALL SUBTLE CURVED NOSE (a tiny hook/comma line, same size and shape as the cast-board characters — NOT large, NOT pointed, NOT a bracket, NOT a beak; just a little curved line), and a simple small mouth. Cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No ambient doodles: no hearts, sparkles, notes, thought bubbles, or motion marks. No text or words anywhere. 16:9 composition, 1600x900.
```

Bench Andrea lineage:

- v1 script refs: `docs/design/style-ref-1.png`, `docs/design/style-ref-2.png`, `docs/design/cast-board.png`, `course-assets/avatar-candidates/andrea_headset_v2.png`
- v3 script refs: same as v1.
- v4 rejected bench refs: `course-assets/scenes/module-01/andrea_cafe.png`, `docs/design/cast-board.png`, `docs/design/style-ref-1.png`
- v5 final fix from `NEXT-SESSION.md`: hard anchor to `course-assets/scenes/module-08/m08_L8A_andrea-beach.png`; use `course-assets/scenes/module-01/andrea_cafe.png` only as a read reference; prompt for soft rounded face, not a disc, small gentle closed-ish smile, not a gape, soft curved nose, natural neck.
- Final v5 source image path: `/Users/jarradhenry/.codex/generated_images/019f3b88-6ec0-7723-91e2-5b209fbf742c/ig_03066222d5a8b2a0016a4caeb6137c819188fa4650a2c4a0c9.png`

Seller scene prompt patterns from checked scripts:

| still | script source | refs | prompt pattern |
|---|---|---|---|
| `m09_L9A_b02_grace_call.png` | `gen_stills_9A_v3.sh` | `REFS` | Grace from cast board, elderly woman, grey bun, round glasses, orange cardigan over cream dress, yellow armchair, phone to ear, thoughtful head tilt, weighted left, bottom-right 420px empty blue, exactly one person |
| `m09_L9A_b04_jim_shrug.png` | `gen_stills_9A_v3.sh` | `REFS` | Jim from cast board, older balding man, grey side hair, orange goggles on head, yellow polo, cream pants, orange shoes, centered puzzled shrug, one palm up, phone in other hand, exactly one person |
| `m09_L9A_b05_david_papers.png` | `gen_stills_9A_v3.sh` | `REFS` | David from cast board, heavyset older man, full grey beard, orange shirt, yellow-orange pants, kitchen table, white papers, simple calculator, centered, exactly one person |
| `m09_L9A_b06_carol_door.png` | `gen_stills_9A_v3.sh` | `REFS` | Carol from cast board, grey bob, yellow top, orange pants, cream door frame, arms crossed, phone, wary flat mouth, weighted left, bottom-right 420px empty blue, exactly one person |
| `m09_L9A_b07_scale.png` | `gen_stills_9A.sh` | `REFS` | large balance scale, left pan lower with worn patched house and cracked window, right pan higher with money bag and stopwatch, no people |
| `m09_L9A_b08_beth_boxes.png` | `gen_stills_9A_v4.sh` | `docs/design/cast-board.png`, `docs/design/style-ref-1.png`, `docs/design/style-ref-2.png` | cheerful male seller, short dark-brown/black hair, cream t-shirt, orange pants and shoes, carrying one kraft cardboard box, two more boxes beside him, real corrugated cardboard with flaps, tape, corrugated edge, exactly one person, must not resemble Andrea |

Rejected or superseded still directories:

- `course-assets/scenes/module-09/_v1_nosed/`
- `course-assets/scenes/module-09/_v2_noseless/`
- `course-assets/scenes/module-09/_v3_rejected/`
- `course-assets/scenes/module-09/_v4_terrifying/`

Rules from 9A still saga:

- Noses stay. They must be the small canonical curved hook/comma nose.
- Do not remove noses.
- Do not draw large, pointed, bracket, or beak noses.
- Do not let Beth or any mover resemble Andrea.
- For boxes, use real corrugated cardboard details, not plain brown blocks.
- For bench Andrea, do not trust self-QC without a face zoom against the reference.

## 7. Seedance settings and freeze-tail handling

Standing Seedance recipe from `MODULE-PRODUCTION-GUIDE.md`:

```json
{
  "model": "seedance_2_0",
  "mode": "std",
  "resolution": "720p",
  "duration": 15,
  "generate_audio": false,
  "medias": [
    {"value": "<still>", "role": "start_image"},
    {"value": "<SAME still>", "role": "end_image"},
    {"value": "<cast-board>", "role": "image_references"},
    {"value": "<style-ref>", "role": "image_references"}
  ],
  "prompt": "<style lock + SCENE/MOTION + locked camera + NEGATIVE line>"
}
```

Triple-clamp values:

- Same still as `start_image` and `end_image`.
- Duration: `15`
- Resolution: `720p`
- Generate audio: `false`
- Mode: `std`
- Model: `seedance_2_0`
- Dense-sweep QC cadence: `0.5s`
- Single-character prompt rule: `EXACTLY ONE PERSON at all times`
- Negative prompt must reject duplicate or clone people.
- Stable geometry rule for b02 and b06: lock camera because the Andrea circle and label pockets must remain stable.
- Multi-shot camera energy is allowed where no fixed label or circle pocket depends on stable geometry.

Actual 9A Seedance files:

| beat | source file | public file | Remotion frame slots |
|---|---|---|---:|
| `b02_decoder` | `course-assets/heygen/lesson9A/grok/anim_b02_grace.mp4` | `lesson9A/anim/anim_b02_grace.mp4` | `451` |
| `b04_q1` | `course-assets/heygen/lesson9A/grok/anim_b04_jim.mp4` | `lesson9A/anim/anim_b04_jim.mp4` | `451` |
| `b05_q2` | `course-assets/heygen/lesson9A/grok/anim_b05_david.mp4` | `lesson9A/anim/anim_b05_david.mp4` | `451` |
| `b06_q3` | `course-assets/heygen/lesson9A/grok/anim_b06_carol.mp4` | `lesson9A/anim/anim_b06_carol.mp4` | `451` |
| `b07_q4` | `course-assets/heygen/lesson9A/grok/anim_b07_scale.mp4` | `lesson9A/anim/anim_b07_scale.mp4` | `451` |
| `b08_q5` | `course-assets/heygen/lesson9A/grok/anim_b08_beth.mp4` | `lesson9A/anim/anim_b08_beth.mp4` | `451` |

Actual 9A Seedance probe for all six source files:

- Width: `1280`
- Height: `720`
- Pixel format: `yuv420p`
- `r_frame_rate`: `24/1`
- `avg_frame_rate`: `24/1`
- Duration: `15.041667`
- Frames: `361`

Full-scene handling:

- `NEXT-SESSION.md` says full-scene Seedance clips, no alpha rekey, exempt from blue check per PLAYBOOK 8.4.
- Current `VideoBeat` renders the clip full-frame as `<OffthreadVideo muted ... style={{position: 'absolute', width: 1600, height: 900}} />`.
- Current `VideoBeat` renders the tail still only when `frame >= tailStart`.
- `tailStart` is the sum of `videoFrames`, so for each 9A single-clip video beat it is `451`.

Freeze-tail extraction in `build_manifest_9A.py`:

```zsh
ffmpeg -v error -sseof -0.06 -i "<source clip>" -frames:v 1 "<public tail png>" -y
```

Tail stills:

- `docs/course-production/remotion/public/lesson9A/stills/b02_decoder_tail.png`
- `docs/course-production/remotion/public/lesson9A/stills/b04_q1_tail.png`
- `docs/course-production/remotion/public/lesson9A/stills/b05_q2_tail.png`
- `docs/course-production/remotion/public/lesson9A/stills/b06_q3_tail.png`
- `docs/course-production/remotion/public/lesson9A/stills/b07_q4_tail.png`
- `docs/course-production/remotion/public/lesson9A/stills/b08_q5_tail.png`

## 8. Audio pipeline

Generation script:

- `docs/course-production/scripts/gen_audio_9A.py`
- Output directory: `course-assets/heygen/lesson9A`
- State file: `course-assets/heygen/lesson9A/_state.json`
- Voice id: `55f8c0f546884f9cbdefa113f5e7b682`
- Endpoint: `/v3/voices/speech`
- Body: `{"text":text,"voice_id":FRIENDLY,"speed":1.0}`
- Saved raw file: `<tag>_raw.wav`
- Saved normalized file: `<tag>.wav`
- Normalization command: `ffmpeg -v error -i <raw> -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 <wav> -y`
- State fields saved: `wav`, `duration`, `words`, `text`
- Word timestamps source: `d.get("word_timestamps")`
- Inter-request sleep: `time.sleep(1.5)`
- TTS-only respell in b05: `ARV` -> `A-R-V`, `MAO` -> `M-A-O`

Per-beat audio state:

| beat | duration seconds | vo frames | wav |
|---|---:|---:|---|
| `b01_intro` | `15.542857142857143` | `466` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b01_intro.wav` |
| `b02_decoder` | `29.231020408163264` | `877` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b02_decoder.wav` |
| `b03_ten` | `4.780408163265306` | `143` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b03_ten.wav` |
| `b04_q1` | `28.16` | `845` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b04_q1.wav` |
| `b05_q2` | `23.90204081632653` | `717` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b05_q2.wav` |
| `b06_q3` | `28.395102040816326` | `852` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b06_q3.wav` |
| `b07_q4` | `31.399183673469388` | `942` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b07_q4.wav` |
| `b08_q5` | `15.960816326530612` | `479` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b08_q5.wav` |
| `b09_outro` | `13.322448979591837` | `400` | `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A/b09_outro.wav` |

Master audio build in `build_manifest_9A.py`:

- `FPS = 30`
- `GAP = 1.0`
- Gap file: `docs/course-production/remotion/public/lesson9A/_gap.wav`
- Gap creation: `ffmpeg -v error -f lavfi -i anullsrc=r=44100:cl=mono -t 1.0 _gap.wav -y`
- Concat list: `docs/course-production/remotion/public/lesson9A/_concat.txt`
- Gap insertion point: after every beat WAV except the last, inside the manifest build before `master.m4a` is written.
- Master command: `ffmpeg -v error -f concat -safe 0 -i _concat.txt -c:a aac -b:a 192k master.m4a -y`
- Master path: `docs/course-production/remotion/public/lesson9A/master.m4a`
- Manifest audio value: `lesson9A/master.m4a`
- Master probe: AAC LC, `44100` Hz, mono, duration `198.693991`, bit rate `182202`

Delivered final audio probe:

- Final file: `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`
- AAC LC
- Sample rate: `48000`
- Channels: `2`
- Audio bit rate: `184956`
- `volumedetect mean_volume: -21.3 dB`
- `volumedetect max_volume: -4.4 dB`
- Loudnorm measured `input_i: -17.48`, `input_tp: -4.34`, `input_lra: 3.50`

Word-timed label delays:

- `build_manifest_9A.py` computes delay as `round(float(w["start"]) * FPS)`.
- Trigger search strips punctuation with `.strip('.,?!"“”$—-·')`.
- It uses substring matching: `if needle and needle in cleaned`.
- Minimum spacing: `wf = max(wf, last + 18)`.
- Fallback: `wf = max(8, last + 28)`.

## 9. Render command and encode settings

Manifest build command:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
python3 docs/course-production/scripts/build_manifest_9A.py
```

Remotion render command for the current isolated 9A entry:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/remotion"
npx remotion render src/index9A.ts Lesson9A out/lesson9A.mp4
```

Composition settings:

- Entry file: `src/index9A.ts`
- Registered root: `Root9A`
- Composition id: `Lesson9A`
- Component: `Lesson9A`
- Duration: `LESSON_9A_FRAMES`
- Manifest total frames: `5961`
- FPS: `30`
- Width: `1600`
- Height: `900`

Raw current render file:

- Path: `docs/course-production/remotion/out/lesson9A.mp4`
- Modified: `Jul 8 03:03:14 2026`
- Size: `52519667`
- Duration: `198.762667`
- Video codec: `h264`
- Width: `1600`
- Height: `900`
- Pixel format: `yuvj420p`
- Color range: `pc`
- Color space: `bt470bg`
- Video frames: `5961`
- Audio codec: `aac`
- Audio sample rate: `48000`
- Audio channels: `2`
- Audio bit rate: `317375`

Final delivered review file:

- Path: `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4`
- Modified: `Jul 7 03:14:49 2026`
- Size: `24162628`
- Format duration: `198.762000`
- Video duration: `198.700000`
- Video codec: `h264`
- Video profile: `High`
- Width: `1600`
- Height: `900`
- Pixel format: `yuv420p`
- Color range: `tv`
- Color space probed by ffprobe: `bt470bg`
- Frame rate: `30/1`
- Video frames: `5961`
- Video bit rate: `778946`
- Audio codec: `aac`
- Audio sample rate: `48000`
- Audio channels: `2`
- Audio bit rate: `184956`
- Format bit rate: `972525`

Encode command status:

- A literal 9A-specific final ffmpeg re-encode command was not found in the checked 9A scripts or docs.
- The delivered file is therefore the binding encode target for exact 9A matching.
- Do not blindly claim 9A final is tagged BT.709. `NEXT-SESSION.md` calls it `yuv420p QuickTime-safe`, but the actual delivered file probes as `color_space: bt470bg`.
- If the 9B lane follows the later course standard instead of exact 9A final matching, use the newer BT.709 tv-range encode pattern from the 8A continuity dossier. That would be a deliberate standard upgrade, not a byte-level 9A match.

Final implementation instruction for 9B

- Reuse the park-bench still path and HeyGen avatar id exactly unless Jarrad rejects continuity.
- Use voice id `55f8c0f546884f9cbdefa113f5e7b682`, speed `1.0`, and loudnorm `I=-16:TP=-1.5:LRA=11`.
- Use Seedance `seedance_2_0`, `mode:"std"`, `resolution:"720p"`, `duration:15`, `generate_audio:false`, same-frame start/end clamp, and own-last-frame freeze tails.
- For text and chips, choose the target surface before coding:
  - Current-source continuity: bottom-center one-at-a-time queue, no chip row.
  - Delivered-video continuity: reconstruct upper question card, active top-left chip, and left stacked labels from MP4 measurements because the old source component is missing.

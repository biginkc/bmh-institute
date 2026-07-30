# Lesson 8B continuity dossier from Lesson 8A

Binding source surface:
- `docs/course-production/NEXT-SESSION.md`
- `docs/course-production/shotlists/module-08-lesson8A-scenecards.md`
- `docs/course-production/scripts/gen_audio_8A.py`
- `docs/course-production/scripts/gen_stills_8A.sh`
- `docs/course-production/scripts/gen_beach_avatar_8A.py`
- `docs/course-production/scripts/gen_beach_clips_8A.py`
- `docs/course-production/scripts/gen_avatar_clips_8A.py`
- `docs/course-production/scripts/build_manifest_8A.py`
- `docs/course-production/scripts/qc_render_8A.py`
- `docs/course-production/remotion/src/Lesson8A.tsx`
- `docs/course-production/remotion/src/index8A.ts`
- `docs/course-production/remotion/src/root8A.tsx`
- `docs/course-production/remotion/public/lesson8A/manifest.json`
- `course-assets/heygen/lesson8A/_state.json`
- `course-assets/heygen/lesson8A/_beach_avatar.json`
- `course-assets/heygen/lesson8A/_clips.json`
- `course-assets/scenes/module-08/`

## 1. BEACH-Andrea avatar

- Delivered Lesson 8A file: `course-assets/review-lesson8A/LESSON-8A-v1-FULL.mp4`
- BEACH-Andrea source still: `course-assets/scenes/module-08/m08_L8A_andrea-beach.png`
- BEACH-Andrea still lane: `docs/course-production/scripts/gen_stills_8A.sh`, `andrea_beach`
- BEACH-Andrea HeyGen state: `course-assets/heygen/lesson8A/_beach_avatar.json`
- BEACH-Andrea image asset id: `c1194e35a8eb4bcba31d67a2025940d5`
- BEACH-Andrea photo avatar id: `4cb442e3a5d1447f83dc403b7419d27a`
- `/v3/avatars` body:

```json
{"type":"photo","name":"Beach Andrea (course 8A)","file":{"type":"asset_id","asset_id":"c1194e35a8eb4bcba31d67a2025940d5"}}
```

- BEACH-Andrea video settings:

```json
{"type":"avatar","avatar_id":"4cb442e3a5d1447f83dc403b7419d27a","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low","motion_prompt":"relaxing in the beach chair, warm and friendly, hands resting easy on the chair arms, minimal natural gestures"}
```

- Beach test clip title: `8A-hero_b01_beach-TEST`
- Beach batch clip title pattern: `8A-{name}-beach`
- Beach hero and circle files:

| clip | beat | audio asset | video id | file |
|---|---|---|---|---|
| `hero_b01_intro` | `b01_intro` | `86fa35b7be6840bebfe50487896c0b09` | `ad1f41ec5f954583832a657177b851e4` | `course-assets/heygen/lesson8A/hero_b01_intro.mp4` |
| `hero_b10_outro` | `b10_outro` | `9fd5aed8b839452c8cc1877cf4794719` | `9734b10c56494300abd3ab4eec17b057` | `course-assets/heygen/lesson8A/hero_b10_outro.mp4` |
| `circle_b04` | `b04_response` | `490bbcf066c64cd183e19b841a126fee` | `5330dab9953b452cb8daf2b803015078` | `course-assets/heygen/lesson8A/circle_b04.mp4` |
| `circle_b07` | `b07_leaseback` | `97df6f3bc89e425aa46e79349b0cc14e` | `5a05b9c2a55d4905ab848ecc8cbdd8db` | `course-assets/heygen/lesson8A/circle_b07.mp4` |
| `circle_b09` | `b09_contract` | `844b86603d824f42bf09f0e9606ed121` | `6487dc5b1f9f4523870f4984204211a1` | `course-assets/heygen/lesson8A/circle_b09.mp4` |

- Audio voice id used by Lesson 8A: `55f8c0f546884f9cbdefa113f5e7b682`
- Voice label in guide and scene card: `Elizabeth-Friendly`
- Voice speed: `1.0`
- Speech endpoint: `POST https://api.heygen.com/v3/voices/speech`
- Speech body shape: `{"text":text,"voice_id":"55f8c0f546884f9cbdefa113f5e7b682","speed":1.0}`
- Per-beat WAV normalization: `ffmpeg -v error -i <raw.wav> -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 <beat>.wav -y`
- Final delivered loudness: `mean_volume: -21.4 dB`
- Final delivered max volume: `max_volume: -4.0 dB`

## 2. Seated framing circle crop

- Applied in: `docs/course-production/remotion/src/Lesson8A.tsx`, `AndreaCircle`
- Circle wrapper:
  - `const CIRCLE = 340`
  - `left: 1600 - CIRCLE - 60`
  - `top: 900 - CIRCLE - 60`
  - `width: CIRCLE`
  - `height: CIRCLE`
  - `borderRadius: '50%'`
  - `overflow: 'hidden'`
  - `border: '10px solid #ffffff'`
  - `boxShadow: '0 8px 24px rgba(0,0,0,0.15)'`
  - `backgroundColor: '#62b3f3'`
  - bob: `5 * Math.sin((2 * Math.PI * frame) / 150)`
- Native measurement note:
  - source frame: `1280x720`
  - head center: `(617,215)`
  - hair span: `x520-715`
  - initial proof zoom: `1.19x`
  - delivered zoom class: `1.55x`
- Delivered seated crop:

```tsx
<OffthreadVideo muted src={staticFile(src)} style={{position: 'absolute', width: 1984, height: 1116, left: -786, top: -183}} />
```

- Delivered crop shorthand: `1984x1116 @ -786,-183`
- Circle beats using this crop:
  - `b04_response` -> `lesson8A/circle/circle_b04.mp4`
  - `b07_leaseback` -> `lesson8A/circle/circle_b07.mp4`
  - `b09_contract` -> `lesson8A/circle/circle_b09.mp4`

## 3. Hero and circle implementation names

- Remotion composition entry: `docs/course-production/remotion/src/index8A.ts`
- Root component: `Root8A`
- Composition id: `Lesson8A`
- Composition component: `Lesson8A`
- Composition duration source: `LESSON_8A_FRAMES`
- Composition fps: `30`
- Composition width: `1600`
- Composition height: `900`
- Manifest fps: `30`
- Manifest totalFrames: `6851`
- Manifest audio: `lesson8A/master.m4a`

Hero path:
- Manifest mode: `hero`
- Renderer: `HeroBeat`
- Hero beats:
  - `b01_intro`: `lesson8A/hero/hero_b01_intro.mp4`
  - `b10_outro`: `lesson8A/hero/hero_b10_outro.mp4`
- Builder map:

```python
HEROES = {"b01_intro": "hero_b01_intro.mp4", "b10_outro": "hero_b10_outro.mp4"}
```

Circle path:
- Circle renderer: `AndreaCircle`
- Circle overlay host: `Overlays`
- Circle beats remain manifest mode `video`
- Circle beats:
  - `b04_response`: `lesson8A/circle/circle_b04.mp4`
  - `b07_leaseback`: `lesson8A/circle/circle_b07.mp4`
  - `b09_contract`: `lesson8A/circle/circle_b09.mp4`
- Builder map:

```python
CIRCLES = {"b04_response": "circle_b04.mp4", "b07_leaseback": "circle_b07.mp4", "b09_contract": "circle_b09.mp4"}
```

Other 8A render modes:
- `video`: `VideoBeat`
- `scene`: `SceneBeat`
- `b08_privacy`: `mode: "scene"`, still only, gentle push-in

## 4. Still generation recipe

- Script: `docs/course-production/scripts/gen_stills_8A.sh`
- Working directory: `/Users/jarradhenry/Sites/BMH apps/BMH Institute`
- Design refs dir: `docs/design`
- Anchor dir: `course-assets/scenes/module-08/_anchors`
- Avatar refs dir: `course-assets/avatar-candidates`
- Output dir: `course-assets/scenes/module-08`
- CLI pattern:

```zsh
codex exec -i "docs/design/style-ref-1.png" -i "docs/design/style-ref-2.png" -i "<anchor>" --skip-git-repo-check --sandbox workspace-write
```

- Prompt template:

```text
Generate one image with gpt-image-2 and save it to course-assets/scenes/module-08/<file> (PNG, 1600x900). Match the attached style references exactly and keep the character IDENTICAL to the attached character reference. CHARACTER: <identity> COMPOSITION: <composition> <STYLE> <NEG>
```

- STYLE literal:

```text
STYLE: flat sticker-sheet illustration, thick black hand-drawn outlines with a slight wobble, rounded corners, flat fills only (yellow, orange, cream, white, black) on cornflower-blue background, no gradients, no texture, no shadows, no lighting, no perspective. Tiny dot eyes, minimal facial features, cylindrical limbs, strong simple silhouettes. Confidently imperfect, hand-drawn. No skin-tone shading. No text or words anywhere. No floating hearts, sparkles, notes, thought bubbles, or motion marks. 16:9 composition, 1600x900.
```

- NEG literal:

```text
NEGATIVE: no clone, no duplicate person, no second copy of the character, no extra people, no photorealism, no 3D, no shading, no gradient, no readable text.
```

- Text policy:
  - 8A still script: `No text or words anywhere.`
  - 8A negative: `no readable text`
  - Global exception: one short caps word or numeral may be generated in-image only when explicit, judge for garbling, fall back to Remotion overlay.
  - 8A labels were code-rendered, not baked into stills.

8A anchor map:

| still key | output | anchor ref |
|---|---|---|
| `andrea_beach` | `m08_L8A_andrea-beach.png` | `course-assets/avatar-candidates/andrea_headset_v2.png` |
| `b02_weight` | `m08_L8A_b02_weight.png` | `course-assets/scenes/module-08/_anchors/jim.png` |
| `b03_underwater` | `m08_L8A_b03_underwater.png` | `course-assets/scenes/module-08/_anchors/marcus.png` |
| `b04_response` | `m08_L8A_b04_response.png` | `course-assets/scenes/module-08/_anchors/marcus.png` |
| `b05_tenants` | `m08_L8A_b05_tenants.png` | `course-assets/scenes/module-08/_anchors/david.png` |
| `b06_squatters` | `m08_L8A_b06_squatters.png` | `course-assets/scenes/module-08/_anchors/mark.png` |
| `b07_leaseback` | `m08_L8A_b07_leaseback.png` | `course-assets/scenes/module-08/_anchors/grace.png` |
| `b08_privacy` | `m08_L8A_b08_privacy.png` | `course-assets/scenes/module-08/_anchors/carol.png` |
| `b09_contract` | `m08_L8A_b09_contract.png` | `course-assets/scenes/module-08/_anchors/ray.png` |

BEACH-Andrea v2 identity:

```text
IDENTICAL to the attached ANDREA reference: a friendly woman with shoulder-length wavy black hair, tiny black dot eyes, tiny simple nose, small simple smile. Keep her FACE and HAIR exactly as the reference, but her outfit here is a simple flat one-piece SWIMSUIT in mustard-YELLOW with a thin orange trim stripe — no long-sleeve top, no pants, just the swimsuit, bare arms and legs (flat white/cream limbs, no skin-tone shading, matching the reference art style). NO headset in this scene.
```

Ray identity:

```text
IDENTICAL to the attached RAY reference: a slim young man with short curly black hair, an ORANGE t-shirt, cream pants, yellow shoes, tiny black dot eyes, simple nose. Keep his face, hair and outfit exactly as the reference.
```

Ray b09 final composition pattern:

```text
RAY seated, holding up a VERTICAL PORTRAIT sheet of paper in front of him with ONE hand gripping its top edge — the page is clearly and noticeably TALLER than it is wide, like an upright sheet of printer paper, NEVER a wide horizontal/landscape rectangle.
```

## 5. Seedance and freeze-tail recipe

- Model: `seedance_2_0`
- Mode: `std`
- Resolution: `720p`
- Duration: `15`
- generate_audio: `false`
- Media roles:
  - `{value:<still>, role:"start_image"}`
  - `{value:<SAME still>, role:"end_image"}`
  - `{value:<cast-board>, role:"image_references"}`
  - `{value:<style-ref>, role:"image_references"}`
- Reusable Higgsfield ids from guide:
  - style-ref-1: `b345db3c-3cf3-44e8-b890-53b1b80f6a91`
  - cast-board: `c86e1fa9-df75-4cbc-ba32-8479b0829538`
  - object-board: `ff847fda-ecb4-450e-b1f9-0293e9bc1edb`
- Prompt spine:

```text
<style lock + SCENE/MOTION + locked camera + NEGATIVE line>
```

- Dense sweep QC cadence: `0.5s`
- Actual 8A Seedance clip profile:
  - width: `1280`
  - height: `720`
  - pix_fmt: `yuv420p`
  - r_frame_rate: `24/1`
  - avg_frame_rate: `24/1`
  - duration: `15.041667`
  - nb_frames: `361`
- 8A source Seedance clips:
  - `course-assets/heygen/lesson8A/grok/anim_b02.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b03.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b04.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b05.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b06.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b07.mp4`
  - `course-assets/heygen/lesson8A/grok/anim_b09.mp4`
- 8A frozen still fallback:
  - `b08_privacy`
  - `mode: "scene"`
  - `lesson8A/stills/m08_L8A_b08_privacy.png`
  - `SceneBeat` push-in: `scale 1.0 -> 1.035`

Alpha ProRes rekey:

```text
[0:v]scale=1600:900:flags=lanczos,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,colorkey=0x{bgc}:0.15:0.03,format=rgba[v]
```

```text
-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an
```

Output anim paths:
- `docs/course-production/remotion/public/lesson8A/anim/anim_b02.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b03.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b04.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b05.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b06.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b07.mov`
- `docs/course-production/remotion/public/lesson8A/anim/anim_b09.mov`

TRIM fix:

```python
TRIM = {"b06_squatters": 14.5}
```

- `b06_squatters` manifest videoFrames: `[435]`
- Standard 15s Seedance manifest videoFrames: `[451]`
- b06 issue: final frame snap lived in timestamps Remotion never displays.
- b06 fix: freeze at `14.5s`, extract tail at `14.5s`.
- b06 boundary diff after fix: `0.78`
- tail extract default:

```text
ffmpeg -v error -sseof -0.06 -i "<anim.mov>" -frames:v 1 -pix_fmt rgba "<tag>_tail.png" -y
```

- tail extract with TRIM:

```text
ffmpeg -v error -ss 14.5 -i "<anim.mov>" -frames:v 1 -pix_fmt rgba "b06_squatters_tail.png" -y
```

VideoBeat tail rule:
- Tail still renders only when `frame >= tailStart`.
- Tail image is the clip's own last frame or TRIM timestamp frame.
- Do not render the source still under the alpha clip.
- Do not Ken-Burns the freeze tail.

## 6. Labels and transitions

Colors and fonts:
- BLUE: `#62b3f3`
- CREAM: `#FFF7DE`
- INK: `#111111`
- Font handle: `loadFont as loadBaloo` from `@remotion/google-fonts/Baloo2`
- Font family: `baloo.fontFamily`

Actual label behavior in `Lesson8A.tsx`:
- `labelPlace` exists in manifest.
- `labelPlace` is not consumed by `Lesson8A.tsx`.
- Labels and captions render through `BottomCard`.
- `BottomCard` placement: bottom-center.
- Pills render through `PillStack`.
- `PillStack` consumes `pillsPlace`.

BottomCard params:
- `bottom: 56`
- `left: '50%'`
- `background: '#ffffff'`
- `color: '#111111'`
- `fontWeight: 700`
- label size: `46`
- caption size: `40`
- `padding: '12px 30px'`
- `borderRadius: 18`
- `boxShadow: '0 10px 30px rgba(0,0,0,0.10)'`
- `whiteSpace: 'nowrap'`
- enter spring: `damping: 11`, `stiffness: 170`, `durationInFrames: 20`
- exit duration: `10` frames
- exit dy: `48`

PillStack params:
- right placement:
  - `left: 1040`
  - `top0: 210`
  - `gapY: 84`
  - `fontSize: 38`
- topleft placement:
  - `left: 70`
  - `top0: 56`
  - `gapY: 74`
  - `fontSize: 36`
- pill `background: '#ffffff'`
- pill `color: '#111111'`
- pill `fontWeight: 700`
- pill `padding: '11px 24px'`
- pill `borderRadius: 16`
- pill `boxShadow: '0 8px 24px rgba(0,0,0,0.12)'`
- pill enter spring: `damping: 12`, `stiffness: 170`, `durationInFrames: 18`
- builder minimum pill spacing: `12` frames

Label, caption, pill manifest values:

| beat | label | labelDelay | labelPlace in manifest | caption | captionDelay | pills |
|---|---:|---:|---|---:|---:|---|
| `b02_weight` | `SAME FRAMEWORK, MORE DEPTH` | `252` | `bottom` |  |  |  |
| `b03_underwater` | `"I OWE MORE THAN IT'S WORTH"` | `59` | `bottom` |  |  |  |
| `b04_response` | `GET THE FULL PICTURE` | `89` | `topright` |  |  |  |
| `b05_tenants` | `"I HAVE TENANTS"` | `44` | `topleft` | `YES — WE BUY WITH TENANTS` | `141` |  |
| `b06_squatters` | `SQUATTERS` | `22` | `topleft` |  |  |  |
| `b07_leaseback` | `"CAN I STAY AFTER SELLING?"` | `347` | `topright` | `LEASEBACK — STAY AS A TENANT` | `503` |  |
| `b08_privacy` |  |  |  | `A PRIVATE TRANSACTION` | `767` | `NO LISTING@586`, `NO SIGN@621`, `NO OPEN HOUSES@675`, `NO STRANGERS@709`, `pillsPlace:topleft` |
| `b09_contract` | `"WHAT IF I CHANGE MY MIND?"` | `85` | `topright` |  |  | `INSPECTION PERIOD@308`, `WALKED THROUGH FIRST@403`, `ATTORNEY REVIEW@588`, `pillsPlace:right` |

Transitions:
- `const T = 12`
- `pickTransition(prev,next)`
- Fade condition: `prev.tag === 'b01_intro' || next.tag === 'b10_outro'`
- Fade frames: `14`
- Non-fade presentation: `slide({direction: 'from-right' as const})`
- Non-fade frames: `12`
- Timing: `linearTiming({durationInFrames: trans.frames})`
- Sequence duration: `b.durationInFrames + pad`

BMH badge:
- Component: `BmhBadge`
- Source: `staticFile('lessonA/bmh-endcard.png')`
- Width: `130`
- Right: `36`
- Bottom: `30`
- Opacity: `0.95`
- 8A manifest badge beat: `b01_intro`

## 7. Audio pipeline values

- Script: `docs/course-production/scripts/gen_audio_8A.py`
- Output dir: `course-assets/heygen/lesson8A`
- Voice const:

```python
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
```

- Speech endpoint: `/v3/voices/speech`
- Speech body:

```python
{"text": text, "voice_id": FRIENDLY, "speed": 1.0}
```

- WAV normalization:

```text
ffmpeg -v error -i <raw.wav> -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 <beat>.wav -y
```

- Master audio builder:
  - GAP: `1.0`
  - silence source: `anullsrc=r=44100:cl=mono`
  - silence path: `docs/course-production/remotion/public/lesson8A/_gap.wav`
  - concat list: `docs/course-production/remotion/public/lesson8A/_concat.txt`
  - master output: `docs/course-production/remotion/public/lesson8A/master.m4a`
  - master codec: `aac`
  - master bitrate: `192k`
- Manifest master audio path: `lesson8A/master.m4a`
- Final file loudness:
  - `mean_volume: -21.4 dB`
  - `max_volume: -4.0 dB`

Beat durations:

| beat | wav | duration sec | voFrames | durationInFrames |
|---|---|---:|---:|---:|
| `b01_intro` | `course-assets/heygen/lesson8A/b01_intro.wav` | `21.655510204081633` | `650` | `680` |
| `b02_weight` | `course-assets/heygen/lesson8A/b02_weight.wav` | `12.852244897959183` | `386` | `416` |
| `b03_underwater` | `course-assets/heygen/lesson8A/b03_underwater.wav` | `16.561632653061224` | `497` | `527` |
| `b04_response` | `course-assets/heygen/lesson8A/b04_response.wav` | `21.681632653061225` | `650` | `680` |
| `b05_tenants` | `course-assets/heygen/lesson8A/b05_tenants.wav` | `17.136326530612244` | `514` | `544` |
| `b06_squatters` | `course-assets/heygen/lesson8A/b06_squatters.wav` | `23.301224489795917` | `699` | `729` |
| `b07_leaseback` | `course-assets/heygen/lesson8A/b07_leaseback.wav` | `33.35836734693878` | `1001` | `1031` |
| `b08_privacy` | `course-assets/heygen/lesson8A/b08_privacy.wav` | `26.90612244897959` | `807` | `837` |
| `b09_contract` | `course-assets/heygen/lesson8A/b09_contract.wav` | `26.01795918367347` | `781` | `811` |
| `b10_outro` | `course-assets/heygen/lesson8A/b10_outro.wav` | `19.853061224489796` | `596` | `596` |

## 8. Render and encode commands

Manifest build:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
python3 docs/course-production/scripts/build_manifest_8A.py
```

Render command:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/remotion"
npx remotion render src/index8A.ts Lesson8A out/lesson8A.mp4
```

Raw render file:
- `docs/course-production/remotion/out/lesson8A.mp4`
- size: `68572319`
- duration: `228.416000`
- video codec: `h264`
- width: `1600`
- height: `900`
- pix_fmt: `yuvj420p`
- color_range: `pc`
- color_space: `bt470bg`
- frames: `6851`
- audio codec: `aac`
- audio sample_rate: `48000`
- audio channels: `2`

Final QuickTime-safe encode target:

```zsh
ffmpeg -y -i docs/course-production/remotion/out/lesson8A.mp4 -vf "scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 192k course-assets/review-lesson8A/LESSON-8A-v1-FULL.mp4
```

Final delivered file:
- `course-assets/review-lesson8A/LESSON-8A-v1-FULL.mp4`
- size: `52920282`
- duration: `228.416000`
- video codec: `h264`
- video profile: `High`
- width: `1600`
- height: `900`
- pix_fmt: `yuv420p`
- color_range: `tv`
- color_space: `bt709`
- frames: `6851`
- audio codec: `aac`
- audio sample_rate: `48000`
- audio channels: `2`
- final file note in `NEXT-SESSION.md`: `3:48`, `10 beats`, `52.9 MB`, `yuv420p tv-range QuickTime-safe`

QC command:

```zsh
cd "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
python3 docs/course-production/scripts/qc_render_8A.py
```

QC source values:
- MP4: `docs/course-production/remotion/out/lesson8A.mp4`
- public dir: `docs/course-production/remotion/public/lesson8A`
- scratch: `/private/tmp/claude-502/-Users-jarradhenry-BMH-OS/3f4055bf-1d2d-4364-9da3-3e41211b64d5/scratchpad`
- FPS: `30`
- audio check: `volumedetect,silencedetect=noise=-50dB:d=0.8`
- blue sample: `crop=2:2:20:856`
- handoff pop threshold: `1.5`
- handoff metric: `blend=all_mode=difference,signalstats,metadata=print`, parse `YAVG=`

# BMH Institute thumbnail pilots

Status: **awaiting Jarrad approval**. These files are isolated review pilots.
They are not referenced by the course manifest, uploaded, published, or approved
for batch production.

## Deliverables

| Pilot | Lesson card (16:10) | Video poster (16:9) |
| --- | --- | --- |
| Orientation | `course-assets/thumbnails/pilots/lesson-cards/orientation-lesson-card-16x10.webp` | `course-assets/posters/pilots/orientation-video-poster-16x9.webp` |
| Opening the Call | `course-assets/thumbnails/pilots/lesson-cards/opening-the-call-lesson-card-16x10.webp` | `course-assets/posters/pilots/opening-the-call-video-poster-16x9.webp` |
| Objection Architecture | `course-assets/thumbnails/pilots/lesson-cards/objection-architecture-lesson-card-16x10.webp` | `course-assets/posters/pilots/objection-architecture-video-poster-16x9.webp` |

The 16:10 cards use blue vertical padding rather than cropping, so every key
sticker remains visible. The 16:9 posters retain the generated composition.
Both derivative sets are lossless WebP files.

## Production record

- Generator: built-in `image_gen` tool.
- Generation mode: one distinct generation call per pilot. Orientation received
  one targeted flat-style correction pass because the first render added a
  white cutout border.
- Final generated-source dimensions: 1672 x 941.
- Deterministic post-processing: exact eight-color locked palette, no dithering.
- Reproduction command: `python3 scripts/course-content/prepare-thumbnail-pilots.py`
- Checksums and dimensions: `checksums.json` in this directory.

The generated PNGs are retained under
`course-assets/thumbnails/pilots/sources/`. Flat PNG masters are retained under
`course-assets/thumbnails/pilots/flat-masters/`.

## Reference record

| Reference | Role | SHA-256 |
| --- | --- | --- |
| `docs/design/style-ref-1.png` | canonical BMH Sticker System style | `d65ce4c3fc84a0a52b08e513d42d978f94d5db2f6e59034aedbbd1e9486c18ca` |
| `docs/design/style-ref-2.png` | canonical BMH Sticker System style | `f1affc2ab6b931be8cfd6920165dff330d49b79e6f4abfe5568e67e70c6934a6` |
| `course-assets/scenes/module-v0/mV0_LV0_s10_bmh-lowangle.png` | Orientation subject reference only | `438bab4f68f7b71e5daec17def6ea1ceb091e010b57c135968746fba92ba42dc` |
| `course-assets/scenes/module-05/m05_L5A_phones.png` | Opening the Call subject reference only | `2d59d64e913c43b1fba45080b0bf59c9e51356f1d4b057c5d2831bfa0f7af6e8` |
| `course-assets/scenes/module-07/m07_L7A_b03_reframe.png` | Objection Architecture character reference only | `57fe03b31eca46336c664c2ca78cf877b8db3138443964e7976ce70eb91db311` |

The canonical references remain in the original course-production checkout;
their checksums lock the exact inputs used for this pilot.

## Source prompts

### Orientation

```text
Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Orientation thumbnail for a new employee beginning BMH Institute. Show an iconic welcoming BMH training building as one large central sticker, with a simple open doorway, a tiny new learner approaching, a small compass, checklist, and upward path markers floating as separate supporting stickers. The five-second read should be “welcome, direction, begin training.”
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the recognizable BMH building only. Preserve the flat sticker language from Images 1–2 and simplify the building from Image 3 into an icon rather than a realistic scene.
Scene/backdrop: uninterrupted flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is an individually croppable sticker
Composition/framing: large building sticker centered slightly right, tiny learner and open-door cue lower left, small compass/checklist/path marks balanced around it; keep all meaningful content inside the central 80% so both 16:9 and 16:10 crops remain intact
Color palette: cornflower blue, golden yellow, orange, cream, white, black, and at most one muted green; 6–8 flat colors maximum
Characters: tiny scale, dot eyes, minimal face, cylindrical limbs, simple silhouette
Constraints: no title, no words, no letters, no logos, no watermark; flat fills only; strong silhouettes; uniform complexity; decorative doodles limited to a few purposeful sparkles and motion marks
Avoid: gradients, texture, lighting, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed architecture, busy interiors, edge-cropped key objects
```

Orientation correction prompt:

```text
Use case: style-transfer
Asset type: corrected BMH Institute Orientation thumbnail master
Primary request: Edit Image 1 only to enforce the locked BMH Sticker System flatness while preserving its subject, layout, proportions, object count, and wide composition. Keep the training building, learner, compass, checklist, orange path marks, arrow, and doodles in exactly the same approximate positions.
Input images: Image 1 is the edit target; Images 2 and 3 are the canonical flat-style references.
Style/medium: match the genuinely flat, loose, hand-drawn sticker-sheet treatment of Images 2–3
Color palette: replace every shaded or blended area with a single uniform flat fill chosen from cornflower blue, golden yellow, orange, cream, white, black, and one muted green; maximum 7 colors
Constraints: make the cornflower-blue background one perfectly uniform solid color edge to edge; remove every gradient, highlight, glow, shadow, reflection, and lighting effect; remove the thick white cutout border surrounding each sticker; retain thick slightly wobbly black outlines and all existing icon silhouettes; no text, letters, numbers, logos, or watermark
Avoid: changing the composition, adding objects, deleting objects, rendering depth, realism, 3D polish, texture, soft shading, edge cropping
```

### Opening the Call

```text
Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Opening the Call thumbnail. The five-second read must be “start a confident, human phone conversation.” Use a large friendly telephone handset as the hero sticker bridging two simple speech bubbles, with a tiny headset-wearing employee on one side and a tiny homeowner on the other. Add a small open-door icon and a few purposeful sound-wave marks as supporting stickers.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for phone icon shapes only. Match the loose flat sticker-sheet language of Images 1–2; simplify the phones from Image 3 and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is independently croppable
Composition/framing: large curved handset near center linking left and right speech bubbles; tiny employee and homeowner separated but visibly connected through the call; open-door icon and sound marks balanced around the hero; keep meaningful content inside the central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: tiny scale, dot eyes, minimal faces, cylindrical limbs, simple hair silhouettes, one headset prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; decorative rhythm limited to speech bubbles, sound marks, and two sparkles
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, detailed smartphone interface, busy interiors, edge-cropped key objects
```

### Objection Architecture

```text
Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Objection Architecture thumbnail. The five-second read must be “hear an objection, reframe it, build a calm response.” Use a large central bridge or modular arch assembled from three chunky sticker blocks: an ear icon on the left block, a curved reframe arrow on the center block, and a calm speech bubble with a check mark on the right block. Include a tiny thoughtful phone rep below the arch and two small floating puzzle-piece/support-beam icons.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the thoughtful phone-rep character only. Preserve the flat, loose sticker-sheet language of Images 1–2, simplify the character from Image 3, and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room, construction site, or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object independently croppable
Composition/framing: three-block arch centered and instantly legible left-to-right; small rep below but not touching an edge; support icons and a few purposeful doodle marks around it; keep all meaningful content inside central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: one tiny rep with dot eyes, minimal facial features, cylindrical limbs, light hair, orange goggles resting on head, phone prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; the three-step visual logic must be obvious without labels
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, complex diagrams, busy masonry, detailed interiors, edge-cropped key objects
```

## QA result

- All three pilot topics pass the five-second topic test.
- All final derivatives use exactly the locked eight-color palette.
- There is no model-rendered text, logo, watermark, gradient, texture, lighting,
  reflection, or shadow in the final derivatives.
- Key stickers remain visible in both aspect ratios.
- No production manifest entry or storage path was changed.

Batch generation remains gated on Jarrad's explicit approval of these three
pilots.

The locked post-approval prompts, manifest mappings, derivative rules, and
machine-verifiable count checks are in `PRODUCTION-SPEC.md` and
`production-inventory.json`. Preparing those files did not generate or approve
any additional artwork.

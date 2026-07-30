# New lessons continuity dossier

Status: course-wide continuity spec for the three inserted lessons:

- Terms Glossary between Lesson 1B and Lesson 2A.
- Tech Stack between Terms Glossary and Lesson 2A.
- Ideal Seller Profile between Lesson 2B and Lesson 3A.

This is a source dossier only. Do not generate stills, audio, avatars, animation clips, renders, or delivery files from this document without the matching scene-card approval.

## Source priority

Use these as the current source of truth:

1. `docs/course-production/PLAYBOOK.md`, especially sections 3, 4, 7, 10, 11, 12, 13, 14, 15, and 16.
2. `docs/course-production/MODULE-PRODUCTION-GUIDE.md`.
3. Implemented Remotion components in `docs/course-production/remotion/src/`, especially `Sticker.tsx` plus the shipped lesson files.
4. Shipped lesson records in `docs/course-production/NEXT-SESSION.md`.
5. `docs/course-production/scene-card-v2.md` for the July 8 transition and label rules.
6. `docs/course-production/STYLE-BLOCK.md` only as the historical style seed.

Adversarial note: `STYLE-BLOCK.md` still says to add ambient doodles and allows peach skin tone. That conflicts with the newer guide and playbook. Current rule is no ambient doodles, no skin tones, no text in AI stills, and code-rendered labels only.

## Avatar inventory

### Custom course avatars

| id | label and setting | source still path | portrait vs 16:9 | lessons used it |
|---|---|---|---|---|
| `5b74342002c842c49a41def28d720652` | Pilot doodle Andrea, cast-board crop. Group `3a544482e48d40e38c70960df82e4b11`. | `docs/design/cast-board.png`, 900px upscale of Andrea crop. | Portrait crop on blue, pilot only. | Pilot `PilotCashAsis`; early `module-01-lessonA-scenecards.md` queue. Do not use as a new bookend. |
| `e527528e584a404f9da68ee4faca1353` | 1A solo headset Andrea, standing full-body on blue. | `course-assets/avatar-candidates/andrea_headset_v2.png` | Portrait source. HeyGen pads to 16:9 with gray side bars. Full-frame hero use requires per-clip `heroInset` measurement. | Lesson 1A; Lesson 2A final throughout; 3B bookends; 5A b04a; 6B planned bookends; many corner-circle scripts including 4A, 5A, 5B, 7A, 7B, 9A, 10A, 12A, 13A, 17, 18A, 18B, 19. |
| `63396931e03943f19c7261cdc675e623` | Office Andrea, old group-approved widescreen/outpainted office avatar. | `course-assets/avatar-candidates/andrea_office.png` | 16:9 office scene, no `heroInset`. | Lesson 1A v2.1 outro; Lesson 3A bookends; proposed in Terms Glossary and Tech Stack scene cards. |
| `b2cd05454d284058ad8d7303545821e6` | Cafe Andrea, seated cafe coaching setting. | `course-assets/scenes/module-01/andrea_cafe.png` | 16:9 full-scene avatar, no `heroInset`. | Lesson 1B b01, b08a, b17; Lesson 4A; Lesson 5A; Lesson 5B; Lesson 6A; Lesson 7A; Lesson 7B; Lesson 10A; Lesson 12A; Lesson 13A; Lesson 17; Lesson 18A; Lesson 18B; Lesson 19. |
| `bbb4c71f220545a5b907fd6fe0239b75` | Yoga Andrea, rejected alternate setting. | `course-assets/scenes/module-01/andrea_yoga.png` | 16:9 full-scene avatar. | Lesson 1B v1 outro test only. Retired. Do not use. |
| `66b1e57ce29a4bc4ac861faeef9cc2a2` | Car Andrea, seated in car. | `course-assets/scenes/module-01/andrea_car_v2.png` | 16:9 full-scene avatar, no `heroInset`. | Lesson 1C bookends and hero beats. |
| `8200f90176d6444a8d6943a664a71c1a` | Office/desk Andrea, seated at desk, calmer BMH office setting. | `course-assets/scenes/module-02/m02_L2A_office_andrea_v4a.png` | 16:9 office scene, no `heroInset`. | Lesson 2B shipped b09 outro and related office clips. Best match for Ideal Seller Profile bookends because 2B hands directly into ISP. |
| `c8fd29e618244cc9b0f2d976c2548f2d` | Office Andrea standing (HeyGen group `69dac3b67d72485c809027a9e5961abc` "Office Andrea Standing BMH"). | `course-assets/scenes/module-02/m02_L2A_office_andrea_v3b.png` | 16:9 office scene. | **REVIVED by Jarrad 2026-07-09 for Terms Glossary/Tech Stack bookends** — he rejected the seated office avatar (`63396931…`) clips for GLO-A; standing version is the pick pending his test-clip approval. Earlier 2A test superseded by final 2A headset choice. |
| `370febd2c2334cd9895cc23dd702a338` | 5A demo-call doodle-desk Andrea, specialized lip-sync scene. | `course-assets/scenes/module-05/m05_L5A_demo-call.png` | 16:9 desk still, no gray hero strip. | Lesson 5A b03 `lip_b03_demo.mp4`. Do not use as a bookend. |
| `4cb442e3a5d1447f83dc403b7419d27a` | Beach Andrea, seated beach-chair setting. | `course-assets/scenes/module-08/m08_L8A_andrea-beach.png` | 16:9 full-scene avatar. | Lesson 8A heroes and circles. Also used as face reference when creating later fresh-setting Andrea stills. Not for the three new lessons. |
| `05fa4c66c4504b929d4d7dd6f679cd4b` | Park-bench Andrea, calm reflection setting. | `course-assets/scenes/module-09/m09_L9A_bench_andrea.png` | 16:9 full-scene avatar. | Lesson 9A bookends; Lesson 11A final bookends. Not for the three new lessons. |
| `b4e4bbf3536245118d1b1d7376343e7a` | Rejected table Andrea, 11A table setup. | `course-assets/scenes/module-11/_rejected_table_andrea_20260707/m11_L11A_andrea-table.png` | 16:9 full-scene avatar. | Rejected 11A test only. Do not use. |
| `3ae5b20aaa5449c9a5c5eda01e5dccde` | David seller portrait, tired landlord. | `course-assets/scenes/module-02-lesson2B/m02_L2B_david.png` | 16:9 seller portrait still. | Lesson 2B seller monologue. Reuse as ISP identity anchor. |
| `5452d7256aaa4a73b130e3011b3690dc` | Beth seller portrait, inherited estate. | `course-assets/scenes/module-02-lesson2B/m02_L2B_beth.png` | 16:9 seller portrait still. | Lesson 2B seller monologue. Reuse as ISP identity anchor. |
| `4fa0ef3ac09e4e0fa65954178e6cd5ae` | Ray seller portrait, pre-foreclosure/job-loss. | `course-assets/scenes/module-02-lesson2B/m02_L2B_ray.png` | 16:9 seller portrait still. | Lesson 2B seller monologue. Reuse as ISP identity anchor. |
| `99ed79b852224fbc874182d567979f02` | Carol seller portrait, mechanic's-lien/Lake of the Ozarks. | `course-assets/scenes/module-02-lesson2B/m02_L2B_carol.png` | 16:9 seller portrait still. | Lesson 2B seller monologue. Reuse as ISP identity anchor. |
| `827c9d8331c84437913990c5ad290386` | Marcus seller portrait, underwater KC seller. | `course-assets/scenes/module-02-lesson2B/m02_L2B_marcus.png` | 16:9 seller portrait still. | Lesson 2B seller monologue. Reuse as ISP identity anchor. |
| `203ac03b07394344a3f796d032e14bf8` | 3B talking-doodle homeowner. | `course-assets/scenes/module-03-lesson3B/m03_L3B_s06_homeowner.png` | 16:9 full-frame homeowner avatar. | Lesson 3B b06 only, with Mature Morgan voice `e31e9614d31d4678be3377da14d99d3b`. Do not reuse for new lessons. |

Portrait hero strip rule:

- Applies to `e527528e584a404f9da68ee4faca1353` and any future portrait-source HeyGen avatar.
- The gray-pad inset is crop-specific. Measure every rendered clip. Do not copy another lesson's inset.
- Method: sample a mid-height row of the rendered HeyGen clip, find the first and last blue pixels, scale the strip to the 1600px Remotion element, then over-crop about 6px into the strip to remove the anti-alias fringe.
- Known 3B value: `clipPath: inset(0 513px 0 512px)`.
- Known 5A value: native strip x400 to x879 of 1280, scaled to x500 to x1100 of 1600, `clipPath: inset(0 506px 0 506px)`.
- Known strip backing: `HERO_BLUE = '#56aaee'`, with sampled strip around `#5baded`.
- Manifest flag pattern: add `heroInset: true` per beat, and gate the clip path inside `HeroBeat`. Normal hero beats stay untouched.

### Public HeyGen stock avatars

These are complete for Lesson 7B drills. They are not flat-doodle course avatars and have no repo source still path. Do not use them as course bookends.

| id | label | source still path | portrait vs 16:9 | lessons used it |
|---|---|---|---|---|
| `Teodor_expressive_2024112701` | Teodor Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 1 |
| `Elenora_Casual_Front_public` | Elenora Casual Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 2 |
| `Fred_in_Blue_Long_Shirt_Front` | Fred in Blue Long Shirt Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 3 |
| `Kelly_Blue_Shirt_Front` | Kelly Blue Shirt Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 4 |
| `Florin_Maintain_Front_2_public` | Florin Maintain Front 2 | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 5 |
| `Chloe_expressive_2024120201` | Chloe Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 6 |
| `Javi_Intense_Speaking_Front_2_public` | Javi Intense Speaking Front 2 | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 7 |
| `Anna_public_20240108` | Anna in White T-shirt | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 8 |
| `Marcus_expressive_2024120201` | Marcus Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 9 |
| `Maria_public_3_20240111` | Maria in Suit | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 10 |
| `Bradley_Blue_Polo_Front` | Bradley Blue Polo Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 11 |
| `Tahlia_public_1` | Tahlia Blue Suit | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 12 |
| `Vernon_expressive_2024112501` | Vernon Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 13 |
| `June_expressive_2024112701` | June Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 14 |
| `Dexter_Casual_Front_public` | Dexter Casual Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 15 |
| `Sophie_public` | Sophie | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 16 |
| `Max_expressive_2024112701` | Max Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 17 |
| `Odelia_public_2_20240326` | Odelia Blue Suit | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 18 |
| `Vince_expressive_2024112701` | Vince Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 19 |
| `Lisa_public` | Lisa | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 20 |
| `Bruce_public` | Bruce | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 21 |
| `Violante_Brown_Suit_Front_2_public` | Violante Brown Suit Front 2 | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 22 |
| `Raul_expressive_2024112501` | Raul Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 23 |
| `Susan_public_3_20240328` | Susan in Black Suit | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 24 |
| `Miles_expressive_2024112701` | Miles Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 25 |
| `Seema_Business_Front_public` | Seema Business Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 26 |
| `Luke_public_20240306` | Luke in Brown Suit | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 27 |
| `Amanda_in_Grey_Shirt_Front` | Amanda in Grey Shirt Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 28 alternate in `_seller_map.json` |
| `Daisy-inshirt-20220818` | Daisy in Shirt | n/a, public HeyGen stock | public stock avatar | Lesson 7B earlier pick file only |
| `Timothy_expressive_2024112701` | Timothy Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 29 |
| `Judith_expressive_2024120201` | Judith Upper Body | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 30 |
| `Nadim_public_5` | Nadim in Black Blazer | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 31 |
| `Ann_Casual_Front_public` | Ann Casual Front | n/a, public HeyGen stock | public stock avatar | Lesson 7B drill 32 alternate in `_seller_map.json` |
| `Daisy-inTshirt-20220819` | Daisy in T-shirt | n/a, public HeyGen stock | public stock avatar | Lesson 7B earlier pick file only |

Source files for the stock map:

- `course-assets/heygen/lesson7B/_seller_map.json`
- `course-assets/heygen/lesson7B/_seller_picks.json`
- `docs/course-production/shotlists/module-07-lesson7B-avatar-map.md`

## Neighboring lesson bookends

| boundary | shipped or planned bookend | continuity read | choice for inserted lesson |
|---|---|---|---|
| Lesson 1B exit to Terms Glossary | Lesson 1B v3 uses cafe Andrea `b2cd05454d284058ad8d7303545821e6`; v1 yoga outro was retired. | Cafe reads as coaching and mindset. Terms Glossary is a reference lesson, so staying cafe would feel casual instead of structured. | Use office Andrea `63396931e03943f19c7261cdc675e623` for Terms Glossary b01 and close. This is already in `module-glossary-lessonGLO-A-scenecards.md`. |
| Terms Glossary to Tech Stack | Both are reference/system lessons. | This should feel like one study desk sequence, not a new emotional location. | Use office Andrea `63396931e03943f19c7261cdc675e623` again for Tech Stack b01 and close. If a fresher systems-desk avatar is desired, create it only after storyboard approval. |
| Tech Stack to Lesson 2A | Lesson 2A final uses 1A headset Andrea `e527528e584a404f9da68ee4faca1353` throughout on cornflower blue. Office avatar was dropped from final 2A. | Do not retrofit Tech Stack to match 2A's headset opener unless Jarrad asks. A new lesson reset from office systems mode to headset teaching mode is acceptable. | Keep Tech Stack office. End with a clean system-to-seller bridge. Do not use the portrait hero unless the storyboard calls for a direct-to-camera emotional handoff. |
| Lesson 2B exit to Ideal Seller Profile | Lesson 2B v3 outro uses desk Andrea `8200f90176d6444a8d6943a664a71c1a` and directly teases the Ideal Seller Profile lesson. | ISP is a debrief of the same seller cast. It should feel like the 2B recap continued at the desk. | Use desk Andrea `8200f90176d6444a8d6943a664a71c1a` for ISP b01 and b22. Reuse 2B seller portraits and situation stills as anchors. |
| Ideal Seller Profile to Lesson 3A | Lesson 3A uses office Andrea `63396931e03943f19c7261cdc675e623` bookends, with headset Andrea as in-scene rep. | ISP closes the seller profile and hands to the offer playbook. Both are structured desk/office teaching. | End ISP with desk/office Andrea and an Offer Playbook tease. If matching 3A more tightly is required, swap the final ISP bookend to `63396931e03943f19c7261cdc675e623`, but keep b01 on `8200f90176d6444a8d6943a664a71c1a` to honor the 2B handoff. |

## Sticker text system specs

Source: `docs/course-production/remotion/src/Sticker.tsx`.

Current implemented style wins over older comments. The top comment still mentions thick black borders and yellow/cream pills, but the component is locked to V1 white cards.

| role | font | font weight | font size | padding | radius | background | color | default placement |
|---|---|---:|---:|---|---:|---|---|---|
| `title` | `Baloo 2` by default, `Permanent Marker` optional | 700 for Baloo, 400 for Marker | 84 | `18px 44px` | 26 | `#FFFFFF` | `#111111` | explicit `top/left`, or `topCenter` |
| `label` | `Baloo 2` by default, `Permanent Marker` optional | 700 for Baloo, 400 for Marker | 48 | `10px 26px` | 18 | `#FFFFFF` | `#111111` | bottom-center label queue unless a beat needs `topCenter` |
| `caption` | `Baloo 2` by default, `Permanent Marker` optional | 700 for Baloo, 400 for Marker | 34 | `8px 22px` | 14 | `#FFFFFF` | `#111111` | bottom-center strip |

Implementation details:

- Type aliases: `StickerFont = 'marker' | 'baloo'`; `StickerRole = 'label' | 'title' | 'caption'`.
- Loaded fonts: `@remotion/google-fonts/PermanentMarker` and `@remotion/google-fonts/Baloo2`.
- Palette object in component: yellow `#FFD23F`, cream `#FFF7DE`, white `#FFFFFF`, ink `#111111`.
- The `bg` prop exists but current locked V1 implementation ignores it and always renders `background: '#FFFFFF'`.
- `bottomCenter` position: `bottom: 60`, `left: '50%'`, `transform: translateX(-50%)`.
- `topCenter` position: `top: top ?? 64`, `left: '50%'`, `transform: translateX(-50%)`.
- Free position: pass explicit `top` and `left`.
- Pop animation: `spring({damping: 11, stiffness: 170}, durationInFrames: 20)`.
- Exit animation: if `until` is set, the sticker fades over the last 8 frames.
- Default rotation prop is `-2`, but the current transform only scales and translates. Do not depend on rotation unless the component is updated.
- Shadow: `0 10px 30px rgba(0,0,0,0.10)`.
- `whiteSpace: 'nowrap'`. Long labels that risk clipping should use a custom right-anchored V1 card pattern like Lesson 8A `RightLabel`, not a normal left-anchored `Sticker`.
- Global lesson label rule: one transient bottom-center label visible at a time. Prior label exits before the next enters. Exceptions are diegetic prop text or custom code boards.
- Opening beat rule: no teaching stickers on b01. BMH badge only.

BMH badge:

- Component pattern: `BmhBadge`.
- Asset: `staticFile('lessonA/bmh-endcard.png')`.
- Size and placement in shipped lesson code: width `130`, right `36`, bottom `30`, opacity `0.95`.
- Use on the opening beat only unless a storyboard says otherwise.

## Canonical blue and palette

| value | role | where enforced |
|---|---|---|
| `#62b3f3` | canonical cornflower-blue course background | `PLAYBOOK.md` section 4.5, `MODULE-PRODUCTION-GUIDE.md`, lesson constants named `BLUE`, Remotion root/lesson backgrounds, manifest normalization, QC pixel sampling |
| `#56aaee` | HeyGen portrait-strip backing for certain `e527...` portrait hero clips | `Lesson3B.tsx`, `Lesson5A.tsx`, and PLAYBOOK section 10.1. Only use after measurement. |
| `#5baded` | sampled approximate 5A portrait strip blue | PLAYBOOK section 10.1 measurement note. Used only to explain seam match. |
| `#FFD23F` | sunflower yellow | `Sticker.tsx`, lesson palette constants, still prompts |
| `#F5871F` or `#FF8A3D` | orange/tangerine accent | lesson palette constants. Use one consistently in a given lesson. |
| `#FFF7DE` | cream | `Sticker.tsx`, lesson palette constants, still prompts |
| `#FFFFFF` | warm white / card white | `Sticker.tsx` V1 cards, flat faces and hands |
| `#111111` | ink black | `Sticker.tsx`, outline strokes, text color |

Palette enforcement:

- Still prompts must say flat sticker-sheet doodle, thick wobbly black outlines, flat fills only, yellow/orange/cream/white/black on cornflower blue.
- Do not allow gradients, shadows, texture, dithering, hatching, photorealism, 3D render, skin tones, or ambient doodles.
- Faces and hands should be flat white or cream. This is especially important in nano edits, which add peach skin unless forbidden.
- No text, words, letters, numbers, readable app UI, logos, labels, or paperwork in generated stills unless a single approved exception exists. Text belongs in Remotion.
- Object-realism exceptions are allowed only when meaning fails, for example cardboard kraft boxes or cash money-green. Do not generalize an exception into a new palette.
- Stills are normalized to `#62b3f3` at manifest ingest by sampling native background, colorkeying it, and overlaying canonical blue.
- For animation clips over blue, prefer alpha ProRes and let code own `#62b3f3`. Baked-blue yuv clips can decode several points off.
- Full-scene HeyGen or Seedance clips with their own office wall, sky, beach, or neighborhood background are exempt from canonical-blue pixel checks.

## Still generation pipeline

Standard reference inputs:

- `docs/design/style-ref-1.png`
- `docs/design/style-ref-2.png`
- `docs/design/cast-board.png`
- `docs/design/object-board.png`
- Approved Andrea identity still: `course-assets/avatar-candidates/andrea_headset_v2.png`

Known Higgsfield media IDs from the guide:

- `docs/design/style-ref-1.png`: `b345db3c-3cf3-44e8-b890-53b1b80f6a91`
- `docs/design/object-board.png`: `ff847fda-ecb4-450e-b1f9-0293e9bc1edb`
- `docs/design/cast-board.png`: `c86e1fa9-df75-4cbc-ba32-8479b0829538`

Standard still command shape:

```text
codex exec -i "docs/design/style-ref-1.png" -i "docs/design/style-ref-2.png" -i "docs/design/cast-board.png" -i "docs/design/object-board.png" --skip-git-repo-check --sandbox workspace-write
```

Current prompt lock:

```text
Flat sticker-sheet doodle illustration on cornflower blue #62b3f3. Thick rounded black hand-drawn outlines with slight wobble. Flat fills only: yellow, orange, cream, white, black. No gradients, no texture, no shadows, no lighting, no perspective, no skin-tone shading. Faces and hands are flat white or cream. Small dot eyes, tiny curved cast-board nose, simple mouth, cylindrical limbs, strong simple silhouettes. No ambient doodles. No readable text, letters, numbers, app logos, labels, captions, UI labels, or readable paperwork anywhere. 16:9 composition, 1600x900 PNG.
```

Character anchor rule:

- Anchor every recurring character before the second generation that includes them.
- Use a cropped reference as an extra `-i` input and prompt `IDENTICAL to the attached reference`.
- Do not rely on role names like "seller", "phone representative", or "BMH rep" alone.
- Priya anchor: cast-board bottom row identity, black back ponytail, orange/yellow headband, orange headset with boom mic, yellow top, cream pants, flat white/cream face.
- If a prompt says "phone representative" without a Priya crop, nano can draw a phone mascot. Use "Priya" and attach the crop.

Existing anchor paths:

- `course-assets/scenes/module-05-lesson5B/_anchors/seller.png`
- `course-assets/scenes/module-07/_anchors/jim.png`
- `course-assets/scenes/module-07/_anchors/mark.png`
- `course-assets/scenes/module-07/_anchors/david.png`
- `course-assets/scenes/module-07-lesson7B/_anchors/rep_andrea.png`
- `course-assets/scenes/module-07-lesson7B/_anchors/seller_male.png`
- `course-assets/scenes/module-08/_anchors/carol.png`
- `course-assets/scenes/module-08/_anchors/david.png`
- `course-assets/scenes/module-08/_anchors/grace.png`
- `course-assets/scenes/module-08/_anchors/jim.png`
- `course-assets/scenes/module-08/_anchors/marcus.png`
- `course-assets/scenes/module-08/_anchors/mark.png`
- `course-assets/scenes/module-08/_anchors/ray.png`
- `course-assets/scenes/module-12/_anchors/priya.png`
- `course-assets/scenes/module-18-lesson18A/_anchors/operator-priya.png`

ISP-specific seller anchor set:

- David portrait: `course-assets/scenes/module-02-lesson2B/m02_L2B_david.png`
- David situation still: `course-assets/scenes/module-02-lesson2B/m02_L2B_david_scene.png`
- Beth portrait: `course-assets/scenes/module-02-lesson2B/m02_L2B_beth.png`
- Beth situation still: `course-assets/scenes/module-02-lesson2B/m02_L2B_beth_scene.png`
- Ray portrait: `course-assets/scenes/module-02-lesson2B/m02_L2B_ray.png`
- Ray situation still: `course-assets/scenes/module-02-lesson2B/m02_L2B_ray_scene.png`
- Carol portrait: `course-assets/scenes/module-02-lesson2B/m02_L2B_carol.png`
- Carol situation still: `course-assets/scenes/module-02-lesson2B/m02_L2B_carol_scene.png`
- Carol conflict still: `course-assets/scenes/module-02-lesson2B/m02_L2B_carol_argue.png`
- Marcus portrait: `course-assets/scenes/module-02-lesson2B/m02_L2B_marcus.png`
- Marcus situation still: `course-assets/scenes/module-02-lesson2B/m02_L2B_marcus_scene.png`

New lesson still generation guidance:

- Terms Glossary: office/reference imagery, blank cards, boards, glossary objects, no readable terms in AI art. Use `633...` bookend only, not sellers.
- Tech Stack: abstract app panels only. No real logos, no readable UI, no actual private data. Use blank panes and code-render `HubStaff`, `Sandra`, `DialPad`, `Gmail`, or other labels later if approved by storyboard.
- ISP: reuse 2B seller portraits and situation stills. For multi-seller boards, attach every seller portrait used in that still. For Priya call scenes, attach a Priya crop.

## Seedance, HeyGen, and audio standards

Audio:

- Generate speech through `/v3/voices/speech`, never through `/v3/videos {script, voice_id}`.
- Narrator voice: Elizabeth-Friendly `55f8c0f546884f9cbdefa113f5e7b682`.
- Finale-only voice: Elizabeth-Excited `91120f72682e4459a19e311ba2ee4cb2`.
- Default speed: `1.0`. Do not use `0.95` or `0.9` for new narration unless Jarrad explicitly asks.
- Per beat request body: `{text, voice_id, speed:1.0}`.
- Normalize each downloaded wav with `loudnorm=I=-16:TP=-1.5:LRA=11`.
- Save word timestamps into each lesson `_state.json`; Remotion stickers key off those timestamps.
- Add inter-beat gaps at manifest build, not baked into beat wavs.
- Default inter-beat gap: `1.0s`, except Lesson 1B shipped with liberal `1.5s` to `2s` pauses.

HeyGen:

- API key path: `~/.config/bmh-course/heygen.key`. Never print the key.
- Create a new photo avatar by uploading image to `/v3/assets`, then `POST /v3/avatars` with `{"type":"photo","name":"<label>","file":{"type":"asset_id","asset_id":"<asset>"}}`.
- The `name` field is required.
- Read the avatar id at `data.avatar_item.id`.
- Wait about 45s after avatar creation before testing.
- Gate a new setting avatar with one test clip before batch generation.
- Avatar clip body: `{type:"avatar", avatar_id, audio_asset_id, resolution:"720p", aspect_ratio:"16:9", expressiveness:"low", motion_prompt:"..."}`.
- Upload normalized beat wavs through `/v3/assets`, then pass `audio_asset_id` into `/v3/videos`.
- Use concrete motion wording to calm hands, for example `hands resting still, barely any hand movement, no large or sweeping gestures`.
- `expressiveness:"low"` helps but is not enough by itself.
- Hero beats are full-frame. Corner-circle beats crop in Remotion, commonly 340px circle at lower-right with 10px white border.

Seedance:

- Current model of record: `seedance_2_0`.
- Cheap iteration model: `seedance_2_0_mini`.
- Standing duration: `15s`, never loop.
- Standard params: `model:"seedance_2_0"`, `mode:"std"`, `resolution:"720p"`, `duration:15`, `generate_audio:false`.
- Standard triple clamp medias:

```json
[
  {"value":"<still>", "role":"start_image"},
  {"value":"<same still>", "role":"end_image"},
  {"value":"<cast-board>", "role":"image_references"},
  {"value":"<style-ref>", "role":"image_references"}
]
```

- Prompt spine:

```text
Flat 2D vector doodle cartoon, thick uniform black outlines, solid flat fills, five-color palette on cornflower blue, match the reference images exactly, do not restyle. SCENE/MOTION: <specific subtle motion>. Locked static camera. NEGATIVE: color drift, restyling, photorealism, 3D render, shading, gradients, new elements, on-screen text, watermark.
```

- Non-clamped exception: use start-image only when the motion requires true traversal, for example office walkers exiting. Same-frame clamp can make walkers march in place.
- Two-character exception: if using non-clamped two-character motion, name both exact character appearances in the prompt, include style and cast refs, request `count:2`, and dense-sample both candidates.
- Always dense-sample animation candidates before accepting. The first 2s can hide clone, style, and motion failures.
- If the animation is alpha over code blue, render base still only after the clip as the hold-tail. Do not put the still under the transparent clip while it plays.
- For non-clamped clips, freeze the clip's own last frame as hold-tail. Do not fall back to the start still.

## Render and encode standards

Remotion:

- Composition dimensions: width `1600`, height `900`, fps `30`.
- Root examples: `docs/course-production/remotion/src/Root.tsx`, `root2A.tsx`, `root5A.tsx`, `root7B.tsx`, `root18B.tsx`.
- Lesson visual base: `AbsoluteFill` or equivalent with `backgroundColor: '#62b3f3'` unless the beat is a full-scene video/hero.
- Master audio is the single clock. Hero and animation videos are muted in Remotion unless a lesson explicitly does otherwise.
- Render command pattern: `npx remotion render src/index<X>.ts Lesson<X> <output>.mp4`.
- Use isolated entries when shared `Root.tsx` is blocked by another lesson tab or missing public manifests.
- Output path pattern: `course-assets/review-lesson<X>/LESSON-<X>-v1-FULL.mp4`.

Transition language:

- Current July 8 rule from `scene-card-v2.md`: use 1A camera-travel slide only when the cut reads as the camera moving to a different location on the blue plane.
- Graphic-to-graphic and diagram-to-diagram changes are straight cuts with internal pop-ins.
- Fades only at true open, close, or end-card moments.
- Never use a mid-lesson fade.
- Do not copy old transition code blindly. Some shipped files still use stale seed formulas like `charCodeAt(1)+charCodeAt(3)`.
- Current seed direction in PLAYBOOK: vary by beat tag chars with `charCodeAt(1)+charCodeAt(2)`.

Encode and QC:

- Final deliverable should be QuickTime-safe H.264/AAC, `yuv420p`, limited/tv range, BT.709 tagged.
- Force BT.709 on every ffmpeg re-encode that touches color, both decode and encode.
- QC every render before delivery with the course video QC procedure:
  - per-beat frame harvest at transition-safe offsets;
  - canonical-blue pixel check on code-blue beats;
  - edge-clip check;
  - `silencedetect`;
  - `volumedetect`;
  - target mean loudness around `-20dB` plus or minus `6dB`;
  - dense first-2s sampling for animation clips;
  - visual review of every harvested frame against standing rules.
- Full-scene video or hero scene beats are exempt from canonical-blue checks because their background is native rendered content.
- Known good shipped references:
  - Lesson 1B v3: `course-assets/review-lessonB/LESSON-1B-v3-FULL.mp4`, 6:06, loudness `-21.6dB`, all-PASS.
  - Lesson 2A final: `course-assets/review-lesson2A/LESSON-2A-v1-FINAL.mp4`, 7:20, all-PASS.
  - Lesson 2B v3: `course-assets/review-lesson2B/LESSON-2B-v3-FULL.mp4`, 5:58, all-PASS.
  - Lesson 3A rev1: `course-assets/review-lesson3A/LESSON-3A-rev1-FULL.mp4`, 7:43, loudness `-21.5dB`, all-PASS.

## New lesson choices

| lesson | placement | bookend avatar | cast anchors | transition posture |
|---|---|---|---|---|
| Terms Glossary | after 1B, before Tech Stack | `63396931e03943f19c7261cdc675e623` office Andrea | none unless a recurring cast member appears | Office reference mode. Straight cuts between glossary cards and diagrams. Slide only if moving to a new scene location. |
| Tech Stack | after Terms Glossary, before 2A | `63396931e03943f19c7261cdc675e623` office Andrea | Priya only if a rep-at-system scene is used | Systems walkthrough. Use blank app-like panes. No real logos or readable UI in stills. Straight cuts between panels. |
| Ideal Seller Profile | after 2B, before 3A | `8200f90176d6444a8d6943a664a71c1a` desk Andrea, with possible final swap to `63396931e03943f19c7261cdc675e623` only if matching 3A is prioritized | 2B portraits for David, Beth, Ray, Carol, Marcus; Priya crop for call/discovery beats | Direct continuation from 2B. Reuse seller identity anchors. Close with Offer Playbook tease into 3A. |


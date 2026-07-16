# BMH Institute artwork production specification

Status: blocked pending Jarrad's approval of all three thumbnail pilots.

This specification prepares the post-approval artwork lane. It does not approve
the pilots, generate new images, update manifest approvals, upload files, or
publish course content.

## Locked output inventory

The machine-readable source is `production-inventory.json`. It is regenerated
from the course manifest and fails if the manifest artwork keys, lesson order,
video order, titles, paths, or missing approval state have drifted.

| Output class | Count | Final dimensions |
| --- | ---: | --- |
| Course cover | 1 | 1280 x 800 |
| Lesson cards | 19 | 1280 x 800 |
| Video posters | 29 | 1280 x 720 |

The 49 final output paths match the current manifest exactly. Every poster has
one video asset key, one poster asset key, one lesson master, one focus subject,
and one derivative recipe. Reusing a poster path or final pixel checksum is a
blocking error.

## Pilot mapping

The review pilots map to the production catalog as follows. Approval of a pilot
authorizes its topic and style for production. It does not approve the final
manifest asset until the promoted derivative passes the same artwork QA as the
rest of the batch.

| Pilot | Lesson topic | Lesson asset key | First poster asset key |
| --- | --- | --- | --- |
| Orientation | Welcome and Mindset | `thumbnail-slot-01` | `poster-video-slot-01-welcome` |
| Opening the Call | Opening the Call | `thumbnail-slot-07` | `poster-video-slot-07-opening` |
| Objection Architecture | Objection Architecture | `thumbnail-slot-09` | `poster-video-slot-09-objection-architecture` |

The Orientation master also supplies a distinct Mindset poster. The Opening
the Call master also supplies a distinct Fact Find poster. Their focused recipes
are listed separately in the inventory. The Objection Architecture lesson has
one video and therefore uses the full safe master for its only poster.

## Generation contract

After explicit pilot approval, use the built-in image generation tool. Make one
distinct generation call for the course cover and one for each remaining lesson
master. Do not use a single multi-image call or treat repeated variants as
distinct lesson subjects.

Promote each approved pilot from its checksum-locked flat master. Do not call the
model again for an approved pilot. The inventory marks these three records as
`promote-approved-pilot-flat-master` and marks the other 16 lesson records as
`generate-after-pilot-approval`. The retained pilot files are review evidence
outside the 49 manifest output paths.

Each inventory entry contains its exact prompt, reference input identifiers,
planned source path, planned flat-master path, provenance requirements, and
approval record. Keep the following production record for every call:

- Exact prompt text and prompt SHA-256.
- Built-in tool as generator.
- Generation timestamp and operator.
- Generated source path and source SHA-256.
- Every reference path and locked reference SHA-256.
- Correction prompt and parent checksum when a correction is required.
- Flat-master path, dimensions, palette result, and checksum.
- Visual review status, reviewer, timestamp, and evidence path.

No generated source is approved merely because it exists. The manifest remains
`missing` until the source, flat master, card, and all mapped posters pass QA and
receive the required approval.

## BMH Sticker System rules

Every master uses the same locked rules as the pilots:

- Uniform cornflower-blue background.
- Thick, slightly wobbly black outlines.
- Rounded imperfect geometry and simple sticker silhouettes.
- Exactly the locked eight-color palette after flattening.
- No title, words, letters, numbers, logos, watermark, gradients, lighting,
  shadows, reflections, texture, depth, realistic perspective, or 3D rendering.
- Meaningful objects stay inside the central 80 percent.
- Every video focus subject is a complete independently recognizable sticker
  cluster in its declared left, center, right, or full safe zone.
- Decorative marks remain limited and must support the lesson subject.

The Compensation Engine prompt intentionally excludes currency, dollar figures,
fixed pay promises, and numeric targets. It depicts the current written role
plan connected to verified work and outcomes.

## Card derivation

Generate a 16:9 lesson master. Preserve the entire master when producing the
16:10 lesson card:

1. Flatten the source to the exact eight-color palette with no dithering.
2. Scale it to 1280 x 720 with Lanczos resampling.
3. Place it on a 1280 x 800 solid cornflower-blue canvas.
4. Add 40 pixels of blue padding above and below.
5. Do not crop or stretch the master.
6. Save as lossless WebP at the manifest `local_path`.

This matches the accepted pilot derivative method and prevents card crops from
removing a teaching sticker.

## Poster derivation

Each lesson master contains one independently framed anchor for each video in
that lesson. The inventory maps every video to its named anchor and one safe crop
profile:

- `full-safe`: use the complete 16:9 master.
- `left-safe`: use the normalized window x 0.05, y 0.20, width 0.60,
  height 0.60.
- `center-safe`: use the normalized window x 0.20, y 0.20, width 0.60,
  height 0.60.
- `right-safe`: use the normalized window x 0.35, y 0.20, width 0.60,
  height 0.60.

The crop ratios are expressed against a 16:9 source. Equal normalized width and
height therefore retain a 16:9 pixel aspect ratio. Resize the selected window to
1280 x 720 with Lanczos resampling and save as lossless WebP.

Do not move a crop window to make a failed master appear usable. If a named
anchor is clipped, missing, or located in the wrong zone, reject or correct the
master. If a focused poster depicts another video's subject, reject it. If two
posters have the same final pixel SHA-256, reject both until the duplicate is
resolved.

## Approval and provenance fields

Every cover, lesson, card, and poster record has a structured approval object:

```json
{
  "status": "blocked-pending-pilot-approval",
  "approved_by": null,
  "approved_at": null,
  "evidence": null
}
```

Only the three lesson-level pilot records use
`awaiting-jarrad-approval`. Production outputs remain blocked. After Jarrad's
decision, record the pilot decision separately before generating the rest of the
batch. Do not rewrite historical prompt, reference, or checksum fields when an
asset receives approval.

## Commands and checks

Regenerate the inventory from the current course manifest:

```bash
node scripts/course-content/build-artwork-production-inventory.mjs
```

Run the inventory contract tests:

```bash
node --test content/course-manifests/bmh-artwork-production.qa.test.mjs
```

Run the existing pilot derivative reproduction and checksum check before pilot
review:

```bash
python3 scripts/course-content/prepare-thumbnail-pilots.py
git diff --exit-code -- \
  course-assets/thumbnails/pilots \
  course-assets/posters/pilots \
  docs/course-production/thumbnail-pilots/checksums.json
```

After production assets exist, final QA must verify:

1. Exactly one cover, 19 cards, and 29 posters exist at inventory output paths.
2. Every card is 1280 x 800 and every poster is 1280 x 720.
3. Every final asset uses only the locked eight-color palette.
4. All 49 output paths and all 29 poster pixel checksums are unique.
5. Each poster visibly matches its inventory `focus_subject` and video title.
6. Every source, prompt, reference, flat master, derivative, and approval field
   has a complete provenance record.
7. The course manifest is updated only after checksums and approvals are final.

Batch generation remains prohibited until Jarrad explicitly approves the three
pilots.

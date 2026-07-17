# BMH Institute thumbnail pilots

Status: **V8 awaiting Jarrad approval**. These exact files are isolated review
pilots. They are not approved, uploaded, published, or referenced as approved
course assets.

## Locked creative rule

- Exactly one person appears in each thumbnail.
- The person is Andrea **or** the recurring curly-haired seller, never both.
- The exact lesson video and its checksum-locked contact sheet determine the
  character and visual cue.
- Andrea and the seller retain their approved face, hair, proportions, wardrobe
  language, pure-white skin fill, and line weight while posture, position, and
  lesson-specific action vary between independent masters.
- No independent master may repeat another master's complete posture,
  orientation, gesture, and placement signature.
- Faces and hands use pure white. Backgrounds use the locked cornflower blue or
  golden yellow.
- There is no title text, logo, watermark, room, scenery, gradient, texture, or
  additional person.

## Exact V8 review deliverables

| Pilot | Person | Background | Lesson card (16:10) | Video poster (16:9) |
| --- | --- | --- | --- | --- |
| Orientation | Andrea, standing welcome | Cornflower blue | `course-assets/thumbnails/pilots/revisions/v8/lesson-cards/orientation-andrea-standing-lesson-card-v8-16x10.webp` | `course-assets/thumbnails/pilots/revisions/v8/video-posters/orientation-andrea-standing-video-poster-v8-16x9.webp` |
| Opening the Call | Andrea, seated at desk | Cornflower blue | `course-assets/thumbnails/pilots/revisions/v8/lesson-cards/opening-andrea-seated-lesson-card-v8-16x10.webp` | `course-assets/thumbnails/pilots/revisions/v8/video-posters/opening-andrea-seated-video-poster-v8-16x9.webp` |
| Objection Architecture | Recurring seller, standing gesture | Golden yellow | `course-assets/thumbnails/pilots/revisions/v8/lesson-cards/objection-seller-gesturing-lesson-card-v8-16x10.webp` | `course-assets/thumbnails/pilots/revisions/v8/video-posters/objection-seller-gesturing-video-poster-v8-16x9.webp` |

Opening the Call deliberately changes Andrea from the standing Orientation pose
to a three-quarter seated desk pose. Objection Architecture uses the seller to
provide the second identity and golden-yellow background without placing both
people in one card.

## Canonical evidence

- Identity roots: `references/v5-cast/andrea-approved.png` and
  `references/v5-cast/recurring-seller.png`.
- Video-informed inputs: the three exact contact sheets under
  `references/v7-video-stills/`; their source-video paths and SHA-256 values are
  recorded in `v8-generation-lineage.json`.
- Exact prompts: `prompts/v7/` for retained V7 sources and `prompts/v8/` for the
  pose-varied Opening edit.
- Generated sources, deterministic character/contour operations, and tool output
  IDs: `v8-generation-lineage.json`.
- Source, flat-master, card, and poster dimensions and SHA-256 values:
  `v8-checksums.json` and `v8-derivative-report.json`.
- Human-readable QA: `V8-QA-REPORT.md`.

The canonical `production-inventory.json` and still-pending
`production-ledger.json` bind these exact V8 files through the honest
two-identity-root `bmh-thumbnail-pilot-lineage/v4-candidate` contract. They no
longer bind the superseded V1/V2 pilot bytes.

## Verification and approval gate

```bash
node scripts/course-content/prepare-thumbnail-pilot-revision.mjs docs/course-production/thumbnail-pilots/v8-derivative-config.json --check
node scripts/course-content/build-artwork-production-inventory.mjs --check
npm run artwork:production -- verify
npm run test:artwork-production
```

The workflow verifies the exact identity roots, contact sheets, prompts,
generated sources, derivatives, checksums, backgrounds, one-person character
assignments, and pending approval state. It rejects mixed roots, an additional
person, a wrong character assignment, or stale lineage.

Batch generation remains gated on Jarrad's explicit approval of all three exact
cards. Approval must be recorded in the checksum-bound artifact described in
`PRODUCTION-SPEC.md`. Passing automated QA does not imply human approval.

After approval, the workflow promotes these exact bytes. It does not regenerate
the approved pilot card or poster. Opening the Call supplies only its card and
Opening poster; Fact Find retains a separate post-approval master and generation
call.

The superseded V1-V7 sources and records remain only as rejection history and
legacy regression fixtures. They are not current review candidates.

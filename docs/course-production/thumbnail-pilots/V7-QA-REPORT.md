# Single-character pilot v7 QA report

Status: awaiting Jarrad approval. V7 is not in the canonical artwork ledger or
course manifest.

## Corrected cast rule

- Every card contains exactly one person.
- Orientation and Opening the Call use Andrea only.
- Objection Architecture uses the recurring curly-haired seller only.
- Andrea and the seller never appear together.
- Every face and hand uses the locked pure-white fill.

## Video-informed choices

- Orientation: Andrea on blue with a doorway, steps, and flag, based on the
  checksum-locked Welcome and Mindset cuts.
- Opening the Call: Andrea on blue with a telephone cue, based on the approved
  Opening and Fact Find cuts.
- Objection Architecture: the recurring seller on yellow with a pushback-to-answer
  cue, based on the approved Objection Architecture cut.

The exact source-video paths and checksums and the exact contact-sheet bytes used
as generation inputs are recorded in `v7-generation-lineage.json`.

## Andrea consistency proof

Image generation did not preserve Andrea closely enough by itself. The
derivative pipeline therefore replaces the Opening character region with the
same checksum-locked Andrea pixel layer used by Orientation.

- Locked source box: `[700, 280, 260, 660]`
- Exact copied character pixels: `94,006`
- Character pixel SHA-256:
  `60f03180512c6825c5f90a0bf3d5ef7d7699cc45c69acd66dc2622a0b26babf5`
- Character drift pixels between the two flat masters: `0`
- Character drift pixels between the two final 16:10 cards: `0`

Only the lesson cue differs between Andrea's two blue cards. The seller card
provides the golden-yellow background variation without hiding Andrea's yellow
shirt or shoes.

## Contour consistency proof

The edited seller initially used a visibly thinner pen. A checksum-locked
one-source-pixel contour normalization now brings the final 16:10 card into the
same central line-weight range as Andrea.

- Andrea: median `4 px`, mean `3.67 px`, interquartile range `3–4 px`
- Seller: median `4 px`, mean `4.03 px`, interquartile range `3–5 px`
- Median delta: `0%`
- Mean delta: `10.03%`

The seller retains slightly more upper-tail hand-drawn variation, but no longer
reads as a different heavy or thin pen.

## Deterministic derivative proof

`prepare-thumbnail-pilot-revision.mjs` write mode and `--check` mode both pass.
All source, flat-master, 16:10 learner-card, and 16:9 video-poster checksums are
recorded in `v7-derivative-report.json` and `v7-checksums.json`.

The derivatives use the locked eight-color palette, no dithering, lossless
WebP, and background-colored 16:10 padding. No title text, logo, watermark,
room, scenery, gradient, texture, or extra person is present.

## Promotion gate

Explicit approval of these three exact cards is required before the course
cover or remaining lesson thumbnails are generated. Approval will also trigger
canonical support for the honest two-identity-root v3 lineage; V7 will not be
misrepresented as a single shared-parent v2 generation.

# Paired pilot v6 QA report

Status: awaiting Jarrad approval; not promoted to the canonical artwork ledger.

## Locked cast

- Andrea remains on the left with the approved curly-hair silhouette, orange
  headset, yellow top, and orange pants.
- The recurring curly-haired seller remains on the right in the approved orange
  long-sleeve top and cream pants, without a headset.
- Both characters retain white face and hand fills, matching black contour
  weight, the same eye line, the same scale, and the same placement across all
  three cards.

## Five-second lesson read

- Orientation: blue background; open doorway, rising steps, and flag communicate
  entry and progress.
- Opening the Call: yellow background; telephone handset and sound marks
  communicate a live call.
- Objection Architecture: blue background; jagged pushback symbol, curved arrow,
  and checked speech bubble communicate moving from resistance to a calm answer.

No card contains title text, labels, numbers, logos, scenery, furniture, a third
person, or a watermark.

## Deterministic derivatives

`prepare-thumbnail-pilot-revision.mjs --check` reproduced all source, flat
master, 16:10 learner-card, and 16:9 video-poster checksums recorded in
`v6-derivative-report.json` and `v6-checksums.json`.

The export contract uses the locked eight-color palette without dithering,
per-card blue or yellow normalization, background-colored 16:10 padding rather
than cropping, and lossless WebP output. The paired cast therefore remains fully
visible and does not shift between card and poster formats.

## Promotion gate

Approval of these exact checksum-locked learner cards is required before:

1. replacing the canonical pilot lineage and checksum files;
2. rebuilding the production artwork inventory under lineage v2;
3. generating the course cover or the remaining lesson artwork; or
4. updating the course manifest to reference the new artwork.

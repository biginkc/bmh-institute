---
status: complete
task: approved-thumbnail-review
date: 2026-07-20
---

# Approved thumbnail review upload

Package the complete thumbnail set approved by Jarrad on 2026-07-20, promote the 19 content thumbnails through the production manifest, retain assignment thumbnail bindings as null, and preserve exact rollback bytes.

## Boundaries

- Preserve approved 1280 x 800 source images without modifying their pixels.
- Bind the final approval to the exact preapproval review surface and all 19 content PNG checksums.
- Replace only lesson-card WebPs; do not replace video posters.
- Keep all six assignment thumbnail bindings null.
- Archive the replaced WebPs before promotion.

## Verification

- All 15 approved files exist, are PNGs, and are exactly 1280 x 800.
- The review index contains 25 unique visible positions: 21 approved concepts and 4 assignment thumbnails not required.
- All 19 production content thumbnails have a matching approved PNG, lossless WebP, SHA-256 checksum, and rollback archive.
- The generated contact sheet is reproducible from the index and source files.
- The production ledger, full manifest, and Tech Stack canary manifest validate against the replacements.

---
status: in_progress
task: approved-thumbnail-review
date: 2026-07-20
---

# Approved thumbnail review upload

Package the 15 lesson thumbnails approved by Jarrad on 2026-07-20 into a review-only merge request. Show the full 25-card learner sequence in one contact sheet, using explicit placeholders for the 6 lesson concepts that have not been designed or approved yet and marking the 4 remaining assignments as not requiring thumbnails.

## Boundaries

- Preserve approved 1280 x 800 source images without modifying their pixels.
- Do not promote the redesign into the checksum-bound production artwork ledger in this partial batch.
- Do not represent placeholder cards as approved artwork.
- Open the merge request as a draft because the set is intentionally incomplete.

## Verification

- All 15 approved files exist, are PNGs, and are exactly 1280 x 800.
- The review index contains 25 unique visible positions: 15 approved, 6 pending, and 4 assignment thumbnails not required.
- Every approved index entry has a matching file and SHA-256 checksum.
- The generated contact sheet is reproducible from the index and source files.

---
status: complete
task: video-poster-redesign
date: 2026-07-21
---

# Video poster redesign correction

The July 20 thumbnail rollout updated the 19 lesson-card images but explicitly left all 29 pre-play video posters on the old artwork. Jarrad reported the mismatch and directed that the posters be swapped.

All 29 poster assets now use deterministic 1280 x 720 crops of the matching approved 1280 x 800 lesson-thumbnail sources. Lessons with multiple video parts use top, center, and bottom crop positions so each video retains a distinct poster checksum. The video files themselves were not modified.

The old poster bytes are checksum-archived under `course-assets/posters/redesign-history/`. The production ledger, full manifest, and canary manifest point to the new checksum-addressed poster objects. The correction is bound to `docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json`.

## Verification

- `npm run artwork:poster-redesign:verify`
- `node --test content/course-manifests/bmh-video-poster-redesign.qa.test.mjs content/course-manifests/bmh-employee-training.qa.test.mjs`
- `npm run artwork:redesign:verify`
- `npm run artwork:production -- verify`

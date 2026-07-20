# BMH Employee Training thumbnail redesign

![Approved thumbnail review board](approved-and-pending-review-board.png)

This is the approved review and production-promotion package from the 2026-07-20 thumbnail session.

- 21 concepts were approved as their exact 1280 x 800 PNG review files.
- 19 content concepts are promoted as lossless 1280 x 800 WebP lesson thumbnails.
- The 2 approved assignment concepts remain review references because assignments do not bind thumbnails in the manifest.
- The other 4 assignment cards are marked `NO THUMBNAIL REQUIRED`.
- The review sequence matches the 25 learner-facing content and assignment cards.
- The 29 video posters are unchanged.

The machine-readable mapping is in [`review-index.json`](review-index.json). Checksums and dimensions are recorded in [`review-evidence.json`](review-evidence.json). The exact preapproval surface remains under [`approvals/`](approvals/), and Jarrad's response is bound to all 19 production PNGs in [`thumbnail-redesign-approval-2026-07-20.json`](approvals/thumbnail-redesign-approval-2026-07-20.json).

The production workflow:

```bash
npm run artwork:redesign-review
npm run artwork:redesign:verify
npm run artwork:production -- verify
```

Each replaced WebP is checksum-addressed in the course manifest. Its prior production bytes are retained under `course-assets/thumbnails/redesign-history/` for exact rollback.

# BMH Institute thumbnail promotion evidence

- Goal: promote Jarrad's approved BMH Employee Training thumbnails into the application.
- Plan source: `.planning/quick/20260720-approved-thumbnail-review/PLAN.md`.
- Approval surface: `docs/course-production/thumbnail-redesign/approvals/preapproval-review-board-2026-07-20.png`.
- Approval evidence: `docs/course-production/thumbnail-redesign/approvals/thumbnail-redesign-approval-2026-07-20.json`.
- Rollback point before merge: `origin/main` at promotion-branch creation; record the final SHA immediately before merge.

## Acceptance gates

- [x] Exact approval binds all 19 content PNGs and preserves the assignment-thumbnail-free policy.
- [x] All 19 content PNGs promote to lossless 1280 x 800 WebPs with identical decoded pixels.
- [x] Previous production WebPs are archived by checksum.
- [x] All 29 video posters remain unchanged.
- [x] Production artwork ledger and full/canary manifests reconcile and validate.
- [x] Artwork review and course-content suites pass.
- [ ] Full project verification passes on the final diff.
- [ ] Manual code review is clean.
- [ ] Independent reviewer reports high-confidence readiness.
- [ ] PR checks pass and the PR is conflict-free.
- [ ] Production assets/import complete and Chrome verifies the live dashboard.

# Archived course manifests

Files in this directory are immutable rollback and audit evidence. They are not active import inputs.

`bmh-employee-training.legacy-release-20260721.v1.json` is the exact manifest released to production for import `bmh-employee-training-v1` on 2026-07-21 at 10:57 PM America/Chicago. Its SHA-256 matches the immutable production release receipt and Git commit `1435458d201eb3b94e6c7589f9512f24fa537476`.

The archived release contains 19 quizzes and 342 questions. Every quiz draws 10 questions per attempt. It was superseded because the approved exhaustive bank contains 920 questions and must deliver every question in each randomized attempt.

Normal build and import commands use `../bmh-employee-training.v1.json`. Never pass an archived file to the importer except during an explicitly confirmed rollback.

`bmh-employee-training.released-content-block-revision-target-20260726.v1.json` is a different kind of archive: it is the fixed, immutable *target identity* the `fn_revise_released_content_blocks_v1` migration (`supabase/migrations/20260726170000_revise_released_content_blocks.sql`) and its client command (`scripts/course-content/revise-released-content-blocks.ts`) are permanently pinned to (SHA-256 `585b72c9...`, matching the SQL function's hardcoded `v_target_manifest_sha256` and `src/lib/course-import/released-content-block-revision.ts`'s `targetManifestSha256`). It captures the released catalog exactly as it stood with the 19 guide + 19 flashcard corrections and the 6 frozen Closer Lab role-play inserts applied, and nothing else. `scripts/course-content/revise-released-content-blocks.ts` reads this file as its default target manifest, not the live evolving `../bmh-employee-training.v1.json` — the live manifest is expected to keep changing for unrelated reasons (e.g. gaining the 2026-07-28 Andrea Oral Check pilot's 3 blocks), and this pin must never be regenerated to chase it. Regenerating it from whatever the live manifest currently hashes to breaks a historical checksum contract that real production receipts and evidence are permanently tied to (see PR #130 round-3 review finding 1).

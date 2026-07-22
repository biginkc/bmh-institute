# Archived course manifests

Files in this directory are immutable rollback and audit evidence. They are not active import inputs.

`bmh-employee-training.legacy-release-20260721.v1.json` is the exact manifest released to production for import `bmh-employee-training-v1` on 2026-07-21 at 10:57 PM America/Chicago. Its SHA-256 matches the immutable production release receipt and Git commit `1435458d201eb3b94e6c7589f9512f24fa537476`.

The archived release contains 19 quizzes and 342 questions. Every quiz draws 10 questions per attempt. It was superseded because the approved exhaustive bank contains 920 questions and must deliver every question in each randomized attempt.

Normal build and import commands use `../bmh-employee-training.v1.json`. Never pass an archived file to the importer except during an explicitly confirmed rollback.

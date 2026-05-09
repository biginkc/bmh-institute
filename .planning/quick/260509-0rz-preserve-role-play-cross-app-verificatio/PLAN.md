---
status: in-progress
created: 2026-05-09
branch: codex/20260509-003324-bmh-role-play-artifact-cleanup
---

# Preserve role-play cross-app verification artifacts

Goal: preserve useful PR #35 role-play verification evidence before deleting the stale local worktree.

Scope:

- Copy the cross-app role-play screenshots and database proof HTML into `.planning/qa/role-play-cross-app/`.
- Add a short index that explains what each artifact proves.
- Verify the copied files exist and match the source artifact count.
- Remove the old merged role-play worktree after the artifact preservation PR lands.

Out of scope:

- App code changes.
- Database changes.
- Re-running the cross-app browser flow.

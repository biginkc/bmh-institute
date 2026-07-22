---
status: awaiting_human_verify
trigger: "BMH Institute learner videos stop and reset after roughly three seconds during ordinary playback. Fix it end to end."
created: 2026-07-22
updated: 2026-07-22T02:04:31-05:00
---

# Symptoms

- expected: A learner presses the normal Play control and the signed lesson video plays continuously while progress saves in the background. Completion updates without interrupting playback. The quiz or next part unlocks after playback ends.
- actual: Playback stops and resets to 0:00 shortly after the first progress checkpoint. Repeating Play causes another reset at a later progress checkpoint.
- errors: The media element reports no media error. At the failure boundary the signed source changes, the media resource empties, currentTime becomes 0, and paused becomes true.
- timeline: The issue predates the latest course publication. The current two-second progress sampling and unconditional lesson revalidation path was deployed before the July 21 course release.
- reproduction: Sign in as a production learner. Open Lesson 2 Real Estate Terms Glossary or Lesson 3 Tech Stack and Systems. Press the ordinary Play control and observe playback across the first two-second progress save.

# Current Focus

- hypothesis: CONFIRMED AND FIXED IN WORKTREE — background progress no longer revalidates routes, and completion refresh is held until the media ends regardless of whether the completion response arrives before or after `ended`.
- test: Automated verification complete; the remaining gate is a production-like browser run on a deployed build across multiple two-second progress checkpoints and through video completion.
- expecting: The signed source remains stable and playback remains unpaused across routine saves; after `ended`, lesson state refreshes once and the next part or quiz unlocks.
- next_action: Deploy or run this branch in a production-like environment, perform the original learner reproduction, and report whether playback and completion both succeed.
- reasoning_checkpoint:
    hypothesis: Routine progress resets playback because the successful Server Action revalidates the active lesson, while threshold completion has a second premature client refresh path.
    confirming_evidence:
      - Production shows the signed source changing and the media element resetting exactly after progress saves.
      - The incomplete-action RED test directly observes both route revalidations, and the player RED test directly observes refresh before `ended`.
      - The lesson render mints a new signed URL each time it runs.
    falsification_test: If routine progress can cross multiple samples without any active-lesson/client refresh yet the signed source still changes or playback resets, the refresh-causation hypothesis is wrong.
    fix_rationale: Remove all path invalidation from background progress writes because completion is persistent level state, then defer the one client lesson refresh until playback has actually ended.
    blind_spots: Unit and RTL tests cannot emulate a real RSC merge or native media resource lifecycle; production-like browser verification is still required after GREEN.
- tdd_checkpoint:
    test_files:
      - src/app/(dashboard)/lessons/[lessonId]/video-actions.test.ts
      - src/components/video-block-player.test.tsx
    test_names:
      - does not revalidate routes for an incomplete playback observation
      - announces completion but defers the lesson refresh until playback ends
    status: green
    failure_output:
      - expected revalidatePathSpy not to be called, but it was called for /lessons/lesson-1 and /dashboard
      - expected refresh not to be called before ended, but it was called once
    green_output:
      - action suite: 10 passed
      - player suite: 13 passed

# Evidence

- timestamp: 2026-07-22
  observation: Production Lesson 2 and Lesson 3 both reset when a fresh signed URL arrives after a progress save. Lesson 3 reproduced the reset twice across two Play attempts.
- timestamp: 2026-07-22
  observation: Lesson 2 and two control videos match approved source duration, size, checksum, byte ranges, and remote decode checks beyond the reported cutoff.
- timestamp: 2026-07-22
  observation: `VideoBlockPlayer` samples at two seconds and `recordVideoProgress` unconditionally calls lesson and dashboard path revalidation.
- timestamp: 2026-07-22T01:54:07-05:00
  observation: Next.js 16 documentation confirms `revalidatePath` inside a Server Function updates the UI immediately when the affected path is being viewed; this is not deferred cache invalidation.
- timestamp: 2026-07-22T01:54:07-05:00
  observation: The active lesson render calls `enrichBlocksWithSignedUrls`, which invokes `createSignedUrls` on every render and passes the newly minted `signed_url` through `ContentBlockRenderer` to the `<video src>` prop.
- timestamp: 2026-07-22T01:54:07-05:00
  observation: `recordVideoProgress` calls both `revalidatePath(`/lessons/${trusted.lessonId}`)` and `revalidatePath("/dashboard")` after every successful observation without checking `trusted.completed`.
- timestamp: 2026-07-22T01:54:07-05:00
  observation: `VideoBlockPlayer` separately calls `router.refresh()` as soon as a progress response first reports completion; completion is awarded at the watched-coverage threshold before the media necessarily ends.
- timestamp: 2026-07-22T01:55:00-05:00
  observation: The new incomplete-progress action regression fails RED exactly as predicted: an incomplete observation invokes `revalidatePath` twice, for `/lessons/lesson-1` and `/dashboard`; the other nine focused action tests pass.
- timestamp: 2026-07-22T01:55:28-05:00
  observation: The completion-boundary player regression also fails RED exactly as predicted: `router.refresh()` is called once before the media `ended` event; the other eleven focused player tests pass.
- timestamp: 2026-07-22T01:58:36-05:00
  observation: The focused action suite is GREEN after the patch: all 10 tests pass, including zero revalidation for incomplete progress and unchanged trusted Sandra completion behavior.
- timestamp: 2026-07-22T01:59:11-05:00
  observation: The focused player suite is GREEN after the patch: all 12 tests pass, including completion-before-ended deferral plus existing retry, seek, serialization, resynchronization, and unmount behaviors.
- timestamp: 2026-07-22T01:59:56-05:00
  observation: The strengthened action suite remains GREEN: all 10 tests pass, and trusted completion is now explicitly verified to emit Sandra and invalidate only `/dashboard`.
- timestamp: 2026-07-22T02:00:15-05:00
  observation: The strengthened player suite is GREEN: all 13 tests pass, including both completion-before-ended and completion-after-ended timing orders.
- timestamp: 2026-07-22T02:00:45-05:00
  observation: Static typecheck passed after the first GREEN patch.
- timestamp: 2026-07-22T02:00:45-05:00
  observation: Adversarial review identified that the RPC completion boolean is persistent level state, not a transition flag; conditional dashboard revalidation would therefore repeat on every post-90% sample.
- timestamp: 2026-07-22T02:01:32-05:00
  observation: Corrected action suite is GREEN: all 10 tests pass, completed and incomplete observations both perform zero server revalidation, and trusted completion still emits Sandra delivery.
- timestamp: 2026-07-22T02:01:52-05:00
  observation: Corrected player suite is GREEN: all 13 tests pass, including both completion timing orders and neighboring retry, seek, serialization, resynchronization, and unmount behavior.
- timestamp: 2026-07-22T02:02:10-05:00
  observation: Static typecheck passes after the corrected no-server-revalidation patch.
- timestamp: 2026-07-22T02:02:33-05:00
  observation: Full Node unit suite passes: 159 files and 956 tests green.
- timestamp: 2026-07-22T02:02:56-05:00
  observation: Full RTL suite passes: 38 files and 133 tests green, including 13 player lifecycle tests and 22 content-renderer tests.
- timestamp: 2026-07-22T02:03:20-05:00
  observation: Final diff review and `git diff --check` are clean; only the two owned implementation files and their two focused tests changed. Existing untracked planning documents were preserved.
- timestamp: 2026-07-22T02:03:44-05:00
  observation: Focused ESLint passes with no output on all four changed implementation/test files.
- timestamp: 2026-07-22T02:06:00-05:00
  observation: Added a seeded Playwright regression that uploads a private ten-second WebM, loads it through the learner route and a signed storage URL, and asserts monotonically increasing time, uninterrupted playback, stable currentSrc, and no emptied/loadstart events across three progress-save checkpoints.
- timestamp: 2026-07-22T02:06:00-05:00
  observation: The new Playwright test and fixture pass TypeScript and focused ESLint. Local execution fails closed before tests because this host lacks the repository's dedicated TEST_SUPABASE credentials; CI provides those credentials.
- timestamp: 2026-07-22T02:06:10-05:00
  observation: The optimized Next.js production build passes.
- timestamp: 2026-07-22T02:06:10-05:00
  observation: Integration tests fail closed at configuration because all five dedicated test Supabase credentials are absent locally. No test cases ran and this is recorded as an environment gate, not a pass.
- timestamp: 2026-07-22T02:06:30-05:00
  observation: The exact `npm run verify` gate passes: TypeScript, 956 Node tests, and 133 RTL tests are green.
- timestamp: 2026-07-22T02:14:34-05:00
  observation: Manual review found a completion-safe-point gap. Both new pause-ordering tests failed RED because a completed learner who paused before natural end never refreshed the locked lesson UI.
- timestamp: 2026-07-22T02:14:52-05:00
  observation: The player now treats pause as safe for the one deferred refresh, and both completion-before-pause and completion-after-pause tests pass. The focused player suite is 15/15 green.
- timestamp: 2026-07-22T02:15:30-05:00
  observation: Manual review found the E2E could print a signed URL on failure, could overstate queued progress writes as completed, and could leak partial fixtures. The test now compares only a SHA-256 source fingerprint, waits for trusted watched percentages after each checkpoint, and performs checked partial rollback and cleanup.
- timestamp: 2026-07-22T02:17:15-05:00
  observation: Post-review verification is green: exact `npm run verify` passes with 956 Node tests and 135 RTL tests, and the optimized production build passes.

# Eliminated

- hypothesis: The production video files are truncated or corrupt.
  reason: Full-object checksum, duration, range, and decode verification passed.
- hypothesis: Signed URLs expire after three seconds.
  reason: Current signed URLs have a 3,600-second TTL.
- hypothesis: The July 21 course publication replaced the videos with broken files.
  reason: Production objects and hashes predate the publication and match the approved sources.
- hypothesis: `trusted.completed` can safely gate a one-time `/dashboard` revalidation.
  reason: The RPC returns `completed: true` for every subsequent observation after the coverage threshold, so the branch does not represent a transition and would repeatedly invalidate.

# Resolution

- root_cause: Routine two-second progress writes are coupled to active-route revalidation. Each successful `recordVideoProgress` Server Action immediately rerenders the viewed lesson, re-signs its uploaded media, and supplies a different URL to `<video src>`, which resets the native media element. The client also refreshes immediately on threshold completion instead of waiting for playback to end.
- fix: Removed all path revalidation from `recordVideoProgress` while leaving the transactional RPC and Sandra completion emission unchanged. Added an ended-aware, idempotent client refresh gate that works whether completion resolves before or after `ended`.
- verification: GREEN locally — action tests 10/10, player tests 15/15, exact `npm run verify`, full Node suite 956/956, full RTL suite 135/135, focused ESLint, production build, and `git diff --check`. The signed-media Playwright regression compiles but awaits credentialed CI; real deployed browser verification remains pending.
- files_changed:
    - src/app/(dashboard)/lessons/[lessonId]/actions.ts
    - src/components/video-block-player.tsx
    - src/app/(dashboard)/lessons/[lessonId]/video-actions.test.ts
    - src/components/video-block-player.test.tsx
    - e2e/video-playback.spec.ts
    - e2e/video-playback-fixture.ts

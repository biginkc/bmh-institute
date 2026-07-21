---
quick_task: 260721-hvh
status: human_needed
code_commits:
  - 9f52e5e
  - ffa0b33
  - cfba4ad
  - 07c4628
blocked_by:
  - production desktop and mobile human verification after deployment
completed_date: 2026-07-21
---

# Keep focus on the completed quiz result summary

## Implemented

- Removed the client `router.refresh()` after successful quiz finalization.
- Removed the `revalidatePath` import, all three action-time revalidation calls, and the now-unused prerequisite lesson lookup from `finalizeQuizAttempt`.
- Kept persistence, scoring, concurrent-landed recovery, completion emission, result construction, retry behavior, and server gate behavior unchanged.
- Kept the existing client `done` transition and result-card heading focus effect.
- Added functional coverage requiring zero server revalidation calls while retaining persisted score, pass state, and review assertions.
- Extended the disposable write-path E2E to wait for the POST with the `next-action` header, require a successful fully settled response, assert client-result-only coaching copy, assert Passed heading focus, and then navigate to the course to prove the assignment lesson unlock.
- Replaced the post-Passed direct course navigation with clicks through the real `Back to course` and `Back to dashboard` Next Links. The revised test requires the unlocked assignment link on both destinations.
- Routed both standalone and composite quiz result cards to `/courses/${courseId}` instead of lesson URLs.
- Added a source invariant that independently checks both quiz result call sites, the composite `courseId` prop, and absence of the former lesson-based result links.
- Scoped the E2E click to the result card's Back to course link after proving both page-header and result-card links are visible.

## TDD evidence

- Client RED from commit `9f52e5e`: the revised runner test ran 17 tests with exactly one failure because `refresh` was called once. The other 16 passed.
- Client GREEN: targeted runner RTL passed 17 of 17.
- Server RED: the revised successful-finalize functional test ran 25 tests with exactly one failure because `revalidatePath` was called three times for the quiz lesson, prerequisite lesson, and dashboard. The other 24 passed.
- Server GREEN: targeted action functional coverage passed 25 of 25.
- Routing RED: the new learner-state invariant ran 4 tests with exactly one failure because the standalone result still used its lesson URL. The other 3 passed.
- Routing GREEN: the learner-state invariant passed 4 of 4 after both result variants received the owning course URL.

## Verification

- `npm run verify` passed after the full seven-file implementation.
- TypeScript passed.
- Unit suite passed with 155 files and 920 tests.
- RTL suite passed with 37 files and 126 tests.
- The pre-commit hook repeated the same successful full verification.
- Targeted ESLint passed for all seven scoped source and test files.
- `git diff --check` passed.
- Playwright list validation discovered the setup project and the focused Chromium write-path test.
- The first credentialed TEST Playwright run passed setup plus the focused Chromium write-path test, 2 of 2 in 51.2 seconds.
- The final result-card-scoped credentialed TEST rerun passed setup plus the focused Chromium write-path test, 2 of 2 in 49.8 seconds.
- The final real Next run exercised the settled Server Action response, client-only result copy, Passed heading focus, the actual QuizResultCard `Back to course` Link, course-page unlock, the real `Back to dashboard` Link, dashboard unlock, and disposable TEST cleanup in `finally`.
- Runtime source inspection confirms no `router.refresh` or `revalidatePath` remains in the finalization path.

## Commits

- `9f52e5e fix(260721-hvh): preserve completed quiz result focus`
- `ffa0b33 fix(260721-hvh): suppress quiz action revalidation`
- `cfba4ad test(260721-hvh): prove linked quiz navigation freshness`
- `07c4628 fix(260721-hvh): route quiz results back to course`

## Pending gate

- Production desktop and mobile focus verification remains the only human checkpoint after deployment. No production system or data was touched during this execution.

## Credential gate

- Root injected the approved TEST credentials without printing or persisting them; the revised focused rerun passed.

## Deviations from plan

- None. The credential handoff was normal gated execution and both required TEST-only runtime proofs passed.

## Self-check: PASSED

- All seven scoped source and test files exist.
- Commits `9f52e5e`, `ffa0b33`, `cfba4ad`, and `07c4628` exist.
- The revised PLAN, SUMMARY, and VERIFICATION are reconciled in one atomic documentation commit.

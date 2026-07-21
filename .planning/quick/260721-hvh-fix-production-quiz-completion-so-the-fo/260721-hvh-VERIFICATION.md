---
quick_task: 260721-hvh
title: Keep focus on the completed quiz result
verified: 2026-07-21
status: human_needed
score: 4/5 must-haves verified
code_commits:
  - 9f52e5e
  - ffa0b33
blocked_by:
  - production desktop and mobile human verification after deployment
human_verification:
  - test: Production completed quiz focus at desktop and mobile viewports
    expected: The Passed client result remains visible and focused at 1280 by 800 and 390 by 844. Later course and dashboard navigation shows current completion state.
    why_human: Requires the deployed production bundle, authenticated real learner, responsive browser focus, and production navigation state.
---

# Quick Task 260721-hvh verification report

## Verified now

| Contract | Evidence | Result |
| --- | --- | --- |
| Passed client result mounts and receives focus | Targeted runner RTL drives the full successful flow and asserts Passed heading focus | PASS, 17 of 17 |
| Successful finalization does not call client refresh | Runner spy requires zero refresh calls and runtime source contains no router dependency | PASS |
| Successful finalization does not call server path revalidation | Functional test requires zero `revalidatePath` calls and runtime source has no `next/cache` import or prerequisite lookup | PASS, 25 of 25 |
| Persistence and recovery remain intact | Functional suite retains score, pass, review, retry, and concurrent-landed coverage | PASS |
| Repository gate | `npm run verify` | PASS, 919 unit and 126 RTL tests |
| Five-file quality checks | Targeted ESLint and `git diff --check` | PASS |
| Focused Playwright discovery | List-only command with a non-secret validation password | PASS, setup plus Chromium test discovered |
| Real Next Server Action and later-navigation boundary | Credentialed TEST-only Playwright run | PASS, 2 of 2 in 51.2 seconds |

## Real Next write-path proof

The focused E2E registers `page.waitForResponse` before Finish and matches a POST carrying the `next-action` header. It requires a 2xx response, awaits `response.finished()`, asserts the client-only `On to the next lesson` copy, requires the Passed heading to be focused, then preserves the existing course navigation assertion that the prerequisite-gated text assignment link is visible.

Root injected approved TEST credentials without printing or persisting them and ran:

```text
npm run test:e2e -- e2e/write-paths.spec.ts --project=chromium --grep 'drives learner/admin LMS write paths against non-production data'
```

The setup project and focused Chromium test both passed, 2 of 2 in 51.2 seconds. The run exercised the real Next Server Action response, client-only result copy and focus, later dynamic navigation unlock, and disposable TEST cleanup in `finally`. No production target was used or modified.

## Remaining human verification

After the reviewed change is deployed, complete one passing quiz in production at 1280 by 800. Confirm the client result remains visible and `document.activeElement` is the Passed heading. Resize the same rendered result to 390 by 844 and confirm focus remains on that heading. Navigate afterward to the course and dashboard and confirm current completion state.

## Verdict

Implementation, repository verification, and the real Next TEST write path pass. Final GSD status is `human_needed` until the post-deployment production desktop and mobile checkpoint is approved.

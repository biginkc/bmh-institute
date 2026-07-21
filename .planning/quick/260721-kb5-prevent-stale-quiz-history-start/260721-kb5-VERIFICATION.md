---
quick_task: 260721-kb5
title: Prevent stale quiz start after browser history return
verified: 2026-07-21
status: human_needed
score: 4/5 must-haves verified
code_commits:
  - b2f61fa
  - d7f9afb
  - 3bf15b6
human_verification:
  - test: Production completed-quiz history at desktop and mobile viewports
    expected: Immediate result focus remains correct; result, shell, and browser Back navigation never show Start or Retake after a pass; next lesson stays unlocked; history traversal creates no rows.
    why_human: Requires the exact deployed bundle, authenticated real Hugo browser, responsive Chrome viewports, and production database evidence.
---

# Quick Task 260721-kb5 verification report

## Verified now

| Contract | Evidence | Result |
| --- | --- | --- |
| Defect reproduced before implementation | Real Next + TEST Playwright result/course/dashboard/Back x2 path | RED at missing Passed heading |
| Result exit crosses a document boundary | Playwright waits for a course `document` request before linked navigation | PASS |
| Shell exit crosses a document boundary | Separate Playwright flow clicks Primary Dashboard from immediate Passed result and waits for a dashboard `document` request | PASS |
| Shell exit is exclusive | Capture handler requires `preventDefault`, `stopPropagation`, then `location.assign`, preventing the Next Link click path from also running | PASS |
| History return is terminal | Both real-stack flows require Passed and zero Start/Retake without a reload | PASS |
| Immediate result focus remains | Existing and new real-stack flows require the Passed heading to own focus | PASS |
| Terminal starts are fail-closed | Functional passed/max cases require exact errors and no attempt insert | PASS, 27 of 27 action tests |
| Quiz exit wiring | Focused source invariant covers local anchors, progress rail, completed-result document listener, and lesson-search fallback | PASS, 5 of 5 |
| Repository gate | `npm run verify` | PASS, 923 unit/server and 126 RTL tests |
| Focused TEST browser gate | Setup plus both write-path/history tests, rerun after the A5 propagation fix | PASS, 3 of 3 in 57.6 seconds |
| Production release | Exact deployed SHA plus Chrome and DB proof | PENDING |

## Residuals

- The full-document transition intentionally trades one quiz-exit client transition for correctness. Non-quiz lesson navigation remains unchanged.
- The inherited TEST fixture helper does not independently verify zero residue when a partial fixture creation fails. Every completed focused run cleaned through `finally`; final production cleanup uses the separate exact-ID guarded fixture controller and must prove all surfaces are zero.
- The pre-existing overlapping start/finalize race can leave one inert incomplete attempt but cannot finalize it after pass or max attempts. It is not caused by this history fix and is not accepted as evidence against sequential terminal safety.

## Verdict

Implementation and automated real-stack verification pass. Status remains `human_needed` until exact-head review/Claude approval and the deployed production desktop/mobile browser plus database cleanup gate are complete.

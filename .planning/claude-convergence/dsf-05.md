# DSF-05 convergence ledger

## Goal and plan alignment

- Goal ID: `DSF-05`
- Goal: Reskin the learner course page and content lesson viewer including all 11 real content blocks, then open an unmerged PR.
- Plan source: User work package plus `.planning/quick/260716-2ms-dsf-05-course-page-and-lesson-viewer-des/260716-2ms-PLAN.md`.
- Baseline: `aa09ff3`, merged DSF-04 on `origin/main`.
- Authority profile: Local code, read-only learner browser proof, and GitHub PR creation only. Merge and independent Claude review are explicitly excluded.

## Acceptance gates

- [x] Course modules and lessons match the BMH design with real type, progress, completion, and prerequisite lock states.
- [x] Content lesson header, blocks, completion, previous or next navigation, and sticky chapters rail match the BMH design.
- [x] All 11 existing content block types have tested visual coverage.
- [x] Quiz and assignment runner markup, server actions, `src/lib`, and middleware remain unchanged.
- [x] Video 90 percent completion tracking, sanitized HTML, signed URLs, iframe sandboxing, and role-play embed token flow remain intact.
- [x] `npm run verify`, `npm run build`, scoped lint, and diff checks pass.
- [x] Three requested 1280x800 screenshots exist under untracked `._dsf05-proofs/`.
- [x] Manual review is clean and the requested PR is open without merge.

## Preflight

- Worktree and branch match the user-provided scope.
- `origin/main` was fetched and merged. The branch baseline already included merged PR 90.
- `npm install` completed without a tracked-file change.
- GitHub CLI, 1Password CLI, and Playwright are available.
- Vercel CLI is available at 56.2.0. Version 56.2.1 is available but no Vercel operation is needed for this unmerged PR task.
- The user supplied the orchestrating EXECUTE block and explicitly reserved Claude review for the parent session, so no Claude surface will be contacted here.
- The GSD quick planner lane did not produce a file after repeated waits. Codex created the tracked quick plan from the completed source audit and retained the independent plan-check step.
- The two permitted plan-check passes identified and resolved traceability, exact block enumeration, Playwright, runtime video overlay, and shared-component scope gaps. The final plan keeps `bmh-ds` primitives unchanged.

## Iterations

### Plan and design audit

- Inspected `03-kit.png`, `03-loop.png`, `02-loop.png`, `02-locked.png`, and `02-kit.png` plus the canonical `LessonViewer`, course data, and content block source.
- Confirmed the real lesson renderer has 11 block types while the kit's lesson specimen covers only video, callout, text, image, divider, download, and external link.
- Confirmed the real app currently lacks a content-derived duration field and key-points model. These must be reported as gaps rather than synthesized.
- Confirmed the current lesson page lacks the requested chapter rail and previous or next controls. Read-only course-structure data may be added in the page presentation layer without changing business rules or server actions.

### Implementation and adversarial review

- Wrote the presentation tests before implementation and observed the expected failures on the legacy markup.
- Implemented the course reskin, content lesson shell, ChapterItem adapter, all 11 block treatments, and uploaded video overlay without changing actions or shared BMH primitives.
- Manual review caught that direct prerequisite completion was not the canonical unlock rule. Navigation now uses `fn_lesson_is_unlocked` for every chapter and has regression coverage for quiz thresholds and admin access.
- Manual review separated recorded completion from current availability. Completed chapters still count as done while unavailable navigation is disabled.
- Merged current `origin/main` after DSF-06 landed and confirmed no DSF-06 or walkthrough files remain in the DSF-05 three-dot diff.
- Final `npm run verify`, `npm run build`, scoped lint, diff checks, and 1280x800 Playwright proofs passed. Final read-only review reported no actionable findings.

---
quick_task: 260716-1nc
status: complete
completed: 2026-07-16
implementation_head: bc4b2ed
pr: https://github.com/biginkc/bmh-institute/pull/90
---

# DSF-04 app shell and learner dashboard reskin summary

## Delivered

- Rebuilt the shared signed-in shell around the canonical loop-series left sidebar and top bar using BMH design-system components.
- Preserved authentication, suspended-user handling, role gating, pending-submission counts, navigation targets, the walkthrough mount, and the native sign-out POST.
- Reskinned the learner dashboard with a real-data hero, Andrea coach unit, resume target, progress, sequential program rail, and required-lesson card grid.
- Restyled the shared PageHeader so later dashboard pages inherit the new typography and brand colors without changing their inner layout or behavior.
- Updated unit, RTL, and Playwright selectors for the changed presentation.
- Opened PR 90 with the exact requested title. The PR remains unmerged.

## Component and product gaps

- The app has no My course or Catalog index routes. No fake navigation targets were added because routing was explicitly out of scope.
- SearchBar remains presentational because no existing shell search behavior exists.
- Button and ChapterItem do not accept href targets. Semantic Next.js links and local linked course rows were used without adding a one-off primitive.

## Verification

- `npm run verify`: passed with 258 unit tests and 35 RTL tests.
- `npm run build`: passed with Next.js 16.2.4.
- Scoped ESLint over every changed source and test file: passed.
- `git diff --check`: passed.
- Playwright proof passed for a seeded learner and seeded admin at 1280x800 with zero console errors and zero HTTP responses at status 400 or above.
- Learner and admin PNGs remain untracked in `._dsf04-proofs/`.
- The browser fixture used persistent seeded accounts. No disposable data was created and no cleanup debt remains.

## Commits

- `f9ab953` plans DSF-04.
- `bc4b2ed` reskins the signed-in shell and learner dashboard.

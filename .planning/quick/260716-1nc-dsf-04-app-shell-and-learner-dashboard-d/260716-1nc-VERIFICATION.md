---
quick_task: 260716-1nc
status: complete
verified: 2026-07-16
head: bc4b2ed
pr: https://github.com/biginkc/bmh-institute/pull/90
---

# DSF-04 app shell and learner dashboard reskin verification

## Verdict

Implementation and requested evidence passed. PR 90 is open and unmerged for the orchestrating review.

## Must-have evidence

- The shared shell uses the canonical white left sidebar with BMH logo, grouped learner and admin navigation, bottom identity card, and sign-out action.
- The fixed top bar uses the pill SearchBar and notification control while preserving profile access on narrow layouts.
- Learners do not receive admin destinations. Admins retain all seven admin destinations and the pending-submission count.
- The dashboard hero uses the live current course, real resume route, required-lesson count, and calculated progress percentage.
- The program rail and lesson cards use existing assigned program, course, lesson, completion, and ordering data.
- No `src/lib`, middleware, server-action, query, or route-target file changed.

## Command evidence

- `npm run verify`: passed. 60 unit files with 258 tests and 16 RTL files with 35 tests.
- `npm run build`: passed with Next.js 16.2.4.
- Focused shell and dashboard tests passed before the full suite.
- Scoped ESLint over all changed source and test files passed.
- `git diff --check`: passed.

## Browser outcome proof

- Surface: local Next.js app backed by persistent seeded BMH Institute Browser V1 learner and admin accounts.
- Viewport: 1280x800 in Playwright Chromium.
- Learner proof asserts the resume link, progress bar, Continue learning section, and absence of admin navigation.
- Admin proof asserts the Admin group, Submissions destination, and visible dashboard heading.
- Both screenshots visually show the canonical shell and data-driven dashboard presentation.
- Console errors and HTTP responses at status 400 or above: zero.
- Required PNGs exist in the untracked `._dsf04-proofs/` directory.

## Delivery evidence

- GitHub reports PR 90 open from `codex/design-system-04-shell-dashboard` to `main` with the exact title `App shell + learner dashboard: BMH design-system reskin`.
- The PR is not merged.
- Claude review was intentionally not requested per the work package.

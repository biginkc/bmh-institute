---
quick_task: 260716-0xa
status: complete
verified: 2026-07-16
head: 712cb6f
pr: https://github.com/biginkc/bmh-institute/pull/87
---

# DSF-03 auth screens reskin verification

## Verdict

Implementation and requested evidence passed. PR 87 is open and unmerged for the orchestrating review.

## Must-have evidence

- Login uses the source kit split layout, BMH logo, blue panel, Andrea coach unit, headline, and BMH form components.
- Forgot-password request and success states use BMH components and preserve the enumeration-safe message.
- Set-password keeps the authenticated server gate, user email, eight-character constraint, confirmation field, and existing action.
- The suspended action result renders the dedicated Account paused notice and retains the instruction to contact an administrator.
- Ordinary error, success, processing, and suspended messages use live-region semantics.
- No action, middleware, redirect, rate-limit, or `src/lib` file changed.

## Command evidence

- `npm run verify`: passed. 60 unit files with 258 tests and 16 RTL files with 35 tests.
- `npm run build`: passed with Next.js 16.2.4.
- Focused auth RTL: 3 files and 6 tests passed.
- `git diff --check`: passed.
- `npm run lint`: DSF-03 files are clean. The repository command is non-green because of two pre-existing `no-explicit-any` errors in unchanged Sandra integration code.

## Browser outcome proof

- Target: each auth route or state should visibly match the BMH kit while retaining real route behavior.
- Surface: local Next.js app at 1280x800 in Playwright Chromium, backed by disposable prefixed Supabase users for authenticated and suspended states.
- Login, login error, forgot password, set password, and suspended screenshots passed.
- The probe used accessible labels and buttons for interactions.
- Focus order passed: Work email, Password, Continue, Forgot password.
- A 390x844 probe found no horizontal overflow.
- Console errors and HTTP responses at status 400 or above: zero.
- Five required PNGs exist in the untracked `._dsf03-proofs/` directory.
- Cleanup check: `dsf03_proof_users_remaining=0`.

## Delivery evidence

- GitHub reports PR 87 open from `codex/design-system-03-auth` to `main` with the exact title `Auth screens: BMH design-system reskin`.
- The PR is not merged.
- Claude review was intentionally not requested per the work package.

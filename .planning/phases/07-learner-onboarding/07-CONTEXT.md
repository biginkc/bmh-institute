# Phase 7 Context: Learner Onboarding

## Phase goal

Reduce first-session confusion for invited VA learners after they accept an invite and sign in.

## Requirements

- LEARN-01: Invited learner can understand the first thing to do after signing in.
- LEARN-02: Learner can clearly see assigned programs, required courses, and completion expectations.
- LEARN-03: Learner can recover from common onboarding issues, including password reset and incomplete profile setup.
- LEARN-04: Learner-facing copy is plain enough for async VA training where English may be a second language.

## Existing surface

- `/dashboard` already lists assigned programs and courses with course-level required lesson counts.
- `/courses/[courseId]` already shows course progress, module progress, locked lessons, lesson types, and links into lessons.
- `/profile` already lets learners update display name and password, and shows role groups.
- `/forgot-password` already sends password reset links.
- The dashboard shell and sidebar now match the sibling app pattern from Phase 5.

## Decisions

- Keep Phase 7 learner-only. Admin monitoring belongs to Phase 8.
- Do not introduce a new onboarding route unless the dashboard cannot carry the first-session guidance. The first screen after sign-in should remain `/dashboard`.
- Add guidance in the existing learner dashboard instead of a modal. Learners should be able to ignore it after they understand the flow.
- Use plain operational copy. Avoid marketing language, idioms, and long paragraphs.
- Treat missing role-group access as a support case, not a learner failure. The empty-state should tell the learner what happened and who can fix it.
- Recovery paths should be discoverable from dashboard and profile. Password reset remains under `/forgot-password`.

## Implementation direction

- Add a small pure learner-onboarding model that summarizes assigned program count, course count, required lesson count, completed required lesson count, first available course, and next available lesson when possible.
- Use that model in the dashboard to render:
  - a first-action panel,
  - a concise progress summary,
  - a plain-language expectations block,
  - links to profile and password reset recovery paths.
- Improve profile copy so incomplete name/password recovery is clear to a learner.
- Preserve current data access through RLS-backed Supabase queries. No service-role reads on learner pages.

## Verification

- Unit test the onboarding summary model.
- Extend dashboard page tests for empty, first-action, and progress-copy states.
- Add or extend Playwright learner flow coverage after implementation if fixtures expose a learner with assigned content.
- Run `npm run verify`.
- Run browser verification against the local app before marking the phase complete.

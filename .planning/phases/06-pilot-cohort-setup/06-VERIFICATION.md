# Phase 06 Verification

Verdict: pass with documented local e2e environment blocker

Phase goal: Give admins a reliable way to prepare the first real pilot cohort.

What was verified:

- `src/lib/pilot-cohort/status.ts` shapes invite and profile records into pilot setup rows with ready, expired invite, and missing access states.
- `/admin/users` now has a pilot setup section that shows learner setup status, access state, and correction actions.
- Admin user settings tests cover saving role groups through `fn_save_user_settings`, preventing owner self-demotion, and sending enrollment email when new role-group program access is granted.
- A durable Playwright spec exists for the intended pilot setup correction flow.

Commands:

- `npm run test -- src/lib/pilot-cohort/status.test.ts`
- `npm run test -- src/app/(dashboard)/admin/users/page.test.ts`
- `npm run test -- src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts`
- `npm run verify`
- `git diff --check`

Blocked verification:

- `npm run test:e2e -- e2e/pilot-cohort-setup.spec.ts` could not run locally because the worktree has no visible non-production `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, or `TEST_SUPABASE_SERVICE_ROLE_KEY` values. The blocker is recorded in `.planning/qa/PHASE-06-ISSUES.md`.

Residual risk:

- Browser proof of the full admin correction flow is pending until non-production Supabase e2e credentials are restored locally or provided in CI.

---
phase: 06-pilot-cohort-setup
plan: 3
type: execute
wave: 3
depends_on:
  - 06-1
  - 06-2
autonomous: true
files_modified:
  - src/app/(dashboard)/admin/users/[userId]/edit/page.tsx
  - src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts
  - e2e/pilot-cohort-setup.spec.ts
  - .planning/qa/PHASE-06-ISSUES.md
requirements:
  - PILOT-02
  - PILOT-04
---

# Plan 06-3: Access Correction Verification

## Objective

Make pilot access correction clear and verify the browser flow that fixes a learner with missing role group access.

## User Value

Admins can correct pilot learner access from the UI and prove the correction path works before inviting real learners into the first internal pilot.

## Truths

- D-06: Access correction should use the existing user edit flow and transactional `fn_set_user_role_groups` path.
- D-09: Resend and revoke remain the primary stale-invite actions.
- D-10: Extend Playwright coverage only where new pilot setup behavior changes the flow.
- D-12: Browser verification should include the admin users surface and one learner access correction path.
- D-13: Prefer local or non-production fixtures when they prove behavior.

## Threat Model

- Risk: Access correction could bypass the transactional role-group RPC.
  Mitigation: Server action tests must continue asserting `fn_set_user_role_groups` is called.
- Risk: Admins could miss that adding role groups sends enrollment email.
  Mitigation: Keep or improve existing helper copy on `UserEditForm`.
- Risk: Browser verification could mutate real learner data.
  Mitigation: Use disposable prefixed test records and cleanup helpers for Playwright.

## Implementation

<task id="06-3-red-action-tests" type="tdd-red">
  <title>Protect access correction behavior</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts</file>
    <file>src/app/(dashboard)/admin/users/[userId]/edit/actions.ts</file>
    <file>supabase/migrations/012_data_integrity.sql</file>
  </read_first>
  <action>
    Extend action tests only if current coverage does not already prove these assertions:
    - `saveUserSettings` calls RPC `fn_set_user_role_groups`.
    - adding a new role group that grants a program returns or triggers enrollment email behavior.
    - self-role or owner-safety protections remain intact.
    If existing tests already prove all three, add no duplicate tests and note that in the summary.
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` contains `fn_set_user_role_groups`.</criterion>
    <criterion>`npm run test -- 'src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts'` exits 0.</criterion>
  </acceptance_criteria>
</task>

<task id="06-3-edit-copy" type="execute">
  <title>Clarify edit-user access correction copy</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/[userId]/edit/page.tsx</file>
    <file>src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx</file>
    <file>.planning/phases/06-pilot-cohort-setup/06-UI-SPEC.md</file>
  </read_first>
  <action>
    Update copy on the edit-user screen so the role group section clearly says that role groups control pilot program and course access.
    Keep copy short.
    Preserve current controls: system role select, status select, role group checkboxes, suspend/reactivate, delete, and save changes.
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx` contains `pilot program and course access` or equivalent plain copy.</criterion>
    <criterion>`src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx` still contains `Save changes`.</criterion>
    <criterion>`npm run verify` exits 0.</criterion>
  </acceptance_criteria>
</task>

<task id="06-3-browser-proof" type="execute">
  <title>Add and run pilot setup browser verification</title>
  <read_first>
    <file>e2e/write-paths.spec.ts</file>
    <file>e2e/write-path-fixtures.ts</file>
    <file>playwright.config.ts</file>
    <file>.planning/qa/production-readiness-assessment.md</file>
  </read_first>
  <action>
    Add `e2e/pilot-cohort-setup.spec.ts` if reusable fixtures make this practical without production credentials.
    The spec should create disposable prefixed data, open `/admin/users`, verify the pilot setup states, navigate to `Review access`, assign a role group, save, and verify the user returns to a ready or role-group-assigned state.
    If the local fixture setup cannot support the flow quickly, document the exact manual browser verification in `.planning/qa/PHASE-06-ISSUES.md` and do not fake a weak Playwright test.
  </action>
  <acceptance_criteria>
    <criterion>If `e2e/pilot-cohort-setup.spec.ts` exists, `npm run test:e2e -- e2e/pilot-cohort-setup.spec.ts` exits 0.</criterion>
    <criterion>If Playwright is not added, `.planning/qa/PHASE-06-ISSUES.md` contains `Pilot setup browser verification` and the manual verification result.</criterion>
    <criterion>`npm run verify` exits 0.</criterion>
  </acceptance_criteria>
</task>

## Verification

- `npm run test -- 'src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts'`
- `npm run verify`
- `npm run test:e2e -- e2e/pilot-cohort-setup.spec.ts` if the spec is created.
- Browser check `/admin/users` desktop and mobile.

## Must Haves

- PILOT-02 and PILOT-04 are covered.
- Access correction uses the existing transactional role-group path.
- Browser proof or a concrete QA issue record exists.

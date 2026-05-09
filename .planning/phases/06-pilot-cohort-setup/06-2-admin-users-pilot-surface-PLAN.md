---
phase: 06-pilot-cohort-setup
plan: 2
type: tdd
wave: 2
depends_on:
  - 06-1
autonomous: true
files_modified:
  - src/app/(dashboard)/admin/users/page.tsx
  - src/app/(dashboard)/admin/users/page.test.ts
  - src/lib/pilot-cohort/status.ts
requirements:
  - PILOT-01
  - PILOT-02
  - PILOT-03
---

# Plan 06-2: Admin Users Pilot Surface

## Objective

Render pilot setup status on `/admin/users` using the existing admin users page, PageHeader, cards, tables, badges, and invite actions.

## User Value

Admins can scan the pilot cohort setup page and immediately see who is ready, who needs access, and which invites need action.

## Truths

- D-04: Build on `/admin/users` and `/admin/users/[userId]/edit` before creating new routes.
- D-05: Show invited, accepted, expired, active, suspended, no role group, and role group assigned states explicitly.
- D-07: Copy should be plain and operational.
- D-08: Keep existing Supabase invite email and Google Workspace enrollment email paths.
- UI-SPEC: Use dense tables, compact badges, filters, and action rows. Do not introduce a landing page or hero.

## Threat Model

- Risk: Admin could act on the wrong learner because invite and profile rows are visually mixed.
  Mitigation: The table must show email, person name when present, status, access state, and action links clearly.
- Risk: Expired invites could be ignored.
  Mitigation: Expired invite rows must have a warning or destructive visual treatment plus visible resend and revoke actions.
- Risk: New UI could hide existing invite actions.
  Mitigation: Existing `ResendInviteButton` and `RevokeInviteButton` remain visible for pending and expired invite rows.

## Implementation

<task id="06-2-red-page-tests" type="tdd-red">
  <title>Add failing admin users rendering tests</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/page.test.ts</file>
    <file>src/app/(dashboard)/admin/users/page.tsx</file>
    <file>.planning/phases/06-pilot-cohort-setup/06-UI-SPEC.md</file>
  </read_first>
  <action>
    Extend `src/app/(dashboard)/admin/users/page.test.ts` so its mocked Supabase chain can return profiles, invites, role groups, and user role groups by table.
    Add tests that render `AdminUsersPage` and assert the output contains:
    - `Pilot setup`
    - `No role group assigned`
    - `Expired`
    - `Role group assigned`
    - `Send invite`
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/page.test.ts` contains a test name with `pilot setup`.</criterion>
    <criterion>`npm run test -- src/app/(dashboard)/admin/users/page.test.ts` fails before the page renders pilot setup states.</criterion>
  </acceptance_criteria>
</task>

<task id="06-2-render-surface" type="tdd-green">
  <title>Render pilot setup section</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/page.tsx</file>
    <file>src/lib/pilot-cohort/status.ts</file>
    <file>src/components/page-header.tsx</file>
    <file>src/components/ui/badge.tsx</file>
    <file>src/components/ui/table.tsx</file>
  </read_first>
  <action>
    Update `/admin/users` with a top-level `Pilot setup` section above or near the existing active members table.
    Render pilot rows from `shapePilotCohortRows` in a table with columns: Person, Email, Setup status, Access, Action.
    Use `Badge` variants for `Ready`, `No role group assigned`, `Pending invite`, `Expired`, and `Suspended`.
    For profile rows, action should link to `/admin/users/{id}/edit` with copy `Review access`.
    For invite rows, action should keep resend and revoke controls visible.
    Update `PageHeader` description to `Pilot learner access, invite status, and role groups.`
    Preserve the existing invite form and pending invites content unless duplicate content becomes redundant.
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` contains `Pilot setup`.</criterion>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` contains `Review access`.</criterion>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` contains `Pilot learner access, invite status, and role groups.`</criterion>
    <criterion>`npm run test -- src/app/(dashboard)/admin/users/page.test.ts` exits 0.</criterion>
  </acceptance_criteria>
</task>

<task id="06-2-responsive-review" type="execute">
  <title>Check responsive layout constraints in code</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/page.tsx</file>
    <file>.planning/phases/06-pilot-cohort-setup/06-UI-SPEC.md</file>
  </read_first>
  <action>
    Ensure the pilot setup table uses an explicit minimum width no smaller than `min-w-[44rem]`.
    Keep page padding consistent with the existing `p-6 md:p-10` pattern.
    Do not nest a `Card` inside another `Card`.
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` contains `min-w-[44rem]` or a larger explicit min width for the pilot table.</criterion>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` does not contain nested `<Card>` markup inside another `<CardContent>` block.</criterion>
    <criterion>`npm run verify` exits 0.</criterion>
  </acceptance_criteria>
</task>

## Verification

- `npm run test -- src/app/(dashboard)/admin/users/page.test.ts`
- `npm run verify`
- Browser check `/admin/users` on desktop and mobile widths.

## Must Haves

- PILOT-01, PILOT-02, and PILOT-03 are visible in the admin surface.
- Existing invite actions remain available.
- UI-SPEC constraints are followed.

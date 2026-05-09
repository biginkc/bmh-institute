---
phase: 06-pilot-cohort-setup
plan: 1
type: tdd
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/lib/pilot-cohort/status.ts
  - src/lib/pilot-cohort/status.test.ts
  - src/app/(dashboard)/admin/users/page.tsx
requirements:
  - PILOT-01
  - PILOT-03
---

# Plan 06-1: Pilot Cohort Status Model

## Objective

Create a small typed status-shaping layer for the admin users page so Phase 6 can show pilot-ready states without adding a new cohort table.

## User Value

Admins can see which learners are active, invited, expired, missing access, or ready for setup without interpreting raw database rows.

## Truths

- D-01: Pilot cohort is an operational view over existing users, invites, role groups, programs, and courses.
- D-02: Use lightweight flags, filters, status badges, or saved query behavior before adding a cohort table.
- D-03: Role groups remain the access source of truth.
- D-05: Missing states must be explicit: invited, accepted, expired, active, suspended, no role group, and role group assigned.
- D-11: Meaningful behavior changes need tests first.

## Threat Model

- Risk: A learner with no role group could appear ready for pilot launch.
  Mitigation: The shaper must expose `missing_access` when active or invited learners have no role group IDs.
- Risk: Expired invites could look pending.
  Mitigation: The shaper must compare `expires_at` to an injected `now` value and return an `expired_invite` state.
- Risk: The UI could duplicate access truth outside role groups.
  Mitigation: The helper only derives display state from existing rows and never stores cohort state.

## Implementation

<task id="06-1-red-tests" type="tdd-red">
  <title>Add failing status-shaper tests</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/page.tsx</file>
    <file>src/app/(dashboard)/admin/users/page.test.ts</file>
    <file>.planning/phases/06-pilot-cohort-setup/06-CONTEXT.md</file>
    <file>.planning/phases/06-pilot-cohort-setup/06-UI-SPEC.md</file>
  </read_first>
  <action>
    Create `src/lib/pilot-cohort/status.test.ts` with failing tests for `shapePilotCohortRows`.
    Cover these exact states:
    - active profile with at least one role group returns `statusKey: "ready"` and `accessLabel: "Role group assigned"`.
    - active profile with zero role groups returns `statusKey: "missing_access"` and `accessLabel: "No role group assigned"`.
    - suspended profile returns `statusKey: "suspended"`.
    - pending invite with future `expires_at` returns `statusKey: "pending_invite"`.
    - pending invite with past `expires_at` returns `statusKey: "expired_invite"`.
    - accepted invite is excluded from pending invite rows.
  </action>
  <acceptance_criteria>
    <criterion>`src/lib/pilot-cohort/status.test.ts` imports `shapePilotCohortRows` from `./status`.</criterion>
    <criterion>`npm run test -- src/lib/pilot-cohort/status.test.ts` fails before `status.ts` is implemented.</criterion>
    <criterion>Tests use an injected fixed date, not `new Date()` inside assertions.</criterion>
  </acceptance_criteria>
</task>

<task id="06-1-green-helper" type="tdd-green">
  <title>Implement pilot status shaper</title>
  <read_first>
    <file>src/lib/pilot-cohort/status.test.ts</file>
    <file>src/lib/invites/validate.ts</file>
    <file>src/lib/programs/shape.ts</file>
  </read_first>
  <action>
    Create `src/lib/pilot-cohort/status.ts`.
    Export `type PilotStatusKey = "ready" | "missing_access" | "suspended" | "pending_invite" | "expired_invite"`.
    Export `type PilotCohortRow` with `kind`, `id`, `email`, `name`, `systemRole`, `statusKey`, `statusLabel`, `accessLabel`, `createdAt`, `expiresAt`, and `roleGroupIds`.
    Export `shapePilotCohortRows({ profiles, invites, userRoleGroupsByUserId, now })`.
    The helper must be pure and must not import Supabase clients, React, or Next.js.
  </action>
  <acceptance_criteria>
    <criterion>`src/lib/pilot-cohort/status.ts` exports `shapePilotCohortRows`.</criterion>
    <criterion>`src/lib/pilot-cohort/status.ts` contains no import from `@/lib/supabase`.</criterion>
    <criterion>`npm run test -- src/lib/pilot-cohort/status.test.ts` exits 0.</criterion>
  </acceptance_criteria>
</task>

<task id="06-1-wire-page-data" type="execute">
  <title>Wire admin users data into the shaper</title>
  <read_first>
    <file>src/app/(dashboard)/admin/users/page.tsx</file>
    <file>src/lib/pilot-cohort/status.ts</file>
    <file>supabase/migrations/001_initial_schema.sql</file>
  </read_first>
  <action>
    Update `src/app/(dashboard)/admin/users/page.tsx` to fetch `user_role_groups(user_id, role_group_id)` alongside profiles, invites, and role groups.
    Build `userRoleGroupsByUserId` as `Record<string, string[]>`.
    Call `shapePilotCohortRows` with `now: new Date()`.
    Do not render the new rows yet except where needed to keep TypeScript happy.
  </action>
  <acceptance_criteria>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` imports `shapePilotCohortRows`.</criterion>
    <criterion>`src/app/(dashboard)/admin/users/page.tsx` selects `user_id, role_group_id` from `user_role_groups`.</criterion>
    <criterion>`npm run verify` exits 0.</criterion>
  </acceptance_criteria>
</task>

## Verification

- `npm run test -- src/lib/pilot-cohort/status.test.ts`
- `npm run verify`

## Must Haves

- PILOT-01 and PILOT-03 are represented by derived status rows.
- No new cohort table is added.
- Role groups remain the access truth.

# Phase 6: Pilot Cohort Setup - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 improves the existing admin user and invite workflow so BMH Group can prepare the first real internal pilot cohort with less manual risk. It should help admins identify pilot learners, confirm invite status, assign role groups and access, resend or revoke stale invites, and correct pilot access mistakes without direct database edits.

This phase does not add a separate CRM, bulk learner import system, Sandra Practice runtime, or performance reporting layer. It works inside the current BMH Institute admin shell.

</domain>

<decisions>
## Implementation Decisions

### Cohort Model

- **D-01:** Treat "pilot cohort" as an operational view over existing users, invites, role groups, programs, and courses for this phase. Do not add a new cohort table unless planning proves it is required to meet the requirements cleanly.
- **D-02:** Prefer lightweight flags, filters, status badges, or saved query behavior over a new standalone cohort module. The first pilot is small and internal.
- **D-03:** Role groups remain the source of access truth. Cohort setup should help admins use role groups correctly, not bypass them.

### Admin Workflow

- **D-04:** Build on `/admin/users` and `/admin/users/[userId]/edit` before creating new routes. The current admin users page already lists active members, pending invites, invite form, revoke, and resend actions.
- **D-05:** The setup flow should make the missing states explicit: invited, accepted, expired, active, suspended, no role group, and role group assigned.
- **D-06:** Access correction should use the existing user edit flow and transactional `fn_set_user_role_groups` path. Avoid direct table editing from UI code.
- **D-07:** Copy should stay plain and operational. The admin should know what action to take next without reading a training paragraph.

### Invite Handling

- **D-08:** Keep the existing Supabase invite email path and Google Workspace enrollment email path. Do not change providers or introduce paid services.
- **D-09:** Resend and revoke remain the primary stale-invite actions. Planning may improve placement, status language, and tests around those actions.
- **D-10:** Invite acceptance behavior is already covered by local and production Playwright. Phase 6 should extend that coverage only where new pilot setup behavior changes the flow.

### Verification

- **D-11:** Meaningful behavior changes need tests first. Use focused unit tests for shapers and server actions, RTL tests for admin page state rendering, and Playwright only when a browser flow changes.
- **D-12:** Browser verification should include the actual admin users surface and at least one learner access correction path.
- **D-13:** Production writes are allowed for disposable prefixed test records under the project rules, but the implementation should prefer local or non-production fixtures when that proves the behavior.

### Claude's Discretion

Planner may decide whether Phase 6 is best delivered as one or multiple plans. Planner may also decide whether to introduce a small helper module for shaping pilot setup rows if it reduces page complexity.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope

- `.planning/REQUIREMENTS.md` - v1.1 requirements and Phase 6 traceability.
- `.planning/ROADMAP.md` - Phase 6 goal and success criteria.
- `.planning/PROJECT.md` - project identity, constraints, provider decisions, and out-of-scope Sandra Practice boundary.
- `AGENTS.md` - repo workflow, TDD, PR-first, GSD, production boundary, and writing style.

### Existing Admin User and Invite Flow

- `src/app/(dashboard)/admin/users/page.tsx` - current admin users page, invite form placement, pending invites table, resend and revoke buttons.
- `src/app/(dashboard)/admin/users/actions.ts` - `inviteUser`, `revokeInvite`, `resendInvite`, `setUserRoleGroups`, Supabase invite path, enrollment email path.
- `src/app/(dashboard)/admin/users/invite-form.tsx` - current invite form UX and role group selection.
- `src/app/(dashboard)/admin/users/[userId]/edit/page.tsx` - existing access correction entry point.
- `src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx` - current role, status, role group, suspend, and delete controls.
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` - `saveUserSettings` and access correction behavior.
- `src/app/(dashboard)/admin/page.tsx` - existing admin overview attention items for pending and expired invites.

### Data and Security

- `supabase/migrations/001_initial_schema.sql` - `profiles`, `role_groups`, `user_role_groups`, and `invites` tables.
- `supabase/migrations/003_rls_policies.sql` - admin-only invites policy and role group access policies.
- `supabase/migrations/012_data_integrity.sql` - transactional `fn_set_user_role_groups`.
- `src/lib/auth/guard.ts` - `requireAdmin` and `getAuthedProfile` guard behavior.

### Test Coverage

- `src/app/(dashboard)/admin/users/page.test.ts` - admin users page guard regression pattern.
- `src/app/(dashboard)/admin/users/actions.test.ts` - invite resend and role group action coverage.
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` - edit user action coverage.
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` - transactional role group integration coverage.
- `e2e/write-paths.spec.ts` - non-production invite acceptance and write-path coverage.
- `e2e-prod/production-readiness.spec.ts` - production invite acceptance and email capture coverage.
- `e2e-prod/production-fixtures.ts` - disposable production invite fixture patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `PageHeader` and the current admin shell already match the shared BMH navigation pattern.
- `Badge`, `Card`, and `Table` are already used on `/admin/users` and should remain the first choice for status and list display.
- `InviteForm`, `ResendInviteButton`, and `RevokeInviteButton` already isolate the client-side invite actions.
- `UserEditForm` already supports status, system role, role groups, suspend, delete, and access correction.

### Established Patterns

- Admin pages call `requireAdmin()` before creating the Supabase client.
- Server actions return discriminated unions and call `revalidatePath` after mutation.
- Access changes use `fn_set_user_role_groups` rather than deleting and inserting role groups directly.
- Tests are co-located and should start with the failing behavior for meaningful changes.

### Integration Points

- `/admin/users` is the natural pilot cohort setup surface.
- `/admin/users/[userId]/edit` is the natural individual correction surface.
- `/admin/page.tsx` can surface urgent expired or pending invite attention states.
- Production-readiness fixtures can be reused if the plan needs real invite email proof.

</code_context>

<specifics>
## Specific Ideas

- Show pilot setup as a clearer operational state on top of existing users and invites.
- Make expired invites and missing access easier to spot.
- Keep the first version small enough for the first internal pilot. Avoid broad admin redesign.

</specifics>

<deferred>
## Deferred Ideas

- Bulk import from spreadsheets is not in Phase 6 unless planning finds the first pilot cannot be run safely without it.
- New cohort database tables are deferred unless the planner finds filters and existing role groups cannot satisfy PILOT-01 through PILOT-04.
- Sandra Practice role-play embed remains parked for a later milestone.

</deferred>

---

*Phase: 6-Pilot Cohort Setup*
*Context gathered: 2026-05-09*

# Phase 6: Pilot Cohort Setup - Patterns

## Closest Existing Analogs

### Admin users page

File: `src/app/(dashboard)/admin/users/page.tsx`

Use this as the primary integration surface. It already fetches `profiles`, `invites`, and `role_groups`, renders active members, renders the invite form, and shows pending invites with resend and revoke actions.

### Admin overview attention items

File: `src/app/(dashboard)/admin/page.tsx`

Use this for compact operational status patterns. `getNeedsAttentionItems` already separates expired invites, pending invites, draft content, and pending submissions with clear links.

### User edit flow

Files:

- `src/app/(dashboard)/admin/users/[userId]/edit/page.tsx`
- `src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx`
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`

Use this for access correction. Role group edits already go through `saveUserSettings` and transactional role-group rewrite behavior.

### Tests

Files:

- `src/app/(dashboard)/admin/users/page.test.ts`
- `src/app/(dashboard)/admin/users/actions.test.ts`
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts`
- `e2e/write-paths.spec.ts`
- `e2e-prod/production-readiness.spec.ts`

Use unit and RTL tests first. Use Playwright only for changed browser flows.

## Implementation Constraints

- Do not add a separate cohort database table unless the plan is revised.
- Do not introduce new providers, paid services, or a spreadsheet import feature.
- Keep role groups as the source of access truth.
- Use existing shadcn primitives and Sandra tokens.
- Preserve `requireAdmin()` before Supabase data access on admin pages.

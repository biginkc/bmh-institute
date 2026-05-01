---
phase: 01-auth-and-access-hardening
plan: 1
subsystem: auth
tags: [security, harden, admin, guards, tdd]
dependency_graph:
  requires: []
  provides: [HARDEN-01]
  affects:
    - src/app/(dashboard)/admin/reports/page.tsx
    - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
tech_stack:
  added: []
  patterns:
    - Page-level requireAdmin() guard on all four admin report pages (first statement of async default export)
    - First codebase use of vi.mock for side-effectful auth and Supabase module mocking
key_files:
  created:
    - src/app/(dashboard)/admin/reports/page.test.ts
    - src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts
  modified:
    - src/app/(dashboard)/admin/reports/page.tsx
    - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
    - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
decisions:
  - HARDEN-01 closed via page-level guard matching the admin layout pattern; no architectural changes needed
  - Test mocks return minimal valid data so call-order assertions can complete page execution without hitting notFound()
  - vi.mock used for the first time in this codebase to isolate requireAdmin and createClient side effects
metrics:
  duration: ~12 minutes
  completed: "2026-05-01T01:19:34Z"
  tasks_completed: 3
  files_modified: 8
---

# Phase 01 Plan 1: Admin Route Guards Summary

HARDEN-01 closed: page-level `await requireAdmin()` guard added to all four admin report pages before any `await params` or Supabase client creation, with one Vitest regression unit per page asserting call order.

## What Was Done

The four admin report pages previously relied entirely on `(dashboard)/admin/layout.tsx`'s guard for access control. A direct server fetch bypassing navigation (or any future routing change that re-parents the report tree) would reach Supabase data without an admin check.

Each page now calls `await requireAdmin()` as its first statement:

- `src/app/(dashboard)/admin/reports/page.tsx`
- `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx`
- `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx`
- `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx`

Pattern matches `src/app/(dashboard)/admin/layout.tsx` exactly. Import grouped with other `@/lib/*` imports.

## Commits

| Order | Hash | Type | Description |
|-------|------|------|-------------|
| 1 (RED) | b9ca851 | test(01-auth) | HARDEN-01 failing regression for admin report guards |
| 2 (GREEN) | 9228876 | feat(01-auth) | HARDEN-01 add requireAdmin guard to admin report pages |

TDD gate sequence: RED commit (`test(01-auth):`) precedes GREEN commit (`feat(01-auth):`). REFACTOR not needed — changes were minimal and clean.

## Verification

- `npm run verify` exits 0 (typecheck + 86 unit tests passing, including all 12 new regression tests)
- All 12 `it` cases pass: 3 per page (call-order, unauthenticated redirect, learner-role redirect)
- `grep -c 'await requireAdmin()' ...` returns 1 for each of the 4 production pages

## Test Inventory (12 tests across 4 files)

| File | Test | Asserts |
|------|------|---------|
| reports/page.test.ts | calls requireAdmin before creating a Supabase client | requireAdmin is calls[0] and precedes createClient |
| reports/page.test.ts | redirects unauthenticated requests to /login | thrown error digest matches NEXT_REDIRECT;replace;/login;307; |
| reports/page.test.ts | redirects learner-role sessions to /dashboard | thrown error digest matches NEXT_REDIRECT;replace;/dashboard;307; |
| users/[userId]/page.test.ts | calls requireAdmin before creating a Supabase client | requireAdmin is calls[0] and precedes createClient |
| users/[userId]/page.test.ts | redirects unauthenticated requests to /login | thrown error digest matches NEXT_REDIRECT;replace;/login;307; |
| users/[userId]/page.test.ts | redirects learner-role sessions to /dashboard | thrown error digest matches NEXT_REDIRECT;replace;/dashboard;307; |
| courses/[courseId]/page.test.ts | calls requireAdmin before creating a Supabase client | requireAdmin is calls[0] and precedes createClient |
| courses/[courseId]/page.test.ts | redirects unauthenticated requests to /login | thrown error digest matches NEXT_REDIRECT;replace;/login;307; |
| courses/[courseId]/page.test.ts | redirects learner-role sessions to /dashboard | thrown error digest matches NEXT_REDIRECT;replace;/dashboard;307; |
| programs/[programId]/page.test.ts | calls requireAdmin before creating a Supabase client | requireAdmin is calls[0] and precedes createClient |
| programs/[programId]/page.test.ts | redirects unauthenticated requests to /login | thrown error digest matches NEXT_REDIRECT;replace;/login;307; |
| programs/[programId]/page.test.ts | redirects learner-role sessions to /dashboard | thrown error digest matches NEXT_REDIRECT;replace;/dashboard;307; |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock stubs returned null from maybeSingle causing notFound() before call-order assertion could complete**

- Found during: Task 3 (GREEN phase, first test run)
- Issue: The plan's suggested chain mock used `maybeSingle: async () => ({ data: null, error: null })`. The three param pages (user, course, program) call `notFound()` when maybeSingle returns null, throwing before the call-order assertion could evaluate `calls[0]`.
- Fix: Updated the three param page test files to return valid minimal data objects from `maybeSingle` (a profile stub, a course stub, a program stub). The overview page (`page.test.ts`) was unaffected because it does not call `maybeSingle` in its data flow.
- Files modified: `users/[userId]/page.test.ts`, `courses/[courseId]/page.test.ts`, `programs/[programId]/page.test.ts`
- Commit: 9228876 (included with implementation since it fixes the test infrastructure, not a behavior change)

## TDD Gate Compliance

- RED gate: commit `b9ca851` (`test(01-auth):`) present and precedes GREEN
- GREEN gate: commit `9228876` (`feat(01-auth):`) present after RED
- REFACTOR gate: not required; changes were minimal insertions only

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan only adds an existing guard function call to existing pages. No new threat surface.

## Known Stubs

None. All four pages render live Supabase data (guarded by `requireAdmin()`).

## Self-Check: PASSED

- `b9ca851` exists: confirmed via `git log`
- `9228876` exists: confirmed via `git log`
- All 4 production pages contain `await requireAdmin()`: confirmed via grep (each returns count 1)
- All 4 test files exist at their specified paths: confirmed
- `npm run verify` exits 0: confirmed (86/86 tests pass)

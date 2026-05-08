# Phase 4 Context: Type Safety and Test Coverage

## Goal

Replace ad hoc Supabase result assertions with generated database types and close the remaining critical write-path coverage gaps.

## Scope

- TYPE-01: Generate Supabase `Database` types, wire them into Supabase clients, and remove `as string` / `as number` result assertions in report and lesson pages.
- TEST-01: Add missing unit coverage for critical server actions.
- TEST-02: Add integration coverage for trigger-driven course and program certificate issuance.
- TEST-03: Add Playwright write-path coverage for invite, quiz, assignment, admin review, and password reset flows.

## Initial Findings

- Existing unit coverage already covers auth callback, assignment submission, forgot-password, and set-password.
- Admin submissions action coverage is missing.
- The largest type assertion clusters are in learner lesson pages, certificate pages, admin reports, and admin user/program pages.
- `src/lib/supabase/types.ts` does not exist yet.
- The e2e harness exists but only has a dashboard smoke spec today.

## Risk

Generated Supabase types can create broad TypeScript fallout. Keep TYPE-01 scoped to wiring the clients and the specific report/lesson assertion cleanup promised by the requirement.


# Plan 04-3: Certificate Trigger Integration

## Requirement

TEST-02: Integration tests cover the trigger-driven completion and certificate pipeline against a real Supabase project, including `fn_issue_course_certificate_if_eligible` and `fn_issue_program_certificate_if_eligible`.

## Implementation

1. Extend the integration harness with throwaway users, courses, programs, modules, lessons, and completion rows.
2. Exercise course certificate issuance through the public trigger/function path.
3. Exercise program certificate issuance through the public trigger/function path.
4. Cleanup every throwaway auth user and content row.

## Verification

1. `npm run test:integration -- <new spec>`
2. Confirm the test skips cleanly when `TEST_SUPABASE_*` variables are absent.
3. Run the same flow against linked Supabase when local test env vars are unavailable.


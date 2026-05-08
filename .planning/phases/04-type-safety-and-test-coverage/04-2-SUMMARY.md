# Summary 04-2: Unit Coverage Gaps

## Completed

- Confirmed existing unit coverage already covers:
  - Auth callback
  - Assignment submission
  - Forgot-password
  - Set-password
- Added admin submissions action coverage for:
  - Approval
  - Revision request validation
  - Revision request update
  - Database update error surfacing
  - Signed download URL creation
- Fixed the review email lookup to use `profiles!assignment_submissions_user_id_fkey`.

## Verification

- `npx vitest run 'src/app/(dashboard)/admin/submissions/actions.test.ts'` passed.
- `npm run verify` passed.


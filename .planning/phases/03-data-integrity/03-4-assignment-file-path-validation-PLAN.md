# Plan 03-4: Assignment File Path Validation

## Requirement

INTEG-04: Assignment submission `submission_file_path` is server-validated against `${user.id}/` before insert, with a unit test that rejects a path pointing at another user's prefix.

## Current Risk

`submitAssignment` only checks that a file path exists. A crafted server action call can submit another user's storage path.

## Implementation

1. Add a unit test for rejecting a `submission_file_path` outside the authenticated user's folder before insert.
2. Add a unit test for accepting a path inside the authenticated user's folder.
3. Add server-side path validation in `submitAssignment`.

## Verification

1. Run the targeted assignment action unit test.
2. Run `npm run verify`.


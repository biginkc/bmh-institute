# Plan 06-1 Summary: Pilot Cohort Status Model

## Status

Complete.

## What Changed

- Added pure pilot cohort status shaping in `src/lib/pilot-cohort/status.ts`.
- Added focused unit coverage in `src/lib/pilot-cohort/status.test.ts`.
- Wired `/admin/users` to fetch `user_role_groups` and derive pilot setup rows from profiles and invites.

## Verification

- Red test first: `npm run test -- src/lib/pilot-cohort/status.test.ts` failed because `./status` did not exist.
- Green test: `npm run test -- src/lib/pilot-cohort/status.test.ts` passed.
- Full gate: `npm run verify` passed.

## Notes

- No cohort table was added.
- Role groups remain the access source of truth.

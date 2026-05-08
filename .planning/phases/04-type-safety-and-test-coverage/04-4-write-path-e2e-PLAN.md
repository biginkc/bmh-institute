# Plan 04-4: Write Path E2E

## Requirement

TEST-03: Playwright e2e tests exercise invite acceptance, quiz submission, assignment upload, admin approval and revision, and password reset as write paths against the prod-config harness and pass via `npm run test:e2e`.

## Implementation

1. Add or extend e2e fixtures for throwaway users and content setup.
2. Add invite acceptance coverage.
3. Add quiz submission coverage.
4. Add assignment upload plus admin approval and revision coverage.
5. Add password reset coverage if it can run without external email inbox access. Otherwise document the blocker and cover the server action path.

## Verification

1. `npm run test:e2e`
2. Ensure the harness refuses to run against production project `dhvfsyteqsxagokoerrx`.
3. Record any unavoidable external-email blocker in the phase verification file.


# Plan 03-3: Certificate Number Counter

## Requirement

INTEG-03: `fn_next_certificate_number` uses a Postgres sequence or row lock so concurrent completions cannot collide on the unique constraint, with an integration test that fires concurrent completions and asserts distinct certificate numbers.

## Current Risk

The current function computes the next number with `max(existing) + 1`. Concurrent calls can read the same max and attempt to insert duplicate certificate numbers.

## Implementation

1. Add a certificate-number counter table keyed by prefix and year.
2. Seed the counter from existing course and program certificate numbers.
3. Rewrite `fn_next_certificate_number` to atomically insert or increment the counter row and return the reserved number.
4. Keep the existing certificate format.

## Verification

1. Add an integration test that requests multiple certificate numbers concurrently and asserts each value is distinct.
2. Where practical, extend coverage through the trigger path for course completions.
3. Run targeted integration tests and `npm run verify`.


# Summary 03-3: Certificate Number Counter

## Completed

- Added `certificate_number_counters` with RLS enabled.
- Seeded counter state from existing course and program certificate numbers.
- Replaced `fn_next_certificate_number` with an atomic insert-or-increment counter reservation.
- Kept the existing certificate number format.

## Verification

- Added gated integration coverage in `src/lib/data-integrity.integration.test.ts`.
- Linked Supabase verification:
  - Requested 20 certificate numbers concurrently through the service-role API.
  - Confirmed all 20 returned numbers were distinct.
  - Removed the throwaway counter prefix after verification.


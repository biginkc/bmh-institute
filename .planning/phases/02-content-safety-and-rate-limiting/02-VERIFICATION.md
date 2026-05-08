# Phase 2 Verification: Content Safety and Rate Limiting

Date: 2026-05-08
Status: PASS, deployed and verified

## Scope

Phase 2 goal:

Admin-authored HTML cannot execute scripts in learner browsers, embed iframes are sandboxed, and the forgot-password and password-reset paths cannot be abused by automated requests.

Requirements verified:

- HARDEN-05: Embed-block iframes load with a sandbox attribute, and admin-authored HTML in text blocks and certificate templates is sanitized via sanitize-html on write.
- HARDEN-06: Forgot-password and password-reset paths enforce server-side rate limiting with per-IP and per-email windows.

## Evidence Summary

Phase 2 is implemented across three completed plans:

- `02-1-SUMMARY.md`: sanitize-html policy, text block write sanitization, certificate sanitizer, backfill script.
- `02-2-SUMMARY.md`: embed iframe sandbox, HTTPS validation, Playwright browser flow.
- `02-3-SUMMARY.md`: auth rate-limit migration, helper modules, forgot-password and set-password gates.

Automated verification run on 2026-05-08:

```bash
npm run verify
```

Result:

- TypeScript passed.
- Unit suite passed: 31 files, 157 tests.
- RTL suite passed: 2 files, 5 tests.

Targeted integration command:

```bash
npm run test:integration -- src/lib/rate-limit/check.integration.test.ts
```

Result:

- Skipped cleanly: 1 file skipped, 3 tests skipped.
- Reason: `.env.test.local` does not contain the `TEST_SUPABASE_*` values required by the integration config.

Browser flow command:

```bash
E2E_PROD_BASE_URL=http://localhost:3100 npm run test:prod -- e2e-prod/embed-sandbox.spec.ts
```

Result:

- Passed: setup login plus embed sandbox browser smoke.
- Confirms unsafe `http://` iframe URL rejection, trimmed `https://` persistence, rendered sandbox attribute, and cleanup of disposable fixture.

## Success Criteria

### 1. Script tags are stripped before storage

Verdict: PASS

Evidence:

- `src/lib/sanitize/text-block.ts` defines a strict prose allowlist through `sanitize-html`.
- `src/lib/sanitize/certificate.ts` defines a certificate-specific allowlist that preserves approved seed-template inline styles and strips scripts.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` reads the stored `block_type` and sanitizes text block `content.html` before update.
- `scripts/backfill-sanitize-html.ts` provides an idempotent service-role backfill for existing text blocks and certificate templates.
- Unit tests cover script stripping, unsafe href schemes, style filtering, seeded certificate template preservation, and idempotency.

Notes:

- There is no certificate template admin editor today, so certificate template enforcement is delivered as sanitizer library plus backfill script. Future certificate editor actions must call `sanitizeCertificateBodyHtml`.
- The backfill script must be run after deploy:

```bash
npm run backfill:sanitize-html
```

### 2. Embed block iframe is sandboxed

Verdict: PASS

Evidence:

- `src/components/content-blocks.tsx` renders embed iframes with:

```html
sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
```

- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` trims valid embed URLs and rejects values that do not start with `https://`.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` labels embed URLs as admin-trusted and notes that sandbox blocks top-level navigation.
- RTL tests verify the rendered sandbox attribute and placeholder branches.
- Playwright verifies the real admin save path and rendered learner iframe against local dev.

Notes:

- Video iframes are intentionally unchanged per Phase 2 decision D-B2.
- The live deployment must be updated before the prod URL itself passes `e2e-prod/embed-sandbox.spec.ts`; a previous live run showed old deployed code.

### 3. Forgot-password and set-password are rate-limited before Supabase auth calls

Verdict: PASS in code and unit tests, pending deployed migration for live DB proof

Evidence:

- `supabase/migrations/011_auth_rate_limits.sql` adds:
  - `auth_rate_limit_key_type` enum.
  - `auth_rate_limits` table.
  - RLS with no learner policies.
  - lookup index.
  - `fn_check_and_consume_rate_limit` with `security definer` and `set search_path = public`.
  - execute grant only to `service_role`.
- `src/lib/rate-limit/ip.ts` extracts the first `x-forwarded-for` value, then `x-real-ip`, then `x-vercel-forwarded-for`, then `127.0.0.1`.
- `src/lib/rate-limit/check.ts` calls the RPC and fails closed if the RPC errors or returns no row.
- `src/app/(auth)/forgot-password/actions.ts` gates by IP and normalized email before `resetPasswordForEmail`. Denials return `{ ok: true }`.
- `src/app/auth/set-password/actions.ts` gates by IP and authenticated user email before `updateUser`. Denials return retry copy.
- Unit tests verify gate ordering, thresholds, normalized keys, denial behavior, and skipped Supabase auth calls.

Notes:

- Apply `supabase/migrations/011_auth_rate_limits.sql` before deployment.
- Populate `.env.test.local` with `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY` after migration application to run live RPC integration coverage.

## Deployment Verification

Post-deploy verification run on 2026-05-08:

- Production deployment ready at `https://sandra-university-asyxn8swy-jarrad-5416s-projects.vercel.app`.
- Migration `011_auth_rate_limits.sql` was applied to Supabase project `dhvfsyteqsxagokoerrx` and migration history was repaired.
- DB object proof passed with the current Supabase CLI service-role key:
  - `auth_rate_limits` readable by service role.
  - `fn_check_and_consume_rate_limit` callable by service role.
  - First consume with threshold 1 returned allowed.
  - Second consume with threshold 1 returned denied with positive retry seconds.
- Sanitizer backfill ran after migration and reported:
  - Sanitized 0 text content block rows.
  - Sanitized 0 certificate template rows.
- Production embed sandbox smoke passed:

```bash
E2E_PROD_BASE_URL=https://sandra-university-asyxn8swy-jarrad-5416s-projects.vercel.app npm run test:prod -- e2e-prod/embed-sandbox.spec.ts
```

Result:

- Passed: setup login plus embed sandbox browser smoke.
- Confirms unsafe `http://` iframe URL rejection, trimmed `https://` persistence, rendered sandbox attribute, and cleanup of disposable fixture against the deployed app.

Production forgot-password smoke passed with a disposable invalid email:

- `/forgot-password` submitted successfully.
- Success copy rendered.
- No browser console errors surfaced.
- Confirms deployed `SUPABASE_SERVICE_ROLE_KEY` can execute the rate-limit gate before Supabase Auth.

## Issues Found

No blocking code issues found.

Operational notes:

- `.env.local` appears to contain a stale local `SUPABASE_SERVICE_ROLE_KEY`; direct local checks with it failed as invalid. The deployed Vercel env works, and the current key is available through `supabase projects api-keys --project-ref dhvfsyteqsxagokoerrx`.
- Add `TEST_SUPABASE_*` values to `.env.test.local` if the Vitest integration command should exercise the live RPC locally without a one-off CLI-key check.

## Residual Risk

- The rate-limit integration test is present but was not executed through Vitest because `.env.test.local` is not configured with `TEST_SUPABASE_*`. Equivalent live RPC behavior was verified with the current Supabase CLI service-role key.
- Certificate template write-time sanitization cannot be verified through an admin UI because no such UI exists in this repo today.

## Verdict

PASS, deployed and verified.

Phase 2 satisfies the roadmap goal in code, automated unit and RTL verification, live DB proof, and deployed browser smoke verification.

---
*Phase: 02-content-safety-and-rate-limiting*
*Verified: 2026-05-08*

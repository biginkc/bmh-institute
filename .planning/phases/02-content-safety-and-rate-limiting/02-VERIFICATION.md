# Phase 2 Verification: Content Safety and Rate Limiting

Date: 2026-05-08
Status: PASS with deployment prerequisites

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

## Issues Found

No blocking code issues found.

Operational prerequisites remain:

- Deploy the current code before running the prod URL embed sandbox Playwright test.
- Apply migration `011_auth_rate_limits.sql` before enabling rate-limit code in production.
- Run `npm run backfill:sanitize-html` after deploy if existing text blocks or certificate templates need cleanup.
- Add `TEST_SUPABASE_*` values to `.env.test.local` if integration tests should exercise the live RPC locally.

## Residual Risk

- `checkAndConsume` depends on the service-role key at runtime. If production is missing `SUPABASE_SERVICE_ROLE_KEY`, forgot-password and set-password will fail closed by surfacing a server error path rather than allowing unlimited auth calls. This matches the security posture, but should be caught during deployment verification.
- The rate-limit integration test is present but was not executed locally because credentials are not configured in `.env.test.local`.
- Certificate template write-time sanitization cannot be verified through an admin UI because no such UI exists in this repo today.

## Verdict

PASS with deployment prerequisites.

Phase 2 satisfies the roadmap goal in code and automated unit, RTL, and browser verification. Live DB proof for HARDEN-06 requires applying migration `011` and running the integration test with Supabase test credentials.

Next recommended step:

- Apply migration `011_auth_rate_limits.sql`.
- Run `npm run backfill:sanitize-html`.
- Deploy the branch.
- Re-run:

```bash
npm run test:integration -- src/lib/rate-limit/check.integration.test.ts
npm run test:prod -- e2e-prod/embed-sandbox.spec.ts
```

---
*Phase: 02-content-safety-and-rate-limiting*
*Verified: 2026-05-08*

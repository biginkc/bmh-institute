# Test environment setup runbook

This runbook is for contributors who need to run `npm run test:integration` or `npm run test:e2e` locally. The unit suite (`npm run test`) does not need any of this setup.

## What you need

Three env vars in a file at the repo root called `.env.test.local`. The file is gitignored. Do not commit it.

```
TEST_SUPABASE_URL=https://<your-non-prod-project-ref>.supabase.co
TEST_SUPABASE_ANON_KEY=<anon key from Supabase Dashboard>
TEST_SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase Dashboard>
```

For the Playwright prod-smoke suite (`npm run test:prod`) you also need:

```
E2E_PROD_BASE_URL=https://sandra-university.vercel.app
E2E_TEST_EMAIL=<an account that exists on the deployed environment with admin privileges>
E2E_TEST_PASSWORD=<that account's password>
```

The two sets are independent. You can populate one without the other.

## Where to obtain each value

TEST_SUPABASE_URL: the BMH Institute non-production test project URL. The durable Playwright write-path suite expects project ref `jvaabkchkihkjllehmft` (`bmh-institute-test`) and refuses the production ref `dhvfsyteqsxagokoerrx`.

TEST_SUPABASE_ANON_KEY: from your throwaway project's Dashboard at Project Settings then API. The "anon public" key.

TEST_SUPABASE_SERVICE_ROLE_KEY: from the same Dashboard panel. The "service_role secret" key. Treat this like a password.

E2E_PROD_BASE_URL: the deployed BMH Institute URL. Production currently uses the legacy fallback `https://sandra-university.vercel.app` until `https://institute.bmhgroupkc.com` is configured. A Vercel preview URL also works.

E2E_TEST_EMAIL and E2E_TEST_PASSWORD: an account on the deployed environment. A real BMH Group VA account or a dedicated test account with admin privileges.

## Verifying the integration suite

Once `.env.test.local` is populated with the three TEST_SUPABASE_* vars:

```
npm run test:integration
```

Expected output: all `*.integration.test.ts` files run; `actions.integration.test.ts` and `answer-options-isolation.integration.test.ts` each report passing tests. If env vars are absent or incomplete, both files report `skipped` and the suite exits 0.

If a file reports an error rather than skipped or passed, that is a regression in the test or in the schema; surface to the team.

## Verifying the prod-smoke suite

Once `.env.test.local` has the three E2E_* vars populated:

```
npm run test:prod
```

Expected output: signs in via the live `/login`, runs the read-only specs in `e2e-prod/` (admin surfaces, dashboard, learner-context HARDEN-01 guard), all pass.

The HARDEN-01 learner-context spec (`e2e-prod/admin-route-guard-learner.spec.ts`) opts out of storage state and asserts the unauthenticated redirect on the four `/admin/reports/*` routes. It does not need the E2E_TEST_EMAIL credentials to pass; the credentials are still required for the existing admin-context specs.

## BMH Institute test Supabase project

The durable Playwright suite uses the existing `bmh-institute-test` Supabase project. Run `npm run seed:e2e` before `npm run test:e2e`; CI does this automatically with the `TEST_SUPABASE_*` secrets.

The fixture guard is intentionally strict. If you see a production-ref refusal, switch `TEST_SUPABASE_URL` away from `dhvfsyteqsxagokoerrx`. If you see an unexpected-ref refusal, point it at `jvaabkchkihkjllehmft`.

## Phase 01 HUMAN-UAT items

The five items in `.planning/phases/01-auth-and-access-hardening/01-HUMAN-UAT.md` were retired in Phase 01.1. Read-only items moved to Playwright specs in `e2e-prod/`; integration items got their gates flipped; durable LMS write paths now run against `bmh-institute-test` through `npm run test:e2e`. Invite acceptance remains separate until there is a stable non-production email capture strategy.

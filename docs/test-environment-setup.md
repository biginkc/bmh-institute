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

TEST_SUPABASE_URL: a Supabase project URL of the form `https://<ref>.supabase.co`. The project must NOT be the BMH Institute prod project (ref `dhvfsyteqsxagokoerrx`). Per project memory there is no permanent BMH Institute test project, so contributors needing to run the integration suite locally should provision their own throwaway Supabase project, apply the migrations from `supabase/migrations/`, and use that project's URL.

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

## Why no permanent test Supabase project

Project memory on file: there is no permanent `bmh-institute-test` Supabase project. The current default is Path A: contributors provision their own throwaway Supabase project, integration tests gate on `describe.skipIf` so they report `skipped` when env is unset, and destructive HUMAN-UAT items stay manual. The Path B alternative (Supabase ephemeral branches per CI run) costs Branching Compute Hours that bypass the standard Compute Credit and the spend cap; revisit only if Jarrad explicitly locks that trade.

## Phase 01 HUMAN-UAT items

The five items in `.planning/phases/01-auth-and-access-hardening/01-HUMAN-UAT.md` were retired in Phase 01.1. Read-only items moved to Playwright specs in `e2e-prod/`; integration items got their gates flipped (this file's purpose). The destructive items HARDEN-02 (expired-invite teardown) and the UI-flow variant of HARDEN-03 remain explicitly deferred under the deferred-until-test-environment label until a Path B or Path C decision lands.

# Test environment setup runbook

This runbook is for contributors who need to run `npm run test:integration` or `npm run test:e2e` locally. The unit suite (`npm run test`) does not need any of this setup.

## What you need

Three env vars in a file at the repo root called `.env.test.local`. The file is gitignored. Do not commit it.

```
TEST_SUPABASE_URL=https://<your-non-prod-project-ref>.supabase.co
TEST_SUPABASE_ANON_KEY=<anon key from Supabase Dashboard>
TEST_SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase Dashboard>
```

The public Playwright prod-smoke checks (`npm run test:prod`) need only:

```
E2E_PROD_BASE_URL=https://institute.bmhgroupkc.com
```

Authenticated read-only checks are manual/opt-in and require a short-lived
Playwright storage-state artifact captured after a real Hugo login:

```
E2E_HUGO_STORAGE_STATE=/absolute/path/to/hugo-authenticated-state.json
```

Never substitute an Institute password for this artifact. It contains session
cookies, must remain outside the repository, and must be deleted after the run.

## Where to obtain each value

TEST_SUPABASE_URL: the BMH Institute non-production test project URL. The durable Playwright write-path suite expects project ref `jvaabkchkihkjllehmft` (`bmh-institute-test`) and refuses the production ref `dhvfsyteqsxagokoerrx`.

TEST_SUPABASE_ANON_KEY: from your throwaway project's Dashboard at Project Settings then API. The "anon public" key.

TEST_SUPABASE_SERVICE_ROLE_KEY: from the same Dashboard panel. The "service_role secret" key. Treat this like a password.

E2E_PROD_BASE_URL: the deployed BMH Institute production URL,
`https://institute.bmhgroupkc.com`. The production smoke harness deliberately
rejects preview hosts so it cannot be mistaken for production evidence.

E2E_HUGO_STORAGE_STATE: a local Playwright storage-state JSON file captured only
after completing the real Hugo flow. If it is omitted, public auth checks run
and authenticated scenarios are reported as skipped with a manual Chrome
acceptance instruction.

### Preview Hugo prerequisite

A Vercel preview that points at `bmh-institute-test` can complete the real Hugo
flow only when that Supabase project has an enabled `custom:hugo` provider. The
provider must use a dedicated non-production OAuth client registered in Hugo
with this exact callback:

```
https://jvaabkchkihkjllehmft.supabase.co/auth/v1/callback
```

Keep the production Institute OAuth client and secret out of the test project.
The dedicated client ID must also be on Hugo's first-party client allowlist.
Treat these as one controlled configuration change: register the client, add it
to the Hugo allowlist, configure the test provider, then prove the authorization
redirect, callback, and resulting test-project session before accepting preview
authentication. A preview that reports `Unsupported provider: custom provider
custom:hugo not found` is missing this configuration and is not valid evidence
for the real sign-in path.

## Verifying the integration suite

Once `.env.test.local` is populated with the three TEST_SUPABASE_* vars:

```
npm run test:integration
```

Expected output: all `*.integration.test.ts` files run; `actions.integration.test.ts` and `answer-options-isolation.integration.test.ts` each report passing tests. If env vars are absent or incomplete, both files report `skipped` and the suite exits 0.

If a file reports an error rather than skipped or passed, that is a regression in the test or in the schema; surface to the team.

## Verifying the prod-smoke suite

Once `E2E_PROD_BASE_URL` is set:

```
npm run test:prod
```

Expected output: proves `/login` exposes only **Continue with Hugo**, proves the
legacy password/recovery/invite routes are unusable, and exercises unauthenticated
route guards. Authenticated dashboard/admin checks run only when
`E2E_HUGO_STORAGE_STATE` is supplied.

The production config does not bind or use `TEST_SUPABASE_*` or service-role
credentials and contains no fixture-writing spec. Embed-editor write coverage
runs only in the seeded nonproduction suite.

The HARDEN-01 learner-context spec (`e2e-prod/admin-route-guard-learner.spec.ts`)
uses an empty state and asserts the unauthenticated redirect on the four
`/admin/reports/*` routes.

## BMH Institute test Supabase project

The seeded Playwright suite uses the existing `bmh-institute-test` Supabase project. Run `npm run seed:e2e` before `npm run test:e2e`, then `npm run cleanup:e2e` when the run ends. Local seeding requires `E2E_SEED_PASSWORD` with at least 24 characters and has no repository fallback. CI generates a masked one-run credential, disables Playwright traces, removes all seeded accounts and content in an `always()` step, and only then uploads the non-trace HTML report. The seed never prints emails or passwords.

The fixture guard is intentionally strict. If you see a production-ref refusal, switch `TEST_SUPABASE_URL` away from `dhvfsyteqsxagokoerrx`. If you see an unexpected-ref refusal, point it at `jvaabkchkihkjllehmft`.

## Phase 01 HUMAN-UAT items

The five items in `.planning/phases/01-auth-and-access-hardening/01-HUMAN-UAT.md` were retired in Phase 01.1. Durable LMS write paths run against `bmh-institute-test` through `npm run test:e2e`. The seeded suite proves that the public login surface has one Hugo action and that legacy password, recovery, and invite-acceptance entrypoints cannot establish an app session. Business-workflow specs create test-project sessions out of band so browser automation never reintroduces product password UI.

## Production readiness after Hugo cutover

`npm run test:prod:readiness` automatically checks only the public Hugo boundary.
The two-user linking, authorization preservation, unauthorized-user denial,
suspension, former-password rejection, and no-recovery-email checks are explicit
manual Chrome gates. The harness intentionally cannot generate app passwords,
send Institute invitations, or forge production sessions to make those gates
look automated.

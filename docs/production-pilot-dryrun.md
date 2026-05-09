# Production Pilot Dry Run

This run rehearses the internal pilot with disposable production data.

The test creates records prefixed with `PILOT-DRYRUN-`, signs in through the
production app, verifies pilot monitoring states, verifies CSV export, corrects
one learner's role group through the admin UI, checks an unassigned learner is
blocked by UI and RLS, then deletes the seeded users and content.

## Commands

Run the dry run against production:

```bash
npm run test:prod:dryrun
```

Clean up any abandoned dry-run records:

```bash
npm run cleanup:prod-dryrun -- --execute
```

## Required Secrets

The dry run requires the same production Supabase secrets as the production
readiness suite:

- `PROD_SUPABASE_URL`
- `PROD_SUPABASE_ANON_KEY`
- `PROD_SUPABASE_SERVICE_ROLE_KEY`
- `PROD_READINESS_TEST_PASSWORD`

The GitHub workflow runs against `https://institute.bmhgroupkc.com` and uploads
the Playwright trace plus `test-results/production-pilot-dryrun-manifest.json`
as artifacts.

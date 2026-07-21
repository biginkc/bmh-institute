# Production pilot manual gate

The historical password-seeded production pilot rehearsal is retired. The
current command emits a skipped Playwright item that records the required
manual Chrome gate; it does not sign in, create users, write production data,
or clean anything up.

## Command

```bash
E2E_PROD_BASE_URL=https://institute.bmhgroupkc.com npm run test:prod:dryrun
```

The corresponding GitHub workflow is `workflow_dispatch` only. It needs only
`E2E_PROD_BASE_URL` and publishes the manual-gate result. It has no app-password
or Supabase service-role secret.

## Manual gate

Using real Hugo-authenticated Chrome sessions:

1. Confirm both active users enter their existing Institute UID, role, profile, role groups, and learning records.
2. Confirm learner monitoring, access correction, and the CSV export are available to an authorized admin.
3. Confirm an unprovisioned Hugo user is denied without creating an Institute account or content.
4. Confirm a suspended user is denied without a redirect loop.
5. Confirm a formerly valid Institute password is rejected and Institute recovery sends no email.

Do not replace these checks with a forged session, an Institute password, or a
service-role-created production fixture.

## Historical leftovers

If an older harness left `PILOT-DRYRUN-` or `PRD-READY-` records, use
`docs/production-readiness-recovery.md` under explicit operator supervision.
The current manual-gate command does not create those records.

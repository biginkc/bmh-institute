# Production readiness recovery runbook

Use this when a production-readiness run fails, is cancelled, or leaves disposable data behind.

Production readiness data must use the `PRD-READY-` prefix. The cleanup script is dry-run by default and refuses to run unless the Supabase URL points at production ref `dhvfsyteqsxagokoerrx`.

## Inspect leftovers

```bash
PROD_SUPABASE_URL="https://dhvfsyteqsxagokoerrx.supabase.co" \
PROD_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
npm run cleanup:prod-readiness
```

The output includes counts and IDs for matching programs, courses, role groups, assignments, quizzes, answer options, auth users, and production submission storage objects.

## Remove leftovers

```bash
PROD_SUPABASE_URL="https://dhvfsyteqsxagokoerrx.supabase.co" \
PROD_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
npm run cleanup:prod-readiness -- --execute
```

After execute mode, the script prints remaining counts. All counts should be `0`.

The script also catches timestamped file uploads created by the UI uploader, such as `<user-id>/<timestamp>-production-readiness-upload.txt`.

## When cleanup fails

1. Save the GitHub Actions run URL and Playwright artifact names.
2. Save the cleanup script JSON output.
3. Re-run dry-run mode to confirm the remaining table or storage area.
4. Fix the blocker in code or Supabase policy.
5. Re-run execute mode.
6. Re-run dry-run mode and confirm all counts are `0`.

## Manual checks

If the script cannot run, manually inspect production Supabase for:

- auth users with emails beginning `prd-ready-`
- programs, courses, role groups, assignments, quizzes, and answer options beginning `PRD-READY-`
- objects in the `submissions` bucket ending `production-readiness-upload.txt` or `blocked-cross-prefix.txt`

Do not delete non-prefixed users, records, or files as part of this recovery flow.

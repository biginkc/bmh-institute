# Summary 04-4: Write Path E2E

## Status

Deferred to GitHub issue #2: Add durable Playwright write-path coverage.

## Why Deferred

Manual Playwright verification against production confirmed the major UI write paths, but making that script permanent now would create churn while the UI and data setup are still changing. The durable suite also needs a non-prod Supabase project with migrations and storage buckets applied. The current e2e fixture correctly refuses to run against the production project `dhvfsyteqsxagokoerrx`.

## Manual Playwright Verification

Confirmed through the deployed UI:

- Admin login.
- Learner login.
- Learner dashboard shows assigned program.
- Course page shows seeded lessons.
- Quiz submission from UI, with visible pass state and DB-confirmed score 100.
- Text assignment submission from learner UI.
- Admin request revision from `/admin/submissions`.
- Learner sees revision note and resubmits.
- Admin approval from UI.
- Learner sees assignment approved.
- Certificates page shows issued course and program certificate numbers.
- File upload assignment through the browser file chooser, then submit.
- Forgot-password form shows the success state.

## Not Fully Confirmed

- Invite send and invite acceptance were exercised through the UI, but Supabase returned email delivery limits during verification. This should be covered after a stable non-prod email capture strategy exists.

## Follow-Up

- GitHub issue: `https://github.com/biginkc/bmh-institute/issues/2`


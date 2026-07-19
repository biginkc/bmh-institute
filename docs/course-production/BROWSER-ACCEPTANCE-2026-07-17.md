# Deployed browser acceptance — 2026-07-17

## Bound revision and deployment

- Git revision: `8995c309ea0a9d028280aecae115eee102716a26`
- Vercel preview deployment: `dpl_7TmhuDsp1u6xmK5SHXvA1A1qTyD9`
- Preview URL:
  `https://sandra-university-kl68bl094-jarrad-5416s-projects.vercel.app`
- Target: Vercel Preview. Production was not redeployed or changed.

The first preview deployment returned
`500 MIDDLEWARE_INVOCATION_FAILED` because the Preview environment did not have
the public Supabase URL and anonymous key. The final accepted deployment uses
the dedicated `bmh-institute-test` Supabase project. It does not reuse the
production database for authenticated acceptance.

## Preview safety boundary

The accepted Preview environment contains the QA Supabase URL, anonymous key,
and service-role key. Production SMTP, Sandra, Closer Lab base URL, and cron
credentials were not attached. Existing SMTP variables were removed from the
Preview target before authenticated testing. Production environment scopes
were preserved.

The role-play signing and verification secrets already scoped to Preview remain
inert because Preview has no Closer Lab base URL. No role-play token was minted
and no provider call was attempted.

## Chrome acceptance result

Chrome was used against the deployed Preview rather than a local or simulated
browser surface.

Passed at 1440 by 1000 pixels:

- branded sign-in page;
- unauthenticated `/dashboard` and `/admin` redirects;
- authenticated learner dashboard, course, and lesson navigation;
- authenticated owner overview and submission-review surfaces;
- full-width layout without horizontal overflow; and
- zero browser-console errors on the accepted Preview surfaces.

Passed at 390 by 844 pixels:

- branded sign-in page;
- authenticated learner dashboard and lesson;
- primary-navigation drawer open state and reachable navigation links;
- authenticated owner overview; and
- exact `390px` document and viewport width with no horizontal overflow.

No completion, quiz, assignment-review, user-management, certificate, Sandra,
or Closer Lab write action was submitted during manual browser acceptance.
Those write contracts are covered by the green seeded Playwright and live
integration suites, but remain subject to the final post-import happy-path gate.

## Temporary fixture lifecycle

The browser pass used the repository's deterministic `seed:e2e` workflow on the
dedicated test project. It created three temporary users and the documented E2E
program/course hierarchy. `cleanup:e2e` completed successfully immediately
after acceptance, and the one-run password file was removed.

Older `E2E-WRITE-*` and screenshot-labelled records were visible in the QA
project before this run. They were not created by this acceptance pass and were
not deleted without the fixture-cleanup manifest. They do not represent genuine
learner activity.

## Remaining release gates

- Jarrad must approve the exact 49-image artwork contact sheet before artwork is
  promoted into the release manifest.
- Seven policy-safe replacement videos remain held until their exact rendered
  cuts are produced and approved.
- Six production Closer Lab scenario IDs remain unmapped.
- The complete manifest import, reconciliation, rollback rehearsal, final
  write-path happy path, fixture deletion, employee access attachment, and
  publication remain blocked.
- Independent Claude review remains unavailable because the local Claude Code
  authentication attempt returned `401 Invalid authentication credentials`.


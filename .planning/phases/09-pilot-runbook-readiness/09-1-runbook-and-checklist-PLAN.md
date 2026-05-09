# Plan 09-1: Runbook And Checklist

## Goal

Create repeatable operating docs for launching and running the first internal pilot.

## Scope

- Add a production pilot runbook under `docs/`.
- Add a reusable pre-pilot checklist under `docs/`.
- Keep instructions plain and specific to the current app and no-spend constraint.

## Tasks

1. Draft launch, monitoring, support, cleanup, and rollback steps.
2. Draft pre-pilot checks for domain, email links, auth, content access, submissions, certificates, and cleanup.
3. Cross-reference production-readiness recovery and reports export.
4. Run `npm run verify`.

## Acceptance

- A teammate can run the pilot without asking Codex for the sequence.
- Common support cases have first checks and escalation paths.
- Checklist states what is automated and what remains manual.


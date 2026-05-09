---
status: complete
created: "2026-05-09T01:26:40-05:00"
---

# Write Path E2E

## Goal

Close GitHub issue #2 by adding durable non-production Playwright coverage for the learner/admin write paths that were previously verified manually.

## Scope

- Add disposable service-role fixtures for non-production Supabase only.
- Add Playwright coverage for learner login, assigned course access, content completion, quiz submit, text assignment revision and approval, file upload and approval, certificate visibility, unassigned access denial, and forgot-password success copy.
- Update docs so the known `bmh-institute-test` project replaces the old "no permanent test project" note.

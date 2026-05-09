# Plan 08-1: Monitoring Summary Model

## Goal

Create a tested model that classifies pilot learner progress and admin action needs.

## Scope

- Add a pure helper under `src/lib/pilot-monitoring/`.
- Summarize learner counts, progress, pending submissions, revision needs, certificate state, and last activity.
- Classify each learner into an admin-facing status such as blocked, needs review, needs revision, not started, in progress, or certified.

## Tasks

1. Write failing unit tests for no access, not started, in progress, pending review, needs revision, and certified states.
2. Implement the model with typed inputs that match existing report queries.
3. Return summary totals plus learner rows for UI and export reuse.
4. Run the focused test and `npm run verify`.

## Acceptance

- The model highlights action states before passive states.
- Pending review and needs revision counts are visible.
- Last activity is derived from completions, quiz attempts, and submissions.
- Tests cover the status priority rules.


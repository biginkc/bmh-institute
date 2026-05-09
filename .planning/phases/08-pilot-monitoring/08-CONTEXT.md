# Phase 8 Context: Pilot Monitoring

## Goal

Let admins monitor pilot progress and act on blockers quickly.

## Requirements

- OPS-01: Admin can see pilot progress by learner, program, course, quiz, assignment, and certificate state.
- OPS-02: Admin can quickly identify learners who are stalled, blocked, pending review, or ready for certification.
- OPS-03: Admin can act on pending submissions and learner blockers from the monitoring flow.
- OPS-04: Admin can export or record pilot status evidence for internal review.

## Existing Surfaces

- `/admin/reports` already shows learner, course, program, certificate, quiz, submission, and recent activity rollups.
- `/admin/reports/users/[userId]` already drills into learner progress.
- `/admin/submissions` already supports pending, needs revision, approved, and all filters.
- `/admin/users` already supports pilot setup and access correction.

## Direction

Reuse `/admin/reports` as the pilot monitoring command surface. Add a tested model that classifies learner state and drives a compact pilot panel above the current reports. Add an export route so the team can record pilot evidence without direct database access.


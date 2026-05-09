# Performance thresholds

Date: 2026-05-09
Source: GitHub issue #9
Status: active trigger policy

## Purpose

BMH Institute has fewer than ten expected internal learners today, so PERF-01 through PERF-03 stay parked until a real threshold is met. This document defines when performance work becomes worth doing and what work should start first.

## Measurement policy

Use these rules before promoting performance work:

- Measure against the deployed app or a production-like data snapshot.
- Use Playwright traces, server logs, Supabase query timing, or Vercel function timing.
- Record the route, dataset size, run count, p50, p95, and worst observed value.
- Treat one slow cold run as a signal to investigate, not an automatic trigger.
- Promote work when a threshold is breached across three repeatable runs or when an operator-visible workflow feels slow during normal use.

## Trigger thresholds

| Area | Trigger | First response |
|------|---------|----------------|
| Admin reports overview | `/admin/reports` p95 exceeds 2 seconds across three warm runs with normal production data. | Start PERF-01. Paginate the overview and move expensive aggregation into Postgres views or RPCs. |
| User report pages | `/admin/reports/users/[userId]` p95 exceeds 2 seconds across three warm runs, or query timing shows module/progress aggregation taking more than 1 second. | Start PERF-02. Filter module queries to accessible course IDs or replace completion math with a focused RPC. |
| Course report pages | `/admin/reports/courses/[courseId]` p95 exceeds 2 seconds across three warm runs with realistic module and learner counts. | Fold into PERF-01 or PERF-02 depending on whether the slow query is overview aggregation or per-course progress math. |
| Lesson pages with signed URLs | `/lessons/[lessonId]` p95 exceeds 1.5 seconds for lessons with storage-backed content, or signed URL generation takes more than 500 ms p95. | Start PERF-03. Cache signed URLs with revalidation shorter than the Supabase storage URL TTL. |
| Authoring list pages | `/admin/programs` or `/admin/courses` p95 exceeds 1.5 seconds with normal production data. | Optimize the specific list query first. Promote to a PERF plan only if the same pattern affects reports or learner routes. |
| Production readiness runs | `npm run test:prod:readiness` crosses 5 minutes without a fixture or network failure explanation. | Inspect traces and function timing. Promote only the route or provider call that accounts for the added time. |

## Volume triggers

Promote a performance review even without a measured breach when production reaches any of these levels:

- 25 active learners.
- 20 published courses.
- 500 lesson content blocks.
- 1,000 assignment submissions.
- 5,000 progress or activity rows.
- Any single lesson with more than 10 storage-backed content blocks.

These are review triggers, not automatic implementation triggers. Measure first, then start the smallest PERF plan that addresses the observed bottleneck.

## Parked work mapping

| Parked item | Start when | Scope |
|-------------|------------|-------|
| PERF-01 | Admin report overview or course report thresholds are breached. | Pagination, Postgres views, or RPC-backed aggregation. |
| PERF-02 | User report pages show slow module or progress queries. | Accessible-course filtering or completion-percent RPCs. |
| PERF-03 | Signed URL generation is a measurable lesson-page bottleneck. | Signed URL cache with TTL shorter than storage URL expiry. |

## Current decision

Do not start PERF-01 through PERF-03 yet. The app should stay simple until these thresholds are breached or Jarrad explicitly prioritizes scale work.


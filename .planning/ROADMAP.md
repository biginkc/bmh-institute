# Roadmap: BMH Institute

## Shipped Milestones

### v1 follow-up: Production Readiness Evidence

Status: shipped 2026-05-09

Archive:

- Roadmap: `.planning/milestones/v1-follow-up-ROADMAP.md`
- Requirements: `.planning/milestones/v1-follow-up-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1-follow-up-MILESTONE-AUDIT.md`

Delivered:

- Auth and access hardening.
- Testing coverage parity.
- Content safety and password reset rate limiting.
- Sandra Design System Stitch pass.
- Data integrity hardening.
- Type safety and durable write-path test coverage.
- Ecosystem navigation alignment.
- Custom domain and production email-link readiness.

Production evidence:

- GitHub Actions production-readiness run `25598402881` passed from `main` on 2026-05-09.
- Result: 4 passed, 0 skipped.
- Production URL: `https://institute.bmhgroupkc.com`.

## Current Milestone

No active milestone is defined.

Start the next milestone with `/gsd-new-milestone`.

## Backlog

### Backlog item 999.1: Rename working directory to BMH Institute (complete, 2026-05-08)

Archive:

- Summary: `.planning/phases/999.1-rename-working-directory-to-bmh-institute/999.1-1-SUMMARY.md`
- Verification: `.planning/phases/999.1-rename-working-directory-to-bmh-institute/999.1-VERIFICATION.md`

Completed:

- In-repo sweep of Sandra University naming.
- Local repo folder moved to `/Users/jarradhenry/Sites/BMH Institute`.
- Matching memory/project path moved.
- `.env.local` old rename strings cleared.
- `.vercel/project.json` confirmed with `projectName: "bmh-institute"`.
- `npm run verify` passed from the new path.

## Future Candidates

### Role-play embed

Parked for a future milestone after Sandra Practice ships its first public scenario:

- EMBD-01: role-play block type and `role_play_results` table.
- EMBD-02: short-lived embed JWT helper.
- EMBD-03: `RolePlayBlock` iframe and postMessage listener.
- EMBD-04: admin block editor role-play option.
- EMBD-05: role-play result persistence and report surfacing.

### Performance threshold work

Parked until `docs/performance-thresholds.md` triggers are breached:

- PERF-01: admin reports overview pagination or aggregation pushdown.
- PERF-02: user report module query filtering or completion RPC.
- PERF-03: signed URL caching.

# BMH Institute

## What This Is

BMH Institute is BMH Group's internal training platform for VAs (mostly Philippines, English often a second language, async, sessions in hours not minutes). Replaces a Thinkific subscription. Built as a Next.js App Router app on Supabase (auth, Postgres, RLS, Storage), self-hosted on Vercel, with Google Workspace SMTP for transactional email. Renamed from Sandra University on 2026-04-30; the Supabase project ref is unchanged.

## Core Value

A VA can sign in via an admin invite, work through assigned programs and courses on their own time, take quizzes and submit assignments without supervision, and receive a certificate when they finish. Admins can author content, manage learners, review submissions, and see who is making progress without leaving the platform.

## Requirements

### Validated

- ✓ Email and password authentication with Supabase auth and admin allowlist promotion — shipped
- ✓ Invite-only account creation with admin-issued invite tokens — shipped
- ✓ Self-service password reset flow — shipped
- ✓ Programs containing courses, courses containing modules, modules containing lessons — shipped
- ✓ Programs ↔ courses many-to-many with standalone courses allowed — shipped
- ✓ Per-program toggle for sequential vs free course order — shipped
- ✓ Role-group-scoped access to programs and courses with RLS enforcement — shipped
- ✓ Content-block lessons with video, text, PDF, image, audio, download, external link, and embed block types — shipped
- ✓ Quiz lessons with attempt limits, retake cooldown, and randomized answer options — shipped
- ✓ Assignment lessons with submission and reviewer workflow — shipped
- ✓ Per-course and per-program certificate templates with merge-field rendering — shipped
- ✓ Learner dashboard with per-course and per-module progress indicators — shipped
- ✓ Admin pages for users, programs, courses, lessons, blocks, certificates, invites — shipped
- ✓ Admin reports across users, programs, and courses — shipped
- ✓ Email notifications for invite enrollment, new submissions, and submission reviews via Google Workspace SMTP — shipped
- ✓ Profile page for learners to edit name and password — shipped
- ✓ Admin edit-user screen for role, status, and role groups — shipped

### Active

No active milestone is defined. Start the next milestone with `/gsd-new-milestone`.

### Out of Scope

- AI voice role plays — owned by the standalone Sandra Practice app, not this milestone. Embed scaffolding (`role_play` block type, `role_play_results` table, JWT helper, RolePlayBlock listener) is deferred to v2 and arrives only when Sandra Practice ships its first public scenario.
- New content authoring features — the current milestone is shell and navigation alignment only.
- Performance pagination of admin reports — `.planning/codebase/CONCERNS.md` flags this as a future scale concern, not a current bug. Defer until learner volume forces it.
- Test Supabase project — `npm run test:integration` and `npm run test:e2e` continue to run against the production project read-only as a deliberate cost choice.
- Mobile-native app or auto-translation — never in scope.
- Real-time team competitions, comment threads on transcripts, lip-synced avatars — these belong to Sandra Practice or are deliberately not built.

## Context

This codebase has shipped the v1 follow-up milestone. BMH Institute is ready for the internal pilot scope: custom domain, production auth, production Supabase writes, production storage, production email-link invite acceptance, password reset, admin review, certificates, cleanup, and recovery checks all pass through GitHub Actions production-readiness.

Latest production-readiness evidence:

- Run: `25598402881`
- Branch: `main`
- Date: 2026-05-09
- Result: 4 passed, 0 skipped
- URL: `https://institute.bmhgroupkc.com`

The codebase map under `.planning/codebase/` is the canonical reference for current structure. AGENTS.md is the source of truth for development conventions and project identity. Production runs on the Hobby Vercel plan and the BMH Group Supabase Pro org subscription.

The standalone Sandra Practice app has not been bootstrapped yet. Its parked planning bundle lives in `sandra-practice-planning/` and the cross-origin embed contract lives in `role-play-embed-contract.md`. Both are untracked in git — Jarrad will move them when Sandra Practice gets its own repo.

Email transport pivoted from SendGrid to Google Workspace SMTP in commit `ce6e49c` to consolidate vendors under Twilio; do not propose alternative transactional email providers without explicit discussion.

## Constraints

- **Tech stack**: Next.js 16 App Router on Node 22+, React 19, Tailwind 4, shadcn v4, @supabase/ssr — locked
- **Database**: Supabase project ref `dhvfsyteqsxagokoerrx` (label `bmh-institute`) — RLS on every table is non-negotiable
- **Email**: Google Workspace SMTP via nodemailer — no alternate providers
- **Hosting**: Vercel Hobby plan — Password Protection and Automation Bypass are Pro-only and unavailable
- **Testing**: Vitest unit + integration; Playwright e2e. **Test-first TDD for meaningful changes**. State intended coverage briefly, write failing tests first when useful, then implement. `npm run verify` (typecheck + unit) gates the husky pre-commit hook
- **Writing style**: No em dashes, minimal commas/dashes, no bold or Roman numeral headers, company is "BMH Group" not "BMH Group KC"

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Adopt GSD on a brownfield codebase mid-flight | Future work needs phase tracking, atomic commits, and verification gates beyond pre-commit linting | ✓ Good |
| First milestone is hardening, not features | Concerns map surfaced security and data-integrity gaps that should close before the BMH team scales up; hardening is a one-shot foundation cost | ✓ Good |
| Coarse granularity, parallel execution, YOLO mode | Matches Jarrad's parked Sandra Practice config and his shipping pace; keeps phase count low so velocity stays high | ✓ Good |
| Quality model profile, all workflow gates on | Hardening work has long blast radius; pay for deeper analysis up front | ✓ Good |
| Voice runtime work belongs in Sandra Practice, not here | The embed contract was written specifically to keep the LMS lean and the role-play app reusable; conflating them would break the architecture | ✓ Good |
| Test-first execution is the default for meaningful changes | Keeps behavior changes covered without turning routine execution into an execution bottleneck | ✓ Good |
| v1 hardening closed with TEST-03 deferred | Manual production Playwright verified major write paths; durable automation needs non-prod Supabase and email capture | ✓ Superseded by PR #39, PR #40, and PR #45 |
| v1.1 focuses on shared BMH ecosystem shell | Jarrad wants BMH Institute navigation to match Sandra, Closer Lab, and Jitter instead of drifting as a standalone LMS | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after v1 follow-up milestone archive*

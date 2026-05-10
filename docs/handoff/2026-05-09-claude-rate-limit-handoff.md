# BMH Institute Claude handoff

Generated: 2026-05-09

This handoff is for Claude or another agent resuming BMH Institute after a Codex rate-limit transition. Start by reading `AGENTS.md`, then this file, then `.planning/STATE.md`.

## Current project status

BMH Institute is the internal LMS for BMH Group. It is not Sandra Practice or Closer Lab.

Current repo path:

`/Users/jarradhenry/Sites/BMH Institute`

Current verified state:

- `main` is clean and synced with `origin/main`.
- GSD state says v1.1 Internal Pilot Operations is shipped.
- `.planning/STATE.md` says no unblocked BMH Institute repo work remains.
- Production domain `https://institute.bmhgroupkc.com` was verified earlier as reachable and correctly redirecting unauthenticated users to login.
- Latest remembered production readiness run from `main` was `25614367824`, passing 4 production checks.
- The Vercel project is connected to GitHub. Routine merges to `main` should deploy through normal Vercel Git flow. Do not run manual `vercel deploy --prod` or `vercel alias set` for routine merges.

## What was cleaned up

The BMH Institute merged walkthrough worktrees were removed because each one was clean and tied to a merged PR:

- PR #62, `codex/20260509-151409-walkthrough-caption-overlay`
- PR #63, `codex/20260509-152041-walkthrough-caption-suspense`
- PR #65, `codex/20260509-155113-walkthrough-wizard-controls`
- PR #66, `codex/20260509-160106-walkthrough-refresh-persistence`
- PR #67, `codex/20260509-161453-bmh-native-walkthrough`
- PR #68, `codex/20260509-162533-walkthrough-anchor-controls`

The extra merged branch `codex/20260509-sync-gsd-after-walkthrough-plan` for PR #72 was also deleted locally.

After cleanup, `git status --short --branch` in the main BMH Institute checkout showed:

```text
## main...origin/main
```

## Remaining local worktree issue

Two old locked worktree records remain registered under the legacy Sandra University path:

```text
/Users/jarradhenry/Sites/Sandra University/.claude/worktrees/agent-a213d400c24ecaace
/Users/jarradhenry/Sites/Sandra University/.claude/worktrees/agent-a53a5d466ccc7c89d
```

They appeared as locked Claude agent worktrees and their paths were missing on disk. They were not force removed. Treat them as stale bookkeeping unless they block a Git operation. If they do block Git, inspect with:

```bash
git worktree list --porcelain
```

Then remove only with explicit care because they are locked records.

## Issues and decisions encountered

The session began after context loss from rate limits. The first task was to recover what work remained.

Findings:

- BMH Institute was already shipped and synced.
- No BMH Institute open PRs were found.
- The only intentionally open BMH Institute GitHub issue was #64, the reusable guided walkthrough system. It should remain open until a second app consumes the pattern or the monorepo is ready to extract a shared package.
- The walkthrough worktrees were stale after squash-merged PRs and were safe to clean.
- Cross-repo worktree scanning was started, but Jarrad clarified to check only this project. Do not continue cross-repo cleanup unless explicitly asked.

Vercel/domain issue encountered earlier:

- The old process required manual production deploy plus alias after each deployment.
- This was fixed before this handoff. The Vercel project now uses Git-connected production deploys and custom domains auto-assign to `main` deployments.
- Future agents should not repoint `institute.bmhgroupkc.com` after every deploy.

Sandra and Closer Lab were briefly inspected only because stale production-hardening worktrees were suspected. Do not act on these from BMH Institute unless Jarrad asks:

- Sandra lazy Twilio provider PR #218 was opened and verified green, then closed as stale because current Sandra docs identify the old lazy-load idea as a withdrawn workaround. The real E2E flake cause was shared Supabase test-project concurrency.
- Closer Lab `recording-transcript-checkpoint` looked stale and conflicted with current scoring expectations.

## Current product state

BMH Institute is ready for internal pilot.

Shipped areas include:

- Auth and invite acceptance.
- Admin user management.
- Programs, courses, modules, lessons, quizzes, assignments, and certificates.
- Production readiness checks.
- Internal pilot reports and CSV export.
- Guided walkthrough overlay inside BMH Institute.
- BMH native walkthrough steps.
- Embedded Closer Lab walkthrough support and role-play completion persistence.
- Admin reports that surface completed role plays.
- `MIGRATION-NOTES.md` for the upcoming BMH Platform monorepo migration.

Known deferred or parked items:

- GitHub issue #64 for the future reusable guided walkthrough system.
- Performance work PERF-01 through PERF-03 stays parked until documented thresholds are breached.
- Shared walkthrough package extraction should wait for the rule of three. Keep the current BMH Institute implementation app-local for now.

## Recommended next step

If Claude is taking over immediately, do this:

1. Read `AGENTS.md`.
2. Read `.planning/STATE.md`.
3. Run:

```bash
git status --short --branch
git worktree list --porcelain
gh pr list --author @me --state open
gh issue list --state open --limit 20
```

4. If the user asks what is next, say that BMH Institute has no unblocked repo work remaining and recommend either pilot launch support or issue #64 planning only if they want to move the walkthrough system toward another app.

Do not start a new feature unless Jarrad explicitly chooses it.

## Safe operating notes

- Work in a git worktree for any doc, code, config, or planning change.
- Keep using PR-first workflow.
- Codex and Claude-owned green PRs may be merged when checks pass and the scope is clear.
- Do not edit another app from this repo context unless Jarrad explicitly asks.
- Do not manually deploy or alias production for routine BMH Institute merges.
- Do not spend money, change providers, or add infrastructure without Jarrad approval.

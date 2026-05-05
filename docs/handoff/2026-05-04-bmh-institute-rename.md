# Handoff — BMH Institute exhaustive rename

Date: 2026-05-04
Session topic: Rename Sandra University → BMH Institute across the repo, plus start Telegram setup.

GSD state: `.planning/STATE.md` (last_updated 2026-05-04, Session Continuity entry references this file)
Backlog item: `.planning/ROADMAP.md` Phase 999.1 (now IN PROGRESS — in-repo step shipped, user-side mv pending)

## Current state

- Branch: `main`
- Working tree: clean re: tracked files (one commit ahead of pre-session HEAD)
- Untracked (ignore for rename, leave for owners):
  - `.claude/` — agent worktree state
  - `.planning/phases/02-content-safety-and-rate-limiting/02-1-sanitize-html-policy-PLAN.md` — Phase 2 work in progress
  - `.planning/phases/02-content-safety-and-rate-limiting/02-2-embed-iframe-sandbox-PLAN.md` — Phase 2 work in progress
  - `role-play-embed-contract.md` — separate Sandra Practice cross-origin contract
  - `sandra-practice-planning/` — separate Sandra Practice planning bundle (not this repo)
- Open PRs: none
- Deployed URL: `https://university.bmhgroup.com` (also `https://bmh-institute.vercel.app`)
- Local working dir at handoff time: `/Users/jarradhenry/Sites/Sandra University/` — about to be renamed to `/Users/jarradhenry/Sites/BMH Institute/` by the user

## What shipped this session

| Commit | Title | Effect |
|--------|-------|--------|
| `04deb69` | chore(rename): exhaustive Sandra University to BMH Institute sweep | 9 files updated; SMTP_FROM_NAME, prod URL fallbacks, slug refs, e2e-prod assertion, planning docs realigned. `npm run verify` green via husky. |

## Key infrastructure changes

- **e2e-prod test re-alignment**: `e2e-prod/dashboard.spec.ts:17` was asserting `/sandra university/i` but the deployed UI source (`src/app/(dashboard)/layout.tsx:44`) already says "BMH Institute". The test had been silently misaligned with the live UI; it now matches.
- **`.vercel/project.json` updated locally** from `projectName: "sandra-university"` → `"bmh-institute"`. File is gitignored so this is a per-developer fix. The Vercel project upstream is already on `bmh-institute` (renamed 2026-04-30 per memory).
- **No code changes in `src/`** — the planning doc `CONCERNS.md` reference to `sandra-university.vercel.app` fallbacks in source code is stale; those fallbacks no longer exist in src/. The doc was updated to reference `bmh-institute.vercel.app` for consistency.
- **No DB migration**, no new schema, no new env vars.

### Files updated by the rename commit

- `.env.example` — header comment, prod project comment, `SMTP_FROM_NAME`, `E2E_PROD_BASE_URL` example
- `AGENTS.md` — dropped "the working directory may still say `Sandra University/`" caveat (line 11)
- `e2e-prod/dashboard.spec.ts` — assertion regex
- `.planning/codebase/ARCHITECTURE.md` — Supabase project name in diagram
- `.planning/codebase/CONCERNS.md` — fallback URL refs (planning doc only; src/ already clean)
- `.planning/codebase/INTEGRATIONS.md` — production URL, `SMTP_FROM_NAME` default
- `.planning/codebase/STACK.md` — Vercel + Supabase project names
- `.planning/codebase/STRUCTURE.md` — directory tree label, migrations purpose line
- `.planning/phases/01.1-testing-coverage-parity/01.1-PATTERNS.md` — absolute paths

### Files deliberately NOT touched

- `README.md`, `AGENTS.md` line 57, `.planning/PROJECT.md` line 5, `AGENTS.md` line 137 — historical "Renamed from Sandra University on 2026-04-30" notes preserved as audit trail
- `.planning/ROADMAP.md` lines 94–104 — the Phase 999.1 BACKLOG playbook for this rename; left as the user's manual checklist
- `.planning/phases/01.1-testing-coverage-parity/01.1-2-playwright-e2e-harness-PLAN.md` line 505 and `01.1-3-harden-uat-replacement-PLAN.md` line 724 — historical Out-of-Scope deferral notes from past phases (audit record)
- `sandra-practice-planning/`, `bmh-training-platform-spec.md`, `.planning/STATE.md`, `src/lib/supabase/middleware.ts:44` — refs are to Sandra CRM / Sandra Practice / Sandra Design System (separate projects)

## Memory updates

None this session. Existing memories that are still authoritative for this work:
- `project_bmh_institute_identity.md` — confirms this repo is the LMS, not Sandra Practice
- `project_bmh_training_platform.md` — stack and hierarchy
- `feedback_flag_scope_drift.md` — surface mismatch when voice/role-play work appears here
- `feedback_writing_style.md` — no em dashes, "BMH Group" not "BMH Group KC"

## What's in flight

**1. Manual folder + memory dir rename (the reason for this handoff).** User must run after exiting Claude:

```
mv ~/Sites/"Sandra University" ~/Sites/"BMH Institute"
mv ~/.claude/projects/-Users-jarradhenry-Sites-Sandra-University \
   ~/.claude/projects/-Users-jarradhenry-Sites-BMH-Institute
```

Then reopen Claude Code in `~/Sites/BMH Institute/`. Auto-memory continues uninterrupted because the `.claude/projects/` dir was also moved.

**2. Telegram bot setup.** No token configured yet. User needs to:
1. Message `@BotFather` in Telegram, send `/newbot`
2. Take the returned token (`123456789:AAH...`)
3. In the new tab, run `/telegram:configure 123456789:AAH...`

**3. Phase 02 (Content Safety and Rate Limiting) is the next planned work.** Two PLAN.md files exist as untracked drafts in `.planning/phases/02-content-safety-and-rate-limiting/`. Pre-existing planning state — not part of this session.

## Known not-done

- `.env.local` (gitignored, not visible to Claude) may still contain `SMTP_FROM_NAME=Sandra University` or `E2E_PROD_BASE_URL=https://sandra-university.vercel.app`. User to update manually if so.
- ROADMAP.md `Phase 999.1` backlog steps are NOT marked complete — the user will mark them after running the mv commands and confirming nothing is broken.
- `~/.zshrc` and `~/.zsh_aliases` already verified clean (no Sandra references). No sweep needed.
- VS Code workspace files: none in this folder, but global Recents may still point at the old path. User to clean as needed.

## Test credentials

None encountered or modified this session.

## Verification scripts

After reopening Claude Code in the new path:

```bash
# In ~/Sites/BMH Institute/
npm run verify                    # typecheck + unit + RTL — should be green
git log --oneline -3              # confirm 04deb69 is HEAD-2 or earlier
cat .vercel/project.json          # should show projectName: "bmh-institute"
grep -rn "Sandra University" --include="*.md" --include="*.ts" .planning/ AGENTS.md README.md \
  | grep -v "Renamed from"        # should return only the ROADMAP backlog + historical Out-of-Scope notes
```

To re-verify the prod e2e suite after the rename (requires `.env.test.local` populated):

```bash
npm run test:e2e:prod
```

## Critical learnings

- **The deployed UI source was already on "BMH Institute" before this session.** The Vercel and Supabase project renames happened 2026-04-30 (per memory). The e2e-prod test was the only thing still asserting the old name. So this session's work was: drag the test file + planning docs + env example into alignment with what was already live.
- **`.vercel/project.json` is gitignored.** Local edits to it stay local. The `projectId` (`prj_dqTvXS2iRS4GyuWuGRiLoMdHhu6m`) is the canonical link, not `projectName`. The fix is purely cosmetic / for `vercel pull` consistency.
- **Sandra ≠ Sandra everywhere.** `Sandra University` (this repo, now BMH Institute) is one of four "Sandra" things in the user's working set. The others — Sandra CRM (`~/Sites/Sandra/`), Sandra Practice (planned standalone, currently parked at `sandra-practice-planning/`), Sandra Design System (`~/Sites/Sandra Design System/`) — must NOT be renamed by reference sweeps.
- **Historical "Renamed from X" notes were kept on purpose.** Per the user's stance ("exhaustive rename" means rename forward-looking identity, not erase history), README.md, AGENTS.md, and PROJECT.md retain the dated rename note as audit trail. Same for the Phase 01.1 Out-of-Scope deferral notes that documented why those strings were left for "a separate cleanup" — that separate cleanup IS this session.
- **Husky pre-commit ran the full `npm run verify` chain** (typecheck + 117 unit tests + 1 RTL test) and gated the commit successfully. Confirms the rename was string-only, no behavior change.

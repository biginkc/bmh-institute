# BMH Institute seven-video import convergence ledger

## Goal

Attach the seven checksum-approved video/caption/transcript sets to production and prove all 29 production video blocks are complete without publishing the course or changing unrelated data.

## Plan source and authority

- Plan source: user EXECUTE block attached to Codex task on 2026-07-21.
- Authority profile: production-aware with explicit scoped production-write, git, PR, merge, and ordinary auto-deploy approval.
- Baseline ref: `origin/main` / `1eb980a53d12865741e9490051552e283c86439f`.
- Execution branch/worktree: `claude/upload-4-held-lessons` at `/Users/jarradhenry/Sites/BMH apps/_claude_worktrees/institute-upload-4-held-lessons`.
- Exclusions: no rollback, publication, billing, secret disclosure, unrelated storage/database mutation, or approval of different hashes.

## Acceptance gates

- [x] Clean branch is current with `origin/main` before edits.
- [x] Production baseline independently queried for all video content blocks.
- [ ] Seven local source hashes and approved derivatives match the authorization exactly.
- [ ] Only the seven authorized policy-map tuples and approval records change; the two unapproved map entries remain.
- [ ] Canonical manifest build and semantic/content validation pass.
- [ ] Every mutating import step has a reviewed dry-run/equivalent exact comparison.
- [ ] Production upload/apply/verify passes with no unrelated drift and publication forced off.
- [ ] Independent database and storage verification proves 29/29 file, caption, and transcript paths.
- [ ] Manual review is clean after all code/data-file changes.
- [ ] Scoped PR is merged from a recorded rollback SHA with checks clean.

## Transport and tool preflight

- Claude desktop app: process reachable, but an unrelated active Claude Code session is running; it must not be overwritten.
- Standalone `claude` CLI: absent from `PATH`.
- Embedded Claude runtime: present only as part of the active desktop session; not used as an unverified CLI substitute.
- Browser: Google Chrome process is available for final visible proof if needed.
- Provider tooling: `op`, `gh`, and `supabase` are callable.
- Credentials: production Supabase secret is readable through the approved 1Password service-account path; values were not logged.

## Production baseline

Direct service-role query against project `dhvfsyteqsxagokoerrx` returned exactly 29 video content blocks:

- file paths: 22 present / 7 missing
- caption paths: 22 present / 7 missing
- transcript paths: 22 present / 7 missing
- missing blocks are exactly Career Growth Path, Closing and Deal Engineering, Compensation Engine, Objection Scripts Playbook, Operator Playbook, and the two Welcome and Mindset video blocks.

No production write had occurred when this baseline was recorded.

## Iterations

### Iteration 0 — preflight and baseline

- Evidence delta: yes; clean current branch and true 22/29 production baseline established.
- Claude verdict: pending. Desktop surface is occupied by unrelated work and standalone CLI is unavailable; no Claude review is being claimed yet.
- Codex adversarial result: continue with checksum/manifest verification because it is read-only, plan-aligned, and independently testable.

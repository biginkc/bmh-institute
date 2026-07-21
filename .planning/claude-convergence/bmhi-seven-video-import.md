# BMH Institute seven-video import convergence ledger

## Goal

Attach the seven checksum-approved videos with accessibility captions to production, remove learner-facing transcripts from this course, and prove all 29 production video blocks are complete without publishing the course or changing unrelated data.

## Plan source and authority

- Plan source: user EXECUTE block attached to Codex task on 2026-07-21.
- Authority profile: production-aware with explicit scoped production-write, git, PR, merge, and ordinary auto-deploy approval.
- Baseline ref: `origin/main` / `1eb980a53d12865741e9490051552e283c86439f`.
- Execution branch/worktree: `claude/upload-4-held-lessons` at `/Users/jarradhenry/Sites/BMH apps/_claude_worktrees/institute-upload-4-held-lessons`.
- Exclusions: no rollback, publication, billing, secret disclosure, unrelated storage/database mutation, or approval of different hashes.

## Acceptance gates

- [x] Clean branch is current with `origin/main` before edits.
- [x] Production baseline independently queried for all video content blocks.
- [x] Seven local source hashes and approved caption derivatives match the authorization exactly.
- [x] Only the seven authorized policy-map tuples and approval records change; the two unapproved map entries remain.
- [x] Canonical manifest build and semantic/content validation pass.
- [x] Every mutating import step has a reviewed dry-run/equivalent exact comparison.
- [ ] Production upload/apply/verify passes with no unrelated drift and publication forced off.
- [ ] Independent database and storage verification proves 29/29 file paths, 29/29 caption paths, and 0/29 transcript paths.
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
- transcript paths: 22 present / 7 missing (all 22 are now intentionally scheduled for removal from learner-facing course data)
- missing blocks are exactly Career Growth Path, Closing and Deal Engineering, Compensation Engine, Objection Scripts Playbook, Operator Playbook, and the two Welcome and Mindset video blocks.

No production write had occurred when this baseline was recorded.

## Iterations

### Iteration 0 — preflight and baseline

- Evidence delta: yes; clean current branch and true 22/29 production baseline established.
- Claude verdict: pending. Desktop surface is occupied by unrelated work and standalone CLI is unavailable; no Claude review is being claimed yet.
- Codex adversarial result: continue with checksum/manifest verification because it is read-only, plan-aligned, and independently testable.

### Iteration 1 — exact approvals and learner accessibility scope

- Evidence delta: yes; the seven approved video hashes and their seven caption hashes are checksum-bound to committed review evidence.
- Scope correction: Jarrad explicitly stopped transcription work and retained closed captions for accessibility. The canonical manifests now contain 29 videos, 29 captions, and no learner-facing transcript assets or references.
- Validation: all 164 course-content JavaScript checks, five caption-generator checks, two guide semantic checks, and the deterministic 19-guide rebuild check pass.
- Codex adversarial result: the prior release schema incorrectly required transcripts. That requirement was removed while the video, poster, and caption requirements remain enforced; focused schema and unrelated-approval integrity tests pass.

### Iteration 2 — adversarial manual review and reproducibility fixes

- Three independent read-only review lanes covered the release contract, import plan, manifests/evidence, accessibility captions, test strength, and operational safety.
- Valid findings fixed: seven new VTT files are tracked; the seven new internal transcript files are not required; Operator captions now say “Liens” and “110 to 150”; current caption evidence is attributed to automated caption QA rather than claiming Jarrad proofread the text; BMH-specific QA rejects transcript assets, keys, and paths; and the atomic apply contract locks full JSON replacement.
- Re-review verdict: no findings in all three lanes. Browser playback remains the final visible-proof step after production import.
- Verification: 166/166 course-content checks, 926/926 repository tests, 126/126 component tests, caption generator checks, guide semantic checks, and deterministic guide rebuild all pass.
- Source inventory: 125/125 approved assets match manifest bytes across the worktree and canonical media library. The sole blocker is the pre-existing missing Slot 16 guide, retained as an unpublished-review placeholder and unrelated to the seven video/caption imports.

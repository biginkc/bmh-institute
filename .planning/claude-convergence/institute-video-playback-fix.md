# Institute video playback fix convergence ledger

## Goal

Fix the production learner playback reset without weakening signed media delivery or progress durability. Carry the change through TDD, focused PR, manual review, Claude review, preview Chrome proof, merge, deployment, and production Chrome proof on Lessons 2 and 3.

## Plan source and alignment

- Plan source: user Goal objective in `pasted-text-1.txt` plus the repo TDD and PR-first rules.
- Alignment: restores the core learner happy path and directly supports the internal pilot milestone.
- Exclusions: no media replacement, codec changes, URL TTL reduction, unrelated poster work, or changes to open PR #114.

## Baseline

- Branch: `codex/institute-video-playback-fix`
- Baseline: `origin/main` at `1e42dd779ac0409fcce811bdcb87452f4cec29a4`
- Authority profile: production-aware under repo standing merge authority. Vercel Git flow only for release.

## Acceptance gates

- [ ] Routine incomplete progress saves do not revalidate or refresh the playing lesson.
- [ ] The signed video source remains stable through at least three progress checkpoints.
- [ ] Progress serialization, retry, resume, seek, pause, unmount, and watched coverage behavior remain correct.
- [ ] Completion updates without interrupting playback and any lesson refresh is deferred until playback ends.
- [ ] Dashboard invalidation occurs at most once on the actual completion transition.
- [ ] Sandra completion delivery remains intact.
- [ ] Focused tests, `npm run verify`, `npm run test:integration`, relevant Playwright, and `npm run build` pass or have an evidence-backed environment-only classification.
- [ ] Manual review and Claude review have no unresolved valid findings at the current head.
- [ ] Preview Chrome proves normal Play across multiple checkpoints and completion behavior.
- [ ] Focused PR is green, mergeable, and contains only reviewed playback changes.
- [ ] Production deploy matches merged head and Chrome proves Lessons 2 and 3 through normal Play.

## Tool preflight

- GitHub CLI: available and authenticated.
- Vercel CLI: available. Git-connected deploy flow is the required release path.
- Chrome: installed and running. Shared GUI use requires the orange-border handoff protocol.
- Claude desktop: running. Desktop control will be used only after checking the active session and following the orange-border protocol.
- Claude CLI: not available on PATH. The desktop app contains a bundled Claude Code runtime, but it is not the primary transport.
- Open PR #114: unrelated poster work. It is mergeable but its Seeded Playwright E2E check is failing. No player or progress files overlap.

## Iterations

### Iteration 0

- Status: isolated clean worktree created from the verified production baseline.
- Evidence delta: production root cause and media integrity findings were refreshed before implementation.
- Next: GSD debug session writes failing regression tests and implements the smallest correct fix.

### Iteration 1

- Status: GREEN implementation and local verification complete.
- Evidence delta: all progress-action route revalidation is removed, completion refresh is deferred until media `ended`, the full local verification suite and production build pass, and a seeded signed-media Playwright regression now covers three progress-save checkpoints.
- Environment classification: the integration and new seeded browser suites require the dedicated test Supabase credentials. Those credentials are not present on this host and the suites fail closed before running; GitHub CI supplies the required secrets and is the authoritative execution gate.
- Next: commit and open the focused PR, require CI, complete manual and Claude review, then prove the preview in real Chrome.

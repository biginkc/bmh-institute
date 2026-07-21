# Claude convergence ledger: BMH Institute lesson load performance

## Loop definition

- Goal ID: `bmhi-lesson-load-performance`
- Goal: obtain adversarial Claude approval of the measured lesson-load remediation plan.
- Plan source: `docs/performance/lesson-load-remediation-plan.md`
- Baseline ref: `origin/main` at `1eb980a53d12865741e9490051552e283c86439f`
- Authority profile: planning and read-only verification only. No implementation, migration, push, PR, merge, deployment, or production mutation.
- Claude surface: Claude desktop/app Code surface preferred. Prompt-only fallback if safe desktop control remains unavailable. Claude CLI is unavailable.
- Iteration budget: 10.

## Acceptance gates

- Claude independently challenges the evidence, security boundaries, sequence, tests, budgets, and rollback.
- Every valid plan-level finding is incorporated or explicitly rejected with evidence.
- Claude returns `DONE` with high confidence on the revised plan.
- Codex confirms that Claude reviewed the exact current plan artifact rather than a summary.

## Transport and tool preflight

- Claude desktop app: running and visible on macOS.
- Direct Codex app control tool for Claude: unavailable in this runtime.
- Safe GUI fallback: macOS accessibility automation is potentially available but must use the permanent orange-border protocol and visually verify the exact Claude task and draft before sending.
- Claude CLI: not installed on PATH. Claude's bundled 2.1.215 client was discovered after the desktop subtask stalled. `auth status` reported a logged-in Claude account, but a real print-mode prompt failed with `401 OAuth access token has expired`, so it is not a viable fallback.
- Chrome DevTools: available and already used for production evidence. No further browser proof is required for plan approval.
- Repo/provider CLIs: not required for this planning-only loop.
- Secrets/PII: none included in the plan or state packet.

## Plan alignment

- Supports the four-app v1 goal by removing an unacceptable BMH Institute learner-path delay.
- Preserves the existing Browser V1 requirement for final implementation acceptance.
- Preserves the repository's TDD, worktree, PR-first, manual-review, and Claude A5 requirements.
- Current loop intentionally stops at plan approval. Implementation and release are excluded.

## Evidence before iteration 1

- Chrome production median document TTFB: 3,955 ms across three clean reload traces.
- HTML completion after TTFB: 4 to 10 ms. FCP after document completion: 49 to 102 ms.
- Vercel exact-route max TTFB: 4,578 ms. p95/max duration: 4,591 ms. Cold starts: 0.49 percent over 24 hours.
- Authenticated full course tree: 3,010.16 ms and 84,812 buffer hits.
- Same tree without repeated row authorization: 4.30 ms and 93 buffer hits.
- Authenticated lesson states: 754.66 ms and 29,608 buffer hits.
- Diagnostic lesson states: 24.11 ms and 1,499 buffer hits.
- Authenticated lightweight outline plus current blocks: 244.43 ms, a 92 percent reduction from the dominant query.
- Tables are small and indexed. Dominant statements show zero disk reads.
- Code inspection confirms full-tree loading, duplicate authenticated calls, eager search, non-selected media signing, and dynamic no-store prefetch amplification.

## Iterations

### Iteration 1

- Status: exact plan reviewed in Claude desktop task `BMH Institute lesson load performance plan review`.
- Evidence delta: durable plan and conservative acceptance gates created from the measured diagnosis.
- Claude verdict: `NEXT_STEP`, confidence high.
- Claude reasoning: evidence, sequence, budgets, and quiz-key isolation survived challenge. The Step 5 security-definer contract preserved a weaker course/lesson quarantine boundary than the per-entity RLS behavior it would replace. Step 6 lacked cache invalidation and learner/reviewer boundary tests.
- Proposed action accepted: require set-wise import release and quarantine filtering for every returned entity, add a mixed-release TEST fixture, add cache mutation invalidation and cross-persona isolation tests, and add timing/log redaction coverage.
- Codex evaluation: accepted. The findings tighten existing security gates, stay within planning scope, are concrete and testable, cross no hard gate, and are not repetitions of a failed action.
- Desktop transport note: Claude requested broad macOS access to other-app data while verifying the worktree path. Codex denied it because the full exact plan was already present in the packet. Claude still confirmed the committed artifact matched the packet verbatim and completed the review.

### Iteration 2

- Status: plan revisions applied. Ready for exact revised-artifact review.
- Evidence delta: yes. Per-entity mixed-release filtering, cache invalidation, persona isolation, and telemetry redaction tests are now explicit.
- Claude verdict: pending.
- Codex evaluation: pending.

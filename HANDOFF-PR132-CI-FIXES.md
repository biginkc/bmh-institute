# Handoff: fix remaining CI failures on PR #132 (oral-check 9-lesson rollout)

Written 2026-07-29 for a fresh-context session. Read this instead of the full transcript.

## State — verify before trusting, but true at write time

- **Production (dhvfsyteqsxagokoerrx) is correct and live.** All 12 "Talk with Andrea" oral-check blocks (3 pilot + 9 new) are inserted, verified, and content-corrected. **Do not touch production again for this task** — everything below is CI/repo-only, fixing test files and committed fixtures to reflect the manifest change that's already correctly applied.
- **Worktree**: `/Users/jarradhenry/Sites/BMH apps/_claude_worktrees/institute-oral-check-expansion`, branch `claude/oral-check-expansion-blocks`.
- **PR**: https://github.com/biginkc/bmh-institute/pull/132 — migrations validate clean on PG 15/16/17. The `Verify` job (typecheck + unit + course-content tests) is failing on 11 pre-existing "locked snapshot" tests that hardcode the manifest's structure/counts. This is expected, by-design guardrail behavior against accidental drift — not a sign anything is broken. They need deliberate updates to reflect the new 18-role-play-block manifest shape (was 9: 6 sales certification + 3 pilot; now 18: 6 + 3 + 9 new).
- Also merged and unrelated: Closer Lab PR #156 (ringtone fix) — done, ignore.

## What actually changed in this PR

3 files: 3 SQL migrations (already applied to prod) + `content/course-manifests/bmh-employee-training.v1.json` gained 9 new `role_play` blocks (source keys `block-oral-check-slot-{01,03,04,06,12,14,15,17,19}`), one appended to each of 9 lessons' `blocks` array, `required: true`, same shape as the 3 existing pilot oral-check blocks (`content.mode: "oral_check"`).

## The 11 failing tests — exact file:line and root cause

Run to see current state: `npm run test:course-content` (this is what CI's `Verify` job runs). Full log: `gh run view <run-id> --repo biginkc/bmh-institute --log-failed` (find latest run via `gh pr checks 132 --repo biginkc/bmh-institute`).

1. **`content/course-manifests/bmh-employee-training.qa.test.mjs:20`** — "the draft contains the locked course structure". Hardcoded structural counts (`assignmentLessons: 6, contentLessons: 19, flashcards: 152, ...` — read the full expected object) need updating to the new manifest's real counts (deep-equal diff will show you exactly what changed).

2. **`content/course-manifests/bmh-employee-training.qa.test.mjs:198`** (assertion at line 231) — `assert.ok(rolePlayBlocks.length === 9, "sanity: fixture still has nine role-play blocks...")`. Bump to `18` and update the message to describe 6 sales + 12 oral-check (3 pilot + 9 expansion).

3. **`content/course-manifests/bmh-employee-training.qa.test.mjs:270`** — "the manifest passes structural and semantic content QA". Errors are `'Expected 9 rolePlays, found 18'` plus, for **every one of the 9 new source_keys**, `'block-oral-check-slot-NN maps to unknown assignment oral-check-slot-NN'`. Root cause: **`scripts/course-content/validate-manifest.mjs`** has a `const ORAL_CHECK_PILOT_BLOCK_SOURCE_KEYS = new Set(["block-oral-check-slot-02", "block-oral-check-slot-05", "block-oral-check-slot-16"])` (around line 374) that exempts only the 3 pilot blocks from the "must reference a real assignment" check. **Add the 9 new source_keys to this set** (rename the constant if you like, e.g. drop "PILOT" — it's a `bmh-institute-oral-checks-v1` namespace-wide exemption, not pilot-specific). This one fix likely also resolves tests 4 and 5 below, which show the identical error list.

4. **`content/course-manifests/bmh-import-semantic-gate.qa.test.mjs:15`** — same `'Expected 9 rolePlays, found 18'` + unknown-assignment cascade. Should resolve once #3 is fixed and any hardcoded `9` counts in this file (search for the literal `9` near role-play assertions) are bumped to `18`.

5. **`content/course-manifests/bmh-import-semantic-gate.qa.test.mjs:66` and `:86`** — same cascade, prefixed `"full-source semantic QA: ..."`. Same fix as #3/#4.

6. **`content/course-manifests/bmh-exhaustive-quiz-release.qa.test.mjs:209`** — "the committed database rehearsal evidence matches the current generated SQL". A SHA256 comparison (`actual ffd119e4... !== expected 5471e7e7...`) against a **committed evidence artifact**. Find the generator (likely `scripts/course-content/build-released-quiz-revision-rehearsal-sql.ts` or a sibling script — grep for the expected hash `5471e7e7100d32aaa13888cd02f2cbe7167ef4165250f2f83a418d715614d46c` to find where it's pinned) and **regenerate the artifact, don't hand-edit the hash**.

7. **`content/course-manifests/bmh-operating-stack-confirmation.qa.test.mjs:24`** — "current confirmation covers the full and canary DialPad references", expected `22`, actual `24`. Something counts DialPad text-mentions across the manifest; the 9 new blocks likely added 2 legitimate new mentions (check the Tech Stack lesson's new oral-check block, which discusses DialPad). Verify the 2 new matches are legitimate (not a false positive) before bumping `22` → `24`.

8. **`content/course-manifests/bmh-tech-stack-canary.qa.test.mjs:10`** — "the canary is an exact isolated Tech Stack content and quiz slice". The Tech Stack lesson (`block-oral-check-slot-03`) is one of the 9 new blocks. There's a separate canary manifest (`content/course-manifests/bmh-employee-training-canary.v1.json`) that isolates just this lesson — it likely needs the same new oral-check block appended, mirroring what was done to the main manifest, OR the test's expected asset list needs updating. Read the full diff (`assets: [...]`) to see exactly what's expected vs actual.

9. **`content/course-manifests/closer-lab-production-mapping.qa.test.mjs:222`** — "finalization against the real current 9-role-play manifest processes exactly the six certification entries and leaves the three oral-check blocks untouched". Hardcoded `expected: 9, actual: 18` plus a message literally saying "9 role_play blocks (6 certification + 3 oral-check), not a hand-crafted 6". Update the hardcoded `9` → `18` and the test name/comment to reflect 6 certification + 12 oral-check (3 pilot + 9 expansion). Check the surrounding logic still correctly separates "6 certification entries" from "the oral-check blocks" now that there are 12 of the latter, not 3.

10. **`content/course-manifests/closer-lab-production-mapping.qa.test.mjs:417`** — "the real tracked manifest, ledger, reconciliation, and attestation are exactly cross-bound". Error: `'Closer Lab production reconciliation evidence does not match the current manifest bytes.'` Another **committed evidence artifact** (a reconciliation/ledger file) needs regenerating against the updated manifest — find its generator script rather than hand-editing.

## How to approach it

1. Start with #3 (the `ORAL_CHECK_PILOT_BLOCK_SOURCE_KEYS` set) — it's a one-line-ish fix and likely cascades to resolve #3/#4/#5 together.
2. Then #2 (bump `9` → `18` in the sanity assertion).
3. Then #1, #9 (hardcoded structural counts) — read each test's full expected-vs-actual diff (`npm run test:course-content` locally shows it) rather than guessing numbers.
4. Then #6, #10 (regenerate committed evidence artifacts via their real generator scripts — grep the expected hash/string to find which script produces it; **do not hand-edit a hash to make a test pass**, that defeats the point of the check).
5. Then #7 (verify the DialPad count bump is legitimate, not a false-positive match).
6. Then #8 (canary manifest/test).
7. Run `npm run test:course-content` locally until green, then `npm run verify` for the full typecheck+unit+RTL suite, then push to `claude/oral-check-expansion-blocks` and let PR #132's CI re-run.
8. Merge PR #132 once fully green (per this repo's standing PR-first policy — no need to ask permission first).

## Key facts for quick reference

- Import ID: `bmh-employee-training-v1`. Institute prod: `dhvfsyteqsxagokoerrx`. Closer Lab prod: `xqrkugdxpwhjscrheuqo`.
- The 9 new lesson_id → scenario_id → block_id mappings are in `supabase/migrations/20260729060000_insert_oral_check_expansion_role_play_blocks.sql` (already applied, immutable history — don't edit it).
- The fail_conditions min-length fix (3 lessons needed 3+ items, not 1-2) is already applied both to the manifest and to production, via `supabase/migrations/20260729062000_...sql` — that part is done, not part of this remaining work.

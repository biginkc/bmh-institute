# Embed completion origin repair

- Goal ID: `embed-completion-origin`
- Goal: make an Institute-embedded Closer role play save, score, verify, and unlock the following quiz in production.
- Plan source: the user-approved embed audio/transcription plan plus the production failure observed on 2026-07-27.
- Baseline: Institute `ef81c2e`; Closer `edfb3177a61fb173964437f031b8d1b384d60705`.
- Authority: production configuration write and redeploy explicitly approved by Jarrad on 2026-07-27.
- Claude surface: Claude desktop first; authenticated CLI fallback is available.

## Acceptance gates

- [ ] Institute production `NEXT_PUBLIC_ROLE_PLAY_BASE_URL` is `https://lab.bmhgroupkc.com`.
- [ ] The custom Closer domain serves deployment `0ae2e5b6-38d8-4439-8bad-94a81f8ad392` / SHA `edfb3177a61fb173964437f031b8d1b384d60705`.
- [ ] Focused completion-token, role-play event, role-play block, and iframe-permission tests pass.
- [ ] Typecheck/build and diff checks pass or inherited failures are isolated.
- [ ] Codex manual review is clean after all valid findings are fixed.
- [ ] Claude returns `DONE` with high confidence.
- [ ] Institute production redeploy is healthy and serves the reviewed main SHA.
- [ ] After a hard reload, real Chrome proves the iframe origin is exactly
  `https://lab.bmhgroupkc.com` and is not a Railway origin.
- [ ] Real Chrome proves a fresh role play scores, the parent reports
  `Completed`, the completion warning is absent, and the quiz unlocks.
- [ ] After another hard reload, completion and quiz availability persist, and
  the Quiz can be opened.
- [ ] Browser console and request-status inspection show no blocking failure;
  token bodies and credentials are never captured.

## Preflight

- Fresh detached Institute worktree created from current `origin/main`.
- Claude desktop is running; Claude CLI is installed and authenticated as fallback.
- Chrome extension control, Vercel CLI, GitHub CLI, and Railway CLI are available.
- Vercel CLI is authenticated to the Institute project.
- The vault's standing authorization permits a reviewed, forward-only
  production migration. Billing changes, secret disclosure, and uncontrolled
  provider use remain hard pauses.
- The current runtime exposes no controllable Claude-desktop automation surface;
  use the authenticated Claude CLI fallback for deterministic review capture
  without disturbing unrelated desktop sessions.

## Production evidence before repair

- Fresh embed attempt `7906e85b-d3d8-4fb8-b395-67e4fc7e6cbe` ran for 124 seconds, ended, reached `score_status=ready`, scored 65, and issued an embed review capability.
- All five embed requests returned HTTP 200; the final scoring request completed in about 17 seconds.
- Institute displayed the completed rubric but rejected the completion proof and left the quiz locked.
- The iframe used Closer's Railway origin while Closer minted the optional review URL using `https://lab.bmhgroupkc.com`.
- Institute intentionally rejects completion proofs whose review URL origin differs from `NEXT_PUBLIC_ROLE_PLAY_BASE_URL`.

## Iterations

### Iteration 1

- Vercel accepted `NEXT_PUBLIC_ROLE_PLAY_BASE_URL=https://lab.bmhgroupkc.com`
  for the Institute production environment. No redeploy has run yet.
- Custom Closer domain health: HTTP 200, deployment
  `0ae2e5b6-38d8-4439-8bad-94a81f8ad392`, Git SHA
  `edfb3177a61fb173964437f031b8d1b384d60705`, provider ready.
- Focused Node contract suite: 70/70.
- Focused role-play RTL suite: 15/15.
- Full `npm run verify`: 183 Node files / 1,114 tests and 39 RTL files /
  154 tests passed.
- Typecheck, focused ESLint, and `git diff --check`: passed.
- Production build with the corrected public URL and non-production placeholder
  signing keys: passed.
- These automated checks are supporting evidence only. The repository cross-app
  Playwright suite is conditional on a configured Closer test environment and
  does not currently prove production quiz unlock or post-reload persistence.
- Next gate: exhaustive manual review of the configuration/contract surface.

### Iteration 2

- The corrected Closer origin was deployed and a fresh real-Chrome session
  proved iframe audio, transcription, scoring, and signed completion delivery.
  The parent still displayed `Role play completion could not be verified.`
- Production read-only evidence isolated a second failure: the active owner
  could view and run the released role play, but
  `fn_complete_role_play_block` allowed only an active learner or an explicit
  imported-content reviewer. The released catalog access helper already
  authorizes active owners and administrators to the same block.
- The forward migration preserves service-role-only execution, block/scenario
  binding, lesson unlock, replay idempotency, and atomic progress creation. It
  changes only the actor predicate: active learners remain allowed; active
  owners/admins are allowed only when
  `private.fn_user_may_access_catalog_entity_v1` authorizes that exact content
  block.
- Unreleased imported content remains reviewer-only. A real hosted-test
  integration proves an ungranted owner and admin are denied before release,
  an explicitly granted owner reviewer succeeds before release, and both an
  owner and admin succeed inside the released state.
- The migration was applied only to the canonical test project
  `jvaabkchkihkjllehmft`. Its migration history records
  `20260727144500:allow_authorized_admin_role_play_completion:5`.
- Hosted-test role-play integration: 1/1 passed, including learner replay and
  concurrency, suspended learner denial, active owner success, and suspended
  owner denial.
- Hosted-test import lifecycle integration: 1/1 selected test passed (10
  unrelated tests skipped), including exact cleanup.
- Full `npm run verify`: 184 Node files / 1,117 tests and 39 RTL files / 154
  tests passed.
- Typecheck, focused ESLint, `git diff --check`, and changed-file Fallow audit
  passed. Fallow attributed zero new dead-code, complexity, or duplication
  findings.
- Production has not received the migration yet. The release gate requires a
  final manual re-review, Claude high-confidence approval, a reviewed commit
  and PR, successful CI, and an atomic production migration-history write.

## Reviewed release sequence

- Current rollback point:
  `dpl_3a8XWxK8x9p3evDDqnvnwT9YxUK8`
  (`sandra-university-pv31sqtu2-jarrad-5416s-projects.vercel.app`).
- Previous production role-play base URL:
  `https://web-production-a302.up.railway.app`.
- After manual review and Claude high-confidence approval:
  1. Run `git fetch origin main`, require `HEAD == origin/main`, and record the
     exact source SHA. If main advanced, rebuild, rerun verification, and repeat
     review before deploying.
  2. Link the verified detached worktree to Vercel project
     `sandra-university` with
     `vercel link --yes --project sandra-university --scope jarrad-5416s-projects`.
  3. Create a production-environment deployment without moving domains:
     `vercel deploy --prod --skip-domain --scope jarrad-5416s-projects --yes`;
     this fresh build is where Vercel applies the newly staged production
     environment value.
  4. Record the staged deployment URL/ID and source SHA, then inspect that exact
     URL with
     `vercel inspect <staged-url> --scope jarrad-5416s-projects` and require
     Vercel `READY`.
  5. Promote that exact captured staged URL with
     `vercel promote <staged-url> --scope jarrad-5416s-projects --yes`.
  6. Verify `institute.bmhgroupkc.com` points to that deployment.
  7. Hard reload the lesson and require the real iframe origin to be exactly
     `https://lab.bmhgroupkc.com` before starting another provider session.
  8. Run a fresh real-Chrome Institute to Closer role play and require the
     parent to report `Completed`, no completion-verification alert, and the
     Quiz to unlock.
  9. Hard reload again, require completion and Quiz availability to persist,
     open the Quiz, and inspect console/request status for blocking failures
     without capturing token bodies.
- If promotion or acceptance fails, rollback the production domains to
  `dpl_3a8XWxK8x9p3evDDqnvnwT9YxUK8` with
  `vercel rollback dpl_3a8XWxK8x9p3evDDqnvnwT9YxUK8 --scope jarrad-5416s-projects --yes`.
  That restores the previous deployment and its previous environment snapshot,
  so it restores service but also restores the known completion-origin defect.
- Rollback triggers: the promoted iframe does not load or reach `rp.ready`; its
  origin is not exactly `https://lab.bmhgroupkc.com`; scoring or the completion
  handshake fails; the Quiz remains locked; or a blocking console/request
  failure appears.
- If the rollback must persist beyond the immediate alias restoration, restore
  the previous public value with
  `vercel env update NEXT_PUBLIC_ROLE_PLAY_BASE_URL production --project sandra-university --scope jarrad-5416s-projects --value https://web-production-a302.up.railway.app --yes`.
  Then verify `institute.bmhgroupkc.com` still points to the recorded rollback
  deployment and, after a hard reload, serves the previous Railway iframe.

### Database rollback for Iteration 2

- A Vercel rollback does not undo the database function replacement.
- If the new authorization predicate causes a production regression, create
  and apply a new forward migration that restores the previous function body
  and accompanying grants/comment from
  `supabase/migrations/040_private_import_review_evidence.sql` (lines 535-667).
  Do not edit or delete migration history; the older atomic-completion
  migration predates explicit unreleased-owner-reviewer support and is not a
  safe rollback source.
- Before applying production SQL, require the new version to be absent and the
  current function to match the old predicate. Apply the function replacement
  and migration-history row in one transaction, then read back the recorded
  version and the safe authorization predicate.
- Production acceptance after the migration is a fresh owner role play:
  visible `Completed`, no verification warning, next Quiz unlocked, hard-reload
  persistence, Quiz openable, and matching `role_play_results` plus
  `user_block_progress` rows.

## Manual review

- Contract/security lane: one P2 release-control finding (missing persistent
  rollback details) was accepted, fixed, and re-reviewed clean.
- Vercel/config lane: one P2-in-review (missing explicit project/scope and
  pinned deployment commands) was accepted, fixed, and re-reviewed clean.
- Test/acceptance lane: two P1 release gates (direct production iframe-origin
  proof and fresh-main equality) plus one P2 evidence-classification gap were
  accepted, fixed in the release gates, and re-reviewed clean.
- Final reviewer verdicts: three lanes, no remaining findings.
- Fallow: no changed-file issue; one inherited `react-dom` test-only dependency
  lead was excluded by the audit gate.
- Test duplication: no tests changed; existing token, event, component, and
  action suites prove distinct contracts.
- Secret/config review: only the public base URL changed. Relevant directional
  keys remain sensitive Vercel variables, and matching named credential items
  exist in the `BMH Secrets` 1Password vault. No values were read or recorded.
- Provider docs checked: Vercel environment variables, staged production
  deployments/promotion/rollback, Next.js environment variables and Server
  Actions origins, MDN `postMessage` origin/source checks, iframe Permissions
  Policy, and Railway custom-domain proxy behavior.
- Human browser review: required after promotion because this is a real
  cross-app workflow and the automated cross-app suite does not prove quiz
  unlock or reload persistence.

### Iteration 2 manual review

- Security lane found two P2 defects: the ordinary integration cleanup could
  strand the last owner, and the imported lifecycle initially lacked real
  database proof. Both were fixed with status restoration/error aggregation
  and hosted-test coverage.
- Test lane escalated the missing hosted proof and exact import lifecycle to
  release blockers. The migration was applied to the canonical test project,
  and the expanded integration now proves suspended learner, active/suspended
  owner, unreleased owner/admin denial, explicit reviewer success, released
  owner/admin success, replay/concurrency, and exact cleanup.
- Security re-review then found a P2 cleanup race between actor deletion and
  import rollback. Cleanup is now deterministically sequenced: actors, role
  group, then import rollback. The exact hosted test passed afterward.
- Migration lane found a P1 rollback-plan defect: the first draft pointed to an
  older/nonexistent predecessor. The rollback source now names migration 040,
  preserving explicit unreleased-reviewer behavior.
- Final verdicts: security CLEAN, migration CLEAN, test/cleanup CLEAN.
- Post-fix checks: typecheck, focused ESLint, `git diff --check`, hosted import
  lifecycle integration, production build, and Fallow new-only audit all pass.

## Claude review

- Surface: authenticated Claude CLI fallback; desktop automation was not
  exposed in this runtime.
- Verdict: `NEXT_STEP`.
- Confidence: high.
- Approval: execute the reviewed fetch/link/staged-deploy/inspect/promote/Chrome
  sequence.
- Rationale: the corrected custom origin aligns iframe construction,
  `postMessage` validation, and signed review-URL verification; no CSP,
  hardcoded Railway origin, code, test, secret, or release-sequence blocker
  remains.

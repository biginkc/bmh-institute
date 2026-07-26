---
status: resolved
trigger: "Finish publishing the BMH employee training course to production."
created: 2026-07-26
updated: 2026-07-26
---

# Released import apply refusal

## Symptoms

- Expected behavior: the exact authorized `course:import upload` and `course:import apply` sequence uploads the remaining 19 approved guide PDFs, applies the current `bmh-employee-training-v1` manifest to production, and exits cleanly.
- Actual behavior: upload completed and wrote an exact production receipt for all 126 assets. Apply passed local semantic and receipt gates, then the production RPC refused the atomic write because the import already has an immutable release record.
- Error messages: `Atomic course import apply failed: Course import apply refused: released imports are immutable.`
- Timeline: reproduced on 2026-07-26 after PR #122 merged. The original import was released on 2026-07-22 and advanced to quiz revision 2 later that day.
- Reproduction: set the canonical Institute production URL and a non-empty service-role key, then run `npm run course:import -- apply content/course-manifests/bmh-employee-training.v1.json --execute --allow-production`.

## Current Focus

- hypothesis: confirmed. PR #122 and an earlier unpublished guide/flashcard revision changed the manifest for an already released import, but no versioned released-content correction controller existed. Generic apply correctly refused the rewrite.
- test: complete. TDD covers exact manifest construction, row-state matching, execution gates, environment-specific upload receipts, release-lineage drift, malformed RPC success, post-write catalog drift, exact audit evidence, SQL security, immutable guide assets, and idempotent replay.
- expecting: the dedicated controller can be rehearsed against the canonical test project and may reach production only after the exact migration, test upload receipt, 44-row RPC, audit record, replay, and reconciliation all pass.
- next_action: open the reviewed commit, deploy the migration to the canonical test project, upload the 19 guides there, execute the dedicated revision command without `--allow-production`, verify its exact audit/catalog output and idempotent replay, then repeat through the approved production gate.
- reasoning_checkpoint: do not edit or bypass `fn_apply_course_import`. Do not mutate the immutable original release record. Do not use a new import identity because that would duplicate the released program and course rather than revise their stable identities.
- tdd_checkpoint: failing contract tests must precede the migration and CLI implementation.

## Evidence

- timestamp: 2026-07-26T14:56:55-05:00
  observed: production upload exited 0 after exact verification of 107 existing assets and upload plus verification of all 19 guide PDFs. Receipt `bmh-employee-training-v1.full.production.json` binds manifest SHA-256 `585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33` and 126 approved assets.
  implication: the credential and Storage target are valid. The remaining failure is in database release control.
- timestamp: 2026-07-26T14:59:25-05:00
  observed: apply passed the release semantic gate with zero errors and zero publication blockers, then production returned `released imports are immutable`.
  implication: the database remained atomic and unchanged. Generic apply is not a valid post-release controller.
- timestamp: 2026-07-26T15:01:54-05:00
  observed: the release record exists for `bmh-employee-training-v1`, the program and course are published, and active release revision 2 is present.
  implication: bypassing the release guard would violate the repository's immutable release contract.
- timestamp: 2026-07-26T15:04:17-05:00
  observed: read-only exact reconciliation checked 4,789 planned operations. Six role-play content blocks are missing. Nineteen guide block contents and nineteen flashcard block contents differ. Every other planned row is present. Published-state mismatches and the employee role-group access extras are expected release effects.
  implication: the fix-forward database scope is exactly 44 content blocks. No generic graph rewrite is justified.
- timestamp: 2026-07-26T15:05:02-05:00
  observed: every live guide block points to an older checksum-addressed PDF while the newly uploaded approved guide files use the current manifest paths. Flashcard decks contain older prompt text. PR #122 itself added only the six role-play blocks.
  implication: completing the current manifest requires both a prior unpublished guide and flashcard delta and the PR #122 role-play delta.
- timestamp: 2026-07-26T15:14:00-05:00
  observed: the original tracked release archive hashes to `71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c`; active quiz revision 2 pins manifest `440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d` and catalog `ca42e3d6347a71f46bd1aabee6c7b5c9fc570e797473865ceee30d4fe2a36ae0`; the current target manifest hashes to `585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33`; the current live full catalog precondition is `e66250effa99bda93e8dd828077811585a5369e2e142bfa9bc5381f5ccd94eb4`.
  implication: the correction can use an exact compare-and-swap boundary without treating a historical archive or active revision-view checksum as the current live catalog.
- timestamp: 2026-07-26T15:18:00-05:00
  observed: TDD RED was captured before implementation. Builder/migration tests failed because the dedicated revision builder and migration did not exist; the controller test failed because no dedicated command existed.
  implication: the new path is regression-driven rather than a post-hoc test shell.
- timestamp: 2026-07-26T15:28:00-05:00
  observed: the deterministic 44-mutation payload contains 19 guide updates, 19 flashcard updates, and 6 role-play inserts. Its client JSON SHA-256 is `81d918fd621bb82da935a81f06a08196ce27b2cb853fafcf0f8a2df88de8201b`; its PostgreSQL `jsonb::text` SHA-256 is `68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a`. An independent PostgreSQL serialization check reproduced the database hash.
  implication: both the TypeScript controller and the SQL function bind the same exact payload while accounting for PostgreSQL JSONB canonicalization.
- timestamp: 2026-07-26T15:32:00-05:00
  observed: adversarial SQL review found that migration 033's imported-content insert trigger would refuse the six role-play inserts. The migration now replaces only that trigger function with a narrow service-role revision branch pinned to the canonical import, original release, published program/course, and exact database payload hash. It preserves the existing generic apply branch.
  implication: the correction can insert only the six authorized imported blocks without setting the generic apply marker or weakening released-import immutability.
- timestamp: 2026-07-26T15:34:00-05:00
  observed: adversarial SQL review found that ordinary JSONB evidence comparisons failed open on SQL NULL. The RPC now requires an object with exactly seven named keys, uses `IS DISTINCT FROM` for exact values, and coalesces the receipt checksum before its 64-hex check. SQL tests prove `{}` and a missing receipt key are refused.
  implication: omitted evidence can no longer pass the revision gate through SQL three-valued logic.
- timestamp: 2026-07-26T15:38:00-05:00
  observed: adversarial controller review found that test-project rehearsal was impossible, successful RPC data was not verified against live catalog/audit state, and source-regex tests did not execute controller guards. The refactored injected controller now selects `test` or `production` receipts from the validated URL, requires `--allow-production` only for production, enforces a non-empty key, validates RPC status/count/catalog, verifies all 44 rows, compares the fresh whole-course catalog to the RPC receipt, and validates the exact immutable audit record.
  implication: the first end-to-end run can and must be a canonical test-project rehearsal, while a malformed or stale success response cannot exit zero.
- timestamp: 2026-07-26T15:38:20-05:00
  observed: focused GREEN verification passed 30 tests and typecheck; after adding the explicit empty-key regression and final assertion refactor, focused GREEN passed 31 tests and typecheck.
  implication: exact builder, controller, migration, retry, environment, credential, and drift contracts are executable.
- timestamp: 2026-07-26T15:39:00-05:00
  observed: a disposable native PostgreSQL 17 cluster applied the full repository migration chain and ran `054_released_content_block_revision.sql` through the controller-gate PR harness. The harness exited 0 with status `passed`; the cluster was stopped and moved to Trash.
  implication: the migration is syntactically valid with repository trigger/grant interactions and its SQL rejection tests pass from a clean database.
- timestamp: 2026-07-26T15:40:00-05:00
  observed: `npm run verify` passed typecheck, 180 Vitest files with 1,066 tests, and 39 RTL files with 141 tests. `npm run test:course-content` passed 191 Node QA tests, five current quiz reports, five caption-generator tests, two guide semantic tests, and deterministic rebuild verification for all 19 guides.
  implication: the fix introduces no detected repository or course-content regression.
- timestamp: 2026-07-26T15:41:00-05:00
  observed: two independent manual reviewers completed. SQL review has no remaining finding after the insert-trigger and NULL-evidence fixes. Controller review's three findings are implemented. Neither reviewer found secrets or a reason for browser review at this backend-only stage.
  implication: manual code review is clean for the local implementation; browser acceptance remains a post-production reconciliation gate.
- timestamp: 2026-07-26T15:42:00-05:00
  observed: this debug lane made no Supabase write, migration deployment, merge, production command, secret read, or 1Password request. The generic `fn_apply_course_import`, original release record, and active quiz revision ledger remain unchanged.
  implication: the repository fix is isolated and reviewable; canonical test rehearsal and production execution remain explicit external gates.
- timestamp: 2026-07-26T15:44:00-05:00
  observed: the commit hook reran the full repository verification after the final controller assertion refactor and passed typecheck, 180 Vitest files with 1,067 tests, and 39 RTL files with 141 tests.
  implication: the committed tree, not only the pre-commit working tree, passed the complete repository gate.
- timestamp: 2026-07-26T15:50:00-05:00
  observed: canonical test rehearsal exposed that the test Storage project intentionally contains 0 of the generic manifest's 126 approved assets. The generic full receipt would require 2,602,554,176 bytes even though the released-content correction references only 19 guide PDFs totaling 965,833 bytes.
  implication: requiring the generic full receipt is an over-broad rehearsal and release blocker. Flashcard updates and role-play inserts are database-only.
- timestamp: 2026-07-26T15:56:16-05:00
  observed: TDD RED was captured before the narrow receipt implementation. The new revision-asset suite failed because `released-content-block-revision-receipt` did not exist.
  implication: the test requires a distinct receipt contract rather than changing or aliasing the generic full receipt.
- timestamp: 2026-07-26T16:06:38-05:00
  observed: focused GREEN passed 56 tests across the builder, revision-asset receipt/preparation, controller, and migration suites; typecheck and `git diff --check` passed. Both prepare and apply dry runs succeed with credentials unset, report 19 guide assets, and retain the exact confirmation gate.
  implication: the revision now has executable regression coverage for its exact 19-guide asset boundary without expanding the database mutation scope.
- timestamp: 2026-07-26T16:07:00-05:00
  observed: the generic upload receipt module and existing production full receipt path are unchanged. The new receipt lives under `released-content-block-revision-receipts` and is partitioned by import, target manifest SHA-256, client payload SHA-256, and environment. Preparation invalidates only that path, uploads exactly 19 guides, independently verifies all remote bytes, and writes the receipt only after success. Apply reloads the exact receipt and re-verifies the 19 remote files before lineage or RPC access.
  implication: production receipt history cannot collide, an empty test project needs less than 1 MB rather than 2.60 GB, and stale/tampered remote guide bytes fail before database mutation.

## Eliminated

- hypothesis: the service role key is empty.
  evidence: the item reference label was stale, but the API credential item's concealed `credential` field is non-empty, has the modern Supabase secret-key format, and authenticated the successful production upload.
- hypothesis: the apply failed after a partial database write.
  evidence: the RPC failed inside the atomic transaction before returning an applied confirmation. Read-only reconciliation still shows all six role-play rows absent.
- hypothesis: rerunning generic apply or weakening the immutable guard is safe.
  evidence: migrations 027, 030, and 034 explicitly prohibit apply after release, and the release-control runbook requires immutable history.

## Resolution

- root_cause: the current manifest contains 44 approved content-block changes layered over an immutable released import, but the only available controller was generic apply, which is intentionally prohibited after release.
- fix: add a dedicated versioned, service-role-only, append-only released-content revision that compare-and-swaps the exact live catalog, verifies all immutable guide assets, atomically applies only 19 guide updates, 19 flashcard updates, and 6 role-play inserts, appends exact audit evidence, supports only exact idempotent replay, and leaves all release history immutable. Add an environment-aware CLI that is offline by default. Its separate `prepare-assets` mode derives, uploads, and byte-verifies only the 19 mutation-bound guide PDFs and writes a collision-proof revision receipt; apply requires that exact receipt, re-verifies the same 19 bytes, then verifies active lineage, RPC receipt, 44 target rows, whole-course catalog, and audit record.
- verification: initial TDD RED captured; first focused GREEN 31/31; revision-asset TDD RED captured; expanded focused GREEN 56/56; typecheck passed; prepare/apply offline dry runs passed without credentials or connections; full native PostgreSQL 17 migration/SQL harness passed; the first commit hook's `npm run verify` passed 1,208 tests across 219 files plus typecheck; `npm run test:course-content` passed all 191 Node QA tests, report checks, caption tests, semantic guide tests, and 19-guide deterministic rebuild; two manual reviews were clean after the database/controller fixes.
- files_changed:
  - `.planning/debug/released-import-apply-refusal.md`
  - `package.json`
  - `scripts/course-content/revise-released-content-blocks.ts`
  - `scripts/fixture-boundary/run-controller-gate-pr-harness.mjs`
  - `src/lib/course-import/released-content-block-revision.ts`
  - `src/lib/course-import/released-content-block-revision-controller.ts`
  - `src/lib/course-import/released-content-block-revision-receipt.ts`
  - `src/lib/course-import/released-content-block-revision-assets.test.ts`
  - `src/lib/course-import/released-content-block-revision.test.ts`
  - `src/lib/course-import/released-content-block-revision-command.test.ts`
  - `src/lib/course-import/released-content-block-revision-migration.test.ts`
  - `supabase/migrations/20260726170000_revise_released_content_blocks.sql`
  - `supabase/tests/054_released_content_block_revision.sql`

## Remaining Release Gates

- Deploy the new migration to the canonical test Supabase project.
- Create the exact revision-specific test receipt with `course:content-blocks:prepare` by uploading and byte-verifying only the same 19 guide assets against the target manifest.
- Execute the dedicated controller in test without `--allow-production`; verify the returned catalog, immutable audit row, 44 target rows, and an exact `already_revised` replay.
- Run independent test-project reconciliation against the target manifest.
- Only after review approval, record a rollback point, deploy the reviewed migration to production, run the dedicated production controller with its exact generated confirmation and `--allow-production`, reconcile production, and complete authenticated browser acceptance.

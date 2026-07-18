# BMH Institute fixture cleanup boundary

Status: boundary recorded, cleanup not authorized and not executed.

## Evidence

The private rollback snapshot and a fresh read-only production inventory were compared before this boundary was written.

- Project: `bmh-institute` (`dhvfsyteqsxagokoerrx`)
- Rollback data SHA-256: `46037814916bc4286ab9cded45cb57eb40e1e9280d43cfe87c6eeeed29a140dc`
- Rollback schema SHA-256: `3eb8893601ef4ae67e5fa40fc8989b7164b61b9cad5e12387376d0d65424d1f2`
- Existing physical backup: `1130851936`, created `2026-07-16T11:34:16.963Z`
- Read-only production capture: `2026-07-16T23:07:39.408Z`
- Snapshot and production identity comparison: no missing or added IDs in any catalog, access or activity table
- Storage comparison: zero objects in both `content` and `submissions` in the snapshot and live capture
- Machine manifest: `fixture-boundary-manifest.json`
- Current manifest SHA-256: `80a4e2cac5e11e28c65605be1f22acccb708670095d0f46d5c14219feafca9a1`

The live inventory used the approved 1Password service-account path to read a Browser V1 owner fixture. Owner-scoped production reads verified every current ID and every owner-readable field. `answer_options.is_correct` is intentionally not owner-readable. Those protected values came from the rollback snapshot and the service-role-only atomic RPC must recheck them before deletion.

Every captured column is guarded, including creation, update, acceptance, review, completion and resume timestamps. The RPC also requires the live column set to exactly match the manifest, so a later migration cannot add an unreviewed deletion-relevant field. Migration 015 defaults must remain `thumbnail_path is null` and `rubric = '[]'::jsonb`. Migration 020 requires `content_import_id`, `thumbnail_asset_key`, `thumbnail_approved_path` and `thumbnail_approved_sha256` to exist and remain null on every fixture program, course and lesson. A fixture row that acquires real artwork, a rubric, import provenance or any timestamp-only activity fails the cleanup fingerprint.

## Exact deletion set

The manifest contains 463 exact fixture identities.

| Table | Rows |
| --- | ---: |
| programs | 9 |
| program_courses | 12 |
| courses | 15 |
| modules | 20 |
| lessons | 40 |
| content_blocks | 79 |
| quizzes | 10 |
| questions | 17 |
| answer_options | 45 |
| assignments | 14 |
| role_groups | 10 |
| program_access | 11 |
| course_access | 9 |
| user_role_groups | 17 |
| invites | 6 |
| assignment_submissions | 7 |
| certificates | 9 |
| program_certificates | 3 |
| role_play_results | 0 |
| user_block_progress | 67 |
| user_video_progress | 0 |
| user_course_resume | 12 |
| user_lesson_completions | 40 |
| user_quiz_attempts | 11 |
| content storage objects | 0 |
| submissions storage objects | 0 |

Every row is classified as fixture-owned based on Jarrad's explicit statement that the app has never been used, has no genuine learner activity and has no course content worth salvaging. Titles and source traces further classify rows as Browser V1, walkthrough, production-readiness or legacy training fixtures.

## Retained boundary

Cleanup never targets:

- 22 `profiles` rows
- 22 snapshot `auth.users` rows and all later auth accounts
- 427 captured `audit_log` rows and all later audit history
- two certificate templates
- certificate number counters
- identifier-free auth rate-limit window counts; no email, IP address or reversible identifier is committed
- any row imported for the real course
- any unrelated storage object

Fourteen retained profiles are referenced by fixture activity. Those references are expected because activity rows are deleted while the accounts remain. The manifest also records 106 retained audit entries that point to fixture entity IDs. They stay as historical evidence even after the fixture entity is removed.

The fixture blocks contain 37 external URL, scenario or file references. They are payloads inside the exact fixture blocks, not database or storage ownership claims. No unexplained database reference or storage object remained after classification.

## Guarded cleanup command

`npm run cleanup:fixtures` is dry-run by default. It reads the exact manifest, verifies its checksum, requires the exact production host and checks current production rows, dependents, accounts, audit history and storage. It cannot delete anything without `--execute`.

Production credentials must come only from an approved `BMH Secrets` item read with the 1Password service account. Do not use cached CLI credentials, a browser session, desktop authorization or a GUI prompt. If the required service-role item is not available to the service account, stop.

Migration `021_atomic_fixture_catalog_cleanup.sql` installs the dormant RPC. Because that migration is already applied, migration `035_refresh_fixture_cleanup_manifest_contract.sql` advances the installed checksum binding to this sanitized manifest without rewriting migration history. Calling the RPC:

1. Takes a transaction advisory lock.
2. Locks every catalog, public dependent, profile, audit and auth table against concurrent writes.
3. Rechecks the exact manifest checksum and confirmation.
4. Requires every expected fixture row to be present and fingerprint-identical, or every one to be absent for an idempotent retry.
5. Rejects partial state, changed rows, timestamp-only activity, changed column sets, any unmanifested public dependent and every cross-schema foreign key into the fixture graph.
6. Rechecks every retained profile, auth user and audit row.
7. Deletes exact identities in dependency order in one database transaction.
8. Rechecks retained rows before commit.

The RPC is revoked from `public`, `anon` and `authenticated`. Only `service_role` can execute it. The command has no auth-user deletion method. Storage deletion runs only after the database transaction commits and only for exact manifest object names. This manifest contains no storage deletion names.

The confirmation string printed by dry-run is only a typo guard. It is not authorization. Execution additionally requires:

- the real course to pass acceptance
- a separate controller-recorded JSON approval from Jarrad, issued within 24 hours for this exact manifest hash
- a fresh rollback JSON record captured within the previous 24 hours
- a controller-supplied live provider verification, no older than one hour, proving that exact backup is complete in this production project
- a passed isolated restore rehearsal from the previous 24 hours, with an evidence checksum
- migrations 020 and 021 to be present, followed by the forward-only manifest-contract refresh in migration 035
- an explicit `--execute` invocation

Approval record shape:

```json
{
  "project_ref": "dhvfsyteqsxagokoerrx",
  "manifest_sha256": "80a4e2cac5e11e28c65605be1f22acccb708670095d0f46d5c14219feafca9a1",
  "approved_by": "Jarrad Henry",
  "approved_at": "<ISO timestamp within 24 hours>",
  "recorded_by": "controller",
  "evidence_sha256": "<checksum of the controller-held approval evidence>",
  "scope": "fixture_cleanup_after_real_course_acceptance",
  "authorization": "execute"
}
```

Fresh rollback record shape:

```json
{
  "project_ref": "dhvfsyteqsxagokoerrx",
  "manifest_sha256": "80a4e2cac5e11e28c65605be1f22acccb708670095d0f46d5c14219feafca9a1",
  "captured_at": "<ISO timestamp within 24 hours>",
  "backup_id": "<new backup identifier>",
  "backup_provider": "supabase",
  "backup_project_ref": "dhvfsyteqsxagokoerrx",
  "backup_status": "COMPLETED",
  "backup_verified_live_at": "<ISO timestamp within one hour>",
  "backup_verified_by": "controller",
  "backup_verification_evidence_sha256": "<checksum of redacted provider evidence>",
  "restore_rehearsal_status": "passed",
  "restore_rehearsal_backup_id": "<same new backup identifier>",
  "restore_rehearsed_at": "<ISO timestamp within 24 hours>",
  "restore_rehearsal_evidence_sha256": "<checksum of reconciliation evidence>",
  "schema_sha256": "<64 lowercase hex characters>",
  "data_sha256": "<64 lowercase hex characters>",
  "storage_inventory_sha256": "<64 lowercase hex characters>"
}
```

No approval or fresh rollback record is committed now. The cleanup command deliberately does not call the provider management API or read provider credentials beyond the scoped database credential. The controller must create the rollback record only after a live provider check and isolated restore rehearsal; execution fails closed without that distinct record. The local JSON is a carrier for controller-verified evidence, not a substitute for that verification.

## Rollback

The July 16 snapshot proves the initial boundary but must not be used as the only rollback for a later cleanup. Restoring it wholesale after the real course import would also remove the newly imported course.

Immediately before an authorized execution:

1. Take a fresh physical backup plus schema, data and storage inventories.
2. Record all identifiers and SHA-256 values in the required rollback JSON.
3. Rehearse restoration in an isolated database.
4. Restore schema first, then data with triggers disabled because `lessons` has circular foreign-key ordering.
5. Reconcile every table and storage object before accepting the rehearsal.

If the atomic RPC fails, PostgreSQL rolls the entire database deletion back. Do not retry until the reported drift or unexplained reference is classified. If database cleanup commits but an exact storage deletion fails, rerun the same command. The RPC returns `already_deleted`, then retries only the exact storage list. This manifest's storage list is empty.

# Imported course release control

Migration `027_import_release_control.sql`, with append-only access hardening in
`029_import_release_access_hardening.sql` and
`030_import_release_idempotent_apply.sql`, plus the explicit reviewer and
review-evidence boundary in migrations `039` through `045`, makes publication
of imported course content a distinct, service-role-only transaction. Generic
program and course admin forms can continue to publish reusable hand-authored
content, but they cannot move a row with `content_import_id` from draft to
published.

No release is performed by the migration or by this document. The BMH course
must remain unpublished and limited to its single QA role group until the final
acceptance gates are real.

## Required evidence envelope

`fn_release_course_import_v1` accepts one JSON object with exactly these seven
records:

- `manifest`: finalized manifest SHA-256, timestamp, and `finalized` status.
- `reconciliation`: reconciliation-record SHA-256, the current database catalog
  SHA-256 returned by `fn_course_import_catalog_sha256`, timestamp, `passed`
  status, and `exact: true`.
- `rollback_rehearsal`: checksum, timestamp, and `passed` status.
- `chrome_desktop`: real Chrome acceptance checksum, timestamp, and `passed`
  status.
- `chrome_mobile`: narrow/mobile Chrome acceptance checksum, timestamp, and
  `passed` status.
- `admin_happy_path`: admin editing, assignment review, and reporting acceptance
  checksum, timestamp, and `passed` status.
- `jarrad_approval`: approval-record checksum, timestamp, `approved` status, and
  `approved_by: "Jarrad Henry"`.

All evidence hashes are lowercase SHA-256 values. Reconciliation must be no more
than one hour old. Rollback, Chrome, admin, and approval evidence must be no more
than 24 hours old. Approval must follow every other gate. The confirmation is
`RELEASE-BMH-INSTITUTE:<import-id>:<manifest-sha256>`.

## Atomic outcome

The database locks the imported graph, recomputes the catalog checksum, and
refuses drift. In the same transaction it writes the immutable evidence record,
publishes every imported course and its program, keeps course certificates
disabled, keeps the program certificate enabled, and attaches one distinct
employee role group. Any failure rolls back all of those changes.

Before release, the imported program may have exactly one access row: the QA
role group created by the deterministic service-role importer. Its imported
courses must have zero direct `course_access` rows. Generic admins cannot create
or replace the QA grant, attach an employee group, pre-attach a standalone
course grant, or send an enrollment message claiming unpublished content. The
release RPC is intentionally not wired to a button; invoking it requires the
service role and explicit evidence gathered by the controller.

## Unreleased reviewer boundary

Private review uses an explicit allowlist. A service-role controller calls
`fn_set_unreleased_import_reviewer_v1` with the exact imported program, an
active owner profile, and `true`. A reviewer grant applies only while that
program is unpublished and has no release record. Passing `false` revokes it.
Generic QA group membership and invites are not substitutes for this grant.

The reviewer may exercise quizzes, videos, assignments, and role plays through
the normal learner interface. Authenticated admin edits are limited to the
same catalog boundary. Unreleased imported submissions and their private
storage objects are visible and actionable only to an explicit reviewer.
Ordinary admins retain their existing access to hand-authored and released
content. Sandra completion enqueue and delivery claim both refuse an
unreleased imported course.

Reviewer activity is acceptance evidence, not ordinary learner history. If the
import is rejected, the service-role controller must call
`fn_cleanup_unreleased_import_reviewer_evidence_v1` while the reviewer grant is
still active. When reviewer submission files exist, the first call returns
`storage_cleanup_required` and the exact unshared paths without deleting
database evidence. The controller removes those paths through the Supabase
Storage API and calls the RPC again. The successful call locks the import and
deletes only that reviewer's quiz,
video, assignment, role-play, progress, completion, certificate, resume,
and delivery evidence for the one current unreleased import. It preserves
audit history and revokes reviewer access in the same database transaction. It
does not delete authentication accounts or evidence owned by any non-reviewer
learner. Direct SQL deletion from `storage.objects` is prohibited because it
does not remove the provider bytes.

A rejected import may use the normal exact rollback command only after cleanup
returns `reviewer_access_revoked: true`. Any non-reviewer learner activity,
external reference, catalog drift, or unexplained storage object still blocks
rollback.

## Rollback consequence

Emergency unpublication remains possible. Re-publication still requires the
release operation, and the immutable release record prevents silently replacing
the original evidence. A changed manifest must use a new import identity and a
new reviewed release record rather than mutating history.

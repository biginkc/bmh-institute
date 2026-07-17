# Imported course release control

Migration `027_import_release_control.sql`, with append-only access hardening in
`029_import_release_access_hardening.sql` and
`030_import_release_idempotent_apply.sql`, makes publication of imported course
content a distinct, service-role-only transaction. Generic program and course
admin forms can continue to publish reusable hand-authored content, but they
cannot move a row with `content_import_id` from draft to published.

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

## Rollback consequence

Emergency unpublication remains possible. Re-publication still requires the
release operation, and the immutable release record prevents silently replacing
the original evidence. A changed manifest must use a new import identity and a
new reviewed release record rather than mutating history.

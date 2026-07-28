-- Reusable, versioned successor to the one-shot 20260726170000 content-block
-- correction. That migration hard-pinned an exact 44-row payload (44 UUIDs,
-- a fixed 19/19/6 breakdown, one literal database-payload checksum baked into
-- the insert-guard trigger) and cannot be reused for a different set of
-- blocks.
--
-- Design (revised after adversarial review of an earlier version of this
-- migration -- see inline notes below for what changed and why):
--
--  * ONE shared revision ledger. This reuses 20260722130000's
--    `content_import_release_revisions` table and its
--    `content_import_active_release_v1` view rather than creating an
--    independent ledger for content-block mutations. Two independent
--    per-mutation-type ledgers can each believe they hold "the" active
--    manifest/catalog state after the other has actually moved it forward --
--    a split-brain. A shared `revision` sequence per import_id, with every
--    mutation kind (quiz, content-block, ...) writing into the same table and
--    reading the same active-state view, makes that structurally impossible:
--    whichever kind runs next always sees the true prior state, regardless of
--    which kind produced it.
--  * The whole-catalog SHA-256 compare-and-swap (fn_course_import_catalog_sha256)
--    is still the real safety gate for any individual call, exactly as
--    before; the shared ledger additionally makes revision *numbering* itself
--    consistent across mutation kinds instead of just the catalog checksum.
--  * Every check in fn_revise_released_content_blocks_v2 is parametric: no
--    hardcoded manifest/catalog SHAs, block IDs, or mutation counts. The
--    caller supplies its own preflight checksums and the function verifies
--    them against live state.
--  * The confirmation string is now bound to a checksum PostgreSQL computes
--    itself from p_mutations (not a caller-supplied "client" hash), so an
--    operator's approved confirmation string is cryptographically tied to
--    the exact bytes about to be applied -- a stale or buggy caller cannot
--    apply a different payload than the one that was reviewed and confirmed.
--  * Rollback locks and inspects every table that can hold learner activity
--    against a content block (progress, video-watch state, durable
--    completion history, role-play results, course-resume pointers) before
--    touching anything, and refuses if any of them reference a block this
--    revision touched. Deleting an inserted block cascades into several of
--    those tables; reverting an updated block's content can orphan others.
--    Neither is acceptable to do silently to a real learner.

set lock_timeout = '10s';

-- Generalize the existing versioned ledger to carry either mutation kind.
-- Existing rows are all quiz revisions; the DEFAULT backfills them as such
-- without a second migration pass. NULL already satisfies every existing
-- `check (column > 0)` constraint (NULL comparisons are neither true nor
-- false, so they never violate a CHECK), so only NOT NULL needs relaxing.
alter table public.content_import_release_revisions
  add column kind text not null default 'quiz'
    check (kind in ('quiz', 'content_blocks', 'legacy_catalog_correction')),
  alter column quiz_count drop not null,
  alter column question_count drop not null,
  alter column option_count drop not null,
  alter column prior_quiz_graph drop not null,
  alter column invalidated_incomplete_attempts drop not null,
  add column mutation_count integer check (mutation_count > 0),
  add column update_count integer check (update_count >= 0),
  add column insert_count integer check (insert_count >= 0),
  add column mutations jsonb check (mutations is null or jsonb_typeof(mutations) = 'array'),
  add column prior_block_graph jsonb,
  add column client_payload_sha256 text check (client_payload_sha256 is null or client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  add column download_evidence_sha256 text check (download_evidence_sha256 is null or download_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  -- Lineage columns. Receipt numbers always append at the end of the shared
  -- sequence (max + 1), so the receipt number alone cannot identify what a
  -- row did to catalog STATE -- these two record it explicitly and are
  -- deliberately separate concepts:
  --   * state_parent_revision: the ledger revision whose resulting state
  --     this row's state sits on top of. For a forward revision, the
  --     revision it was applied against; for a rollback receipt, the state
  --     it RESTORED (the reverted revision's own state parent).
  --   * reverts_revision: set only on rollback receipts -- the forward
  --     revision this receipt undid. (A receipt reverting revision 4 whose
  --     state parent was 3 records reverts_revision = 4 AND
  --     state_parent_revision = 3; conflating the two would misidentify
  --     which state was restored.)
  -- Nullable only for pre-existing rows; the ledger guard trigger below
  -- fills state_parent_revision for any new forward row that omits it.
  add column state_parent_revision integer check (state_parent_revision is null or state_parent_revision >= 1),
  add column reverts_revision integer check (reverts_revision is null or reverts_revision >= 2),
  -- Round-7 review fix (finding 4): a SEPARATE causal-ancestry edge,
  -- independent of state_parent_revision and never mutating an existing
  -- row (the ledger is append-only; an already-inserted row's
  -- state_parent_revision can never be rewritten to splice a
  -- retroactively-backfilled ancestor underneath it). Set ONLY on a
  -- backfilled row whose resulting catalog is exactly what an
  -- ALREADY-EXISTING later row (typically a quiz revision that predates
  -- this backfill) recorded as ITS OWN prior catalog -- i.e., this row's
  -- effect was already causally absorbed into that later row's live state
  -- when the later row was originally applied, even though the later row's
  -- own immutable state_parent_revision cannot be updated to say so.
  -- fn_classify_revision_lineage traverses both edges (state_parent AND
  -- absorbed_into) so a genuine causal predecessor still classifies as
  -- superseded instead of diverged.
  add column absorbed_into_revision integer check (absorbed_into_revision is null or absorbed_into_revision >= 2);

-- Round-7 review fix (finding 3): an INDEPENDENT, immutable attestation of
-- what the catalog looked like immediately after publication -- captured by
-- fn_release_course_import_v1 itself (see the redefinition of
-- private.fn_release_course_import_v027_without_global_mutation_lock
-- below), in the SAME transaction as the publish flip, not reconstructed or
-- guessed at backfill time. Before this column, the backfill accepted
-- WHATEVER the first legacy receipt declared as its own prior catalog as
-- "the" publication state with no independent evidence that publication was
-- the ONLY intervening change -- an unrecorded edit between publication and
-- the first receipt would get silently certified as publication history.
-- Nullable because an import released BEFORE this migration has no such
-- attestation; the backfill refuses to bridge the publication gap for any
-- import where this is null rather than guess.
alter table public.content_import_release_records
  add column post_publication_catalog_sha256 text
    check (post_publication_catalog_sha256 is null or post_publication_catalog_sha256 ~ '^[a-f0-9]{64}$');

-- The release record's own guard (027) blocks EVERY update unconditionally.
-- That is still the right default -- but capturing the post-publication
-- catalog needs one narrow, controlled exception: the publish-flip guard
-- (fn_guard_imported_catalog_publication) itself requires the release
-- record to already EXIST before is_published can flip, so the pre-publish
-- insert must happen first and the post-publication value can only be
-- known afterward, in the same transaction. Reordering to "publish first,
-- insert once with both values" is blocked by that other guard; the
-- alternative of loosening it felt like a bigger, less-contained change
-- than loosening THIS guard for exactly one column. This redefinition
-- allows an UPDATE only when: the same service_role + bmh.release_import_id
-- marker that gates the original insert is present, the column currently
-- being set is NULL -> non-null (once, never again), and every OTHER
-- column is byte-identical to what it already was -- so nothing about an
-- already-recorded release can ever actually change.
create or replace function public.fn_guard_content_import_release_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role'
       or coalesce(current_setting('bmh.release_import_id', true), '') <> new.import_id then
      raise exception 'Content import release records may only be created by the evidence-bound release operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
    and coalesce(auth.role(), '') = 'service_role'
    and coalesce(current_setting('bmh.release_import_id', true), '') = new.import_id
    and old.post_publication_catalog_sha256 is null
    and new.post_publication_catalog_sha256 is not null
    and new.import_id is not distinct from old.import_id
    and new.program_id is not distinct from old.program_id
    and new.qa_role_group_id is not distinct from old.qa_role_group_id
    and new.employee_role_group_id is not distinct from old.employee_role_group_id
    and new.manifest_sha256 is not distinct from old.manifest_sha256
    and new.reconciliation_sha256 is not distinct from old.reconciliation_sha256
    and new.catalog_sha256 is not distinct from old.catalog_sha256
    and new.rollback_rehearsal_sha256 is not distinct from old.rollback_rehearsal_sha256
    and new.chrome_desktop_sha256 is not distinct from old.chrome_desktop_sha256
    and new.chrome_mobile_sha256 is not distinct from old.chrome_mobile_sha256
    and new.admin_happy_path_sha256 is not distinct from old.admin_happy_path_sha256
    and new.approval_sha256 is not distinct from old.approval_sha256
    and new.approved_by is not distinct from old.approved_by
    and new.evidence is not distinct from old.evidence
    and new.released_by is not distinct from old.released_by
    and new.released_at is not distinct from old.released_at
  then
    return new;
  end if;
  raise exception 'Content import release records are immutable.' using errcode = '42501';
end;
$$;

alter table public.content_import_release_revisions
  add constraint content_import_release_revisions_kind_shape_check
  check (
    (
      kind = 'quiz'
      and quiz_count is not null and question_count is not null
      and option_count is not null and prior_quiz_graph is not null
      and invalidated_incomplete_attempts is not null
      and mutation_count is null and update_count is null and insert_count is null
      and mutations is null and prior_block_graph is null
      and client_payload_sha256 is null and download_evidence_sha256 is null
    ) or (
      kind = 'content_blocks'
      and mutation_count is not null and update_count is not null and insert_count is not null
      and mutations is not null and prior_block_graph is not null
      and client_payload_sha256 is not null and download_evidence_sha256 is not null
      and quiz_count is null and question_count is null and option_count is null
      and prior_quiz_graph is null and invalidated_incomplete_attempts is null
    ) or (
      -- A validated lineage edge for a catalog-touching mechanism that has
      -- its own append-only, checksum-CAS'd receipt table but never wrote
      -- this shared ledger directly: the released-poster and
      -- released-caption replacement mechanisms (20260722043000,
      -- 20260722235500). Backfilled retroactively, once, alongside the v1
      -- content-block history -- see 20260727180500 -- so that history's
      -- FIRST receipt for an import has a real prior state to validate
      -- against instead of an unvalidated caller-declared checksum. Carries
      -- only the base identity/evidence columns; never a rollback target
      -- (reverts_revision is always null -- these mechanisms have no
      -- rollback of their own to model).
      kind = 'legacy_catalog_correction'
      and reverts_revision is null
      and mutation_count is null and update_count is null and insert_count is null
      and mutations is null and prior_block_graph is null
      and client_payload_sha256 is not null and download_evidence_sha256 is null
      and quiz_count is null and question_count is null and option_count is null
      and prior_quiz_graph is null and invalidated_incomplete_attempts is null
    )
  );

comment on column public.content_import_release_revisions.kind is
  'Discriminates which mutation type produced this ledger row. All rows share one revision sequence and one active-state view (content_import_active_release_v1) regardless of kind -- that shared sequence is what prevents a per-kind split-brain. legacy_catalog_correction rows are backfilled, retroactive lineage edges for catalog-touching mechanisms that keep their own receipt table (poster/caption replacement) rather than a live mutation kind.';

-- Single source of truth for every table fn_course_import_catalog_sha256
-- reads, in a fixed order. Every forward and rollback revision RPC (quiz and
-- content-block) and the v1 backfill lock exactly this set before computing
-- or relying on a catalog checksum -- a lock on a subset lets a concurrent
-- write to the omitted table land between hash computation and commit,
-- producing a receipt whose claimed catalog was never the real committed
-- state. Test 055 asserts this array is the exact set of tables the hash
-- function references (parsed from its own source), not a remembered list.
create or replace function public.fn_course_import_catalog_lock_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'answer_options', 'assignments', 'content_blocks', 'course_access',
    'courses', 'lessons', 'modules', 'program_access', 'program_courses',
    'programs', 'questions', 'quizzes', 'role_groups'
  ]::text[];
$$;

revoke all on function public.fn_course_import_catalog_lock_tables() from public, anon, authenticated;
grant execute on function public.fn_course_import_catalog_lock_tables() to service_role;

-- Acquire the canonical catalog-hash lock set in its fixed order, as a
-- single dynamic LOCK TABLE statement so every caller locks identically
-- (same tables, same order) regardless of which RPC or migration invokes it.
create or replace function public.fn_lock_course_import_catalog_tables()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_statement text;
begin
  select 'lock table '
    || string_agg('public.' || quote_ident(item), ', ' order by item)
    || ' in share row exclusive mode'
  into v_statement
  from unnest(public.fn_course_import_catalog_lock_tables()) item;
  execute v_statement;
end;
$$;

revoke all on function public.fn_lock_course_import_catalog_tables() from public, anon, authenticated;
grant execute on function public.fn_lock_course_import_catalog_tables() to service_role;

-- Redefine the release RPC's actual body (private.fn_release_course_import_v027_without_global_mutation_lock,
-- originally 027's public.fn_release_course_import_v1, renamed by 034) to
-- also attest the post-publication catalog -- see the
-- post_publication_catalog_sha256 column comment above for why this must
-- be captured HERE and not reconstructed later. CREATE OR REPLACE preserves
-- the existing revoke-from-everyone grant state (034 revoked all, relying
-- on the public wrapper's SECURITY DEFINER ownership to call it).
create or replace function private.fn_release_course_import_v027_without_global_mutation_lock(
  p_import_id text,
  p_program_id uuid,
  p_employee_role_group_id uuid,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_sha256 text;
  v_qa_role_group_id uuid;
  v_manifest_at timestamptz;
  v_reconciliation_at timestamptz;
  v_rollback_at timestamptz;
  v_desktop_at timestamptz;
  v_mobile_at timestamptz;
  v_admin_at timestamptz;
  v_approval_at timestamptz;
  v_existing public.content_import_release_records%rowtype;
  v_post_publication_catalog_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import release requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import release refused: invalid import_id.' using errcode = '22023';
  end if;
  if p_confirmation is distinct from 'RELEASE-BMH-INSTITUTE:' || p_import_id || ':' || coalesce(p_evidence -> 'manifest' ->> 'sha256', '') then
    raise exception 'Course import release refused: confirmation does not bind the import and manifest checksum.' using errcode = '22023';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or (select count(*) from jsonb_object_keys(p_evidence)) <> 7
     or not (p_evidence ?& array['manifest','reconciliation','rollback_rehearsal','chrome_desktop','chrome_mobile','admin_happy_path','jarrad_approval']) then
    raise exception 'Course import release refused: evidence must contain exactly the seven required gates.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (values
      ('manifest', array['sha256','recorded_at','status']::text[]),
      ('reconciliation', array['sha256','catalog_sha256','recorded_at','status','exact']::text[]),
      ('rollback_rehearsal', array['sha256','recorded_at','status']::text[]),
      ('chrome_desktop', array['sha256','recorded_at','status']::text[]),
      ('chrome_mobile', array['sha256','recorded_at','status']::text[]),
      ('admin_happy_path', array['sha256','recorded_at','status']::text[]),
      ('jarrad_approval', array['sha256','approved_at','status','approved_by']::text[])
    ) required(name, keys)
    where jsonb_typeof(p_evidence -> required.name) <> 'object'
       or (select count(*) from jsonb_object_keys(p_evidence -> required.name)) <> cardinality(required.keys)
       or not ((p_evidence -> required.name) ?& required.keys)
  ) then
    raise exception 'Course import release refused: an evidence gate has an invalid shape.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (values
      (p_evidence -> 'manifest' ->> 'sha256'),
      (p_evidence -> 'reconciliation' ->> 'sha256'),
      (p_evidence -> 'reconciliation' ->> 'catalog_sha256'),
      (p_evidence -> 'rollback_rehearsal' ->> 'sha256'),
      (p_evidence -> 'chrome_desktop' ->> 'sha256'),
      (p_evidence -> 'chrome_mobile' ->> 'sha256'),
      (p_evidence -> 'admin_happy_path' ->> 'sha256'),
      (p_evidence -> 'jarrad_approval' ->> 'sha256')
    ) digest(value)
    where digest.value is null or digest.value !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'Course import release refused: every evidence checksum must be lowercase SHA-256.' using errcode = '22023';
  end if;

  if p_evidence -> 'manifest' ->> 'status' <> 'finalized'
     or p_evidence -> 'reconciliation' ->> 'status' <> 'passed'
     or p_evidence -> 'reconciliation' -> 'exact' is distinct from 'true'::jsonb
     or p_evidence -> 'rollback_rehearsal' ->> 'status' <> 'passed'
     or p_evidence -> 'chrome_desktop' ->> 'status' <> 'passed'
     or p_evidence -> 'chrome_mobile' ->> 'status' <> 'passed'
     or p_evidence -> 'admin_happy_path' ->> 'status' <> 'passed'
     or p_evidence -> 'jarrad_approval' ->> 'status' <> 'approved'
     or p_evidence -> 'jarrad_approval' ->> 'approved_by' <> 'Jarrad Henry' then
    raise exception 'Course import release refused: every required gate must explicitly pass.' using errcode = '22023';
  end if;

  begin
    v_manifest_at := (p_evidence -> 'manifest' ->> 'recorded_at')::timestamptz;
    v_reconciliation_at := (p_evidence -> 'reconciliation' ->> 'recorded_at')::timestamptz;
    v_rollback_at := (p_evidence -> 'rollback_rehearsal' ->> 'recorded_at')::timestamptz;
    v_desktop_at := (p_evidence -> 'chrome_desktop' ->> 'recorded_at')::timestamptz;
    v_mobile_at := (p_evidence -> 'chrome_mobile' ->> 'recorded_at')::timestamptz;
    v_admin_at := (p_evidence -> 'admin_happy_path' ->> 'recorded_at')::timestamptz;
    v_approval_at := (p_evidence -> 'jarrad_approval' ->> 'approved_at')::timestamptz;
  exception when others then
    raise exception 'Course import release refused: evidence timestamps are invalid.' using errcode = '22023';
  end;

  if greatest(v_manifest_at, v_reconciliation_at, v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at, v_approval_at) > now()
     or v_reconciliation_at < now() - interval '1 hour'
     or least(v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at, v_approval_at) < now() - interval '24 hours'
     or v_approval_at < greatest(v_manifest_at, v_reconciliation_at, v_rollback_at, v_desktop_at, v_mobile_at, v_admin_at) then
    raise exception 'Course import release refused: acceptance evidence is stale, future-dated, or approved before its gates.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table public.programs, public.courses, public.program_courses, public.program_access,
    public.role_groups, public.content_import_release_records in share row exclusive mode;

  select * into v_existing
  from public.content_import_release_records release
  where release.import_id = p_import_id;
  if found then
    if v_existing.program_id = p_program_id
       and v_existing.employee_role_group_id = p_employee_role_group_id
       and v_existing.evidence = p_evidence
       and exists (select 1 from public.programs where id = p_program_id and is_published)
       and not exists (
         select 1 from public.program_courses pc join public.courses course on course.id = pc.course_id
         where pc.program_id = p_program_id and not course.is_published
       )
       and exists (
         select 1 from public.program_access
         where program_id = p_program_id and role_group_id = p_employee_role_group_id
       ) then
      return jsonb_build_object('status', 'already_released', 'import_id', p_import_id, 'program_id', p_program_id);
    end if;
    raise exception 'Course import release refused: an immutable release record already exists with different state.' using errcode = '22023';
  end if;

  if (select count(*) from public.programs where content_import_id = p_import_id) <> 1
     or not exists (
       select 1 from public.programs
       where id = p_program_id and content_import_id = p_import_id and not is_published and certificate_enabled
     ) then
    raise exception 'Course import release refused: expected one unpublished certificate-enabled imported program.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.role_groups where id = p_employee_role_group_id) then
    raise exception 'Course import release refused: employee role group does not exist.' using errcode = '22023';
  end if;
  if (select count(*) from public.program_access where program_id = p_program_id) <> 1 then
    raise exception 'Course import release refused: unreleased imported content must have exactly one QA access group.' using errcode = '22023';
  end if;
  select role_group_id into v_qa_role_group_id
  from public.program_access where program_id = p_program_id;
  if v_qa_role_group_id = p_employee_role_group_id then
    raise exception 'Course import release refused: employee and QA role groups must be distinct.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.courses where content_import_id = p_import_id)
     or exists (
       select 1 from public.courses course
       where course.content_import_id = p_import_id
         and (course.is_published or course.certificate_enabled)
     )
     or exists (
       select 1 from public.courses course
       where course.content_import_id = p_import_id
         and (select count(*) from public.program_courses pc where pc.program_id = p_program_id and pc.course_id = course.id) <> 1
     )
     or exists (
       select 1 from public.program_courses pc join public.courses course on course.id = pc.course_id
       where pc.program_id = p_program_id and course.content_import_id is distinct from p_import_id
     ) then
    raise exception 'Course import release refused: imported courses must be unpublished, course certificates disabled, and attached only to the imported program.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lessons where content_import_id = p_import_id)
     or exists (
       select 1 from public.lessons lesson join public.modules module on module.id = lesson.module_id
       join public.courses course on course.id = module.course_id
       where course.content_import_id = p_import_id and lesson.content_import_id is distinct from p_import_id
     )
     or exists (
       select 1 from public.lessons lesson join public.modules module on module.id = lesson.module_id
       join public.courses course on course.id = module.course_id
       where lesson.content_import_id = p_import_id and course.content_import_id is distinct from p_import_id
     ) then
    raise exception 'Course import release refused: lesson provenance does not exactly match the imported course graph.' using errcode = '22023';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if p_evidence -> 'reconciliation' ->> 'catalog_sha256' <> v_catalog_sha256 then
    raise exception 'Course import release refused: current database catalog no longer matches the reconciled checksum.' using errcode = '22023';
  end if;

  perform set_config('bmh.release_import_id', p_import_id, true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence, released_by
  ) values (
    p_import_id, p_program_id, v_qa_role_group_id, p_employee_role_group_id,
    p_evidence -> 'manifest' ->> 'sha256', p_evidence -> 'reconciliation' ->> 'sha256',
    v_catalog_sha256, p_evidence -> 'rollback_rehearsal' ->> 'sha256',
    p_evidence -> 'chrome_desktop' ->> 'sha256', p_evidence -> 'chrome_mobile' ->> 'sha256',
    p_evidence -> 'admin_happy_path' ->> 'sha256', p_evidence -> 'jarrad_approval' ->> 'sha256',
    'Jarrad Henry', p_evidence, auth.uid()
  );

  update public.courses
  set is_published = true, certificate_enabled = false
  where content_import_id = p_import_id;
  update public.programs
  set is_published = true, certificate_enabled = true
  where id = p_program_id;
  insert into public.program_access (program_id, role_group_id)
  values (p_program_id, p_employee_role_group_id);

  -- Round-7 review fix (finding 3): capture the post-publication catalog
  -- HERE, in the same transaction as the publish flip -- the one place
  -- that can attest it independently, rather than backfilling it later
  -- from unverified receipt claims. content_import_release_records is
  -- otherwise fully immutable; this ONE narrow follow-up write is allowed
  -- by fn_guard_content_import_release_record only under the same
  -- service_role + bmh.release_import_id marker that gated the insert
  -- above, only from NULL to non-null, and only for this exact column --
  -- see that guard's comment.
  v_post_publication_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  update public.content_import_release_records
     set post_publication_catalog_sha256 = v_post_publication_catalog_sha256
   where import_id = p_import_id;

  return jsonb_build_object(
    'status', 'released',
    'import_id', p_import_id,
    'program_id', p_program_id,
    'catalog_sha256', v_catalog_sha256,
    'post_publication_catalog_sha256', v_post_publication_catalog_sha256
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Cutover phase 1 (this migration, one committed transaction): retire the v1
-- one-shot mechanism and remove EVERY admission path a resumed in-flight v1
-- call could use to write after this commit. The backfill that absorbs the
-- already-applied v1 history into the shared ledger deliberately lives in
-- the NEXT migration (its own committed transaction) -- a two-phase cutover.
-- Rationale: a v1 call that resolved the old function body before this
-- migration can block on the shared advisory lock and resume after commit;
-- with a single-phase cutover it could still slip a legacy receipt in AFTER
-- the backfill, leaving the shared ledger silently stale. With the
-- two-phase order, by the time the backfill transaction takes the same
-- advisory lock (a drain barrier for any straggler holding it), every write
-- path such a resumed call would use -- the content_blocks marker branch
-- and the v1 receipt table itself -- is already gone from committed state,
-- so its writes fail closed and the backfill sees a frozen v1 history.

-- Fill lineage columns automatically for any ledger insert that omits them
-- (the unchanged v1 quiz RPC, most importantly -- including an old-body quiz
-- ROLLBACK call that resumes after this migration commits). Classification
-- is by the row's own evidence operation: a rollback receipt that arrives
-- without lineage columns reverted the then-head (the old model only ever
-- rolled back the head), so its reverts/state-parent are derivable exactly;
-- a forward row's state parent is the previous head. Explicit values
-- (v2 forward/rollback, backfill) always win.
create or replace function public.fn_guard_content_import_release_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_head_revision integer;
  v_head_state_parent integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Content import release revisions are immutable.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.release_revision_import_id', true), '') <> new.import_id
  then
    raise exception 'Content import release revisions require the evidence-bound revision operation.'
      using errcode = '42501';
  end if;
  if new.state_parent_revision is null and new.reverts_revision is null then
    if coalesce(new.evidence ->> 'operation', '') = 'rollback' then
      -- Old-model rollback insert: it targeted (and reverted) the current
      -- head; the state it restored is that head's own state parent.
      select revision, coalesce(state_parent_revision, greatest(revision - 1, 1))
      into v_head_revision, v_head_state_parent
      from public.content_import_release_revisions
      where import_id = new.import_id
      order by revision desc
      limit 1;
      if v_head_revision is null then
        raise exception 'A rollback receipt cannot be the first ledger row for %.', new.import_id
          using errcode = '42501';
      end if;
      new.reverts_revision := v_head_revision;
      new.state_parent_revision := v_head_state_parent;
    else
      select coalesce(max(revision), 1) into new.state_parent_revision
      from public.content_import_release_revisions
      where import_id = new.import_id;
    end if;
  end if;
  return new;
end;
$$;

-- Classify every PRE-EXISTING ledger row's lineage. Legacy quiz rows predate
-- the lineage columns entirely: forward revisions (evidence operation
-- 'release') sat on strictly sequential history, so their state parent is
-- revision - 1; legacy rollback receipts (evidence operation 'rollback')
-- could only ever revert the then-head under the old model, so receipt N
-- reverted N - 1 and restored N - 2 (floor 1). Anything else -- an unknown
-- operation, or a legacy rollback stacked on another legacy rollback (which
-- the old model could not produce; its presence means tampered or corrupted
-- history) -- ABORTS the migration rather than guessing.
create or replace function public.fn_classify_legacy_ledger_lineage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_classified_forward integer := 0;
  v_classified_rollback integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Legacy ledger lineage classification requires service_role.'
      using errcode = '42501';
  end if;
  lock table public.content_import_release_revisions in access exclusive mode;

  if exists (
    select 1 from public.content_import_release_revisions row
    where row.state_parent_revision is null
      and row.reverts_revision is null
      and coalesce(row.evidence ->> 'operation', '') not in ('release', 'rollback')
  ) then
    raise exception 'Legacy ledger lineage classification aborted: a row carries an unrecognized evidence operation and cannot be classified.';
  end if;
  if exists (
    select 1
    from public.content_import_release_revisions receipt
    join public.content_import_release_revisions predecessor
      on predecessor.import_id = receipt.import_id
     and predecessor.revision = receipt.revision - 1
    where receipt.state_parent_revision is null
      and receipt.reverts_revision is null
      and coalesce(receipt.evidence ->> 'operation', '') = 'rollback'
      and coalesce(predecessor.evidence ->> 'operation', '') = 'rollback'
  ) then
    raise exception 'Legacy ledger lineage classification aborted: a legacy rollback receipt sits directly on another rollback receipt, which the pre-lineage model could not produce.';
  end if;

  alter table public.content_import_release_revisions
    disable trigger content_import_release_revisions_guard;
  update public.content_import_release_revisions row
  set state_parent_revision = greatest(row.revision - 1, 1)
  where row.state_parent_revision is null
    and row.reverts_revision is null
    and coalesce(row.evidence ->> 'operation', '') = 'release';
  get diagnostics v_classified_forward = row_count;
  update public.content_import_release_revisions row
  set reverts_revision = row.revision - 1,
      state_parent_revision = greatest(row.revision - 2, 1)
  where row.state_parent_revision is null
    and row.reverts_revision is null
    and coalesce(row.evidence ->> 'operation', '') = 'rollback';
  get diagnostics v_classified_rollback = row_count;
  alter table public.content_import_release_revisions
    enable trigger content_import_release_revisions_guard;

  return jsonb_build_object(
    'status', 'classified',
    'forward_rows', v_classified_forward,
    'rollback_rows', v_classified_rollback
  );
end;
$$;

revoke all on function public.fn_classify_legacy_ledger_lineage()
  from public, anon, authenticated;
grant execute on function public.fn_classify_legacy_ledger_lineage()
  to service_role;

-- Classify existing history now, as part of this migration.
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_classify_legacy_ledger_lineage();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

-- Seal the v1 receipt table entirely: read-only history from here on. The
-- old guard admitted marker-bound inserts, and a resumed in-flight v1 call
-- sets those markers itself -- so the seal must not depend on markers.
create or replace function public.fn_guard_import_released_content_block_revision_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Released content block v1 revision records are sealed read-only history; the v1 mechanism is retired and its receipts are mirrored in content_import_release_revisions.'
    using errcode = '42501';
end;
$$;

-- Retire the v1 one-shot RPC. It was pinned to the exact already-consumed
-- 44-block payload (its checksums can never match a second time), and
-- leaving it callable would let a replay attempt mutate guard markers and
-- interleave with the shared ledger this migration establishes. The v1
-- audit table remains as sealed history.
create or replace function public.fn_revise_released_content_blocks_v1(
  p_import_id text,
  p_expected_active_manifest_sha256 text,
  p_manifest_sha256 text,
  p_expected_catalog_sha256 text,
  p_mutations jsonb,
  p_client_payload_sha256 text,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'fn_revise_released_content_blocks_v1 is retired: its one-shot payload was already applied and is mirrored in content_import_release_revisions. Use fn_revise_released_content_blocks_v2.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_revise_released_content_blocks_v1(
  text, text, text, text, jsonb, text, jsonb, text
) from public, anon, authenticated, service_role;

-- Retire the released-poster and released-caption replacement RPCs
-- (20260722043000, 20260722235500) as part of the same phase-1 cutover.
-- Both mutate the RELEASED catalog under their own compare-and-swap but
-- never write the shared ledger and never take the canonical catalog-hash
-- lock set -- a post-cutover call would leave content_import_active_release_v1
-- pointing at a catalog checksum that no longer matches reality, and the
-- next v2 revision would fail its CAS against a state the ledger cannot
-- explain. Their already-applied history is absorbed into the shared ledger
-- as validated legacy_catalog_correction lineage rows by the phase-2
-- backfill (20260727180500). A future released poster/caption correction
-- must extend the versioned v2 mechanism deliberately instead. The CANARY
-- path (fn_replace_unreleased_imported_video_posters) is untouched: it
-- hard-requires an unreleased, unpublished import, so it can never move a
-- released catalog.
create or replace function public.fn_replace_released_imported_video_posters(
  p_import_id text,
  p_replacements jsonb,
  p_client_payload_sha256 text,
  p_approval_evidence_sha256 text,
  p_expected_catalog_sha256 text,
  p_preflight_evidence_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'fn_replace_released_imported_video_posters is retired: released-catalog corrections must go through the versioned shared ledger (fn_revise_released_content_blocks_v2); extend it deliberately for poster paths. Its applied history is mirrored in content_import_release_revisions.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_replace_released_imported_video_posters(
  text, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.fn_replace_released_imported_video_captions(
  p_import_id text,
  p_replacements jsonb,
  p_client_payload_sha256 text,
  p_approval_evidence_sha256 text,
  p_expected_catalog_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'fn_replace_released_imported_video_captions is retired: released-catalog corrections must go through the versioned shared ledger (fn_revise_released_content_blocks_v2); extend it deliberately for caption paths. Its applied history is mirrored in content_import_release_revisions.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_replace_released_imported_video_captions(
  text, jsonb, text, text, text
) from public, anon, authenticated, service_role;

-- Seal both receipt tables unconditionally (same pattern as the v1
-- content-block receipt seal above): with the RPCs retired, no legitimate
-- writer remains, and a resumed in-flight old-body call must not be able to
-- slip a receipt in after the phase-2 backfill has absorbed the history.
create or replace function public.fn_guard_import_video_poster_replacement_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Released video poster replacement records are sealed read-only history; the replacement RPC is retired and its receipts are mirrored in content_import_release_revisions.'
    using errcode = '42501';
end;
$$;

create or replace function public.fn_guard_import_video_caption_replacement_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Released video caption replacement records are sealed read-only history; the replacement RPC is retired and its receipts are mirrored in content_import_release_revisions.'
    using errcode = '42501';
end;
$$;

-- Atomic three-key content merge for the admin role-play block editor. The
-- app-level read-merge-replace it replaces had a race: a backend publish
-- landing between the editor's SELECT and UPDATE was silently overwritten
-- by the recomputed full-content payload. This merges exactly the three
-- form-exposed fields onto the LIVE row in a single statement -- AND it is
-- a compare-and-swap: p_expected_scenario_id is the scenario binding the
-- admin's browser LOADED, and if the live row's binding has since moved
-- (e.g. a publication rebound the block to a new scenario), the merge
-- refuses by matching zero rows instead of silently writing the stale
-- binding back over the new one. The caller surfaces that as a
-- reload-and-retry conflict.
--
-- Round-7 review fix: this used to be plain SECURITY INVOKER SQL, relying
-- entirely on RLS for authorization -- but that meant it could mutate a
-- RELEASED import's live catalog with no lock, no CAS against the shared
-- ledger, and no receipt: the exact out-of-ledger mutation class retiring
-- the poster/caption RPCs was supposed to close. If the block belongs to a
-- tracked import, this now takes the canonical catalog locks and appends a
-- `legacy_catalog_correction`-shaped ledger receipt in the SAME
-- transaction as the CAS update, so a future v2 revision/rollback's catalog
-- checksum always accounts for it. That requires SECURITY DEFINER (writing
-- the ledger needs elevated privilege the calling admin session does not
-- have), so authorization is now checked EXPLICITLY inside the function
-- body -- replicating the exact predicate the content_blocks RLS policy
-- itself uses (public.is_admin + public.fn_actor_may_access_catalog_entity_v1)
-- rather than relying on RLS to gate a SECURITY DEFINER function, which RLS
-- does not do.
create or replace function public.fn_admin_merge_role_play_block_content(
  p_block_id uuid,
  p_expected_scenario_id text,
  p_scenario_id text,
  p_title text,
  p_height_px integer,
  p_is_required_for_completion boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_row public.content_blocks%rowtype;
  v_prior_manifest text;
  v_prior_catalog text;
  v_new_catalog text;
  v_next_revision integer;
  v_payload_sha256 text;
  v_saved_role text;
begin
  -- service_role is already fully trusted everywhere else in this system
  -- (it bypasses RLS outright); the admin-session path below exists to
  -- replicate the RLS predicate a regular authenticated admin session would
  -- otherwise be checked against, since SECURITY DEFINER bypasses RLS.
  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      public.is_admin(auth.uid())
      and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'content_blocks', p_block_id)
    )
  then
    raise exception 'Not authorized to edit this content block.'
      using errcode = '42501';
  end if;

  select coalesce(lesson.content_import_id, course.content_import_id) into v_import_id
  from public.content_blocks block
  join public.lessons lesson on lesson.id = block.lesson_id
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where block.id = p_block_id;

  -- Only a RELEASED import has an active catalog/ledger to protect --
  -- mid-QA content carries content_import_id before it is ever released,
  -- and fn_revise_released_content_blocks_v2 itself refuses to run against
  -- an import with no release record, so there is nothing for this write
  -- to desynchronize yet.
  if v_import_id is not null and not exists (
    select 1 from public.content_import_release_records release
    where release.import_id = v_import_id
  ) then
    v_import_id := null;
  end if;

  if v_import_id is null then
    -- Not part of any RELEASED import: a plain CAS merge, matching the
    -- previous behavior exactly (no ledger involved -- there is no catalog
    -- to keep in sync for content this mechanism never tracks).
    update public.content_blocks
       set content = content || jsonb_build_object(
             'scenario_id', p_scenario_id, 'title', p_title, 'height_px', p_height_px
           ),
           is_required_for_completion = p_is_required_for_completion
     where id = p_block_id
       and block_type = 'role_play'
       and content ->> 'scenario_id' is not distinct from p_expected_scenario_id
    returning * into v_row;
    if not found then
      return null;
    end if;
    return to_jsonb(v_row.content);
  end if;

  -- Tracked import: route under the SAME canonical locks every revision RPC
  -- uses, so a concurrent v2 revision/rollback/backfill cannot compute a
  -- catalog checksum that silently omits this edit.
  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  lock table public.content_import_release_records, public.content_import_release_revisions
    in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  select active.active_manifest_sha256 into v_prior_manifest
  from public.content_import_active_release_v1 active
  where active.import_id = v_import_id;
  v_prior_catalog := public.fn_course_import_catalog_sha256(v_import_id);

  update public.content_blocks
     set content = content || jsonb_build_object(
           'scenario_id', p_scenario_id, 'title', p_title, 'height_px', p_height_px
         ),
         is_required_for_completion = p_is_required_for_completion
   where id = p_block_id
     and block_type = 'role_play'
     and content ->> 'scenario_id' is not distinct from p_expected_scenario_id
  returning * into v_row;
  if not found then
    return null;
  end if;

  v_new_catalog := public.fn_course_import_catalog_sha256(v_import_id);
  v_payload_sha256 := encode(sha256(convert_to(jsonb_build_object(
    'block_id', p_block_id, 'scenario_id', p_scenario_id, 'title', p_title,
    'height_px', p_height_px, 'is_required_for_completion', p_is_required_for_completion
  )::text, 'UTF8')), 'hex');

  select coalesce(max(revision), 1) + 1 into v_next_revision
  from public.content_import_release_revisions
  where import_id = v_import_id;

  -- The ledger insert guard requires service_role (it protects against an
  -- arbitrary client writing a fake receipt directly); this function's OWN
  -- authorization check above is the real gate for THIS specific, vetted
  -- write path, so it temporarily asserts service_role for the insert and
  -- restores the caller's real role immediately after -- the same
  -- elevate-for-one-write pattern used throughout this migration set for
  -- SECURITY DEFINER functions that append evidence on a caller's behalf.
  v_saved_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('bmh.release_revision_import_id', v_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256,
    payload_sha256, client_payload_sha256,
    evidence, revised_by
  ) values (
    v_import_id, v_next_revision, 'legacy_catalog_correction', v_next_revision - 1,
    v_prior_manifest, v_prior_manifest,
    v_prior_catalog, v_new_catalog,
    v_payload_sha256, v_payload_sha256,
    jsonb_build_object('operation', 'admin_role_play_scenario_bind', 'block_id', p_block_id),
    auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);
  perform set_config('request.jwt.claim.role', coalesce(v_saved_role, ''), true);

  return to_jsonb(v_row.content);
end;
$$;

revoke all on function public.fn_admin_merge_role_play_block_content(
  uuid, text, text, text, integer, boolean
) from public, anon;
grant execute on function public.fn_admin_merge_role_play_block_content(
  uuid, text, text, text, integer, boolean
) to authenticated, service_role;

-- Generalize the content_blocks insert guard. Preserve migration 033's base
-- apply-path branch; add one branch bound to the v2 mechanism's own session
-- markers. The v1 one-shot marker branch (the hardcoded 68508b6a... payload
-- hash) is deliberately REMOVED, not preserved: a resumed in-flight v1 call
-- sets those markers itself, so preserving the branch would leave a live
-- legacy admission path after the v1 RPC's retirement.
create or replace function public.fn_guard_imported_content_block_insert_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_program_id uuid;
  v_course_published boolean;
  v_program_published boolean;
  v_apply_import_id text :=
    coalesce(current_setting('bmh.apply_import_id', true), '');
  v_revision_v2_import_id text :=
    coalesce(current_setting('bmh.revise_content_blocks_v2_import_id', true), '');
  v_revision_v2_payload_sha256 text :=
    coalesce(current_setting('bmh.revise_content_blocks_v2_payload_sha256', true), '');
begin
  select
    coalesce(lesson.content_import_id, course.content_import_id),
    course.is_published,
    program.is_published,
    program.id
  into v_import_id, v_course_published, v_program_published, v_program_id
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  left join public.program_courses membership on membership.course_id = course.id
  left join public.programs program on program.id = membership.program_id
  where lesson.id = new.lesson_id;

  if v_import_id is null then return new; end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_apply_import_id = v_import_id
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_revision_v2_import_id = v_import_id
    and v_revision_v2_payload_sha256 ~ '^[0-9a-f]{64}$'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.program_id = v_program_id
    )
  then
    return new;
  end if;
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v2()
  from public, anon, authenticated;

drop trigger if exists guard_imported_catalog_insert on public.content_blocks;
create trigger guard_imported_catalog_insert
before insert on public.content_blocks
for each row execute function public.fn_guard_imported_content_block_insert_v2();

-- Resolves the canonical FORWARD revision whose state the catalog is
-- currently in, by walking restored-state pointers from the head of the
-- shared sequence. A single-step look at the head row is not enough: a
-- rollback can restore a state that is itself a rollback receipt (chained
-- rollbacks), so the walk continues until it lands on a forward row.
create or replace function public.fn_current_state_revision(p_import_id text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cursor integer;
  v_reverts integer;
  v_state_parent integer;
  v_steps integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Current state resolution requires service_role.'
      using errcode = '42501';
  end if;
  select max(revision) into v_cursor
  from public.content_import_release_revisions
  where import_id = p_import_id;
  if v_cursor is null then
    -- No revisions: the catalog is in the original release state.
    return 1;
  end if;
  loop
    select reverts_revision, state_parent_revision
    into v_reverts, v_state_parent
    from public.content_import_release_revisions
    where import_id = p_import_id and revision = v_cursor;
    if not found then
      raise exception 'State lineage for % is broken: revision % is referenced but absent.',
        p_import_id, v_cursor;
    end if;
    if v_reverts is null then
      return v_cursor;
    end if;
    if v_state_parent is null then
      raise exception 'State lineage for % is broken: rollback receipt % records no restored state.',
        p_import_id, v_cursor;
    end if;
    if v_state_parent = 1 then
      -- Restored all the way back to the original release state.
      return 1;
    end if;
    if v_state_parent >= v_cursor then
      raise exception 'State lineage for % is broken: receipt % points forward to %.',
        p_import_id, v_cursor, v_state_parent;
    end if;
    v_cursor := v_state_parent;
    v_steps := v_steps + 1;
    if v_steps > 10000 then
      raise exception 'State lineage for % did not terminate.', p_import_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.fn_current_state_revision(text)
  from public, anon, authenticated;
grant execute on function public.fn_current_state_revision(text) to service_role;

-- Classify a SPECIFIC forward revision's standing relative to the current
-- state, for the controller's postflight check. A bare revision-number
-- comparison (postActiveRevision > rpc.revision) cannot distinguish "later
-- activity built on top of this revision" from "a rollback reverted this
-- revision back to an earlier ancestor" -- a rollback receipt is ALSO a
-- greater revision number.
--
-- Classification consults the COMPLETE immutable reverts history plus the
-- current state's ancestry chain (an earlier version of this function
-- range-checked rollback receipts only along a single walk from the head
-- row, which mislabeled targets after CHAINED rollbacks: with rev3 applied,
-- rev4 reverting rev3, and rev5 reverting rev2, the head walk jumped
-- rev5 -> rev1 and never visited rev4, so rev3 came back "diverged" instead
-- of "reverted"):
--   * active_head -- p_revision IS the current resolved state
--     (fn_current_state_revision), including a state RESTORED by rollbacks.
--   * reverted    -- some rollback receipt anywhere in history records
--                    reverts_revision = p_revision and the state was not
--                    since restored to it (the active_head check runs
--                    first, so a restored state never reaches this branch).
--   * superseded  -- p_revision is a genuine causal ancestor of the current
--                    state: it is reachable by walking BACKWARD from the
--                    current state along two edges -- state_parent_revision
--                    (the normal forward/rollback chain) AND
--                    absorbed_into_revision (see that column's comment --
--                    a backfilled row whose effect was already embedded in
--                    a LATER, already-existing, immutable row's own live
--                    state at the time that row was originally applied,
--                    which cannot be spliced into the immutable row's own
--                    state_parent_revision after the fact). Without the
--                    second edge, a legacy correction backfilled BEFORE an
--                    existing quiz revision in true causal time -- but
--                    necessarily numbered AFTER it, since the ledger can
--                    only append -- would classify diverged even though
--                    the quiz revision's own catalog already reflects it.
--   * diverged    -- none of the above: the lineage does not connect this
--                    revision to the current state (broken/corrupted chain,
--                    or a rollback receipt row was passed -- receipts are
--                    state transitions, not states, and are never classified
--                    as active/superseded).
--   * unknown     -- p_revision does not exist for this import.
create or replace function public.fn_classify_revision_lineage(
  p_import_id text,
  p_revision integer
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_state integer;
  v_target_reverts integer;
  v_worklist integer[];
  v_visited integer[] := '{}';
  v_node integer;
  v_state_parent integer;
  v_absorbed integer;
  v_steps integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Revision lineage classification requires service_role.'
      using errcode = '42501';
  end if;
  select reverts_revision into v_target_reverts
  from public.content_import_release_revisions
  where import_id = p_import_id and revision = p_revision;
  if not found then
    return 'unknown';
  end if;
  if v_target_reverts is not null then
    -- Rollback receipts are state TRANSITIONS, not states: they are never
    -- the active head and never "superseded by" anything -- even though a
    -- later forward revision's state-parent pointer may name one (forward
    -- rows record the previous head ROW, which the state walk resolves
    -- through). Classify them out explicitly.
    return 'diverged';
  end if;

  v_current_state := public.fn_current_state_revision(p_import_id);
  if p_revision = v_current_state then
    return 'active_head';
  end if;

  -- Complete reverts history: was this exact revision ever undone by a
  -- rollback receipt? Order-independent -- chained rollbacks elsewhere in
  -- the sequence cannot hide the receipt that names this revision.
  if exists (
    select 1 from public.content_import_release_revisions
    where import_id = p_import_id and reverts_revision = p_revision
  ) then
    return 'reverted';
  end if;

  -- Ancestry: breadth-first walk backward from the current state along
  -- BOTH edges. state_parent_revision alone (a single chain) cannot express
  -- a backfilled row absorbed into an existing, immutable row it causally
  -- precedes but is numbered after -- absorbed_into_revision is the second
  -- edge that makes it reachable without ever rewriting that immutable row.
  v_worklist := array[v_current_state];
  while cardinality(v_worklist) > 0 loop
    v_node := v_worklist[1];
    v_worklist := v_worklist[2:cardinality(v_worklist)];
    if v_node = p_revision then
      return 'superseded';
    end if;
    if v_node = any(v_visited) then
      continue;
    end if;
    v_visited := v_visited || v_node;
    v_steps := v_steps + 1;
    if v_steps > 10000 then
      return 'diverged';
    end if;
    if v_node > 1 then
      select state_parent_revision into v_state_parent
      from public.content_import_release_revisions
      where import_id = p_import_id and revision = v_node;
      if v_state_parent is not null and v_state_parent < v_node then
        v_worklist := v_worklist || v_state_parent;
      end if;
    end if;
    for v_absorbed in
      select revision from public.content_import_release_revisions
      where import_id = p_import_id and absorbed_into_revision = v_node
    loop
      v_worklist := v_worklist || v_absorbed;
    end loop;
  end loop;
  return 'diverged';
end;
$$;

revoke all on function public.fn_classify_revision_lineage(text, integer)
  from public, anon, authenticated;
grant execute on function public.fn_classify_revision_lineage(text, integer) to service_role;

-- Redefine fn_revise_released_quizzes_v1 (from 20260722130000) unchanged
-- except for its lock statement, per round-6 review finding 3: the original
-- lock set predates fn_course_import_catalog_lock_tables and omitted
-- program_courses, program_access, course_access, role_groups, and
-- assignments -- all read by fn_course_import_catalog_sha256. Editing
-- 20260722130000 in place would rewrite an already-applied migration's
-- history, so the fix lands here as a create-or-replace override instead;
-- CREATE OR REPLACE FUNCTION preserves the existing grants.
create or replace function public.fn_revise_released_quizzes_v1(
  p_import_id text,
  p_expected_prior_manifest_sha256 text,
  p_manifest_sha256 text,
  p_quizzes jsonb,
  p_questions jsonb,
  p_answer_options jsonb,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.content_import_release_records%rowtype;
  v_active_revision integer;
  v_active_manifest_sha256 text;
  v_active_catalog_sha256 text;
  v_active_evidence jsonb;
  v_prior_catalog_sha256 text;
  v_catalog_sha256 text;
  v_payload_sha256 text;
  v_revision integer;
  v_quiz_ids uuid[];
  v_question_ids uuid[];
  v_option_ids uuid[];
  v_lesson_ids uuid[];
  v_prior_graph jsonb;
  v_invalidated_attempts jsonb;
  v_invalidated_count integer := 0;
  v_deleted_questions integer := 0;
  v_deleted_options integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released quiz revision requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_prior_manifest_sha256 !~ '^[a-f0-9]{64}$'
    or p_manifest_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Released quiz revision refused: invalid identity or manifest checksum.'
      using errcode = '22023';
  end if;
  if p_confirmation is distinct from
    'REVISE-RELEASED-QUIZZES:' || p_import_id || ':'
      || p_expected_prior_manifest_sha256 || ':' || p_manifest_sha256 || ':19:920'
  then
    raise exception 'Released quiz revision refused: confirmation mismatch.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_quizzes) is distinct from 'array'
    or jsonb_array_length(p_quizzes) <> 19
    or jsonb_typeof(p_questions) is distinct from 'array'
    or jsonb_array_length(p_questions) <> 920
    or jsonb_typeof(p_answer_options) is distinct from 'array'
    or jsonb_array_length(p_answer_options) < 1840
    or jsonb_array_length(p_answer_options) > 10000
  then
    raise exception 'Released quiz revision refused: expected exactly 19 quizzes and 920 questions.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'operation' <> 'release'
    or not (p_evidence ?& array[
      'question_bank_sha256', 'approval_request_sha256',
      'approval_ledger_sha256', 'rollback_sha256', 'client_graph_sha256'
    ])
    or exists (
      select 1
      from jsonb_each_text(p_evidence) item
      where item.key = any(array[
        'question_bank_sha256', 'approval_request_sha256',
        'approval_ledger_sha256', 'rollback_sha256', 'client_graph_sha256'
      ]) and item.value !~ '^[a-f0-9]{64}$'
    )
  then
    raise exception 'Released quiz revision refused: checksum-bound evidence is incomplete.'
      using errcode = '22023';
  end if;

  -- Reject extra or missing fields instead of letting jsonb_to_recordset ignore
  -- payload drift.
  if exists (
    select 1 from jsonb_array_elements(p_quizzes) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array[
          'description','id','max_attempts','passing_score','questions_per_attempt',
          'randomize_answers','randomize_questions','retake_cooldown_hours',
          'show_correct_answers_after','title'
        ]::text[]
  ) or exists (
    select 1 from jsonb_array_elements(p_questions) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array[
          'explanation','id','points','question_text','question_type','quiz_id','sort_order'
        ]::text[]
  ) or exists (
    select 1 from jsonb_array_elements(p_answer_options) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array['id','is_correct','option_text','question_id','sort_order']::text[]
  ) then
    raise exception 'Released quiz revision refused: payload row shape mismatch.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  -- Ledger and quiz-review tables plus the full canonical catalog-hash
  -- table set (see fn_course_import_catalog_lock_tables), fixed in round 6
  -- review: the prior lock set omitted program_courses, program_access,
  -- course_access, role_groups, and assignments, all of which
  -- fn_course_import_catalog_sha256 reads -- a concurrent write to any of
  -- them could land between this transaction's hash computation and its
  -- commit.
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  select * into v_release
  from public.content_import_release_records release
  where release.import_id = p_import_id;
  if not found
    or not exists (
      select 1 from public.programs program
      where program.id = v_release.program_id
        and program.content_import_id = p_import_id
        and program.is_published
    )
    or exists (
      select 1
      from public.program_courses link
      join public.courses course on course.id = link.course_id
      where link.program_id = v_release.program_id and not course.is_published
    )
  then
    raise exception 'Released quiz revision refused: exact published release was not found.'
      using errcode = '42501';
  end if;
  if p_import_id <> 'bmh-employee-training-v1'
    or v_release.manifest_sha256 <> '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
  then
    raise exception 'Released quiz revision refused: operation is not bound to the immutable BMH release receipt.'
      using errcode = '42501';
  end if;

  select coalesce(max(revision), 1) into v_active_revision
  from public.content_import_release_revisions
  where import_id = p_import_id;
  if v_active_revision = 1 then
    v_active_manifest_sha256 := v_release.manifest_sha256;
    v_active_catalog_sha256 := v_release.catalog_sha256;
    v_active_evidence := '{}'::jsonb;
  else
    select manifest_sha256, catalog_sha256, evidence
      into strict v_active_manifest_sha256, v_active_catalog_sha256, v_active_evidence
    from public.content_import_release_revisions
    where import_id = p_import_id and revision = v_active_revision;
  end if;

  if v_active_manifest_sha256 = p_manifest_sha256 then
    v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
    if p_expected_prior_manifest_sha256 = p_manifest_sha256
      or v_catalog_sha256 <> v_active_catalog_sha256
      or v_active_evidence ->> 'question_bank_sha256' is distinct from p_evidence ->> 'question_bank_sha256'
      or v_active_evidence ->> 'approval_request_sha256' is distinct from p_evidence ->> 'approval_request_sha256'
      or v_active_evidence ->> 'approval_ledger_sha256' is distinct from p_evidence ->> 'approval_ledger_sha256'
      or v_active_evidence ->> 'rollback_sha256' is distinct from p_evidence ->> 'rollback_sha256'
      or v_active_evidence ->> 'client_graph_sha256' is distinct from p_evidence ->> 'client_graph_sha256'
    then
      raise exception 'Released quiz revision retry refused: committed identity or live catalog checksum mismatch.'
        using errcode = '40001';
    end if;
    return jsonb_build_object(
      'status', 'already_revised',
      'import_id', p_import_id,
      'revision', v_active_revision,
      'manifest_sha256', p_manifest_sha256,
      'catalog_sha256', v_catalog_sha256
    );
  end if;
  if v_active_manifest_sha256 <> p_expected_prior_manifest_sha256 then
    raise exception 'Released quiz revision refused: active manifest changed after preflight.'
      using errcode = '40001';
  end if;

  select
    coalesce(array_agg(lesson.id order by lesson.id), '{}'::uuid[]),
    coalesce(array_agg(lesson.quiz_id order by lesson.quiz_id), '{}'::uuid[])
    into v_lesson_ids, v_quiz_ids
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
    and lesson.quiz_id is not null;
  if cardinality(v_quiz_ids) <> 19 then
    raise exception 'Released quiz revision refused: published import does not own exactly 19 quizzes.'
      using errcode = '22023';
  end if;

  select array_agg(row.id order by row.id) into v_question_ids
  from jsonb_to_recordset(p_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  );
  select array_agg(row.id order by row.id) into v_option_ids
  from jsonb_to_recordset(p_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  );

  if (select count(distinct row.id) from jsonb_to_recordset(p_quizzes) as row(
      id uuid, title text, description text, passing_score integer,
      randomize_questions boolean, randomize_answers boolean,
      questions_per_attempt integer, max_attempts integer,
      retake_cooldown_hours integer, show_correct_answers_after text
    )) <> 19
    or (select array_agg(row.id order by row.id) from jsonb_to_recordset(p_quizzes) as row(
      id uuid, title text, description text, passing_score integer,
      randomize_questions boolean, randomize_answers boolean,
      questions_per_attempt integer, max_attempts integer,
      retake_cooldown_hours integer, show_correct_answers_after text
    )) <> v_quiz_ids
    or exists (
      select 1 from jsonb_to_recordset(p_quizzes) as row(
        id uuid, title text, description text, passing_score integer,
        randomize_questions boolean, randomize_answers boolean,
        questions_per_attempt integer, max_attempts integer,
        retake_cooldown_hours integer, show_correct_answers_after text
      )
      where row.passing_score <> 80
        or row.questions_per_attempt is not null
        or not row.randomize_questions
        or not row.randomize_answers
        or row.max_attempts is not null
        or row.retake_cooldown_hours <> 0
        or row.show_correct_answers_after <> 'after_pass'
        or nullif(btrim(row.title), '') is null
    )
  then
    raise exception 'Released quiz revision refused: quiz identity or exhaustive-delivery contract mismatch.'
      using errcode = '22023';
  end if;

  if (select count(distinct id) from unnest(v_question_ids) id) <> 920
    or (select count(distinct id) from unnest(v_option_ids) id) <> jsonb_array_length(p_answer_options)
    or exists (
      select 1 from jsonb_to_recordset(p_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      )
      where row.quiz_id <> all(v_quiz_ids)
        or row.question_type not in ('true_false', 'single_choice', 'multi_select')
        or nullif(btrim(row.question_text), '') is null
        or row.points < 0 or row.sort_order < 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      )
      group by row.quiz_id, row.sort_order having count(*) <> 1
    )
    or exists (
      select 1 from jsonb_to_recordset(p_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      )
      where row.question_id <> all(v_question_ids)
        or nullif(btrim(row.option_text), '') is null or row.sort_order < 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      )
      group by row.question_id, row.sort_order having count(*) <> 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_questions)
        as question(id uuid, quiz_id uuid, question_text text, question_type text,
          explanation text, points integer, sort_order integer)
      left join lateral (
        select count(*) as option_count,
          count(*) filter (where option.is_correct) as correct_count
        from jsonb_to_recordset(p_answer_options)
          as option(id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer)
        where option.question_id = question.id
      ) totals on true
      where totals.option_count < 2
        or totals.correct_count < 1
        or (question.question_type in ('single_choice', 'true_false') and totals.correct_count <> 1)
        or (question.question_type = 'multi_select' and totals.correct_count < 2)
        or (question.question_type = 'true_false' and totals.option_count <> 2)
    )
  then
    raise exception 'Released quiz revision refused: question or answer-option graph mismatch.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.questions question
    where question.id = any(v_question_ids) and question.quiz_id <> all(v_quiz_ids)
  ) or exists (
    select 1 from public.answer_options option
    where option.id = any(v_option_ids) and option.question_id <> all(v_question_ids)
  ) then
    raise exception 'Released quiz revision refused: replacement IDs collide outside the released graph.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.course_import_reviewer_answer_options_v1 evidence
    join public.questions question on question.id = evidence.question_id
    where evidence.import_id = p_import_id
      and question.quiz_id = any(v_quiz_ids)
      and (
        evidence.question_id <> all(v_question_ids)
        or evidence.answer_option_id <> all(v_option_ids)
      )
  ) then
    raise exception 'Released quiz revision refused: reviewer-authored option evidence depends on replaced rows.'
      using errcode = '23503';
  end if;

  -- This no-user release is only reversible while no completed quiz activity
  -- exists. Refuse the forward mutation instead of promising an unsafe rollback.
  if exists (
    select 1 from public.user_quiz_attempts attempt
    where attempt.quiz_id = any(v_quiz_ids)
      and attempt.completed_at is not null
  ) then
    raise exception 'Released quiz revision refused: completed quiz activity exists.'
      using errcode = '23503';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_active_revision > 1 and v_prior_catalog_sha256 <> v_active_catalog_sha256 then
    raise exception 'Released quiz revision refused: live catalog changed after the active release receipt.'
      using errcode = '40001';
  end if;
  select jsonb_build_object(
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', quiz.id, 'title', quiz.title, 'description', quiz.description,
        'passing_score', quiz.passing_score,
        'randomize_questions', quiz.randomize_questions,
        'randomize_answers', quiz.randomize_answers,
        'questions_per_attempt', quiz.questions_per_attempt,
        'max_attempts', quiz.max_attempts,
        'retake_cooldown_hours', quiz.retake_cooldown_hours,
        'show_correct_answers_after', quiz.show_correct_answers_after
      ) order by quiz.id)
      from public.quizzes quiz where quiz.id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id, 'quiz_id', question.quiz_id,
        'question_text', question.question_text,
        'question_type', question.question_type,
        'explanation', question.explanation, 'points', question.points,
        'sort_order', question.sort_order
      ) order by question.id)
      from public.questions question where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'answer_options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id, 'question_id', option.question_id,
        'option_text', option.option_text, 'is_correct', option.is_correct,
        'sort_order', option.sort_order
      ) order by option.id)
      from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb)
  ) into v_prior_graph;

  if v_active_manifest_sha256 = '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    and (
      jsonb_array_length(v_prior_graph -> 'quizzes') <> 19
      or jsonb_array_length(v_prior_graph -> 'questions') <> 342
      or jsonb_array_length(v_prior_graph -> 'answer_options') <> 1292
      or exists (
        select 1
        from jsonb_to_recordset(v_prior_graph -> 'quizzes') as row(
          id uuid, title text, description text, passing_score integer,
          randomize_questions boolean, randomize_answers boolean,
          questions_per_attempt integer, max_attempts integer,
          retake_cooldown_hours integer, show_correct_answers_after text
        )
        where row.questions_per_attempt is distinct from 10
      )
    )
  then
    raise exception 'Released quiz revision refused: live legacy graph no longer matches the archived 19/342/1292 capped release.'
      using errcode = '40001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(attempt) order by attempt.id), '[]'::jsonb)
    into v_invalidated_attempts
  from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;

  delete from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  get diagnostics v_invalidated_count = row_count;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.answer_options option
  using public.questions question
  where option.question_id = question.id
    and question.quiz_id = any(v_quiz_ids)
    and option.id <> all(v_option_ids);
  get diagnostics v_deleted_options = row_count;
  delete from public.questions question
  where question.quiz_id = any(v_quiz_ids)
    and question.id <> all(v_question_ids);
  get diagnostics v_deleted_questions = row_count;
  perform set_config('bmh.rollback_import_id', '', true);

  update public.quizzes quiz set
    title = row.title,
    description = row.description,
    passing_score = row.passing_score,
    randomize_questions = row.randomize_questions,
    randomize_answers = row.randomize_answers,
    questions_per_attempt = row.questions_per_attempt,
    max_attempts = row.max_attempts,
    retake_cooldown_hours = row.retake_cooldown_hours,
    show_correct_answers_after = row.show_correct_answers_after
  from jsonb_to_recordset(p_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  ) where quiz.id = row.id;

  perform set_config('bmh.apply_import_id', p_import_id, true);
  insert into public.questions (
    id, quiz_id, question_text, question_type, explanation, points, sort_order
  )
  select row.id, row.quiz_id, row.question_text, row.question_type,
    row.explanation, row.points, row.sort_order
  from jsonb_to_recordset(p_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  )
  on conflict (id) do update set
    quiz_id = excluded.quiz_id,
    question_text = excluded.question_text,
    question_type = excluded.question_type,
    explanation = excluded.explanation,
    points = excluded.points,
    sort_order = excluded.sort_order;

  insert into public.answer_options (
    id, question_id, option_text, is_correct, sort_order
  )
  select row.id, row.question_id, row.option_text, row.is_correct, row.sort_order
  from jsonb_to_recordset(p_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  )
  on conflict (id) do update set
    question_id = excluded.question_id,
    option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;
  perform set_config('bmh.apply_import_id', '', true);

  if (select count(*) from public.questions question where question.quiz_id = any(v_quiz_ids)) <> 920
    or (select count(*) from public.answer_options option join public.questions question
      on question.id = option.question_id where question.quiz_id = any(v_quiz_ids))
      <> jsonb_array_length(p_answer_options)
    or exists (
      select 1 from public.quizzes quiz
      where quiz.id = any(v_quiz_ids) and quiz.questions_per_attempt is not null
    )
  then
    raise exception 'Released quiz revision failed exact post-mutation reconciliation.';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  v_payload_sha256 := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'quizzes', p_quizzes,
        'questions', p_questions,
        'answer_options', p_answer_options
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_revision := v_active_revision + 1;

  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence, revised_by
  ) values (
    p_import_id, v_revision, p_expected_prior_manifest_sha256, p_manifest_sha256,
    v_prior_catalog_sha256, v_catalog_sha256, v_payload_sha256,
    19, 920, jsonb_array_length(p_answer_options),
    v_prior_graph, v_invalidated_attempts, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  return jsonb_build_object(
    'status', 'revised',
    'import_id', p_import_id,
    'revision', v_revision,
    'prior_manifest_sha256', p_expected_prior_manifest_sha256,
    'manifest_sha256', p_manifest_sha256,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_catalog_sha256,
    'payload_sha256', v_payload_sha256,
    'quizzes', 19,
    'questions', 920,
    'answer_options', jsonb_array_length(p_answer_options),
    'invalidated_incomplete_attempts', v_invalidated_count,
    'deleted_legacy_questions', v_deleted_questions,
    'deleted_legacy_answer_options', v_deleted_options
  );
end;
$$;

create or replace function public.fn_revise_released_content_blocks_v2(
  p_import_id text,
  p_expected_prior_manifest_sha256 text,
  p_manifest_sha256 text,
  p_expected_prior_catalog_sha256 text,
  p_mutations jsonb,
  p_client_payload_sha256 text,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required_keys constant text[] := array[
    'action',
    'source_key',
    'block_id',
    'lesson_id',
    'block_type',
    'expected_content',
    'replacement_content',
    'sort_order',
    'is_required_for_completion',
    'replacement_sha256',
    'replacement_size_bytes'
  ];
  -- The deliberately SMALL verified contract: the pilot and the planned
  -- oral-check rollout need exactly (a) inserting role_play blocks and
  -- (b) content-only updates to text/flashcard blocks. Every other mutation
  -- shape -- download inserts/updates, sort-order moves, required-state
  -- flips, other block types -- is rejected here AND at TS planning time
  -- with an explicit "unsupported in v2" error; extend both layers together,
  -- deliberately, when a real payload needs more.
  v_allowed_insert_block_types constant text[] := array['role_play'];
  v_allowed_update_block_types constant text[] := array['text', 'flashcard'];
  v_program_id uuid;
  v_active_revision integer;
  v_active_manifest_sha256 text;
  v_active_catalog_sha256 text;
  v_active_row public.content_import_release_revisions%rowtype;
  v_database_payload_sha256 text;
  v_download_evidence_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_update_count integer;
  v_insert_count integer;
  v_mutation_count integer;
  v_updated_count integer;
  v_inserted_count integer;
  v_target_count integer;
  v_prior_block_graph jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released content block revision requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Released content block revision refused: invalid import_id.'
      using errcode = '22023';
  end if;
  if p_expected_prior_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_prior_catalog_sha256 !~ '^[0-9a-f]{64}$'
    or p_client_payload_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision refused: invalid checksum shape.'
      using errcode = '22023';
  end if;
  if p_mutations is null
    or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) < 1
    or jsonb_array_length(p_mutations) > 500
  then
    raise exception 'Released content block revision refused: mutations must be a non-empty array of at most 500 rows.'
      using errcode = '22023';
  end if;
  v_mutation_count := jsonb_array_length(p_mutations);

  -- Compute PostgreSQL's own canonical digest of the mutation payload before
  -- any further validation. This -- not the caller-supplied
  -- p_client_payload_sha256 -- is what the required confirmation string
  -- binds to below, so a stale or buggy caller cannot apply a different
  -- payload than the one an operator actually reviewed and confirmed.
  -- p_client_payload_sha256 (computed client-side over JS's own JSON
  -- canonicalization) is retained only as an audit trail cross-reference;
  -- it is expected to differ byte-for-byte from this value in general
  -- (different serialization rules), so it is never compared to it.
  v_database_payload_sha256 :=
    encode(sha256(convert_to(p_mutations::text, 'UTF8')), 'hex');

  if exists (
    select 1
    from jsonb_array_elements(p_mutations) mutation(value)
    where jsonb_typeof(mutation.value) <> 'object'
      or not mutation.value ?& v_required_keys
      or mutation.value - v_required_keys <> '{}'::jsonb
      or jsonb_typeof(mutation.value -> 'action') <> 'string'
      or mutation.value ->> 'action' not in ('update', 'insert')
      or jsonb_typeof(mutation.value -> 'source_key') <> 'string'
      or mutation.value ->> 'source_key' !~ '^block-[a-z0-9][a-z0-9-]{0,120}$'
      or jsonb_typeof(mutation.value -> 'block_id') <> 'string'
      or mutation.value ->> 'block_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(mutation.value -> 'lesson_id') <> 'string'
      or mutation.value ->> 'lesson_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(mutation.value -> 'block_type') <> 'string'
      or (
        mutation.value ->> 'action' = 'insert'
        and not (mutation.value ->> 'block_type' = any(v_allowed_insert_block_types))
      )
      or (
        mutation.value ->> 'action' = 'update'
        and not (mutation.value ->> 'block_type' = any(v_allowed_update_block_types))
      )
      or jsonb_typeof(mutation.value -> 'replacement_content') <> 'object'
      or jsonb_typeof(mutation.value -> 'sort_order') <> 'number'
      or (mutation.value ->> 'sort_order')::numeric % 1 <> 0
      or (mutation.value ->> 'sort_order')::integer < 0
      or jsonb_typeof(mutation.value -> 'is_required_for_completion') <> 'boolean'
      or (
        mutation.value ->> 'action' = 'update'
        and jsonb_typeof(mutation.value -> 'expected_content') <> 'object'
      )
      or (
        mutation.value ->> 'action' = 'insert'
        and jsonb_typeof(mutation.value -> 'expected_content') <> 'null'
      )
      -- No supported mutation shape carries a storage-asset binding; these
      -- keys stay in the row contract (stable shape) but must be JSON null.
      or jsonb_typeof(mutation.value -> 'replacement_sha256') <> 'null'
      or jsonb_typeof(mutation.value -> 'replacement_size_bytes') <> 'null'
  ) then
    raise exception 'Released content block revision refused: unsupported mutation shape for v2 (supported: insert role_play, content-only update of text/flashcard; extend deliberately).'
      using errcode = '22023';
  end if;

  if (
    select count(distinct mutation.value ->> 'block_id')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> v_mutation_count or (
    select count(distinct mutation.value ->> 'source_key')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> v_mutation_count then
    raise exception 'Released content block revision refused: duplicate target identity.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_evidence) is distinct from 'object'
    or not (p_evidence ?& array['operation', 'manifest_sha256', 'expected_prior_catalog_sha256'])
    or p_evidence ->> 'operation' <> 'released_content_blocks_v2'
    or p_evidence ->> 'manifest_sha256' is distinct from p_manifest_sha256
    or p_evidence ->> 'expected_prior_catalog_sha256'
      is distinct from p_expected_prior_catalog_sha256
  then
    raise exception 'Released content block revision refused: checksum-bound evidence is incomplete.'
      using errcode = '22023';
  end if;

  -- Bound to PostgreSQL's own computed digest (v_database_payload_sha256),
  -- not a caller assertion -- see the comment where it is computed above.
  if p_confirmation is distinct from
    'REVISE-RELEASED-CONTENT-BLOCKS-V2:' || p_import_id || ':'
      || p_expected_prior_manifest_sha256 || ':' || p_manifest_sha256 || ':'
      || p_expected_prior_catalog_sha256 || ':' || v_database_payload_sha256 || ':'
      || v_mutation_count::text
  then
    raise exception 'Released content block revision refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  select
    count(*) filter (where mutation.value ->> 'action' = 'update'),
    count(*) filter (where mutation.value ->> 'action' = 'insert')
  into v_update_count, v_insert_count
  from jsonb_array_elements(p_mutations) mutation(value);

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  -- Ledger tables plus every table fn_course_import_catalog_sha256 reads
  -- (the canonical set -- see fn_course_import_catalog_lock_tables): a
  -- concurrent write to ANY of them (an admin program/course/access edit, a
  -- quiz mutation) between this transaction's hash computation and its
  -- commit would otherwise produce a receipt whose claimed catalog was
  -- never the real committed state.
  lock table public.content_import_release_records, public.content_import_release_revisions
    in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  select release.program_id, active.active_revision,
    active.active_manifest_sha256, active.active_catalog_sha256
  into v_program_id, v_active_revision, v_active_manifest_sha256, v_active_catalog_sha256
  from public.content_import_release_records release
  join public.content_import_active_release_v1 active on active.import_id = release.import_id
  where release.import_id = p_import_id;
  if not found
    or not exists (
      select 1 from public.programs program
      where program.id = v_program_id and program.is_published
    )
    or exists (
      select 1
      from public.program_courses link
      join public.courses course on course.id = link.course_id
      where link.program_id = v_program_id and not course.is_published
    )
  then
    raise exception 'Released content block revision refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  -- No supported v2 mutation carries a storage-asset binding (downloads are
  -- unsupported by the narrowed contract), so the download-evidence digest a
  -- forward receipt records is always the digest of an empty binding set.
  -- The column itself stays populated (the shared shape check requires it,
  -- and backfilled v1 mirrors carry real digests from their 19 guide PDFs).
  v_download_evidence_sha256 :=
    encode(sha256(convert_to('[]'::jsonb::text, 'UTF8')), 'hex');

  -- Idempotent replay: the exact target manifest is already the active one.
  -- `already_revised` is granted ONLY when this exact call binds to the
  -- ACTIVE IMMUTABLE RECEIPT on every identity axis -- kind, both payload
  -- digests, all three counts, ancestry, evidence operation -- AND the live
  -- import-owned target rows plus the live catalog still match what that
  -- receipt committed. Without the receipt binding, a caller submitting a
  -- matching SUBSET (or an altered payload that happens to leave matching
  -- rows) could be told "already_revised" for a different operation than
  -- the one that actually committed.
  if v_active_manifest_sha256 = p_manifest_sha256 then
    select * into v_active_row
    from public.content_import_release_revisions
    where import_id = p_import_id and revision = v_active_revision;
    v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
    select count(*) into v_target_count
    from jsonb_array_elements(p_mutations) mutation(value)
    join public.content_blocks block
      on block.id = (mutation.value ->> 'block_id')::uuid
     and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
     and block.block_type = mutation.value ->> 'block_type'
     and block.content = mutation.value -> 'replacement_content'
     and block.sort_order = (mutation.value ->> 'sort_order')::integer
     and block.is_required_for_completion =
       (mutation.value ->> 'is_required_for_completion')::boolean
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
    if v_active_row.revision is not null
      and v_active_row.kind = 'content_blocks'
      and v_active_row.reverts_revision is null
      and v_active_row.payload_sha256 = v_database_payload_sha256
      and v_active_row.client_payload_sha256 is not distinct from p_client_payload_sha256
      and v_active_row.mutation_count = v_mutation_count
      and v_active_row.update_count = v_update_count
      and v_active_row.insert_count = v_insert_count
      and v_active_row.prior_manifest_sha256 = p_expected_prior_manifest_sha256
      and v_active_row.prior_catalog_sha256 = p_expected_prior_catalog_sha256
      and v_active_row.evidence ->> 'operation' is not distinct from p_evidence ->> 'operation'
      and v_active_row.catalog_sha256 = v_replacement_catalog_sha256
      and v_active_catalog_sha256 = v_replacement_catalog_sha256
      and v_target_count = v_mutation_count
    then
      return jsonb_build_object(
        'status', 'already_revised',
        'import_id', p_import_id,
        'revision', v_active_revision,
        'mutation_count', v_mutation_count,
        'catalog_sha256', v_replacement_catalog_sha256
      );
    end if;
    raise exception 'Released content block revision retry refused: this call does not bind to the active immutable receipt, or live target state drifted.'
      using errcode = '40001';
  end if;
  if v_active_manifest_sha256 <> p_expected_prior_manifest_sha256 then
    raise exception 'Released content block revision refused: active manifest changed after preflight.'
      using errcode = '40001';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_prior_catalog_sha256 <> p_expected_prior_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog drifted from the exact preflight checksum.'
      using errcode = '40001';
  end if;
  -- The original release's pinned catalog_sha256 reflects the catalog just
  -- before the release's own publish flip (fn_release_course_import_v1
  -- computes it, THEN publishes), so it can never match a live post-publish
  -- checksum. Only compare against the active-state view's cached checksum
  -- once a prior revision (of either kind) has itself recorded a live,
  -- post-publish checksum -- exactly the same asymmetry the quiz-revision
  -- function uses for its own equivalent check.
  if v_active_revision > 1 and v_prior_catalog_sha256 <> v_active_catalog_sha256 then
    raise exception 'Released content block revision refused: live catalog changed after the active revision receipt.'
      using errcode = '40001';
  end if;

  select jsonb_build_object(
    'updated_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', block.id, 'lesson_id', block.lesson_id,
        'block_type', block.block_type, 'content', block.content,
        'sort_order', block.sort_order,
        'is_required_for_completion', block.is_required_for_completion
      ) order by block.id)
      from jsonb_array_elements(p_mutations) mutation(value)
      join public.content_blocks block
        on block.id = (mutation.value ->> 'block_id')::uuid
      where mutation.value ->> 'action' = 'update'
    ), '[]'::jsonb),
    'inserted_block_ids', coalesce((
      select jsonb_agg(mutation.value ->> 'block_id')
      from jsonb_array_elements(p_mutations) mutation(value)
      where mutation.value ->> 'action' = 'insert'
    ), '[]'::jsonb)
  ) into v_prior_block_graph;

  with mutations as (
    select
      (mutation.value ->> 'block_id')::uuid as block_id,
      (mutation.value ->> 'lesson_id')::uuid as lesson_id,
      mutation.value ->> 'block_type' as block_type,
      mutation.value -> 'expected_content' as expected_content,
      mutation.value -> 'replacement_content' as replacement_content,
      (mutation.value ->> 'sort_order')::integer as sort_order,
      (mutation.value ->> 'is_required_for_completion')::boolean
        as is_required_for_completion
    from jsonb_array_elements(p_mutations) mutation(value)
    where mutation.value ->> 'action' = 'update'
  )
  update public.content_blocks block
  set content = mutations.replacement_content
  from mutations, public.lessons lesson, public.modules module, public.courses course
  where block.id = mutations.block_id
    and block.lesson_id = mutations.lesson_id
    and block.block_type = mutations.block_type
    and block.content = mutations.expected_content
    and block.sort_order = mutations.sort_order
    and block.is_required_for_completion = mutations.is_required_for_completion
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_update_count then
    raise exception 'Released content block revision refused: expected update target, ownership, placement, type, or content mismatch.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.revise_content_blocks_v2_import_id', p_import_id, true);
  perform set_config(
    'bmh.revise_content_blocks_v2_payload_sha256',
    v_database_payload_sha256,
    true
  );
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  )
  select
    (mutation.value ->> 'block_id')::uuid,
    (mutation.value ->> 'lesson_id')::uuid,
    mutation.value ->> 'block_type',
    mutation.value -> 'replacement_content',
    (mutation.value ->> 'sort_order')::integer,
    (mutation.value ->> 'is_required_for_completion')::boolean
  from jsonb_array_elements(p_mutations) mutation(value)
  join public.lessons lesson
    on lesson.id = (mutation.value ->> 'lesson_id')::uuid
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where mutation.value ->> 'action' = 'insert'
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_insert_count then
    raise exception 'Released content block revision refused: expected insertion ownership mismatch.'
      using errcode = '40001';
  end if;

  select count(*) into v_target_count
  from jsonb_array_elements(p_mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = mutation.value ->> 'block_type'
   and block.content = mutation.value -> 'replacement_content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion =
     (mutation.value ->> 'is_required_for_completion')::boolean;
  if v_target_count <> v_mutation_count then
    raise exception 'Released content block revision refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
    download_evidence_sha256, mutation_count, update_count, insert_count,
    mutations, prior_block_graph, evidence, revised_by
  ) values (
    p_import_id, v_active_revision + 1, 'content_blocks', v_active_revision,
    p_expected_prior_manifest_sha256, p_manifest_sha256,
    v_prior_catalog_sha256, v_replacement_catalog_sha256,
    v_database_payload_sha256, p_client_payload_sha256, v_download_evidence_sha256,
    v_mutation_count, v_update_count, v_insert_count,
    p_mutations, v_prior_block_graph, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'revised',
    'import_id', p_import_id,
    'revision', v_active_revision + 1,
    'mutation_count', v_mutation_count,
    'update_count', v_update_count,
    'insert_count', v_insert_count,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256,
    'database_payload_sha256', v_database_payload_sha256
  );
end;
$$;

revoke all on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) to service_role;

comment on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) is 'Reusable, versioned content-block revision over an immutable imported-catalog release: shares one revision ledger with the quiz-revision mechanism, compare-and-swaps the whole-catalog checksum, applies a variable-count insert/update mutation payload, and records an append-only, rollback-capable audit row. The required confirmation string is bound to a checksum PostgreSQL computes itself from the payload, not a caller assertion.';

create or replace function public.fn_rollback_released_content_block_revision_v1(
  p_import_id text,
  p_expected_revision integer,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.content_import_release_revisions%rowtype;
  v_next_revision integer;
  v_current_state_revision integer;
  v_current_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_updated_rows jsonb;
  v_inserted_block_ids jsonb;
  v_touched_block_ids uuid[];
  v_restored_count integer;
  v_deleted_count integer;
  v_target_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released content block revision rollback requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_revision is null or p_expected_revision < 2
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'operation' <> 'rollback'
    or p_evidence ->> 'rollback_sha256' !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision rollback refused: invalid rollback evidence.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  -- Every table that can hold learner activity against a content block is
  -- locked here, not just role_play_results: deleting an inserted block
  -- cascades into user_block_progress, user_video_progress, and
  -- role_play_results, and clears user_course_resume.last_block_id; nothing
  -- may write any of those for a touched block while rollback is deciding
  -- whether it is safe. Also locks the full canonical catalog-hash table
  -- set (see fn_course_import_catalog_lock_tables) -- rollback recomputes
  -- and compares the catalog just as the forward RPC does, so it needs the
  -- same completeness.
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.user_block_progress,
    public.user_video_progress,
    public.user_video_completion_history,
    public.role_play_results,
    public.user_course_resume
  in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  select * into v_latest
  from public.content_import_release_revisions revision
  where revision.import_id = p_import_id
    and revision.revision = p_expected_revision
    and revision.kind = 'content_blocks'
    and revision.reverts_revision is null
  limit 1;
  if not found then
    raise exception 'Released content block revision rollback refused: active revision changed after preflight.'
      using errcode = '40001';
  end if;
  if p_confirmation is distinct from
    'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:' || p_import_id || ':'
      || p_expected_revision::text || ':' || v_latest.manifest_sha256 || ':'
      || v_latest.prior_manifest_sha256 || ':' || (p_evidence ->> 'rollback_sha256')
  then
    raise exception 'Released content block revision rollback refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  -- The ONLY legal rollback target is the revision whose state the catalog is
  -- currently in, derived from ledger lineage: walk to the head row (max
  -- revision, any kind) and resolve which state it represents -- itself for a
  -- forward revision, the restored state for a rollback receipt. A catalog
  -- checksum comparison alone cannot decide this: catalog states can repeat
  -- across history (apply B, roll back, re-apply the same B via a new
  -- revision), and under checksum-only legality the OLD forward receipt for B
  -- would still "match" and restore ITS parent -- rewinding to a state that
  -- is no longer the live lineage's parent.
  v_current_state_revision := public.fn_current_state_revision(p_import_id);
  if v_current_state_revision is distinct from p_expected_revision then
    raise exception 'Released content block revision rollback refused: revision % is not the active state lineage (current state is revision %).',
      p_expected_revision, v_current_state_revision
      using errcode = '40001';
  end if;
  if v_latest.state_parent_revision is null then
    raise exception 'Released content block revision rollback refused: the target revision does not record a state parent.'
      using errcode = '40001';
  end if;

  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_current_catalog_sha256 <> v_latest.catalog_sha256 then
    raise exception 'Released content block revision rollback refused: catalog changed after the recorded revision.'
      using errcode = '40001';
  end if;

  v_updated_rows := v_latest.prior_block_graph -> 'updated_rows';
  v_inserted_block_ids := v_latest.prior_block_graph -> 'inserted_block_ids';
  if jsonb_typeof(v_updated_rows) is distinct from 'array'
    or jsonb_typeof(v_inserted_block_ids) is distinct from 'array'
  then
    raise exception 'Released content block revision rollback refused: archived prior graph is malformed.';
  end if;

  select coalesce(array_agg(distinct id), '{}'::uuid[]) into v_touched_block_ids
  from (
    select value::uuid as id
    from jsonb_array_elements_text(v_inserted_block_ids) value
    union all
    select (row.value ->> 'id')::uuid
    from jsonb_array_elements(v_updated_rows) row(value)
  ) touched;

  -- Refuse rollback if ANY table that can hold learner activity references
  -- a block this revision touched -- whether it was inserted (rollback would
  -- delete it, cascading into progress/results rows) or merely updated
  -- (rollback would revert its content, which can orphan video-watch state
  -- keyed to that content's asset version). This is deliberately broader
  -- than the quiz-revision rollback's "completed activity" check because a
  -- content-block revision can touch any block type, not just role-plays.
  if exists (
    select 1 from public.user_block_progress progress
    where progress.block_id = any(v_touched_block_ids)
  ) or exists (
    select 1 from public.user_video_progress progress
    where progress.block_id = any(v_touched_block_ids)
  ) or exists (
    select 1 from public.user_video_completion_history history
    where history.block_id = any(v_touched_block_ids)
  ) or exists (
    select 1 from public.role_play_results result
    where result.block_id = any(v_touched_block_ids)
  ) or exists (
    select 1 from public.user_course_resume resume
    where resume.last_block_id = any(v_touched_block_ids)
  ) then
    raise exception 'Released content block revision rollback refused: learner activity exists on a touched block.'
      using errcode = '23503';
  end if;

  -- Verify every mutated row still holds exactly the replacement state this
  -- revision produced (no further drift since forward application).
  select count(*) into v_target_count
  from jsonb_array_elements(v_latest.mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = mutation.value ->> 'block_type'
   and block.content = mutation.value -> 'replacement_content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion =
     (mutation.value ->> 'is_required_for_completion')::boolean;
  if v_target_count <> v_latest.mutation_count then
    raise exception 'Released content block revision rollback refused: live state no longer matches the recorded forward revision.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.content_blocks block
  where block.id in (
    select value::uuid from jsonb_array_elements_text(v_inserted_block_ids) value
  );
  get diagnostics v_deleted_count = row_count;
  perform set_config('bmh.rollback_import_id', '', true);
  if v_deleted_count <> jsonb_array_length(v_inserted_block_ids) then
    raise exception 'Released content block revision rollback refused: expected insertion rows were missing or already changed.'
      using errcode = '40001';
  end if;

  update public.content_blocks block
  set
    content = row.content,
    sort_order = row.sort_order,
    is_required_for_completion = row.is_required_for_completion
  from jsonb_to_recordset(v_updated_rows) as row(
    id uuid, lesson_id uuid, block_type text, content jsonb,
    sort_order integer, is_required_for_completion boolean
  )
  where block.id = row.id and block.lesson_id = row.lesson_id;
  get diagnostics v_restored_count = row_count;
  if v_restored_count <> jsonb_array_length(v_updated_rows) then
    raise exception 'Released content block revision rollback refused: expected update rows were missing or already changed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_replacement_catalog_sha256 <> v_latest.prior_catalog_sha256 then
    raise exception 'Released content block revision rollback failed to restore the exact prior catalog checksum.'
      using errcode = '40001';
  end if;

  -- The rollback receipt appends at the END of the shared sequence, never at
  -- v_latest.revision + 1. On a chained rollback (roll back revision N, then
  -- roll back revision N-1 from the restored state), N-1's successor number
  -- N already exists -- appending there would PK-collide and atomically
  -- abort the emergency rollback at exactly the moment it is needed most.
  -- reverts_revision records the revision this receipt undid;
  -- state_parent_revision records the state it RESTORED (the reverted
  -- revision's own state parent) -- two different things.
  select coalesce(max(revision), 1) + 1 into v_next_revision
  from public.content_import_release_revisions
  where import_id = p_import_id;

  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, reverts_revision, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
    download_evidence_sha256, mutation_count, update_count, insert_count,
    mutations, prior_block_graph, evidence, revised_by
  ) values (
    p_import_id, v_next_revision, 'content_blocks',
    p_expected_revision, v_latest.state_parent_revision,
    v_latest.manifest_sha256, v_latest.prior_manifest_sha256,
    v_current_catalog_sha256, v_replacement_catalog_sha256,
    encode(sha256(convert_to(v_latest.mutations::text, 'UTF8')), 'hex'),
    v_latest.client_payload_sha256, v_latest.download_evidence_sha256,
    v_latest.mutation_count, v_latest.update_count, v_latest.insert_count,
    v_latest.mutations, v_latest.prior_block_graph, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', p_import_id,
    'revision', v_next_revision,
    'reverts_revision', p_expected_revision,
    'restored_state_revision', v_latest.state_parent_revision,
    'prior_catalog_sha256', v_current_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256,
    'restored_updates', v_restored_count,
    'reverted_inserts', v_deleted_count
  );
end;
$$;

revoke all on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) to service_role;

comment on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) is 'Reverts the most recent versioned content-block revision by restoring updated rows to their archived pre-image and deleting inserted rows. Refuses if any progress, completion, results, or resume table references a touched block, or if further drift exists.';

-- Align the quiz rollback with the shared lineage model (same reasons as the
-- content-block rollback above): look up the target by its (import, revision,
-- kind) identity instead of requiring it to be the physical head row, derive
-- rollback legality from state lineage, and append the receipt at the end of
-- the shared sequence with explicit reverts/state-parent pointers. Everything
-- else -- the confirmation contract, the exact BMH release pins, the
-- completed-activity refusals, and the restore mechanics -- is byte-identical
-- to 20260722130000's body.
create or replace function public.fn_rollback_released_quiz_revision_v1(
  p_import_id text,
  p_expected_revision integer,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.content_import_release_revisions%rowtype;
  v_next_revision integer;
  v_current_state_revision integer;
  v_current_catalog_sha256 text;
  v_catalog_sha256 text;
  v_payload_sha256 text;
  v_quizzes jsonb;
  v_questions jsonb;
  v_answer_options jsonb;
  v_quiz_ids uuid[];
  v_question_ids uuid[];
  v_option_ids uuid[];
  v_current_graph jsonb;
  v_invalidated_attempts jsonb;
  v_invalidated_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released quiz revision rollback requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_revision is null or p_expected_revision < 2
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'operation' <> 'rollback'
    or p_evidence ->> 'rollback_sha256' !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Released quiz revision rollback refused: invalid rollback evidence.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  -- Ledger and quiz-review tables plus the full canonical catalog-hash table
  -- set (see fn_course_import_catalog_lock_tables): a quiz rollback
  -- recomputes and compares the catalog exactly as the forward RPC does.
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  select * into v_latest
  from public.content_import_release_revisions revision
  where revision.import_id = p_import_id
    and revision.revision = p_expected_revision
    and revision.kind = 'quiz'
    and revision.reverts_revision is null
  limit 1;
  if not found then
    raise exception 'Released quiz revision rollback refused: active revision changed after preflight.'
      using errcode = '40001';
  end if;
  -- Same lineage model as the content-block rollback: the only legal target
  -- is the revision whose state the catalog is currently in, derived from
  -- the shared ledger's head row -- so a quiz rollback stays reachable even
  -- when later content-block revisions and their rollbacks sit above it in
  -- the sequence (the chain no longer dead-ends at the kind boundary).
  v_current_state_revision := public.fn_current_state_revision(p_import_id);
  if v_current_state_revision is distinct from p_expected_revision then
    raise exception 'Released quiz revision rollback refused: revision % is not the active state lineage (current state is revision %).',
      p_expected_revision, v_current_state_revision
      using errcode = '40001';
  end if;
  if p_import_id <> 'bmh-employee-training-v1'
    or v_latest.question_count <> 920
    or v_latest.prior_manifest_sha256 <> '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    or p_evidence ->> 'rollback_sha256' is distinct from v_latest.evidence ->> 'rollback_sha256'
  then
    raise exception 'Released quiz revision rollback refused: revision or rollback artifact is not the exact forward BMH release.'
      using errcode = '22023';
  end if;
  if p_confirmation is distinct from
    'ROLLBACK-RELEASED-QUIZZES:' || p_import_id || ':' || p_expected_revision::text || ':'
      || v_latest.manifest_sha256 || ':' || v_latest.prior_manifest_sha256 || ':'
      || (p_evidence ->> 'rollback_sha256')
  then
    raise exception 'Released quiz revision rollback refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_current_catalog_sha256 <> v_latest.catalog_sha256 then
    raise exception 'Released quiz revision rollback refused: catalog changed after the recorded revision.'
      using errcode = '40001';
  end if;

  v_quizzes := v_latest.prior_quiz_graph -> 'quizzes';
  v_questions := v_latest.prior_quiz_graph -> 'questions';
  v_answer_options := v_latest.prior_quiz_graph -> 'answer_options';
  if jsonb_typeof(v_quizzes) is distinct from 'array'
    or jsonb_array_length(v_quizzes) <> 19
    or jsonb_typeof(v_questions) is distinct from 'array'
    or jsonb_array_length(v_questions) <> 342
    or jsonb_typeof(v_answer_options) is distinct from 'array'
    or jsonb_array_length(v_answer_options) < 2
  then
    raise exception 'Released quiz revision rollback refused: archived prior graph is malformed.';
  end if;

  select array_agg(row.id order by row.id) into v_quiz_ids
  from jsonb_to_recordset(v_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  );
  select array_agg(row.id order by row.id) into v_question_ids
  from jsonb_to_recordset(v_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  );
  select array_agg(row.id order by row.id) into v_option_ids
  from jsonb_to_recordset(v_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  );

  if (select count(distinct id) from unnest(v_quiz_ids) id) <> 19
    or (select count(distinct id) from unnest(v_question_ids) id) <> jsonb_array_length(v_questions)
    or (select count(distinct id) from unnest(v_option_ids) id) <> jsonb_array_length(v_answer_options)
    or exists (
      select 1 from jsonb_to_recordset(v_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      ) where row.quiz_id <> all(v_quiz_ids)
    )
    or exists (
      select 1 from jsonb_to_recordset(v_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      ) where row.question_id <> all(v_question_ids)
    )
    or (select array_agg(lesson.quiz_id order by lesson.quiz_id)
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
        and lesson.quiz_id is not null) <> v_quiz_ids
    or exists (
      select 1 from jsonb_to_recordset(v_quizzes) as row(
        id uuid, title text, description text, passing_score integer,
        randomize_questions boolean, randomize_answers boolean,
        questions_per_attempt integer, max_attempts integer,
        retake_cooldown_hours integer, show_correct_answers_after text
      ) where row.questions_per_attempt is distinct from 10
    )
  then
    raise exception 'Released quiz revision rollback refused: archived prior graph identity mismatch.';
  end if;

  if exists (
    select 1 from public.user_quiz_attempts attempt
    where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is not null
  ) then
    raise exception 'Released quiz revision rollback refused: completed quiz activity now exists; automatic rollback is unsafe.'
      using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.course_import_reviewer_answer_options_v1 evidence
    join public.questions question on question.id = evidence.question_id
    where evidence.import_id = p_import_id and question.quiz_id = any(v_quiz_ids)
  ) then
    raise exception 'Released quiz revision rollback refused: reviewer-authored option evidence now exists.'
      using errcode = '23503';
  end if;

  select jsonb_build_object(
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', quiz.id, 'title', quiz.title, 'description', quiz.description,
        'passing_score', quiz.passing_score,
        'randomize_questions', quiz.randomize_questions,
        'randomize_answers', quiz.randomize_answers,
        'questions_per_attempt', quiz.questions_per_attempt,
        'max_attempts', quiz.max_attempts,
        'retake_cooldown_hours', quiz.retake_cooldown_hours,
        'show_correct_answers_after', quiz.show_correct_answers_after
      ) order by quiz.id)
      from public.quizzes quiz where quiz.id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id, 'quiz_id', question.quiz_id,
        'question_text', question.question_text,
        'question_type', question.question_type,
        'explanation', question.explanation, 'points', question.points,
        'sort_order', question.sort_order
      ) order by question.id)
      from public.questions question where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'answer_options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id, 'question_id', option.question_id,
        'option_text', option.option_text, 'is_correct', option.is_correct,
        'sort_order', option.sort_order
      ) order by option.id)
      from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb)
  ) into v_current_graph;

  select coalesce(jsonb_agg(to_jsonb(attempt) order by attempt.id), '[]'::jsonb)
    into v_invalidated_attempts
  from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  delete from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  get diagnostics v_invalidated_count = row_count;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.answer_options option
  using public.questions question
  where option.question_id = question.id
    and question.quiz_id = any(v_quiz_ids)
    and option.id <> all(v_option_ids);
  delete from public.questions question
  where question.quiz_id = any(v_quiz_ids)
    and question.id <> all(v_question_ids);
  perform set_config('bmh.rollback_import_id', '', true);

  update public.quizzes quiz set
    title = row.title,
    description = row.description,
    passing_score = row.passing_score,
    randomize_questions = row.randomize_questions,
    randomize_answers = row.randomize_answers,
    questions_per_attempt = row.questions_per_attempt,
    max_attempts = row.max_attempts,
    retake_cooldown_hours = row.retake_cooldown_hours,
    show_correct_answers_after = row.show_correct_answers_after
  from jsonb_to_recordset(v_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  ) where quiz.id = row.id;

  perform set_config('bmh.apply_import_id', p_import_id, true);
  insert into public.questions (
    id, quiz_id, question_text, question_type, explanation, points, sort_order
  )
  select row.id, row.quiz_id, row.question_text, row.question_type,
    row.explanation, row.points, row.sort_order
  from jsonb_to_recordset(v_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  )
  on conflict (id) do update set
    quiz_id = excluded.quiz_id,
    question_text = excluded.question_text,
    question_type = excluded.question_type,
    explanation = excluded.explanation,
    points = excluded.points,
    sort_order = excluded.sort_order;

  insert into public.answer_options (
    id, question_id, option_text, is_correct, sort_order
  )
  select row.id, row.question_id, row.option_text, row.is_correct, row.sort_order
  from jsonb_to_recordset(v_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  )
  on conflict (id) do update set
    question_id = excluded.question_id,
    option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;
  perform set_config('bmh.apply_import_id', '', true);

  if (select count(*) from public.questions question where question.quiz_id = any(v_quiz_ids))
      <> jsonb_array_length(v_questions)
    or (select count(*) from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)) <> jsonb_array_length(v_answer_options)
  then
    raise exception 'Released quiz revision rollback failed exact reconciliation.';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_catalog_sha256 <> v_latest.prior_catalog_sha256 then
    raise exception 'Released quiz revision rollback failed to restore the exact prior catalog checksum.'
      using errcode = '40001';
  end if;
  v_payload_sha256 := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'quizzes', v_quizzes,
        'questions', v_questions,
        'answer_options', v_answer_options
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  -- Append at the END of the shared sequence (see the content-block rollback
  -- for why v_latest.revision + 1 PK-collides on chained rollbacks), and
  -- record both lineage pointers. state_parent falls back to revision - 1
  -- for legacy quiz rows written before lineage columns existed: their
  -- forward history was strictly sequential, so the predecessor revision is
  -- their state parent by construction.
  select coalesce(max(revision), 1) + 1 into v_next_revision
  from public.content_import_release_revisions
  where import_id = p_import_id;

  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, reverts_revision, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence, revised_by
  ) values (
    p_import_id, v_next_revision, 'quiz',
    p_expected_revision,
    coalesce(v_latest.state_parent_revision, v_latest.revision - 1),
    v_latest.manifest_sha256, v_latest.prior_manifest_sha256,
    v_current_catalog_sha256, v_catalog_sha256, v_payload_sha256,
    jsonb_array_length(v_quizzes), jsonb_array_length(v_questions),
    jsonb_array_length(v_answer_options),
    v_current_graph, v_invalidated_attempts, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', p_import_id,
    'revision', v_next_revision,
    'reverts_revision', p_expected_revision,
    'prior_manifest_sha256', v_latest.manifest_sha256,
    'manifest_sha256', v_latest.prior_manifest_sha256,
    'prior_catalog_sha256', v_current_catalog_sha256,
    'catalog_sha256', v_catalog_sha256,
    'payload_sha256', v_payload_sha256,
    'quizzes', jsonb_array_length(v_quizzes),
    'questions', jsonb_array_length(v_questions),
    'answer_options', jsonb_array_length(v_answer_options),
    'invalidated_incomplete_attempts', v_invalidated_count
  );
end;
$$;

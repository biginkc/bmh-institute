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
  add column kind text not null default 'quiz' check (kind in ('quiz', 'content_blocks')),
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
  add column reverts_revision integer check (reverts_revision is null or reverts_revision >= 2);

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
    )
  );

comment on column public.content_import_release_revisions.kind is
  'Discriminates which mutation type produced this ledger row. All rows share one revision sequence and one active-state view (content_import_active_release_v1) regardless of kind -- that shared sequence is what prevents a per-kind split-brain.';

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
-- reload-and-retry conflict. SECURITY INVOKER on purpose: row-level
-- security and the caller's own authority apply exactly as they would to a
-- direct UPDATE.
create or replace function public.fn_admin_merge_role_play_block_content(
  p_block_id uuid,
  p_expected_scenario_id text,
  p_scenario_id text,
  p_title text,
  p_height_px integer,
  p_is_required_for_completion boolean
)
returns jsonb
language sql
set search_path = ''
as $$
  update public.content_blocks
     set content = content || jsonb_build_object(
           'scenario_id', p_scenario_id,
           'title', p_title,
           'height_px', p_height_px
         ),
         is_required_for_completion = p_is_required_for_completion
   where id = p_block_id
     and block_type = 'role_play'
     and content ->> 'scenario_id' is not distinct from p_expected_scenario_id
  returning content;
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
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.programs,
    public.courses,
    public.modules,
    public.lessons,
    public.content_blocks
  in share row exclusive mode;

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
  -- whether it is safe.
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.programs, public.courses, public.modules, public.lessons,
    public.content_blocks,
    public.user_block_progress,
    public.user_video_progress,
    public.user_video_completion_history,
    public.role_play_results,
    public.user_course_resume
  in share row exclusive mode;

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
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.programs, public.courses, public.modules, public.lessons,
    public.quizzes, public.questions, public.answer_options,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;

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

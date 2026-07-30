-- Rehearsed forward-rollback capability for
-- 20260730060000_insert_objection_oral_check_role_play_blocks.sql, mirroring
-- 20260729060500_rollback_oral_check_expansion_role_play_blocks.sql's
-- pattern exactly, scaled from 9 blocks to 2. That migration atomically
-- inserts the 2 Andrea Oral Check objection role_play blocks and records one
-- immutable evidence row, but defines no exact inverse on its own. The
-- generic course-import rollback mechanism
-- (019_atomic_course_import_rollback.sql) explicitly refuses to touch
-- released and published imports by design -- it is not, and must not
-- become, the escape hatch for this operation. This defines that exact
-- inverse ahead of time, ready but never auto-invoked.
--
-- Design: rather than hardcoding a second, independently-guessed "expected
-- post-insert catalog hash" pin in this file, this rollback pins itself to
-- the forward operation's OWN immutable evidence row
-- (content_import_oral_check_objections_role_play_records): its recorded
-- prior_catalog_sha256, replacement_catalog_sha256, and exact mutations
-- payload. This also means the rollback can only ever run against a
-- database where the real forward evidence row exists: there is nothing to
-- roll back without it.
--
-- Naming note: see 20260730060000's header. This operation's rollback table
-- drops the 'role_play' padding the expansion used, because 'objections' is
-- one character longer than 'expansion' and the mechanically-derived names
-- would otherwise have been silently truncated at PostgreSQL's 63-byte
-- identifier limit.

set lock_timeout = '10s';

create table public.content_import_oral_check_objections_rollback_records (
  import_id text primary key
    references public.content_import_release_records(import_id) on delete restrict,
  forward_database_payload_sha256 text not null check (forward_database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  removed_catalog_sha256 text not null check (removed_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  restored_catalog_sha256 text not null check (restored_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  role_play_removed_count integer not null check (role_play_removed_count = 2),
  removed_block_ids uuid[] not null check (array_length(removed_block_ids, 1) = 2),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  rolled_back_at timestamptz not null default now(),
  rolled_back_by uuid
);

comment on table public.content_import_oral_check_objections_rollback_records is
  'Immutable audit evidence for a rollback of the one-shot Andrea Oral Check objections insertion. A row here means the 2 objection blocks were removed and the catalog hash was verified restored to the exact pre-insert value. This table never overwrites or removes content_import_oral_check_objections_role_play_records (the forward evidence) -- that row remains permanent historical proof the insertion happened; this is a second, separate, append-only record that it was later undone.';

alter table public.content_import_oral_check_objections_rollback_records enable row level security;

-- Same Hugo restrictive active-access gate the forward evidence table
-- installs at creation time -- see 20260730060000's comment. Neither
-- 20260728230000 nor 20260729140000 can reach a table created by a later
-- migration, so every new public RLS table has to install its own.
drop policy if exists hugo_active_authenticated_gate
  on public.content_import_oral_check_objections_rollback_records;
create policy hugo_active_authenticated_gate
  on public.content_import_oral_check_objections_rollback_records
  as restrictive
  for all
  to authenticated
  using ((select public.fn_hugo_access_is_active(auth.uid())))
  with check ((select public.fn_hugo_access_is_active(auth.uid())));

revoke all on table public.content_import_oral_check_objections_rollback_records
from public, anon, authenticated;
grant select on table public.content_import_oral_check_objections_rollback_records
to service_role;

create or replace function public.fn_guard_oral_check_objections_rollback_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.oral_check_objections_rollback_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.oral_check_objections_rollback_payload_sha256', true), '') <> new.forward_database_payload_sha256
  then
    raise exception 'Oral-check objections role-play rollback records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_oral_check_objections_rollback_record()
from public, anon, authenticated;

create trigger oral_check_objections_rollback_records_guard
before insert or update or delete on public.content_import_oral_check_objections_rollback_records
for each row execute function public.fn_guard_oral_check_objections_rollback_record();

create or replace function public.fn_rollback_oral_check_objections_role_play_blocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
-- Function-level override so a real rollback attempt during a real incident
-- cannot hang indefinitely behind a busy writer (Postgres's session default
-- is 0 / wait forever, and the migration-level SET above only applies to
-- the session that installs this migration, not a later invoking session).
set lock_timeout = '10s'
as $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  v_expected_block_ids constant uuid[] := array[
    'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
    'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
  ]::uuid[];
  v_forward public.content_import_oral_check_objections_role_play_records%rowtype;
  v_current_catalog_sha256 text;
  v_restored_catalog_sha256 text;
  v_deleted_count integer;
  v_target_count integer;
  v_learner_activity_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Oral-check objections role-play rollback requires service_role.'
      using errcode = '42501';
  end if;

  -- Nothing to roll back without the one immutable forward evidence row --
  -- this is the SOLE source of the exact pins this function checks against.
  select * into v_forward
  from public.content_import_oral_check_objections_role_play_records
  where import_id = v_import_id;
  if not found then
    raise exception 'Oral-check objections role-play rollback refused: no forward insertion evidence exists for %. There is nothing to roll back.',
      v_import_id
      using errcode = '42501';
  end if;

  -- Genuinely ONE-SHOT, mirroring the forward function's own philosophy
  -- exactly: once a rollback evidence row exists, refuse every subsequent
  -- invocation outright.
  if exists (
    select 1 from public.content_import_oral_check_objections_rollback_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check objections role-play rollback refused: this one-shot rollback has already been performed for %. There is nothing to retry -- query content_import_oral_check_objections_rollback_records directly.',
      v_import_id
      using errcode = '40001';
  end if;

  -- The exact same locks the forward migration acquired, plus the tables
  -- that can hold real learner activity this rollback must never silently
  -- cascade-delete. Same relative order as the forward migration's lock set
  -- so the two operations cannot deadlock against each other.
  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || v_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_oral_check_objections_role_play_records,
    public.content_import_oral_check_objections_rollback_records,
    public.programs,
    public.courses,
    public.program_courses,
    public.program_access,
    public.course_access,
    public.role_groups,
    public.modules,
    public.lessons,
    public.content_blocks,
    public.quizzes,
    public.questions,
    public.answer_options,
    public.assignments,
    public.role_play_results,
    public.user_block_progress,
    public.user_video_progress,
    public.user_video_completion_history,
    public.user_course_resume
  in share row exclusive mode;

  -- Pin the exact expected current (post-insert) catalog state to the
  -- forward operation's OWN recorded replacement_catalog_sha256. If this
  -- does not match, something else has touched this catalog since the
  -- objections insertion -- refuse rather than mechanically removing 2 rows
  -- out from under an unknown, unreviewed change.
  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_current_catalog_sha256 is distinct from v_forward.replacement_catalog_sha256 then
    raise exception 'Oral-check objections role-play rollback refused: live catalog (%) no longer matches the forward operation''s recorded post-insert state (%). Something else changed this catalog since the objections insertion -- resolve that drift before attempting a mechanical rollback.',
      v_current_catalog_sha256, v_forward.replacement_catalog_sha256
      using errcode = '40001';
  end if;

  -- Pin the exact 2 row payloads to the forward operation's own recorded
  -- mutations (byte-exact), not a second hand-copied literal.
  select count(*) into v_target_count
  from jsonb_array_elements(v_forward.mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = 'role_play'
   and block.content = mutation.value -> 'content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion = true;
  if v_target_count <> 2 then
    raise exception 'Oral-check objections role-play rollback refused: the 2 target rows no longer exactly match the forward operation''s recorded payload (% of 2 exact matches). Refusing to remove rows that may have been edited since insertion.',
      v_target_count
      using errcode = '40001';
  end if;

  -- Refuse to silently cascade away (or blow up on) real learner activity --
  -- same 5-table check the pilot's and the expansion's rollbacks and
  -- 20260722032500_prune_deferred_role_play_blocks.sql all use for the
  -- analogous "remove role-play blocks safely" operation.
  select count(*) into v_learner_activity_count
  from (
    select 1 from public.role_play_results where block_id = any(v_expected_block_ids)
    union all
    select 1 from public.user_block_progress where block_id = any(v_expected_block_ids)
    union all
    select 1 from public.user_video_progress where block_id = any(v_expected_block_ids)
    union all
    select 1 from public.user_video_completion_history where block_id = any(v_expected_block_ids)
    union all
    select 1 from public.user_course_resume where last_block_id = any(v_expected_block_ids)
  ) activity;
  if v_learner_activity_count > 0 then
    raise exception 'Oral-check objections role-play rollback refused: % row(s) of real learner activity exist against the 2 target blocks (role_play_results, user_block_progress, user_video_progress, user_video_completion_history, or user_course_resume.last_block_id). Resolve or intentionally accept that data loss before rolling back -- this function will not silently cascade-delete or FK-fail on it.',
      v_learner_activity_count
      using errcode = '40001';
  end if;

  -- public.content_blocks carries the same generic imported-catalog DELETE
  -- guard (fn_guard_imported_catalog_delete, migration 033) every other
  -- imported table does: it requires the bmh.rollback_import_id session
  -- marker to equal this row's import_id before permitting any delete.
  -- Reusing that exact established marker name (not calling
  -- fn_rollback_course_import, which independently refuses released and
  -- published imports by design) is what makes this a genuinely validated
  -- rollback context to that shared guard, not a bypass of it.
  perform set_config('bmh.rollback_import_id', v_import_id, true);

  delete from public.content_blocks
  where id = any(v_expected_block_ids)
    and id in (
      select (mutation.value ->> 'block_id')::uuid
      from jsonb_array_elements(v_forward.mutations) mutation(value)
    );
  get diagnostics v_deleted_count = row_count;

  perform set_config('bmh.rollback_import_id', '', true);

  if v_deleted_count <> 2 then
    raise exception 'Oral-check objections role-play rollback refused: expected exactly 2 rows deleted, deleted %.',
      v_deleted_count
      using errcode = '40001';
  end if;
  if exists (select 1 from public.content_blocks where id = any(v_expected_block_ids)) then
    raise exception 'Oral-check objections role-play rollback refused: a target row still exists after delete.'
      using errcode = '40001';
  end if;

  -- The post-condition that gives this rollback its name: the catalog hash
  -- must be restored to the EXACT prior (pre-insert) value the forward
  -- operation itself recorded. If it is not, the whole transaction raises
  -- and rolls back -- nothing is left half-removed.
  v_restored_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_restored_catalog_sha256 is distinct from v_forward.prior_catalog_sha256 then
    raise exception 'Oral-check objections role-play rollback refused: catalog hash after removal (%) does not match the forward operation''s recorded exact prior state (%). The transaction is being rolled back -- nothing was left half-removed.',
      v_restored_catalog_sha256, v_forward.prior_catalog_sha256
      using errcode = '40001';
  end if;

  perform set_config('bmh.oral_check_objections_rollback_import_id', v_import_id, true);
  perform set_config('bmh.oral_check_objections_rollback_payload_sha256', v_forward.database_payload_sha256, true);

  insert into public.content_import_oral_check_objections_rollback_records (
    import_id, forward_database_payload_sha256, removed_catalog_sha256,
    restored_catalog_sha256, role_play_removed_count, removed_block_ids, evidence, rolled_back_by
  ) values (
    v_import_id, v_forward.database_payload_sha256, v_current_catalog_sha256,
    v_restored_catalog_sha256, 2, v_expected_block_ids,
    jsonb_build_object(
      'operation', 'oral_check_objections_role_play_rollback',
      'forward_prior_catalog_sha256', v_forward.prior_catalog_sha256,
      'forward_replacement_catalog_sha256', v_forward.replacement_catalog_sha256,
      'lesson_source_keys', jsonb_build_array(
        'lesson-content-slot-09', 'lesson-content-slot-10'
      )
    ),
    auth.uid()
  );

  perform set_config('bmh.oral_check_objections_rollback_import_id', '', true);
  perform set_config('bmh.oral_check_objections_rollback_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', v_import_id,
    'role_play_removed_count', 2,
    'removed_catalog_sha256', v_current_catalog_sha256,
    'restored_catalog_sha256', v_restored_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_rollback_oral_check_objections_role_play_blocks()
from public, anon, authenticated;
grant execute on function public.fn_rollback_oral_check_objections_role_play_blocks()
to service_role;

-- fn_insert_oral_check_objections_role_play_blocks() (previous migration)
-- deliberately does not grant itself EXECUTE to service_role -- that grant
-- is issued here instead, now that the rollback capability that function's
-- own in-body check requires actually exists. Before this migration
-- commits, no role can call the insertion function at all.
grant execute on function public.fn_insert_oral_check_objections_role_play_blocks()
to service_role;

-- Deliberately NOT self-invoked. This capability must be ready in production
-- ahead of any incident but must never auto-fire on migration apply. An
-- operator invokes it explicitly:
--   select public.fn_rollback_oral_check_objections_role_play_blocks();

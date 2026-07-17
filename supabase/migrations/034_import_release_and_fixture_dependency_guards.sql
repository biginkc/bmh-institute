-- Keep the dormant fixture cleanup boundary current with later dependent
-- tables, and make publication an irreversible boundary for import mutations.

set lock_timeout = '10s';

-- These tables are dependency-only cleanup surfaces. They are never fixture
-- deletion targets, but any row pointing at fixture catalog content must block
-- cleanup before the database can cascade or restrict a delete unexpectedly.
insert into private.fixture_cleanup_tables_v1 (
  table_name,
  identity_fields,
  expected_count
) values
  (
    'sandra_course_completion_deliveries',
    array['id']::text[],
    0
  ),
  (
    'user_video_completion_history',
    array['user_id', 'block_id', 'asset_version']::text[],
    0
  )
on conflict (table_name) do nothing;

insert into private.fixture_cleanup_references_v1 (
  child_table,
  child_field,
  parent_table,
  match_type
) values
  (
    'sandra_course_completion_deliveries',
    'course_id',
    'courses',
    'scalar'
  ),
  (
    'user_video_completion_history',
    'block_id',
    'content_blocks',
    'scalar'
  )
on conflict (child_table, child_field, parent_table) do nothing;

do $$
begin
  if not exists (
    select 1
    from private.fixture_cleanup_tables_v1
    where table_name = 'sandra_course_completion_deliveries'
      and identity_fields = array['id']::text[]
      and expected_count = 0
  ) or not exists (
    select 1
    from private.fixture_cleanup_tables_v1
    where table_name = 'user_video_completion_history'
      and identity_fields = array['user_id', 'block_id', 'asset_version']::text[]
      and expected_count = 0
  ) or not exists (
    select 1
    from private.fixture_cleanup_references_v1
    where child_table = 'sandra_course_completion_deliveries'
      and child_field = 'course_id'
      and parent_table = 'courses'
      and match_type = 'scalar'
  ) or not exists (
    select 1
    from private.fixture_cleanup_references_v1
    where child_table = 'user_video_completion_history'
      and child_field = 'block_id'
      and parent_table = 'content_blocks'
      and match_type = 'scalar'
  ) then
    raise exception 'Migration 034 refused: fixture dependency boundary conflicts with the final schema.';
  end if;
end;
$$;

-- The older apply helper and release RPC take broad catalog locks in different
-- orders. Serialize the rare catalog mutation operations before either body
-- starts, eliminating cross-import lock inversion without widening row scope.
alter function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  set schema private;
alter function private.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  rename to fn_release_course_import_v027_without_global_mutation_lock;
revoke all on function
  private.fn_release_course_import_v027_without_global_mutation_lock(
    text, uuid, uuid, jsonb, text
  ) from public, anon, authenticated, service_role;

create function public.fn_release_course_import_v1(
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
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import release requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import release refused: invalid import_id.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  v_result := private.fn_release_course_import_v027_without_global_mutation_lock(
    p_import_id,
    p_program_id,
    p_employee_role_group_id,
    p_evidence,
    p_confirmation
  );
  return v_result;
end;
$$;

-- A same-manifest replay is safe only while the import remains unpublished and
-- unreleased. Serialize with the release RPC before checking that boundary.
create or replace function public.fn_apply_course_import(
  p_import_id text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import apply requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import apply refused: invalid import_id.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-release:' || p_import_id, 0)
  );

  -- Do not take row locks here. The legacy apply helper acquires its broad
  -- catalog locks after validating the payload; holding a catalog row lock
  -- before that table-lock upgrade can deadlock with an ordinary UPDATE that
  -- already holds ROW EXCLUSIVE and is waiting for the same row. The global
  -- advisory lock serializes every evidence-bound release/apply/rollback, and
  -- the publication/release-record triggers reject those transitions outside
  -- the release RPC, so plain reads are sufficient for this immutable boundary.
  if exists (
    select 1
    from public.content_import_release_records release
    where release.import_id = p_import_id
  ) then
    raise exception 'Course import apply refused: released imports are immutable.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Course import apply refused: published imports are immutable.'
      using errcode = '42501';
  end if;

  perform set_config('bmh.apply_import_id', p_import_id, true);
  v_result := private.fn_apply_course_import_v023_without_insert_guard(
    p_import_id,
    p_operations
  );
  perform set_config('bmh.apply_import_id', '', true);
  return v_result;
end;
$$;

-- Preserve the final history and durable-delivery guards while adding the same
-- irreversible release boundary to rollback. The advisory lock closes the race
-- with a concurrent evidence-bound release of this exact import.
create or replace function public.fn_rollback_course_import(
  p_import_id text,
  p_owned jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_blocks uuid[];
  v_courses uuid[];
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import rollback requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Rollback refused: invalid import_id.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-release:' || p_import_id, 0)
  );

  -- Match apply's no-upgrade rule. The existing activity-table lock order below
  -- remains unchanged so playback and durable-delivery writes still settle
  -- before the legacy rollback helper takes its catalog locks.
  if exists (
    select 1
    from public.content_import_release_records release
    where release.import_id = p_import_id
  ) then
    raise exception 'Course import rollback refused: released imports are immutable.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Course import rollback refused: published imports are immutable.'
      using errcode = '42501';
  end if;

  if p_owned is null
    or jsonb_typeof(p_owned) <> 'object'
    or jsonb_typeof(p_owned -> 'content_blocks') <> 'array'
    or jsonb_typeof(p_owned -> 'courses') <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_owned -> 'content_blocks') entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or entry ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    or exists (
      select 1
      from jsonb_array_elements(p_owned -> 'courses') entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or entry ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  then
    return private.fn_rollback_course_import_v019_without_video_history_guard(
      p_import_id,
      p_owned
    );
  end if;

  select coalesce(array_agg((entry ->> 'id')::uuid), '{}'::uuid[])
    into v_content_blocks
  from jsonb_array_elements(p_owned -> 'content_blocks') entry;
  select coalesce(array_agg((entry ->> 'id')::uuid), '{}'::uuid[])
    into v_courses
  from jsonb_array_elements(p_owned -> 'courses') entry;

  lock table
    public.user_video_progress,
    public.user_video_completion_history,
    public.user_block_progress,
    public.sandra_course_completion_deliveries
  in share row exclusive mode;
  if exists (
    select 1
    from public.user_video_completion_history history
    where history.block_id = any(v_content_blocks)
  ) then
    raise exception 'Rollback blocked: immutable video completion history exists.';
  end if;
  if exists (
    select 1
    from public.sandra_course_completion_deliveries delivery
    where delivery.course_id = any(v_courses)
  ) then
    raise exception 'Rollback blocked: durable Sandra completion delivery evidence exists.';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  v_result := private.fn_rollback_course_import_v019_without_video_history_guard(
    p_import_id,
    p_owned
  );
  perform set_config('bmh.rollback_import_id', '', true);
  return v_result;
end;
$$;

revoke all on function public.fn_apply_course_import(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_rollback_course_import(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.fn_apply_course_import(text, jsonb)
  to service_role;
grant execute on function public.fn_rollback_course_import(text, jsonb)
  to service_role;
grant execute on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  to service_role;

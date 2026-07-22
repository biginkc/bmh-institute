-- Remove explicitly deferred role-play blocks from an unreleased course import.
-- This is intentionally narrower than rollback: only named role_play blocks with
-- no learner or reviewer activity may be removed, and the imported graph roots
-- must still be unpublished and unreleased.

create or replace function public.fn_prune_deferred_role_play_blocks_v1(
  p_import_id text,
  p_blocks jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_deleted_count integer;
  v_block_ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Deferred role-play pruning requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Deferred role-play pruning refused: invalid import_id.'
      using errcode = '22023';
  end if;
  if p_confirmation <> 'PRUNE-DEFERRED-ROLE-PLAYS:' || p_import_id then
    raise exception 'Deferred role-play pruning refused: confirmation mismatch.'
      using errcode = '22023';
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Deferred role-play pruning refused: blocks must be an array.'
      using errcode = '22023';
  end if;

  v_expected_count := jsonb_array_length(p_blocks);
  if v_expected_count < 1 or v_expected_count > 100 then
    raise exception 'Deferred role-play pruning refused: expected 1 to 100 blocks.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_blocks) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
       or (select count(*) from jsonb_object_keys(entry.value)) <> 2
       or not (entry.value ?& array['id', 'scenario_id'])
       or jsonb_typeof(entry.value -> 'id') <> 'string'
       or entry.value ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(entry.value -> 'scenario_id') <> 'string'
       or entry.value ->> 'scenario_id' !~ '^pending:[a-z0-9][a-z0-9-]{0,127}$'
  ) then
    raise exception 'Deferred role-play pruning refused: malformed block contract.'
      using errcode = '22023';
  end if;
  if (
    select count(distinct entry.value ->> 'id')
    from jsonb_array_elements(p_blocks) entry(value)
  ) <> v_expected_count then
    raise exception 'Deferred role-play pruning refused: duplicate block IDs.'
      using errcode = '22023';
  end if;

  select array_agg((entry.value ->> 'id')::uuid order by entry.value ->> 'id')
    into v_block_ids
  from jsonb_array_elements(p_blocks) entry(value);

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-release:' || p_import_id, 0)
  );

  lock table
    public.programs, public.courses, public.modules, public.lessons,
    public.content_blocks, public.role_play_results,
    public.user_block_progress, public.user_video_progress,
    public.user_video_completion_history, public.user_course_resume
  in share row exclusive mode;

  if exists (
    select 1 from public.content_import_release_records release
    where release.import_id = p_import_id
  ) or exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Deferred role-play pruning refused: import is published or released.'
      using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    join jsonb_array_elements(p_blocks) entry(value)
      on entry.value ->> 'id' = block.id::text
     and entry.value ->> 'scenario_id' = block.content ->> 'scenario_id'
    where block.id = any(v_block_ids)
      and block.block_type = 'role_play'
      and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
  ) <> v_expected_count then
    raise exception 'Deferred role-play pruning refused: exact imported block contract mismatch.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.role_play_results result
    where result.block_id = any(v_block_ids)
  ) or exists (
    select 1 from public.user_block_progress progress
    where progress.block_id = any(v_block_ids)
  ) or exists (
    select 1 from public.user_video_progress progress
    where progress.block_id = any(v_block_ids)
  ) or exists (
    select 1 from public.user_video_completion_history history
    where history.block_id = any(v_block_ids)
  ) or exists (
    select 1 from public.user_course_resume resume
    where resume.last_block_id = any(v_block_ids)
  ) then
    raise exception 'Deferred role-play pruning refused: block activity exists.'
      using errcode = '23503';
  end if;

  -- Reuse the existing exact-import delete trigger binding only around this one
  -- validated statement. Any later error rolls back the deletion atomically.
  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.content_blocks block
  where block.id = any(v_block_ids)
    and block.block_type = 'role_play';
  get diagnostics v_deleted_count = row_count;
  perform set_config('bmh.rollback_import_id', '', true);

  if v_deleted_count <> v_expected_count then
    raise exception 'Deferred role-play pruning failed exact delete count.';
  end if;

  return jsonb_build_object(
    'status', 'pruned',
    'import_id', p_import_id,
    'deleted_count', v_deleted_count
  );
end;
$$;

revoke all on function public.fn_prune_deferred_role_play_blocks_v1(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.fn_prune_deferred_role_play_blocks_v1(text, jsonb, text)
  to service_role;

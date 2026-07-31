-- Forward-fix for production drift: migration 20260730100000
-- (transactional_admin_deletions) merged to main but was never applied to
-- the dhvfsyteqsxagokoerrx project. Verified against prod before writing
-- this: version 20260730100000 is absent from
-- supabase_migrations.schema_migrations (not merely un-run-but-recorded),
-- and `select proname from pg_proc where proname like 'fn_admin%deletion%'`
-- returns zero rows there. This migration establishes the same end state as
-- that file, made idempotent and safe to re-run, rather than backfilling or
-- renumbering the missing history.
--
-- Symptom this closes: admin lesson/module/etc. deletion reports success in
-- the UI but deletes nothing, because the RPCs it calls
-- (fn_admin_preview_deletion_v1 / fn_admin_delete_catalog_entity_v1) do not
-- exist in production and every failure path collapses to "database_rejected".
--
-- Scope note: production is also missing migration 20260730100100
-- (authored_content_security), the second half of the same merged pair.
-- That is being handled separately by open PR #157
-- (codex/forward-security-migration-20260730,
-- supabase/migrations/20260730260000_forward_security_boundaries.sql),
-- which reproduces that migration's end state with additional
-- baseline-fingerprint hardening verified against production's real
-- content_blocks rows. This migration does not duplicate that work: the
-- functions here delete rows (including from public.content_blocks) but
-- never insert or update content_blocks.content, so they do not exercise
-- the BEFORE INSERT OR UPDATE validation trigger PR #157 adds and have no
-- functional dependency on it either direction. Depends on: none.
set lock_timeout = '10s';

-- Admin editor deletion boundary. The UI only requests a preview; this
-- function rechecks every guard under a transaction and owns all cleanup.
-- Immutable imported release evidence is never removed by this boundary.

create or replace function public.fn_admin_preview_deletion_v1(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imported boolean := false;
  v_activity boolean := false;
  v_children integer := 0;
  v_backing integer := 0;
  v_members integer := 0;
  v_access integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    return jsonb_build_object('code', 'database_rejected');
  end if;
  if p_entity_type not in ('module', 'lesson', 'role_group', 'block', 'question', 'option') then
    return jsonb_build_object('code', 'invalid_target');
  end if;

  if p_entity_type = 'module' then
    select count(*) into v_children from public.lessons where module_id = p_entity_id;
    select count(*) into v_backing
      from public.lessons lesson
      where lesson.module_id = p_entity_id
        and (lesson.quiz_id is not null or lesson.assignment_id is not null);
    select exists (
      select 1
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where module.id = p_entity_id
        and (course.content_import_id is not null or lesson.content_import_id is not null)
    ) into v_imported;
    select exists (
      select 1 from public.lessons lesson
      where lesson.module_id = p_entity_id and (
        exists (select 1 from public.user_lesson_completions x where x.lesson_id = lesson.id)
        or exists (select 1 from public.assignment_submissions x where x.lesson_id = lesson.id)
        or exists (select 1 from public.user_quiz_attempts x where x.lesson_id = lesson.id)
        or exists (select 1 from public.content_blocks block join public.user_block_progress x on x.block_id = block.id where block.lesson_id = lesson.id)
        or exists (select 1 from public.content_blocks block join public.user_video_progress x on x.block_id = block.id where block.lesson_id = lesson.id)
        or exists (select 1 from public.content_blocks block join public.role_play_results x on x.block_id = block.id where block.lesson_id = lesson.id)
        or exists (select 1 from public.content_blocks block join public.user_video_completion_history x on x.block_id = block.id where block.lesson_id = lesson.id)
        or exists (select 1 from public.user_course_resume x where x.course_id = (select module.course_id from public.modules module where module.id = p_entity_id) and (x.last_lesson_id = lesson.id or x.last_block_id in (select block.id from public.content_blocks block where block.lesson_id = lesson.id)))
      )
    ) into v_activity;
  elsif p_entity_type = 'lesson' then
    select count(*) into v_children from public.content_blocks where lesson_id = p_entity_id;
    select count(*) into v_backing from public.lessons where id = p_entity_id and (quiz_id is not null or assignment_id is not null);
    select exists (
      select 1 from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.id = p_entity_id and (lesson.content_import_id is not null or course.content_import_id is not null)
    ) into v_imported;
    select exists (
      select 1 from public.user_lesson_completions x where x.lesson_id = p_entity_id
      union all select 1 from public.assignment_submissions x where x.lesson_id = p_entity_id
      union all select 1 from public.user_quiz_attempts x where x.lesson_id = p_entity_id
      union all select 1 from public.user_course_resume x where x.last_lesson_id = p_entity_id
      union all select 1 from public.content_blocks block join public.user_block_progress x on x.block_id = block.id where block.lesson_id = p_entity_id
      union all select 1 from public.content_blocks block join public.user_video_progress x on x.block_id = block.id where block.lesson_id = p_entity_id
      union all select 1 from public.content_blocks block join public.role_play_results x on x.block_id = block.id where block.lesson_id = p_entity_id
      union all select 1 from public.content_blocks block join public.user_video_completion_history x on x.block_id = block.id where block.lesson_id = p_entity_id
      union all select 1 from public.user_course_resume x where x.last_block_id in (select block.id from public.content_blocks block where block.lesson_id = p_entity_id)
    ) into v_activity;
  elsif p_entity_type = 'role_group' then
    select count(*) into v_members from public.user_role_groups where role_group_id = p_entity_id;
    select count(*) into v_access from (
      select 1 from public.program_access where role_group_id = p_entity_id
      union all select 1 from public.course_access where role_group_id = p_entity_id
    ) access_rows;
    select exists (
      select 1 from public.program_access access
      join public.programs program on program.id = access.program_id
      where access.role_group_id = p_entity_id and program.content_import_id is not null
    ) or exists (
      select 1 from public.course_access access
      join public.courses course on course.id = access.course_id
      where access.role_group_id = p_entity_id and course.content_import_id is not null
    ) into v_imported;
    select exists (
      select 1 from public.user_role_groups membership
      where membership.role_group_id = p_entity_id and (
        exists (select 1 from public.user_quiz_attempts x where x.user_id = membership.user_id)
        or exists (select 1 from public.assignment_submissions x where x.user_id = membership.user_id)
      )
    ) into v_activity;
  elsif p_entity_type = 'block' then
    select exists (
      select 1 from public.content_blocks block
      join public.lessons lesson on lesson.id = block.lesson_id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where block.id = p_entity_id and (lesson.content_import_id is not null or course.content_import_id is not null)
    ) into v_imported;
    select exists (
      select 1 from public.user_block_progress x where x.block_id = p_entity_id
      union all select 1 from public.user_video_progress x where x.block_id = p_entity_id
      union all select 1 from public.role_play_results x where x.block_id = p_entity_id
      union all select 1 from public.user_video_completion_history x where x.block_id = p_entity_id
      union all select 1 from public.user_course_resume x where x.last_block_id = p_entity_id
    ) into v_activity;
  elsif p_entity_type = 'question' then
    select exists (
      select 1 from public.questions question
      join public.quizzes quiz on quiz.id = question.quiz_id
      join public.lessons lesson on lesson.quiz_id = quiz.id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where question.id = p_entity_id and (lesson.content_import_id is not null or course.content_import_id is not null)
    ) into v_imported;
    select exists (
      select 1 from public.questions question
      join public.user_quiz_attempts attempt on attempt.quiz_id = question.quiz_id
      where question.id = p_entity_id
    ) into v_activity;
  else
    select exists (
      select 1 from public.answer_options option
      join public.questions question on question.id = option.question_id
      join public.quizzes quiz on quiz.id = question.quiz_id
      join public.lessons lesson on lesson.quiz_id = quiz.id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where option.id = p_entity_id and (lesson.content_import_id is not null or course.content_import_id is not null)
    ) into v_imported;
    select exists (
      select 1 from public.answer_options option
      join public.questions question on question.id = option.question_id
      join public.user_quiz_attempts attempt on attempt.quiz_id = question.quiz_id
      where option.id = p_entity_id
    ) into v_activity;
  end if;

  if p_entity_type = 'module' and not exists (select 1 from public.modules where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
  elsif p_entity_type = 'lesson' and not exists (select 1 from public.lessons where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
  elsif p_entity_type = 'role_group' and not exists (select 1 from public.role_groups where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
  elsif p_entity_type = 'block' and not exists (select 1 from public.content_blocks where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found');
  elsif p_entity_type = 'question' and not exists (select 1 from public.questions where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found');
  elsif p_entity_type = 'option' and not exists (select 1 from public.answer_options where id = p_entity_id) then
    return jsonb_build_object('code', 'not_found');
  end if;

  return jsonb_build_object(
    'code', case when v_imported then 'imported_protected' when v_activity then 'activity_protected' else 'ready' end,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'children', v_children,
    'backing_rows', v_backing,
    'members', v_members,
    'access_grants', v_access
  );
end;
$$;

create or replace function public.fn_admin_delete_catalog_entity_v1(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_quiz_ids uuid[];
  v_assignment_ids uuid[];
  v_quiz_id uuid;
  v_assignment_id uuid;
begin
  if not public.is_admin(auth.uid()) then return jsonb_build_object('code', 'database_rejected'); end if;
  if p_entity_type not in ('module', 'lesson', 'role_group', 'block', 'question', 'option') then
    return jsonb_build_object('code', 'invalid_target');
  end if;
  -- Take the shared catalog lock before the target lock. Import and editor
  -- mutations therefore use one global-to-specific lock order.
  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('admin-delete:' || p_entity_type || ':' || p_entity_id::text, 0));

  -- Lock the target and every activity row consulted by the guards before
  -- evaluating them. The preview is therefore a transaction-local recheck.
  if p_entity_type = 'module' then
    perform 1 from public.modules where id = p_entity_id for update;
    perform 1 from public.lessons where module_id = p_entity_id for update;
    perform 1 from public.content_blocks where lesson_id in (select id from public.lessons where module_id = p_entity_id) for update;
    perform 1 from public.quizzes where id in (select quiz_id from public.lessons where module_id = p_entity_id and quiz_id is not null) for update;
    perform 1 from public.user_lesson_completions where lesson_id in (select id from public.lessons where module_id = p_entity_id) for update;
    perform 1 from public.assignment_submissions where lesson_id in (select id from public.lessons where module_id = p_entity_id) for update;
    perform 1 from public.user_quiz_attempts where quiz_id in (select quiz_id from public.lessons where module_id = p_entity_id and quiz_id is not null) for update;
    perform 1 from public.user_block_progress where block_id in (select id from public.content_blocks where lesson_id in (select id from public.lessons where module_id = p_entity_id)) for update;
    perform 1 from public.user_video_progress where block_id in (select id from public.content_blocks where lesson_id in (select id from public.lessons where module_id = p_entity_id)) for update;
    perform 1 from public.role_play_results where block_id in (select id from public.content_blocks where lesson_id in (select id from public.lessons where module_id = p_entity_id)) for update;
    perform 1 from public.user_video_completion_history where block_id in (select id from public.content_blocks where lesson_id in (select id from public.lessons where module_id = p_entity_id)) for update;
    perform 1 from public.user_course_resume where course_id = (select course_id from public.modules where id = p_entity_id) and (last_lesson_id in (select id from public.lessons where module_id = p_entity_id) or last_block_id in (select block.id from public.content_blocks block join public.lessons lesson on lesson.id = block.lesson_id where lesson.module_id = p_entity_id)) for update;
  elsif p_entity_type = 'lesson' then
    perform 1 from public.lessons where id = p_entity_id for update;
    perform 1 from public.content_blocks where lesson_id = p_entity_id for update;
    perform 1 from public.quizzes where id = (select quiz_id from public.lessons where id = p_entity_id) for update;
    perform 1 from public.user_lesson_completions where lesson_id = p_entity_id for update;
    perform 1 from public.assignment_submissions where lesson_id = p_entity_id for update;
    perform 1 from public.user_quiz_attempts where quiz_id = (select quiz_id from public.lessons where id = p_entity_id) for update;
    perform 1 from public.user_course_resume where last_lesson_id = p_entity_id for update;
    perform 1 from public.user_block_progress where block_id in (select id from public.content_blocks where lesson_id = p_entity_id) for update;
    perform 1 from public.user_video_progress where block_id in (select id from public.content_blocks where lesson_id = p_entity_id) for update;
    perform 1 from public.role_play_results where block_id in (select id from public.content_blocks where lesson_id = p_entity_id) for update;
    perform 1 from public.user_video_completion_history where block_id in (select id from public.content_blocks where lesson_id = p_entity_id) for update;
    perform 1 from public.user_course_resume where last_block_id in (select id from public.content_blocks where lesson_id = p_entity_id) for update;
  elsif p_entity_type = 'role_group' then
    perform 1 from public.role_groups where id = p_entity_id for update;
    perform 1 from public.program_access where role_group_id = p_entity_id for update;
    perform 1 from public.course_access where role_group_id = p_entity_id for update;
    perform 1 from public.user_role_groups where role_group_id = p_entity_id for update;
    perform 1 from public.user_quiz_attempts where user_id in (select user_id from public.user_role_groups where role_group_id = p_entity_id) for update;
    perform 1 from public.assignment_submissions where user_id in (select user_id from public.user_role_groups where role_group_id = p_entity_id) for update;
  elsif p_entity_type = 'block' then
    perform 1 from public.content_blocks where id = p_entity_id for update;
    perform 1 from public.user_block_progress where block_id = p_entity_id for update;
    perform 1 from public.user_video_progress where block_id = p_entity_id for update;
    perform 1 from public.role_play_results where block_id = p_entity_id for update;
    perform 1 from public.user_video_completion_history where block_id = p_entity_id for update;
    perform 1 from public.user_course_resume where last_block_id = p_entity_id for update;
  elsif p_entity_type = 'question' then
    perform 1 from public.quizzes where id = (select quiz_id from public.questions where id = p_entity_id) for update;
    perform 1 from public.questions where id = p_entity_id for update;
    perform 1 from public.user_quiz_attempts where quiz_id = (select quiz_id from public.questions where id = p_entity_id) for update;
  else
    perform 1 from public.quizzes where id = (select question.quiz_id from public.questions question join public.answer_options option on option.question_id = question.id where option.id = p_entity_id) for update;
    perform 1 from public.questions where id = (select question.id from public.questions question join public.answer_options option on option.question_id = question.id where option.id = p_entity_id) for update;
    perform 1 from public.answer_options where id = p_entity_id for update;
    perform 1 from public.user_quiz_attempts where quiz_id = (select question.quiz_id from public.questions question join public.answer_options option on option.question_id = question.id where option.id = p_entity_id) for update;
  end if;

  v_preview := public.fn_admin_preview_deletion_v1(p_entity_type, p_entity_id);
  if v_preview->>'code' <> 'ready' then return v_preview; end if;

  if p_entity_type = 'module' then
    perform 1 from public.modules where id = p_entity_id for update;
    select array_agg(lesson.quiz_id) filter (where lesson.quiz_id is not null),
           array_agg(lesson.assignment_id) filter (where lesson.assignment_id is not null)
      into v_quiz_ids, v_assignment_ids from public.lessons lesson where lesson.module_id = p_entity_id;
    delete from public.lessons where module_id = p_entity_id;
    if v_quiz_ids is not null then delete from public.quizzes where id = any(v_quiz_ids); end if;
    if v_assignment_ids is not null then delete from public.assignments where id = any(v_assignment_ids); end if;
    delete from public.modules where id = p_entity_id;
  elsif p_entity_type = 'lesson' then
    perform 1 from public.lessons where id = p_entity_id for update;
    select quiz_id, assignment_id into v_quiz_id, v_assignment_id from public.lessons where id = p_entity_id;
    delete from public.lessons where id = p_entity_id;
    if v_quiz_id is not null then delete from public.quizzes where id = v_quiz_id; end if;
    if v_assignment_id is not null then delete from public.assignments where id = v_assignment_id; end if;
  elsif p_entity_type = 'role_group' then
    perform 1 from public.role_groups where id = p_entity_id for update;
    delete from public.program_access where role_group_id = p_entity_id;
    delete from public.course_access where role_group_id = p_entity_id;
    delete from public.user_role_groups where role_group_id = p_entity_id;
    delete from public.role_groups where id = p_entity_id;
  elsif p_entity_type = 'block' then
    perform 1 from public.content_blocks where id = p_entity_id for update;
    delete from public.content_blocks where id = p_entity_id;
  elsif p_entity_type = 'question' then
    perform 1 from public.quizzes where id = (select quiz_id from public.questions where id = p_entity_id) for update;
    perform 1 from public.questions where id = p_entity_id for update;
    delete from public.questions where id = p_entity_id;
  else
    perform 1 from public.quizzes where id = (select question.quiz_id from public.questions question join public.answer_options option on option.question_id = question.id where option.id = p_entity_id) for update;
    perform 1 from public.questions where id = (select question.id from public.questions question join public.answer_options option on option.question_id = question.id where option.id = p_entity_id) for update;
    perform 1 from public.answer_options where id = p_entity_id for update;
    delete from public.answer_options where id = p_entity_id;
  end if;
  return jsonb_build_object('code', 'deleted', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
exception when serialization_failure or deadlock_detected then
  return jsonb_build_object('code', 'race_conflict', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
when foreign_key_violation or raise_exception then
  return jsonb_build_object('code', 'database_rejected', 'entity_type', p_entity_type, 'entity_id', p_entity_id);
end;
$$;

revoke all on function public.fn_admin_preview_deletion_v1(text, uuid) from public, anon;
revoke all on function public.fn_admin_delete_catalog_entity_v1(text, uuid) from public, anon;
grant execute on function public.fn_admin_preview_deletion_v1(text, uuid) to authenticated;
grant execute on function public.fn_admin_delete_catalog_entity_v1(text, uuid) to authenticated;

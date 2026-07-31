-- Forward-only repair for the two security boundaries that were never applied
-- before production advanced past their timestamps. This file is intentionally
-- newer than every migration in this repository and does not repair history.
--
-- The baseline gate is deliberately before every CREATE OR REPLACE. A same-name
-- function or trigger is not evidence of ownership: drift is a hard refusal.
begin;
set local lock_timeout = '10s';

do $$
declare
  v_table text;
  v_acl text[];
  v_is_admin record;
  v_fn record;
begin
  foreach v_table in array array[
    'public.courses', 'public.programs', 'public.modules', 'public.lessons',
    'public.content_blocks', 'public.quizzes', 'public.assignments',
    'public.questions', 'public.answer_options', 'public.role_groups',
    'public.program_access', 'public.course_access', 'public.user_role_groups',
    'public.user_lesson_completions', 'public.assignment_submissions',
    'public.user_quiz_attempts', 'public.user_block_progress',
    'public.user_video_progress', 'public.role_play_results',
    'public.user_video_completion_history', 'public.user_course_resume'
  ] loop
    if to_regclass(v_table) is null then
      raise exception 'forward security migration refused: approved baseline relation % is missing', v_table
        using errcode = '55000';
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid = 'public.content_blocks'::regclass) then
    raise exception 'forward security migration refused: public.content_blocks RLS is disabled'
      using errcode = '55000';
  end if;

  select p.prolang, p.prosecdef, p.proconfig, coalesce(p.proacl, acldefault('f', p.proowner)) as acl
    into v_is_admin
    from pg_proc p
    where p.oid = to_regprocedure('public.is_admin(uuid)');
  if not found
    or v_is_admin.prolang <> (select oid from pg_language where lanname = 'sql')
    or not v_is_admin.prosecdef
    or not (coalesce(v_is_admin.proconfig, '{}'::text[]) @> array['search_path=']::text[])
  then
    raise exception 'forward security migration refused: public.is_admin(uuid) definition/security baseline mismatch'
      using errcode = '55000';
  end if;

    select array_agg(coalesce(r.rolname, 'PUBLIC') order by coalesce(r.rolname, 'PUBLIC'))
    into v_acl
    from aclexplode(v_is_admin.acl) x
    left join pg_roles r on r.oid = x.grantee
    where x.grantor = (select proowner from pg_proc where oid = to_regprocedure('public.is_admin(uuid)'))
      and x.privilege_type = 'EXECUTE'
      and x.is_grantable = false;
  if v_acl is distinct from array['authenticated', 'service_role']::text[] then
    raise exception 'forward security migration refused: public.is_admin(uuid) ACL baseline mismatch: %', v_acl
      using errcode = '55000';
  end if;

  for v_fn in
    select p.oid::regprocedure as identity, p.prolang, p.prosecdef, p.proconfig,
           p.provolatile,
           md5(p.prosrc) as body_md5,
           case p.oid::regprocedure::text
             when to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)')::text
               then '11666f54928b682a6ef05d4a2407f3eb'
             when to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)')::text
               then 'c939eb40e97681ea8e2d42fde77c8cd0'
             when to_regprocedure('public.bmh_authored_content_is_safe(text, jsonb)')::text
               then 'cc96238858ad04b847975e6a42d2ff9a'
             when to_regprocedure('public.bmh_validate_authored_content_trigger()')::text
               then '5c3658012315dc0169063fd023077513'
           end as expected_body_md5,
           coalesce(p.proacl, acldefault('f', p.proowner)) as acl
    from pg_proc p
    where p.oid in (
      to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)'),
      to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)'),
      to_regprocedure('public.bmh_authored_content_is_safe(text, jsonb)'),
      to_regprocedure('public.bmh_validate_authored_content_trigger()')
    )
  loop
    if v_fn.body_md5 <> v_fn.expected_body_md5
      or v_fn.prolang <> (select oid from pg_language where lanname = 'plpgsql')
      or (v_fn.identity::text like '%bmh_authored_content_is_safe%' and v_fn.provolatile <> 'i')
      or (v_fn.identity::text like '%fn_admin_%' and (
        not v_fn.prosecdef
        or not (coalesce(v_fn.proconfig, '{}'::text[]) @> array['search_path=public']::text[])
        or not exists (
          select 1
          from aclexplode(v_fn.acl) x
          join pg_roles r on r.oid = x.grantee
          where r.rolname = 'authenticated'
            and x.privilege_type = 'EXECUTE'
            and not x.is_grantable
        )
        or exists (
          select 1
          from aclexplode(v_fn.acl) x
          left join pg_roles r on r.oid = x.grantee
          where (x.grantee = 0 or r.rolname = 'anon')
            and x.privilege_type = 'EXECUTE'
        )
      ))
    then
      raise exception 'forward security migration refused: existing % function definition/security baseline mismatch', v_fn.identity
        using errcode = '55000';
    end if;
  end loop;
end;
$$;

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

-- Authored content boundary. Existing rows are not repaired here. The readable
-- violation notice below is intentional, while the trigger and NOT VALID check
-- protect all newly written rows without making this migration a data repair.

create or replace function public.bmh_authored_content_is_safe(p_block_type text, p_content jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_url text;
  v_source text;
  v_card jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then return false; end if;
  if octet_length(p_content::text) > 102400 then return false; end if;

  for v_url in select value from jsonb_each_text(p_content)
    where key in ('signed_url', 'poster_signed_url', 'caption_signed_url', 'transcript_signed_url')
  loop return false; end loop;

  for v_url in select key from jsonb_object_keys(p_content) key
    where key in ('file_path', 'poster_path', 'caption_path', 'transcript_path')
  loop
    if jsonb_typeof(p_content -> v_url) not in ('string', 'null') then return false; end if;
    if coalesce(p_content ->> v_url, '') <> '' and (
      length(btrim(p_content ->> v_url)) > 1024 or
      btrim(p_content ->> v_url) like '/%' or
      position(chr(92) in btrim(p_content ->> v_url)) > 0 or
      btrim(p_content ->> v_url) like '%?%' or
      btrim(p_content ->> v_url) like '%#%' or
      btrim(p_content ->> v_url) ~ '(^|/)(\.|\.\.)(/|$)' or
      btrim(p_content ->> v_url) ~ '^[a-z][a-z0-9+.-]*:'
    ) then return false; end if;
  end loop;

  if p_block_type = 'role_play' and
     (p_content ? 'iframe_src' or p_content ? 'launch_credential') then return false; end if;

  if p_block_type = 'external_link' and p_content ? 'url' and
     jsonb_typeof(p_content->'url') not in ('string', 'null') then return false; end if;
  if p_block_type = 'external_link' and coalesce(btrim(p_content->>'url'), '') <> '' and
     (btrim(p_content->>'url') !~ '^https://[^/@?#]+([/?#]|$)') then return false; end if;
  if p_block_type = 'audio' and coalesce(p_content->>'url', '') <> '' and
     (p_content->>'url' !~ '^https://[^/@?#]+([/?#]|$)') then return false; end if;
  if p_block_type = 'embed' and coalesce(p_content->>'iframe_src', '') <> '' and
     (p_content->>'iframe_src' !~ '^https://(www\.)?(loom\.com|youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com)([/#?]|$)' and
      p_content->>'iframe_src' !~ '^https://player\.vimeo\.com([/#?]|$)' and
      p_content->>'iframe_src' !~ '^https://fast\.wistia\.net([/#?]|$)') then return false; end if;
  if p_block_type = 'video' and coalesce(p_content->>'url', '') <> '' then
    v_url := p_content->>'url';
    v_source := p_content->>'source';
    if v_source = 'youtube' and v_url !~ '^https://(www\.)?(youtube\.com|youtu\.be)([/#?]|$)' then return false; end if;
    if v_source = 'vimeo' and v_url !~ '^https://(www\.)?vimeo\.com([/#?]|$)' then return false; end if;
    if v_source = 'loom' and v_url !~ '^https://(www\.)?loom\.com([/#?]|$)' then return false; end if;
    if v_source not in ('youtube', 'vimeo', 'loom') and v_url !~ '^https://[^/@?#]+([/?#]|$)' then return false; end if;
  end if;

  if p_block_type = 'flashcard' then
    if jsonb_typeof(p_content->'cards') <> 'array' or jsonb_array_length(p_content->'cards') < 1 or jsonb_array_length(p_content->'cards') > 100 then return false; end if;
    for v_card in select value from jsonb_array_elements(p_content->'cards') loop
      if jsonb_typeof(v_card) <> 'object' or coalesce(length(v_card->>'front'), 0) = 0 or coalesce(length(v_card->>'back'), 0) = 0 or length(v_card->>'front') > 2000 or length(v_card->>'back') > 2000 then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_blocks'::regclass
      and conname = 'content_blocks_authored_content_security_check'
      and (
        contype <> 'c'
        or convalidated
        or pg_get_constraintdef(oid, true) <>
          'CHECK (bmh_authored_content_is_safe(block_type, content)) NOT VALID'
      )
  ) then
    raise exception 'forward security migration refused: content_blocks_authored_content_security_check exists with a foreign definition'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_blocks'::regclass
      and conname = 'content_blocks_authored_content_security_check'
  ) then
    alter table public.content_blocks
      add constraint content_blocks_authored_content_security_check
      check (public.bmh_authored_content_is_safe(block_type, content)) not valid;
  end if;
end;
$$;

do $$
declare
  v_violations bigint;
begin
  select count(*) into v_violations
  from public.content_blocks
  where not public.bmh_authored_content_is_safe(block_type, content);
  raise notice 'forward security migration: existing content_blocks rows violating authored-content security = %', v_violations;
end;
$$;

create or replace function public.bmh_validate_authored_content_trigger()
returns trigger
language plpgsql
as $$
begin
  if not public.bmh_authored_content_is_safe(new.block_type, new.content) then
    raise exception 'content_blocks authored content failed security validation';
  end if;
  return new;
end;
$$;

do $$
declare
  v_trigger record;
begin
  select t.tgfoid, t.tgtype, t.tgenabled, t.tgattr::smallint[] as tgattr
    into v_trigger
    from pg_trigger t
    where t.tgrelid = 'public.content_blocks'::regclass
      and t.tgname = 'content_blocks_validate_authored_content'
      and not t.tgisinternal;

  if found then
    if v_trigger.tgfoid <> 'public.bmh_validate_authored_content_trigger()'::regprocedure
      or v_trigger.tgtype <> 21
      or v_trigger.tgenabled <> 'O'
      or cardinality(v_trigger.tgattr) <> 2
      or not (v_trigger.tgattr @> array[
        (select attnum::smallint from pg_attribute where attrelid = 'public.content_blocks'::regclass and attname = 'block_type'),
        (select attnum::smallint from pg_attribute where attrelid = 'public.content_blocks'::regclass and attname = 'content')
      ])
    then
      raise exception 'forward security migration refused: content_blocks_validate_authored_content is owned by a foreign trigger definition'
        using errcode = '55000';
    end if;
  else
    execute 'create trigger content_blocks_validate_authored_content
      before insert or update of block_type, content on public.content_blocks
      for each row execute function public.bmh_validate_authored_content_trigger()';
  end if;
end;
$$;

commit;

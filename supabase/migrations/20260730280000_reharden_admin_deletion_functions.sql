-- Closes an ordering hazard between two already-merged/open migrations:
--
-- 20260730270000_apply_missing_admin_deletion_functions.sql (merged) ships
-- byte-identical pre-fix copies of public.fn_admin_preview_deletion_v1 and
-- public.fn_admin_delete_catalog_entity_v1 -- the same NULL p_entity_type
-- validation bypass that 20260730260000_forward_security_boundaries.sql
-- (open PR) fixes ('p_entity_type not in (...)' evaluates NULL, not TRUE,
-- for a NULL input, so a bare NOT IN guard lets it fall through to the
-- final unvalidated branch). 20260730270000 sorts after 20260730260000, so
-- a single push that applies both in one run (100000 -> 260000 -> 270000)
-- lets 270000's CREATE OR REPLACE silently overwrite 260000's hardened
-- bodies with the vulnerable pre-image -- no error, no warning. This file
-- is intentionally newer than both and does not touch migration history.
--
-- This does not assume 20260730260000 has already run: it establishes the
-- hardened bodies directly, byte-identical to that migration's, so the two
-- migrations converge on the same end state regardless of which one a given
-- environment happens to apply last. The baseline gate accepts only the
-- known hardened body or the known vulnerable pre-image for each function;
-- anything else is unrecognized drift and the migration refuses rather than
-- guessing. Depends on: none (20260730260000 is not required to have run).
--
-- Wrapped in an explicit transaction (matching 20260730260000's own
-- convention): a bare autocommit script would let the guard's RAISE abort
-- only that one statement while later CREATE OR REPLACE statements in the
-- same file still ran unaffected, silently overwriting whatever the guard
-- just refused to trust. begin/commit makes the refusal apply to the whole
-- migration.
begin;
set local lock_timeout = '10s';

do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as identity,
           p.prolang,
           p.prosecdef,
           p.provolatile,
           p.proconfig,
           md5(p.prosrc) as body_md5,
           (select r.rolname from pg_roles r where r.oid = p.proowner) as owner_rolname,
           case p.oid::regprocedure::text
             when to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)')::text
               then '8c66a3213456123f55a86d865a73e909'
             when to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)')::text
               then '8e25647f33bb2cce249d77d2f5a9595c'
           end as hardened_body_md5,
           case p.oid::regprocedure::text
             when to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)')::text
               then '11666f54928b682a6ef05d4a2407f3eb'
             when to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)')::text
               then 'c939eb40e97681ea8e2d42fde77c8cd0'
           end as vulnerable_body_md5,
           coalesce(p.proacl, acldefault('f', p.proowner)) as acl
    from pg_proc p
    where p.oid in (
      to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)'),
      to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)')
    )
  loop
    if v_fn.body_md5 <> v_fn.hardened_body_md5 and v_fn.body_md5 <> v_fn.vulnerable_body_md5 then
      raise exception 'reharden migration refused: % has an unrecognized body (neither the hardened nor the known pre-fix definition) -- refusing to overwrite unknown drift', v_fn.identity
        using errcode = '55000';
    end if;
    if v_fn.prolang <> (select oid from pg_language where lanname = 'plpgsql')
      or not v_fn.prosecdef
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
        -- Any EXECUTE grantee other than the function's own owner or
        -- `authenticated`, or any EXECUTE grant at all (including the
        -- owner's) carrying WITH GRANT OPTION, is unrecognized drift: a
        -- grantable EXECUTE lets whoever holds it re-grant to anon or
        -- another role later, after this migration has already decided
        -- the state looks trustworthy. Reject the whole ACL shape rather
        -- than merely checking that authenticated is present and anon is
        -- absent, matching 20260730260000's is_admin baseline check.
        select 1
        from aclexplode(v_fn.acl) x
        left join pg_roles r on r.oid = x.grantee
        where x.privilege_type = 'EXECUTE'
          and (
            x.is_grantable
            or x.grantee = 0
            or coalesce(r.rolname, '') not in ('authenticated', v_fn.owner_rolname)
          )
      )
    then
      raise exception 'reharden migration refused: % security baseline (language/security-definer/search_path/ACL) does not match either recognized generation', v_fn.identity
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1 from pg_proc where oid = to_regprocedure('public.fn_admin_preview_deletion_v1(text, uuid)')
  ) or not exists (
    select 1 from pg_proc where oid = to_regprocedure('public.fn_admin_delete_catalog_entity_v1(text, uuid)')
  ) then
    raise exception 'reharden migration refused: fn_admin_preview_deletion_v1 / fn_admin_delete_catalog_entity_v1 do not exist yet -- apply 20260730270000 (or 20260730100000) first'
      using errcode = '55000';
  end if;
end;
$$;

-- Byte-identical to 20260730260000_forward_security_boundaries.sql's bodies
-- for these two functions. Re-establishing them here (rather than relying
-- on that migration alone) is what makes the end state independent of
-- whether 20260730260000 or 20260730270000 was applied last.

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
  -- `p_entity_type is null or` is required: Postgres `NULL NOT IN (...)`
  -- evaluates to NULL (not TRUE), so a bare `NOT IN` guard silently lets a
  -- NULL entity_type through. Every branch below is `elsif p_entity_type =
  -- '<type>'`, which is also NULL for a NULL input, so it falls all the
  -- way to the final `else` (the 'option' case) unvalidated.
  if p_entity_type is null or p_entity_type not in ('module', 'lesson', 'role_group', 'block', 'question', 'option') then
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
  -- `p_entity_type is null or` is required: see fn_admin_preview_deletion_v1
  -- above for why a bare NOT IN guard lets NULL fall through to the
  -- final `else` (the 'option'/answer_options delete path) unvalidated.
  if p_entity_type is null or p_entity_type not in ('module', 'lesson', 'role_group', 'block', 'question', 'option') then
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

commit;

-- Roll back one deterministic course import in a single locked transaction.
-- The function rejects unknown or dependent IDs before any delete begins.

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
  v_expected_keys constant text[] := array[
    'answer_options', 'questions', 'content_blocks', 'lessons',
    'assignments', 'quizzes', 'modules', 'program_access',
    'program_courses', 'courses', 'programs', 'role_groups'
  ];
  v_key_count integer;
  v_item_count integer;
  v_distinct_item_count integer;
  v_role_groups uuid[];
  v_programs uuid[];
  v_courses uuid[];
  v_program_courses uuid[];
  v_modules uuid[];
  v_quizzes uuid[];
  v_assignments uuid[];
  v_lessons uuid[];
  v_content_blocks uuid[];
  v_questions uuid[];
  v_answer_options uuid[];
  v_program_access uuid[];
begin
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Rollback refused: invalid import_id.' using errcode = '22023';
  end if;
  if p_owned is null or jsonb_typeof(p_owned) <> 'object' then
    raise exception 'Rollback refused: owned-ID payload must be an object.' using errcode = '22023';
  end if;

  select count(*) into v_key_count from jsonb_object_keys(p_owned);
  if v_key_count <> cardinality(v_expected_keys)
     or not (p_owned ?& v_expected_keys)
     or exists (
       select 1
       from jsonb_object_keys(p_owned) as supplied(key)
       where not (supplied.key = any(v_expected_keys))
     ) then
    raise exception 'Rollback refused: owned-ID payload keys are incomplete or unknown.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_owned) as entry(key, value)
    where jsonb_typeof(entry.value) <> 'array'
  ) then
    raise exception 'Rollback refused: every owned-ID payload value must be an array.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_each(p_owned) as entry(key, value)
    cross join lateral jsonb_array_elements(entry.value) as element(value)
    where jsonb_typeof(element.value) <> 'string'
       or trim(both '"' from element.value::text) !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Rollback refused: every owned ID must be a canonical UUID string.'
      using errcode = '22023';
  end if;

  select count(*), count(distinct entry.key || ':' || element.value::text)
    into v_item_count, v_distinct_item_count
  from jsonb_each(p_owned) as entry(key, value)
  cross join lateral jsonb_array_elements(entry.value) as element(value);
  if v_item_count > 10000 then
    raise exception 'Rollback refused: owned-ID payload exceeds 10000 IDs.' using errcode = '22023';
  end if;
  if v_item_count <> v_distinct_item_count then
    raise exception 'Rollback refused: duplicate owned UUID in one table payload.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_answer_options
    from jsonb_array_elements_text(p_owned -> 'answer_options');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_questions
    from jsonb_array_elements_text(p_owned -> 'questions');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_content_blocks
    from jsonb_array_elements_text(p_owned -> 'content_blocks');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_lessons
    from jsonb_array_elements_text(p_owned -> 'lessons');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_assignments
    from jsonb_array_elements_text(p_owned -> 'assignments');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_quizzes
    from jsonb_array_elements_text(p_owned -> 'quizzes');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_modules
    from jsonb_array_elements_text(p_owned -> 'modules');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_program_access
    from jsonb_array_elements_text(p_owned -> 'program_access');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_program_courses
    from jsonb_array_elements_text(p_owned -> 'program_courses');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_courses
    from jsonb_array_elements_text(p_owned -> 'courses');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_programs
    from jsonb_array_elements_text(p_owned -> 'programs');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_role_groups
    from jsonb_array_elements_text(p_owned -> 'role_groups');

  -- SHARE ROW EXCLUSIVE conflicts with ordinary INSERT, UPDATE, and DELETE.
  -- Holding every dependent table until function exit closes the preflight race.
  lock table
    public.role_groups, public.programs, public.courses,
    public.program_courses, public.program_access, public.course_access,
    public.modules, public.quizzes, public.assignments, public.lessons,
    public.content_blocks, public.questions, public.answer_options,
    public.user_role_groups, public.assignment_submissions,
    public.user_block_progress, public.user_video_progress,
    public.user_lesson_completions, public.user_quiz_attempts,
    public.role_play_results, public.user_course_resume,
    public.certificates, public.program_certificates
  in share row exclusive mode;

  if exists (
    select 1 from public.program_courses
    where (program_id = any(v_programs) or course_id = any(v_courses))
      and not (id = any(v_program_courses))
  ) then raise exception 'Rollback blocked: external program_courses references.'; end if;
  if exists (
    select 1 from public.program_access
    where (program_id = any(v_programs) or role_group_id = any(v_role_groups))
      and not (id = any(v_program_access))
  ) then raise exception 'Rollback blocked: external program_access references.'; end if;
  if exists (
    select 1 from public.course_access
    where course_id = any(v_courses) or role_group_id = any(v_role_groups)
  ) then raise exception 'Rollback blocked: external course_access references.'; end if;

  -- External modules, lessons, questions, answer options, and content blocks
  -- would otherwise be cascade-deleted with an imported parent.
  if exists (
    select 1 from public.modules
    where course_id = any(v_courses) and not (id = any(v_modules))
  ) then raise exception 'Rollback blocked: external modules references.'; end if;
  if exists (
    select 1 from public.lessons
    where (
      module_id = any(v_modules)
      or quiz_id = any(v_quizzes)
      or assignment_id = any(v_assignments)
      or prerequisite_lesson_id = any(v_lessons)
    ) and not (id = any(v_lessons))
  ) then raise exception 'Rollback blocked: external lessons references.'; end if;
  if exists (
    select 1 from public.questions
    where quiz_id = any(v_quizzes) and not (id = any(v_questions))
  ) then raise exception 'Rollback blocked: external questions references.'; end if;
  if exists (
    select 1 from public.answer_options
    where question_id = any(v_questions) and not (id = any(v_answer_options))
  ) then raise exception 'Rollback blocked: external answer options references.'; end if;
  if exists (
    select 1 from public.content_blocks
    where lesson_id = any(v_lessons) and not (id = any(v_content_blocks))
  ) then raise exception 'Rollback blocked: external content blocks references.'; end if;

  if exists (select 1 from public.user_role_groups where role_group_id = any(v_role_groups))
    then raise exception 'Rollback blocked: QA group memberships exist.'; end if;
  if exists (
    select 1 from public.assignment_submissions
    where assignment_id = any(v_assignments) or lesson_id = any(v_lessons)
  ) then raise exception 'Rollback blocked: assignment submissions exist.'; end if;
  if exists (select 1 from public.user_block_progress where block_id = any(v_content_blocks))
    then raise exception 'Rollback blocked: block progress exists.'; end if;
  if exists (select 1 from public.user_video_progress where block_id = any(v_content_blocks))
    then raise exception 'Rollback blocked: video progress exists.'; end if;
  if exists (select 1 from public.user_lesson_completions where lesson_id = any(v_lessons))
    then raise exception 'Rollback blocked: lesson completions exist.'; end if;
  if exists (
    select 1 from public.user_quiz_attempts
    where quiz_id = any(v_quizzes) or lesson_id = any(v_lessons)
  ) then raise exception 'Rollback blocked: quiz attempts exist.'; end if;
  if exists (select 1 from public.role_play_results where block_id = any(v_content_blocks))
    then raise exception 'Rollback blocked: role-play results exist.'; end if;
  if exists (
    select 1 from public.user_course_resume
    where course_id = any(v_courses)
       or last_lesson_id = any(v_lessons)
       or last_block_id = any(v_content_blocks)
  ) then raise exception 'Rollback blocked: course resume rows exist.'; end if;
  if exists (select 1 from public.certificates where course_id = any(v_courses))
    then raise exception 'Rollback blocked: course certificates exist.'; end if;
  if exists (select 1 from public.program_certificates where program_id = any(v_programs))
    then raise exception 'Rollback blocked: program certificates exist.'; end if;

  delete from public.answer_options where id = any(v_answer_options);
  delete from public.questions where id = any(v_questions);
  delete from public.content_blocks where id = any(v_content_blocks);
  delete from public.lessons where id = any(v_lessons);
  delete from public.assignments where id = any(v_assignments);
  delete from public.quizzes where id = any(v_quizzes);
  delete from public.modules where id = any(v_modules);
  delete from public.program_access where id = any(v_program_access);
  delete from public.program_courses where id = any(v_program_courses);
  delete from public.courses where id = any(v_courses);
  delete from public.programs where id = any(v_programs);
  delete from public.role_groups where id = any(v_role_groups);

  return jsonb_build_object(
    'import_id', p_import_id,
    'status', 'rolled_back',
    'owned_id_count', v_item_count
  );
end;
$$;

revoke all on function public.fn_rollback_course_import(text, jsonb) from public;
revoke all on function public.fn_rollback_course_import(text, jsonb) from anon;
revoke all on function public.fn_rollback_course_import(text, jsonb) from authenticated;
grant execute on function public.fn_rollback_course_import(text, jsonb) to service_role;

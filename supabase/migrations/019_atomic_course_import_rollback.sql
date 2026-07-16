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
  v_distinct_source_count integer;
  v_deleted integer;
  v_actual_delete_count integer := 0;
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
    where jsonb_typeof(element.value) <> 'object'
       or (select count(*) from jsonb_object_keys(element.value)) <> 2
       or not (element.value ?& array['id', 'source_key'])
       or jsonb_typeof(element.value -> 'id') <> 'string'
       or jsonb_typeof(element.value -> 'source_key') <> 'string'
       or element.value ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or pg_catalog.length(element.value ->> 'source_key') > 512
       or element.value ->> 'source_key' !~ '^[a-z0-9][a-z0-9._:-]*$'
  ) then
    raise exception 'Rollback refused: every owned entry must contain only canonical id and source_key strings.'
      using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct entry.key || ':' || (element.value ->> 'id')),
    count(distinct element.value ->> 'source_key')
    into v_item_count, v_distinct_item_count, v_distinct_source_count
  from jsonb_each(p_owned) as entry(key, value)
  cross join lateral jsonb_array_elements(entry.value) as element(value);
  if v_item_count > 10000 then
    raise exception 'Rollback refused: owned-ID payload exceeds 10000 IDs.' using errcode = '22023';
  end if;
  if v_item_count <> v_distinct_item_count then
    raise exception 'Rollback refused: duplicate owned UUID in one table payload.'
      using errcode = '22023';
  end if;
  if v_item_count <> v_distinct_source_count then
    raise exception 'Rollback refused: every owned source_key must be globally unique.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_each(p_owned) as entry(key, value)
    cross join lateral jsonb_array_elements(entry.value) as element(value)
    cross join lateral (
      select pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            p_import_id || ':' || (element.value ->> 'source_key'),
            'UTF8'
          )
        ),
        'hex'
      ) as hex
    ) as digest
    where (element.value ->> 'id') <> pg_catalog.format(
      '%s-%s-5%s-a%s-%s',
      pg_catalog.substring(digest.hex, 1, 8),
      pg_catalog.substring(digest.hex, 9, 4),
      pg_catalog.substring(digest.hex, 14, 3),
      pg_catalog.substring(digest.hex, 18, 3),
      pg_catalog.substring(digest.hex, 21, 12)
    )
  ) then
    raise exception 'Rollback refused: owned ID does not match import_id and source_key.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_answer_options
    from jsonb_array_elements(p_owned -> 'answer_options');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_questions
    from jsonb_array_elements(p_owned -> 'questions');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_content_blocks
    from jsonb_array_elements(p_owned -> 'content_blocks');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_lessons
    from jsonb_array_elements(p_owned -> 'lessons');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_assignments
    from jsonb_array_elements(p_owned -> 'assignments');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_quizzes
    from jsonb_array_elements(p_owned -> 'quizzes');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_modules
    from jsonb_array_elements(p_owned -> 'modules');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_program_access
    from jsonb_array_elements(p_owned -> 'program_access');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_program_courses
    from jsonb_array_elements(p_owned -> 'program_courses');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_courses
    from jsonb_array_elements(p_owned -> 'courses');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_programs
    from jsonb_array_elements(p_owned -> 'programs');
  select coalesce(array_agg((value ->> 'id')::uuid), '{}'::uuid[]) into v_role_groups
    from jsonb_array_elements(p_owned -> 'role_groups');

  -- SHARE ROW EXCLUSIVE conflicts with ordinary INSERT, UPDATE, and DELETE.
  -- Holding every dependent table until function exit closes the preflight race.
  lock table
    public.role_groups, public.programs, public.courses,
    public.program_courses, public.program_access, public.course_access, public.invites,
    public.modules, public.quizzes, public.assignments, public.lessons,
    public.content_blocks, public.questions, public.answer_options,
    public.user_role_groups, public.assignment_submissions,
    public.user_block_progress, public.user_video_progress,
    public.user_lesson_completions, public.user_quiz_attempts,
    public.role_play_results, public.user_course_resume,
    public.certificates, public.program_certificates
  in share row exclusive mode;

  -- Every declared row must exist. A missing UUID means the manifest does not
  -- exactly describe the applied import, so returning a successful count would
  -- be unsafe and misleading.
  if (select count(*) from public.role_groups where id = any(v_role_groups))
       <> cardinality(v_role_groups)
    then raise exception 'Rollback refused: unknown role_groups ID.'; end if;
  if (select count(*) from public.programs where id = any(v_programs))
       <> cardinality(v_programs)
    then raise exception 'Rollback refused: unknown programs ID.'; end if;
  if (select count(*) from public.courses where id = any(v_courses))
       <> cardinality(v_courses)
    then raise exception 'Rollback refused: unknown courses ID.'; end if;
  if (select count(*) from public.program_courses where id = any(v_program_courses))
       <> cardinality(v_program_courses)
    then raise exception 'Rollback refused: unknown program_courses ID.'; end if;
  if (select count(*) from public.modules where id = any(v_modules))
       <> cardinality(v_modules)
    then raise exception 'Rollback refused: unknown modules ID.'; end if;
  if (select count(*) from public.quizzes where id = any(v_quizzes))
       <> cardinality(v_quizzes)
    then raise exception 'Rollback refused: unknown quizzes ID.'; end if;
  if (select count(*) from public.assignments where id = any(v_assignments))
       <> cardinality(v_assignments)
    then raise exception 'Rollback refused: unknown assignments ID.'; end if;
  if (select count(*) from public.lessons where id = any(v_lessons))
       <> cardinality(v_lessons)
    then raise exception 'Rollback refused: unknown lessons ID.'; end if;
  if (select count(*) from public.content_blocks where id = any(v_content_blocks))
       <> cardinality(v_content_blocks)
    then raise exception 'Rollback refused: unknown content_blocks ID.'; end if;
  if (select count(*) from public.questions where id = any(v_questions))
       <> cardinality(v_questions)
    then raise exception 'Rollback refused: unknown questions ID.'; end if;
  if (select count(*) from public.answer_options where id = any(v_answer_options))
       <> cardinality(v_answer_options)
    then raise exception 'Rollback refused: unknown answer_options ID.'; end if;
  if (select count(*) from public.program_access where id = any(v_program_access))
       <> cardinality(v_program_access)
    then raise exception 'Rollback refused: unknown program_access ID.'; end if;

  -- Before migration 020 adds explicit content_import_id provenance, the
  -- rollback contract binds each UUID to import_id + source_key above and
  -- requires a closed, internally consistent import graph here. Neither check
  -- alone is sufficient; together they prevent a validly shaped payload from
  -- naming unrelated catalog rows.
  if exists (
    select 1 from public.program_courses
    where id = any(v_program_courses)
      and (not (program_id = any(v_programs)) or not (course_id = any(v_courses)))
  ) then raise exception 'Rollback refused: program_courses graph mismatch.'; end if;
  if exists (
    select 1 from public.program_access
    where id = any(v_program_access)
      and (not (program_id = any(v_programs)) or not (role_group_id = any(v_role_groups)))
  ) then raise exception 'Rollback refused: program_access graph mismatch.'; end if;
  if exists (
    select 1 from public.modules
    where id = any(v_modules) and not (course_id = any(v_courses))
  ) then raise exception 'Rollback refused: modules graph mismatch.'; end if;
  if exists (
    select 1 from public.lessons
    where id = any(v_lessons)
      and (
        not (module_id = any(v_modules))
        or (quiz_id is not null and not (quiz_id = any(v_quizzes)))
        or (assignment_id is not null and not (assignment_id = any(v_assignments)))
        or (prerequisite_lesson_id is not null and not (prerequisite_lesson_id = any(v_lessons)))
      )
  ) then raise exception 'Rollback refused: lessons graph mismatch.'; end if;
  if exists (
    select 1 from public.content_blocks
    where id = any(v_content_blocks) and not (lesson_id = any(v_lessons))
  ) then raise exception 'Rollback refused: content_blocks graph mismatch.'; end if;
  if exists (
    select 1 from public.questions
    where id = any(v_questions) and not (quiz_id = any(v_quizzes))
  ) then raise exception 'Rollback refused: questions graph mismatch.'; end if;
  if exists (
    select 1 from public.answer_options
    where id = any(v_answer_options) and not (question_id = any(v_questions))
  ) then raise exception 'Rollback refused: answer_options graph mismatch.'; end if;
  if exists (
    select 1 from public.quizzes q
    where q.id = any(v_quizzes)
      and not exists (
        select 1 from public.lessons l
        where l.id = any(v_lessons) and l.quiz_id = q.id
      )
  ) then raise exception 'Rollback refused: unlinked owned quiz.'; end if;
  if exists (
    select 1 from public.assignments a
    where a.id = any(v_assignments)
      and not exists (
        select 1 from public.lessons l
        where l.id = any(v_lessons) and l.assignment_id = a.id
      )
  ) then raise exception 'Rollback refused: unlinked owned assignment.'; end if;
  if exists (
    select 1 from public.courses c
    where c.id = any(v_courses)
      and not exists (
        select 1 from public.program_courses pc
        where pc.id = any(v_program_courses) and pc.course_id = c.id
      )
  ) then raise exception 'Rollback refused: unlinked owned course.'; end if;
  if exists (
    select 1 from public.programs p
    where p.id = any(v_programs)
      and not exists (
        select 1 from public.program_courses pc
        where pc.id = any(v_program_courses) and pc.program_id = p.id
      )
  ) then raise exception 'Rollback refused: unlinked owned program.'; end if;
  if exists (
    select 1 from public.role_groups rg
    where rg.id = any(v_role_groups)
      and not exists (
        select 1 from public.program_access pa
        where pa.id = any(v_program_access) and pa.role_group_id = rg.id
      )
  ) then raise exception 'Rollback refused: unlinked owned role group.'; end if;

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
  if exists (
    select 1 from public.invites
    where role_group_ids && v_role_groups
  ) then raise exception 'Rollback blocked: pending or historical invites reference the QA group.'; end if;

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
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_answer_options)
    then raise exception 'Rollback failed exact delete count for answer_options.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.questions where id = any(v_questions);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_questions)
    then raise exception 'Rollback failed exact delete count for questions.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.content_blocks where id = any(v_content_blocks);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_content_blocks)
    then raise exception 'Rollback failed exact delete count for content_blocks.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.lessons where id = any(v_lessons);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_lessons)
    then raise exception 'Rollback failed exact delete count for lessons.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.assignments where id = any(v_assignments);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_assignments)
    then raise exception 'Rollback failed exact delete count for assignments.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.quizzes where id = any(v_quizzes);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_quizzes)
    then raise exception 'Rollback failed exact delete count for quizzes.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.modules where id = any(v_modules);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_modules)
    then raise exception 'Rollback failed exact delete count for modules.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.program_access where id = any(v_program_access);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_program_access)
    then raise exception 'Rollback failed exact delete count for program_access.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.program_courses where id = any(v_program_courses);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_program_courses)
    then raise exception 'Rollback failed exact delete count for program_courses.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.courses where id = any(v_courses);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_courses)
    then raise exception 'Rollback failed exact delete count for courses.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.programs where id = any(v_programs);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_programs)
    then raise exception 'Rollback failed exact delete count for programs.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  delete from public.role_groups where id = any(v_role_groups);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_role_groups)
    then raise exception 'Rollback failed exact delete count for role_groups.'; end if;
  v_actual_delete_count := v_actual_delete_count + v_deleted;

  if v_actual_delete_count <> v_item_count then
    raise exception 'Rollback failed aggregate exact delete count.';
  end if;

  return jsonb_build_object(
    'import_id', p_import_id,
    'status', 'rolled_back',
    'owned_id_count', v_actual_delete_count
  );
end;
$$;

revoke all on function public.fn_rollback_course_import(text, jsonb) from public;
revoke all on function public.fn_rollback_course_import(text, jsonb) from anon;
revoke all on function public.fn_rollback_course_import(text, jsonb) from authenticated;
grant execute on function public.fn_rollback_course_import(text, jsonb) to service_role;

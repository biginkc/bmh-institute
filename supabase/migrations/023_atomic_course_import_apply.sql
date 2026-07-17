-- Apply one deterministic course import in a single transaction.
-- The RPC accepts only the importer-owned tables and their exact row shapes.

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
  v_operation_count integer;
  v_distinct_ids integer;
  v_distinct_source_keys integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import apply requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import apply refused: invalid import_id.' using errcode = '22023';
  end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Course import apply refused: operations must be an array.' using errcode = '22023';
  end if;

  v_operation_count := jsonb_array_length(p_operations);
  if v_operation_count < 1 or v_operation_count > 10000 then
    raise exception 'Course import apply refused: operations must contain 1 to 10000 rows.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) with ordinality as operation(value, ordinal)
    where jsonb_typeof(operation.value) <> 'object'
       or (select count(*) from jsonb_object_keys(operation.value)) <> 5
       or not (operation.value ?& array['action', 'table', 'source_key', 'id', 'row'])
       or jsonb_typeof(operation.value -> 'action') <> 'string'
       or operation.value ->> 'action' <> 'upsert'
       or jsonb_typeof(operation.value -> 'table') <> 'string'
       or not ((operation.value ->> 'table') = any(array[
         'role_groups', 'programs', 'courses', 'program_courses', 'modules',
         'quizzes', 'assignments', 'lessons', 'content_blocks', 'questions',
         'answer_options', 'program_access'
       ]::text[]))
       or jsonb_typeof(operation.value -> 'source_key') <> 'string'
       or pg_catalog.length(operation.value ->> 'source_key') > 512
       or operation.value ->> 'source_key' !~ '^[a-z0-9][a-z0-9._:-]*$'
       or jsonb_typeof(operation.value -> 'id') <> 'string'
       or operation.value ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(operation.value -> 'row') <> 'object'
       or jsonb_typeof(operation.value -> 'row' -> 'id') <> 'string'
       or operation.value -> 'row' ->> 'id' <> operation.value ->> 'id'
  ) then
    raise exception 'Course import apply refused: malformed operation envelope.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) as operation(value)
    cross join lateral (
      select pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            p_import_id || ':' || (operation.value ->> 'source_key'),
            'UTF8'
          )
        ),
        'hex'
      ) as hex
    ) as digest
    where operation.value ->> 'id' <> pg_catalog.format(
      '%s-%s-5%s-a%s-%s',
      pg_catalog.substring(digest.hex, 1, 8),
      pg_catalog.substring(digest.hex, 9, 4),
      pg_catalog.substring(digest.hex, 14, 3),
      pg_catalog.substring(digest.hex, 18, 3),
      pg_catalog.substring(digest.hex, 21, 12)
    )
  ) then
    raise exception 'Course import apply refused: deterministic ID mismatch.' using errcode = '22023';
  end if;

  select
    count(distinct operation.value ->> 'id'),
    count(distinct operation.value ->> 'source_key')
    into v_distinct_ids, v_distinct_source_keys
  from jsonb_array_elements(p_operations) as operation(value);
  if v_distinct_ids <> v_operation_count or v_distinct_source_keys <> v_operation_count then
    raise exception 'Course import apply refused: operation IDs and source_keys must be globally unique.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'role_groups') <> 1
     or (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'programs') <> 1
     or (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'program_access') <> 1
     or (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'courses') < 1
     or (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'program_courses')
        <> (select count(*) from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'courses') then
    raise exception 'Course import apply refused: incomplete import root graph.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) with ordinality as operation(value, ordinal)
    where (select array_agg(key order by key) from jsonb_object_keys(operation.value -> 'row') as keys(key))
      is distinct from case operation.value ->> 'table'
        when 'role_groups' then array['description','id','name']
        when 'programs' then array['certificate_enabled','content_import_id','course_order_mode','description','id','is_published','thumbnail_approved_path','thumbnail_approved_sha256','thumbnail_asset_key','thumbnail_path','title']
        when 'courses' then array['certificate_enabled','content_import_id','description','id','is_published','sort_order','thumbnail_approved_path','thumbnail_approved_sha256','thumbnail_asset_key','thumbnail_path','title']
        when 'program_courses' then array['course_id','id','program_id','sort_order']
        when 'modules' then array['course_id','description','id','sort_order','title']
        when 'quizzes' then array['description','id','max_attempts','passing_score','questions_per_attempt','randomize_answers','randomize_questions','retake_cooldown_hours','show_correct_answers_after','title']
        when 'assignments' then array['id','instructions','requires_review','rubric','submission_type','title']
        when 'lessons' then array['assignment_id','content_import_id','description','id','is_required_for_completion','lesson_type','module_id','prerequisite_lesson_id','quiz_id','sort_order','thumbnail_approved_path','thumbnail_approved_sha256','thumbnail_asset_key','thumbnail_path','title']
        when 'content_blocks' then array['block_type','content','id','is_required_for_completion','lesson_id','sort_order']
        when 'questions' then array['explanation','id','points','question_text','question_type','quiz_id','sort_order']
        when 'answer_options' then array['id','is_correct','option_text','question_id','sort_order']
        when 'program_access' then array['id','program_id','role_group_id']
      end
  ) then
    raise exception 'Course import apply refused: operation row keys do not match the table contract.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) operation(value)
    where value ->> 'table' in ('programs', 'courses', 'lessons')
      and value -> 'row' -> 'content_import_id' is distinct from pg_catalog.to_jsonb(p_import_id)
  ) then
    raise exception 'Course import apply refused: catalog provenance must match import_id.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_operations) operation(value)
    where value ->> 'table' in ('programs', 'courses')
      and value -> 'row' -> 'is_published' is distinct from 'false'::jsonb
  ) then
    raise exception 'Course import apply refused: imported catalog must remain unpublished.' using errcode = '22023';
  end if;

  -- Every relationship must terminate at another row in this exact payload.
  -- Existing database rows are deliberately not accepted as graph parents.
  if exists (
    with operations as (
      select value
      from jsonb_array_elements(p_operations) operation(value)
    ), edges as (
      select 'programs'::text as parent_table, value -> 'row' ->> 'program_id' as parent_id
        from operations where value ->> 'table' = 'program_courses'
      union all
      select 'courses', value -> 'row' ->> 'course_id'
        from operations where value ->> 'table' = 'program_courses'
      union all
      select 'programs', value -> 'row' ->> 'program_id'
        from operations where value ->> 'table' = 'program_access'
      union all
      select 'role_groups', value -> 'row' ->> 'role_group_id'
        from operations where value ->> 'table' = 'program_access'
      union all
      select 'courses', value -> 'row' ->> 'course_id'
        from operations where value ->> 'table' = 'modules'
      union all
      select 'modules', value -> 'row' ->> 'module_id'
        from operations where value ->> 'table' = 'lessons'
      union all
      select 'quizzes', value -> 'row' ->> 'quiz_id'
        from operations where value ->> 'table' = 'lessons' and value -> 'row' ->> 'quiz_id' is not null
      union all
      select 'assignments', value -> 'row' ->> 'assignment_id'
        from operations where value ->> 'table' = 'lessons' and value -> 'row' ->> 'assignment_id' is not null
      union all
      select 'lessons', value -> 'row' ->> 'prerequisite_lesson_id'
        from operations where value ->> 'table' = 'lessons' and value -> 'row' ->> 'prerequisite_lesson_id' is not null
      union all
      select 'lessons', value -> 'row' ->> 'lesson_id'
        from operations where value ->> 'table' = 'content_blocks'
      union all
      select 'quizzes', value -> 'row' ->> 'quiz_id'
        from operations where value ->> 'table' = 'questions'
      union all
      select 'questions', value -> 'row' ->> 'question_id'
        from operations where value ->> 'table' = 'answer_options'
    )
    select 1
    from edges
    where edges.parent_id is null
       or not exists (
         select 1
         from operations parent
         where parent.value ->> 'table' = edges.parent_table
           and parent.value ->> 'id' = edges.parent_id
       )
  ) then
    raise exception 'Course import apply refused: relationship escapes the closed import graph.' using errcode = '22023';
  end if;

  if exists (
    with operations as (
      select value
      from jsonb_array_elements(p_operations) operation(value)
    )
    select 1
    from operations parent
    where
      (parent.value ->> 'table' = 'role_groups' and not exists (
        select 1 from operations child
        where child.value ->> 'table' = 'program_access'
          and child.value -> 'row' ->> 'role_group_id' = parent.value ->> 'id'
      ))
      or (parent.value ->> 'table' = 'programs' and (
        not exists (
          select 1 from operations child
          where child.value ->> 'table' = 'program_courses'
            and child.value -> 'row' ->> 'program_id' = parent.value ->> 'id'
        )
        or not exists (
          select 1 from operations child
          where child.value ->> 'table' = 'program_access'
            and child.value -> 'row' ->> 'program_id' = parent.value ->> 'id'
        )
      ))
      or (parent.value ->> 'table' = 'courses' and (
        select count(*) from operations child
        where child.value ->> 'table' = 'program_courses'
          and child.value -> 'row' ->> 'course_id' = parent.value ->> 'id'
      ) <> 1)
      or (parent.value ->> 'table' = 'modules' and not exists (
        select 1 from operations child
        where child.value ->> 'table' = 'lessons'
          and child.value -> 'row' ->> 'module_id' = parent.value ->> 'id'
      ))
      or (parent.value ->> 'table' = 'quizzes' and (
        (select count(*) from operations child
         where child.value ->> 'table' = 'lessons'
           and child.value -> 'row' ->> 'quiz_id' = parent.value ->> 'id') <> 1
        or not exists (
          select 1 from operations child
          where child.value ->> 'table' = 'questions'
            and child.value -> 'row' ->> 'quiz_id' = parent.value ->> 'id'
        )
      ))
      or (parent.value ->> 'table' = 'assignments' and (
        select count(*) from operations child
        where child.value ->> 'table' = 'lessons'
          and child.value -> 'row' ->> 'assignment_id' = parent.value ->> 'id'
      ) <> 1)
      or (parent.value ->> 'table' = 'questions' and (
        select count(*) from operations child
        where child.value ->> 'table' = 'answer_options'
          and child.value -> 'row' ->> 'question_id' = parent.value ->> 'id'
      ) < 2)
  ) then
    raise exception 'Course import apply refused: payload contains a disconnected import row.' using errcode = '22023';
  end if;

  -- Serialize imports with catalog edits while checking the previous graph.
  -- A same-import rerun may update rows, but it must not silently strand rows
  -- that were present in the previously applied manifest.
  lock table
    public.role_groups, public.programs, public.courses,
    public.program_courses, public.program_access, public.modules,
    public.quizzes, public.assignments, public.lessons,
    public.content_blocks, public.questions, public.answer_options
  in share row exclusive mode;

  if exists (
    with operations as (
      select value
      from jsonb_array_elements(p_operations) operation(value)
    ), owned_programs as (
      select id from public.programs where content_import_id = p_import_id
    ), owned_courses as (
      select id from public.courses where content_import_id = p_import_id
    ), owned_lessons as (
      select id, quiz_id, assignment_id
      from public.lessons where content_import_id = p_import_id
    ), owned_quizzes as (
      select distinct quiz_id as id from owned_lessons where quiz_id is not null
    ), owned_questions as (
      select q.id from public.questions q join owned_quizzes oq on oq.id = q.quiz_id
    ), existing_owned(table_name, id) as (
      select 'programs'::text, id from owned_programs
      union all
      select 'courses', id from owned_courses
      union all
      select 'lessons', id from owned_lessons
      union all
      select 'program_courses', pc.id
      from public.program_courses pc
      where pc.program_id in (select id from owned_programs)
         or pc.course_id in (select id from owned_courses)
      union all
      select 'program_access', pa.id
      from public.program_access pa
      where pa.program_id in (select id from owned_programs)
      union all
      select 'role_groups', pa.role_group_id
      from public.program_access pa
      where pa.program_id in (select id from owned_programs)
      union all
      select 'modules', m.id
      from public.modules m where m.course_id in (select id from owned_courses)
      union all
      select 'quizzes', id from owned_quizzes
      union all
      select 'assignments', assignment_id
      from owned_lessons where assignment_id is not null
      union all
      select 'content_blocks', cb.id
      from public.content_blocks cb where cb.lesson_id in (select id from owned_lessons)
      union all
      select 'questions', id from owned_questions
      union all
      select 'answer_options', ao.id
      from public.answer_options ao where ao.question_id in (select id from owned_questions)
    )
    select 1
    from existing_owned existing
    where not exists (
      select 1
      from operations operation
      where operation.value ->> 'table' = existing.table_name
        and operation.value ->> 'id' = existing.id::text
    )
  ) then
    raise exception 'Course import apply refused: same-import rerun would strand rows from the prior manifest.'
      using errcode = '22023';
  end if;

  insert into public.role_groups (id, name, description)
  select (value ->> 'id')::uuid, value -> 'row' ->> 'name', value -> 'row' ->> 'description'
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'role_groups'
  on conflict (id) do update set name = excluded.name, description = excluded.description;

  insert into public.programs (
    id, title, description, content_import_id, thumbnail_path, thumbnail_asset_key,
    thumbnail_approved_path, thumbnail_approved_sha256, is_published,
    course_order_mode, certificate_enabled
  )
  select
    (value ->> 'id')::uuid, value -> 'row' ->> 'title', value -> 'row' ->> 'description',
    value -> 'row' ->> 'content_import_id', value -> 'row' ->> 'thumbnail_path',
    value -> 'row' ->> 'thumbnail_asset_key', value -> 'row' ->> 'thumbnail_approved_path',
    value -> 'row' ->> 'thumbnail_approved_sha256', (value -> 'row' ->> 'is_published')::boolean,
    value -> 'row' ->> 'course_order_mode', (value -> 'row' ->> 'certificate_enabled')::boolean
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'programs'
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, content_import_id = excluded.content_import_id,
    thumbnail_path = excluded.thumbnail_path, thumbnail_asset_key = excluded.thumbnail_asset_key,
    thumbnail_approved_path = excluded.thumbnail_approved_path,
    thumbnail_approved_sha256 = excluded.thumbnail_approved_sha256,
    is_published = excluded.is_published, course_order_mode = excluded.course_order_mode,
    certificate_enabled = excluded.certificate_enabled;

  insert into public.courses (
    id, title, description, content_import_id, thumbnail_path, thumbnail_asset_key,
    thumbnail_approved_path, thumbnail_approved_sha256, is_published,
    certificate_enabled, sort_order
  )
  select
    (value ->> 'id')::uuid, value -> 'row' ->> 'title', value -> 'row' ->> 'description',
    value -> 'row' ->> 'content_import_id', value -> 'row' ->> 'thumbnail_path',
    value -> 'row' ->> 'thumbnail_asset_key', value -> 'row' ->> 'thumbnail_approved_path',
    value -> 'row' ->> 'thumbnail_approved_sha256', (value -> 'row' ->> 'is_published')::boolean,
    (value -> 'row' ->> 'certificate_enabled')::boolean, (value -> 'row' ->> 'sort_order')::integer
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'courses'
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, content_import_id = excluded.content_import_id,
    thumbnail_path = excluded.thumbnail_path, thumbnail_asset_key = excluded.thumbnail_asset_key,
    thumbnail_approved_path = excluded.thumbnail_approved_path,
    thumbnail_approved_sha256 = excluded.thumbnail_approved_sha256,
    is_published = excluded.is_published, certificate_enabled = excluded.certificate_enabled,
    sort_order = excluded.sort_order;

  insert into public.program_courses (id, program_id, course_id, sort_order)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'program_id')::uuid,
    (value -> 'row' ->> 'course_id')::uuid, (value -> 'row' ->> 'sort_order')::integer
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'program_courses'
  on conflict (id) do update set program_id = excluded.program_id, course_id = excluded.course_id, sort_order = excluded.sort_order;

  insert into public.modules (id, course_id, title, description, sort_order)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'course_id')::uuid,
    value -> 'row' ->> 'title', value -> 'row' ->> 'description', (value -> 'row' ->> 'sort_order')::integer
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'modules'
  on conflict (id) do update set course_id = excluded.course_id, title = excluded.title,
    description = excluded.description, sort_order = excluded.sort_order;

  insert into public.quizzes (
    id, title, description, passing_score, randomize_questions, randomize_answers,
    questions_per_attempt, max_attempts, retake_cooldown_hours, show_correct_answers_after
  )
  select
    (value ->> 'id')::uuid, value -> 'row' ->> 'title', value -> 'row' ->> 'description',
    (value -> 'row' ->> 'passing_score')::integer,
    (value -> 'row' ->> 'randomize_questions')::boolean,
    (value -> 'row' ->> 'randomize_answers')::boolean,
    (value -> 'row' ->> 'questions_per_attempt')::integer,
    (value -> 'row' ->> 'max_attempts')::integer,
    (value -> 'row' ->> 'retake_cooldown_hours')::integer,
    value -> 'row' ->> 'show_correct_answers_after'
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'quizzes'
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, passing_score = excluded.passing_score,
    randomize_questions = excluded.randomize_questions, randomize_answers = excluded.randomize_answers,
    questions_per_attempt = excluded.questions_per_attempt, max_attempts = excluded.max_attempts,
    retake_cooldown_hours = excluded.retake_cooldown_hours,
    show_correct_answers_after = excluded.show_correct_answers_after;

  insert into public.assignments (id, title, instructions, submission_type, requires_review, rubric)
  select (value ->> 'id')::uuid, value -> 'row' ->> 'title', value -> 'row' ->> 'instructions',
    value -> 'row' ->> 'submission_type', (value -> 'row' ->> 'requires_review')::boolean,
    value -> 'row' -> 'rubric'
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'assignments'
  on conflict (id) do update set title = excluded.title, instructions = excluded.instructions,
    submission_type = excluded.submission_type, requires_review = excluded.requires_review, rubric = excluded.rubric;

  insert into public.lessons (
    id, module_id, title, description, content_import_id, lesson_type, quiz_id,
    assignment_id, prerequisite_lesson_id, is_required_for_completion, sort_order,
    thumbnail_path, thumbnail_asset_key, thumbnail_approved_path, thumbnail_approved_sha256
  )
  select
    (value ->> 'id')::uuid, (value -> 'row' ->> 'module_id')::uuid,
    value -> 'row' ->> 'title', value -> 'row' ->> 'description', value -> 'row' ->> 'content_import_id',
    value -> 'row' ->> 'lesson_type', (value -> 'row' ->> 'quiz_id')::uuid,
    (value -> 'row' ->> 'assignment_id')::uuid, (value -> 'row' ->> 'prerequisite_lesson_id')::uuid,
    (value -> 'row' ->> 'is_required_for_completion')::boolean,
    (value -> 'row' ->> 'sort_order')::integer, value -> 'row' ->> 'thumbnail_path',
    value -> 'row' ->> 'thumbnail_asset_key', value -> 'row' ->> 'thumbnail_approved_path',
    value -> 'row' ->> 'thumbnail_approved_sha256'
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'lessons'
  on conflict (id) do update set
    module_id = excluded.module_id, title = excluded.title, description = excluded.description,
    content_import_id = excluded.content_import_id, lesson_type = excluded.lesson_type,
    quiz_id = excluded.quiz_id, assignment_id = excluded.assignment_id,
    prerequisite_lesson_id = excluded.prerequisite_lesson_id,
    is_required_for_completion = excluded.is_required_for_completion, sort_order = excluded.sort_order,
    thumbnail_path = excluded.thumbnail_path, thumbnail_asset_key = excluded.thumbnail_asset_key,
    thumbnail_approved_path = excluded.thumbnail_approved_path,
    thumbnail_approved_sha256 = excluded.thumbnail_approved_sha256;

  insert into public.content_blocks (id, lesson_id, block_type, content, sort_order, is_required_for_completion)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'lesson_id')::uuid,
    value -> 'row' ->> 'block_type', value -> 'row' -> 'content',
    (value -> 'row' ->> 'sort_order')::integer,
    (value -> 'row' ->> 'is_required_for_completion')::boolean
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'content_blocks'
  on conflict (id) do update set lesson_id = excluded.lesson_id, block_type = excluded.block_type,
    content = excluded.content, sort_order = excluded.sort_order,
    is_required_for_completion = excluded.is_required_for_completion;

  insert into public.questions (id, quiz_id, question_text, question_type, explanation, points, sort_order)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'quiz_id')::uuid,
    value -> 'row' ->> 'question_text', value -> 'row' ->> 'question_type',
    value -> 'row' ->> 'explanation', (value -> 'row' ->> 'points')::integer,
    (value -> 'row' ->> 'sort_order')::integer
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'questions'
  on conflict (id) do update set quiz_id = excluded.quiz_id, question_text = excluded.question_text,
    question_type = excluded.question_type, explanation = excluded.explanation,
    points = excluded.points, sort_order = excluded.sort_order;

  insert into public.answer_options (id, question_id, option_text, is_correct, sort_order)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'question_id')::uuid,
    value -> 'row' ->> 'option_text', (value -> 'row' ->> 'is_correct')::boolean,
    (value -> 'row' ->> 'sort_order')::integer
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'answer_options'
  on conflict (id) do update set question_id = excluded.question_id, option_text = excluded.option_text,
    is_correct = excluded.is_correct, sort_order = excluded.sort_order;

  insert into public.program_access (id, program_id, role_group_id)
  select (value ->> 'id')::uuid, (value -> 'row' ->> 'program_id')::uuid,
    (value -> 'row' ->> 'role_group_id')::uuid
  from jsonb_array_elements(p_operations) operation(value) where value ->> 'table' = 'program_access'
  on conflict (id) do update set program_id = excluded.program_id, role_group_id = excluded.role_group_id;

  return jsonb_build_object(
    'status', 'applied',
    'import_id', p_import_id,
    'operation_count', v_operation_count
  );
end;
$$;

revoke all on function public.fn_apply_course_import(text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_apply_course_import(text, jsonb) to service_role;

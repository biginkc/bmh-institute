-- Return the complete managed catalog ID inventory for one import so the
-- controller can compare the closed database graph with the exact manifest.

create or replace function public.fn_course_import_managed_ids(p_import_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with
    owned_programs as (select id from public.programs where content_import_id = p_import_id),
    owned_courses as (select id from public.courses where content_import_id = p_import_id),
    owned_role_groups as (
      select distinct access.role_group_id as id
      from public.program_access access
      where access.program_id in (select id from owned_programs)
    ),
    owned_modules as (select id from public.modules where course_id in (select id from owned_courses)),
    base_owned_lessons as (
      select id, quiz_id, assignment_id from public.lessons
      where content_import_id = p_import_id or module_id in (select id from owned_modules)
    ),
    owned_quizzes as (select distinct quiz_id as id from base_owned_lessons where quiz_id is not null),
    owned_assignments as (select distinct assignment_id as id from base_owned_lessons where assignment_id is not null),
    owned_lessons as (
      select id, quiz_id, assignment_id from base_owned_lessons
      union
      select lesson.id, lesson.quiz_id, lesson.assignment_id
      from public.lessons lesson
      where lesson.quiz_id in (select id from owned_quizzes)
         or lesson.assignment_id in (select id from owned_assignments)
         or lesson.prerequisite_lesson_id in (select id from base_owned_lessons)
    ),
    owned_questions as (select question.id from public.questions question join owned_quizzes quiz on quiz.id = question.quiz_id)
  select jsonb_build_object(
    'role_groups', coalesce((select jsonb_agg(id::text order by id) from owned_role_groups), '[]'::jsonb),
    'programs', coalesce((select jsonb_agg(id::text order by id) from owned_programs), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(id::text order by id) from owned_courses), '[]'::jsonb),
    'program_courses', coalesce((select jsonb_agg(id::text order by id) from public.program_courses where program_id in (select id from owned_programs) or course_id in (select id from owned_courses)), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(id::text order by id) from owned_modules), '[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(id::text order by id) from owned_quizzes), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(id::text order by id) from owned_assignments), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(id::text order by id) from owned_lessons), '[]'::jsonb),
    'content_blocks', coalesce((select jsonb_agg(id::text order by id) from public.content_blocks where lesson_id in (select id from owned_lessons)), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(id::text order by id) from owned_questions), '[]'::jsonb),
    'answer_options', coalesce((select jsonb_agg(id::text order by id) from public.answer_options where question_id in (select id from owned_questions)), '[]'::jsonb),
    'program_access', coalesce((select jsonb_agg(id::text order by id) from public.program_access where program_id in (select id from owned_programs) or role_group_id in (select id from owned_role_groups)), '[]'::jsonb),
    'course_access', coalesce((select jsonb_agg(id::text order by id) from public.course_access where course_id in (select id from owned_courses) or role_group_id in (select id from owned_role_groups)), '[]'::jsonb)
  );
$$;

revoke all on function public.fn_course_import_managed_ids(text) from public, anon, authenticated;
grant execute on function public.fn_course_import_managed_ids(text) to service_role;

comment on function public.fn_course_import_managed_ids(text) is
  'Returns every row ID in the closed managed graph for exact service-role reconciliation.';

-- Hash that same closed graph. In particular, a lesson attached beneath an
-- imported module is managed even if a forged row omits content_import_id.
create or replace function public.fn_course_import_catalog_sha256(p_import_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with
    owned_programs as (select * from public.programs where content_import_id = p_import_id),
    owned_courses as (select * from public.courses where content_import_id = p_import_id),
    owned_role_groups as (
      select role_group.*
      from public.role_groups role_group
      where role_group.id in (
        select access.role_group_id
        from public.program_access access
        where access.program_id in (select id from owned_programs)
      )
    ),
    owned_modules as (
      select module.* from public.modules module
      where module.course_id in (select id from owned_courses)
    ),
    base_owned_lessons as (
      select lesson.* from public.lessons lesson
      where lesson.content_import_id = p_import_id
         or lesson.module_id in (select id from owned_modules)
    ),
    owned_quizzes as (
      select quiz.* from public.quizzes quiz
      where quiz.id in (select quiz_id from base_owned_lessons where quiz_id is not null)
    ),
    owned_assignments as (
      select assignment.* from public.assignments assignment
      where assignment.id in (select assignment_id from base_owned_lessons where assignment_id is not null)
    ),
    owned_lessons as (
      select * from base_owned_lessons
      union
      select lesson.*
      from public.lessons lesson
      where lesson.quiz_id in (select id from owned_quizzes)
         or lesson.assignment_id in (select id from owned_assignments)
         or lesson.prerequisite_lesson_id in (select id from base_owned_lessons)
    ),
    owned_questions as (
      select question.* from public.questions question
      where question.quiz_id in (select id from owned_quizzes)
    ),
    catalog as (
      select jsonb_build_object(
        'programs', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_programs item), '[]'::jsonb),
        'courses', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_courses item), '[]'::jsonb),
        'program_courses', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.program_courses item where item.program_id in (select id from owned_programs) or item.course_id in (select id from owned_courses)), '[]'::jsonb),
        'program_access', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.program_access item where item.program_id in (select id from owned_programs) or item.role_group_id in (select id from owned_role_groups)), '[]'::jsonb),
        'course_access', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.course_access item where item.course_id in (select id from owned_courses) or item.role_group_id in (select id from owned_role_groups)), '[]'::jsonb),
        'role_groups', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_role_groups item), '[]'::jsonb),
        'modules', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_modules item), '[]'::jsonb),
        'lessons', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_lessons item), '[]'::jsonb),
        'content_blocks', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from public.content_blocks item where item.lesson_id in (select id from owned_lessons)), '[]'::jsonb),
        'quizzes', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_quizzes item), '[]'::jsonb),
        'questions', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_questions item), '[]'::jsonb),
        'answer_options', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' order by item.id) from public.answer_options item where item.question_id in (select id from owned_questions)), '[]'::jsonb),
        'assignments', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_assignments item), '[]'::jsonb)
      ) as value
    )
  select encode(sha256(convert_to(catalog.value::text, 'UTF8')), 'hex') from catalog;
$$;

revoke all on function public.fn_course_import_catalog_sha256(text) from public, anon, authenticated;
grant execute on function public.fn_course_import_catalog_sha256(text) to service_role;

-- The provider suite checks this exact fingerprint after applying migrations.
-- This fails closed when an older body of this same numbered migration is
-- already recorded as applied on the remote project.
create or replace function public.fn_course_import_exact_reconciliation_contract()
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select '67d265048c2897ee0c6fc4a89965a7679681617cf163bcd20ec31d34cbcb9d83'::text;
$$;

revoke all on function public.fn_course_import_exact_reconciliation_contract() from public, anon, authenticated;
grant execute on function public.fn_course_import_exact_reconciliation_contract() to service_role;

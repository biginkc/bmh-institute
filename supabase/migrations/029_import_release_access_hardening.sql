-- Follow-up to 027: make the importer trust boundary explicit for the first QA
-- grant and close the standalone course_access path before any release exists.

create or replace function public.fn_guard_imported_catalog_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_import_id text;
begin
  if tg_op = 'INSERT' then
    if new.content_import_id is not null and new.is_published then
      raise exception 'Imported catalog release requires the evidence-bound release operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  v_import_id := old.content_import_id;
  if v_import_id is not null and not old.is_published and new.is_published then
    if tg_table_name = 'courses' and exists (
      select 1 from public.course_access access where access.course_id = old.id
    ) then
      raise exception 'Imported catalog release refused: unreleased imported courses must have zero direct access grants.'
        using errcode = '42501';
    end if;
    if coalesce(auth.role(), '') <> 'service_role'
       or coalesce(current_setting('bmh.release_import_id', true), '') <> v_import_id
       or not exists (
         select 1
         from public.content_import_release_records release
         where release.import_id = v_import_id
       ) then
      raise exception 'Imported catalog release requires the evidence-bound release operation.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_guard_unreleased_import_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid := case when tg_op = 'DELETE' then old.program_id else new.program_id end;
  v_import_id text;
  v_published boolean;
  v_old_import_id text;
  v_old_published boolean;
begin
  if tg_op = 'UPDATE' then
    select program.content_import_id, program.is_published
      into v_old_import_id, v_old_published
    from public.programs program
    where program.id = old.program_id;

    if v_old_import_id is not null and not v_old_published
       and (new.program_id is distinct from old.program_id
         or new.role_group_id is distinct from old.role_group_id) then
      raise exception 'Unreleased imported catalog QA access may not be moved or replaced.'
        using errcode = '42501';
    end if;
  end if;

  select program.content_import_id, program.is_published
    into v_import_id, v_published
  from public.programs program
  where program.id = v_program_id;

  if v_import_id is null or v_published then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Unreleased imported catalog QA access may only be changed by the import service.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.role_group_id is not distinct from old.role_group_id then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
     and coalesce(current_setting('bmh.release_import_id', true), '') = v_import_id
     and exists (
       select 1
       from public.content_import_release_records release
       where release.import_id = v_import_id
         and release.employee_role_group_id = new.role_group_id
     ) then
    return new;
  end if;

  -- Only the service-role importer may create the first, QA-only access row.
  if tg_op = 'INSERT'
     and coalesce(auth.role(), '') = 'service_role'
     and not exists (
       select 1 from public.program_access access where access.program_id = v_program_id
     ) then
    return new;
  end if;

  raise exception 'Unreleased imported catalog access is limited to its QA role group.'
    using errcode = '42501';
end;
$$;

create or replace function public.fn_guard_unreleased_import_course_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course_id uuid := case when tg_op = 'DELETE' then old.course_id else new.course_id end;
  v_import_id text;
  v_published boolean;
  v_old_import_id text;
  v_old_published boolean;
begin
  if tg_op = 'UPDATE' then
    select course.content_import_id, course.is_published
      into v_old_import_id, v_old_published
    from public.courses course where course.id = old.course_id;
    if v_old_import_id is not null and not v_old_published then
      raise exception 'Unreleased imported courses must have zero direct access grants.' using errcode = '42501';
    end if;
  end if;

  select course.content_import_id, course.is_published
    into v_import_id, v_published
  from public.courses course where course.id = v_course_id;
  if v_import_id is null or v_published then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and coalesce(auth.role(), '') = 'service_role' then
    return old;
  end if;
  raise exception 'Unreleased imported courses must have zero direct access grants.' using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_unreleased_import_course_access() from public, anon, authenticated;

drop trigger if exists course_access_guard_unreleased_import on public.course_access;
create trigger course_access_guard_unreleased_import
before insert or update of course_id, role_group_id or delete on public.course_access
for each row execute function public.fn_guard_unreleased_import_course_access();

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
    owned_modules as (
      select module.* from public.modules module
      where module.course_id in (select id from owned_courses)
    ),
    owned_lessons as (select * from public.lessons where content_import_id = p_import_id),
    owned_quizzes as (
      select quiz.* from public.quizzes quiz
      where quiz.id in (select quiz_id from owned_lessons where quiz_id is not null)
    ),
    owned_assignments as (
      select assignment.* from public.assignments assignment
      where assignment.id in (select assignment_id from owned_lessons where assignment_id is not null)
    ),
    owned_questions as (
      select question.* from public.questions question
      where question.quiz_id in (select id from owned_quizzes)
    ),
    catalog as (
      select jsonb_build_object(
        'programs', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_programs item), '[]'::jsonb),
        'courses', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from owned_courses item), '[]'::jsonb),
        'program_courses', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.program_courses item where item.program_id in (select id from owned_programs)), '[]'::jsonb),
        'program_access', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.program_access item where item.program_id in (select id from owned_programs)), '[]'::jsonb),
        'course_access', coalesce((select jsonb_agg(to_jsonb(item) order by item.id) from public.course_access item where item.course_id in (select id from owned_courses)), '[]'::jsonb),
        'role_groups', coalesce((select jsonb_agg(to_jsonb(item) - 'created_at' - 'updated_at' order by item.id) from public.role_groups item where item.id in (select role_group_id from public.program_access where program_id in (select id from owned_programs))), '[]'::jsonb),
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

do $$
begin
  if exists (
    select 1
    from public.course_access access
    join public.courses course on course.id = access.course_id
    where course.content_import_id is not null and not course.is_published
  ) then
    raise exception 'Migration 029 refused: an unreleased imported course already has direct access grants.';
  end if;
end;
$$;

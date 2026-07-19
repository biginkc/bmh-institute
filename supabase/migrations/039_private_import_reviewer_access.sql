-- Restrict every unreleased imported catalog graph to an explicit reviewer
-- allowlist without changing ordinary admin access to hand-authored drafts.
-- Service-role import, reconciliation, rollback, and release continue to bypass
-- RLS. Reviewer grants are attached to the exact imported program so rollback
-- removes them and a later re-import cannot inherit stale authorization.

set lock_timeout = '10s';

create table public.course_import_reviewers_v1 (
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  primary key (program_id, user_id)
);

alter table public.course_import_reviewers_v1 enable row level security;
revoke all on table public.course_import_reviewers_v1
  from public, anon, authenticated, service_role;

-- Keep the exact fixture cleanup graph aware of this later dependency. The
-- table is never itself a fixture deletion target; any reviewer row pointing
-- at a fixture program must block cleanup before the cascade can fire.
insert into private.fixture_cleanup_tables_v1 (
  table_name,
  identity_fields,
  expected_count
) values (
  'course_import_reviewers_v1',
  array['program_id', 'user_id']::text[],
  0
)
on conflict (table_name) do nothing;

insert into private.fixture_cleanup_references_v1 (
  child_table,
  child_field,
  parent_table,
  match_type
) values (
  'course_import_reviewers_v1',
  'program_id',
  'programs',
  'scalar'
)
on conflict (child_table, child_field, parent_table) do nothing;

-- Resolve every import provenance value attached to one catalog entity. The
-- unions deliberately include both direct provenance and parent provenance so
-- malformed cross-import relationships fail closed instead of choosing one.
create function private.fn_catalog_entity_import_ids_v1(
  p_entity_type text,
  p_entity_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct source.import_id order by source.import_id), '{}'::text[])
  from (
    select program.content_import_id as import_id
    from public.programs program
    where p_entity_type = 'programs' and program.id = p_entity_id

    union all
    select course.content_import_id
    from public.courses course
    where p_entity_type = 'courses' and course.id = p_entity_id

    union all
    select program.content_import_id
    from public.program_courses link
    join public.programs program on program.id = link.program_id
    where p_entity_type = 'program_courses' and link.id = p_entity_id

    union all
    select course.content_import_id
    from public.program_courses link
    join public.courses course on course.id = link.course_id
    where p_entity_type = 'program_courses' and link.id = p_entity_id

    union all
    select program.content_import_id
    from public.program_access access
    join public.programs program on program.id = access.program_id
    where p_entity_type = 'program_access' and access.id = p_entity_id

    union all
    select course.content_import_id
    from public.course_access access
    join public.courses course on course.id = access.course_id
    where p_entity_type = 'course_access' and access.id = p_entity_id

    union all
    select course.content_import_id
    from public.modules module
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'modules' and module.id = p_entity_id

    union all
    select lesson.content_import_id
    from public.lessons lesson
    where p_entity_type = 'lessons' and lesson.id = p_entity_id

    union all
    select course.content_import_id
    from public.lessons lesson
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'lessons' and lesson.id = p_entity_id

    union all
    select lesson.content_import_id
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    where p_entity_type = 'content_blocks' and block.id = p_entity_id

    union all
    select course.content_import_id
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'content_blocks' and block.id = p_entity_id

    union all
    select lesson.content_import_id
    from public.lessons lesson
    where p_entity_type = 'quizzes' and lesson.quiz_id = p_entity_id

    union all
    select course.content_import_id
    from public.lessons lesson
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'quizzes' and lesson.quiz_id = p_entity_id

    union all
    select lesson.content_import_id
    from public.questions question
    join public.lessons lesson on lesson.quiz_id = question.quiz_id
    where p_entity_type = 'questions' and question.id = p_entity_id

    union all
    select course.content_import_id
    from public.questions question
    join public.lessons lesson on lesson.quiz_id = question.quiz_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'questions' and question.id = p_entity_id

    union all
    select lesson.content_import_id
    from public.answer_options option
    join public.questions question on question.id = option.question_id
    join public.lessons lesson on lesson.quiz_id = question.quiz_id
    where p_entity_type = 'answer_options' and option.id = p_entity_id

    union all
    select course.content_import_id
    from public.answer_options option
    join public.questions question on question.id = option.question_id
    join public.lessons lesson on lesson.quiz_id = question.quiz_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'answer_options' and option.id = p_entity_id

    union all
    select lesson.content_import_id
    from public.lessons lesson
    where p_entity_type = 'assignments' and lesson.assignment_id = p_entity_id

    union all
    select course.content_import_id
    from public.lessons lesson
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where p_entity_type = 'assignments' and lesson.assignment_id = p_entity_id
  ) source
  where source.import_id is not null;
$$;

revoke all on function private.fn_catalog_entity_import_ids_v1(text, uuid)
  from public, anon, authenticated, service_role;

create function private.fn_user_may_access_catalog_entity_v1(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_entity_type = any(array[
      'programs', 'courses', 'program_courses', 'program_access',
      'course_access', 'modules', 'lessons', 'content_blocks',
      'quizzes', 'questions', 'answer_options', 'assignments'
    ]::text[])
    and exists (
      select 1 from public.profiles profile
      where profile.id = p_user_id and profile.status = 'active'
    )
    and not exists (
      select 1
      from unnest(private.fn_catalog_entity_import_ids_v1(p_entity_type, p_entity_id)) import(import_id)
      where not exists (
        select 1
        from public.content_import_release_records release
        where release.import_id = import.import_id
      )
      and not exists (
        select 1
        from public.course_import_reviewers_v1 reviewer
        join public.programs program on program.id = reviewer.program_id
        where reviewer.user_id = p_user_id
          and program.content_import_id = import.import_id
          and program.is_published = false
      )
    );
$$;

revoke all on function private.fn_user_may_access_catalog_entity_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;

create function public.fn_actor_may_access_catalog_entity_v1(
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(auth.role(), '') = 'service_role' then true
    when p_actor_id is distinct from auth.uid() then false
    else private.fn_user_may_access_catalog_entity_v1(
      p_actor_id,
      p_entity_type,
      p_entity_id
    )
  end;
$$;

revoke all on function public.fn_actor_may_access_catalog_entity_v1(uuid, text, uuid)
  from public, anon;
grant execute on function public.fn_actor_may_access_catalog_entity_v1(uuid, text, uuid)
  to authenticated, service_role;

create function public.fn_set_unreleased_import_reviewer_v1(
  p_program_id uuid,
  p_user_id uuid,
  p_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported catalog reviewer changes require the service role.'
      using errcode = '42501';
  end if;
  if p_program_id is null or p_user_id is null or p_allowed is null then
    raise exception 'Reviewer changes require program_id, user_id, and allowed.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );

  if not p_allowed then
    delete from public.course_import_reviewers_v1 reviewer
    where reviewer.program_id = p_program_id
      and reviewer.user_id = p_user_id;
    return;
  end if;

  select program.content_import_id into v_import_id
  from public.programs program
  where program.id = p_program_id
    and program.content_import_id is not null
    and program.is_published = false;

  if v_import_id is null or exists (
    select 1 from public.content_import_release_records release
    where release.import_id = v_import_id
  ) then
    raise exception 'Reviewer grant requires one current unreleased imported program.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id
      and profile.status = 'active'
      and profile.system_role = 'owner'
  ) then
    raise exception 'Reviewer grant requires an active owner profile.'
      using errcode = '22023';
  end if;

  insert into public.course_import_reviewers_v1 (
    program_id,
    user_id,
    granted_by
  ) values (
    p_program_id,
    p_user_id,
    case
      when exists (
        select 1 from public.profiles actor where actor.id = auth.uid()
      ) then auth.uid()
      else null
    end
  )
  on conflict (program_id, user_id) do nothing;
end;
$$;

revoke all on function public.fn_set_unreleased_import_reviewer_v1(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_set_unreleased_import_reviewer_v1(uuid, uuid, boolean)
  to service_role;

-- Replace the former QA-membership read path with the explicit reviewer grant.
create or replace function public.fn_user_has_unreleased_import_qa_program_access(
  p_user_id uuid,
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and exists (
      select 1
      from public.programs program
      join public.course_import_reviewers_v1 reviewer
        on reviewer.program_id = program.id
       and reviewer.user_id = p_user_id
      where program.id = p_program_id
        and program.content_import_id is not null
        and program.is_published = false
        and not exists (
          select 1 from public.content_import_release_records release
          where release.import_id = program.content_import_id
        )
    );
$$;

create or replace function public.fn_user_has_unreleased_import_qa_course_access(
  p_user_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and exists (
      select 1
      from public.program_courses membership
      join public.programs program on program.id = membership.program_id
      join public.courses course on course.id = membership.course_id
      join public.course_import_reviewers_v1 reviewer
        on reviewer.program_id = program.id
       and reviewer.user_id = p_user_id
      where membership.course_id = p_course_id
        and program.content_import_id is not null
        and course.content_import_id = program.content_import_id
        and program.is_published = false
        and course.is_published = false
        and not exists (
          select 1 from public.content_import_release_records release
          where release.import_id = program.content_import_id
        )
    );
$$;

create or replace function public.fn_user_has_program_access(
  p_user_id uuid,
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and (
      (
        public.is_admin(p_user_id)
        and private.fn_user_may_access_catalog_entity_v1(
          p_user_id, 'programs', p_program_id
        )
      )
      or exists (
        select 1
        from public.user_role_groups membership
        join public.program_access access
          on access.role_group_id = membership.role_group_id
        join public.programs program on program.id = access.program_id
        where membership.user_id = p_user_id
          and access.program_id = p_program_id
          and program.is_published = true
      )
      or public.fn_user_has_unreleased_import_qa_program_access(
        p_user_id,
        p_program_id
      )
    );
$$;

create or replace function public.fn_user_has_course_access(
  p_user_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and (
      (
        public.is_admin(p_user_id)
        and private.fn_user_may_access_catalog_entity_v1(
          p_user_id, 'courses', p_course_id
        )
      )
      or exists (
        select 1
        from public.user_role_groups membership
        join public.course_access access
          on access.role_group_id = membership.role_group_id
        join public.courses course on course.id = access.course_id
        where membership.user_id = p_user_id
          and access.course_id = p_course_id
          and course.is_published = true
      )
      or exists (
        select 1
        from public.user_role_groups membership
        join public.program_access access
          on access.role_group_id = membership.role_group_id
        join public.programs program on program.id = access.program_id
        join public.program_courses program_course
          on program_course.program_id = access.program_id
        join public.courses course on course.id = program_course.course_id
        where membership.user_id = p_user_id
          and program_course.course_id = p_course_id
          and program.is_published = true
          and course.is_published = true
      )
      or public.fn_user_has_unreleased_import_qa_course_access(
        p_user_id,
        p_course_id
      )
    );
$$;

revoke all on function public.fn_user_has_unreleased_import_qa_program_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_unreleased_import_qa_course_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_program_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_course_access(uuid, uuid)
  from public, anon;
grant execute on function public.fn_user_has_unreleased_import_qa_program_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_unreleased_import_qa_course_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_program_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_course_access(uuid, uuid)
  to authenticated, service_role;

-- Existing admin policies are permissive. They must be replaced rather than
-- supplemented or their old unconditional is_admin branch would still win.
drop policy if exists programs_admin_all on public.programs;
create policy programs_admin_all on public.programs for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'programs', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'programs', id));

drop policy if exists courses_admin_all on public.courses;
create policy courses_admin_all on public.courses for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', id));

drop policy if exists program_courses_admin_all on public.program_courses;
create policy program_courses_admin_all on public.program_courses for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'program_courses', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'program_courses', id));

drop policy if exists program_access_admin_all on public.program_access;
create policy program_access_admin_all on public.program_access for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'program_access', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'program_access', id));

drop policy if exists course_access_admin_all on public.course_access;
create policy course_access_admin_all on public.course_access for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'course_access', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'course_access', id));

drop policy if exists modules_admin_all on public.modules;
create policy modules_admin_all on public.modules for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'modules', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'modules', id));

drop policy if exists lessons_admin_all on public.lessons;
create policy lessons_admin_all on public.lessons for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', id));

drop policy if exists content_blocks_admin_all on public.content_blocks;
create policy content_blocks_admin_all on public.content_blocks for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'content_blocks', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'content_blocks', id));

drop policy if exists quizzes_admin_all on public.quizzes;
create policy quizzes_admin_all on public.quizzes for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'quizzes', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'quizzes', id));

drop policy if exists questions_admin_all on public.questions;
create policy questions_admin_all on public.questions for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'questions', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'questions', id));

drop policy if exists answer_options_admin_all on public.answer_options;
create policy answer_options_admin_all on public.answer_options for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'answer_options', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'answer_options', id));

drop policy if exists assignments_admin_all on public.assignments;
create policy assignments_admin_all on public.assignments for all to authenticated
  using (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'assignments', id))
  with check (public.is_admin(auth.uid()) and public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'assignments', id));

-- Wrap the current runtime security-definer functions. Their original bodies
-- remain private and unchanged; the public entry points first enforce the same
-- catalog visibility boundary as RLS.
alter function public.fn_lesson_is_complete(uuid, uuid) set schema private;
alter function private.fn_lesson_is_complete(uuid, uuid)
  rename to fn_lesson_is_complete_v031_without_import_reviewer_guard;
alter function public.fn_course_is_complete(uuid, uuid) set schema private;
alter function private.fn_course_is_complete(uuid, uuid)
  rename to fn_course_is_complete_v031_without_import_reviewer_guard;
alter function public.fn_course_completion_percent(uuid, uuid) set schema private;
alter function private.fn_course_completion_percent(uuid, uuid)
  rename to fn_course_completion_percent_v031_without_import_reviewer_guard;
alter function public.fn_lesson_is_unlocked(uuid, uuid) set schema private;
alter function private.fn_lesson_is_unlocked(uuid, uuid)
  rename to fn_lesson_is_unlocked_v033_without_import_reviewer_guard;
alter function public.fn_lesson_states(uuid, uuid[]) set schema private;
alter function private.fn_lesson_states(uuid, uuid[])
  rename to fn_lesson_states_v031_without_import_reviewer_guard;
alter function public.fn_admin_lesson_completion_states(uuid[], uuid[]) set schema private;
alter function private.fn_admin_lesson_completion_states(uuid[], uuid[])
  rename to fn_admin_lesson_completion_states_v031_without_import_reviewer_guard;
alter function public.fn_program_completion_percent(uuid, uuid) set schema private;
alter function private.fn_program_completion_percent(uuid, uuid)
  rename to fn_program_completion_percent_v016_without_import_reviewer_guard;
alter function public.fn_course_completed_at(uuid, uuid) set schema private;
alter function private.fn_course_completed_at(uuid, uuid)
  rename to fn_course_completed_at_v016_without_import_reviewer_guard;
alter function public.fn_move_module(uuid, uuid, text) set schema private;
alter function private.fn_move_module(uuid, uuid, text)
  rename to fn_move_module_v012_without_import_reviewer_guard;
alter function public.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb)
  set schema private;
alter function private.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb)
  rename to fn_update_assignment_for_lesson_v020_without_import_reviewer_guard;

revoke all on function private.fn_lesson_is_complete_v031_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_course_is_complete_v031_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_course_completion_percent_v031_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_lesson_is_unlocked_v033_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_lesson_states_v031_without_import_reviewer_guard(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.fn_admin_lesson_completion_states_v031_without_import_reviewer_guard(uuid[], uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.fn_program_completion_percent_v016_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_course_completed_at_v016_without_import_reviewer_guard(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.fn_move_module_v012_without_import_reviewer_guard(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.fn_update_assignment_for_lesson_v020_without_import_reviewer_guard(uuid, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated, service_role;

create function public.fn_lesson_is_complete(p_user_id uuid, p_lesson_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', p_lesson_id)
  then return false; end if;
  return private.fn_lesson_is_complete_v031_without_import_reviewer_guard(p_user_id, p_lesson_id);
end;
$$;

create function public.fn_course_is_complete(p_user_id uuid, p_course_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', p_course_id)
  then return false; end if;
  return private.fn_course_is_complete_v031_without_import_reviewer_guard(p_user_id, p_course_id);
end;
$$;

create function public.fn_course_completion_percent(p_user_id uuid, p_course_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', p_course_id)
  then return 0; end if;
  return private.fn_course_completion_percent_v031_without_import_reviewer_guard(p_user_id, p_course_id);
end;
$$;

create function public.fn_lesson_is_unlocked(p_user_id uuid, p_lesson_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', p_lesson_id)
  then return false; end if;
  return private.fn_lesson_is_unlocked_v033_without_import_reviewer_guard(p_user_id, p_lesson_id);
end;
$$;

create function public.fn_lesson_states(p_user_id uuid, p_lesson_ids uuid[])
returns table (lesson_id uuid, is_complete boolean, is_unlocked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from unnest(coalesce(p_lesson_ids, '{}'::uuid[])) lesson(id)
       where not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', lesson.id)
     )
  then
    raise exception 'Lesson states include catalog content outside the actor review boundary.'
      using errcode = '42501';
  end if;
  return query select *
  from private.fn_lesson_states_v031_without_import_reviewer_guard(p_user_id, p_lesson_ids);
end;
$$;

create function public.fn_admin_lesson_completion_states(p_user_ids uuid[], p_lesson_ids uuid[])
returns table (user_id uuid, lesson_id uuid, is_complete boolean, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from unnest(coalesce(p_lesson_ids, '{}'::uuid[])) lesson(id)
       where not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', lesson.id)
     )
  then
    raise exception 'Admin lesson states include catalog content outside the actor review boundary.'
      using errcode = '42501';
  end if;
  return query select *
  from private.fn_admin_lesson_completion_states_v031_without_import_reviewer_guard(
    p_user_ids,
    p_lesson_ids
  );
end;
$$;

create function public.fn_program_completion_percent(p_user_id uuid, p_program_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'programs', p_program_id)
  then return 0; end if;
  return private.fn_program_completion_percent_v016_without_import_reviewer_guard(p_user_id, p_program_id);
end;
$$;

create function public.fn_course_completed_at(p_user_id uuid, p_course_id uuid)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', p_course_id)
  then return null; end if;
  return private.fn_course_completed_at_v016_without_import_reviewer_guard(p_user_id, p_course_id);
end;
$$;

create function public.fn_move_module(
  p_module_id uuid,
  p_course_id uuid,
  p_direction text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false)
     or not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'modules', p_module_id)
     or not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'courses', p_course_id)
  then
    raise exception 'Admin reviewer access required for this imported module.'
      using errcode = '42501';
  end if;
  perform private.fn_move_module_v012_without_import_reviewer_guard(
    p_module_id,
    p_course_id,
    p_direction
  );
end;
$$;

create function public.fn_update_assignment_for_lesson(
  p_lesson_id uuid,
  p_assignment_id uuid,
  p_title text,
  p_instructions text,
  p_submission_type text,
  p_requires_review boolean,
  p_rubric jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false)
     or not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'lessons', p_lesson_id)
     or not public.fn_actor_may_access_catalog_entity_v1(auth.uid(), 'assignments', p_assignment_id)
  then
    raise exception 'Admin reviewer access required for this imported assignment.'
      using errcode = '42501';
  end if;
  return private.fn_update_assignment_for_lesson_v020_without_import_reviewer_guard(
    p_lesson_id,
    p_assignment_id,
    p_title,
    p_instructions,
    p_submission_type,
    p_requires_review,
    p_rubric
  );
end;
$$;

revoke all on function public.fn_lesson_is_complete(uuid, uuid) from public, anon;
revoke all on function public.fn_course_is_complete(uuid, uuid) from public, anon;
revoke all on function public.fn_course_completion_percent(uuid, uuid) from public, anon;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid) from public, anon;
revoke all on function public.fn_lesson_states(uuid, uuid[]) from public, anon;
revoke all on function public.fn_admin_lesson_completion_states(uuid[], uuid[]) from public, anon;
revoke all on function public.fn_program_completion_percent(uuid, uuid) from public, anon;
revoke all on function public.fn_course_completed_at(uuid, uuid) from public, anon;
revoke all on function public.fn_move_module(uuid, uuid, text) from public, anon;
revoke all on function public.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.fn_lesson_is_complete(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_course_is_complete(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_course_completion_percent(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_lesson_states(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.fn_admin_lesson_completion_states(uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.fn_program_completion_percent(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_course_completed_at(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_move_module(uuid, uuid, text) to authenticated;
grant execute on function public.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb) to authenticated, service_role;

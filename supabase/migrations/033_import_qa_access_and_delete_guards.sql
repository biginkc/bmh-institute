-- Let the one importer-owned QA cohort exercise an unpublished catalog as a
-- learner, while keeping every employee/public path closed until atomic release.
-- Protect the imported graph from generic admin deletes. Trusted service-role
-- maintenance and the exact rollback RPC retain deletion authority.

set lock_timeout = '10s';

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
      from public.user_role_groups membership
      join public.program_access access
        on access.role_group_id = membership.role_group_id
      join public.programs program on program.id = access.program_id
      where membership.user_id = p_user_id
        and access.program_id = p_program_id
        and program.content_import_id is not null
        and program.is_published = false
        and not exists (
          select 1
          from public.content_import_release_records release
          where release.import_id = program.content_import_id
        )
        and (
          select count(*)
          from public.program_access candidate
          where candidate.program_id = program.id
        ) = 1
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
      where membership.course_id = p_course_id
        and program.content_import_id is not null
        and course.content_import_id = program.content_import_id
        and program.is_published = false
        and course.is_published = false
        and public.fn_user_has_unreleased_import_qa_program_access(
          p_user_id,
          program.id
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
      public.is_admin(p_user_id)
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
      public.is_admin(p_user_id)
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

-- The original learner policies add their own is_published predicate before
-- calling the access functions. Keep those public/employee policies intact and
-- add separate read-only policies for the bounded unpublished import QA path.
drop policy if exists programs_unreleased_import_qa_read on public.programs;
create policy programs_unreleased_import_qa_read on public.programs
  for select to authenticated
  using (
    public.fn_user_has_unreleased_import_qa_program_access(auth.uid(), id)
  );

drop policy if exists courses_unreleased_import_qa_read on public.courses;
create policy courses_unreleased_import_qa_read on public.courses
  for select to authenticated
  using (
    public.fn_user_has_unreleased_import_qa_course_access(auth.uid(), id)
  );

-- Migration 031 binds unlock/completion to exact video asset versions. Preserve
-- that body and add only the narrowly-scoped unpublished QA program path.
create or replace function public.fn_lesson_is_unlocked(
  p_user_id uuid,
  p_lesson_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prereq_id uuid;
  v_min_score integer;
  v_prereq_type text;
  v_course_id uuid;
  v_best_score integer;
  v_has_direct_access boolean;
  v_has_eligible_program_path boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and p_user_id is distinct from auth.uid()
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    return false;
  end if;

  if not coalesce(public.fn_can_read_user_state(p_user_id), false) then
    return false;
  end if;

  select lesson.prerequisite_lesson_id,
         lesson.prerequisite_quiz_min_score,
         module.course_id
    into v_prereq_id, v_min_score, v_course_id
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  where lesson.id = p_lesson_id;

  if v_course_id is null then return false; end if;
  if public.is_admin(p_user_id) then return true; end if;

  select exists (
    select 1
    from public.user_role_groups membership
    join public.course_access access
      on access.role_group_id = membership.role_group_id
    join public.courses course on course.id = access.course_id
    where membership.user_id = p_user_id
      and access.course_id = v_course_id
      and course.is_published = true
  ) into v_has_direct_access;

  if not v_has_direct_access then
    select exists (
      select 1
      from public.user_role_groups membership
      join public.program_access access
        on access.role_group_id = membership.role_group_id
      join public.programs program on program.id = access.program_id
      join public.program_courses current_course
        on current_course.program_id = access.program_id
       and current_course.course_id = v_course_id
      join public.courses course on course.id = current_course.course_id
      where membership.user_id = p_user_id
        and (
          (program.is_published = true and course.is_published = true)
          or (
            program.is_published = false
            and course.is_published = false
            and program.content_import_id is not null
            and course.content_import_id = program.content_import_id
            and public.fn_user_has_unreleased_import_qa_program_access(
              p_user_id,
              program.id
            )
          )
        )
        and (
          program.course_order_mode = 'free'
          or not exists (
            select 1
            from public.program_courses prior_course
            where prior_course.program_id = current_course.program_id
              and prior_course.sort_order < current_course.sort_order
              and not public.fn_course_is_complete(
                p_user_id,
                prior_course.course_id
              )
          )
        )
    ) into v_has_eligible_program_path;

    if not v_has_eligible_program_path then return false; end if;
  end if;

  if v_prereq_id is null then return true; end if;
  if not public.fn_lesson_is_complete(p_user_id, v_prereq_id) then
    return false;
  end if;

  if v_min_score is not null then
    select lesson_type into v_prereq_type
    from public.lessons
    where id = v_prereq_id;
    if v_prereq_type = 'quiz' then
      select max(score) into v_best_score
      from public.user_quiz_attempts
      where user_id = p_user_id
        and lesson_id = v_prereq_id
        and passed = true;
      if v_best_score is null or v_best_score < v_min_score then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.fn_guard_imported_catalog_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
begin
  case tg_table_name
    when 'programs' then v_import_id := old.content_import_id;
    when 'courses' then v_import_id := old.content_import_id;
    when 'lessons' then
      select coalesce(old.content_import_id, course.content_import_id)
        into v_import_id
      from public.modules module
      join public.courses course on course.id = module.course_id
      where module.id = old.module_id;
    when 'modules' then
      select course.content_import_id into v_import_id
      from public.courses course where course.id = old.course_id;
    when 'content_blocks' then
      select coalesce(lesson.content_import_id, course.content_import_id)
        into v_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.id = old.lesson_id;
    when 'program_courses' then
      select coalesce(program.content_import_id, course.content_import_id)
        into v_import_id
      from public.programs program
      join public.courses course on course.id = old.course_id
      where program.id = old.program_id;
    when 'program_access' then
      select case
        when program.is_published and exists (
          select 1 from public.content_import_release_records release
          where release.import_id = program.content_import_id
            and release.program_id = program.id
        ) then null
        else program.content_import_id
      end into v_import_id
      from public.programs program where program.id = old.program_id;
    when 'role_groups' then
      select max(program.content_import_id) into v_import_id
      from public.program_access access
      join public.programs program on program.id = access.program_id
      where access.role_group_id = old.id
        and program.content_import_id is not null
        and not (
          program.is_published and exists (
            select 1 from public.content_import_release_records release
            where release.import_id = program.content_import_id
              and release.program_id = program.id
          )
        );
    when 'quizzes' then
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.quiz_id = old.id;
    when 'assignments' then
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.assignment_id = old.id;
    when 'questions' then
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.quiz_id = old.quiz_id;
    when 'answer_options' then
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_import_id
      from public.questions question
      join public.lessons lesson on lesson.quiz_id = question.quiz_id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where question.id = old.question_id;
  end case;

  if v_import_id is null then return old; end if;
  -- Imported rows may be removed only inside the validated rollback transaction
  -- for this exact import. Possession of the service key alone is insufficient.
  if coalesce(auth.role(), '') = 'service_role'
    and coalesce(current_setting('bmh.rollback_import_id', true), '') = v_import_id
  then
    return old;
  end if;

  raise exception 'Imported catalog graph deletion requires the exact course-import rollback operation.'
    using errcode = '42501';
end;
$$;

-- Imported ownership edges are immutable. Without this guard an administrator
-- could move a child row to a manual parent and then evade the delete guard,
-- because deletion provenance for descendant tables is relationship-derived.
create or replace function public.fn_guard_imported_catalog_reparent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_import_id text;
  v_new_import_id text;
  v_changed boolean := false;
begin
  case tg_table_name
    when 'modules' then
      v_changed := new.course_id is distinct from old.course_id;
      select content_import_id into v_old_import_id
      from public.courses where id = old.course_id;
      select content_import_id into v_new_import_id
      from public.courses where id = new.course_id;
    when 'lessons' then
      v_changed := new.module_id is distinct from old.module_id
        or new.quiz_id is distinct from old.quiz_id
        or new.assignment_id is distinct from old.assignment_id
        or new.prerequisite_lesson_id is distinct from old.prerequisite_lesson_id;
      select coalesce(old.content_import_id, course.content_import_id)
        into v_old_import_id
      from public.modules module
      join public.courses course on course.id = module.course_id
      where module.id = old.module_id;
      select coalesce(new.content_import_id, course.content_import_id)
        into v_new_import_id
      from public.modules module
      join public.courses course on course.id = module.course_id
      where module.id = new.module_id;
    when 'content_blocks' then
      v_changed := new.lesson_id is distinct from old.lesson_id;
      select coalesce(lesson.content_import_id, course.content_import_id)
        into v_old_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.id = old.lesson_id;
      select coalesce(lesson.content_import_id, course.content_import_id)
        into v_new_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.id = new.lesson_id;
    when 'program_courses' then
      v_changed := new.program_id is distinct from old.program_id
        or new.course_id is distinct from old.course_id;
      select coalesce(program.content_import_id, course.content_import_id)
        into v_old_import_id
      from public.programs program
      join public.courses course on course.id = old.course_id
      where program.id = old.program_id;
      select coalesce(program.content_import_id, course.content_import_id)
        into v_new_import_id
      from public.programs program
      join public.courses course on course.id = new.course_id
      where program.id = new.program_id;
    when 'program_access' then
      v_changed := new.program_id is distinct from old.program_id
        or new.role_group_id is distinct from old.role_group_id;
      select case
        when program.is_published and exists (
          select 1 from public.content_import_release_records release
          where release.import_id = program.content_import_id
            and release.program_id = program.id
        ) then null
        else program.content_import_id
      end into v_old_import_id
      from public.programs program where program.id = old.program_id;
      select case
        when program.is_published and exists (
          select 1 from public.content_import_release_records release
          where release.import_id = program.content_import_id
            and release.program_id = program.id
        ) then null
        else program.content_import_id
      end into v_new_import_id
      from public.programs program where program.id = new.program_id;
    when 'questions' then
      v_changed := new.quiz_id is distinct from old.quiz_id;
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_old_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.quiz_id = old.quiz_id;
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_new_import_id
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.quiz_id = new.quiz_id;
    when 'answer_options' then
      v_changed := new.question_id is distinct from old.question_id;
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_old_import_id
      from public.questions question
      join public.lessons lesson on lesson.quiz_id = question.quiz_id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where question.id = old.question_id;
      select max(coalesce(lesson.content_import_id, course.content_import_id))
        into v_new_import_id
      from public.questions question
      join public.lessons lesson on lesson.quiz_id = question.quiz_id
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where question.id = new.question_id;
  end case;

  if not v_changed then return new; end if;
  if v_old_import_id is not null or v_new_import_id is not null then
    raise exception 'Imported catalog ownership edges are immutable; use exact rollback and re-import.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Tighten migration 020's one-time provenance claim so possession of the
-- service key is not enough to manufacture imported roots or descendants.
-- The exact apply wrapper is the only operation that sets this marker.
create or replace function public.fn_guard_catalog_artwork_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.content_import_id is not null and (
      coalesce(auth.role(), '') <> 'service_role'
      or coalesce(current_setting('bmh.apply_import_id', true), '')
        <> new.content_import_id
    ) then
      raise exception 'Imported catalog provenance requires the exact course-import apply operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.content_import_id is null and new.content_import_id is not null then
    if coalesce(auth.role(), '') <> 'service_role'
      or coalesce(current_setting('bmh.apply_import_id', true), '')
        <> new.content_import_id
    then
      raise exception 'Imported catalog provenance requires the exact course-import apply operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.content_import_id is not null and (
    new.content_import_id is distinct from old.content_import_id
    or new.thumbnail_asset_key is distinct from old.thumbnail_asset_key
    or new.thumbnail_approved_path is distinct from old.thumbnail_approved_path
    or new.thumbnail_approved_sha256 is distinct from old.thumbnail_approved_sha256
    or new.thumbnail_path is distinct from old.thumbnail_path
  ) then
    raise exception 'imported catalog artwork provenance is immutable';
  end if;
  return new;
end;
$$;

-- Bind every importer-owned INSERT to the exact validated apply transaction.
-- This prevents an extra descendant from becoming undeletable drift beneath
-- an imported parent. The release transaction may add only its access edge.
create or replace function public.fn_guard_imported_catalog_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_ids text[];
  v_apply_import_id text := coalesce(current_setting('bmh.apply_import_id', true), '');
  v_release_import_id text := coalesce(current_setting('bmh.release_import_id', true), '');
begin
  case tg_table_name
    when 'programs' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (select new.content_import_id as import_id) source
      where source.import_id is not null;
    when 'courses' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (select new.content_import_id as import_id) source
      where source.import_id is not null;
    when 'modules' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select content_import_id as import_id
        from public.courses where id = new.course_id
      ) source
      where source.import_id is not null;
    when 'lessons' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select new.content_import_id as import_id
        union all
        select course.content_import_id
        from public.modules module
        join public.courses course on course.id = module.course_id
        where module.id = new.module_id
        union all
        select coalesce(lesson.content_import_id, course.content_import_id)
        from public.lessons lesson
        join public.modules module on module.id = lesson.module_id
        join public.courses course on course.id = module.course_id
        where new.quiz_id is not null and lesson.quiz_id = new.quiz_id
        union all
        select coalesce(lesson.content_import_id, course.content_import_id)
        from public.lessons lesson
        join public.modules module on module.id = lesson.module_id
        join public.courses course on course.id = module.course_id
        where new.assignment_id is not null
          and lesson.assignment_id = new.assignment_id
        union all
        select coalesce(prerequisite.content_import_id, course.content_import_id)
        from public.lessons prerequisite
        join public.modules module on module.id = prerequisite.module_id
        join public.courses course on course.id = module.course_id
        where prerequisite.id = new.prerequisite_lesson_id
      ) source
      where source.import_id is not null;
    when 'content_blocks' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select coalesce(lesson.content_import_id, course.content_import_id) as import_id
        from public.lessons lesson
        join public.modules module on module.id = lesson.module_id
        join public.courses course on course.id = module.course_id
        where lesson.id = new.lesson_id
      ) source
      where source.import_id is not null;
    when 'program_courses' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select content_import_id as import_id
        from public.programs where id = new.program_id
        union all
        select content_import_id
        from public.courses where id = new.course_id
      ) source
      where source.import_id is not null;
    when 'program_access' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select content_import_id as import_id
        from public.programs program
        where program.id = new.program_id
          and not (
            program.is_published and exists (
              select 1 from public.content_import_release_records release
              where release.import_id = program.content_import_id
                and release.program_id = program.id
            )
          )
      ) source
      where source.import_id is not null;
    when 'questions' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select coalesce(lesson.content_import_id, course.content_import_id) as import_id
        from public.lessons lesson
        join public.modules module on module.id = lesson.module_id
        join public.courses course on course.id = module.course_id
        where lesson.quiz_id = new.quiz_id
      ) source
      where source.import_id is not null;
    when 'answer_options' then
      select array_agg(distinct source.import_id order by source.import_id)
        into v_import_ids
      from (
        select coalesce(lesson.content_import_id, course.content_import_id) as import_id
        from public.questions question
        join public.lessons lesson on lesson.quiz_id = question.quiz_id
        join public.modules module on module.id = lesson.module_id
        join public.courses course on course.id = module.course_id
        where question.id = new.question_id
      ) source
      where source.import_id is not null;
  end case;

  if coalesce(cardinality(v_import_ids), 0) = 0 then return new; end if;
  if coalesce(auth.role(), '') = 'service_role'
    and (
      (
        cardinality(v_import_ids) = 1
        and v_import_ids[1] = v_apply_import_id
      )
      or (
        tg_table_name = 'program_access'
        and cardinality(v_import_ids) = 1
        and v_import_ids[1] = v_release_import_id
      )
    )
  then
    return new;
  end if;
  raise exception 'Imported catalog descendants may only be created by the exact apply or release operation.'
    using errcode = '42501';
end;
$$;

-- Preserve migration 023's fully validated importer body behind a marker-
-- setting wrapper. The private helper is no longer callable by service clients.
alter function public.fn_apply_course_import(text, jsonb) set schema private;
alter function private.fn_apply_course_import(text, jsonb)
  rename to fn_apply_course_import_v023_without_insert_guard;
revoke all on function private.fn_apply_course_import_v023_without_insert_guard(text, jsonb)
  from public, anon, authenticated, service_role;

create function public.fn_apply_course_import(
  p_import_id text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import apply requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import apply refused: invalid import_id.' using errcode = '22023';
  end if;
  perform set_config('bmh.apply_import_id', p_import_id, true);
  v_result := private.fn_apply_course_import_v023_without_insert_guard(
    p_import_id,
    p_operations
  );
  perform set_config('bmh.apply_import_id', '', true);
  return v_result;
end;
$$;

-- Re-wrap migration 031's exact rollback so delete triggers receive a
-- transaction-local import binding only while its validated helper executes.
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
  v_content_blocks uuid[];
  v_courses uuid[];
  v_result jsonb;
begin
  if p_owned is null
    or jsonb_typeof(p_owned) <> 'object'
    or jsonb_typeof(p_owned -> 'content_blocks') <> 'array'
    or jsonb_typeof(p_owned -> 'courses') <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_owned -> 'content_blocks') entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or entry ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    or exists (
      select 1
      from jsonb_array_elements(p_owned -> 'courses') entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or entry ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  then
    return private.fn_rollback_course_import_v019_without_video_history_guard(
      p_import_id,
      p_owned
    );
  end if;

  select coalesce(array_agg((entry ->> 'id')::uuid), '{}'::uuid[])
    into v_content_blocks
  from jsonb_array_elements(p_owned -> 'content_blocks') entry;
  select coalesce(array_agg((entry ->> 'id')::uuid), '{}'::uuid[])
    into v_courses
  from jsonb_array_elements(p_owned -> 'courses') entry;

  lock table
    public.user_video_progress,
    public.user_video_completion_history,
    public.user_block_progress,
    public.sandra_course_completion_deliveries
  in share row exclusive mode;

  if exists (
    select 1
    from public.user_video_completion_history history
    where history.block_id = any(v_content_blocks)
  ) then
    raise exception 'Rollback blocked: immutable video completion history exists.';
  end if;
  if exists (
    select 1
    from public.sandra_course_completion_deliveries delivery
    where delivery.course_id = any(v_courses)
  ) then
    raise exception 'Rollback blocked: durable Sandra completion delivery evidence exists.';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  v_result := private.fn_rollback_course_import_v019_without_video_history_guard(
    p_import_id,
    p_owned
  );
  perform set_config('bmh.rollback_import_id', '', true);
  return v_result;
end;
$$;

-- Reconciliation may discover an unclaimed lesson attached to an imported
-- course, or an imported orphan course left by a failed provenance claim. This
-- service-only cleanup is deliberately narrower than generic DELETE: it accepts
-- only inactive, unreleased, dependency-free drift and binds the trigger marker
-- to the exact import for the duration of those deletes.
create or replace function public.fn_remove_unreleased_import_reconciliation_drift(
  p_import_id text,
  p_lesson_ids uuid[],
  p_orphan_course_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_lessons integer := 0;
  v_deleted_courses integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Import reconciliation drift cleanup requires service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null
    or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_lesson_ids is null
    or p_orphan_course_ids is null
    or cardinality(p_lesson_ids) + cardinality(p_orphan_course_ids) = 0
    or cardinality(p_lesson_ids) + cardinality(p_orphan_course_ids) > 100
  then
    raise exception 'Import reconciliation drift cleanup payload is invalid.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_lesson_ids || p_orphan_course_ids) item(id)
    group by item.id
    having count(*) > 1
  ) then
    raise exception 'Import reconciliation drift cleanup IDs must be unique.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.content_import_release_records release
    where release.import_id = p_import_id
  ) then
    raise exception 'Released imports cannot use reconciliation drift cleanup.'
      using errcode = '42501';
  end if;

  lock table
    public.courses, public.program_courses, public.course_access,
    public.modules, public.lessons, public.content_blocks,
    public.assignment_submissions, public.user_lesson_completions,
    public.user_quiz_attempts, public.user_course_resume,
    public.certificates, public.sandra_course_completion_deliveries
  in share row exclusive mode;

  if (
    select count(*) from public.lessons lesson
    where lesson.id = any(p_lesson_ids)
  ) <> cardinality(p_lesson_ids)
    or exists (
      select 1
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where lesson.id = any(p_lesson_ids)
        and (
          lesson.content_import_id is not null
          or course.content_import_id is distinct from p_import_id
          or course.is_published
          or lesson.lesson_type <> 'content'
          or lesson.quiz_id is not null
          or lesson.assignment_id is not null
          or lesson.prerequisite_lesson_id is not null
        )
    )
    or exists (
      select 1 from public.content_blocks block
      where block.lesson_id = any(p_lesson_ids)
    )
    or exists (
      select 1 from public.lessons dependent
      where dependent.prerequisite_lesson_id = any(p_lesson_ids)
    )
    or exists (
      select 1 from public.assignment_submissions submission
      where submission.lesson_id = any(p_lesson_ids)
    )
    or exists (
      select 1 from public.user_lesson_completions completion
      where completion.lesson_id = any(p_lesson_ids)
    )
    or exists (
      select 1 from public.user_quiz_attempts attempt
      where attempt.lesson_id = any(p_lesson_ids)
    )
    or exists (
      select 1 from public.user_course_resume resume
      where resume.last_lesson_id = any(p_lesson_ids)
    )
  then
    raise exception 'Lesson drift cleanup refused: rows are claimed, active, or dependent.'
      using errcode = '42501';
  end if;

  if (
    select count(*) from public.courses course
    where course.id = any(p_orphan_course_ids)
  ) <> cardinality(p_orphan_course_ids)
    or exists (
      select 1 from public.courses course
      where course.id = any(p_orphan_course_ids)
        and (
          course.content_import_id is distinct from p_import_id
          or course.is_published
        )
    )
    or exists (
      select 1 from public.program_courses membership
      where membership.course_id = any(p_orphan_course_ids)
    )
    or exists (
      select 1 from public.course_access access
      where access.course_id = any(p_orphan_course_ids)
    )
    or exists (
      select 1 from public.modules module
      where module.course_id = any(p_orphan_course_ids)
    )
    or exists (
      select 1 from public.user_course_resume resume
      where resume.course_id = any(p_orphan_course_ids)
    )
    or exists (
      select 1 from public.certificates certificate
      where certificate.course_id = any(p_orphan_course_ids)
    )
    or exists (
      select 1 from public.sandra_course_completion_deliveries delivery
      where delivery.course_id = any(p_orphan_course_ids)
    )
  then
    raise exception 'Course drift cleanup refused: rows are active or dependent.'
      using errcode = '42501';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.lessons where id = any(p_lesson_ids);
  get diagnostics v_deleted_lessons = row_count;
  delete from public.courses where id = any(p_orphan_course_ids);
  get diagnostics v_deleted_courses = row_count;
  perform set_config('bmh.rollback_import_id', '', true);

  return jsonb_build_object(
    'import_id', p_import_id,
    'deleted_lessons', v_deleted_lessons,
    'deleted_orphan_courses', v_deleted_courses
  );
end;
$$;

revoke all on function public.fn_user_has_unreleased_import_qa_program_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_unreleased_import_qa_course_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_program_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_user_has_course_access(uuid, uuid)
  from public, anon;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid)
  from public, anon;
revoke all on function public.fn_guard_imported_catalog_delete()
  from public, anon, authenticated;
revoke all on function public.fn_guard_imported_catalog_reparent()
  from public, anon, authenticated;
revoke all on function public.fn_guard_imported_catalog_insert()
  from public, anon, authenticated;
revoke all on function public.fn_apply_course_import(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_rollback_course_import(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_remove_unreleased_import_reconciliation_drift(text, uuid[], uuid[])
  from public, anon, authenticated;

grant execute on function public.fn_user_has_unreleased_import_qa_program_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_unreleased_import_qa_course_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_program_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_user_has_course_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_apply_course_import(text, jsonb)
  to service_role;
grant execute on function public.fn_rollback_course_import(text, jsonb)
  to service_role;
grant execute on function public.fn_remove_unreleased_import_reconciliation_drift(text, uuid[], uuid[])
  to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'answer_options', 'questions', 'content_blocks', 'lessons',
    'assignments', 'quizzes', 'modules', 'program_access',
    'program_courses', 'courses', 'programs', 'role_groups'
  ]::text[] loop
    execute format(
      'drop trigger if exists guard_imported_catalog_delete on public.%I',
      table_name
    );
    execute format(
      'create trigger guard_imported_catalog_delete before delete on public.%I '
      || 'for each row execute function public.fn_guard_imported_catalog_delete()',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists guard_imported_catalog_reparent on public.modules;
create trigger guard_imported_catalog_reparent
before update of course_id on public.modules
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.lessons;
create trigger guard_imported_catalog_reparent
before update of module_id, quiz_id, assignment_id, prerequisite_lesson_id on public.lessons
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.content_blocks;
create trigger guard_imported_catalog_reparent
before update of lesson_id on public.content_blocks
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.program_courses;
create trigger guard_imported_catalog_reparent
before update of program_id, course_id on public.program_courses
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.program_access;
create trigger guard_imported_catalog_reparent
before update of program_id, role_group_id on public.program_access
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.questions;
create trigger guard_imported_catalog_reparent
before update of quiz_id on public.questions
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_reparent on public.answer_options;
create trigger guard_imported_catalog_reparent
before update of question_id on public.answer_options
for each row execute function public.fn_guard_imported_catalog_reparent();

drop trigger if exists guard_imported_catalog_insert on public.modules;
create trigger guard_imported_catalog_insert
before insert on public.modules
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.programs;
create trigger guard_imported_catalog_insert
before insert on public.programs
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.courses;
create trigger guard_imported_catalog_insert
before insert on public.courses
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.lessons;
create trigger guard_imported_catalog_insert
before insert on public.lessons
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.content_blocks;
create trigger guard_imported_catalog_insert
before insert on public.content_blocks
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.program_courses;
create trigger guard_imported_catalog_insert
before insert on public.program_courses
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.program_access;
create trigger guard_imported_catalog_insert
before insert on public.program_access
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.questions;
create trigger guard_imported_catalog_insert
before insert on public.questions
for each row execute function public.fn_guard_imported_catalog_insert();

drop trigger if exists guard_imported_catalog_insert on public.answer_options;
create trigger guard_imported_catalog_insert
before insert on public.answer_options
for each row execute function public.fn_guard_imported_catalog_insert();

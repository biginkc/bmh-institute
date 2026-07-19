-- Reconcile reviewer-authored quiz options with the imported-descendant guard.
-- Only the exact authenticated reviewer RPC may add one option beneath one
-- question in one current unreleased imported program. Track that option so
-- the existing reviewer cleanup removes it before revoking the reviewer grant.

set lock_timeout = '10s';

create table public.course_import_reviewer_answer_options_v1 (
  answer_option_id uuid primary key
    references public.answer_options(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  import_id text not null
    check (import_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.course_import_reviewer_answer_options_v1 enable row level security;
revoke all on table public.course_import_reviewer_answer_options_v1
  from public, anon, authenticated, service_role;

-- Keep direct authenticated and service-role inserts blocked. This trigger is
-- answer-option-specific so the original migration 033 guard remains unchanged
-- on every other imported descendant table.
create function public.fn_guard_imported_answer_option_insert_v046()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_ids text[];
  v_apply_import_id text := coalesce(
    current_setting('bmh.apply_import_id', true),
    ''
  );
  v_reviewer_import_id text := coalesce(
    current_setting('bmh.reviewer_option_create_import_id', true),
    ''
  );
  v_reviewer_program_id text := coalesce(
    current_setting('bmh.reviewer_option_create_program_id', true),
    ''
  );
  v_reviewer_user_id text := coalesce(
    current_setting('bmh.reviewer_option_create_user_id', true),
    ''
  );
  v_reviewer_lesson_id text := coalesce(
    current_setting('bmh.reviewer_option_create_lesson_id', true),
    ''
  );
  v_reviewer_question_id text := coalesce(
    current_setting('bmh.reviewer_option_create_question_id', true),
    ''
  );
  v_reviewer_option_id text := coalesce(
    current_setting('bmh.reviewer_option_create_option_id', true),
    ''
  );
begin
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

  if coalesce(cardinality(v_import_ids), 0) = 0 then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
    and cardinality(v_import_ids) = 1
    and v_import_ids[1] = v_apply_import_id
  then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'authenticated'
    and auth.uid()::text = v_reviewer_user_id
    and cardinality(v_import_ids) = 1
    and v_import_ids[1] = v_reviewer_import_id
    and new.question_id::text = v_reviewer_question_id
    and new.id::text = v_reviewer_option_id
    and exists (
      select 1
      from public.programs program
      join public.course_import_reviewers_v1 reviewer
        on reviewer.program_id = program.id
       and reviewer.user_id = auth.uid()
      join public.program_courses membership
        on membership.program_id = program.id
      join public.courses course
        on course.id = membership.course_id
       and course.content_import_id = program.content_import_id
       and course.is_published = false
      join public.modules module on module.course_id = course.id
      join public.lessons lesson
        on lesson.module_id = module.id
       and lesson.id::text = v_reviewer_lesson_id
      join public.questions question
        on question.quiz_id = lesson.quiz_id
       and question.id = new.question_id
      where program.id::text = v_reviewer_program_id
        and program.content_import_id = v_reviewer_import_id
        and program.is_published = false
        and not exists (
          select 1
          from public.content_import_release_records release
          where release.import_id = v_reviewer_import_id
        )
    )
  then
    return new;
  end if;

  raise exception 'Imported catalog descendants may only be created by the exact apply or release operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_answer_option_insert_v046()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_imported_catalog_insert on public.answer_options;
create trigger guard_imported_catalog_insert
before insert on public.answer_options
for each row execute function public.fn_guard_imported_answer_option_insert_v046();

-- Preserve the exact rollback exception and add one separate cleanup exception.
-- The cleanup branch proves the option is in the private tracking table and
-- that its reviewer grant is still current for this exact unreleased import.
create function public.fn_guard_imported_answer_option_delete_v046()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_cleanup_import_id text := coalesce(
    current_setting('bmh.reviewer_option_cleanup_import_id', true),
    ''
  );
  v_cleanup_program_id text := coalesce(
    current_setting('bmh.reviewer_option_cleanup_program_id', true),
    ''
  );
  v_cleanup_user_id text := coalesce(
    current_setting('bmh.reviewer_option_cleanup_user_id', true),
    ''
  );
begin
  select max(coalesce(lesson.content_import_id, course.content_import_id))
    into v_import_id
  from public.questions question
  join public.lessons lesson on lesson.quiz_id = question.quiz_id
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where question.id = old.question_id;

  if v_import_id is null then
    return old;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
    and coalesce(current_setting('bmh.rollback_import_id', true), '') = v_import_id
  then
    return old;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
    and v_cleanup_import_id = v_import_id
    and exists (
      select 1
      from public.course_import_reviewer_answer_options_v1 created
      where created.answer_option_id = old.id
        and created.question_id = old.question_id
        and created.import_id = v_cleanup_import_id
        and created.program_id::text = v_cleanup_program_id
        and created.reviewer_user_id::text = v_cleanup_user_id
        and private.fn_user_is_unreleased_import_reviewer_v1(
          created.reviewer_user_id,
          'answer_options',
          old.id
        )
    )
  then
    return old;
  end if;

  raise exception 'Imported catalog graph deletion requires the exact course-import rollback operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_answer_option_delete_v046()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_imported_catalog_delete on public.answer_options;
create trigger guard_imported_catalog_delete
before delete on public.answer_options
for each row execute function public.fn_guard_imported_answer_option_delete_v046();

create or replace function public.fn_create_answer_option_for_reviewer_v1(
  p_lesson_id uuid,
  p_question_id uuid,
  p_option_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_quiz_id uuid;
  v_lesson_quiz_id uuid;
  v_program_ids uuid[];
  v_import_ids text[];
  v_next_sort_order integer;
  v_option_id uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or not coalesce(public.is_admin(auth.uid()), false)
  then
    raise exception 'Authenticated admin reviewer access is required.'
      using errcode = '42501';
  end if;
  if p_lesson_id is null
    or p_question_id is null
    or p_option_text is null
    or btrim(p_option_text) = ''
  then
    raise exception 'Answer option create payload is invalid.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );

  select question.quiz_id, lesson.quiz_id
    into v_question_quiz_id, v_lesson_quiz_id
  from public.questions question
  join public.lessons lesson on lesson.id = p_lesson_id
  where question.id = p_question_id
  for update of question, lesson;

  select
    coalesce(array_agg(distinct program.id order by program.id), '{}'::uuid[]),
    coalesce(
      array_agg(
        distinct coalesce(lesson.content_import_id, course.content_import_id)
        order by coalesce(lesson.content_import_id, course.content_import_id)
      ) filter (
        where coalesce(lesson.content_import_id, course.content_import_id) is not null
      ),
      '{}'::text[]
    )
    into v_program_ids, v_import_ids
  from public.questions question
  join public.lessons lesson
    on lesson.id = p_lesson_id
   and lesson.quiz_id = question.quiz_id
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  join public.program_courses membership on membership.course_id = course.id
  join public.programs program on program.id = membership.program_id
  where question.id = p_question_id;

  if v_question_quiz_id is null
    or v_question_quiz_id is distinct from v_lesson_quiz_id
    or not public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'questions', p_question_id
    )
    or not public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'lessons', p_lesson_id
    )
  then
    raise exception 'Admin reviewer access required for this imported question.'
      using errcode = '42501';
  end if;

  perform 1
  from public.answer_options option
  where option.question_id = p_question_id
  order by option.id
  for update;

  select coalesce(max(option.sort_order), -1) + 1
    into v_next_sort_order
  from public.answer_options option
  where option.question_id = p_question_id;

  -- Preserve migration 044's ordinary admin authoring path. With no import
  -- provenance the answer-option trigger returns NEW and no sidecar is needed.
  if cardinality(v_import_ids) = 0 then
    insert into public.answer_options (
      id, question_id, option_text, is_correct, sort_order
    ) values (
      v_option_id, p_question_id, btrim(p_option_text), false, v_next_sort_order
    );
    return true;
  end if;

  if cardinality(v_program_ids) <> 1
    or cardinality(v_import_ids) <> 1
    or not exists (
      select 1
      from public.programs program
      join public.course_import_reviewers_v1 reviewer
        on reviewer.program_id = program.id
       and reviewer.user_id = auth.uid()
      where program.id = v_program_ids[1]
        and program.content_import_id = v_import_ids[1]
        and program.is_published = false
        and not exists (
          select 1
          from public.content_import_release_records release
          where release.import_id = v_import_ids[1]
        )
    )
  then
    raise exception 'Admin reviewer access required for this imported question.'
      using errcode = '42501';
  end if;

  perform set_config('bmh.reviewer_option_create_import_id', v_import_ids[1], true);
  perform set_config('bmh.reviewer_option_create_program_id', v_program_ids[1]::text, true);
  perform set_config('bmh.reviewer_option_create_user_id', auth.uid()::text, true);
  perform set_config('bmh.reviewer_option_create_lesson_id', p_lesson_id::text, true);
  perform set_config('bmh.reviewer_option_create_question_id', p_question_id::text, true);
  perform set_config('bmh.reviewer_option_create_option_id', v_option_id::text, true);

  insert into public.answer_options (
    id, question_id, option_text, is_correct, sort_order
  ) values (
    v_option_id, p_question_id, btrim(p_option_text), false, v_next_sort_order
  );

  insert into public.course_import_reviewer_answer_options_v1 (
    answer_option_id,
    program_id,
    import_id,
    reviewer_user_id,
    question_id
  ) values (
    v_option_id,
    v_program_ids[1],
    v_import_ids[1],
    auth.uid(),
    p_question_id
  );

  perform set_config('bmh.reviewer_option_create_import_id', '', true);
  perform set_config('bmh.reviewer_option_create_program_id', '', true);
  perform set_config('bmh.reviewer_option_create_user_id', '', true);
  perform set_config('bmh.reviewer_option_create_lesson_id', '', true);
  perform set_config('bmh.reviewer_option_create_question_id', '', true);
  perform set_config('bmh.reviewer_option_create_option_id', '', true);

  return true;
end;
$$;

revoke all on function public.fn_create_answer_option_for_reviewer_v1(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.fn_create_answer_option_for_reviewer_v1(uuid, uuid, text)
  to authenticated;

-- Serialize option edits with release, cleanup, and rollback without changing
-- the authenticated reviewer checks already established in migration 044.
alter function public.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  set schema private;
alter function private.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  rename to fn_update_answer_option_for_reviewer_v044_without_catalog_lock;
revoke all on function private.fn_update_answer_option_for_reviewer_v044_without_catalog_lock(uuid, uuid, text, boolean, uuid[])
  from public, anon, authenticated, service_role;

create function public.fn_update_answer_option_for_reviewer_v1(
  p_lesson_id uuid,
  p_option_id uuid,
  p_option_text text,
  p_is_correct boolean,
  p_exclusive_peer_option_ids uuid[] default '{}'::uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or not coalesce(public.is_admin(auth.uid()), false)
  then
    raise exception 'Authenticated admin reviewer access is required.'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  return private.fn_update_answer_option_for_reviewer_v044_without_catalog_lock(
    p_lesson_id,
    p_option_id,
    p_option_text,
    p_is_correct,
    p_exclusive_peer_option_ids
  );
end;
$$;

revoke all on function public.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  from public, anon, service_role;
grant execute on function public.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  to authenticated;

-- Extend the effective migration 045 cleanup implementation. The public 044
-- wrapper still performs Storage preflight and deletes the reviewer grant only
-- after this private helper succeeds.
alter function private.fn_cleanup_reviewer_evidence_v040(text, uuid)
  rename to fn_cleanup_reviewer_evidence_v045_without_reviewer_options;
revoke all on function private.fn_cleanup_reviewer_evidence_v045_without_reviewer_options(text, uuid)
  from public, anon, authenticated, service_role;

create function private.fn_cleanup_reviewer_evidence_v040(
  p_import_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_result jsonb;
  v_deleted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported review evidence cleanup requires the service role.'
      using errcode = '42501';
  end if;

  select program.id
    into v_program_id
  from public.programs program
  join public.course_import_reviewers_v1 reviewer
    on reviewer.program_id = program.id
   and reviewer.user_id = p_user_id
  where program.content_import_id = p_import_id
    and program.is_published = false
    and not exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = p_import_id
    );

  if v_program_id is null then
    raise exception 'Imported review evidence cleanup requires one current unreleased reviewer grant.'
      using errcode = '42501';
  end if;

  lock table
    public.answer_options,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;

  v_result := private.fn_cleanup_reviewer_evidence_v045_without_reviewer_options(
    p_import_id,
    p_user_id
  );

  perform set_config('bmh.reviewer_option_cleanup_import_id', p_import_id, true);
  perform set_config('bmh.reviewer_option_cleanup_program_id', v_program_id::text, true);
  perform set_config('bmh.reviewer_option_cleanup_user_id', p_user_id::text, true);

  delete from public.answer_options option
  using public.course_import_reviewer_answer_options_v1 created
  where created.answer_option_id = option.id
    and created.program_id = v_program_id
    and created.import_id = p_import_id
    and created.reviewer_user_id = p_user_id
    and created.question_id = option.question_id;
  get diagnostics v_deleted = row_count;

  perform set_config('bmh.reviewer_option_cleanup_import_id', '', true);
  perform set_config('bmh.reviewer_option_cleanup_program_id', '', true);
  perform set_config('bmh.reviewer_option_cleanup_user_id', '', true);

  return v_result || jsonb_build_object(
    'deleted_row_count', coalesce((v_result ->> 'deleted_row_count')::integer, 0) + v_deleted,
    'reviewer_answer_options_deleted', v_deleted
  );
end;
$$;

revoke all on function private.fn_cleanup_reviewer_evidence_v040(text, uuid)
  from public, anon, authenticated, service_role;

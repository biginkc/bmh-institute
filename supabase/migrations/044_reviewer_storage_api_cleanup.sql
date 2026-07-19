-- Finish private import review hardening without deleting Storage provider bytes
-- through SQL. The cleanup RPC now asks its service-role controller to remove
-- exact unshared objects through the Storage API before database evidence is
-- deleted. Also close the remaining submission self-policy and answer-option
-- authoring gaps inside the current reviewer boundary.

set lock_timeout = '10s';

create or replace function public.fn_actor_may_access_submission_v1(
  p_actor_id uuid,
  p_submission_id uuid
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
    else exists (
      select 1
      from public.assignment_submissions submission
      where submission.id = p_submission_id
        and (
          submission.user_id = p_actor_id
          or coalesce(public.is_admin(p_actor_id), false)
        )
        and public.fn_actor_may_access_catalog_entity_v1(
          p_actor_id,
          'assignments',
          submission.assignment_id
        )
        and public.fn_actor_may_access_catalog_entity_v1(
          p_actor_id,
          'lessons',
          submission.lesson_id
        )
    )
  end;
$$;

create or replace function public.fn_actor_may_access_submission_file_v1(
  p_actor_id uuid,
  p_file_path text
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
    else exists (
      select 1
      from public.assignment_submissions submission
      where submission.submission_file_path = p_file_path
        and public.fn_actor_may_access_submission_v1(p_actor_id, submission.id)
    )
    and not exists (
      select 1
      from public.assignment_submissions submission
      where submission.submission_file_path = p_file_path
        and not public.fn_actor_may_access_submission_v1(p_actor_id, submission.id)
    )
  end;
$$;

revoke all on function public.fn_actor_may_access_submission_v1(uuid, uuid)
  from public, anon;
revoke all on function public.fn_actor_may_access_submission_file_v1(uuid, text)
  from public, anon;
grant execute on function public.fn_actor_may_access_submission_v1(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_actor_may_access_submission_file_v1(uuid, text)
  to authenticated, service_role;

drop policy if exists assignment_submissions_self_read
  on public.assignment_submissions;
create policy assignment_submissions_self_read
  on public.assignment_submissions
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.fn_actor_may_access_submission_v1(auth.uid(), id)
  );

drop policy if exists assignment_submissions_self_insert
  on public.assignment_submissions;
create policy assignment_submissions_self_insert
  on public.assignment_submissions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'assignments', assignment_id
    )
    and public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'lessons', lesson_id
    )
    and (
      submission_file_path is null
      or (storage.foldername(submission_file_path))[1] = auth.uid()::text
    )
  );

drop policy if exists "submissions_self_read" on storage.objects;
create policy "submissions_self_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid() and actor.status = 'active'
    )
    and (
      not exists (
        select 1 from public.assignment_submissions submission
        where submission.submission_file_path = name
      )
      or public.fn_actor_may_access_submission_file_v1(auth.uid(), name)
    )
  );

drop policy if exists "submissions_self_delete" on storage.objects;
create policy "submissions_self_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid() and actor.status = 'active'
    )
    and (
      not exists (
        select 1 from public.assignment_submissions submission
        where submission.submission_file_path = name
      )
      or public.fn_actor_may_access_submission_file_v1(auth.uid(), name)
    )
  );

-- Admin review may change only review fields. Identity, ownership, submitted
-- evidence, and timestamps are never writable through an authenticated table
-- update even if a future policy is broadened accidentally.
revoke update on public.assignment_submissions from authenticated;
grant update (status, reviewer_notes, reviewed_by, reviewed_at)
  on public.assignment_submissions to authenticated;

create function public.fn_create_answer_option_for_reviewer_v1(
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
  v_next_sort_order integer;
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

  select question.quiz_id, lesson.quiz_id
    into v_question_quiz_id, v_lesson_quiz_id
  from public.questions question
  join public.lessons lesson on lesson.id = p_lesson_id
  where question.id = p_question_id
  for update of question, lesson;

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

  select coalesce(max(option.sort_order), -1) + 1
    into v_next_sort_order
  from public.answer_options option
  where option.question_id = p_question_id;

  insert into public.answer_options (
    question_id, option_text, is_correct, sort_order
  ) values (
    p_question_id, btrim(p_option_text), false, v_next_sort_order
  );

  return true;
end;
$$;

revoke all on function public.fn_create_answer_option_for_reviewer_v1(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.fn_create_answer_option_for_reviewer_v1(uuid, uuid, text)
  to authenticated;

create or replace function public.fn_update_answer_option_for_reviewer_v1(
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
declare
  v_question_id uuid;
  v_question_quiz_id uuid;
  v_question_type text;
  v_lesson_quiz_id uuid;
  v_supplied_peer_ids uuid[] := coalesce(
    p_exclusive_peer_option_ids,
    '{}'::uuid[]
  );
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or not coalesce(public.is_admin(auth.uid()), false)
  then
    raise exception 'Authenticated admin reviewer access is required.'
      using errcode = '42501';
  end if;
  if p_lesson_id is null
    or p_option_id is null
    or p_option_text is null
    or btrim(p_option_text) = ''
    or p_is_correct is null
    or cardinality(v_supplied_peer_ids) > 100
    or array_position(v_supplied_peer_ids, null) is not null
    or p_option_id = any(v_supplied_peer_ids)
    or cardinality(v_supplied_peer_ids) <> (
      select count(distinct peer_id)::integer
      from unnest(v_supplied_peer_ids) peer(peer_id)
    )
  then
    raise exception 'Answer option update payload is invalid.'
      using errcode = '22023';
  end if;

  select option.question_id, question.quiz_id, question.question_type,
         lesson.quiz_id
    into v_question_id, v_question_quiz_id, v_question_type, v_lesson_quiz_id
  from public.answer_options option
  join public.questions question on question.id = option.question_id
  join public.lessons lesson on lesson.id = p_lesson_id
  where option.id = p_option_id
  for update of option, question, lesson;

  if v_question_id is null
    or v_question_quiz_id is distinct from v_lesson_quiz_id
    or not public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'answer_options', p_option_id
    )
    or not public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'questions', v_question_id
    )
    or not public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'lessons', p_lesson_id
    )
  then
    raise exception 'Admin reviewer access required for this imported answer option.'
      using errcode = '42501';
  end if;

  perform 1
  from public.answer_options option
  where option.question_id = v_question_id
  order by option.id
  for update;

  if exists (
    select 1
    from unnest(v_supplied_peer_ids) peer(peer_id)
    where not exists (
      select 1 from public.answer_options option
      where option.id = peer.peer_id
        and option.question_id = v_question_id
    )
  ) then
    raise exception 'Exclusive peer answer options must belong to the target question.'
      using errcode = '22023';
  end if;

  if p_is_correct and v_question_type in ('single_choice', 'true_false') then
    update public.answer_options
    set is_correct = false
    where question_id = v_question_id
      and id <> p_option_id;
  end if;

  update public.answer_options
  set option_text = btrim(p_option_text),
      is_correct = p_is_correct
  where id = p_option_id;

  return true;
end;
$$;

revoke all on function public.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  from public, anon, service_role;
grant execute on function public.fn_update_answer_option_for_reviewer_v1(uuid, uuid, text, boolean, uuid[])
  to authenticated;

-- This wrapper intentionally never enables direct object-table deletion and
-- never removes Storage metadata with SQL. An object row means the Storage API must remove the
-- exact unshared path first. Only a subsequent call can delete DB evidence.
create or replace function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(
  p_import_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_ids uuid[];
  v_course_ids uuid[];
  v_lesson_ids uuid[];
  v_block_ids uuid[];
  v_submission_ids uuid[];
  v_submission_file_paths text[];
  v_stored_file_paths text[];
  v_audit_rows public.audit_log[];
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported review evidence cleanup requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null
    or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_user_id is null
  then
    raise exception 'Imported review evidence cleanup requires a valid import and reviewer.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-release:' || p_import_id, 0)
  );

  select coalesce(array_agg(program.id order by program.id), '{}'::uuid[])
    into v_program_ids
  from public.programs program
  join public.course_import_reviewers_v1 reviewer
    on reviewer.program_id = program.id
   and reviewer.user_id = p_user_id
  where program.content_import_id = p_import_id
    and program.is_published = false
    and not exists (
      select 1 from public.content_import_release_records release
      where release.import_id = p_import_id
    );

  if cardinality(v_program_ids) <> 1 then
    raise exception 'Imported review evidence cleanup requires one current unreleased reviewer grant.'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct course.id order by course.id), '{}'::uuid[])
    into v_course_ids
  from public.program_courses membership
  join public.courses course on course.id = membership.course_id
  where membership.program_id = any(v_program_ids)
    and course.content_import_id = p_import_id
    and course.is_published = false;

  select coalesce(array_agg(distinct lesson.id order by lesson.id), '{}'::uuid[])
    into v_lesson_ids
  from public.modules module
  join public.lessons lesson on lesson.module_id = module.id
  where module.course_id = any(v_course_ids)
    and coalesce(lesson.content_import_id, p_import_id) = p_import_id;

  select coalesce(array_agg(distinct block.id order by block.id), '{}'::uuid[])
    into v_block_ids
  from public.content_blocks block
  where block.lesson_id = any(v_lesson_ids);

  lock table
    public.user_video_progress,
    public.user_video_completion_history,
    public.user_block_progress,
    public.sandra_course_completion_deliveries,
    public.assignment_submissions,
    public.user_quiz_attempts,
    public.role_play_results,
    public.user_lesson_completions,
    public.user_course_resume,
    public.certificates,
    public.program_certificates,
    public.audit_log,
    storage.objects
  in share row exclusive mode;

  select coalesce(array_agg(submission.id order by submission.id), '{}'::uuid[])
    into v_submission_ids
  from public.assignment_submissions submission
  where submission.user_id = p_user_id
    and submission.lesson_id = any(v_lesson_ids);

  select coalesce(
      array_agg(distinct submission.submission_file_path order by submission.submission_file_path),
      '{}'::text[]
    )
    into v_submission_file_paths
  from public.assignment_submissions submission
  where submission.id = any(v_submission_ids)
    and submission.submission_file_path is not null
    and not exists (
      select 1
      from public.assignment_submissions remaining_submission
      where remaining_submission.submission_file_path = submission.submission_file_path
        and remaining_submission.id <> all(v_submission_ids)
    );

  select coalesce(array_agg(object.name order by object.name), '{}'::text[])
    into v_stored_file_paths
  from storage.objects object
  where object.bucket_id = 'submissions'
    and object.name = any(v_submission_file_paths);

  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'submissions'
      and object.name = any(v_stored_file_paths)
  ) then
    return jsonb_build_object(
      'import_id', p_import_id,
      'reviewer_user_id', p_user_id,
      'status', 'storage_cleanup_required',
      'submission_file_paths', to_jsonb(v_stored_file_paths)
    );
  end if;

  select coalesce(array_agg(event order by event.created_at, event.id), '{}'::public.audit_log[])
    into v_audit_rows
  from public.audit_log event
  where event.user_id = p_user_id
    and event.entity_id = any(
      v_program_ids || v_course_ids || v_lesson_ids || v_block_ids
    );

  v_result := private.fn_cleanup_reviewer_evidence_v040(
    p_import_id,
    p_user_id
  );

  insert into public.audit_log (
    id, user_id, action, entity_type, entity_id, metadata, created_at
  )
  select saved.id, saved.user_id, saved.action, saved.entity_type,
         saved.entity_id, saved.metadata, saved.created_at
  from unnest(v_audit_rows) saved
  on conflict (id) do nothing;

  delete from public.course_import_reviewers_v1 reviewer
  where reviewer.program_id = any(v_program_ids)
    and reviewer.user_id = p_user_id;

  return v_result || jsonb_build_object(
    'submission_file_paths', to_jsonb(v_submission_file_paths),
    'reviewer_access_revoked', true
  );
end;
$$;

revoke all on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  to service_role;

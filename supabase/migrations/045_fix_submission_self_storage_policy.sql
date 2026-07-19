-- Repair the owner Storage policy added in 044. The linked-object existence
-- decision must bypass caller RLS or a revoked reviewer can mistake a hidden
-- submission for an unlinked upload. Submitted evidence also remains
-- immutable outside the service-role reviewer cleanup contract.

set lock_timeout = '10s';

-- Replace the v040 implementation itself so the effective cleanup chain has
-- no Storage metadata delete. The public 044 wrapper has already verified that
-- the Storage API removed every unshared object before this function runs.
create or replace function private.fn_cleanup_reviewer_evidence_v040(
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
  v_quiz_ids uuid[];
  v_assignment_ids uuid[];
  v_deleted integer;
  v_deleted_total integer := 0;
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

  select coalesce(array_agg(distinct lesson.quiz_id order by lesson.quiz_id), '{}'::uuid[])
    into v_quiz_ids
  from public.lessons lesson
  where lesson.id = any(v_lesson_ids) and lesson.quiz_id is not null;

  select coalesce(
      array_agg(distinct lesson.assignment_id order by lesson.assignment_id),
      '{}'::uuid[]
    )
    into v_assignment_ids
  from public.lessons lesson
  where lesson.id = any(v_lesson_ids) and lesson.assignment_id is not null;

  if cardinality(v_course_ids) = 0 or cardinality(v_lesson_ids) = 0 then
    raise exception 'Imported review evidence cleanup could not resolve the imported catalog graph.'
      using errcode = '22023';
  end if;

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
    public.audit_log
  in share row exclusive mode;

  perform set_config('bmh.reviewer_cleanup_import_id', p_import_id, true);
  perform set_config('bmh.reviewer_cleanup_user_id', p_user_id::text, true);

  delete from public.sandra_course_completion_deliveries delivery
  where delivery.user_id = p_user_id and delivery.course_id = any(v_course_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.certificates certificate
  where certificate.user_id = p_user_id and certificate.course_id = any(v_course_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.program_certificates certificate
  where certificate.user_id = p_user_id and certificate.program_id = any(v_program_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.assignment_submissions submission
  where submission.user_id = p_user_id
    and submission.lesson_id = any(v_lesson_ids)
    and submission.assignment_id = any(v_assignment_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_quiz_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.lesson_id = any(v_lesson_ids)
    and attempt.quiz_id = any(v_quiz_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.role_play_results result
  where result.user_id = p_user_id and result.block_id = any(v_block_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_video_completion_history history
  where history.user_id = p_user_id and history.block_id = any(v_block_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_block_progress progress
  where progress.user_id = p_user_id and progress.block_id = any(v_block_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_video_progress progress
  where progress.user_id = p_user_id and progress.block_id = any(v_block_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_lesson_completions completion
  where completion.user_id = p_user_id and completion.lesson_id = any(v_lesson_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from public.user_course_resume resume
  where resume.user_id = p_user_id and resume.course_id = any(v_course_ids);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  perform set_config('bmh.reviewer_cleanup_import_id', '', true);
  perform set_config('bmh.reviewer_cleanup_user_id', '', true);

  return jsonb_build_object(
    'import_id', p_import_id,
    'reviewer_user_id', p_user_id,
    'status', 'reviewer_evidence_cleaned',
    'deleted_row_count', v_deleted_total,
    'submission_file_paths', '[]'::jsonb
  );
end;
$$;

revoke all on function private.fn_cleanup_reviewer_evidence_v040(text, uuid)
  from public, anon, authenticated, service_role;

create function public.fn_actor_may_access_submission_storage_object_v1(
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
    else not exists (
      select 1
      from public.assignment_submissions submission
      where submission.submission_file_path = p_file_path
    )
    or public.fn_actor_may_access_submission_file_v1(
      p_actor_id,
      p_file_path
    )
  end;
$$;

revoke all on function public.fn_actor_may_access_submission_storage_object_v1(uuid, text)
  from public, anon;
grant execute on function public.fn_actor_may_access_submission_storage_object_v1(uuid, text)
  to authenticated, service_role;

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
    and public.fn_actor_may_access_submission_storage_object_v1(
      auth.uid(),
      name
    )
  );

drop policy if exists "submissions_self_delete" on storage.objects;

-- Make private imported-catalog review reversible without weakening the rule
-- that real learner activity blocks rollback. Keep external completion delivery
-- and answer-key writes inside the same explicit reviewer boundary.

set lock_timeout = '10s';

create function private.fn_user_is_unreleased_import_reviewer_v1(
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
  select exists (
    select 1
    from unnest(
      private.fn_catalog_entity_import_ids_v1(p_entity_type, p_entity_id)
    ) import(import_id)
    join public.programs program
      on program.content_import_id = import.import_id
     and program.is_published = false
    join public.course_import_reviewers_v1 reviewer
      on reviewer.program_id = program.id
     and reviewer.user_id = p_user_id
    where not exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = import.import_id
    )
  );
$$;

revoke all on function private.fn_user_is_unreleased_import_reviewer_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;

-- Migration 031 made video history append-only. A rejected private review needs
-- one exact exception. It is available only while the cleanup RPC has bound
-- both the current import and the current reviewer to the transaction.
create or replace function public.trg_preserve_video_completion_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_import_id text := nullif(
    current_setting('bmh.reviewer_cleanup_import_id', true),
    ''
  );
  v_user_id_text text := nullif(
    current_setting('bmh.reviewer_cleanup_user_id', true),
    ''
  );
begin
  if tg_op = 'DELETE'
    and coalesce(auth.role(), '') = 'service_role'
    and v_import_id is not null
    and v_user_id_text = old.user_id::text
    and v_import_id = any(
      private.fn_catalog_entity_import_ids_v1('content_blocks', old.block_id)
    )
    and private.fn_user_is_unreleased_import_reviewer_v1(
      old.user_id,
      'content_blocks',
      old.block_id
    )
  then
    return old;
  end if;

  raise exception 'Video completion history is append-only.'
    using errcode = '55000';
end;
$$;

revoke all on function public.trg_preserve_video_completion_history()
  from public, anon, authenticated, service_role;

create function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(
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
  v_submission_file_paths text[];
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

  -- Match playback and rollback lock order before taking the remaining evidence
  -- locks. Every delete below is restricted by both reviewer and imported graph.
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

  select coalesce(
      array_agg(distinct submission.submission_file_path order by submission.submission_file_path),
      '{}'::text[]
    )
    into v_submission_file_paths
  from public.assignment_submissions submission
  where submission.user_id = p_user_id
    and submission.lesson_id = any(v_lesson_ids)
    and submission.assignment_id = any(v_assignment_ids)
    and submission.submission_file_path is not null;

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

  delete from storage.objects object
  where object.bucket_id = 'submissions'
    and object.name = any(v_submission_file_paths)
    and not exists (
      select 1
      from public.assignment_submissions remaining_submission
      where remaining_submission.submission_file_path = object.name
    );
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

  delete from public.audit_log event
  where event.user_id = p_user_id
    and event.entity_id = any(
      v_program_ids || v_course_ids || v_lesson_ids || v_block_ids
    );
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  perform set_config('bmh.reviewer_cleanup_import_id', '', true);
  perform set_config('bmh.reviewer_cleanup_user_id', '', true);

  return jsonb_build_object(
    'import_id', p_import_id,
    'reviewer_user_id', p_user_id,
    'status', 'reviewer_evidence_cleaned',
    'deleted_row_count', v_deleted_total,
    'submission_file_paths', to_jsonb(v_submission_file_paths)
  );
end;
$$;

revoke all on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  to service_role;

create function private.fn_course_has_unreleased_import_v1(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses course
    where course.id = p_course_id
      and course.content_import_id is not null
      and course.is_published = false
      and not exists (
        select 1 from public.content_import_release_records release
        where release.import_id = course.content_import_id
      )
  ) or exists (
    select 1
    from public.program_courses membership
    join public.programs program on program.id = membership.program_id
    where membership.course_id = p_course_id
      and program.content_import_id is not null
      and program.is_published = false
      and not exists (
        select 1 from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
  );
$$;

revoke all on function private.fn_course_has_unreleased_import_v1(uuid)
  from public, anon, authenticated, service_role;

-- Do not enqueue reviewer completions for a private import. Reviewer progress
-- remains local evidence until the import is released or rejected.
create or replace function public.trg_enqueue_sandra_course_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_completed_at timestamptz;
begin
  select module.course_id into v_course_id
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  where lesson.id = new.lesson_id;

  if v_course_id is null
    or private.fn_course_has_unreleased_import_v1(v_course_id)
    or not public.fn_course_is_complete(new.user_id, v_course_id)
  then
    return new;
  end if;

  v_completed_at := public.fn_course_completed_at(new.user_id, v_course_id);
  if v_completed_at is null then return new; end if;

  insert into public.sandra_course_completion_deliveries (
    user_id, course_id, completed_at, payload
  ) values (
    new.user_id,
    v_course_id,
    v_completed_at,
    jsonb_build_object(
      'userId', new.user_id::text,
      'courseId', v_course_id::text,
      'completedAt', v_completed_at
    )
  ) on conflict (user_id, course_id) do nothing;
  return new;
end;
$$;

revoke all on function public.trg_enqueue_sandra_course_completion()
  from public, anon, authenticated;

-- Preserve the proven v026 claim body privately. The public service contract
-- rejects a private import before the old body can insert or increment anything.
alter function public.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  set schema private;
alter function private.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  rename to fn_claim_sandra_delivery_v026_unguarded;
revoke all on function private.fn_claim_sandra_delivery_v026_unguarded(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.fn_claim_sandra_course_completion_delivery(
  p_user_id uuid,
  p_course_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sandra delivery claim requires the service role.'
      using errcode = '42501';
  end if;
  if private.fn_course_has_unreleased_import_v1(p_course_id) then
    raise exception 'Sandra delivery is suppressed for an unreleased imported course.'
      using errcode = '42501';
  end if;

  return private.fn_claim_sandra_delivery_v026_unguarded(
    p_user_id,
    p_course_id,
    p_payload
  );
end;
$$;

revoke all on function public.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  to service_role;

-- The target option, its peers, its question, and its lesson are validated and
-- locked together under the authenticated actor. This replaces two unrestricted
-- service-role writes from the server action.
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
declare
  v_question_id uuid;
  v_question_quiz_id uuid;
  v_lesson_quiz_id uuid;
  v_peer_ids uuid[] := coalesce(p_exclusive_peer_option_ids, '{}'::uuid[]);
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
    or cardinality(v_peer_ids) > 100
    or array_position(v_peer_ids, null) is not null
    or p_option_id = any(v_peer_ids)
    or (not p_is_correct and cardinality(v_peer_ids) > 0)
    or cardinality(v_peer_ids) <> (
      select count(distinct peer_id)::integer from unnest(v_peer_ids) peer(peer_id)
    )
  then
    raise exception 'Answer option update payload is invalid.'
      using errcode = '22023';
  end if;

  select option.question_id, question.quiz_id, lesson.quiz_id
    into v_question_id, v_question_quiz_id, v_lesson_quiz_id
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

  if cardinality(v_peer_ids) > 0 then
    perform 1
    from public.answer_options peer
    where peer.id = any(v_peer_ids)
    order by peer.id
    for update;

    if (
      select count(*) from public.answer_options peer
      where peer.id = any(v_peer_ids)
        and peer.question_id = v_question_id
        and public.fn_actor_may_access_catalog_entity_v1(
          auth.uid(), 'answer_options', peer.id
        )
    ) <> cardinality(v_peer_ids) then
      raise exception 'Exclusive peer answer options must belong to the target question.'
        using errcode = '22023';
    end if;

    update public.answer_options
    set is_correct = false
    where id = any(v_peer_ids);
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

-- Permit the explicit owner reviewer to exercise imported role-play content.
-- Ordinary service calls still require the original active learner contract.
create or replace function public.fn_complete_role_play_block(
  p_user_id uuid,
  p_block_id uuid,
  p_scenario_id text,
  p_attempt_id text,
  p_score integer,
  p_goals_met jsonb default '{}'::jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_existing public.role_play_results%rowtype;
  v_result_created boolean := false;
  v_progress_created boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'role play completion requires service role';
  end if;
  if p_scenario_id is null
    or length(p_scenario_id) not between 1 and 256
    or p_scenario_id ~ '[[:cntrl:]]'
    or p_attempt_id is null
    or length(p_attempt_id) not between 1 and 256
    or p_attempt_id ~ '[[:cntrl:]]'
    or p_score is null
    or p_score not between 0 and 100
    or jsonb_typeof(coalesce(p_goals_met, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_goals_met, '{}'::jsonb)::text) > 4096
    or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 4096
  then
    raise exception 'invalid role play completion payload';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id
      and profile.status = 'active'
      and profile.system_role = 'learner'
  ) and not (
    exists (
      select 1 from public.profiles profile
      where profile.id = p_user_id
        and profile.status = 'active'
        and profile.system_role = 'owner'
    )
    and private.fn_user_is_unreleased_import_reviewer_v1(
      p_user_id,
      'content_blocks',
      p_block_id
    )
  ) then
    raise exception 'active learner or explicit imported-content reviewer is required';
  end if;

  select block.lesson_id into v_lesson_id
  from public.content_blocks block
  where block.id = p_block_id
    and block.block_type = 'role_play'
    and block.content ->> 'scenario_id' = p_scenario_id
  for update;

  if v_lesson_id is null then
    raise exception 'role play block and scenario do not match';
  end if;
  if not public.fn_lesson_is_unlocked(p_user_id, v_lesson_id) then
    raise exception 'role play lesson is not accessible and unlocked';
  end if;

  select * into v_existing
  from public.role_play_results
  where user_id = p_user_id and attempt_id = p_attempt_id
  for update;

  if found then
    if v_existing.block_id is distinct from p_block_id
      or v_existing.scenario_id is distinct from p_scenario_id
      or v_existing.score is distinct from p_score
      or v_existing.goals_met is distinct from coalesce(p_goals_met, '{}'::jsonb)
      or v_existing.summary is distinct from coalesce(p_summary, '{}'::jsonb)
    then
      raise exception 'role play attempt is already bound to different result data';
    end if;
  else
    insert into public.role_play_results (
      user_id, block_id, scenario_id, attempt_id, score, goals_met, summary
    ) values (
      p_user_id, p_block_id, p_scenario_id, p_attempt_id, p_score,
      coalesce(p_goals_met, '{}'::jsonb),
      coalesce(p_summary, '{}'::jsonb)
    )
    on conflict (user_id, attempt_id) do nothing
    returning true into v_result_created;

    if not coalesce(v_result_created, false) then
      select * into v_existing
      from public.role_play_results
      where user_id = p_user_id and attempt_id = p_attempt_id
      for update;
      if not found
        or v_existing.block_id is distinct from p_block_id
        or v_existing.scenario_id is distinct from p_scenario_id
        or v_existing.score is distinct from p_score
        or v_existing.goals_met is distinct from coalesce(p_goals_met, '{}'::jsonb)
        or v_existing.summary is distinct from coalesce(p_summary, '{}'::jsonb)
      then
        raise exception 'role play attempt conflict could not be reconciled';
      end if;
    end if;
  end if;

  insert into public.user_block_progress (user_id, block_id)
  values (p_user_id, p_block_id)
  on conflict (user_id, block_id) do nothing
  returning true into v_progress_created;

  return jsonb_build_object(
    'lessonId', v_lesson_id,
    'alreadyMarked', not coalesce(v_progress_created, false),
    'resultCreated', coalesce(v_result_created, false)
  );
end;
$$;

revoke all on function public.fn_complete_role_play_block(uuid, uuid, text, text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_complete_role_play_block(uuid, uuid, text, text, integer, jsonb, jsonb)
  to service_role;

-- P1.3 APPEND POINT: private submission and storage reviewer policies.

create function public.fn_actor_may_access_submission_v1(
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
    when p_actor_id is distinct from auth.uid()
      then coalesce(auth.role(), '') = 'service_role'
    when coalesce(auth.role(), '') = 'service_role' then true
    else coalesce(public.is_admin(p_actor_id), false)
      and exists (
        select 1
        from public.assignment_submissions submission
        where submission.id = p_submission_id
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

create function public.fn_actor_may_access_submission_file_v1(
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
    when p_actor_id is distinct from auth.uid()
      then coalesce(auth.role(), '') = 'service_role'
    when coalesce(auth.role(), '') = 'service_role' then true
    else coalesce(public.is_admin(p_actor_id), false)
      and exists (
        select 1
        from public.assignment_submissions submission
        where submission.submission_file_path is not null
          and submission.submission_file_path = p_file_path
          and public.fn_actor_may_access_submission_v1(
            p_actor_id,
            submission.id
          )
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

drop policy if exists assignment_submissions_admin_read on public.assignment_submissions;
create policy assignment_submissions_admin_read
  on public.assignment_submissions
  for select to authenticated
  using (
    public.fn_actor_may_access_submission_v1(auth.uid(), id)
  );

drop policy if exists assignment_submissions_admin_update on public.assignment_submissions;
create policy assignment_submissions_admin_update
  on public.assignment_submissions
  for update to authenticated
  using (
    public.fn_actor_may_access_submission_v1(auth.uid(), id)
  )
  with check (
    public.fn_actor_may_access_submission_v1(auth.uid(), id)
  );

drop policy if exists "submissions_admin_read" on storage.objects;
create policy "submissions_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and public.is_admin(auth.uid())
    and public.fn_actor_may_access_submission_file_v1(auth.uid(), name)
  );

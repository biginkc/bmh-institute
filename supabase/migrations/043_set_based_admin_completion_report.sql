-- Keep the reports completion matrix within the hosted statement timeout.
-- Migration 031 evaluated the full lesson-completion function once per
-- learner and lesson pair. That repeated actor authorization and catalog
-- lookups thousands of times on a normal report. Preserve the same current
-- evidence rules with one set-based query after the 039 reviewer boundary.

set lock_timeout = '10s';

create or replace function public.fn_admin_lesson_completion_states(
  p_user_ids uuid[],
  p_lesson_ids uuid[]
)
returns table (
  user_id uuid,
  lesson_id uuid,
  is_complete boolean,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    raise exception 'Admin lesson completion states require admin access.'
      using errcode = '42501';
  end if;

  if p_user_ids is null
    or p_lesson_ids is null
    or cardinality(p_user_ids) = 0
    or cardinality(p_lesson_ids) = 0
    or cardinality(p_user_ids) > 500
    or cardinality(p_lesson_ids) > 500
    or cardinality(p_user_ids)::bigint * cardinality(p_lesson_ids)::bigint > 5000
    or array_position(p_user_ids, null) is not null
    or array_position(p_lesson_ids, null) is not null
  then
    raise exception 'Admin lesson state request must contain non-null IDs and at most 5000 user/lesson pairs.'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and exists (
      select 1
      from unnest(p_lesson_ids) lesson(id)
      where not public.fn_actor_may_access_catalog_entity_v1(
        auth.uid(), 'lessons', lesson.id
      )
    )
  then
    raise exception 'Admin lesson states include catalog content outside the actor review boundary.'
      using errcode = '42501';
  end if;

  return query
  with requested_users as (
    select distinct requested_id as user_id
    from unnest(p_user_ids) requested_id
  ),
  requested_lessons as (
    select requested.requested_id as lesson_id,
           lesson.lesson_type
    from (
      select distinct requested_id
      from unnest(p_lesson_ids) requested_id
    ) requested
    left join public.lessons lesson on lesson.id = requested.requested_id
  ),
  states as (
    select requested_user.user_id,
           lesson.lesson_id,
           case
             when lesson.lesson_type = 'content' then not exists (
               select 1
               from public.content_blocks block
               where block.lesson_id = lesson.lesson_id
                 and block.is_required_for_completion = true
                 and not exists (
                   select 1
                   from public.user_block_progress progress
                   where progress.user_id = requested_user.user_id
                     and progress.block_id = block.id
                     and (
                       block.block_type <> 'video'
                       or (
                         public.fn_video_asset_version(block.content) is not null
                         and progress.asset_version =
                           public.fn_video_asset_version(block.content)
                       )
                     )
                 )
             )
             when lesson.lesson_type = 'quiz' then exists (
               select 1
               from public.user_quiz_attempts attempt
               where attempt.user_id = requested_user.user_id
                 and attempt.lesson_id = lesson.lesson_id
                 and attempt.passed = true
             )
             when lesson.lesson_type = 'assignment' then exists (
               select 1
               from public.assignment_submissions submission
               where submission.user_id = requested_user.user_id
                 and submission.lesson_id = lesson.lesson_id
                 and submission.status = 'approved'
             )
             else false
           end as is_complete
    from requested_users requested_user
    cross join requested_lessons lesson
  )
  select state.user_id,
         state.lesson_id,
         coalesce(state.is_complete, false),
         case
           when state.is_complete then completion.completed_at
           else null
         end
  from states state
  left join lateral (
    select max(evidence.completed_at) as completed_at
    from public.user_lesson_completions evidence
    where evidence.user_id = state.user_id
      and evidence.lesson_id = state.lesson_id
  ) completion on true;
end;
$$;

revoke all on function public.fn_admin_lesson_completion_states(uuid[], uuid[])
  from public, anon;
grant execute on function public.fn_admin_lesson_completion_states(uuid[], uuid[])
  to authenticated, service_role;

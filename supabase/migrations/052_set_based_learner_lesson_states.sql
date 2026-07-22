-- Calculate the lesson-page state vector once per course instead of invoking
-- the scalar completion and unlock functions for every navigation row.

set lock_timeout = '10s';

create or replace function public.fn_learner_lesson_states_v1(
  p_course_id uuid,
  p_lesson_ids uuid[]
)
returns table (
  lesson_id uuid,
  is_complete boolean,
  is_unlocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_has_course_access boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Learner lesson states require an authenticated actor.'
      using errcode = '42501';
  end if;
  if p_course_id is null
    or p_lesson_ids is null
    or cardinality(p_lesson_ids) = 0
    or cardinality(p_lesson_ids) > 500
    or array_position(p_lesson_ids, null) is not null
  then
    raise exception 'Learner lesson state request must contain one course and 1 to 500 non-null lesson IDs.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and profile.status = 'active'
  ) then
    raise exception 'Learner lesson states require an active actor.'
      using errcode = '42501';
  end if;

  -- Every requested row must exist in the named course. Evaluate imported
  -- provenance set-wise so malformed mixed-import graphs fail closed without
  -- running the multi-branch entity traversal once per lesson.
  if exists (
    select 1
    from (
      select distinct requested_id as lesson_id
      from unnest(p_lesson_ids) requested_id
    ) requested
    left join public.lessons lesson on lesson.id = requested.lesson_id
    left join public.modules module on module.id = lesson.module_id
    left join public.courses course on course.id = module.course_id
    where course.id is distinct from p_course_id
       or exists (
         select 1
         from (values (lesson.content_import_id), (course.content_import_id)) provenance(import_id)
         where provenance.import_id is not null
           and not exists (
             select 1
             from public.content_import_release_records release
             where release.import_id = provenance.import_id
           )
           and not exists (
             select 1
             from public.course_import_reviewers_v1 reviewer
             join public.programs program on program.id = reviewer.program_id
             where reviewer.user_id = v_actor_id
               and program.content_import_id = provenance.import_id
               and program.is_published = false
           )
       )
       or exists (
         select 1
         from public.lessons prerequisite
         join public.modules prerequisite_module
           on prerequisite_module.id = prerequisite.module_id
         join public.courses prerequisite_course
           on prerequisite_course.id = prerequisite_module.course_id
         where prerequisite.id = lesson.prerequisite_lesson_id
           and (
             prerequisite_course.id is distinct from p_course_id
             or exists (
               select 1
               from (
                 values
                   (prerequisite.content_import_id),
                   (prerequisite_course.content_import_id)
               ) prerequisite_provenance(import_id)
               where prerequisite_provenance.import_id is not null
                 and not exists (
                   select 1
                   from public.content_import_release_records release
                   where release.import_id = prerequisite_provenance.import_id
                 )
                 and not exists (
                   select 1
                   from public.course_import_reviewers_v1 reviewer
                   join public.programs program
                     on program.id = reviewer.program_id
                   where reviewer.user_id = v_actor_id
                     and program.content_import_id = prerequisite_provenance.import_id
                     and program.is_published = false
                 )
             )
           )
       )
  ) then
    raise exception 'Learner lesson states include content outside the actor course or review boundary.'
      using errcode = '42501';
  end if;

  select public.is_admin(v_actor_id) into v_is_admin;
  if v_is_admin then
    v_has_course_access := true;
  else
    select
      exists (
        select 1
        from public.user_role_groups membership
        join public.course_access access
          on access.role_group_id = membership.role_group_id
        join public.courses course on course.id = access.course_id
        where membership.user_id = v_actor_id
          and access.course_id = p_course_id
          and course.is_published = true
      )
      or exists (
        select 1
        from public.program_courses current_course
        join public.programs program on program.id = current_course.program_id
        join public.courses course on course.id = current_course.course_id
        where current_course.course_id = p_course_id
          and (
            (
              program.is_published = true
              and course.is_published = true
              and exists (
                select 1
                from public.user_role_groups membership
                join public.program_access access
                  on access.role_group_id = membership.role_group_id
                where membership.user_id = v_actor_id
                  and access.program_id = program.id
              )
            )
            or (
              program.is_published = false
              and course.is_published = false
              and program.content_import_id is not null
              and course.content_import_id = program.content_import_id
              and exists (
                select 1
                from public.course_import_reviewers_v1 reviewer
                where reviewer.program_id = program.id
                  and reviewer.user_id = v_actor_id
              )
            )
          )
          and (
            program.course_order_mode = 'free'
            or not exists (
              select 1
              from public.program_courses prior_course
              join public.modules prior_module
                on prior_module.course_id = prior_course.course_id
              join public.lessons prior_lesson
                on prior_lesson.module_id = prior_module.id
               and prior_lesson.is_required_for_completion = true
              where prior_course.program_id = current_course.program_id
                and prior_course.sort_order < current_course.sort_order
                and not private.fn_lesson_is_complete_v031_without_import_reviewer_guard(
                  v_actor_id,
                  prior_lesson.id
                )
            )
          )
      )
      into v_has_course_access;
  end if;
  if not v_has_course_access then
    raise exception 'Learner lesson states require course access.'
      using errcode = '42501';
  end if;

  return query
  with requested as (
    select distinct
      lesson.id,
      lesson.lesson_type,
      lesson.prerequisite_lesson_id,
      lesson.prerequisite_quiz_min_score
    from unnest(p_lesson_ids) requested_id
    join public.lessons lesson on lesson.id = requested_id
  ), state_scope as (
    select requested.id
    from requested
    union
    select requested.prerequisite_lesson_id
    from requested
    where requested.prerequisite_lesson_id is not null
  ), completion as (
    select lesson.id,
      case lesson.lesson_type
        when 'content' then not exists (
          select 1
          from public.content_blocks block
          where block.lesson_id = lesson.id
            and block.is_required_for_completion = true
            and not exists (
              select 1
              from public.user_block_progress progress
              where progress.user_id = v_actor_id
                and progress.block_id = block.id
                and (
                  block.block_type <> 'video'
                  or (
                    public.fn_video_asset_version(block.content) is not null
                    and progress.asset_version = public.fn_video_asset_version(block.content)
                  )
                )
            )
        )
        when 'quiz' then exists (
          select 1
          from public.user_quiz_attempts attempt
          where attempt.user_id = v_actor_id
            and attempt.lesson_id = lesson.id
            and attempt.passed = true
        )
        when 'assignment' then exists (
          select 1
          from public.assignment_submissions submission
          where submission.user_id = v_actor_id
            and submission.lesson_id = lesson.id
            and submission.status = 'approved'
        )
        else false
      end as is_complete
    from state_scope
    join public.lessons lesson on lesson.id = state_scope.id
  )
  select requested.id,
    completion.is_complete,
    case
      when v_is_admin then true
      when not v_has_course_access then false
      when requested.prerequisite_lesson_id is null then true
      when not coalesce(prerequisite.is_complete, false) then false
      when requested.prerequisite_quiz_min_score is null then true
      when prerequisite_lesson.lesson_type <> 'quiz' then true
      else exists (
        select 1
        from public.user_quiz_attempts attempt
        where attempt.user_id = v_actor_id
          and attempt.lesson_id = requested.prerequisite_lesson_id
          and attempt.passed = true
          and attempt.score >= requested.prerequisite_quiz_min_score
      )
    end
  from requested
  join completion on completion.id = requested.id
  left join completion prerequisite
    on prerequisite.id = requested.prerequisite_lesson_id
  left join public.lessons prerequisite_lesson
    on prerequisite_lesson.id = requested.prerequisite_lesson_id
  order by requested.id;
end;
$$;

revoke all on function public.fn_learner_lesson_states_v1(uuid, uuid[])
  from public, anon;
grant execute on function public.fn_learner_lesson_states_v1(uuid, uuid[])
  to authenticated;

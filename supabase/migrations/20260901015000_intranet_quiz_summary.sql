set lock_timeout = '10s';

create or replace function public.fn_intranet_learner_quiz_summary_v1(
  p_email text,
  p_course_import_id text
)
returns table (
  profile_match_count bigint,
  email text,
  catalog_valid boolean,
  best_final_quiz_score integer,
  attempts bigint,
  last_attempt_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with profile_matches as (
    select profile.id, profile.email
    from public.profiles profile
    where lower(profile.email) = lower(trim(p_email))
  ),
  profile_state as (
    select count(*)::bigint as profile_match_count,
           case when count(*) = 1 then min(profile.id::text)::uuid end as profile_id,
           case when count(*) = 1 then min(profile.email) end as email
    from profile_matches profile
  ),
  canonical_courses as (
    select course.id
    from public.courses course
    where course.content_import_id = p_course_import_id
      and course.is_published = true
  ),
  course_state as (
    select count(*)::bigint as course_count,
           case when count(*) = 1 then min(course.id::text)::uuid end as course_id
    from canonical_courses course
  ),
  course_modules as (
    select module.id as module_id,
           module.sort_order as module_order
    from public.modules module
    cross join course_state
    where course_state.course_count = 1
      and module.course_id = course_state.course_id
  ),
  top_module_order as (
    select max(course_module.module_order) as module_order
    from course_modules course_module
  ),
  top_modules as (
    select course_module.module_id
    from course_modules course_module
    cross join top_module_order
    where course_module.module_order = top_module_order.module_order
  ),
  top_module_state as (
    select count(*)::bigint as top_module_count,
           case when count(*) = 1 then min(top_module.module_id::text)::uuid end as module_id
    from top_modules top_module
  ),
  quiz_lessons as (
    select lesson.id as lesson_id,
           lesson.quiz_id,
           lesson.sort_order as lesson_order,
           lesson.module_id
    from public.lessons lesson
    cross join top_module_state
    where top_module_state.top_module_count = 1
      and lesson.module_id = top_module_state.module_id
      and lesson.lesson_type = 'quiz'
      and lesson.quiz_id is not null
      and lesson.is_required_for_completion = true
  ),
  top_lesson_order as (
    select max(quiz_lesson.lesson_order) as lesson_order
    from quiz_lessons quiz_lesson
    cross join top_module_state
    where top_module_state.top_module_count = 1
      and quiz_lesson.module_id = top_module_state.module_id
  ),
  final_lessons as (
    select quiz_lesson.lesson_id, quiz_lesson.quiz_id
    from quiz_lessons quiz_lesson
    cross join top_module_state
    cross join top_lesson_order
    where top_module_state.top_module_count = 1
      and quiz_lesson.module_id = top_module_state.module_id
      and quiz_lesson.lesson_order = top_lesson_order.lesson_order
  ),
  final_state as (
    select count(*)::bigint as final_lesson_count,
           case when count(*) = 1 then min(final_lesson.lesson_id::text)::uuid end as lesson_id,
           case when count(*) = 1 then min(final_lesson.quiz_id::text)::uuid end as quiz_id
    from final_lessons final_lesson
  ),
  attempt_summary as (
    select count(attempt.id)::bigint as attempts,
           max(attempt.score)::integer as best_final_quiz_score,
           max(attempt.completed_at) as last_attempt_at
    from public.user_quiz_attempts attempt
    cross join profile_state
    cross join course_state
    cross join top_module_state
    cross join final_state
    where profile_state.profile_match_count = 1
      and course_state.course_count = 1
      and top_module_state.top_module_count = 1
      and final_state.final_lesson_count = 1
      and attempt.user_id = profile_state.profile_id
      and attempt.lesson_id = final_state.lesson_id
      and attempt.quiz_id = final_state.quiz_id
      and attempt.completed_at is not null
  )
  select profile_state.profile_match_count,
         profile_state.email,
         course_state.course_count = 1
           and top_module_state.top_module_count = 1
           and final_state.final_lesson_count = 1 as catalog_valid,
         attempt_summary.best_final_quiz_score,
         attempt_summary.attempts,
         attempt_summary.last_attempt_at
  from profile_state
  cross join course_state
  cross join top_module_state
  cross join final_state
  cross join attempt_summary;
$$;

revoke all on function public.fn_intranet_learner_quiz_summary_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.fn_intranet_learner_quiz_summary_v1(text, text)
  to service_role;

-- Runtime review fixes: make lesson sequencing follow an access path the
-- learner actually has. An unrelated program must never lock a reusable
-- course that is available directly or through another eligible program.

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
  if auth.role() <> 'service_role'
    and p_user_id is distinct from auth.uid()
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    return false;
  end if;

  select l.prerequisite_lesson_id, l.prerequisite_quiz_min_score, m.course_id
    into v_prereq_id, v_min_score, v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id;

  if v_course_id is null then
    return false;
  end if;

  if public.is_admin(p_user_id) then
    return true;
  end if;

  select exists (
    select 1
    from public.user_role_groups urg
    join public.course_access ca on ca.role_group_id = urg.role_group_id
    where urg.user_id = p_user_id
      and ca.course_id = v_course_id
  ) into v_has_direct_access;

  if not v_has_direct_access then
    select exists (
      select 1
      from public.user_role_groups urg
      join public.program_access pa on pa.role_group_id = urg.role_group_id
      join public.program_courses pc_current
        on pc_current.program_id = pa.program_id
       and pc_current.course_id = v_course_id
      join public.programs p on p.id = pa.program_id
      where urg.user_id = p_user_id
        and (
          p.course_order_mode = 'free'
          or not exists (
            select 1
            from public.program_courses pc_prior
            where pc_prior.program_id = pc_current.program_id
              and pc_prior.sort_order < pc_current.sort_order
              and not public.fn_course_is_complete(
                p_user_id,
                pc_prior.course_id
              )
          )
        )
    ) into v_has_eligible_program_path;

    if not v_has_eligible_program_path then
      return false;
    end if;
  end if;

  if v_prereq_id is null then
    return true;
  end if;

  if not exists (
    select 1
    from public.user_lesson_completions
    where user_id = p_user_id and lesson_id = v_prereq_id
  ) then
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

revoke all on function public.fn_lesson_is_unlocked(uuid, uuid) from public;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid) from anon;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid) from authenticated;
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid)
  to authenticated, service_role;

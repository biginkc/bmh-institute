-- Persist server-validated quiz and video progress. Learners retain read access
-- while all completion-bearing writes move behind authenticated server actions.

set lock_timeout = '10s';

create unique index if not exists idx_user_quiz_attempts_one_incomplete
  on public.user_quiz_attempts (user_id, quiz_id)
  where completed_at is null;

create table if not exists public.user_video_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  block_id uuid not null references public.content_blocks(id) on delete cascade,
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  duration_seconds numeric not null check (duration_seconds > 0),
  watched_ranges jsonb not null default '[]'::jsonb,
  last_observed_position_seconds numeric not null default 0
    check (last_observed_position_seconds >= 0),
  last_observed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, block_id),
  check (jsonb_typeof(watched_ranges) = 'array')
);

alter table public.user_video_progress enable row level security;

drop policy if exists user_video_progress_self_read
  on public.user_video_progress;
create policy user_video_progress_self_read
  on public.user_video_progress
  for select
  using (user_id = auth.uid());

drop policy if exists user_video_progress_admin_read
  on public.user_video_progress;
create policy user_video_progress_admin_read
  on public.user_video_progress
  for select
  using (public.is_admin(auth.uid()));

grant select on public.user_video_progress to authenticated;
revoke insert, update, delete on public.user_video_progress
  from anon, authenticated;

drop policy if exists user_quiz_attempts_self_insert
  on public.user_quiz_attempts;
drop policy if exists user_quiz_attempts_self_update
  on public.user_quiz_attempts;
drop policy if exists user_block_progress_self_insert
  on public.user_block_progress;
drop policy if exists role_play_results_self_insert
  on public.role_play_results;
drop policy if exists role_play_results_self_update
  on public.role_play_results;

revoke insert, update, delete on public.user_quiz_attempts
  from anon, authenticated;
revoke insert, update, delete on public.user_block_progress
  from anon, authenticated;
revoke insert, update, delete on public.role_play_results
  from anon, authenticated;
revoke insert on public.assignment_submissions
  from anon, authenticated;
revoke insert, update, delete on public.user_course_resume
  from anon, authenticated;

create or replace function public.fn_can_read_user_state(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or p_user_id = auth.uid()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid() and system_role in ('owner', 'admin')
    );
$$;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_can_read_user_state(p_user_id)
    and exists (
      select 1 from public.profiles
      where id = p_user_id and system_role in ('owner', 'admin')
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
set search_path = public
as $$
  select public.fn_can_read_user_state(p_user_id)
    and (
      public.is_admin(p_user_id)
      or exists (
        select 1
        from public.user_role_groups urg
        join public.program_access pa on pa.role_group_id = urg.role_group_id
        where urg.user_id = p_user_id and pa.program_id = p_program_id
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
set search_path = public
as $$
  select public.fn_can_read_user_state(p_user_id)
    and (
      public.is_admin(p_user_id)
      or exists (
        select 1
        from public.user_role_groups urg
        join public.course_access ca on ca.role_group_id = urg.role_group_id
        where urg.user_id = p_user_id and ca.course_id = p_course_id
      )
      or exists (
        select 1
        from public.user_role_groups urg
        join public.program_access pa on pa.role_group_id = urg.role_group_id
        join public.program_courses pc on pc.program_id = pa.program_id
        where urg.user_id = p_user_id and pc.course_id = p_course_id
      )
    );
$$;

create or replace function public.fn_lesson_is_complete(
  p_user_id uuid,
  p_lesson_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if not public.fn_can_read_user_state(p_user_id) then
    return false;
  end if;
  select lesson_type into v_type from public.lessons where id = p_lesson_id;
  if v_type is null then return false; end if;
  if v_type = 'content' then
    return not exists (
      select 1 from public.content_blocks cb
      where cb.lesson_id = p_lesson_id
        and cb.is_required_for_completion = true
        and not exists (
          select 1 from public.user_block_progress ubp
          where ubp.user_id = p_user_id and ubp.block_id = cb.id
        )
    );
  elsif v_type = 'quiz' then
    return exists (
      select 1 from public.user_quiz_attempts uqa
      where uqa.user_id = p_user_id
        and uqa.lesson_id = p_lesson_id
        and uqa.passed = true
    );
  elsif v_type = 'assignment' then
    return exists (
      select 1 from public.assignment_submissions s
      where s.user_id = p_user_id
        and s.lesson_id = p_lesson_id
        and s.status = 'approved'
    );
  end if;
  return false;
end;
$$;

create or replace function public.fn_course_is_complete(
  p_user_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_can_read_user_state(p_user_id)
    and not exists (
      select 1
      from public.modules m
      join public.lessons l on l.module_id = m.id
      where m.course_id = p_course_id
        and l.is_required_for_completion = true
        and not exists (
          select 1 from public.user_lesson_completions ulc
          where ulc.user_id = p_user_id and ulc.lesson_id = l.id
        )
    );
$$;

create or replace function public.fn_course_completion_percent(
  p_user_id uuid,
  p_course_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select l.id
    from public.modules m
    join public.lessons l on l.module_id = m.id
    where m.course_id = p_course_id and l.is_required_for_completion = true
  ),
  total as (select count(*)::numeric n from req),
  done as (
    select count(*)::numeric n
    from req
    join public.user_lesson_completions ulc
      on ulc.lesson_id = req.id and ulc.user_id = p_user_id
  )
  select case
    when not public.fn_can_read_user_state(p_user_id) then 0
    when (select n from total) = 0 then 0
    else round(((select n from done) / (select n from total)) * 100)::integer
  end;
$$;

create or replace function public.fn_program_completion_percent(
  p_user_id uuid,
  p_program_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with cip as (
    select pc.course_id
    from public.program_courses pc
    where pc.program_id = p_program_id
  ),
  total as (select count(*)::numeric n from cip),
  done as (
    select count(*)::numeric n
    from cip
    where public.fn_course_is_complete(p_user_id, cip.course_id)
  )
  select case
    when not public.fn_can_read_user_state(p_user_id) then 0
    when (select n from total) = 0 then 0
    else round(((select n from done) / (select n from total)) * 100)::integer
  end;
$$;

revoke all on function public.fn_can_read_user_state(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.fn_user_has_program_access(uuid, uuid) from public;
revoke all on function public.fn_user_has_course_access(uuid, uuid) from public;
revoke all on function public.fn_lesson_is_complete(uuid, uuid) from public;
revoke all on function public.fn_course_is_complete(uuid, uuid) from public;
revoke all on function public.fn_course_completion_percent(uuid, uuid) from public;
revoke all on function public.fn_program_completion_percent(uuid, uuid) from public;
grant execute on function public.fn_can_read_user_state(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.fn_user_has_program_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_user_has_course_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_lesson_is_complete(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_course_is_complete(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_course_completion_percent(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_program_completion_percent(uuid, uuid) to authenticated, service_role;

-- Security-definer lesson checks may be called only for the current learner,
-- an admin, or the service role. This prevents a learner from probing another
-- user's prerequisite and completion state by changing p_user_id.
create or replace function public.fn_lesson_is_unlocked(
  p_user_id uuid,
  p_lesson_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prereq_id uuid;
  v_min_score integer;
  v_prereq_type text;
  v_course_id uuid;
  v_best_score integer;
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

  if public.is_admin(p_user_id) then
    return true;
  end if;

  if exists (
    select 1
    from public.programs p
    join public.program_courses pc_current
      on pc_current.program_id = p.id
      and pc_current.course_id = v_course_id
    join public.program_courses pc_prior
      on pc_prior.program_id = p.id
      and pc_prior.sort_order < pc_current.sort_order
    where p.course_order_mode = 'sequential'
      and not public.fn_course_is_complete(p_user_id, pc_prior.course_id)
  ) then
    return false;
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
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid)
  to authenticated, service_role;

create or replace function public.fn_course_completed_at(
  p_user_id uuid,
  p_course_id uuid
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz;
begin
  if auth.role() <> 'service_role'
    and p_user_id is distinct from auth.uid()
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    return null;
  end if;

  if not public.fn_course_is_complete(p_user_id, p_course_id) then
    return null;
  end if;

  select max(ulc.completed_at)
    into v_completed_at
  from public.user_lesson_completions ulc
  join public.lessons l on l.id = ulc.lesson_id
  join public.modules m on m.id = l.module_id
  where ulc.user_id = p_user_id
    and m.course_id = p_course_id
    and l.is_required_for_completion = true;

  return v_completed_at;
end;
$$;

revoke all on function public.fn_course_completed_at(uuid, uuid) from public;
grant execute on function public.fn_course_completed_at(uuid, uuid)
  to authenticated, service_role;

-- Trigger-only and internal certificate functions are not callable through
-- PostgREST. Their owning triggers and security-definer callers still work.
revoke all on function public.fn_next_certificate_number(text)
  from public, anon, authenticated;
revoke all on function public.fn_issue_course_certificate_if_eligible(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fn_issue_program_certificate_if_eligible(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.trg_after_block_progress()
  from public, anon, authenticated;
revoke all on function public.trg_after_quiz_attempt()
  from public, anon, authenticated;
revoke all on function public.trg_after_assignment_approved()
  from public, anon, authenticated;

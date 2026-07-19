-- Close the remaining learner privilege, suspension, unpublished-catalog,
-- certificate-scope, and assignment-decision gaps before real enrollment.

set lock_timeout = '10s';

-- RLS controls rows, not columns. Learners may manage presentation fields only;
-- role, status, email, identity, and timestamps remain admin/service controlled.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update
  using (auth.uid() = id and status = 'active')
  with check (auth.uid() = id and status = 'active');

drop policy if exists "submissions_self_insert" on storage.objects;
create policy "submissions_self_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid() and actor.status = 'active'
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
  );

create or replace function public.fn_can_read_user_state(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles actor
      where actor.id = auth.uid()
        and actor.status = 'active'
        and (
          p_user_id = actor.id
          or actor.system_role in ('owner', 'admin')
        )
    );
$$;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and exists (
      select 1
      from public.profiles target
      where target.id = p_user_id
        and target.system_role in ('owner', 'admin')
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
        from public.user_role_groups urg
        join public.program_access pa on pa.role_group_id = urg.role_group_id
        join public.programs p on p.id = pa.program_id
        where urg.user_id = p_user_id
          and pa.program_id = p_program_id
          and p.is_published = true
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
        from public.user_role_groups urg
        join public.course_access ca on ca.role_group_id = urg.role_group_id
        join public.courses c on c.id = ca.course_id
        where urg.user_id = p_user_id
          and ca.course_id = p_course_id
          and c.is_published = true
      )
      or exists (
        select 1
        from public.user_role_groups urg
        join public.program_access pa on pa.role_group_id = urg.role_group_id
        join public.programs p on p.id = pa.program_id
        join public.program_courses pc on pc.program_id = pa.program_id
        join public.courses c on c.id = pc.course_id
        where urg.user_id = p_user_id
          and pc.course_id = p_course_id
          and p.is_published = true
          and c.is_published = true
      )
    );
$$;

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

  if not public.fn_can_read_user_state(p_user_id) then
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
    join public.courses c on c.id = ca.course_id
    where urg.user_id = p_user_id
      and ca.course_id = v_course_id
      and c.is_published = true
  ) into v_has_direct_access;

  if not v_has_direct_access then
    select exists (
      select 1
      from public.user_role_groups urg
      join public.program_access pa on pa.role_group_id = urg.role_group_id
      join public.programs p on p.id = pa.program_id
      join public.program_courses pc_current
        on pc_current.program_id = pa.program_id
       and pc_current.course_id = v_course_id
      join public.courses c on c.id = pc_current.course_id
      where urg.user_id = p_user_id
        and p.is_published = true
        and c.is_published = true
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

create or replace function public.fn_issue_program_certificate_if_eligible(
  p_user_id uuid,
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_number text;
  v_all_complete boolean;
begin
  -- Certificate eligibility is learner enrollment, not catalog-management
  -- authority. Even an admin must be explicitly enrolled in a published
  -- program before completing it can issue a learner certificate.
  if not exists (
    select 1
    from public.profiles learner
    join public.user_role_groups urg on urg.user_id = learner.id
    join public.program_access pa on pa.role_group_id = urg.role_group_id
    join public.programs p on p.id = pa.program_id
    where learner.id = p_user_id
      and learner.status = 'active'
      and pa.program_id = p_program_id
      and p.is_published = true
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.program_certificates
    where user_id = p_user_id and program_id = p_program_id
  ) then
    return;
  end if;

  select certificate_enabled
    into v_enabled
  from public.programs
  where id = p_program_id;
  if coalesce(v_enabled, false) = false then
    return;
  end if;

  select not exists (
    select 1
    from public.program_courses pc
    where pc.program_id = p_program_id
      and not public.fn_course_is_complete(p_user_id, pc.course_id)
  ) into v_all_complete;
  if not v_all_complete then
    return;
  end if;

  v_number := public.fn_next_certificate_number('BMH-P');
  insert into public.program_certificates (user_id, program_id, certificate_number)
  values (p_user_id, p_program_id, v_number)
  on conflict (user_id, program_id) do nothing;

  if found then
    insert into public.audit_log (user_id, action, entity_type, entity_id, metadata)
    values (
      p_user_id,
      'program_certificate_issued',
      'program',
      p_program_id,
      jsonb_build_object('certificate_number', v_number)
    );
  end if;
end;
$$;

create unique index if not exists idx_assignment_submissions_one_active_outcome
  on public.assignment_submissions (user_id, assignment_id)
  where status in ('submitted', 'approved');

create or replace function public.fn_enforce_assignment_submission_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('submitted', 'approved', 'needs_revision') then
    raise exception 'Invalid assignment submission status.';
  end if;

  if old.status <> 'submitted' and new.status is distinct from old.status then
    raise exception 'A decided assignment submission is immutable.';
  end if;

  if old.status = 'submitted'
    and new.status not in ('submitted', 'approved', 'needs_revision')
  then
    raise exception 'Invalid assignment submission transition.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assignment_submission_transition
  on public.assignment_submissions;
create trigger trg_assignment_submission_transition
  before update of status on public.assignment_submissions
  for each row execute function public.fn_enforce_assignment_submission_transition();

revoke all on function public.fn_can_read_user_state(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.fn_user_has_program_access(uuid, uuid) from public, anon;
revoke all on function public.fn_user_has_course_access(uuid, uuid) from public, anon;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid) from public, anon;
revoke all on function public.fn_issue_program_certificate_if_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_enforce_assignment_submission_transition() from public, anon, authenticated;

grant execute on function public.fn_can_read_user_state(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.fn_user_has_program_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_user_has_course_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_issue_program_certificate_if_eligible(uuid, uuid) to service_role;

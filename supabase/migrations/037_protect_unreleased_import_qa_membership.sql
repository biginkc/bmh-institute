-- Keep the importer-owned QA access group out of generic user and invite
-- administration. Owners and admins already have draft catalog visibility and
-- do not need learner membership in this private access group.

set lock_timeout = '10s';

create or replace function private.fn_is_unreleased_import_qa_role_group(
  p_role_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_access access
    join public.programs program on program.id = access.program_id
    where access.role_group_id = p_role_group_id
      and program.content_import_id is not null
      and program.is_published = false
      and not exists (
        select 1
        from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
      and (
        select count(*)
        from public.program_access candidate
        where candidate.program_id = program.id
      ) = 1
  );
$$;

revoke all on function private.fn_is_unreleased_import_qa_role_group(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.fn_guard_unreleased_import_qa_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'course-import-qa-membership:' || new.role_group_id::text,
      0
    )
  );
  if private.fn_is_unreleased_import_qa_role_group(new.role_group_id) then
    raise exception 'Unreleased imported catalog QA role group cannot be assigned through generic user or invite administration.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_unreleased_import_qa_membership()
  from public, anon, authenticated, service_role;

drop trigger if exists user_role_groups_guard_unreleased_import_qa
  on public.user_role_groups;
create trigger user_role_groups_guard_unreleased_import_qa
before insert or update of role_group_id on public.user_role_groups
for each row execute function public.fn_guard_unreleased_import_qa_membership();

create or replace function public.fn_guard_unreleased_import_qa_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_group_id uuid;
begin
  for v_role_group_id in
    select distinct role_group.id
    from unnest(coalesce(new.role_group_ids, '{}'::uuid[])) role_group(id)
    order by role_group.id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'course-import-qa-membership:' || v_role_group_id::text,
        0
      )
    );
  end loop;
  if exists (
    select 1
    from unnest(coalesce(new.role_group_ids, '{}'::uuid[])) role_group(id)
    where private.fn_is_unreleased_import_qa_role_group(role_group.id)
  ) then
    raise exception 'Unreleased imported catalog QA role group cannot be assigned through generic user or invite administration.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_unreleased_import_qa_invite()
  from public, anon, authenticated, service_role;

drop trigger if exists invites_guard_unreleased_import_qa on public.invites;
create trigger invites_guard_unreleased_import_qa
before insert or update of role_group_ids on public.invites
for each row execute function public.fn_guard_unreleased_import_qa_invite();

create or replace function public.fn_guard_unreleased_import_qa_access_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.programs program
    where program.id = new.program_id
      and program.content_import_id is not null
      and program.is_published = false
      and not exists (
        select 1
        from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
  ) then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'course-import-qa-membership:' || new.role_group_id::text,
        0
      )
    );
    if exists (
      select 1
      from public.user_role_groups membership
      where membership.role_group_id = new.role_group_id
    ) then
      raise exception 'Unreleased imported catalog QA role group already has user memberships.'
        using errcode = '42501';
    end if;
    if exists (
      select 1
      from public.invites invite
      where invite.accepted_at is null
        and new.role_group_id = any(invite.role_group_ids)
    ) then
      raise exception 'Unreleased imported catalog QA role group already has pending invites.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_unreleased_import_qa_access_link()
  from public, anon, authenticated, service_role;

drop trigger if exists program_access_guard_unreleased_import_qa
  on public.program_access;
create trigger program_access_guard_unreleased_import_qa
before insert or update of program_id, role_group_id on public.program_access
for each row execute function public.fn_guard_unreleased_import_qa_access_link();

create or replace function public.fn_release_course_import_v1(
  p_import_id text,
  p_program_id uuid,
  p_employee_role_group_id uuid,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_qa_role_group_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Course import release requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Course import release refused: invalid import_id.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  lock table public.user_role_groups, public.invites
    in share row exclusive mode;

  if (
    select count(*)
    from public.program_access access
    where access.program_id = p_program_id
  ) = 1 then
    select access.role_group_id
      into v_qa_role_group_id
    from public.program_access access
    where access.program_id = p_program_id;
  end if;

  if v_qa_role_group_id is not null and exists (
    select 1
    from public.user_role_groups membership
    where membership.role_group_id = v_qa_role_group_id
  ) then
    raise exception 'Course import release refused: unexpected QA role group memberships exist.'
      using errcode = '42501';
  end if;

  if v_qa_role_group_id is not null and exists (
    select 1
    from public.invites invite
    where invite.accepted_at is null
      and v_qa_role_group_id = any(invite.role_group_ids)
  ) then
    raise exception 'Course import release refused: pending invites target the QA role group.'
      using errcode = '42501';
  end if;

  v_result := private.fn_release_course_import_v027_without_global_mutation_lock(
    p_import_id,
    p_program_id,
    p_employee_role_group_id,
    p_evidence,
    p_confirmation
  );
  return v_result;
end;
$$;

revoke all on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)
  to service_role;

do $$
begin
  if exists (
    select 1
    from public.programs program
    join public.program_access access on access.program_id = program.id
    join public.user_role_groups membership
      on membership.role_group_id = access.role_group_id
    where program.content_import_id is not null
      and program.is_published = false
      and not exists (
        select 1 from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
      and (
        select count(*) from public.program_access candidate
        where candidate.program_id = program.id
      ) = 1
  ) then
    raise exception 'Migration 037 refused: an unreleased import QA role group already has user memberships.';
  end if;

  if exists (
    select 1
    from public.programs program
    join public.program_access access on access.program_id = program.id
    join public.invites invite
      on access.role_group_id = any(invite.role_group_ids)
    where program.content_import_id is not null
      and program.is_published = false
      and invite.accepted_at is null
      and not exists (
        select 1 from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
      and (
        select count(*) from public.program_access candidate
        where candidate.program_id = program.id
      ) = 1
  ) then
    raise exception 'Migration 037 refused: a pending invite already targets an unreleased import QA role group.';
  end if;
end;
$$;

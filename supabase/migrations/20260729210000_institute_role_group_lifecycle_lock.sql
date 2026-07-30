-- Institute owns role and role-group edits after Hugo provisions access.
-- Preserve the target's lifecycle status and serialize this write with Hugo's
-- per-user lifecycle connector lock.

begin;

create or replace function public.fn_set_user_role_and_groups(
  p_user_id uuid,
  p_system_role text,
  p_role_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required.';
  end if;
  if p_system_role not in ('owner', 'admin', 'learner') then
    raise exception 'Invalid Institute role.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-user-lifecycle:' || p_user_id::text, 0)
  );
  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set system_role = p_system_role
  where id = p_user_id;

  delete from public.user_role_groups
  where user_id = p_user_id;
  insert into public.user_role_groups (user_id, role_group_id)
  select p_user_id, role_group_id
  from (
    select distinct role_group_id
    from unnest(coalesce(p_role_group_ids, array[]::uuid[])) as item(role_group_id)
  ) requested;
end;
$$;

revoke all on function public.fn_set_user_role_and_groups(uuid, text, uuid[])
  from public, anon;
grant execute on function public.fn_set_user_role_and_groups(uuid, text, uuid[])
  to authenticated;

-- Keep the legacy groups-only RPC safe for older callers that have not yet
-- moved to the role-and-groups operation.
create or replace function public.fn_set_user_role_groups(
  p_user_id uuid,
  p_role_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-user-lifecycle:' || p_user_id::text, 0)
  );
  delete from public.user_role_groups where user_id = p_user_id;
  insert into public.user_role_groups (user_id, role_group_id)
  select p_user_id, role_group_id
  from (
    select distinct role_group_id
    from unnest(coalesce(p_role_group_ids, array[]::uuid[])) as item(role_group_id)
  ) requested;
end;
$$;

revoke all on function public.fn_set_user_role_groups(uuid, uuid[])
  from public, anon;
grant execute on function public.fn_set_user_role_groups(uuid, uuid[])
  to authenticated;

commit;

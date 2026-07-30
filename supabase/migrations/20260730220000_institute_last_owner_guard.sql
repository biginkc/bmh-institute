-- Preserve the invariant that every Institute has at least one owner when
-- Institute role edits are enabled through the lifecycle-locked RPC.

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

  if v_profile.system_role = 'owner'
    and p_system_role <> 'owner'
    and not exists (
      select 1
      from public.profiles other_owner
      where other_owner.system_role = 'owner'
        and other_owner.id <> p_user_id
    )
  then
    raise exception 'At least one Institute owner must remain.' using errcode = '42501';
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

commit;

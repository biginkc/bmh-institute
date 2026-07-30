-- Forward-only repair for the Hugo/Institute lifecycle ownership contract.
-- Keep the historical provisioner and ownership migrations byte-for-byte
-- stable. The deployed unhashed function is wrapped by fixed SQL below so
-- this migration does not depend on its source text remaining unchanged.

begin;

set local lock_timeout = '10s';

do $migration$
begin
  if to_regprocedure(
    'public.hugo_apply_access_unhashed(uuid,text,text,jsonb,text,timestamptz,text)'
  ) is null then
    raise exception
      'HUGO_LIFECYCLE_CONTRACT_FUNCTION_MISSING'
      using errcode = '55000';
  end if;

  if to_regprocedure(
    'public.hugo_apply_access_unhashed_legacy_20260730(uuid,text,text,jsonb,text,timestamptz,text)'
  ) is null then
    execute 'alter function public.hugo_apply_access_unhashed(uuid,text,text,jsonb,text,timestamptz,text) rename to hugo_apply_access_unhashed_legacy_20260730';
  end if;
end;
$migration$;

-- The historical authorization helper compared Hugo's connector role with
-- Institute's role. Replace that deployed helper directly so an Institute
-- role edit does not revoke an otherwise active Hugo grant.
create or replace function public.fn_hugo_grant_row_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.hugo_access_grants grant_row
      on grant_row.user_id = profile.id
    where profile.id = p_user_id
      and profile.status = 'active'
      and lower(btrim(grant_row.email)) = lower(btrim(profile.email))
      and grant_row.app_user_id = profile.id::text
      and grant_row.desired_status = 'active'
      and grant_row.role is not null
      and not grant_row.prepared_for_delete
      and (
        grant_row.access_expires_at is null
        or grant_row.access_expires_at > now()
      )
  );
$$;

revoke all on function public.fn_hugo_grant_row_is_active(uuid)
  from public, anon, authenticated, service_role;

comment on function public.fn_hugo_grant_row_is_active(uuid) is
  'Returns active Hugo lifecycle access for the exact Institute identity. Institute role changes do not alter access.';

create or replace function public.hugo_apply_access_unhashed(
  p_operation_id uuid,
  p_email text,
  p_role text,
  p_config jsonb,
  p_status text,
  p_access_expires_at timestamptz,
  p_app_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_user_id uuid;
  v_current_role text;
  v_current_groups uuid[] := '{}'::uuid[];
  v_grant_status text;
  v_existing_access_expires_at timestamptz;
  v_effective_role text := p_role;
  v_effective_config jsonb := p_config;
  v_effective_access_expires_at timestamptz := p_access_expires_at;
  v_receipt jsonb;
begin
  -- Institute's role/group RPC takes this same lock before its profile row
  -- lock. Resolve the identity without locking first, then acquire the
  -- per-user lock before the legacy function can lock the profile row.
  if p_app_user_id is not null then
    begin
      v_lock_user_id := p_app_user_id::uuid;
    exception when others then
      v_lock_user_id := null;
    end;
  end if;

  if v_lock_user_id is null then
    select profile.id
      into v_lock_user_id
      from public.profiles profile
      where lower(profile.email) = lower(btrim(p_email))
      order by profile.id
      limit 1;
  end if;

  if v_lock_user_id is null then
    select auth_user.id
      into v_lock_user_id
      from auth.users auth_user
      where lower(auth_user.email) = lower(btrim(p_email))
      order by auth_user.id
      limit 1;
  end if;

  if v_lock_user_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('hugo-institute-user-lifecycle:' || v_lock_user_id::text, 0)
    );

    select profile.system_role
      into v_current_role
      from public.profiles profile
      where profile.id = v_lock_user_id;

    select coalesce(
      array_agg(membership.role_group_id order by membership.role_group_id),
      '{}'::uuid[]
    )
      into v_current_groups
      from public.user_role_groups membership
      where membership.user_id = v_lock_user_id;
  end if;

  -- Hugo owns the lifecycle status. Suspension must not apply a stale
  -- connector payload over Institute-owned role/group state.
  if p_status = 'suspended' then
    v_effective_role := v_current_role;
    v_effective_config := jsonb_build_object(
      'role_group_ids',
      to_jsonb(v_current_groups)
    );
  elsif p_status = 'active' and v_lock_user_id is not null then
    select grant_row.desired_status, grant_row.access_expires_at
      into v_grant_status, v_existing_access_expires_at
      from public.hugo_access_grants grant_row
      where grant_row.user_id = v_lock_user_id;

    if v_grant_status = 'suspended' then
      -- Reactivation restores the current Institute snapshot, including the
      -- role/group state edited while the Hugo grant was suspended.
      v_effective_role := v_current_role;
      v_effective_config := jsonb_build_object(
        'role_group_ids',
        to_jsonb(v_current_groups)
      );
      v_effective_access_expires_at := coalesce(
        p_access_expires_at,
        v_existing_access_expires_at
      );
    end if;
  end if;

  v_receipt := public.hugo_apply_access_unhashed_legacy_20260730(
    p_operation_id,
    p_email,
    v_effective_role,
    v_effective_config,
    p_status,
    v_effective_access_expires_at,
    p_app_user_id
  );

  if p_status = 'revoked' and v_lock_user_id is not null then
    -- Terminal revocation denies Hugo access but does not delete Institute's
    -- role-group memberships. The legacy function removes them, so restore
    -- the locked snapshot before returning its receipt.
    delete from public.user_role_groups
    where user_id = v_lock_user_id;
    insert into public.user_role_groups (user_id, role_group_id)
    select v_lock_user_id, role_group_id
    from unnest(v_current_groups) as retained(role_group_id);
  end if;

  return v_receipt;
end;
$$;

revoke all on function public.hugo_apply_access_unhashed(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated, service_role;

revoke all on function public.hugo_apply_access_unhashed_legacy_20260730(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated, service_role;

comment on function public.hugo_apply_access_unhashed(
  uuid, text, text, jsonb, text, timestamptz, text
) is 'Hugo lifecycle mutation adapter; Institute owns role and role-group state.';

commit;

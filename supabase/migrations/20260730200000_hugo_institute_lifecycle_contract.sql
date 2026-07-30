-- Forward-only repair for the Hugo/Institute lifecycle ownership contract.
-- Do not edit the historical provisioner or ownership migrations.

begin;

set local lock_timeout = '10s';

do $migration$
declare
  v_source text;
  v_old text;
  v_new text;
begin
  v_source := pg_get_functiondef(
    'public.hugo_apply_access_unhashed(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure
  );

  v_old := $old$
  v_current_role text;
  v_current_groups jsonb := '[]'::jsonb;
$old$;
  v_new := $new$
  v_current_role text;
  v_current_groups jsonb := '[]'::jsonb;
  v_lock_user_id uuid;
  v_grant_found boolean := false;
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_SOURCE_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  v_old := $old$
    select * into v_profile from public.profiles where id = v_app_id for update;
$old$;
  v_new := $new$
    perform pg_advisory_xact_lock(
      hashtextextended('hugo-institute-user-lifecycle:' || v_app_id::text, 0)
    );
    select * into v_profile from public.profiles where id = v_app_id for update;
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_APP_PROFILE_LOCK_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  v_old := $old$
  else
    select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email)) for update;
$old$;
  v_new := $new$
  else
    select (array_agg(profile.id order by profile.id))[1]
      into v_lock_user_id
    from public.profiles profile
    where lower(profile.email) = lower(btrim(p_email));
    if v_lock_user_id is null then
      select (array_agg(auth_user.id order by auth_user.id))[1]
        into v_lock_user_id
      from auth.users auth_user
      where lower(auth_user.email) = lower(btrim(p_email));
    end if;
    if v_lock_user_id is not null then
      perform pg_advisory_xact_lock(
        hashtextextended('hugo-institute-user-lifecycle:' || v_lock_user_id::text, 0)
      );
    end if;
    select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email)) for update;
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_EMAIL_PROFILE_LOCK_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  v_old := $old$
  -- Institute role/group edits and Hugo lifecycle changes must observe one
  -- coherent identity snapshot. This is intentionally per-user so unrelated
  -- identities do not block each other.
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-user-lifecycle:' || v_profile.id::text, 0)
  );
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id for update;
$old$;
  v_new := $new$
  -- The per-user advisory lock is acquired before any profile or grant row
  -- lock. Institute's role/group RPC takes this same lock first.
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id for update;
  v_grant_found := found;
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_GRANT_LOCK_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  v_old := $old$
  v_current_config := coalesce(v_grant.config, '{}'::jsonb);
  if v_status = 'suspended' then
    select system_role
      into v_current_role
    from public.profiles
    where id = v_profile.id;
    select coalesce(
      jsonb_agg(role_group_id order by role_group_id),
      '[]'::jsonb
    )
      into v_current_groups
    from public.user_role_groups
    where user_id = v_profile.id;
  end if;
  v_role := coalesce(p_role, v_grant.role, v_profile.system_role);
  if v_status = 'active' and found and v_grant.desired_status = 'suspended'
     and (p_config is null or p_config = '{}'::jsonb) then
    -- Reactivation restores the suspended desired state, including its
    -- expiry, instead of silently turning a bounded grant into an indefinite
    -- one when Hugo retries with the minimal payload.
    v_config := v_current_config;
    p_access_expires_at := v_grant.access_expires_at;
  elsif v_status = 'suspended' and found and p_access_expires_at is null then
    p_access_expires_at := v_grant.access_expires_at;
  end if;
$old$;
  v_new := $new$
  v_current_config := coalesce(v_grant.config, '{}'::jsonb);
  select v_profile.system_role into v_current_role;
  select coalesce(
    jsonb_agg(role_group_id order by role_group_id),
    '[]'::jsonb
  )
    into v_current_groups
  from public.user_role_groups
  where user_id = v_profile.id;
  v_role := coalesce(p_role, v_grant.role, v_profile.system_role);
  if v_status = 'active' and v_grant_found
     and v_grant.desired_status = 'suspended' then
    -- Reactivation is an Institute-owned snapshot, never Hugo's stale payload.
    v_role := v_current_role;
    v_config := jsonb_build_object('role_group_ids', v_current_groups);
    if p_access_expires_at is null then
      p_access_expires_at := v_grant.access_expires_at;
    end if;
  elsif v_status = 'suspended' and v_grant_found and p_access_expires_at is null then
    p_access_expires_at := v_grant.access_expires_at;
  end if;
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_SNAPSHOT_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  v_old := $old$
    delete from public.user_role_groups where user_id = v_profile.id;
    insert into public.hugo_access_grants (
$old$;
  v_new := $new$
    -- Institute retains role and memberships after Hugo revocation. The
    -- revoked grant and suspended profile are the access-denial boundary.
    insert into public.hugo_access_grants (
$new$;
  if strpos(v_source, v_old) = 0 then
    raise exception 'HUGO_LIFECYCLE_CONTRACT_REVOKE_DRIFT' using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);

  execute v_source;
end;
$migration$;

-- Keep the new RPC visible to typed callers without changing its frozen name.
comment on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) is 'Hugo lifecycle mutation; Institute owns role and role-group state after provisioning.';

commit;

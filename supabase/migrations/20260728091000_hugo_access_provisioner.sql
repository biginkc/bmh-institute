-- Hugo v1 connector for BMH Institute.
--
-- Hugo owns desired state.  This migration keeps the local grant and its
-- idempotent receipts in Postgres so every lifecycle operation is atomic and
-- safe to retry.  The connector is intentionally service-role-only: a
-- browser/session must never be able to change access through these RPCs.

create table if not exists public.hugo_access_grants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  app_user_id text not null,
  role text check (role is null or role in ('owner', 'admin', 'learner')),
  config jsonb not null default '{}'::jsonb,
  desired_status text not null default 'active'
    check (desired_status in ('active', 'suspended', 'revoked')),
  access_expires_at timestamptz,
  prepared_for_delete boolean not null default false,
  prepared_at timestamptz,
  prepared_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hugo_access_grants_email_idx
  on public.hugo_access_grants (lower(email));

drop trigger if exists hugo_access_grants_updated_at on public.hugo_access_grants;
create trigger hugo_access_grants_updated_at
before update on public.hugo_access_grants
for each row execute function public.set_updated_at();

create table if not exists public.hugo_access_operations (
  operation_id uuid primary key,
  operation text not null check (operation in (
    'grant', 'suspend', 'reactivate', 'revoke', 'inspect',
    'preparePristineDelete', 'deleteIdentity'
  )),
  email text,
  input jsonb not null default '{}'::jsonb,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.fn_hugo_redact_operation_email()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  -- Operation rows are audit/idempotency state, not an identity directory.
  -- Keep only a deterministic lookup fingerprint so raw email PII never lands
  -- in the connector log.
  new.email := encode(digest(convert_to(lower(btrim(coalesce(new.email, ''))), 'utf8'), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists hugo_access_operations_redact_email on public.hugo_access_operations;
create trigger hugo_access_operations_redact_email
before insert on public.hugo_access_operations
for each row execute function public.fn_hugo_redact_operation_email();

comment on column public.hugo_access_operations.email is
  'SHA-256 fingerprint of the requested email; raw identity PII is never retained.';

alter table public.hugo_access_grants enable row level security;
alter table public.hugo_access_operations enable row level security;

-- No client-facing policy is deliberate.  SECURITY DEFINER connector RPCs
-- bypass RLS only after checking auth.role() = service_role.
revoke all on table public.hugo_access_grants from public, anon, authenticated;
revoke all on table public.hugo_access_operations from public, anon, authenticated;

create or replace function public.fn_hugo_sanitize_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_item jsonb;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_item in select key, value from jsonb_each(p_value) loop
      if v_key ~* '(secret|token|password|private.?key|cookie|action.?link|access.?key)' then
        v_result := v_result || jsonb_build_object(v_key, '[REDACTED]');
      else
        v_result := v_result || jsonb_build_object(v_key, public.fn_hugo_sanitize_json(v_item));
      end if;
    end loop;
    return v_result;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(
      jsonb_agg(public.fn_hugo_sanitize_json(value) order by ordinality),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_value) with ordinality;
    return v_result;
  end if;

  return p_value;
end;
$$;

revoke all on function public.fn_hugo_sanitize_json(jsonb) from public;
grant execute on function public.fn_hugo_sanitize_json(jsonb) to service_role;

create or replace function public.fn_hugo_require_service_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Hugo connector requires the service role.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.fn_hugo_require_service_role() from public;
grant execute on function public.fn_hugo_require_service_role() to service_role;

create or replace function public.fn_hugo_access_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.status = 'active'
        and (
          g.user_id is null
          or (
            g.desired_status = 'active'
            and (g.access_expires_at is null or g.access_expires_at > now())
            and not g.prepared_for_delete
          )
        )
      from public.profiles p
      left join public.hugo_access_grants g on g.user_id = p.id
      where p.id = p_user_id
    ),
    false
  );
$$;

revoke all on function public.fn_hugo_access_is_active(uuid) from public;
grant execute on function public.fn_hugo_access_is_active(uuid) to authenticated, service_role;

-- Existing policy helpers are the authorization choke points for Institute
-- content.  Keep legacy accounts (without a Hugo grant row) working while
-- enforcing suspended/revoked/expired grants when a row is present.
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.system_role in ('owner', 'admin')
      and public.fn_hugo_access_is_active(p.id)
  );
$$;

create or replace function public.fn_user_has_program_access(p_user_id uuid, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(p_user_id)
  or (
    public.fn_hugo_access_is_active(p_user_id)
    and exists (
      select 1
      from public.user_role_groups urg
      join public.program_access pa on pa.role_group_id = urg.role_group_id
      where urg.user_id = p_user_id and pa.program_id = p_program_id
    )
  );
$$;

create or replace function public.fn_user_has_course_access(p_user_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(p_user_id)
  or (
    public.fn_hugo_access_is_active(p_user_id)
    and (
      exists (
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
    )
  );
$$;

-- The old trigger only guarded DELETE.  Lifecycle RPCs also demote/suspend
-- owners, so enforce the same invariant on UPDATE under the row lock.
create or replace function public.fn_prevent_last_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_active_owners integer;
begin
  if old.system_role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(*) into v_other_active_owners
  from public.profiles
  where id <> old.id and system_role = 'owner' and status = 'active';

  if tg_op = 'DELETE' then
    if v_other_active_owners = 0 then
      raise exception 'Cannot delete the last remaining owner.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.system_role <> 'owner' or new.status <> 'active' then
    if old.status = 'active' and v_other_active_owners = 0 then
      raise exception 'Cannot remove the last active owner.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_owner_deletion on public.profiles;
create trigger trg_prevent_last_owner_deletion
before delete or update of system_role, status on public.profiles
for each row execute function public.fn_prevent_last_owner_deletion();

create or replace function public.fn_hugo_has_durable_activity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_block_progress where user_id = p_user_id)
      or exists (select 1 from public.user_lesson_completions where user_id = p_user_id)
      or exists (select 1 from public.user_quiz_attempts where user_id = p_user_id)
      or exists (select 1 from public.assignment_submissions where user_id = p_user_id)
      or exists (select 1 from public.user_course_resume where user_id = p_user_id)
      or exists (select 1 from public.certificates where user_id = p_user_id)
      or exists (select 1 from public.program_certificates where user_id = p_user_id);
$$;

revoke all on function public.fn_hugo_has_durable_activity(uuid) from public;
grant execute on function public.fn_hugo_has_durable_activity(uuid) to service_role;

create or replace function public.fn_hugo_receipt(
  p_operation_id uuid,
  p_app_user_id text,
  p_requested_role text,
  p_requested_config jsonb,
  p_requested_status text,
  p_requested_expires_at timestamptz,
  p_observed_role text,
  p_observed_config jsonb,
  p_observed_status text,
  p_observed_expires_at timestamptz,
  p_has_durable_activity boolean,
  p_ok boolean,
  p_error_code text,
  p_error_message text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'operation_id', p_operation_id,
    'app_id', 'institute',
    'app_user_id', p_app_user_id,
    'requested', jsonb_build_object(
      'role', p_requested_role,
      'config', public.fn_hugo_sanitize_json(coalesce(p_requested_config, '{}'::jsonb)),
      'status', p_requested_status,
      'access_expires_at', p_requested_expires_at
    ),
    'observed', jsonb_build_object(
      'role', p_observed_role,
      'config', public.fn_hugo_sanitize_json(coalesce(p_observed_config, '{}'::jsonb)),
      'status', p_observed_status,
      'access_expires_at', p_observed_expires_at,
      'has_durable_activity', p_has_durable_activity
    ),
    'ok', p_ok,
    'error_code', p_error_code,
    'error_message', p_error_message
  );
$$;

revoke all on function public.fn_hugo_receipt(
  uuid, text, text, jsonb, text, timestamptz, text, jsonb, text,
  timestamptz, boolean, boolean, text, text
) from public;
grant execute on function public.fn_hugo_receipt(
  uuid, text, text, jsonb, text, timestamptz, text, jsonb, text,
  timestamptz, boolean, boolean, text, text
) to service_role;

create or replace function public.fn_hugo_operation_receipt(p_operation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select receipt from public.hugo_access_operations where operation_id = p_operation_id;
$$;

revoke all on function public.fn_hugo_operation_receipt(uuid) from public;
grant execute on function public.fn_hugo_operation_receipt(uuid) to service_role;

create or replace function public.hugo_apply_access(
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
  v_existing jsonb;
  v_profile public.profiles%rowtype;
  v_grant public.hugo_access_grants%rowtype;
  v_profile_count integer;
  v_auth_count integer;
  v_auth_id uuid;
  v_app_id uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_config jsonb := public.fn_hugo_sanitize_json(coalesce(p_config, '{}'::jsonb));
  v_current_config jsonb;
  v_role text;
  v_status text := p_status;
  v_operation text;
  v_receipt jsonb;
  v_durable boolean := false;
begin
  perform public.fn_hugo_require_service_role();
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;
  v_existing := public.fn_hugo_operation_receipt(p_operation_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_email is null or btrim(p_email) = '' then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'invalid_email', 'A valid email address is required.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_status is null or v_status not in ('active', 'suspended', 'revoked') then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'invalid_status', 'The requested access status is not supported.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if p_role is not null and p_role not in ('owner', 'admin', 'learner') then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'invalid_role', 'The requested Institute role is not supported.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if jsonb_typeof(v_config) <> 'object' then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, '{}'::jsonb, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'invalid_config', 'The requested Institute configuration must be an object.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_config ? 'role_group_ids' and jsonb_typeof(v_config->'role_group_ids') <> 'array' then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'invalid_config', 'role_group_ids must be an array.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_config ? 'role_group_ids' then
    begin
      if exists (
        select 1 from jsonb_array_elements_text(v_config->'role_group_ids') as item(value)
        where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) then
        raise exception 'invalid role group UUID';
      end if;
      select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
        into v_ids
      from jsonb_array_elements_text(v_config->'role_group_ids') item(value);
    exception when others then
      v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
        'invalid_config', 'role_group_ids contains an invalid identifier.');
      insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
      return v_receipt;
    end;
    if (select count(*) from public.role_groups where id = any(v_ids)) <> cardinality(v_ids) then
      v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
        'invalid_role_group', 'One or more role groups do not exist.');
      insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
      return v_receipt;
    end if;
    v_config := jsonb_set(v_config, '{role_group_ids}', to_jsonb(v_ids), true);
  else
    v_config := jsonb_set(v_config, '{role_group_ids}', '[]'::jsonb, true);
  end if;

  select count(*) into v_profile_count
  from public.profiles
  where lower(email) = lower(btrim(p_email));
  if v_profile_count > 1 then
    v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
      'ambiguous_identity', 'More than one Institute identity matches the email.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;

  if p_app_user_id is not null then
    begin
      v_app_id := p_app_user_id::uuid;
    exception when others then
      v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
        'invalid_app_user_id', 'The Institute identity identifier is invalid.');
      insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
      return v_receipt;
    end;
    select * into v_profile from public.profiles where id = v_app_id for update;
    if not found then
      v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
        'identity_missing', 'The Institute identity is not provisioned.');
      insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
      return v_receipt;
    end if;
    if lower(v_profile.email) <> lower(btrim(p_email)) then
      v_receipt := public.fn_hugo_receipt(p_operation_id, p_app_user_id, p_role, v_config, v_status,
        p_access_expires_at, v_profile.system_role, '{}'::jsonb, 'missing', null, false, false,
        'identity_mismatch', 'The Institute identity does not match the requested email.');
      insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
      return v_receipt;
    end if;
  else
    select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email)) for update;
    if not found then
      select count(*) into v_auth_count
      from auth.users
      where lower(email) = lower(btrim(p_email));
      if v_auth_count > 1 then
        v_receipt := public.fn_hugo_receipt(p_operation_id, null, p_role, v_config, v_status,
          p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
          'ambiguous_identity', 'More than one Auth identity matches the email.');
        insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
        return v_receipt;
      end if;
      select id into v_auth_id
      from auth.users
      where lower(email) = lower(btrim(p_email));
      if v_auth_id is null then
        v_receipt := public.fn_hugo_receipt(p_operation_id, null, p_role, v_config, v_status,
          p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
          'identity_missing', 'The Institute identity is not provisioned.');
        insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
        return v_receipt;
      end if;
      insert into public.profiles (id, email, full_name, status)
      select v_auth_id, coalesce(u.email, p_email),
        coalesce(u.raw_user_meta_data->>'full_name', split_part(p_email, '@', 1)), 'invited'
      from auth.users u where u.id = v_auth_id
      on conflict (id) do nothing;
      select * into v_profile from public.profiles where id = v_auth_id for update;
    end if;
    v_app_id := v_profile.id;
  end if;

  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id for update;
  if found and v_grant.prepared_for_delete then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, p_role, v_config, v_status,
      p_access_expires_at, v_grant.role, v_grant.config, 'suspended', v_grant.access_expires_at,
      public.fn_hugo_has_durable_activity(v_profile.id), false,
      'identity_prepared_for_delete', 'The Institute identity is prepared for deletion.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if found and v_grant.desired_status = 'revoked' and v_status <> 'revoked' then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, p_role, v_config, v_status,
      p_access_expires_at, null, '{}'::jsonb, 'revoked', v_grant.access_expires_at,
      public.fn_hugo_has_durable_activity(v_profile.id), false,
      'grant_revoked', 'A revoked Institute grant cannot be reactivated.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;

  v_current_config := coalesce(v_grant.config, '{}'::jsonb);
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
  if v_status in ('active', 'suspended') and v_role is null then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, p_role, v_config, v_status,
      p_access_expires_at, null, v_current_config, coalesce(v_grant.desired_status, 'suspended'),
      v_grant.access_expires_at, public.fn_hugo_has_durable_activity(v_profile.id), false,
      'invalid_role', 'An active or suspended Institute grant requires a role.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_status = 'suspended' and not found then
    v_config := jsonb_build_object('role_group_ids', coalesce(
      (select jsonb_agg(role_group_id order by role_group_id) from public.user_role_groups where user_id = v_profile.id),
      '[]'::jsonb));
  elsif v_status = 'suspended' and (p_config is null or p_config = '{}'::jsonb) and found then
    v_config := v_current_config;
  end if;

  if v_status = 'active' then
    v_operation := case when found and v_grant.desired_status = 'suspended' then 'reactivate' else 'grant' end;
  elsif v_status = 'suspended' then
    v_operation := 'suspend';
  else
    v_operation := 'revoke';
    v_role := null;
    v_config := '{}'::jsonb;
  end if;

  -- Demotion, suspension, revocation, and pristine deletion must not remove
  -- the final active owner.  The trigger below is the last line of defence;
  -- this preflight keeps the connector's failure a normalized receipt.
  if v_profile.system_role = 'owner'
     and (v_status <> 'active' or v_role <> 'owner')
     and not exists (
       select 1 from public.profiles
       where id <> v_profile.id and system_role = 'owner' and status = 'active'
     ) then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, p_role, v_config, v_status,
      p_access_expires_at, v_profile.system_role, v_current_config, 'active',
      coalesce(v_grant.access_expires_at, p_access_expires_at),
      public.fn_hugo_has_durable_activity(v_profile.id), false, 'final_owner_guard',
      'The final active Institute owner cannot lose access or be demoted.');
    insert into public.hugo_access_operations values (p_operation_id, 'grant', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;

  if v_status = 'revoked' then
    update public.profiles set status = 'suspended' where id = v_profile.id;
    delete from public.user_role_groups where user_id = v_profile.id;
    insert into public.hugo_access_grants (
      user_id, email, app_user_id, role, config, desired_status, access_expires_at
    ) values (
      v_profile.id, v_profile.email, v_profile.id::text, null, '{}'::jsonb, 'revoked', p_access_expires_at
    ) on conflict (user_id) do update set
      email = excluded.email, app_user_id = excluded.app_user_id, role = null,
      config = '{}'::jsonb, desired_status = 'revoked', access_expires_at = excluded.access_expires_at,
      prepared_for_delete = false, prepared_at = null, prepared_operation_id = null;
  else
    update public.profiles
    set system_role = v_role, status = case when v_status = 'active' then 'active' else 'suspended' end
    where id = v_profile.id;
    delete from public.user_role_groups where user_id = v_profile.id;
    insert into public.user_role_groups (user_id, role_group_id)
    select v_profile.id, id from public.role_groups where id = any(
      coalesce(array(select value::uuid from jsonb_array_elements_text(v_config->'role_group_ids') as item(value)), '{}'::uuid[])
    );
    insert into public.hugo_access_grants (
      user_id, email, app_user_id, role, config, desired_status, access_expires_at,
      prepared_for_delete, prepared_at, prepared_operation_id
    ) values (
      v_profile.id, v_profile.email, v_profile.id::text, v_role, v_config, v_status, p_access_expires_at,
      false, null, null
    ) on conflict (user_id) do update set
      email = excluded.email, app_user_id = excluded.app_user_id, role = excluded.role,
      config = excluded.config, desired_status = excluded.desired_status,
      access_expires_at = excluded.access_expires_at,
      prepared_for_delete = false, prepared_at = null, prepared_operation_id = null;
  end if;

  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id;
  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);
  v_receipt := public.fn_hugo_receipt(
    p_operation_id, v_profile.id::text, p_role, v_config, v_status, p_access_expires_at,
    v_grant.role, v_grant.config,
    case
      when v_grant.desired_status = 'revoked' then 'revoked'
      when v_grant.desired_status = 'suspended' then 'suspended'
      when v_grant.access_expires_at is not null and v_grant.access_expires_at <= now() then 'suspended'
      else 'active'
    end,
    v_grant.access_expires_at, v_durable, true, null, null
  );
  insert into public.hugo_access_operations(operation_id, operation, email, input, receipt)
  values (p_operation_id, v_operation, p_email,
    jsonb_build_object('role', p_role, 'config', v_config, 'status', p_status,
      'access_expires_at', p_access_expires_at, 'app_user_id', p_app_user_id), v_receipt);
  return v_receipt;
end;
$$;

create or replace function public.hugo_inspect_access(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_grant public.hugo_access_grants%rowtype;
  v_profile_count integer;
  v_role text;
  v_config jsonb;
  v_status text;
  v_expires timestamptz;
begin
  perform public.fn_hugo_require_service_role();
  select count(*) into v_profile_count
  from public.profiles
  where lower(email) = lower(btrim(p_email));
  if v_profile_count > 1 then
    return public.fn_hugo_receipt(gen_random_uuid(), null, null, '{}'::jsonb, 'active', null,
      null, '{}'::jsonb, 'missing', null, null, false, 'ambiguous_identity',
      'More than one Institute identity matches the email.');
  end if;
  select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email));
  if not found then
    return public.fn_hugo_receipt(gen_random_uuid(), null, null, '{}'::jsonb, 'active', null,
      null, '{}'::jsonb, 'missing', null, null, true, null, null);
  end if;
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id;
  if found then
    v_role := v_grant.role;
    v_config := v_grant.config;
    v_expires := v_grant.access_expires_at;
    v_status := case
      when v_grant.desired_status = 'revoked' then 'revoked'
      when v_grant.desired_status = 'suspended' then 'suspended'
      when v_grant.prepared_for_delete then 'suspended'
      when v_grant.access_expires_at is not null and v_grant.access_expires_at <= now() then 'suspended'
      when v_profile.status <> 'active' then 'suspended'
      else 'active'
    end;
  else
    v_role := v_profile.system_role;
    select jsonb_build_object('role_group_ids', coalesce(jsonb_agg(role_group_id order by role_group_id), '[]'::jsonb))
      into v_config from public.user_role_groups where user_id = v_profile.id;
    v_expires := null;
    v_status := case when v_profile.status = 'active' then 'active' else 'suspended' end;
  end if;
  return public.fn_hugo_receipt(gen_random_uuid(), v_profile.id::text, v_role, v_config, v_status, v_expires,
    v_role, v_config, v_status, v_expires, public.fn_hugo_has_durable_activity(v_profile.id), true, null, null);
end;
$$;

-- Read-only inventory for Hugo's app-only drift check.  This intentionally
-- reads every local profile, including legacy profiles that remain authorized
-- without a Hugo grant.  A grant, when present, supplies the managed desired
-- state; otherwise the profile and role-group state is reported as the local
-- fallback.  The function never repairs, inserts an audit row, or mutates
-- local authorization state.
create or replace function public.hugo_list_access()
returns table (
  email text,
  app_user_id text,
  role text,
  config jsonb,
  status text,
  access_expires_at timestamptz,
  has_durable_activity boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_hugo_require_service_role();
  return query
  select
    lower(trim(p.email)),
    case when g.user_id is null then p.id::text else g.app_user_id end,
    case when g.user_id is null then p.system_role else g.role end,
    case
      when g.user_id is null then jsonb_build_object(
        'role_group_ids', coalesce(
          jsonb_agg(urg.role_group_id order by urg.role_group_id)
            filter (where urg.role_group_id is not null),
          '[]'::jsonb
        )
      )
      else public.fn_hugo_sanitize_json(coalesce(g.config, '{}'::jsonb))
    end,
    case
      when g.user_id is null then case when p.status = 'active' then 'active' else 'suspended' end
      when g.desired_status = 'revoked' then 'revoked'
      when g.desired_status = 'suspended' then 'suspended'
      when g.prepared_for_delete then 'suspended'
      when g.access_expires_at is not null and g.access_expires_at <= now() then 'suspended'
      when p.status <> 'active' then 'suspended'
      else 'active'
    end,
    g.access_expires_at,
    public.fn_hugo_has_durable_activity(p.id)
  from public.profiles p
  left join public.hugo_access_grants g on g.user_id = p.id
  left join public.user_role_groups urg on urg.user_id = p.id
  group by p.id, p.email, p.system_role, p.status, g.user_id, g.app_user_id,
    g.role, g.config, g.desired_status, g.prepared_for_delete, g.access_expires_at
  order by lower(trim(p.email)), p.id;
end;
$$;

create or replace function public.hugo_prepare_pristine_delete(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_profile public.profiles%rowtype;
  v_grant public.hugo_access_grants%rowtype;
  v_profile_count integer;
  v_durable boolean;
  v_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;
  v_existing := public.fn_hugo_operation_receipt(p_operation_id);
  if v_existing is not null then return v_existing; end if;
  select count(*) into v_profile_count
  from public.profiles
  where lower(email) = lower(btrim(p_email));
  if v_profile_count > 1 then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
      null, '{}'::jsonb, 'missing', null, null, false, 'ambiguous_identity',
      'More than one Institute identity matches the email.');
    insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email)) for update;
  if not found then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
      null, '{}'::jsonb, 'missing', null, null, false, 'identity_missing',
      'The Institute identity is not provisioned.');
    insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id for update;
  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);
  if v_profile.system_role = 'owner' and not exists (
    select 1 from public.profiles where id <> v_profile.id and system_role = 'owner' and status = 'active'
  ) then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      coalesce(v_grant.role, v_profile.system_role), coalesce(v_grant.config, '{}'::jsonb),
      'suspended', coalesce(v_grant.access_expires_at, null), v_durable, false, 'final_owner_guard',
      'The final active Institute owner cannot be deleted.');
    insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_durable then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      coalesce(v_grant.role, v_profile.system_role), coalesce(v_grant.config, '{}'::jsonb),
      'active', coalesce(v_grant.access_expires_at, null), true, false, 'identity_not_pristine',
      'The Institute identity has durable business activity.');
    insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if found and v_grant.prepared_for_delete then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      v_grant.role, v_grant.config, 'suspended', v_grant.access_expires_at, false, false,
      'already_prepared', 'The Institute identity is already prepared for deletion.');
    insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;

  delete from public.user_role_groups where user_id = v_profile.id;
  update public.profiles set status = 'suspended' where id = v_profile.id;
  insert into public.hugo_access_grants (
    user_id, email, app_user_id, role, config, desired_status, prepared_for_delete,
    prepared_at, prepared_operation_id
  ) values (
    v_profile.id, v_profile.email, v_profile.id::text, null, '{}'::jsonb, 'revoked', true,
    now(), p_operation_id
  ) on conflict (user_id) do update set
    email = excluded.email, app_user_id = excluded.app_user_id, role = null,
    config = '{}'::jsonb, desired_status = 'revoked', prepared_for_delete = true,
    prepared_at = excluded.prepared_at, prepared_operation_id = excluded.prepared_operation_id;
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id;
  v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
    null, '{}'::jsonb, 'revoked', v_grant.access_expires_at, false, true, null, null);
  insert into public.hugo_access_operations values (p_operation_id, 'preparePristineDelete', p_email, '{}'::jsonb, v_receipt);
  return v_receipt;
end;
$$;

create or replace function public.hugo_delete_identity(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_profile public.profiles%rowtype;
  v_grant public.hugo_access_grants%rowtype;
  v_profile_count integer;
  v_durable boolean;
  v_deleted integer;
  v_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;
  v_existing := public.fn_hugo_operation_receipt(p_operation_id);
  if v_existing is not null then return v_existing; end if;
  select count(*) into v_profile_count
  from public.profiles
  where lower(email) = lower(btrim(p_email));
  if v_profile_count > 1 then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
      null, '{}'::jsonb, 'missing', null, null, false, 'ambiguous_identity',
      'More than one Institute identity matches the email.');
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  select * into v_profile from public.profiles where lower(email) = lower(btrim(p_email)) for update;
  if not found then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
      null, '{}'::jsonb, 'missing', null, null, true, null, null);
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  select * into v_grant from public.hugo_access_grants where user_id = v_profile.id for update;
  if not found or not v_grant.prepared_for_delete then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      coalesce(v_grant.role, v_profile.system_role), coalesce(v_grant.config, '{}'::jsonb), 'suspended',
      v_grant.access_expires_at, public.fn_hugo_has_durable_activity(v_profile.id), false,
      'delete_not_prepared', 'The Institute identity was not prepared as pristine.');
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);
  if v_durable then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      v_grant.role, v_grant.config, 'suspended', v_grant.access_expires_at, true, false,
      'identity_not_pristine', 'The Institute identity has durable business activity.');
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  if v_profile.system_role = 'owner' and not exists (
    select 1 from public.profiles where id <> v_profile.id and system_role = 'owner' and status = 'active'
  ) then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      v_grant.role, v_grant.config, 'suspended', v_grant.access_expires_at, false, false,
      'final_owner_guard', 'The final active Institute owner cannot be deleted.');
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;

  delete from auth.users where id = v_profile.id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
      v_grant.role, v_grant.config, 'suspended', v_grant.access_expires_at, false, false,
      'identity_missing', 'The Institute identity could not be deleted.');
    insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
    return v_receipt;
  end if;
  v_receipt := public.fn_hugo_receipt(p_operation_id, v_profile.id::text, null, '{}'::jsonb, 'revoked', null,
    null, '{}'::jsonb, 'missing', null, false, true, null, null);
  insert into public.hugo_access_operations values (p_operation_id, 'deleteIdentity', p_email, '{}'::jsonb, v_receipt);
  return v_receipt;
end;
$$;

revoke all on function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.hugo_inspect_access(text) from public, anon, authenticated;
revoke all on function public.hugo_list_access() from public, anon, authenticated;
revoke all on function public.hugo_prepare_pristine_delete(uuid, text) from public, anon, authenticated;
revoke all on function public.hugo_delete_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text) to service_role;
grant execute on function public.hugo_inspect_access(text) to service_role;
grant execute on function public.hugo_list_access() to service_role;
grant execute on function public.hugo_prepare_pristine_delete(uuid, text) to service_role;
grant execute on function public.hugo_delete_identity(uuid, text) to service_role;

comment on function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text) is
  'Hugo Institute connector: grant, suspend, reactivate, or revoke; service-role-only and idempotent by operation_id.';
comment on function public.hugo_inspect_access(text) is
  'Hugo Institute connector inspect; service-role-only and expiry-aware.';
comment on function public.hugo_list_access() is
  'Hugo Institute connector inventory; service-role-only, read-only, deterministic, and expiry-aware.';
comment on function public.hugo_prepare_pristine_delete(uuid, text) is
  'Hugo Institute connector pristine-delete preparation with durable-activity and final-owner guards.';
comment on function public.hugo_delete_identity(uuid, text) is
  'Hugo Institute connector deletion of an identity previously prepared as pristine.';

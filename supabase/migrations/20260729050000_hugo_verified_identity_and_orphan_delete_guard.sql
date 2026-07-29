-- Keep active Hugo grants bound to a verified Institute Auth email, and never
-- report a profile-less Auth identity as deleted while the Auth row survives.
-- This forward migration preserves the frozen public RPC signatures.

begin;

set local lock_timeout = '10s';

create or replace function public.fn_hugo_active_identity_is_unverified(
  p_email text,
  p_app_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_app_user_id uuid;
begin
  if p_app_user_id is not null then
    begin
      v_app_user_id := p_app_user_id::uuid;
    exception when invalid_text_representation then
      -- The lifecycle implementation returns the existing invalid-id receipt.
      return false;
    end;
    return not exists (
      select 1
      from auth.users auth_user
      where auth_user.id = v_app_user_id
        and lower(btrim(auth_user.email)) = v_email
        and auth_user.email_confirmed_at is not null
    );
  end if;

  if exists (
    select 1
    from public.profiles profile
    where lower(btrim(profile.email)) = v_email
  ) then
    return exists (
      select 1
      from public.profiles profile
      where lower(btrim(profile.email)) = v_email
        and not exists (
          select 1
          from auth.users auth_user
          where auth_user.id = profile.id
            and lower(btrim(auth_user.email)) = v_email
            and auth_user.email_confirmed_at is not null
        )
    );
  end if;

  return exists (
    select 1
    from auth.users auth_user
    where lower(btrim(auth_user.email)) = v_email
      and auth_user.email_confirmed_at is null
  );
end;
$$;

revoke all on function public.fn_hugo_active_identity_is_unverified(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.fn_hugo_auth_identity_has_no_profile(
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users auth_user
    where lower(btrim(auth_user.email)) =
      lower(btrim(coalesce(p_email, '')))
  )
  and not exists (
    select 1
    from public.profiles profile
    where lower(btrim(profile.email)) =
      lower(btrim(coalesce(p_email, '')))
  );
$$;

revoke all on function public.fn_hugo_auth_identity_has_no_profile(text)
  from public, anon, authenticated, service_role;

create or replace function public.fn_hugo_apply_config_is_valid(
  p_config jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_ids uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(v_config) <> 'object'
     or jsonb_typeof(v_config->'role_group_ids') <> 'array' then
    return false;
  end if;
  begin
    if exists (
      select 1
      from jsonb_array_elements_text(
        v_config->'role_group_ids'
      ) as item(value)
      where item.value !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      return false;
    end if;
    select coalesce(
      array_agg(item.value::uuid order by item.value::uuid),
      '{}'::uuid[]
    )
    into v_ids
    from jsonb_array_elements_text(
      v_config->'role_group_ids'
    ) as item(value);
  exception when others then
    return false;
  end;
  return (
    select count(*)
    from public.role_groups role_group
    where role_group.id = any(v_ids)
  ) = cardinality(v_ids);
end;
$$;

revoke all on function public.fn_hugo_apply_config_is_valid(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.fn_hugo_store_guard_failure(
  p_operation_id uuid,
  p_operation text,
  p_email text,
  p_request_hash text,
  p_requested_role text,
  p_requested_config jsonb,
  p_requested_status text,
  p_requested_expires_at timestamptz,
  p_app_user_id text,
  p_has_durable_activity boolean,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt jsonb;
begin
  if p_operation_id is null
     or p_operation not in (
       'grant', 'preparePristineDelete', 'deleteIdentity'
     )
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hugo guard failure receipt is invalid.'
      using errcode = '22023';
  end if;

  v_receipt := public.fn_hugo_receipt(
    p_operation_id,
    p_app_user_id,
    p_requested_role,
    coalesce(p_requested_config, '{}'::jsonb),
    p_requested_status,
    p_requested_expires_at,
    null,
    '{}'::jsonb,
    'missing',
    null,
    p_has_durable_activity,
    false,
    p_error_code,
    p_error_message
  );
  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', p_request_hash, true);
  insert into public.hugo_access_operations (
    operation_id,
    operation,
    email,
    input,
    receipt
  ) values (
    p_operation_id,
    p_operation,
    p_email,
    case
      when p_operation = 'grant' then jsonb_build_object(
        'role', p_requested_role,
        'config', coalesce(p_requested_config, '{}'::jsonb),
        'status', p_requested_status,
        'access_expires_at', p_requested_expires_at,
        'app_user_id', p_app_user_id
      )
      else '{}'::jsonb
    end,
    v_receipt
  );
  update private.hugo_access_operation_claims
  set consumed_at = now()
  where operation_id = p_operation_id;
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

revoke all on function public.fn_hugo_store_guard_failure(
  uuid, text, text, text, text, jsonb, text, timestamptz, text, boolean,
  text, text
) from public, anon, authenticated, service_role;

create table if not exists private.hugo_access_operation_claims (
  operation_id uuid primary key,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  email_fingerprint text not null
    check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  requested jsonb not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists
  hugo_access_operation_claims_live_email_uidx
on private.hugo_access_operation_claims (email_fingerprint)
where consumed_at is null;

alter table private.hugo_access_operation_claims enable row level security;
revoke all on table private.hugo_access_operation_claims
  from public, anon, authenticated, service_role;
drop policy if exists hugo_active_authenticated_gate
  on private.hugo_access_operation_claims;
create policy hugo_active_authenticated_gate
  on private.hugo_access_operation_claims
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.hugo_preflight_access_operation(
  p_operation_id uuid,
  p_email text,
  p_role text,
  p_config jsonb,
  p_status text,
  p_access_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_email_fingerprint text :=
    public.fn_hugo_email_fingerprint(v_email);
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_hash text;
  v_claim private.hugo_access_operation_claims%rowtype;
  v_existing_operation text;
  v_existing_hash text;
  v_existing_input jsonb;
  v_existing_receipt jsonb;
  v_existing_app_user_id text;
  v_legacy_candidate_hash text;
  v_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_apply_access',
    v_email_fingerprint,
    p_role,
    v_config,
    p_status,
    to_jsonb(p_access_expires_at),
    null
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = '22023';
  end if;
  if v_email = ''
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     or p_role is null
     or p_role not in ('owner', 'admin', 'learner')
     or p_status is null
     or p_status not in ('active', 'suspended', 'revoked')
     or not public.fn_hugo_apply_config_is_valid(v_config) then
    v_receipt := public.fn_hugo_bind_mutation_receipt(
      public.fn_hugo_receipt(
        p_operation_id, null, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
        false, 'invalid_request',
        'The Institute access request is invalid.'
      ),
      p_operation_id,
      v_hash
    );
    return jsonb_build_object(
      'proceed', false,
      'request_hash', v_hash,
      'receipt', v_receipt
    );
  end if;

  select claim.*
  into v_claim
  from private.hugo_access_operation_claims claim
  where claim.operation_id = p_operation_id
  for update;
  if found then
    if v_claim.request_hash is distinct from v_hash then
      v_receipt := public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, null, p_role, v_config, p_status,
          p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
          false, 'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
      return jsonb_build_object(
        'proceed', false,
        'request_hash', v_hash,
        'receipt', v_receipt
      );
    end if;
    if exists (
      select 1
      from public.hugo_access_operations operation_row
      where operation_row.operation_id = p_operation_id
    ) then
      return jsonb_build_object(
        'proceed', false,
        'request_hash', v_hash,
        'receipt', public.fn_hugo_bound_operation_receipt(p_operation_id)
      );
    end if;
    return jsonb_build_object('proceed', true, 'request_hash', v_hash);
  end if;

  select
    operation_row.operation,
    operation_row.request_hash,
    operation_row.input,
    operation_row.receipt
  into
    v_existing_operation,
    v_existing_hash,
    v_existing_input,
    v_existing_receipt
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_operation in ('grant', 'suspend', 'reactivate', 'revoke')
    then
      v_existing_app_user_id := case
        when coalesce(v_existing_input, '{}'::jsonb) ? 'app_user_id'
          then v_existing_input->>'app_user_id'
        else v_existing_receipt->>'app_user_id'
      end;
      v_legacy_candidate_hash := public.fn_hugo_request_payload_hash(
        'hugo_apply_access',
        v_email_fingerprint,
        p_role,
        v_config,
        p_status,
        to_jsonb(p_access_expires_at),
        v_existing_app_user_id
      );
      if v_existing_hash is not distinct from v_legacy_candidate_hash then
        return jsonb_build_object(
          'proceed', false,
          'request_hash', v_existing_hash,
          'receipt', public.fn_hugo_bound_operation_receipt(
            p_operation_id
          )
        );
      end if;
    end if;
    v_receipt := public.fn_hugo_bind_mutation_receipt(
      public.fn_hugo_receipt(
        p_operation_id, null, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
        false, 'operation_id_reused',
        'Operation id already belongs to a legacy request.'
      ),
      p_operation_id,
      v_hash
    );
    return jsonb_build_object(
      'proceed', false,
      'request_hash', v_hash,
      'receipt', v_receipt
    );
  end if;

  if exists (
    select 1
    from private.hugo_access_operation_claims claim
    where claim.email_fingerprint = v_email_fingerprint
      and claim.consumed_at is null
  ) then
    v_receipt := public.fn_hugo_bind_mutation_receipt(
      public.fn_hugo_receipt(
        p_operation_id, null, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
        false, 'identity_provision_in_progress',
        'Another Institute access request is provisioning this identity.'
      ),
      p_operation_id,
      v_hash
    );
    return jsonb_build_object(
      'proceed', false,
      'request_hash', v_hash,
      'receipt', v_receipt
    );
  end if;

  insert into private.hugo_access_operation_claims (
    operation_id,
    request_hash,
    email_fingerprint,
    requested
  ) values (
    p_operation_id,
    v_hash,
    v_email_fingerprint,
    jsonb_build_object(
      'role', p_role,
      'config', v_config,
      'status', p_status,
      'access_expires_at', p_access_expires_at
    )
  );
  return jsonb_build_object('proceed', true, 'request_hash', v_hash);
end;
$$;

revoke all on function public.hugo_preflight_access_operation(
  uuid, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.hugo_preflight_access_operation(
  uuid, text, text, jsonb, text, timestamptz
) to service_role;

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
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_hash text;
  v_existing_hash text;
  v_claim_hash text;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = '22023';
  end if;

  select claim.request_hash
  into v_claim_hash
  from private.hugo_access_operation_claims claim
  where claim.operation_id = p_operation_id
  for update;
  if found then
    v_hash := public.fn_hugo_request_payload_hash(
      'hugo_apply_access',
      public.fn_hugo_email_fingerprint(v_email),
      p_role,
      v_config,
      p_status,
      to_jsonb(p_access_expires_at),
      null
    );
  else
    v_hash := public.fn_hugo_request_payload_hash(
      'hugo_apply_access',
      public.fn_hugo_email_fingerprint(v_email),
      p_role,
      v_config,
      p_status,
      to_jsonb(p_access_expires_at),
      p_app_user_id
    );
  end if;
  if v_claim_hash is not null
     and v_claim_hash is distinct from v_hash then
    return public.fn_hugo_bind_mutation_receipt(
      public.fn_hugo_receipt(
        p_operation_id, p_app_user_id, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
        false, 'operation_id_reused',
        'Operation id was already used for a different request.'
      ),
      p_operation_id,
      v_hash
    );
  end if;
  if v_claim_hash is not null then
    v_hash := v_claim_hash;
  end if;
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, p_app_user_id, p_role, v_config, p_status,
          p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
          false, 'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  if p_status = 'active'
     and public.fn_hugo_active_identity_is_unverified(
       v_email,
       p_app_user_id
     ) then
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'grant',
      v_email,
      v_hash,
      p_role,
      v_config,
      p_status,
      p_access_expires_at,
      p_app_user_id,
      false,
      'identity_unverified',
      'The Institute identity email is not verified.'
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_apply_access_unhashed(
    p_operation_id,
    p_email,
    p_role,
    p_config,
    p_status,
    p_access_expires_at,
    p_app_user_id
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  update private.hugo_access_operation_claims
  set consumed_at = now()
  where operation_id = p_operation_id;
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

create or replace function public.hugo_prepare_pristine_delete(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_durable boolean;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = '22023';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_prepare_pristine_delete',
    public.fn_hugo_email_fingerprint(v_email),
    null,
    '{}'::jsonb,
    null,
    null,
    null
  );
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
          null, '{}'::jsonb, 'missing', null, null, false,
          'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  if public.fn_hugo_auth_identity_has_no_profile(v_email) then
    v_durable := public.fn_hugo_email_has_durable_activity(v_email);
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'preparePristineDelete',
      v_email,
      v_hash,
      null,
      '{}'::jsonb,
      'revoked',
      null,
      null,
      v_durable,
      case
        when v_durable then 'identity_not_pristine'
        else 'identity_profile_missing'
      end,
      case
        when v_durable then
          'The Institute identity has durable business activity.'
        else 'The Institute Auth identity has no lifecycle profile.'
      end
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_prepare_pristine_delete_unhashed(
    p_operation_id,
    p_email
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

create or replace function public.hugo_delete_identity(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_durable boolean;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = '22023';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_delete_identity',
    public.fn_hugo_email_fingerprint(v_email),
    null,
    '{}'::jsonb,
    null,
    null,
    null
  );
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
          null, '{}'::jsonb, 'missing', null, null, false,
          'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  if public.fn_hugo_auth_identity_has_no_profile(v_email) then
    v_durable := public.fn_hugo_email_has_durable_activity(v_email);
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'deleteIdentity',
      v_email,
      v_hash,
      null,
      '{}'::jsonb,
      'revoked',
      null,
      null,
      v_durable,
      case
        when v_durable then 'identity_not_pristine'
        else 'identity_profile_missing'
      end,
      case
        when v_durable then
          'The Institute identity has durable business activity.'
        else 'The Institute Auth identity has no lifecycle profile.'
      end
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_delete_identity_unhashed(
    p_operation_id,
    p_email
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

revoke all on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.hugo_prepare_pristine_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.hugo_delete_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) to service_role;
grant execute on function public.hugo_prepare_pristine_delete(uuid, text)
  to service_role;
grant execute on function public.hugo_delete_identity(uuid, text)
  to service_role;

commit;

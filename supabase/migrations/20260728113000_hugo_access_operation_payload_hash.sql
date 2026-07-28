-- Hugo v1 forward-only idempotency hardening.
--
-- The original connector journal keyed retries only by operation_id.  This
-- migration keeps that public contract, but binds each operation to a
-- deterministic, sanitized request payload.  A reused operation_id with a
-- different request returns a bounded conflict receipt before any mutation.

alter table public.hugo_access_operations
  add column if not exists request_hash text;

create or replace function public.fn_hugo_email_fingerprint(p_email text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(lower(btrim(coalesce(p_email, ''))), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.fn_hugo_email_fingerprint(text) from public, anon, authenticated;
grant execute on function public.fn_hugo_email_fingerprint(text) to service_role;

-- The apply RPC sorts and UUID-normalizes role_group_ids before it writes a
-- successful receipt.  Canonicalize that same field before hashing so a retry
-- with equivalent JSON ordering is an exact replay rather than a conflict.
create or replace function public.fn_hugo_canonical_apply_config(p_config jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_config jsonb := public.fn_hugo_sanitize_json(coalesce(p_config, '{}'::jsonb));
  v_ids jsonb;
begin
  if jsonb_typeof(v_config) <> 'object' then
    return v_config;
  end if;

  if not (v_config ? 'role_group_ids') then
    return v_config || jsonb_build_object('role_group_ids', '[]'::jsonb);
  end if;

  if jsonb_typeof(v_config->'role_group_ids') <> 'array' then
    return v_config;
  end if;

  -- Invalid identifiers are intentionally left untouched.  The lifecycle
  -- RPC will return its existing invalid_config receipt, while valid UUIDs
  -- receive the same lowercase sorted representation as the RPC body.
  if exists (
    select 1
    from jsonb_array_elements_text(v_config->'role_group_ids') as item(value)
    where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    return v_config;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(item.value::uuid) order by item.value::uuid),
    '[]'::jsonb
  )
  into v_ids
  from jsonb_array_elements_text(v_config->'role_group_ids') as item(value);
  return jsonb_set(v_config, '{role_group_ids}', v_ids, true);
end;
$$;

revoke all on function public.fn_hugo_canonical_apply_config(jsonb) from public, anon, authenticated;
grant execute on function public.fn_hugo_canonical_apply_config(jsonb) to service_role;

create or replace function public.fn_hugo_request_payload_hash(
  p_operation_kind text,
  p_email_fingerprint text,
  p_role text,
  p_config jsonb,
  p_status text,
  p_access_expires_at jsonb,
  p_app_user_id text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'operation', p_operation_kind,
        'email_fingerprint', p_email_fingerprint,
        'role', p_role,
        'config', public.fn_hugo_canonical_apply_config(coalesce(p_config, '{}'::jsonb)),
        'status', p_status,
        'access_expires_at', coalesce(p_access_expires_at, 'null'::jsonb),
        'app_user_id', p_app_user_id
      )::text, 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.fn_hugo_request_payload_hash(text, text, text, jsonb, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.fn_hugo_request_payload_hash(text, text, text, jsonb, text, jsonb, text)
  to service_role;

-- Derive the same canonical request from a journal row.  This is used for
-- trigger binding and the one-time backfill of rows written by the original
-- migration.  Existing email values are already fingerprints; callers pass
-- raw email only through the insert trigger before the redaction trigger runs.
create or replace function public.fn_hugo_operation_request_hash(
  p_operation text,
  p_email_fingerprint text,
  p_input jsonb,
  p_receipt jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_requested jsonb := coalesce(p_receipt->'requested', '{}'::jsonb);
  v_kind text;
  v_role text;
  v_config jsonb;
  v_status text;
  v_expires jsonb;
  v_app_user_id text;
begin
  if p_operation in ('grant', 'suspend', 'reactivate', 'revoke') then
    v_kind := 'hugo_apply_access';
    v_role := case when v_input ? 'role' then v_input->>'role' else v_requested->>'role' end;
    v_config := case
      when v_input ? 'config' and jsonb_typeof(v_input->'config') <> 'null' then v_input->'config'
      else v_requested->'config'
    end;
    v_status := case when v_input ? 'status' then v_input->>'status' else v_requested->>'status' end;
    v_expires := case
      when v_input ? 'access_expires_at' then v_input->'access_expires_at'
      else v_requested->'access_expires_at'
    end;
    v_app_user_id := case
      when v_input ? 'app_user_id' then v_input->>'app_user_id'
      else p_receipt->>'app_user_id'
    end;
  elsif p_operation = 'preparePristineDelete' then
    v_kind := 'hugo_prepare_pristine_delete';
  elsif p_operation = 'deleteIdentity' then
    v_kind := 'hugo_delete_identity';
  else
    v_kind := p_operation;
  end if;

  return public.fn_hugo_request_payload_hash(
    v_kind,
    p_email_fingerprint,
    v_role,
    v_config,
    v_status,
    v_expires,
    v_app_user_id
  );
end;
$$;

revoke all on function public.fn_hugo_operation_request_hash(text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_hugo_operation_request_hash(text, text, jsonb, jsonb)
  to service_role;

-- Add the new column without copying the old 1,000-line RPC bodies.  Renaming
-- the originals preserves every guard and receipt branch; pg_get_functiondef
-- lets this migration replace only their five-value implicit journal inserts
-- with explicit columns, so the new NOT NULL hash column is always trigger-
-- populated.  The old names are private implementation details below.
alter function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text)
  rename to hugo_apply_access_unhashed;
alter function public.hugo_prepare_pristine_delete(uuid, text)
  rename to hugo_prepare_pristine_delete_unhashed;
alter function public.hugo_delete_identity(uuid, text)
  rename to hugo_delete_identity_unhashed;

do $$
declare
  v_source text;
begin
  v_source := pg_get_functiondef(
    'public.hugo_apply_access_unhashed(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure
  );
  v_source := replace(
    v_source,
    'insert into public.hugo_access_operations values (',
    'insert into public.hugo_access_operations(operation_id, operation, email, input, receipt) values ('
  );
  -- The original failure branches used an empty input object.  Preserve the
  -- caller's exact apply arguments (including a nullable p_app_user_id) so a
  -- failed request can be replayed without guessing from observed receipt
  -- fields such as the matched profile id.
  v_source := replace(
    v_source,
    ', p_email, ''{}''::jsonb, v_receipt)',
    ', p_email, jsonb_build_object(''role'', p_role, ''config'', public.fn_hugo_canonical_apply_config(p_config), ''status'', p_status, ''access_expires_at'', p_access_expires_at, ''app_user_id'', p_app_user_id), v_receipt)'
  );
  -- The successful branch mutates v_config for revoke operations.  Hash the
  -- caller's canonical config in the journal input instead, so every request
  -- argument remains bound even when the effective grant config is empty.
  v_source := replace(
    v_source,
    'jsonb_build_object(''role'', p_role, ''config'', v_config, ''status'', p_status,',
    'jsonb_build_object(''role'', p_role, ''config'', public.fn_hugo_canonical_apply_config(p_config), ''status'', p_status,'
  );
  if position('insert into public.hugo_access_operations values (' in v_source) > 0 then
    raise exception 'Hugo apply RPC still contains an implicit operation journal insert';
  end if;
  execute v_source;

  v_source := pg_get_functiondef(
    'public.hugo_prepare_pristine_delete_unhashed(uuid,text)'::regprocedure
  );
  v_source := replace(
    v_source,
    'insert into public.hugo_access_operations values (',
    'insert into public.hugo_access_operations(operation_id, operation, email, input, receipt) values ('
  );
  if position('insert into public.hugo_access_operations values (' in v_source) > 0 then
    raise exception 'Hugo prepare RPC still contains an implicit operation journal insert';
  end if;
  execute v_source;

  v_source := pg_get_functiondef(
    'public.hugo_delete_identity_unhashed(uuid,text)'::regprocedure
  );
  v_source := replace(
    v_source,
    'insert into public.hugo_access_operations values (',
    'insert into public.hugo_access_operations(operation_id, operation, email, input, receipt) values ('
  );
  if position('insert into public.hugo_access_operations values (' in v_source) > 0 then
    raise exception 'Hugo delete RPC still contains an implicit operation journal insert';
  end if;
  execute v_source;
end;
$$;

create or replace function public.fn_hugo_bind_operation_request_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.request_hash := public.fn_hugo_operation_request_hash(
    new.operation,
    public.fn_hugo_email_fingerprint(new.email),
    new.input,
    new.receipt
  );
  return new;
end;
$$;

revoke all on function public.fn_hugo_bind_operation_request_hash() from public, anon, authenticated;
grant execute on function public.fn_hugo_bind_operation_request_hash() to service_role;

drop trigger if exists hugo_access_operations_bind_request_hash on public.hugo_access_operations;
create trigger hugo_access_operations_bind_request_hash
before insert on public.hugo_access_operations
for each row execute function public.fn_hugo_bind_operation_request_hash();

-- Historical rows contain a redacted email fingerprint from the original
-- trigger.  Backfill from that fingerprint and the stored receipt/input, then
-- close the column so every future receipt is bound or the transaction fails.
update public.hugo_access_operations as operation_row
set request_hash = public.fn_hugo_operation_request_hash(
  operation_row.operation,
  operation_row.email,
  operation_row.input,
  operation_row.receipt
)
where operation_row.request_hash is null;

alter table public.hugo_access_operations
  add constraint hugo_access_operations_request_hash_format_check
  check (request_hash ~ '^[0-9a-f]{64}$');
alter table public.hugo_access_operations
  alter column request_hash set not null;

-- Frozen public RPC signatures now act as a replay/conflict gate in front of
-- the original guard-heavy implementations.  The conflict path only creates
-- a return value; it never inserts, updates, or deletes.
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0));
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_apply_access',
    public.fn_hugo_email_fingerprint(v_email),
    p_role,
    v_config,
    p_status,
    to_jsonb(p_access_expires_at),
    p_app_user_id
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, p_app_user_id, p_role, v_config, p_status, p_access_expires_at,
        null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused', 'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;

  return public.hugo_apply_access_unhashed(
    p_operation_id, p_email, p_role, p_config, p_status, p_access_expires_at, p_app_user_id
  );
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0));
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;
  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_prepare_pristine_delete',
    public.fn_hugo_email_fingerprint(v_email),
    null, '{}'::jsonb, null, null, null
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
        null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused', 'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;
  return public.hugo_prepare_pristine_delete_unhashed(p_operation_id, p_email);
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0));
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = 'invalid_parameter_value';
  end if;
  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_delete_identity',
    public.fn_hugo_email_fingerprint(v_email),
    null, '{}'::jsonb, null, null, null
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
        null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused', 'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;
  return public.hugo_delete_identity_unhashed(p_operation_id, p_email);
end;
$$;

revoke all on function public.hugo_apply_access_unhashed(uuid, text, text, jsonb, text, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.hugo_prepare_pristine_delete_unhashed(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.hugo_delete_identity_unhashed(uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.hugo_prepare_pristine_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.hugo_delete_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.hugo_apply_access(uuid, text, text, jsonb, text, timestamptz, text)
  to service_role;
grant execute on function public.hugo_prepare_pristine_delete(uuid, text) to service_role;
grant execute on function public.hugo_delete_identity(uuid, text) to service_role;

comment on column public.hugo_access_operations.request_hash is
  'SHA-256 binding of the canonical Hugo lifecycle request; raw email and secret config values are never retained.';

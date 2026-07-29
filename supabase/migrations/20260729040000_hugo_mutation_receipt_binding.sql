-- Bind every Institute lifecycle receipt to the exact operation and canonical
-- request hash. This forward migration preserves the frozen public RPC
-- signatures and backfills the existing journal without adding identity PII.

set lock_timeout = '10s';

create or replace function public.fn_hugo_bind_mutation_receipt(
  p_receipt jsonb,
  p_operation_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_operation_id is null then
    raise exception 'A bound Hugo receipt requires an operation id.'
      using errcode = '22023';
  end if;
  if p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A bound Hugo receipt requires a canonical request hash.'
      using errcode = '22023';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'A bound Hugo receipt must be a JSON object.'
      using errcode = '22023';
  end if;

  return p_receipt || jsonb_build_object(
    'operation_id', p_operation_id,
    'request_hash', p_request_hash
  );
end;
$$;

revoke all on function public.fn_hugo_bind_mutation_receipt(jsonb, uuid, text)
  from public, anon, authenticated, service_role;

-- Existing rows already contain the canonical hash in a dedicated column.
-- Copy only the operation id and hash into the immutable receipt envelope.
update public.hugo_access_operations as operation_row
set receipt = public.fn_hugo_bind_mutation_receipt(
  operation_row.receipt,
  operation_row.operation_id,
  operation_row.request_hash
)
where operation_row.receipt->>'operation_id'
        is distinct from operation_row.operation_id::text
   or operation_row.receipt->>'request_hash'
        is distinct from operation_row.request_hash;

alter table public.hugo_access_operations
  add constraint hugo_access_operations_receipt_binding_check
  check (
    receipt->>'operation_id' is not distinct from operation_id::text
    and receipt->>'request_hash' is not distinct from request_hash
  );

-- Supabase projects can grant service_role table writes through schema
-- defaults. Keep journal mutation behind the SECURITY DEFINER lifecycle RPCs
-- so callers cannot replace a bound hash and receipt together.
revoke insert, update, delete, truncate
  on public.hugo_access_operations
  from service_role;

-- The public wrapper computes the hash from the caller's original arguments.
-- Carry that value through a transaction-local context so private legacy code
-- cannot accidentally re-hash an effective value it changes during apply,
-- such as a suspended grant's inherited expiry.
create or replace function public.fn_hugo_bind_operation_request_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context_operation_id uuid;
  v_context_hash text;
begin
  begin
    v_context_operation_id :=
      nullif(current_setting('hugo.request_operation_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Hugo request operation context is invalid.'
      using errcode = '22023';
  end;
  v_context_hash :=
    nullif(current_setting('hugo.request_hash', true), '');

  if v_context_operation_id = new.operation_id then
    if v_context_hash is null or v_context_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'Hugo request hash context is invalid.'
        using errcode = '22023';
    end if;
    new.request_hash := v_context_hash;
  else
    new.request_hash := public.fn_hugo_operation_request_hash(
      new.operation,
      public.fn_hugo_email_fingerprint(new.email),
      new.input,
      new.receipt
    );
  end if;

  new.receipt := public.fn_hugo_bind_mutation_receipt(
    new.receipt,
    new.operation_id,
    new.request_hash
  );
  return new;
end;
$$;

revoke all on function public.fn_hugo_bind_operation_request_hash()
  from public, anon, authenticated, service_role;

drop trigger if exists hugo_access_operations_bind_request_hash
  on public.hugo_access_operations;
create trigger hugo_access_operations_bind_request_hash
before insert on public.hugo_access_operations
for each row execute function public.fn_hugo_bind_operation_request_hash();

create or replace function public.fn_hugo_bound_operation_receipt(
  p_operation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request_hash text;
  v_receipt jsonb;
begin
  select operation_row.request_hash, operation_row.receipt
  into v_request_hash, v_receipt
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;

  if not found then
    raise exception 'Hugo lifecycle operation did not persist a receipt.'
      using errcode = '55000';
  end if;
  if v_receipt->>'operation_id' is distinct from p_operation_id::text
     or v_receipt->>'request_hash' is distinct from v_request_hash
     or v_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hugo lifecycle operation persisted an unbound receipt.'
      using errcode = '55000';
  end if;
  return v_receipt;
end;
$$;

revoke all on function public.fn_hugo_bound_operation_receipt(uuid)
  from public, anon, authenticated, service_role;

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
    'hugo_apply_access',
    public.fn_hugo_email_fingerprint(v_email),
    p_role,
    v_config,
    p_status,
    to_jsonb(p_access_expires_at),
    p_app_user_id
  );
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

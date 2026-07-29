-- Postgres regression proof for forward receipt binding. The disposable
-- harness inserts one pre-migration journal row before applying migration 061.

begin;

set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_historical_id uuid := '00000000-0000-4000-8000-000000000961';
  v_apply_id uuid := gen_random_uuid();
  v_reactivate_id uuid := gen_random_uuid();
  v_prepare_id uuid := gen_random_uuid();
  v_delete_id uuid := gen_random_uuid();
  v_reactivate_user_id uuid :=
    '00000000-0000-4000-8000-000000000962';
  v_reactivate_email text :=
    'receipt-binding-reactivate@example.invalid';
  v_inherited_expiry timestamptz := '2030-01-01T00:00:00Z';
  v_first jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_stored jsonb;
  v_hash text;
  v_conflict_hash text;
  v_email text := 'receipt-binding@example.invalid';
  v_before_profiles bigint;
  v_before_grants bigint;
begin
  select receipt into v_stored
  from public.hugo_access_operations
  where operation_id = v_historical_id;
  assert found, 'the disposable harness must install a historical receipt';
  assert v_stored->>'operation_id' = v_historical_id::text,
    'historical receipt must be backfilled with its operation id';
  assert v_stored->>'request_hash' ~ '^[0-9a-f]{64}$',
    'historical receipt must be backfilled with its request hash';
  assert not (v_stored::text like '%historical-receipt@example.invalid%'),
    'historical receipt backfill must not add raw email PII';

  assert not exists (
    select 1
    from public.hugo_access_operations operation_row
    where operation_row.receipt->>'operation_id'
            is distinct from operation_row.operation_id::text
       or operation_row.receipt->>'request_hash'
            is distinct from operation_row.request_hash
  ), 'every historical journal receipt must be bound to its stored row';

  assert not has_table_privilege(
    'service_role',
    'public.hugo_access_operations',
    'insert'
  ) and not has_table_privilege(
    'service_role',
    'public.hugo_access_operations',
    'update'
  ) and not has_table_privilege(
    'service_role',
    'public.hugo_access_operations',
    'delete'
  ) and not has_table_privilege(
    'service_role',
    'public.hugo_access_operations',
    'truncate'
  ), 'service_role must not mutate the operation journal directly';
  assert not has_function_privilege(
    'service_role',
    'public.fn_hugo_bind_mutation_receipt(jsonb,uuid,text)',
    'execute'
  ) and not has_function_privilege(
    'service_role',
    'public.fn_hugo_bound_operation_receipt(uuid)',
    'execute'
  ) and not has_function_privilege(
    'service_role',
    'public.fn_hugo_bind_operation_request_hash()',
    'execute'
  ), 'service_role must not call private binding helpers directly';

  begin
    update public.hugo_access_operations
    set receipt = '{}'::jsonb
    where operation_id = v_historical_id;
    assert false,
      'the stored receipt constraint must reject a missing binding';
  exception when check_violation then
    null;
  end;

  select count(*) into v_before_profiles
  from public.profiles
  where lower(email) = lower(v_email);
  select count(*) into v_before_grants
  from public.hugo_access_grants
  where lower(email) = lower(v_email);

  v_first := public.hugo_apply_access(
    v_apply_id,
    v_email,
    'not-a-role',
    '{"token":"must-not-be-retained"}'::jsonb,
    'active',
    null,
    null
  );
  select request_hash, receipt into v_hash, v_stored
  from public.hugo_access_operations
  where operation_id = v_apply_id;
  assert v_first = v_stored,
    'apply first response must equal the stored bound receipt';
  assert v_first->>'operation_id' = v_apply_id::text,
    'apply response must contain the exact operation id';
  assert v_first->>'request_hash' = v_hash
         and v_hash ~ '^[0-9a-f]{64}$',
    'apply response must contain the canonical stored request hash';

  v_replay := public.hugo_apply_access(
    v_apply_id,
    v_email,
    'not-a-role',
    '{"token":"must-not-be-retained"}'::jsonb,
    'active',
    null,
    null
  );
  assert v_replay = v_first,
    'apply exact retry must return the identical bound receipt';

  v_conflict_hash := public.fn_hugo_request_payload_hash(
    'hugo_apply_access',
    public.fn_hugo_email_fingerprint(v_email),
    'learner',
    '{}'::jsonb,
    'active',
    null,
    null
  );
  v_conflict := public.hugo_apply_access(
    v_apply_id,
    v_email,
    'learner',
    '{}'::jsonb,
    'active',
    null,
    null
  );
  assert v_conflict->>'error_code' = 'operation_id_reused',
    'changed apply payload must return a safe conflict';
  assert v_conflict->>'operation_id' = v_apply_id::text
         and v_conflict->>'request_hash' = v_conflict_hash,
    'changed apply conflict must bind the attempted request';
  assert (select receipt from public.hugo_access_operations
          where operation_id = v_apply_id) = v_first,
    'changed apply request must not replace the stored receipt';
  assert (select count(*) from public.profiles
          where lower(email) = lower(v_email)) = v_before_profiles
         and (select count(*) from public.hugo_access_grants
              where lower(email) = lower(v_email)) = v_before_grants,
    'changed apply request must not mutate identity state';

  insert into auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_reactivate_user_id,
    v_reactivate_email,
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
  update public.profiles
  set system_role = 'learner',
      status = 'suspended'
  where id = v_reactivate_user_id;
  insert into public.hugo_access_grants (
    user_id,
    email,
    app_user_id,
    role,
    config,
    desired_status,
    access_expires_at
  ) values (
    v_reactivate_user_id,
    v_reactivate_email,
    v_reactivate_user_id::text,
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'suspended',
    v_inherited_expiry
  );

  v_first := public.hugo_apply_access(
    v_reactivate_id,
    v_reactivate_email,
    'learner',
    '{}'::jsonb,
    'active',
    null,
    v_reactivate_user_id::text
  );
  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_apply_access',
    public.fn_hugo_email_fingerprint(v_reactivate_email),
    'learner',
    '{}'::jsonb,
    'active',
    null,
    v_reactivate_user_id::text
  );
  assert v_first->>'request_hash' = v_hash,
    'apply must bind the original request before effective expiry inheritance';
  v_replay := public.hugo_apply_access(
    v_reactivate_id,
    v_reactivate_email,
    'learner',
    '{}'::jsonb,
    'active',
    null,
    v_reactivate_user_id::text
  );
  assert v_replay = v_first,
    'apply replay must remain exact when the private body inherits expiry';

  v_first := public.hugo_prepare_pristine_delete(v_prepare_id, v_email);
  select request_hash, receipt into v_hash, v_stored
  from public.hugo_access_operations
  where operation_id = v_prepare_id;
  assert v_first = v_stored
         and v_first->>'operation_id' = v_prepare_id::text
         and v_first->>'request_hash' = v_hash,
    'prepare first response must equal its bound stored receipt';
  v_replay := public.hugo_prepare_pristine_delete(v_prepare_id, v_email);
  assert v_replay = v_first,
    'prepare exact retry must return the identical bound receipt';
  v_conflict := public.hugo_prepare_pristine_delete(
    v_prepare_id,
    'different-receipt-binding@example.invalid'
  );
  assert v_conflict->>'error_code' = 'operation_id_reused'
         and v_conflict->>'operation_id' = v_prepare_id::text
         and v_conflict->>'request_hash' ~ '^[0-9a-f]{64}$',
    'changed prepare request must return a bound safe conflict';
  assert (select receipt from public.hugo_access_operations
          where operation_id = v_prepare_id) = v_first,
    'changed prepare request must not replace the stored receipt';

  v_first := public.hugo_delete_identity(v_delete_id, v_email);
  select request_hash, receipt into v_hash, v_stored
  from public.hugo_access_operations
  where operation_id = v_delete_id;
  assert v_first = v_stored
         and v_first->>'operation_id' = v_delete_id::text
         and v_first->>'request_hash' = v_hash,
    'delete first response must equal its bound stored receipt';
  v_replay := public.hugo_delete_identity(v_delete_id, v_email);
  assert v_replay = v_first,
    'delete exact retry must return the identical bound receipt';
  v_conflict := public.hugo_delete_identity(
    v_delete_id,
    'different-receipt-binding@example.invalid'
  );
  assert v_conflict->>'error_code' = 'operation_id_reused'
         and v_conflict->>'operation_id' = v_delete_id::text
         and v_conflict->>'request_hash' ~ '^[0-9a-f]{64}$',
    'changed delete request must return a bound safe conflict';
  assert (select receipt from public.hugo_access_operations
          where operation_id = v_delete_id) = v_first,
    'changed delete request must not replace the stored receipt';
end;
$$;

rollback;

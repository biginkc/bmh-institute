begin;

set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_preflight jsonb;
  v_conflict jsonb;
  v_profile_count bigint;
  v_grant_count bigint;
begin
  assert has_function_privilege(
    'service_role',
    'public.hugo_preflight_access_operation(uuid,text,text,jsonb,text,timestamptz)',
    'execute'
  ), 'service_role cannot execute Institute preflight';
  assert not has_function_privilege(
    'authenticated',
    'public.hugo_preflight_access_operation(uuid,text,text,jsonb,text,timestamptz)',
    'execute'
  ) and not has_function_privilege(
    'anon',
    'public.hugo_preflight_access_operation(uuid,text,text,jsonb,text,timestamptz)',
    'execute'
  ), 'browser roles can execute Institute preflight';
  assert not has_function_privilege(
    'service_role',
    'public.fn_hugo_apply_config_is_valid(jsonb)',
    'execute'
  ), 'service_role can directly execute the private config validator';
  assert not (
    has_table_privilege(
      'service_role',
      'private.hugo_access_operation_claims',
      'select'
    )
    or has_table_privilege(
      'service_role',
      'private.hugo_access_operation_claims',
      'insert'
    )
    or has_table_privilege(
      'authenticated',
      'private.hugo_access_operation_claims',
      'select'
    )
  ), 'preflight claims have direct role grants';
  assert not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'hugo_access_operation_claims'
      and column_name = 'app_user_id'
  ), 'preflight claims retained a live application user identifier';

  select count(*) into v_profile_count from public.profiles;
  select count(*) into v_grant_count from public.hugo_access_grants;

  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000977',
    'preflight-hugo@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  assert (v_preflight->>'proceed')::boolean,
    'valid Institute preflight did not reserve the request';
  assert v_preflight->>'request_hash' ~ '^[0-9a-f]{64}$',
    'Institute preflight did not return a canonical request hash';
  assert (select count(*) from public.profiles) = v_profile_count
     and (select count(*) from public.hugo_access_grants) = v_grant_count,
    'Institute preflight mutated profile or grant state';

  v_conflict := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000977',
    'preflight-hugo@example.invalid',
    'admin',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  assert not (v_conflict->>'proceed')::boolean,
    'changed-payload preflight was allowed to proceed';
  assert v_conflict#>>'{receipt,error_code}' = 'operation_id_reused',
    'changed-payload preflight returned the wrong conflict';
  assert (select count(*) from public.profiles) = v_profile_count
     and (select count(*) from public.hugo_access_grants) = v_grant_count,
    'changed-payload preflight mutated identity state';

  v_conflict := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000979',
    'invalid-config-hugo@example.invalid',
    'learner',
    '{"role_group_ids":["not-a-uuid"]}'::jsonb,
    'active',
    null
  );
  assert not (v_conflict->>'proceed')::boolean
     and v_conflict#>>'{receipt,error_code}' = 'invalid_request',
    'invalid Institute configuration passed preflight';
  assert not exists (
    select 1
    from private.hugo_access_operation_claims claim
    where claim.operation_id =
      '00000000-0000-4000-8000-000000000979'
  ), 'invalid Institute configuration reserved an operation';
  assert (select count(*) from public.profiles) = v_profile_count
     and (select count(*) from public.hugo_access_grants) = v_grant_count,
    'invalid configuration preflight mutated identity state';

  v_conflict := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000980',
    'missing-role-hugo@example.invalid',
    null,
    '{}'::jsonb,
    'active',
    null
  );
  assert not (v_conflict->>'proceed')::boolean
     and v_conflict#>>'{receipt,error_code}' = 'invalid_request',
    'missing Institute role passed preflight';

  v_conflict := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000981',
    'missing-status-hugo@example.invalid',
    'learner',
    '{}'::jsonb,
    null,
    null
  );
  assert not (v_conflict->>'proceed')::boolean
     and v_conflict#>>'{receipt,error_code}' = 'invalid_request',
    'missing Institute status passed preflight';
  assert not exists (
    select 1
    from private.hugo_access_operation_claims claim
    where claim.operation_id in (
      '00000000-0000-4000-8000-000000000980',
      '00000000-0000-4000-8000-000000000981'
    )
  ), 'missing required fields reserved an Institute operation';
  assert (select count(*) from public.profiles) = v_profile_count
     and (select count(*) from public.hugo_access_grants) = v_grant_count,
    'missing required fields mutated Institute identity state';
end;
$$;

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000982',
  'legacy-replay-hugo@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

do $$
declare
  v_receipt jsonb;
  v_preflight jsonb;
  v_profile_count bigint;
  v_grant_count bigint;
begin
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000983',
    'legacy-replay-hugo@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000982'
  );
  assert (v_receipt->>'ok')::boolean,
    'legacy-style Institute operation setup failed';
  assert not exists (
    select 1
    from private.hugo_access_operation_claims claim
    where claim.operation_id =
      '00000000-0000-4000-8000-000000000983'
  ), 'legacy-style Institute operation unexpectedly has a preflight claim';

  select count(*) into v_profile_count from public.profiles;
  select count(*) into v_grant_count from public.hugo_access_grants;
  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000983',
    'LEGACY-REPLAY-HUGO@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  assert not (v_preflight->>'proceed')::boolean
     and v_preflight->'receipt' = v_receipt
     and v_preflight->>'request_hash' = v_receipt->>'request_hash',
    'exact legacy Institute preflight did not replay its saved receipt';

  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000983',
    'legacy-replay-hugo@example.invalid',
    'admin',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  assert not (v_preflight->>'proceed')::boolean
     and v_preflight#>>'{receipt,error_code}' = 'operation_id_reused',
    'changed legacy Institute preflight did not conflict';
  assert (select count(*) from public.profiles) = v_profile_count
     and (select count(*) from public.hugo_access_grants) = v_grant_count,
    'legacy Institute preflight replay mutated identity state';
  assert (
    select grant_row.role = 'learner'
    from public.hugo_access_grants grant_row
    where grant_row.user_id =
      '00000000-0000-4000-8000-000000000982'
  ), 'changed legacy Institute preflight changed the existing grant';
end;
$$;

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000978',
  'preflight-hugo@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

do $$
declare
  v_preflight jsonb;
  v_receipt jsonb;
begin
  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000977',
    'preflight-hugo@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000977',
    'preflight-hugo@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000978'
  );
  assert (v_receipt->>'ok')::boolean,
    'preflighted Institute apply failed after verified Auth creation';
  assert v_receipt->>'request_hash' = v_preflight->>'request_hash',
    'apply receipt did not preserve the preflight request hash';
  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000000977',
    'preflight-hugo@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null
  );
  assert not (v_preflight->>'proceed')::boolean
     and v_preflight->'receipt' = v_receipt,
    'completed exact preflight did not replay the saved receipt';
end;
$$;

insert into auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000971',
  'unverified-hugo@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

do $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000972',
    'UNVERIFIED-HUGO@example.invalid',
    'learner',
    '{}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000971'
  );
  assert not (v_receipt->>'ok')::boolean,
    'unverified Auth identity received active Institute access';
  assert v_receipt->>'error_code' = 'identity_unverified',
    'unverified Auth identity returned the wrong refusal';
  assert not exists (
    select 1
    from public.hugo_access_grants grant_row
    where grant_row.user_id = '00000000-0000-4000-8000-000000000971'
  ), 'unverified refusal still created a Hugo grant';
  assert v_receipt->>'operation_id' =
    '00000000-0000-4000-8000-000000000972',
    'unverified refusal was not operation-bound';
  assert v_receipt->>'request_hash' ~ '^[0-9a-f]{64}$',
    'unverified refusal was not request-hash-bound';

  update auth.users
  set email_confirmed_at = now()
  where id = '00000000-0000-4000-8000-000000000971';

  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000973',
    'unverified-hugo@example.invalid',
    'learner',
    '{}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000971'
  );
  assert (v_receipt->>'ok')::boolean,
    'verified Auth identity could not receive active Institute access';
end;
$$;

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000974',
  'profileless-hugo@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
delete from public.profiles
where id = '00000000-0000-4000-8000-000000000974';

do $$
declare
  v_prepare jsonb;
  v_delete jsonb;
begin
  v_prepare := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000975',
    'profileless-hugo@example.invalid'
  );
  assert not (v_prepare->>'ok')::boolean,
    'profile-less Auth identity was reported prepared';
  assert v_prepare->>'error_code' = 'identity_profile_missing',
    'profile-less prepare returned the wrong refusal';

  v_delete := public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000976',
    'PROFILELESS-HUGO@example.invalid'
  );
  assert not (v_delete->>'ok')::boolean,
    'profile-less Auth identity was reported deleted';
  assert v_delete->>'error_code' = 'identity_profile_missing',
    'profile-less delete returned the wrong refusal';
  assert exists (
    select 1
    from auth.users auth_user
    where auth_user.id = '00000000-0000-4000-8000-000000000974'
  ), 'fail-closed profile-less delete unexpectedly removed Auth state';
  assert public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000976',
    'profileless-hugo@example.invalid'
  ) = v_delete, 'profile-less delete exact replay changed its receipt';
end;
$$;

rollback;

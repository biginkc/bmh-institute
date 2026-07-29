-- Behavioral proof for the final post-merge Hugo security closures.

begin;

do $$
begin
  assert not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ), 'a public Institute table still has RLS disabled';
end;
$$;

set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000001301',
    'expired-rpc-closure@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000001311',
    'owner-a-closure@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000001312',
    'owner-b-closure@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set system_role = 'owner',
    status = 'active'
where id in (
  '00000000-0000-4000-8000-000000001311',
  '00000000-0000-4000-8000-000000001312'
);

do $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001302',
    'expired-rpc-closure@example.invalid',
    'learner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    now() - interval '1 minute',
    '00000000-0000-4000-8000-000000001301'
  );
  assert (v_receipt->>'ok')::boolean,
    'expired lesson-state fixture could not create its grant';

  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001313',
    'owner-a-closure@example.invalid',
    'owner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000001311'
  );
  assert (v_receipt->>'ok')::boolean,
    'first final-owner receipt fixture grant failed';
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001314',
    'owner-b-closure@example.invalid',
    'owner',
    '{"role_group_ids":[]}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000001312'
  );
  assert (v_receipt->>'ok')::boolean,
    'second final-owner receipt fixture grant failed';
end;
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub =
  '00000000-0000-4000-8000-000000001301';

do $$
begin
  begin
    perform public.fn_learner_lesson_states_v1(
      '00000000-0000-4000-8000-000000001321',
      array['00000000-0000-4000-8000-000000001322'::uuid]
    );
    assert false, 'expired learner reached the privileged lesson-state RPC';
  exception when insufficient_privilege then
    assert sqlerrm =
      'Learner lesson states require active Hugo access.',
      'expired learner failed for the wrong reason';
  end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';

do $$
declare
  v_preflight jsonb;
  v_receipt jsonb;
  v_retry jsonb;
begin
  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001315',
    'owner-b-closure@example.invalid',
    'owner',
    '{}'::jsonb,
    'suspended',
    null,
    '00000000-0000-4000-8000-000000001312'
  );
  assert (v_receipt->>'ok')::boolean,
    'final-owner receipt fixture could not suspend the peer owner';

  v_preflight := public.hugo_preflight_access_operation(
    '00000000-0000-4000-8000-000000001316',
    'owner-a-closure@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    '2099-01-01 00:00:00+00'::timestamptz
  );
  assert (v_preflight->>'proceed')::boolean,
    'sole-owner expiry preflight was not reserved';

  v_receipt := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001316',
    'owner-a-closure@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    '2099-01-01 00:00:00+00'::timestamptz,
    '00000000-0000-4000-8000-000000001311'
  );
  assert not (v_receipt->>'ok')::boolean
     and v_receipt->>'error_code' = 'final_owner_guard'
     and v_receipt->>'request_hash' = v_preflight->>'request_hash',
    'sole-owner trigger failure did not become a bound terminal receipt';

  v_retry := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000001316',
    'owner-a-closure@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    '2099-01-01 00:00:00+00'::timestamptz,
    '00000000-0000-4000-8000-000000001311'
  );
  assert v_retry = v_receipt,
    'exact sole-owner failure retry did not replay the saved receipt';
  assert exists (
    select 1
    from public.hugo_access_operations operation_row
    where operation_row.operation_id =
      '00000000-0000-4000-8000-000000001316'
      and operation_row.receipt = v_receipt
      and operation_row.request_hash = v_receipt->>'request_hash'
  ), 'sole-owner failure was not durably journaled';
  assert exists (
    select 1
    from private.hugo_access_operation_claims claim
    where claim.operation_id =
      '00000000-0000-4000-8000-000000001316'
      and claim.consumed_at is not null
  ), 'sole-owner failure left its preflight claim live';
  assert (
    select grant_row.access_expires_at is null
    from public.hugo_access_grants grant_row
    where grant_row.user_id =
      '00000000-0000-4000-8000-000000001311'
  ), 'blocked sole-owner expiry changed the grant';
end;
$$;

rollback;

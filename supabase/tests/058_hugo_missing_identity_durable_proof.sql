-- Missing Institute profiles are safe idempotent lifecycle successes only
-- after durable activity has been checked through every matching Auth identity.
-- The transaction is rolled back, so no identity or journal row survives.

begin;

set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_helper_definition text;
  v_prepare_definition text;
  v_delete_definition text;
begin
  assert to_regprocedure(
    'public.fn_hugo_email_has_durable_activity(text)'
  ) is not null, 'email-keyed durable-activity helper is missing';
  assert not has_function_privilege(
    'service_role',
    'public.fn_hugo_email_has_durable_activity(text)',
    'execute'
  ), 'email-keyed durable-activity helper must remain private';

  v_helper_definition := pg_get_functiondef(
    'public.fn_hugo_email_has_durable_activity(text)'::regprocedure
  );
  assert position('from auth.users auth_user' in lower(v_helper_definition)) > 0,
    'durable-activity helper does not resolve Auth identities by email';
  assert position('for update' in lower(v_helper_definition)) > 0,
    'durable-activity helper does not lock matching Auth identities';
  assert position(
    'public.fn_hugo_has_durable_activity(v_user_id)'
    in lower(v_helper_definition)
  ) > 0, 'email-resolved Auth identities do not use the complete durable guard';

  v_prepare_definition := pg_get_functiondef(
    'public.hugo_prepare_pristine_delete_unhashed(uuid,text)'::regprocedure
  );
  v_delete_definition := pg_get_functiondef(
    'public.hugo_delete_identity_unhashed(uuid,text)'::regprocedure
  );
  assert (
    length(v_prepare_definition) -
    length(replace(
      v_prepare_definition,
      'v_durable := public.fn_hugo_email_has_durable_activity(p_email)',
      ''
    ))
  ) / length(
    'v_durable := public.fn_hugo_email_has_durable_activity(p_email)'
  ) = 1, 'prepare private body does not have exactly one email durable check';
  assert (
    length(v_delete_definition) -
    length(replace(
      v_delete_definition,
      'v_durable := public.fn_hugo_email_has_durable_activity(p_email)',
      ''
    ))
  ) / length(
    'v_durable := public.fn_hugo_email_has_durable_activity(p_email)'
  ) = 1, 'delete private body does not have exactly one email durable check';
end;
$$;

do $$
declare
  v_prepare_id uuid := '00000000-0000-4000-8000-000000000401';
  v_delete_id uuid := '00000000-0000-4000-8000-000000000402';
  v_prepare_receipt jsonb;
  v_delete_receipt jsonb;
  v_replay jsonb;
begin
  v_prepare_receipt := public.hugo_prepare_pristine_delete(
    v_prepare_id,
    'never-provisioned@example.invalid'
  );
  assert (v_prepare_receipt->>'ok')::boolean,
    'missing never-provisioned prepare must be idempotent success';
  assert v_prepare_receipt#>>'{observed,status}' = 'missing',
    'missing never-provisioned prepare must report missing';
  assert (v_prepare_receipt#>>'{observed,has_durable_activity}')::boolean = false,
    'missing never-provisioned prepare must prove no durable activity';
  assert v_prepare_receipt->>'error_code' is null,
    'safe missing prepare must not report an error';

  v_replay := public.hugo_prepare_pristine_delete(
    v_prepare_id,
    'NEVER-PROVISIONED@example.invalid'
  );
  assert v_replay = v_prepare_receipt,
    'exact normalized prepare replay must return the stored receipt';
  assert public.hugo_prepare_pristine_delete(
    v_prepare_id,
    'changed@example.invalid'
  )->>'error_code' = 'operation_id_reused',
    'changed prepare replay must preserve the request-hash conflict';

  v_delete_receipt := public.hugo_delete_identity(
    v_delete_id,
    'never-provisioned@example.invalid'
  );
  assert (v_delete_receipt->>'ok')::boolean,
    'missing never-provisioned delete must be idempotent success';
  assert v_delete_receipt#>>'{observed,status}' = 'missing',
    'missing never-provisioned delete must report missing';
  assert (v_delete_receipt#>>'{observed,has_durable_activity}')::boolean = false,
    'missing never-provisioned delete must prove no durable activity';
  assert v_delete_receipt->>'error_code' is null,
    'safe missing delete must not report an error';

  v_replay := public.hugo_delete_identity(
    v_delete_id,
    'NEVER-PROVISIONED@example.invalid'
  );
  assert v_replay = v_delete_receipt,
    'exact normalized delete replay must return the stored receipt';
  assert public.hugo_delete_identity(
    v_delete_id,
    'changed@example.invalid'
  )->>'error_code' = 'operation_id_reused',
    'changed delete replay must preserve the request-hash conflict';
end;
$$;

-- A successful delete followed by new lifecycle operation ids must remain a
-- safe missing/false/ok retry.
insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000403',
  'already-deleted@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

do $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000404',
    'already-deleted@example.invalid'
  );
  assert (v_receipt->>'ok')::boolean,
    'pristine fixture did not prepare for deletion';

  v_receipt := public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000405',
    'already-deleted@example.invalid'
  );
  assert (v_receipt->>'ok')::boolean,
    'pristine fixture did not delete';
  assert not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = '00000000-0000-4000-8000-000000000403'
  ), 'successful delete left the Auth identity behind';

  v_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000406',
    'already-deleted@example.invalid'
  );
  assert (v_receipt->>'ok')::boolean
    and v_receipt#>>'{observed,status}' = 'missing'
    and (v_receipt#>>'{observed,has_durable_activity}')::boolean = false,
    'already-deleted prepare retry was not missing/false/ok';

  v_receipt := public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000407',
    'already-deleted@example.invalid'
  );
  assert (v_receipt->>'ok')::boolean
    and v_receipt#>>'{observed,status}' = 'missing'
    and (v_receipt#>>'{observed,has_durable_activity}')::boolean = false,
    'already-deleted delete retry was not missing/false/ok';
end;
$$;

-- The profile row can be absent while Auth or storage still proves durable
-- activity. Prepare and delete must each resolve the email independently and
-- fail closed without removing the surviving Auth identity.
insert into auth.users (
  id, email, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000408',
  'missing-signed-in@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
delete from public.profiles
where id = '00000000-0000-4000-8000-000000000408';

insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000409',
  'missing-stored-submission@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into storage.objects (bucket_id, name, owner)
values (
  'submissions',
  '00000000-0000-4000-8000-000000000409/pending.webm',
  null
);
delete from public.profiles
where id = '00000000-0000-4000-8000-000000000409';

do $$
declare
  v_prepare_receipt jsonb;
  v_delete_receipt jsonb;
begin
  v_prepare_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000410',
    'MISSING-SIGNED-IN@example.invalid'
  );
  assert not (v_prepare_receipt->>'ok')::boolean,
    'missing prepare with Auth sign-in evidence did not fail closed';
  assert v_prepare_receipt#>>'{observed,status}' = 'missing',
    'missing prepare with evidence did not preserve missing status';
  assert (v_prepare_receipt#>>'{observed,has_durable_activity}')::boolean,
    'missing prepare did not report email-resolved durable evidence';
  assert v_prepare_receipt->>'error_code' = 'identity_not_pristine',
    'missing prepare with evidence returned the wrong error';

  v_delete_receipt := public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000411',
    'MISSING-STORED-SUBMISSION@example.invalid'
  );
  assert not (v_delete_receipt->>'ok')::boolean,
    'missing delete with owned storage evidence did not fail closed';
  assert v_delete_receipt#>>'{observed,status}' = 'missing',
    'missing delete with evidence did not preserve missing status';
  assert (v_delete_receipt#>>'{observed,has_durable_activity}')::boolean,
    'missing delete did not report email-resolved durable evidence';
  assert v_delete_receipt->>'error_code' = 'identity_not_pristine',
    'missing delete with evidence returned the wrong error';

  assert (
    select count(*)
    from auth.users auth_user
    where auth_user.id in (
      '00000000-0000-4000-8000-000000000408',
      '00000000-0000-4000-8000-000000000409'
    )
  ) = 2, 'evidence-present missing lifecycle calls removed an Auth identity';
end;
$$;

rollback;

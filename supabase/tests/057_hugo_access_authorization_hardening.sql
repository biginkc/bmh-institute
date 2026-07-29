-- Behavioral regression coverage for the dormant-to-strict Hugo cutover,
-- real authenticated JWT policy paths, owner invariants, and pristine delete.

begin;

do $$
declare
  v_expected_references text[] := array[
    'public.assignment_submissions.reviewed_by',
    'public.assignment_submissions.user_id',
    'public.audit_log.user_id',
    'public.certificates.user_id',
    'public.course_import_reviewer_answer_options_v1.reviewer_user_id',
    'public.course_import_reviewers_v1.granted_by',
    'public.course_import_reviewers_v1.user_id',
    'public.invites.invited_by',
    'public.program_certificates.user_id',
    'public.role_play_results.user_id',
    'public.sandra_course_completion_deliveries.user_id',
    'public.user_block_progress.user_id',
    'public.user_course_resume.user_id',
    'public.user_lesson_completions.user_id',
    'public.user_quiz_attempts.user_id',
    'public.user_video_completion_history.user_id',
    'public.user_video_progress.user_id'
  ]::text[];
  v_actual_references text[];
begin
  assert (
    select not setting.enforce_grants
    from public.hugo_access_settings setting
    where setting.singleton
  ), 'strict Hugo grant enforcement must remain dormant by default';

  assert not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
      and not exists (
        select 1
        from pg_catalog.pg_policy policy
        where policy.polrelid = relation.oid
          and policy.polname = 'hugo_active_authenticated_gate'
          and not policy.polpermissive
          and (
            select authenticated.oid
            from pg_catalog.pg_roles authenticated
            where authenticated.rolname = 'authenticated'
          ) = any(policy.polroles)
      )
  ), 'a public RLS table is missing the restrictive Hugo access gate';

  assert exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'storage.objects'::regclass
      and policy.polname = 'hugo_active_authenticated_gate'
      and not policy.polpermissive
  ), 'storage.objects is missing the restrictive Hugo access gate';

  assert not has_function_privilege(
    'authenticated',
    'public.hugo_set_access_enforcement(uuid,boolean)',
    'execute'
  ), 'authenticated must not be able to flip strict enforcement';
  assert has_function_privilege(
    'service_role',
    'public.hugo_set_access_enforcement(uuid,boolean)',
    'execute'
  ), 'service_role must be able to use the audited enforcement RPC';
  assert not (
    has_table_privilege('service_role', 'public.hugo_access_grants', 'insert')
    or has_table_privilege('service_role', 'public.hugo_access_grants', 'update')
    or has_table_privilege('service_role', 'public.hugo_access_grants', 'delete')
    or has_table_privilege('service_role', 'public.hugo_access_grants', 'truncate')
  ), 'service_role must mutate grants only through lifecycle RPCs';

  select array_agg(reference_key order by reference_key)
  into v_actual_references
  from (
    select
      child_namespace.nspname || '.' ||
      child_relation.relname || '.' ||
      child_attribute.attname as reference_key
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class parent_relation
      on parent_relation.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace parent_namespace
      on parent_namespace.oid = parent_relation.relnamespace
    join pg_catalog.pg_class child_relation
      on child_relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace child_namespace
      on child_namespace.oid = child_relation.relnamespace
    join unnest(constraint_row.conkey) with ordinality
      as child_key(attnum, position) on true
    join unnest(constraint_row.confkey) with ordinality
      as parent_key(attnum, position)
      on parent_key.position = child_key.position
    join pg_catalog.pg_attribute child_attribute
      on child_attribute.attrelid = child_relation.oid
      and child_attribute.attnum = child_key.attnum
    join pg_catalog.pg_attribute parent_attribute
      on parent_attribute.attrelid = parent_relation.oid
      and parent_attribute.attnum = parent_key.attnum
    where constraint_row.contype = 'f'
      and parent_namespace.nspname = 'public'
      and parent_relation.relname = 'profiles'
      and parent_attribute.attname = 'id'
      and child_namespace.nspname = 'public'
      and (
        child_namespace.nspname || '.' ||
        child_relation.relname || '.' ||
        child_attribute.attname
      ) not in (
        'public.user_role_groups.user_id',
        'public.hugo_access_grants.user_id'
      )
  ) references_now;
  assert v_actual_references = v_expected_references,
    'the deterministic durable profile-reference matrix drifted';
end;
$$;

set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000101', 'owner@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'active@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000103', 'legacy@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000104', 'suspended@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000105', 'revoked@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000106', 'expired@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000107', 'prepared@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000109', 'owner-two@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set system_role = 'owner', status = 'active'
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000109'
);

insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status,
  access_expires_at, prepared_for_delete
) values
  ('00000000-0000-4000-8000-000000000101', 'owner@example.invalid', '00000000-0000-4000-8000-000000000101', 'owner', 'active', null, false),
  ('00000000-0000-4000-8000-000000000102', 'active@example.invalid', '00000000-0000-4000-8000-000000000102', 'learner', 'active', now() + interval '1 day', false),
  ('00000000-0000-4000-8000-000000000104', 'suspended@example.invalid', '00000000-0000-4000-8000-000000000104', 'learner', 'suspended', null, false),
  ('00000000-0000-4000-8000-000000000105', 'revoked@example.invalid', '00000000-0000-4000-8000-000000000105', null, 'revoked', null, false),
  ('00000000-0000-4000-8000-000000000106', 'expired@example.invalid', '00000000-0000-4000-8000-000000000106', 'learner', 'active', now() - interval '1 minute', false),
  ('00000000-0000-4000-8000-000000000107', 'prepared@example.invalid', '00000000-0000-4000-8000-000000000107', 'learner', 'active', null, true),
  ('00000000-0000-4000-8000-000000000109', 'owner-two@example.invalid', '00000000-0000-4000-8000-000000000109', 'owner', 'active', null, false);

do $$
begin
  assert public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000101'),
    'active owner grant must be usable while dormant';
  assert public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000102'),
    'active learner grant must be usable while dormant';
  assert public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000103'),
    'legacy no-row profile must remain usable while dormant';
  assert not public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000104'),
    'suspended grant must deny while dormant';
  assert not public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000105'),
    'revoked grant must deny while dormant';
  assert not public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000106'),
    'expired grant must deny while dormant';
  assert not public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000107'),
    'delete-prepared grant must deny while dormant';
end;
$$;

-- Direct harmful owner-grant mutation must be rejected before it can race.
do $$
begin
  begin
    delete from public.hugo_access_grants
    where user_id = '00000000-0000-4000-8000-000000000101';
    assert false, 'direct owner grant deletion unexpectedly succeeded';
  exception when insufficient_privilege then
    assert sqlerrm =
      'Hugo owner grants must be changed through a lifecycle RPC.',
      'direct owner grant deletion failed for the wrong reason';
  end;
end;
$$;

-- Dormant mode tolerates only a genuinely absent grant. A row connected by
-- either identity key must match the profile exactly or deny both identities.
do $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );

  update public.hugo_access_grants
  set email = 'legacy@example.invalid'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'dormant mode accepted a grant with a mismatched profile email';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000103'
  ), 'dormant fallback ignored a mismatched grant connected by email';

  update public.hugo_access_grants
  set email = 'active@example.invalid',
      app_user_id = 'wrong-app-user-id'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'dormant mode accepted a mismatched app_user_id';

  update public.hugo_access_grants
  set app_user_id = '00000000-0000-4000-8000-000000000102'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'restored exact dormant grant did not become usable';
  assert public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000103'
  ), 'restored no-row dormant identity did not become usable';
end;
$$;

set local role authenticated;
set local request.jwt.claim.role = '';

do $$
declare
  v_changed integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
    true
  );
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  assert (select count(*) from public.profiles where id = auth.uid()) = 1,
    'active real JWT must read its protected profile';
  update public.profiles
  set full_name = 'Active JWT write'
  where id = auth.uid();
  get diagnostics v_changed = row_count;
  assert v_changed = 1, 'active real JWT must write its allowed profile fields';
  insert into storage.objects (bucket_id, name, owner)
  values ('submissions', auth.uid()::text || '/active.txt', auth.uid());

  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
    true
  );
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
  assert (select count(*) from public.profiles where id = auth.uid()) = 1,
    'legacy real JWT must read while strict enforcement is dormant';
  insert into storage.objects (bucket_id, name, owner)
  values ('submissions', auth.uid()::text || '/legacy.txt', auth.uid());

  foreach v_changed in array array[104, 105, 106, 107]
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub',
        '00000000-0000-4000-8000-' || lpad(v_changed::text, 12, '0'),
        'role',
        'authenticated'
      )::text,
      true
    );
    perform set_config(
      'request.jwt.claim.sub',
      '00000000-0000-4000-8000-' || lpad(v_changed::text, 12, '0'),
      true
    );
    assert (select count(*) from public.profiles where id = auth.uid()) = 0,
      'non-usable grant must deny its real JWT profile read';
    update public.profiles
    set full_name = full_name
    where id = auth.uid();
    get diagnostics v_changed = row_count;
    assert v_changed = 0,
      'non-usable grant must deny its real JWT profile write';
    begin
      insert into storage.objects (bucket_id, name, owner)
      values (
        'submissions',
        auth.uid()::text || '/denied.txt',
        auth.uid()
      );
      assert false, 'non-usable grant unexpectedly wrote storage';
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"service_role"}';

-- The frozen lifecycle RPC may mutate a non-final owner because it acquires
-- both required locks before the grant statement. The remaining final owner
-- still fails with a normalized receipt.
do $$
declare
  v_allowed jsonb;
  v_blocked jsonb;
begin
  v_allowed := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000203',
    'owner-two@example.invalid',
    'owner',
    '{}'::jsonb,
    'suspended',
    null,
    '00000000-0000-4000-8000-000000000109'
  );
  assert (v_allowed->>'ok')::boolean,
    'lifecycle RPC failed to suspend a non-final owner';

  v_blocked := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000204',
    'owner@example.invalid',
    'owner',
    '{}'::jsonb,
    'suspended',
    null,
    '00000000-0000-4000-8000-000000000101'
  );
  assert v_blocked->>'error_code' = 'final_owner_guard',
    'lifecycle RPC did not preserve the final usable owner';
  assert public.fn_hugo_owner_is_usable(
    '00000000-0000-4000-8000-000000000101'
  ), 'final usable owner changed after blocked lifecycle RPC';

  v_allowed := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000209',
    'owner-two@example.invalid',
    'owner',
    '{"role_group_ids":[],"test":"future-expiring-peer"}'::jsonb,
    'active',
    now() + interval '2 days',
    '00000000-0000-4000-8000-000000000109'
  );
  assert (v_allowed->>'ok')::boolean,
    'lifecycle RPC failed to restore a future-expiring peer owner';
  assert not public.fn_hugo_owner_is_usable(
    '00000000-0000-4000-8000-000000000109'
  ), 'future-expiring peer was counted as a safety owner';

  begin
    perform public.hugo_apply_access(
      '00000000-0000-4000-8000-000000000210',
      'owner@example.invalid',
      'owner',
      '{}'::jsonb,
      'suspended',
      null,
      '00000000-0000-4000-8000-000000000101'
    );
    assert false, 'sole non-expiring owner was suspended behind an expiring peer';
  exception when check_violation then
    assert sqlerrm = 'Cannot remove the final usable Institute owner.',
      'expiring-peer owner guard failed for the wrong reason';
  end;

  begin
    perform public.hugo_apply_access(
      '00000000-0000-4000-8000-000000000205',
      'owner@example.invalid',
      'owner',
      '{}'::jsonb,
      'active',
      now() + interval '1 day',
      '00000000-0000-4000-8000-000000000101'
    );
    assert false, 'sole non-expiring owner unexpectedly received an expiry';
  exception when check_violation then
    assert sqlerrm =
      'Cannot remove the final usable Institute owner grant.',
      'sole-owner expiry failed for the wrong reason';
  end;
  assert (
    select grant_row.access_expires_at is null
    from public.hugo_access_grants grant_row
    where grant_row.user_id =
      '00000000-0000-4000-8000-000000000101'
  ), 'blocked sole-owner expiry mutated the grant';

  v_allowed := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000206',
    'owner-two@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000109'
  );
  assert (v_allowed->>'ok')::boolean,
    'lifecycle RPC failed to restore a non-expiring peer owner';

  v_allowed := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000207',
    'owner@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    now() + interval '1 day',
    '00000000-0000-4000-8000-000000000101'
  );
  assert (v_allowed->>'ok')::boolean,
    'owner expiry was blocked despite a non-expiring peer owner';
  assert not public.fn_hugo_owner_is_usable(
    '00000000-0000-4000-8000-000000000101'
  ), 'future-expiring owner was counted as the non-expiring safety owner';
  assert public.fn_hugo_owner_is_usable(
    '00000000-0000-4000-8000-000000000109'
  ), 'non-expiring peer owner was not counted';

  v_allowed := public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000208',
    'owner@example.invalid',
    'owner',
    '{}'::jsonb,
    'active',
    null,
    '00000000-0000-4000-8000-000000000101'
  );
  assert (v_allowed->>'ok')::boolean,
    'lifecycle RPC failed to remove the test owner expiry';
end;
$$;

-- Complete the one intentional legacy row before the strict cutover.
insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status
) values (
  '00000000-0000-4000-8000-000000000103',
  'legacy@example.invalid',
  '00000000-0000-4000-8000-000000000103',
  'learner',
  'active'
);

select public.hugo_set_access_enforcement(
  '00000000-0000-4000-8000-000000000201',
  true
);

do $$
begin
  assert (
    select setting.enforce_grants
    from public.hugo_access_settings setting
    where setting.singleton
  ), 'audited RPC did not enable strict enforcement';
  assert exists (
    select 1
    from public.hugo_access_enforcement_changes change_row
    where change_row.operation_id = '00000000-0000-4000-8000-000000000201'
      and not change_row.previous_enforce_grants
      and change_row.enforce_grants
  ), 'strict enforcement change was not audited';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000104'
  ), 'suspended grant must remain denied in strict mode';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000105'
  ), 'revoked grant must remain denied in strict mode';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000106'
  ), 'expired grant must remain denied in strict mode';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000107'
  ), 'delete-prepared grant must remain denied in strict mode';

  update public.hugo_access_grants
  set app_user_id = 'wrong-app-user-id'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'strict mode accepted a mismatched app_user_id';

  update public.hugo_access_grants
  set app_user_id = '00000000-0000-4000-8000-000000000102',
      email = 'wrong-active@example.invalid'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert not public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'strict mode accepted a mismatched profile email';

  update public.hugo_access_grants
  set email = 'active@example.invalid'
  where user_id = '00000000-0000-4000-8000-000000000102';
  assert public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000102'
  ), 'restored exact strict grant did not become usable';
end;
$$;

-- A new no-row profile after the completed cutover must fail closed.
insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000108',
  'strict-no-row@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000108';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000108","role":"authenticated"}';

do $$
begin
  assert (select count(*) from public.profiles where id = auth.uid()) = 0,
    'strict enforcement must deny a no-row real JWT';
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('submissions', auth.uid()::text || '/strict.txt', auth.uid());
    assert false, 'strict no-row JWT unexpectedly wrote storage';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"service_role"}';
select public.hugo_set_access_enforcement(
  '00000000-0000-4000-8000-000000000202',
  false
);

-- Auth sign-in alone makes an otherwise unreferenced identity non-pristine.
insert into auth.users (
  id, email, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000301',
  'signed-in@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status
) values (
  '00000000-0000-4000-8000-000000000301',
  'signed-in@example.invalid',
  '00000000-0000-4000-8000-000000000301',
  'learner',
  'active'
);

do $$
declare
  v_receipt jsonb;
begin
  assert public.fn_hugo_has_durable_activity(
    '00000000-0000-4000-8000-000000000301'
  ), 'Auth last_sign_in_at must make an identity non-pristine';
  v_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000302',
    'signed-in@example.invalid'
  );
  assert v_receipt->>'error_code' = 'identity_not_pristine',
    'prepare pristine delete ignored Auth sign-in history';
end;
$$;

-- A submission object is durable even before its database submission row
-- exists. The first storage path segment is the owning profile identifier.
insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000305',
  'stored-submission@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status
) values (
  '00000000-0000-4000-8000-000000000305',
  'stored-submission@example.invalid',
  '00000000-0000-4000-8000-000000000305',
  'learner',
  'active'
);
insert into storage.objects (bucket_id, name, owner)
values (
  'submissions',
  '00000000-0000-4000-8000-000000000305/pending.webm',
  null
);

do $$
declare
  v_receipt jsonb;
begin
  assert public.fn_hugo_has_durable_activity(
    '00000000-0000-4000-8000-000000000305'
  ), 'owned submission storage path must make an identity non-pristine';
  v_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000306',
    'stored-submission@example.invalid'
  );
  assert v_receipt->>'error_code' = 'identity_not_pristine',
    'prepare pristine delete ignored an owned submission object';
end;
$$;

-- Preparation can succeed while pristine, but deletion must lock Auth and
-- recheck after a sign-in that commits between the two lifecycle calls.
insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000307',
  'sign-in-after-prepare@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status
) values (
  '00000000-0000-4000-8000-000000000307',
  'sign-in-after-prepare@example.invalid',
  '00000000-0000-4000-8000-000000000307',
  'learner',
  'active'
);

do $$
declare
  v_after text :=
    '  perform 1
  from auth.users auth_user
  where auth_user.id = v_profile.id
  for update;
  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);';
  v_after_count integer;
  v_before text :=
    '  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);';
  v_before_count integer;
  v_definition text;
  v_definition_after text;
  v_receipt jsonb;
begin
  select pg_get_functiondef(procedure_row.oid)
  into v_definition
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'hugo_delete_identity_unhashed';
  assert position('from auth.users auth_user' in lower(v_definition)) > 0,
    'delete identity does not lock the Auth row';
  assert position('from auth.users auth_user' in lower(v_definition)) <
    position(
      'v_durable := public.fn_hugo_has_durable_activity(v_profile.id)'
      in lower(v_definition)
    ), 'delete identity locks Auth after the final durable recheck';

  -- Replay the migration's shape-aware patch step. Because the migration
  -- already installed the block, a second pass must not execute a replacement
  -- or change the function definition.
  v_before_count :=
    (length(v_definition) - length(replace(v_definition, v_before, ''))) /
    length(v_before);
  v_after_count :=
    (length(v_definition) - length(replace(v_definition, v_after, ''))) /
    length(v_after);
  if v_after_count = 1 and v_before_count = 1 then
    null;
  elsif v_after_count = 0 and v_before_count = 1 then
    v_definition := replace(v_definition, v_before, v_after);
    execute v_definition;
  else
    raise exception 'test replay found an unexpected Hugo delete function shape';
  end if;
  select pg_get_functiondef(procedure_row.oid)
  into v_definition_after
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'hugo_delete_identity_unhashed';
  assert v_definition_after = v_definition,
    'replaying the Auth lock patch changed the delete function definition';
  assert (
    length(v_definition_after) -
    length(replace(v_definition_after, v_after, ''))
  ) / length(v_after) = 1,
    'replaying the Auth lock patch did not leave exactly one lock block';

  v_receipt := public.hugo_prepare_pristine_delete(
    '00000000-0000-4000-8000-000000000308',
    'sign-in-after-prepare@example.invalid'
  );
  assert (v_receipt->>'ok')::boolean,
    'pristine identity did not prepare for deletion';

  update auth.users
  set last_sign_in_at = now()
  where id = '00000000-0000-4000-8000-000000000307';

  v_receipt := public.hugo_delete_identity(
    '00000000-0000-4000-8000-000000000309',
    'sign-in-after-prepare@example.invalid'
  );
  assert v_receipt->>'error_code' = 'identity_not_pristine',
    'delete identity ignored sign-in after preparation';
  assert exists (
    select 1
    from auth.users auth_user
    where auth_user.id = '00000000-0000-4000-8000-000000000307'
  ), 'delete identity removed Auth after the locked recheck failed';
end;
$$;

-- A synthetic future profile FK proves the catalog-driven guard cannot miss a
-- newly installed durable table between manual matrix updates.
insert into auth.users (
  id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000303',
  'future-reference@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
create table public.hugo_test_future_durable_reference (
  user_id uuid primary key references public.profiles(id) on delete restrict
);
insert into public.hugo_test_future_durable_reference (user_id)
values ('00000000-0000-4000-8000-000000000303');

do $$
begin
  assert public.fn_hugo_has_durable_activity(
    '00000000-0000-4000-8000-000000000303'
  ), 'catalog-driven pristine guard missed a future profile reference';
  assert exists (
    select 1
    from public.fn_hugo_profile_reference_inventory(
      '00000000-0000-4000-8000-000000000303'
    ) reference_row
    where reference_row.reference =
      'public.hugo_test_future_durable_reference.user_id'
  ), 'future durable reference was not named in the inventory';
end;
$$;

-- The insert path must also prevent a lifecycle RPC from replacing the sole
-- dormant legacy owner with a future-expiring grant.
insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000311',
  'legacy-sole-owner@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
update public.profiles
set system_role = 'owner',
    status = 'active'
where id = '00000000-0000-4000-8000-000000000311';
update public.profiles
set status = 'suspended'
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000109'
);

do $$
begin
  assert public.fn_hugo_owner_is_usable(
    '00000000-0000-4000-8000-000000000311'
  ), 'legacy sole owner fixture is not usable before grant insertion';
  begin
    perform public.hugo_apply_access(
      '00000000-0000-4000-8000-000000000312',
      'legacy-sole-owner@example.invalid',
      'owner',
      '{}'::jsonb,
      'active',
      now() + interval '1 day',
      '00000000-0000-4000-8000-000000000311'
    );
    assert false, 'sole legacy owner unexpectedly received an expiring grant';
  exception when check_violation then
    assert sqlerrm =
      'Cannot remove the final usable Institute owner grant.',
      'sole legacy owner insert failed for the wrong reason';
  end;
  assert not exists (
    select 1
    from public.hugo_access_grants grant_row
    where grant_row.user_id =
      '00000000-0000-4000-8000-000000000311'
  ), 'blocked sole-owner grant insertion persisted';
end;
$$;

rollback;

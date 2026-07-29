-- Behavioral proof for the private atomic Institute role editor.

begin;

do $$
declare
  v_function oid :=
    'public.fn_update_institute_role(uuid,uuid,text,uuid[])'::regprocedure;
begin
  assert (
    select function_row.prosecdef
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_function
  ), 'Institute role editor must be SECURITY DEFINER';
  assert (
    select function_row.proconfig @> array['search_path=""']::text[]
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_function
  ), 'Institute role editor must pin an empty search_path';
  assert has_function_privilege(
    'service_role',
    v_function,
    'execute'
  ), 'service_role must execute the Institute role editor';
  assert not has_function_privilege(
    'authenticated',
    v_function,
    'execute'
  ), 'authenticated must not execute the Institute role editor';
  assert not has_function_privilege(
    'anon',
    v_function,
    'execute'
  ), 'anon must not execute the Institute role editor';
end;
$$;

set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'atomic-role-actor@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '12345678-abcd-4abc-8def-1234567890ab',
    'atomic-role-target@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'fedcbafe-dcba-4cba-8fed-fedcbafedcba',
    'atomic-role-final-owner@example.invalid',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set system_role = case
      when id = 'abcdefab-cdef-4abc-8def-abcdefabcdef' then 'admin'
      when id = 'fedcbafe-dcba-4cba-8fed-fedcbafedcba' then 'owner'
      else 'learner'
    end,
    status = 'active'
where id in (
  'abcdefab-cdef-4abc-8def-abcdefabcdef',
  '12345678-abcd-4abc-8def-1234567890ab',
  'fedcbafe-dcba-4cba-8fed-fedcbafedcba'
);

insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status,
  access_expires_at, prepared_for_delete
) values
  (
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'atomic-role-actor@example.invalid',
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'admin',
    'active',
    null,
    false
  ),
  (
    '12345678-abcd-4abc-8def-1234567890ab',
    'atomic-role-target@example.invalid',
    '12345678-abcd-4abc-8def-1234567890ab',
    'learner',
    'active',
    null,
    false
  ),
  (
    'fedcbafe-dcba-4cba-8fed-fedcbafedcba',
    'atomic-role-final-owner@example.invalid',
    'fedcbafe-dcba-4cba-8fed-fedcbafedcba',
    'owner',
    'active',
    null,
    false
  );

insert into public.role_groups (id, name)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'Atomic old group'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'Atomic new group');

insert into public.user_role_groups (user_id, role_group_id)
values (
  '12345678-abcd-4abc-8def-1234567890ab',
  'aaaaaaaa-1111-4111-8111-111111111111'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'abcdefab-cdef-4abc-8def-abcdefabcdef';

do $$
begin
  begin
    perform public.fn_update_institute_role(
      'abcdefab-cdef-4abc-8def-abcdefabcdef',
      '12345678-abcd-4abc-8def-1234567890ab',
      'admin',
      null
    );
    assert false, 'authenticated executed the private Institute role editor';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';

do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
    'owner',
    array[]::uuid[]
  );
  assert not (v_result->>'ok')::boolean
     and v_result->>'code' = 'SELF_ROLE_CHANGE',
    'case-varied UUID bypassed the database self-role guard';
end;
$$;

reset role;
do $$
begin
  assert (
    select profile.system_role = 'admin'
    from public.profiles profile
    where profile.id = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
  ), 'case-varied self-role rejection changed the actor role';
  assert not exists (
    select 1
    from public.user_role_groups membership
    where membership.user_id =
      'abcdefab-cdef-4abc-8def-abcdefabcdef'
  ), 'case-varied self-role rejection changed actor groups';
end;
$$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
    'admin',
    array['bbbbbbbb-2222-4222-8222-222222222222'::uuid]
  );
  assert (v_result->>'ok')::boolean,
    'unchanged self role incorrectly blocked the paired group update';
end;
$$;

reset role;
do $$
begin
  assert (
    select array_agg(membership.role_group_id order by membership.role_group_id)
    from public.user_role_groups membership
    where membership.user_id =
      'abcdefab-cdef-4abc-8def-abcdefabcdef'
  ) = array['bbbbbbbb-2222-4222-8222-222222222222'::uuid],
    'unchanged self role did not persist the requested groups';

  begin
    perform public.fn_update_institute_role(
      'abcdefab-cdef-4abc-8def-abcdefabcdef',
      '  ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF  ',
      'owner',
      array[]::uuid[]
    );
    assert false, 'whitespace-padded UUID reached the role editor';
  exception when invalid_text_representation then
    null;
  end;
  assert (
    select profile.system_role = 'admin'
    from public.profiles profile
    where profile.id = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
  ), 'whitespace-padded UUID changed the actor role';
  assert (
    select array_agg(membership.role_group_id order by membership.role_group_id)
    from public.user_role_groups membership
    where membership.user_id =
      'abcdefab-cdef-4abc-8def-abcdefabcdef'
  ) = array['bbbbbbbb-2222-4222-8222-222222222222'::uuid],
    'whitespace-padded UUID changed the actor groups';
end;
$$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    '12345678-abcd-4abc-8def-1234567890ab',
    'admin',
    array['cccccccc-3333-4333-8333-333333333333'::uuid]
  );
  assert not (v_result->>'ok')::boolean
     and v_result->>'code' = 'ROLE_GROUP_NOT_FOUND',
    'missing role group did not return the atomic failure receipt';
end;
$$;

reset role;
do $$
begin
  assert (
    select profile.system_role = 'learner'
    from public.profiles profile
    where profile.id = '12345678-abcd-4abc-8def-1234567890ab'
  ), 'failed role-group rewrite left the role partially applied';
  assert (
    select array_agg(membership.role_group_id order by membership.role_group_id)
    from public.user_role_groups membership
    where membership.user_id =
      '12345678-abcd-4abc-8def-1234567890ab'
  ) = array['aaaaaaaa-1111-4111-8111-111111111111'::uuid],
    'failed role-group rewrite did not restore the exact old memberships';

  update public.profiles
  set system_role = 'learner'
  where id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
end;
$$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    '12345678-abcd-4abc-8def-1234567890ab',
    'admin',
    array['bbbbbbbb-2222-4222-8222-222222222222'::uuid]
  );
  assert not (v_result->>'ok')::boolean
     and v_result->>'code' = 'NOT_ADMIN',
    'de-admined actor retained stale write authority';
end;
$$;

reset role;
do $$
begin
  assert (
    select profile.system_role = 'learner'
    from public.profiles profile
    where profile.id = '12345678-abcd-4abc-8def-1234567890ab'
  ), 'de-admined actor changed the target role';
  assert (
    select array_agg(membership.role_group_id order by membership.role_group_id)
    from public.user_role_groups membership
    where membership.user_id =
      '12345678-abcd-4abc-8def-1234567890ab'
  ) = array['aaaaaaaa-1111-4111-8111-111111111111'::uuid],
    'de-admined actor changed target memberships';

  update public.profiles
  set system_role = 'admin'
  where id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
end;
$$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    '12345678-abcd-4abc-8def-1234567890ab',
    'admin',
    array['bbbbbbbb-2222-4222-8222-222222222222'::uuid]
  );
  assert (v_result->>'ok')::boolean
     and v_result->>'status' = 'updated'
     and v_result->>'role' = 'admin',
    'paired role and role-group update did not succeed';

  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    '12345678-abcd-4abc-8def-1234567890ab',
    'learner',
    null
  );
  assert (v_result->>'ok')::boolean
     and v_result->>'status' = 'updated'
     and v_result->>'role' = 'learner',
    'standalone role update did not succeed';

  v_result := public.fn_update_institute_role(
    'abcdefab-cdef-4abc-8def-abcdefabcdef',
    'fedcbafe-dcba-4cba-8fed-fedcbafedcba',
    'learner',
    null
  );
  assert not (v_result->>'ok')::boolean
     and v_result->>'code' = 'FINAL_OWNER_GUARD',
    'the atomic role editor bypassed the final usable owner trigger';
end;
$$;

reset role;
do $$
begin
  assert (
    select profile.system_role = 'learner'
    from public.profiles profile
    where profile.id = '12345678-abcd-4abc-8def-1234567890ab'
  ), 'standalone role update did not persist';
  assert (
    select array_agg(membership.role_group_id order by membership.role_group_id)
    from public.user_role_groups membership
    where membership.user_id =
      '12345678-abcd-4abc-8def-1234567890ab'
  ) = array['bbbbbbbb-2222-4222-8222-222222222222'::uuid],
    'NULL role groups did not preserve standalone memberships';
  assert (
    select profile.system_role = 'owner'
    from public.profiles profile
    where profile.id = 'fedcbafe-dcba-4cba-8fed-fedcbafedcba'
  ), 'final usable owner guard did not preserve the owner';
end;
$$;

rollback;

-- An active Hugo grant controls Institute access. Institute owns the role
-- after provisioning and may change it without locking the person out.

begin;

set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000164',
  'app-owned-role@example.invalid',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

update public.profiles
set system_role = 'learner', status = 'active'
where id = '00000000-0000-4000-8000-000000000164';

insert into public.hugo_access_grants (
  user_id, email, app_user_id, role, desired_status,
  access_expires_at, prepared_for_delete
) values (
  '00000000-0000-4000-8000-000000000164',
  'app-owned-role@example.invalid',
  '00000000-0000-4000-8000-000000000164',
  'learner',
  'active',
  null,
  false
);

do $$
begin
  assert public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000164'
  ), 'matching starting role must have active Institute access';

  update public.profiles
  set system_role = 'admin'
  where id = '00000000-0000-4000-8000-000000000164';

  assert public.fn_hugo_access_is_active(
    '00000000-0000-4000-8000-000000000164'
  ), 'an Institute-owned role change must not revoke active Hugo access';
end;
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000164';
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000164","role":"authenticated"}';

do $$
begin
  assert (
    select count(*)
    from public.profiles
    where id = auth.uid()
  ) = 1, 'the role-changed person must still read their Institute profile';
end;
$$;

rollback;

-- Regression coverage for the forward Hugo/Institute ownership contract.
begin;

set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000165',
  'lifecycle-ownership@example.invalid',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

update public.profiles
set email = 'lifecycle-ownership@example.invalid',
    full_name = 'Lifecycle ownership',
    system_role = 'learner',
    status = 'active'
where id = '00000000-0000-4000-8000-000000000165';

insert into public.role_groups (id, name, description)
values (
  '00000000-0000-4000-8000-000000000265',
  'Lifecycle ownership group', null
);

insert into public.user_role_groups (user_id, role_group_id)
values (
  '00000000-0000-4000-8000-000000000165',
  '00000000-0000-4000-8000-000000000265'
);

select public.hugo_apply_access(
  '00000000-0000-4000-8000-000000000365',
  'lifecycle-ownership@example.invalid',
  'learner',
  '{"role_group_ids":["00000000-0000-4000-8000-000000000265"]}'::jsonb,
  'active', null, '00000000-0000-4000-8000-000000000165'
);

update public.profiles
set system_role = 'admin'
where id = '00000000-0000-4000-8000-000000000165';

select public.hugo_apply_access(
  '00000000-0000-4000-8000-000000000366',
  'lifecycle-ownership@example.invalid',
  'admin',
  '{}'::jsonb, 'suspended', null,
  '00000000-0000-4000-8000-000000000165'
);

select public.hugo_apply_access(
  '00000000-0000-4000-8000-000000000367',
  'lifecycle-ownership@example.invalid',
  'learner',
  '{"role_group_ids":[]}'::jsonb, 'active', null,
  '00000000-0000-4000-8000-000000000165'
);

do $$
declare
  v_grant public.hugo_access_grants%rowtype;
begin
  select * into v_grant
  from public.hugo_access_grants
  where user_id = '00000000-0000-4000-8000-000000000165';
  assert v_grant.role = 'admin', 'reactivation must use the current Institute role';
  assert v_grant.config->'role_group_ids' = '["00000000-0000-4000-8000-000000000265"]'::jsonb,
    'reactivation must use the current Institute memberships';
end;
$$;

select public.hugo_apply_access(
  '00000000-0000-4000-8000-000000000368',
  'lifecycle-ownership@example.invalid',
  null, '{}'::jsonb, 'revoked', null,
  '00000000-0000-4000-8000-000000000165'
);

do $$
begin
  assert (select status from public.profiles where id = '00000000-0000-4000-8000-000000000165') = 'suspended',
    'revoked access must remain denied';
  assert (select count(*) from public.user_role_groups where user_id = '00000000-0000-4000-8000-000000000165') = 1,
    'revoke must preserve Institute-owned memberships';
  assert (select desired_status from public.hugo_access_grants where user_id = '00000000-0000-4000-8000-000000000165') = 'revoked',
    'revoke must be terminal';
  assert (select public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000165')) = false,
    'revoked access must be denied';
end;
$$;

rollback;

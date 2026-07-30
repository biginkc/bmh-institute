-- The lifecycle-locked Institute role RPC must never remove the final owner.
begin;

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000166', 'last-owner@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000167', 'last-owner-admin@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set system_role = case id
  when '00000000-0000-4000-8000-000000000166' then 'owner'
  else 'admin'
end,
email = case id
  when '00000000-0000-4000-8000-000000000166' then 'last-owner@example.invalid'
  else 'last-owner-admin@example.invalid'
end
where id in (
  '00000000-0000-4000-8000-000000000166',
  '00000000-0000-4000-8000-000000000167'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000167';
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000167","role":"authenticated"}';

do $$
begin
  begin
    perform public.fn_set_user_role_and_groups(
      '00000000-0000-4000-8000-000000000166',
      'admin',
      '{}'::uuid[]
    );
    raise exception 'last-owner demotion unexpectedly succeeded';
  exception
    when sqlstate '42501' then
      null;
  end;

  assert (
    select system_role
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000166'
  ) = 'owner', 'last owner must remain owner after a rejected demotion';
end;
$$;

rollback;

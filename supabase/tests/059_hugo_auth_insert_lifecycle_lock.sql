-- The Auth insert trigger must share the lifecycle lock with Hugo prepare and
-- delete, closing the no-row gap that row locks cannot protect.

begin;

do $$
declare
  v_definition text;
  v_trigger_type smallint;
begin
  v_definition := pg_get_functiondef(
    'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure
  );

  assert (
    length(v_definition) -
    length(replace(
      v_definition,
      'hugo-institute-privileged-lifecycle-v1',
      ''
    ))
  ) / length('hugo-institute-privileged-lifecycle-v1') = 1,
    'Auth insert lock function does not have exactly one lifecycle lock';
  assert not has_function_privilege(
    'service_role',
    'public.fn_hugo_lock_auth_user_insert_lifecycle()',
    'execute'
  ), 'Auth insert lock trigger function must remain private';

  select trigger_row.tgtype
  into v_trigger_type
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'hugo_auth_users_lifecycle_lock'
    and not trigger_row.tgisinternal
    and trigger_row.tgfoid =
      'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure;

  assert v_trigger_type = 6,
    'Auth lifecycle lock must be a BEFORE INSERT statement trigger';
end;
$$;

rollback;

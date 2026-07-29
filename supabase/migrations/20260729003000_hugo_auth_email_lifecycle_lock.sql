-- Changing an existing Auth row to the lifecycle target email creates the same
-- invisible-row race as an insert. Extend the statement trigger so the shared
-- advisory lock is acquired before either identity-key mutation begins.

set lock_timeout = '10s';

create or replace trigger hugo_auth_users_lifecycle_lock
before insert or update of email on auth.users
for each statement
execute function public.fn_hugo_lock_auth_user_insert_lifecycle();

-- Replay fails closed unless the function still takes exactly one shared lock,
-- tgtype 22 remains BEFORE + INSERT + UPDATE + STATEMENT, and the rendered
-- definition restricts UPDATE to the email identity key.
do $$
declare
  v_function_definition text;
  v_lock_count integer;
  v_trigger_definition text;
  v_trigger_type smallint;
begin
  v_function_definition := pg_get_functiondef(
    'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure
  );
  v_lock_count :=
    (
      length(v_function_definition) -
      length(replace(
        v_function_definition,
        'hugo-institute-privileged-lifecycle-v1',
        ''
      ))
    ) / length('hugo-institute-privileged-lifecycle-v1');

  select
    pg_get_triggerdef(trigger_row.oid),
    trigger_row.tgtype
  into
    v_trigger_definition,
    v_trigger_type
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'hugo_auth_users_lifecycle_lock'
    and not trigger_row.tgisinternal
    and trigger_row.tgfoid =
      'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure;

  if v_lock_count <> 1
    or v_trigger_type is distinct from 22
    or position(
      'before insert or update of email on auth.users'
      in lower(v_trigger_definition)
    ) = 0
  then
    raise exception
      'Hugo Auth email lifecycle lock trigger shape drifted';
  end if;
end;
$$;

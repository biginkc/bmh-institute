-- A row lock cannot protect an Auth identity that does not exist yet. Serialize
-- Auth inserts before their rows become visible so Hugo lifecycle proof cannot
-- commit two missing-success receipts while a new identity waits to commit.

set lock_timeout = '10s';

create or replace function public.fn_hugo_lock_auth_user_insert_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  return null;
end;
$$;

revoke all on function public.fn_hugo_lock_auth_user_insert_lifecycle()
  from public, anon, authenticated, service_role;

create or replace trigger hugo_auth_users_lifecycle_lock
before insert on auth.users
for each statement
execute function public.fn_hugo_lock_auth_user_insert_lifecycle();

-- Fail closed if replay or surrounding migration drift changes the trigger
-- timing, level, event, or function binding. pg_trigger.tgtype 6 means the
-- exact BEFORE + INSERT + STATEMENT combination.
do $$
declare
  v_definition text;
  v_lock_count integer;
  v_trigger_type smallint;
begin
  v_definition := pg_get_functiondef(
    'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure
  );
  v_lock_count :=
    (
      length(v_definition) -
      length(replace(
        v_definition,
        'hugo-institute-privileged-lifecycle-v1',
        ''
      ))
    ) / length('hugo-institute-privileged-lifecycle-v1');

  select trigger_row.tgtype
  into v_trigger_type
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'hugo_auth_users_lifecycle_lock'
    and not trigger_row.tgisinternal
    and trigger_row.tgfoid =
      'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure;

  if v_lock_count <> 1 or v_trigger_type is distinct from 6 then
    raise exception
      'Hugo Auth insert lifecycle lock trigger shape drifted';
  end if;
end;
$$;

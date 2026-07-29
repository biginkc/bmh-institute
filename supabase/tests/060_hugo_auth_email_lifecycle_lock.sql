-- Auth email changes can create a target identity that was absent at the
-- lifecycle snapshot. They must serialize before the UPDATE becomes visible.

begin;

do $$
declare
  v_trigger_definition text;
  v_trigger_type smallint;
begin
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

  assert v_trigger_type = 22,
    'Auth lifecycle lock must be BEFORE INSERT OR UPDATE OF email at statement level';
  assert position(
    'before insert or update of email on auth.users'
    in lower(v_trigger_definition)
  ) > 0, 'Auth lifecycle UPDATE lock must be restricted to the email key';
end;
$$;

rollback;

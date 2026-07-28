-- Focused contract checks for 20260728091000_hugo_access_provisioner.sql.
-- Run after migrations in a disposable Supabase database.  The assertions
-- inspect the actual installed functions/grants without creating identities or
-- touching application data.

begin;

do $$
declare
  v_definition text;
  v_acl aclitem[];
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'hugo_apply_access'
      and pg_get_function_identity_arguments(p.oid) =
        'p_operation_id uuid, p_email text, p_role text, p_config jsonb, p_status text, p_access_expires_at timestamp with time zone, p_app_user_id text'
  ), 'hugo_apply_access signature drifted';
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hugo_inspect_access'
      and pg_get_function_identity_arguments(p.oid) = 'p_email text'
  ), 'hugo_inspect_access signature drifted';
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hugo_prepare_pristine_delete'
      and pg_get_function_identity_arguments(p.oid) = 'p_operation_id uuid, p_email text'
  ), 'hugo_prepare_pristine_delete signature drifted';
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hugo_delete_identity'
      and pg_get_function_identity_arguments(p.oid) = 'p_operation_id uuid, p_email text'
  ), 'hugo_delete_identity signature drifted';

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hugo_apply_access';
  assert position('fn_hugo_require_service_role' in v_definition) > 0,
    'apply RPC lost the service-role guard';
  assert position('hugo_access_operations' in v_definition) > 0,
    'apply RPC lost idempotency receipts';
  assert position('role_group_ids' in v_definition) > 0,
    'apply RPC lost role-group validation';

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hugo_prepare_pristine_delete';
  assert position('fn_hugo_has_durable_activity' in v_definition) > 0,
    'prepare RPC lost durable-activity guard';
  assert position('final_owner_guard' in v_definition) > 0,
    'prepare RPC lost final-owner guard';

  for v_acl in
    select proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hugo_apply_access', 'hugo_inspect_access',
        'hugo_prepare_pristine_delete', 'hugo_delete_identity')
  loop
    assert not exists (
      select 1 from unnest(v_acl) item
      where item::text ~ '^(anon|authenticated|public|)='
    ), 'connector RPC is executable by a non-service role';
  end loop;
end;
$$;

rollback;

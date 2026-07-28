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
    where n.nspname = 'public' and p.proname = 'hugo_list_access'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) like '%email text%app_user_id text%role text%config jsonb%status text%access_expires_at timestamp with time zone%has_durable_activity boolean%'
  ), 'hugo_list_access signature drifted';
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

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hugo_list_access';
  assert position('fn_hugo_require_service_role' in v_definition) > 0,
    'list RPC lost the service-role guard';
  assert position('fn_hugo_sanitize_json' in v_definition) > 0,
    'list RPC lost config sanitization';
  assert position('fn_hugo_has_durable_activity' in v_definition) > 0,
    'list RPC lost durable-activity state';
  assert position('from public.profiles p' in v_definition) > 0,
    'list RPC does not enumerate local profiles';
  assert position('left join public.hugo_access_grants g' in v_definition) > 0,
    'list RPC lost legacy-profile fallback';
  assert position('left join public.user_role_groups urg' in v_definition) > 0,
    'list RPC lost legacy role-group state';
  assert position('g.app_user_id' in v_definition) > 0
    and position('g.role' in v_definition) > 0
    and position('g.config' in v_definition) > 0,
    'list RPC lost managed grant fields';
  assert position('p.id::text' in v_definition) > 0,
    'list RPC lost legacy app-user identity';
  assert position('jsonb_build_object' in v_definition) > 0,
    'list RPC lost legacy config fallback';
  assert position('p.status = ''active''' in v_definition) > 0,
    'list RPC lost profile status fallback';
  assert position('order by lower(trim(p.email)), p.id' in v_definition) > 0,
    'list RPC lost deterministic ordering';
  assert position('hugo_access_operations' in v_definition) = 0,
    'list RPC must not write operation receipts';
  assert v_definition !~* '\m(insert|update|delete)\M',
    'list RPC must remain read-only';

  for v_acl in
    select proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hugo_apply_access', 'hugo_inspect_access',
        'hugo_list_access', 'hugo_prepare_pristine_delete', 'hugo_delete_identity')
  loop
    assert not exists (
      select 1 from unnest(v_acl) item
      where item::text ~ '^(anon|authenticated|public|)='
    ), 'connector RPC is executable by a non-service role';
  end loop;
end;
$$;

rollback;

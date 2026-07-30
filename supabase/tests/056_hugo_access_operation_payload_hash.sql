-- Focused replay/conflict checks for the forward-only Hugo operation hash
-- migration.  The transaction is rolled back, so no identity or journal row
-- survives the test.

begin;

set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_definition text;
  v_acl aclitem[];
  v_apply_id uuid := gen_random_uuid();
  v_prepare_id uuid := gen_random_uuid();
  v_delete_id uuid := gen_random_uuid();
  v_first jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_hash text;
  v_email text := 'payload-hash-replay@example.invalid';
begin
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hugo_access_operations'
      and column_name = 'request_hash' and is_nullable = 'NO'
  ), 'request_hash must be NOT NULL';
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'hugo_apply_access_unhashed_legacy_20260730';
  assert v_definition !~* 'insert\s+into\s+public\.hugo_access_operations\s+values\s*\(',
    'the private apply implementation must not use implicit journal columns';
  select proacl into v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'hugo_apply_access_unhashed_legacy_20260730';
  assert not exists (
    select 1 from unnest(v_acl) item where item::text like 'service_role=X%'
  ), 'the unhashed implementation must not be directly executable';

  v_first := public.hugo_apply_access(
    v_apply_id, v_email, 'not-a-role', '{"token":"must-not-be-retained"}'::jsonb,
    'active', null, null
  );
  v_replay := public.hugo_apply_access(
    v_apply_id, v_email, 'not-a-role', '{"token":"must-not-be-retained"}'::jsonb,
    'active', null, null
  );
  v_conflict := public.hugo_apply_access(
    v_apply_id, v_email, 'learner', '{}'::jsonb, 'active', null, null
  );
  assert v_replay = v_first, 'an exact retry must return the original receipt';
  assert v_conflict->>'error_code' = 'operation_id_reused',
    'a changed apply payload must return a conflict receipt';
  assert not exists (
    select 1 from public.hugo_access_operations
    where operation_id = v_apply_id and receipt->>'error_code' = 'operation_id_reused'
  ), 'the conflict path must not append a journal receipt';
  select request_hash into v_hash
  from public.hugo_access_operations where operation_id = v_apply_id;
  assert v_hash ~ '^[0-9a-f]{64}$', 'apply receipt must have a SHA-256 request hash';
  assert not exists (
    select 1 from public.hugo_access_operations
    where operation_id = v_apply_id and email = lower(v_email)
  ), 'raw email must not be retained in the operation journal';
  assert not exists (
    select 1 from public.hugo_access_operations
    where operation_id = v_apply_id and input::text like '%must-not-be-retained%'
  ), 'sanitization must remove token values from journal input';

  v_first := public.hugo_prepare_pristine_delete(v_prepare_id, v_email);
  v_replay := public.hugo_prepare_pristine_delete(v_prepare_id, v_email);
  v_conflict := public.hugo_prepare_pristine_delete(v_prepare_id, 'different@example.invalid');
  assert v_replay = v_first, 'an exact prepare retry must return the original receipt';
  assert v_conflict->>'error_code' = 'operation_id_reused',
    'a changed prepare email must return a conflict receipt';

  v_first := public.hugo_delete_identity(v_delete_id, v_email);
  v_replay := public.hugo_delete_identity(v_delete_id, v_email);
  v_conflict := public.hugo_delete_identity(v_delete_id, 'different@example.invalid');
  assert v_replay = v_first, 'an exact delete retry must return the original receipt';
  assert v_conflict->>'error_code' = 'operation_id_reused',
    'a changed delete email must return a conflict receipt';
end;
$$;

rollback;

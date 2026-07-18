\if :{?fixture_cleanup_hosted_nonmutating}
\else
  \echo 'fixture cleanup 036 hosted SQL requires fixture_cleanup_hosted_nonmutating=on'
  select fixture_cleanup_036_requires_hosted_nonmutating_mode();
\endif
\if :fixture_cleanup_hosted_nonmutating
\else
  \echo 'fixture cleanup 036 hosted SQL refuses mutating mode'
  select fixture_cleanup_036_requires_hosted_nonmutating_mode();
\endif

begin;
set transaction read only;
set local lock_timeout = '10s';

do $hosted$
declare
  v_contract jsonb;
  v_probe jsonb;
begin
  if to_regprocedure(
    'public.admin_cleanup_fixture_catalog_v1(text,text)'
  ) is not null then
    raise exception 'old checksum-only cleanup RPC is still public';
  end if;
  if has_function_privilege(
    'service_role',
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
    'execute'
  ) then
    raise exception 'service_role can execute the ungated cleanup implementation';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'execute'
  ) then
    raise exception 'service_role is missing the controller-gated cleanup RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.fixture_cleanup_transport_probe_v1()',
    'execute'
  ) then
    raise exception 'service_role is missing the no-write transport probe';
  end if;
  if has_table_privilege(
    'service_role',
    'private.fixture_cleanup_controller_keys_v1',
    'select,insert,update,delete,truncate,references,trigger'
  ) or has_table_privilege(
    'service_role',
    'private.fixture_cleanup_execution_receipts_v1',
    'select,insert,update,delete,truncate,references,trigger'
  ) or has_table_privilege(
    'service_role',
    'private.fixture_cleanup_expected_function_contracts_v1',
    'select,insert,update,delete,truncate,references,trigger'
  ) then
    raise exception 'service_role can access a protected controller table';
  end if;

  v_contract :=
    private.fixture_cleanup_controller_contract_attestation_v1();
  if coalesce((v_contract ->> 'safe')::boolean, false) is not true
    or (v_contract ->> 'postgres_major')::integer not in (15, 16, 17)
    or jsonb_array_length(v_contract -> 'roles') <> 4
    or exists (
      select 1
      from jsonb_array_elements(v_contract -> 'roles') role_contract
      where (role_contract ->> 'inherit')::boolean is distinct from
        (role_contract ->> 'role' in ('anon', 'authenticated', 'service_role'))
    )
  then
    raise exception 'hosted controller contract is not the reviewed exact shape';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_probe := public.fixture_cleanup_transport_probe_v1();
  if v_probe ->> 'role' <> 'service_role'
    or coalesce((v_probe ->> 'legacy_contract_safe')::boolean, false) is not true
    or coalesce((v_probe ->> 'controller_contract_safe')::boolean, false) is not true
    or v_probe -> 'controller_contracts' is distinct from
      v_contract -> 'functions'
    or v_probe -> 'controller_table_contracts' is distinct from
      v_contract -> 'tables'
    or v_probe -> 'controller_role_contracts' is distinct from
      v_contract -> 'roles'
    or v_probe -> 'controller_role_memberships' is distinct from
      v_contract -> 'role_memberships'
    or v_probe -> 'controller_effective_privileges' is distinct from
      v_contract -> 'effective_privileges'
  then
    raise exception 'hosted no-write transport probe contract mismatch';
  end if;
end;
$hosted$;

rollback;

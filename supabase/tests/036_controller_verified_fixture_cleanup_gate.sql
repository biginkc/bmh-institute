\if :{?fixture_cleanup_isolated_superuser}
\else
  \echo 'fixture cleanup 036 adversarial SQL requires fixture_cleanup_isolated_superuser=on'
  select fixture_cleanup_036_requires_isolated_superuser_mode();
\endif
\if :fixture_cleanup_isolated_superuser
\else
  \echo 'fixture cleanup 036 adversarial SQL refuses non-isolated mode'
  select fixture_cleanup_036_requires_isolated_superuser_mode();
\endif

begin;

set local lock_timeout = '10s';

do $test$
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
  if has_table_privilege(
    'service_role',
    'private.fixture_cleanup_controller_keys_v1',
    'select'
  ) then
    raise exception 'service_role can read the controller verifier secret';
  end if;
  if has_table_privilege(
    'service_role',
    'private.fixture_cleanup_execution_receipts_v1',
    'select,insert,update,delete,truncate,references,trigger'
  ) then
    raise exception 'service_role can access controller execution receipts';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.fixture_cleanup_transport_probe_v1()',
    'execute'
  ) then
    raise exception 'service_role is missing the no-write transport probe';
  end if;
end;
$test$;

do $golden$
declare
  v_secret constant text := 'fixture-cleanup-golden-secret-0001';
  v_approval jsonb := jsonb_build_object(
    'approved_at', '2026-07-18T15:04:05.006Z',
    'approved_by', 'Jarrad Henry',
    'authorization', 'execute',
    'controller_key_id', 'golden-v1',
    'evidence_sha256', repeat('6', 64),
    'execution_id', '00000000-0000-4000-8000-000000000036',
    'manifest_sha256', repeat('8', 64),
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'recorded_by', 'controller',
    'scope', 'fixture_cleanup_after_real_course_acceptance',
    'signature_version', 'hmac-sha256-v1'
  );
  v_rollback jsonb := jsonb_build_object(
    'backup_id', '2026-07-18-backup',
    'backup_project_ref', 'dhvfsyteqsxagokoerrx',
    'backup_provider', 'supabase',
    'backup_status', 'COMPLETED',
    'backup_verification_evidence_sha256', repeat('4', 64),
    'backup_verified_by', 'controller',
    'backup_verified_live_at', '2026-07-18T14:54:05.006Z',
    'captured_at', '2026-07-18T14:34:05.006Z',
    'controller_key_id', 'golden-v1',
    'data_sha256', repeat('2', 64),
    'execution_id', '00000000-0000-4000-8000-000000000036',
    'manifest_sha256', repeat('8', 64),
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'restore_rehearsal_backup_id', '2026-07-18-backup',
    'restore_rehearsal_evidence_sha256', repeat('5', 64),
    'restore_rehearsal_status', 'passed',
    'restore_rehearsed_at', '2026-07-18T14:59:05.006Z',
    'schema_sha256', repeat('1', 64),
    'signature_version', 'hmac-sha256-v1',
    'storage_inventory_sha256', repeat('3', 64)
  );
begin
  if encode(extensions.hmac(
    'fixture-cleanup-approval-v1:' ||
      private.fixture_cleanup_canonical_evidence_v1(
        v_approval,
        array['approved_at']::text[]
      ),
    v_secret,
    'sha256'
  ), 'hex') <> '2b0b5336bea14729e8721ac57032c0a13c159f437897e3e633a723ff4d956405' then
    raise exception 'PostgreSQL approval golden vector does not match the external signer';
  end if;
  if encode(extensions.hmac(
    'fixture-cleanup-rollback-v1:' ||
      private.fixture_cleanup_canonical_evidence_v1(
        v_rollback,
        array['backup_verified_live_at','captured_at','restore_rehearsed_at']::text[]
      ),
    v_secret,
    'sha256'
  ), 'hex') <> 'dde623f6e58b92139308d3a8d43f38b83338d8978288452379bef31dccbcab42' then
    raise exception 'PostgreSQL rollback golden vector does not match the external signer';
  end if;
end;
$golden$;

-- Isolate this transactional key from any active key installed by a broader
-- harness; ROLLBACK restores the caller's original key state.
update private.fixture_cleanup_controller_keys_v1
set is_active = false, retired_at = coalesce(retired_at, clock_timestamp())
where is_active and retired_at is null;

insert into private.fixture_cleanup_controller_keys_v1 (
  key_id,
  hmac_secret,
  activated_at,
  is_active
) values (
  'migration-036-test',
  repeat('test-controller-secret-', 3),
  clock_timestamp() - interval '2 hours',
  true
);

select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  v_manifest_sha constant text :=
    '84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528';
  v_confirmation constant text :=
    'DELETE-EXACT-BMH-INSTITUTE-FIXTURES:dhvfsyteqsxagokoerrx:84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528';
  v_secret constant text := repeat('test-controller-secret-', 3);
  v_execution_id constant text := '00000000-0000-4000-8000-000000000037';
  v_now timestamptz := clock_timestamp();
  v_approval jsonb;
  v_rollback jsonb;
  v_stale_approval jsonb;
  v_stale_rollback jsonb;
  v_result jsonb;
  v_probe jsonb;
  v_signature text;
  v_table_name text;
begin
  v_rollback := jsonb_build_object(
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'manifest_sha256', v_manifest_sha,
    'captured_at', to_char((v_now - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'backup_id', 'migration-036-backup',
    'schema_sha256', repeat('1', 64),
    'data_sha256', repeat('2', 64),
    'storage_inventory_sha256', repeat('3', 64),
    'backup_provider', 'supabase',
    'backup_project_ref', 'dhvfsyteqsxagokoerrx',
    'backup_status', 'COMPLETED',
    'backup_verified_live_at', to_char((v_now - interval '20 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'backup_verified_by', 'controller',
    'backup_verification_evidence_sha256', repeat('4', 64),
    'restore_rehearsal_status', 'passed',
    'restore_rehearsal_backup_id', 'migration-036-backup',
    'restore_rehearsed_at', to_char((v_now - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'restore_rehearsal_evidence_sha256', repeat('5', 64),
    'signature_version', 'hmac-sha256-v1',
    'execution_id', v_execution_id,
    'controller_key_id', 'migration-036-test'
  );
  v_rollback := v_rollback || jsonb_build_object(
    'controller_signature',
    encode(
      extensions.hmac(
        'fixture-cleanup-rollback-v1:'
          || private.fixture_cleanup_canonical_evidence_v1(
            v_rollback,
            array['backup_verified_live_at','captured_at','restore_rehearsed_at']::text[]
          ),
        v_secret,
        'sha256'
      ),
      'hex'
    )
  );

  v_approval := jsonb_build_object(
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'manifest_sha256', v_manifest_sha,
    'approved_by', 'Jarrad Henry',
    'approved_at', to_char((v_now - interval '5 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'recorded_by', 'controller',
    'evidence_sha256', repeat('6', 64),
    'scope', 'fixture_cleanup_after_real_course_acceptance',
    'authorization', 'execute',
    'signature_version', 'hmac-sha256-v1',
    'execution_id', v_execution_id,
    'controller_key_id', 'migration-036-test'
  );
  v_approval := v_approval || jsonb_build_object(
    'controller_signature',
    encode(
      extensions.hmac(
        'fixture-cleanup-approval-v1:'
          || private.fixture_cleanup_canonical_evidence_v1(
            v_approval,
            array['approved_at']::text[]
          ),
        v_secret,
        'sha256'
      ),
      'hex'
    )
  );

  begin
    v_probe := public.fixture_cleanup_transport_probe_v1();
    if v_probe ->> 'role' <> 'service_role'
      or (v_probe ->> 'postgres_major')::integer not in (15, 16, 17)
      or coalesce((v_probe ->> 'legacy_contract_safe')::boolean, false) is not true
      or v_probe ->> 'legacy_definition_sha256' <>
        (select expected_sha256
         from private.fixture_cleanup_expected_function_contracts_v1
         where contract_name = 'moved_destructive')
      or coalesce((v_probe ->> 'controller_contract_safe')::boolean, false) is not true
      or v_probe -> 'controller_contracts' is distinct from
        private.fixture_cleanup_controller_contract_attestation_v1() -> 'functions'
      or v_probe -> 'controller_table_contracts' is distinct from
        private.fixture_cleanup_controller_contract_attestation_v1() -> 'tables'
      or v_probe -> 'controller_role_contracts' is distinct from
        private.fixture_cleanup_controller_contract_attestation_v1() -> 'roles'
      or v_probe -> 'controller_role_memberships' is distinct from
        private.fixture_cleanup_controller_contract_attestation_v1() -> 'role_memberships'
      or v_probe -> 'controller_effective_privileges' is distinct from
        private.fixture_cleanup_controller_contract_attestation_v1() -> 'effective_privileges'
    then
      raise exception 'opaque transport probe did not report the reviewed service contract';
    end if;
  exception when others then
    if sqlerrm = 'opaque transport probe did not report the reviewed service contract' then raise; end if;
    raise exception 'no-write transport probe failed: %', sqlerrm;
  end;

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      null,
      null
    );
    raise exception 'missing controller evidence was accepted';
  exception when others then
    if sqlerrm = 'missing controller evidence was accepted' then raise; end if;
    if sqlerrm not like '%approval evidence shape is invalid%' then
      raise exception 'missing evidence failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      jsonb_set(v_approval, '{controller_signature}', to_jsonb(repeat('f', 64))),
      v_rollback
    );
    raise exception 'forged controller evidence was accepted';
  exception when others then
    if sqlerrm = 'forged controller evidence was accepted' then raise; end if;
    if sqlerrm not like '%approval signature is invalid%' then
      raise exception 'forged evidence failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      v_approval,
      jsonb_set(v_rollback, '{controller_signature}', to_jsonb(repeat('f', 64)))
    );
    raise exception 'forged rollback evidence was accepted';
  exception when others then
    if sqlerrm = 'forged rollback evidence was accepted' then raise; end if;
    if sqlerrm not like '%rollback signature is invalid%' then
      raise exception 'forged rollback evidence failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  v_stale_rollback := jsonb_set(
    v_rollback,
    '{captured_at}',
    to_jsonb(to_char((v_now - interval '25 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
  v_stale_approval := jsonb_set(
    v_approval,
    '{approved_at}',
    to_jsonb(to_char((v_now - interval '25 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      v_stale_approval,
      v_stale_rollback
    );
    raise exception 'stale controller evidence was accepted';
  exception when others then
    if sqlerrm = 'stale controller evidence was accepted' then raise; end if;
    if sqlerrm not like '%evidence is stale or out of order%' then
      raise exception 'stale evidence failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  begin
    perform private.fixture_cleanup_assert_controller_evidence_v1(
      v_manifest_sha,
      v_approval,
      v_rollback
    );
  exception when others then
    raise exception 'valid controller evidence did not pass the gate: %', sqlerrm;
  end;

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      jsonb_set(
        v_approval,
        '{approved_at}',
        to_jsonb(to_char(v_now at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SSOF'))
      ),
      v_rollback
    );
    raise exception 'non-canonical UTC timestamp was accepted';
  exception when others then
    if sqlerrm = 'non-canonical UTC timestamp was accepted' then raise; end if;
    if sqlerrm not like '%timestamp must use exact UTC milliseconds%' then
      raise exception 'non-canonical timestamp failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      v_approval,
      jsonb_set(
        v_rollback,
        '{execution_id}',
        '"11111111-1111-4111-8111-111111111111"'::jsonb
      )
    );
    raise exception 'mismatched execution ids were accepted';
  exception when others then
    if sqlerrm = 'mismatched execution ids were accepted' then raise; end if;
    if sqlerrm not like '%rollback evidence is not exact%' then
      raise exception 'mismatched execution ids failed for the wrong reason: %', sqlerrm;
    end if;
  end;

  update private.fixture_cleanup_controller_keys_v1
  set is_active = false, retired_at = clock_timestamp()
  where key_id = 'migration-036-test';
  begin
    perform private.fixture_cleanup_assert_controller_evidence_v1(
      v_manifest_sha,
      v_approval,
      v_rollback
    );
    raise exception 'retired controller key was accepted';
  exception when others then
    if sqlerrm = 'retired controller key was accepted' then raise; end if;
    if sqlerrm not like '%controller verifier key is unavailable%' then
      raise exception 'retired key failed for the wrong reason: %', sqlerrm;
    end if;
  end;
  update private.fixture_cleanup_controller_keys_v1
  set is_active = true, retired_at = null
  where key_id = 'migration-036-test';

  begin
    alter function public.admin_cleanup_fixture_catalog_v1(
      text, text, jsonb, jsonb
    ) cost 101;
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      null,
      null
    );
    raise exception 'controller wrapper definition drift was not detected';
  exception when others then
    if sqlerrm = 'controller wrapper definition drift was not detected' then
      raise;
    end if;
    if sqlerrm not like '%controller contract mismatch%' then
      raise exception 'controller wrapper drift failed open: %', sqlerrm;
    end if;
  end;

  begin
    grant execute on function
      private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)
      to service_role;
    if coalesce(
      (
        private.fixture_cleanup_controller_contract_attestation_v1()
          ->> 'safe'
      )::boolean,
      false
    ) then
      raise exception 'controller evidence ACL drift was not detected';
    end if;
    raise exception 'controller evidence ACL drift observed';
  exception when others then
    if sqlerrm = 'controller evidence ACL drift was not detected' then raise; end if;
    if sqlerrm <> 'controller evidence ACL drift observed' then
      raise exception 'controller evidence ACL drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    alter function public.fixture_cleanup_transport_probe_v1() cost 101;
    v_probe := public.fixture_cleanup_transport_probe_v1();
    if coalesce(
      (v_probe ->> 'controller_contract_safe')::boolean,
      false
    ) then
      raise exception 'transport probe definition drift was not detected';
    end if;
    raise exception 'transport probe definition drift observed';
  exception when others then
    if sqlerrm = 'transport probe definition drift was not detected' then raise; end if;
    if sqlerrm <> 'transport probe definition drift observed' then
      raise exception 'transport probe drift check failed: %', sqlerrm;
    end if;
  end;

  foreach v_signature in array array[
    'private.fixture_cleanup_legacy_contract_attestation_v1()',
    'private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])',
    'private.fixture_cleanup_controller_contract_attestation_v1()',
    'private.fixture_cleanup_canonical_jsonb_v1(jsonb)',
    'private.fixture_cleanup_assert_retained_v1()',
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)',
    'public.fixture_cleanup_transport_probe_v1()'
  ]::text[] loop
    begin
      execute format('alter function %s cost 101', v_signature);
      if coalesce((
        private.fixture_cleanup_controller_contract_attestation_v1()
          ->> 'safe'
      )::boolean, false) then
        raise exception 'transitive definition drift was not detected: %',
          v_signature;
      end if;
      raise exception 'transitive definition drift observed';
    exception when others then
      if sqlerrm like 'transitive definition drift was not detected:%' then
        raise;
      end if;
      if sqlerrm <> 'transitive definition drift observed' then
        raise exception 'transitive definition drift check failed for %: %',
          v_signature, sqlerrm;
      end if;
    end;
  end loop;

  foreach v_table_name in array array[
    'private.fixture_cleanup_controller_keys_v1',
    'private.fixture_cleanup_execution_receipts_v1',
    'private.fixture_cleanup_expected_function_contracts_v1'
  ]::text[] loop
    begin
      execute format('grant select on table %s to authenticated', v_table_name);
      if coalesce((
        private.fixture_cleanup_controller_contract_attestation_v1()
          ->> 'safe'
      )::boolean, false) then
        raise exception 'table ACL drift was not detected: %', v_table_name;
      end if;
      raise exception 'table ACL drift observed';
    exception when others then
      if sqlerrm like 'table ACL drift was not detected:%' then raise; end if;
      if sqlerrm <> 'table ACL drift observed' then
        raise exception 'table ACL drift check failed for %: %',
          v_table_name, sqlerrm;
      end if;
    end;
  end loop;

  begin
    alter role anon bypassrls;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'managed role attribute drift was not detected';
    end if;
    raise exception 'managed role attribute drift observed';
  exception when others then
    if sqlerrm = 'managed role attribute drift was not detected' then raise; end if;
    if sqlerrm <> 'managed role attribute drift observed' then
      raise exception 'managed role attribute drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    create role fixture_cleanup_unexpected_membership nologin;
    grant fixture_cleanup_unexpected_membership to authenticated;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'managed role membership drift was not detected';
    end if;
    raise exception 'managed role membership drift observed';
  exception when others then
    if sqlerrm = 'managed role membership drift was not detected' then raise; end if;
    if sqlerrm <> 'managed role membership drift observed' then
      raise exception 'managed role membership drift check failed: %', sqlerrm;
    end if;
  end;

  if current_setting('server_version_num')::integer >= 160000 then
  begin
    execute 'grant service_role to anon with inherit true';
    v_probe := private.fixture_cleanup_controller_contract_attestation_v1();
    if coalesce((v_probe ->> 'safe')::boolean, false) then
      raise exception 'inherited wrapper execution was not detected';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_probe -> 'effective_privileges') privilege
      where privilege ->> 'role' = 'anon'
        and (privilege ->> 'controller_wrapper_execute')::boolean
        and (privilege ->> 'transport_probe_execute')::boolean
    ) then
      raise exception 'inherited wrapper execution was not reported exactly';
    end if;
    raise exception 'inherited wrapper execution observed';
  exception when others then
    if sqlerrm in (
      'inherited wrapper execution was not detected',
      'inherited wrapper execution was not reported exactly'
    ) then raise; end if;
    if sqlerrm <> 'inherited wrapper execution observed' then
      raise exception 'inherited wrapper execution check failed: %', sqlerrm;
    end if;
  end;

    begin
      execute 'grant service_role to authenticator with inherit true';
      v_probe := private.fixture_cleanup_controller_contract_attestation_v1();
      if coalesce((v_probe ->> 'safe')::boolean, false) then
        raise exception 'membership inherit-option drift was not detected';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(v_probe -> 'effective_privileges') privilege
        where privilege ->> 'role' = 'authenticator'
          and (privilege ->> 'controller_wrapper_execute')::boolean
          and (privilege ->> 'transport_probe_execute')::boolean
      ) then
        raise exception 'membership inherit-option drift was not effective';
      end if;
      raise exception 'membership inherit-option drift observed';
    exception when others then
      if sqlerrm in (
        'membership inherit-option drift was not detected',
        'membership inherit-option drift was not effective'
      ) then raise; end if;
      if sqlerrm <> 'membership inherit-option drift observed' then
        raise exception 'membership inherit-option drift check failed: %', sqlerrm;
      end if;
    end;

    begin
      execute 'grant service_role to authenticator with set false';
      v_probe := private.fixture_cleanup_controller_contract_attestation_v1();
      if coalesce((v_probe ->> 'safe')::boolean, false) then
        raise exception 'membership set-option drift was not detected';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(v_probe -> 'role_memberships') membership
        where membership ->> 'member' = 'authenticator'
          and membership ->> 'role' = 'service_role'
          and not (membership ->> 'set_option')::boolean
      ) then
        raise exception 'membership set-option drift was not reported exactly';
      end if;
      raise exception 'membership set-option drift observed';
    exception when others then
      if sqlerrm in (
        'membership set-option drift was not detected',
        'membership set-option drift was not reported exactly'
      ) then raise; end if;
      if sqlerrm <> 'membership set-option drift observed' then
        raise exception 'membership set-option drift check failed: %', sqlerrm;
      end if;
    end;
    begin
    create role fixture_cleanup_inherited_table_access nologin;
    grant select on table private.fixture_cleanup_controller_keys_v1
      to fixture_cleanup_inherited_table_access;
    execute 'grant fixture_cleanup_inherited_table_access to authenticated with inherit true';
    v_probe := private.fixture_cleanup_controller_contract_attestation_v1();
    if coalesce((v_probe ->> 'safe')::boolean, false) then
      raise exception 'inherited protected table access was not detected';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_probe -> 'effective_privileges') privilege
      where privilege ->> 'role' = 'authenticated'
        and (privilege ->> 'controller_keys_access')::boolean
    ) then
      raise exception 'inherited protected table access was not reported exactly';
    end if;
    raise exception 'inherited protected table access observed';
  exception when others then
    if sqlerrm in (
      'inherited protected table access was not detected',
      'inherited protected table access was not reported exactly'
    ) then raise; end if;
    if sqlerrm <> 'inherited protected table access observed' then
      raise exception 'inherited protected table access check failed: %', sqlerrm;
    end if;
  end;

    begin
    create role fixture_cleanup_inherited_helper_access nologin;
    grant execute on function
      private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)
      to fixture_cleanup_inherited_helper_access;
    execute 'grant fixture_cleanup_inherited_helper_access to service_role with inherit true';
    v_probe := private.fixture_cleanup_controller_contract_attestation_v1();
    if coalesce((v_probe ->> 'safe')::boolean, false) then
      raise exception 'inherited private helper execution was not detected';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_probe -> 'effective_privileges') privilege
      where privilege ->> 'role' = 'service_role'
        and (privilege ->> 'private_helper_execute')::boolean
    ) then
      raise exception 'inherited private helper execution was not reported exactly';
    end if;
    raise exception 'inherited private helper execution observed';
  exception when others then
    if sqlerrm in (
      'inherited private helper execution was not detected',
      'inherited private helper execution was not reported exactly'
    ) then raise; end if;
    if sqlerrm <> 'inherited private helper execution observed' then
      raise exception 'inherited private helper execution check failed: %', sqlerrm;
    end if;
  end;
  end if;

  begin
    alter function private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])
      set search_path = public;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'search_path drift was not detected';
    end if;
    raise exception 'search_path drift observed';
  exception when others then
    if sqlerrm = 'search_path drift was not detected' then raise; end if;
    if sqlerrm <> 'search_path drift observed' then
      raise exception 'search_path drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    alter function private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])
      volatile;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'volatility drift was not detected';
    end if;
    raise exception 'volatility drift observed';
  exception when others then
    if sqlerrm = 'volatility drift was not detected' then raise; end if;
    if sqlerrm <> 'volatility drift observed' then
      raise exception 'volatility drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    alter function private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)
      strict;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'strictness drift was not detected';
    end if;
    raise exception 'strictness drift observed';
  exception when others then
    if sqlerrm = 'strictness drift was not detected' then raise; end if;
    if sqlerrm <> 'strictness drift observed' then
      raise exception 'strictness drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    alter function private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])
      security definer;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'security mode drift was not detected';
    end if;
    raise exception 'security mode drift observed';
  exception when others then
    if sqlerrm = 'security mode drift was not detected' then raise; end if;
    if sqlerrm <> 'security mode drift observed' then
      raise exception 'security mode drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    execute $language_drift$
      create or replace function private.fixture_cleanup_canonical_evidence_v1(
        p_value jsonb,
        p_timestamp_fields text[]
      ) returns text
      language sql stable strict
      set search_path = pg_catalog
      as 'select p_value::text'
    $language_drift$;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'language drift was not detected';
    end if;
    raise exception 'language drift observed';
  exception when others then
    if sqlerrm = 'language drift was not detected' then raise; end if;
    if sqlerrm <> 'language drift observed' then
      raise exception 'language drift check failed: %', sqlerrm;
    end if;
  end;

  begin
    create role fixture_cleanup_contract_drift_owner nologin;
  exception when duplicate_object then null;
  end;
  begin
    alter function private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])
      owner to fixture_cleanup_contract_drift_owner;
    if coalesce((private.fixture_cleanup_controller_contract_attestation_v1()
      ->> 'safe')::boolean, false) then
      raise exception 'owner drift was not detected';
    end if;
    raise exception 'owner drift observed';
  exception when others then
    if sqlerrm = 'owner drift was not detected' then raise; end if;
    if sqlerrm <> 'owner drift observed' then
      raise exception 'owner drift check failed: %', sqlerrm;
    end if;
  end;
  drop role fixture_cleanup_contract_drift_owner;

  if not coalesce(
    (
      private.fixture_cleanup_controller_contract_attestation_v1()
        ->> 'safe'
    )::boolean,
    false
  ) then
    raise exception 'contract drift tests did not roll back exactly';
  end if;
end;
$test$;

rollback;

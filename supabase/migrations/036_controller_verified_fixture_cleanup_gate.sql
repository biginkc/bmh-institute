-- Move the checksum-only fixture cleanup implementation behind a database-level
-- controller evidence gate. The controller HMAC secret is provisioned directly
-- by the database owner and is never committed or readable by service_role.

set lock_timeout = '10s';

create table private.fixture_cleanup_controller_keys_v1 (
  key_id text primary key
    check (key_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  hmac_secret text not null
    check (length(hmac_secret) between 32 and 512),
  activated_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  is_active boolean not null default true,
  check (retired_at is null or retired_at >= activated_at)
);

create unique index fixture_cleanup_one_active_controller_key_v1
  on private.fixture_cleanup_controller_keys_v1 ((is_active))
  where is_active and retired_at is null;

create table private.fixture_cleanup_execution_receipts_v1 (
  execution_id uuid primary key,
  execution_digest text not null unique
    check (execution_digest ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null
    check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  controller_key_id text not null,
  executed_at timestamptz not null default clock_timestamp(),
  outcome text not null check (outcome in ('deleted', 'already_deleted'))
);

-- Definition hashes live outside the attester body so that the attester can
-- attest its own exact pg_get_functiondef output without a recursive hash
-- literal. Only the database owner can read or mutate this reviewed registry.
create table private.fixture_cleanup_expected_function_contracts_v1 (
  contract_name text primary key,
  signature text not null unique,
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_security_definer boolean not null,
  expected_search_path jsonb not null,
  expected_language text not null,
  expected_volatility text not null
    check (expected_volatility in ('volatile', 'stable', 'immutable')),
  expected_strict boolean not null,
  expected_execute_acl jsonb not null
);

comment on table private.fixture_cleanup_controller_keys_v1 is
  'Database-owner-provisioned one-time HMAC verifier keys. Never grant this table to service_role.';
comment on table private.fixture_cleanup_execution_receipts_v1 is
  'One-time fixture cleanup authorization receipts. Preserve for audit and replay refusal.';

revoke all on table private.fixture_cleanup_controller_keys_v1
  from public, anon, authenticated, service_role;
revoke all on table private.fixture_cleanup_execution_receipts_v1
  from public, anon, authenticated, service_role;
revoke all on table private.fixture_cleanup_expected_function_contracts_v1
  from public, anon, authenticated, service_role;

-- Migration 021 is the only reviewed destructive implementation. Refuse to
-- put a controller gate in front of an unknown or subsequently edited body.
do $block$
declare
  v_definition_sha256 text;
  v_contract_safe boolean;
begin
  select
    encode(extensions.digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex'),
    proc.prosecdef
      and proc.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and proc.provolatile = 'v'
      and not proc.proisstrict
      and proc.proconfig = array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(proc.proowner) = current_user
      and has_function_privilege(
        'service_role', proc.oid, 'execute'
      )
      and not has_function_privilege('anon', proc.oid, 'execute')
      and not has_function_privilege('authenticated', proc.oid, 'execute')
    into v_definition_sha256, v_contract_safe
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'public.admin_cleanup_fixture_catalog_v1(text,text)'
  );

  if v_definition_sha256 is distinct from
      'ead06284652a54a583f42e59213845a816f37251f154c8d2d93f0f1258512471'
    or not coalesce(v_contract_safe, false)
  then
    raise exception 'fixture cleanup migration blocked: legacy destructive contract mismatch'
      using errcode = '42501';
  end if;
end;
$block$;

alter function public.admin_cleanup_fixture_catalog_v1(text, text)
  set schema private;
alter function private.admin_cleanup_fixture_catalog_v1(text, text)
  rename to admin_cleanup_fixture_catalog_v021_without_controller_gate;
revoke all on function
  private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text, text)
  from public, anon, authenticated, service_role;

create function private.fixture_cleanup_legacy_contract_attestation_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_definition_sha256 text;
  v_contract_safe boolean;
begin
  select
    encode(extensions.digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex'),
    proc.prosecdef
      and proc.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and proc.provolatile = 'v'
      and not proc.proisstrict
      and proc.proconfig = array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(proc.proowner) = current_user
      and not has_function_privilege('anon', proc.oid, 'execute')
      and not has_function_privilege('authenticated', proc.oid, 'execute')
      and not has_function_privilege('service_role', proc.oid, 'execute')
    into v_definition_sha256, v_contract_safe
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'
  );

  return jsonb_build_object(
    'definition_sha256', v_definition_sha256,
    'safe', coalesce(v_contract_safe, false)
      and v_definition_sha256 =
        '1f20fcb5390b85bd1ba3d45166e204bdc947e0ef3ea3f3214a16a1c6aef08b30'
  );
end;
$function$;

revoke all on function private.fixture_cleanup_legacy_contract_attestation_v1()
  from public, anon, authenticated, service_role;

do $block$
begin
  if not coalesce(
    (private.fixture_cleanup_legacy_contract_attestation_v1() ->> 'safe')::boolean,
    false
  ) then
    raise exception 'fixture cleanup migration blocked: moved destructive contract mismatch'
      using errcode = '42501';
  end if;
end;
$block$;

create function private.fixture_cleanup_canonical_evidence_v1(
  p_value jsonb,
  p_timestamp_fields text[]
)
returns text
language plpgsql
stable
strict
set search_path = pg_catalog
as $function$
declare
  v_result text;
begin
  if jsonb_typeof(p_value) <> 'object'
    or exists (
      select 1 from jsonb_each(p_value) entry
      where jsonb_typeof(entry.value) <> 'string'
    )
  then
    raise exception 'fixture cleanup blocked: canonical evidence must contain only string fields'
      using errcode = '22023';
  end if;

  select '{' || coalesce(
    string_agg(
      to_jsonb(entry.key)::text || ':' ||
      case
        when entry.key = any(p_timestamp_fields) then
          to_jsonb(
            to_char(
              (entry.value #>> '{}')::timestamptz at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          )::text
        else entry.value::text
      end,
      ',' order by entry.key collate "C"
    ),
    ''
  ) || '}'
    into v_result
  from jsonb_each(p_value) entry;
  return v_result;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'fixture cleanup blocked: canonical evidence timestamp is invalid'
    using errcode = '22007';
end;
$function$;

revoke all on function private.fixture_cleanup_canonical_evidence_v1(jsonb, text[])
  from public, anon, authenticated, service_role;

create function private.fixture_cleanup_assert_controller_evidence_v1(
  p_manifest_sha256 text,
  p_approval jsonb,
  p_rollback jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_project_ref constant text := 'dhvfsyteqsxagokoerrx';
  v_signature_version constant text := 'hmac-sha256-v1';
  v_approval_domain constant text := 'fixture-cleanup-approval-v1:';
  v_rollback_domain constant text := 'fixture-cleanup-rollback-v1:';
  v_now timestamptz := clock_timestamp();
  v_approved_at timestamptz;
  v_captured_at timestamptz;
  v_verified_at timestamptz;
  v_rehearsed_at timestamptz;
  v_key_id text;
  v_secret text;
  v_key_activated_at timestamptz;
  v_expected_signature text;
begin
  if p_manifest_sha256 is null
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'fixture cleanup blocked: invalid manifest checksum'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_approval) <> 'object'
    or array(
      select key from jsonb_object_keys(p_approval) key order by key
    ) <> array[
      'approved_at',
      'approved_by',
      'authorization',
      'controller_key_id',
      'controller_signature',
      'evidence_sha256',
      'execution_id',
      'manifest_sha256',
      'project_ref',
      'recorded_by',
      'scope',
      'signature_version'
    ]::text[]
    or exists (
      select 1 from jsonb_each(p_approval) entry
      where jsonb_typeof(entry.value) <> 'string'
    )
  then
    raise exception 'fixture cleanup blocked: approval evidence shape is invalid'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_rollback) <> 'object'
    or array(
      select key from jsonb_object_keys(p_rollback) key order by key
    ) <> array[
      'backup_id',
      'backup_project_ref',
      'backup_provider',
      'backup_status',
      'backup_verification_evidence_sha256',
      'backup_verified_by',
      'backup_verified_live_at',
      'captured_at',
      'controller_key_id',
      'controller_signature',
      'data_sha256',
      'execution_id',
      'manifest_sha256',
      'project_ref',
      'restore_rehearsal_backup_id',
      'restore_rehearsal_evidence_sha256',
      'restore_rehearsal_status',
      'restore_rehearsed_at',
      'schema_sha256',
      'signature_version',
      'storage_inventory_sha256'
    ]::text[]
    or exists (
      select 1 from jsonb_each(p_rollback) entry
      where jsonb_typeof(entry.value) <> 'string'
    )
  then
    raise exception 'fixture cleanup blocked: rollback evidence shape is invalid'
      using errcode = '22023';
  end if;

  if p_approval ->> 'project_ref' <> v_project_ref
    or p_approval ->> 'manifest_sha256' <> p_manifest_sha256
    or p_approval ->> 'approved_by' <> 'Jarrad Henry'
    or p_approval ->> 'recorded_by' <> 'controller'
    or p_approval ->> 'scope' <> 'fixture_cleanup_after_real_course_acceptance'
    or p_approval ->> 'authorization' <> 'execute'
    or p_approval ->> 'signature_version' <> v_signature_version
    or p_approval ->> 'evidence_sha256' !~ '^[0-9a-f]{64}$'
    or p_approval ->> 'execution_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_approval ->> 'controller_key_id' !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_approval ->> 'controller_signature' !~ '^[0-9a-f]{64}$'
  then
    raise exception 'fixture cleanup blocked: approval evidence is not exact'
      using errcode = '42501';
  end if;

  if p_rollback ->> 'project_ref' <> v_project_ref
    or p_rollback ->> 'manifest_sha256' <> p_manifest_sha256
    or p_rollback ->> 'backup_provider' <> 'supabase'
    or p_rollback ->> 'backup_project_ref' <> v_project_ref
    or p_rollback ->> 'backup_status' <> 'COMPLETED'
    or p_rollback ->> 'backup_verified_by' <> 'controller'
    or p_rollback ->> 'restore_rehearsal_status' <> 'passed'
    or p_rollback ->> 'restore_rehearsal_backup_id' <> p_rollback ->> 'backup_id'
    or coalesce(p_rollback ->> 'backup_id', '') = ''
    or p_rollback ->> 'signature_version' <> v_signature_version
    or p_rollback ->> 'execution_id' <> p_approval ->> 'execution_id'
    or p_rollback ->> 'execution_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_rollback ->> 'controller_key_id' <> p_approval ->> 'controller_key_id'
    or p_rollback ->> 'controller_key_id' !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_rollback ->> 'controller_signature' !~ '^[0-9a-f]{64}$'
    or p_rollback ->> 'backup_verification_evidence_sha256' !~ '^[0-9a-f]{64}$'
    or p_rollback ->> 'restore_rehearsal_evidence_sha256' !~ '^[0-9a-f]{64}$'
    or p_rollback ->> 'schema_sha256' !~ '^[0-9a-f]{64}$'
    or p_rollback ->> 'data_sha256' !~ '^[0-9a-f]{64}$'
    or p_rollback ->> 'storage_inventory_sha256' !~ '^[0-9a-f]{64}$'
  then
    raise exception 'fixture cleanup blocked: rollback evidence is not exact'
      using errcode = '42501';
  end if;

  if p_approval ->> 'approved_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_rollback ->> 'captured_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_rollback ->> 'backup_verified_live_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_rollback ->> 'restore_rehearsed_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
  then
    raise exception 'fixture cleanup blocked: evidence timestamp must use exact UTC milliseconds'
      using errcode = '22007';
  end if;

  begin
    v_approved_at := (p_approval ->> 'approved_at')::timestamptz;
    v_captured_at := (p_rollback ->> 'captured_at')::timestamptz;
    v_verified_at := (p_rollback ->> 'backup_verified_live_at')::timestamptz;
    v_rehearsed_at := (p_rollback ->> 'restore_rehearsed_at')::timestamptz;
  exception when others then
    raise exception 'fixture cleanup blocked: evidence timestamp is invalid'
      using errcode = '22007';
  end;

  if v_approved_at > v_now
    or v_approved_at < v_now - interval '24 hours'
    or v_captured_at > v_now
    or v_captured_at < v_now - interval '24 hours'
    or v_verified_at > v_now
    or v_verified_at < v_now - interval '1 hour'
    or v_rehearsed_at > v_now
    or v_rehearsed_at < v_now - interval '24 hours'
    or v_verified_at < v_captured_at
    or v_rehearsed_at < v_captured_at
    or v_approved_at < v_verified_at
    or v_approved_at < v_rehearsed_at
  then
    raise exception 'fixture cleanup blocked: evidence is stale or out of order'
      using errcode = '42501';
  end if;

  v_key_id := p_approval ->> 'controller_key_id';
  select key.hmac_secret, key.activated_at
    into v_secret, v_key_activated_at
  from private.fixture_cleanup_controller_keys_v1 key
  where key.key_id = v_key_id
    and key.is_active
    and key.retired_at is null;
  if v_secret is null
    or v_key_activated_at > v_approved_at
  then
    raise exception 'fixture cleanup blocked: controller verifier key is unavailable'
      using errcode = '42501';
  end if;

  v_expected_signature := encode(
    extensions.hmac(
      v_approval_domain
        || private.fixture_cleanup_canonical_evidence_v1(
          p_approval - 'controller_signature',
          array['approved_at']::text[]
        ),
      v_secret,
      'sha256'
    ),
    'hex'
  );
  if v_expected_signature <> p_approval ->> 'controller_signature' then
    raise exception 'fixture cleanup blocked: approval signature is invalid'
      using errcode = '42501';
  end if;

  v_expected_signature := encode(
    extensions.hmac(
      v_rollback_domain
        || private.fixture_cleanup_canonical_evidence_v1(
          p_rollback - 'controller_signature',
          array[
            'backup_verified_live_at',
            'captured_at',
            'restore_rehearsed_at'
          ]::text[]
        ),
      v_secret,
      'sha256'
    ),
    'hex'
  );
  if v_expected_signature <> p_rollback ->> 'controller_signature' then
    raise exception 'fixture cleanup blocked: rollback signature is invalid'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function private.fixture_cleanup_assert_controller_evidence_v1(
  text, jsonb, jsonb
) from public, anon, authenticated, service_role;

create function public.fixture_cleanup_transport_probe_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_legacy_contract jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'fixture cleanup probe blocked: service role is required'
      using errcode = '42501';
  end if;
  v_legacy_contract := private.fixture_cleanup_legacy_contract_attestation_v1();
  return jsonb_build_object(
    'role', auth.role(),
    'old_public_rpc', to_regprocedure(
      'public.admin_cleanup_fixture_catalog_v1(text,text)'
    ) is not null,
    'ungated_service_execute', has_function_privilege(
      'service_role',
      'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
      'execute'
    ),
    'key_select', has_table_privilege(
      'service_role',
      'private.fixture_cleanup_controller_keys_v1',
      'select'
    ),
    'legacy_definition_sha256', v_legacy_contract ->> 'definition_sha256',
    'legacy_contract_safe', coalesce(
      (v_legacy_contract ->> 'safe')::boolean,
      false
    )
  );
end;
$function$;

revoke all on function public.fixture_cleanup_transport_probe_v1()
  from public, anon, authenticated;
grant execute on function public.fixture_cleanup_transport_probe_v1()
  to service_role;

create function public.admin_cleanup_fixture_catalog_v1(
  p_manifest_sha256 text,
  p_confirmation text,
  p_approval jsonb,
  p_rollback jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
  v_legacy_contract jsonb;
  v_controller_contract jsonb;
  v_execution_id uuid;
  v_execution_digest text;
  v_existing_digest text;
  v_consumed boolean := false;
  v_boundary record;
  v_where text;
  v_boundary_present boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'fixture cleanup blocked: service role is required'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bmh-institute-fixture-cleanup-v1', 0)
  );
  v_legacy_contract := private.fixture_cleanup_legacy_contract_attestation_v1();
  if not coalesce((v_legacy_contract ->> 'safe')::boolean, false) then
    raise exception 'fixture cleanup blocked: destructive contract mismatch'
      using errcode = '42501';
  end if;
  v_controller_contract :=
    private.fixture_cleanup_controller_contract_attestation_v1();
  if not coalesce((v_controller_contract ->> 'safe')::boolean, false) then
    raise exception 'fixture cleanup blocked: controller contract mismatch'
      using errcode = '42501';
  end if;
  perform private.fixture_cleanup_assert_controller_evidence_v1(
    p_manifest_sha256,
    p_approval,
    p_rollback
  );

  v_execution_id := (p_approval ->> 'execution_id')::uuid;
  v_execution_digest := encode(
    extensions.digest(
      convert_to(
        'fixture-cleanup-execution-v1:'
          || (p_approval ->> 'execution_id')
          || ':' || (p_approval ->> 'controller_key_id')
          || ':' || (p_approval ->> 'controller_signature')
          || ':' || (p_rollback ->> 'controller_signature'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select receipt.execution_digest
    into v_existing_digest
  from private.fixture_cleanup_execution_receipts_v1 receipt
  where receipt.execution_id = v_execution_id;
  v_consumed := found;
  if v_consumed then
    if v_existing_digest <> v_execution_digest then
      raise exception 'fixture cleanup blocked: execution id digest mismatch'
        using errcode = '42501';
    end if;
    for v_boundary in
      select table_name, identity
      from private.fixture_cleanup_boundary_v1
      order by table_name, identity_key
    loop
      select string_agg(
        format('%I::text = %L', key, value),
        ' and ' order by key
      ) into v_where
      from jsonb_each_text(v_boundary.identity);
      execute format(
        'select exists(select 1 from public.%I where %s)',
        v_boundary.table_name,
        v_where
      ) into v_boundary_present;
      if v_boundary_present then
        raise exception 'fixture cleanup blocked: controller execution evidence was already consumed'
          using errcode = '42501';
      end if;
    end loop;
  end if;

  v_result := private.admin_cleanup_fixture_catalog_v021_without_controller_gate(
    p_manifest_sha256,
    p_confirmation
  );
  if jsonb_typeof(v_result) is distinct from 'object'
    or array(
      select key
      from jsonb_object_keys(v_result) key
      order by key collate "C"
    ) <> array['deleted', 'status']::text[]
    or v_result ->> 'status' not in ('deleted', 'already_deleted')
    or jsonb_typeof(v_result -> 'deleted') is distinct from 'object'
    or (
      v_result ->> 'status' = 'already_deleted'
      and v_result -> 'deleted' <> '{}'::jsonb
    )
    or (
      v_result ->> 'status' = 'deleted'
      and (
        array(
          select key from jsonb_object_keys(v_result -> 'deleted') key
          order by key collate "C"
        ) <> array[
          'answer_options',
          'assignment_submissions',
          'assignments',
          'certificates',
          'content_blocks',
          'course_access',
          'courses',
          'invites',
          'lessons',
          'modules',
          'program_access',
          'program_certificates',
          'program_courses',
          'programs',
          'questions',
          'quizzes',
          'role_groups',
          'role_play_results',
          'user_block_progress',
          'user_course_resume',
          'user_lesson_completions',
          'user_quiz_attempts',
          'user_role_groups',
          'user_video_progress'
        ]::text[]
        or exists (
          select 1
          from jsonb_each(v_result -> 'deleted') entry
          left join private.fixture_cleanup_tables_v1 boundary
            on boundary.table_name = entry.key
          where boundary.table_name is null
            or case
              when jsonb_typeof(entry.value) = 'number' then
                (entry.value #>> '{}')::numeric < 0
                or trunc((entry.value #>> '{}')::numeric) <>
                  (entry.value #>> '{}')::numeric
                or (entry.value #>> '{}')::numeric <>
                  boundary.expected_count::numeric
              else true
            end
        )
      )
    )
  then
    raise exception 'fixture cleanup blocked: destructive result contract mismatch'
      using errcode = '22023';
  end if;

  if not v_consumed then
    insert into private.fixture_cleanup_execution_receipts_v1 (
      execution_id,
      execution_digest,
      manifest_sha256,
      controller_key_id,
      outcome
    ) values (
      v_execution_id,
      v_execution_digest,
      p_manifest_sha256,
      p_approval ->> 'controller_key_id',
      v_result ->> 'status'
    );
  end if;
  return v_result;
end;
$function$;

revoke all on function public.admin_cleanup_fixture_catalog_v1(
  text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_cleanup_fixture_catalog_v1(
  text, text, jsonb, jsonb
) to service_role;

create function private.fixture_cleanup_controller_contract_attestation_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_spec record;
  v_proc record;
  v_table_spec record;
  v_class record;
  v_definition_sha256 text;
  v_owner_exact boolean;
  v_security_definer boolean;
  v_search_path jsonb;
  v_language text;
  v_volatility text;
  v_strict boolean;
  v_execute_acl jsonb;
  v_contract jsonb;
  v_contracts jsonb := '{}'::jsonb;
  v_table_contracts jsonb := '{}'::jsonb;
  v_role_contracts jsonb;
  v_role_memberships jsonb;
  v_effective_privileges jsonb;
  v_role_safe boolean;
  v_membership_safe boolean;
  v_effective_safe boolean;
  v_postgres_major integer :=
    current_setting('server_version_num')::integer / 10000;
  v_safe boolean := true;
  v_expected_names constant text[] := array[
    'assert_retained',
    'canonical_evidence',
    'canonical_jsonb',
    'controller_attester',
    'controller_evidence',
    'controller_wrapper',
    'legacy_attester',
    'moved_destructive',
    'transport_probe'
  ]::text[];
  v_owner_table_acl jsonb;
  -- Final API-role state is pinned to supabase/postgres develop at
  -- ad8973723a73c53371389026d7f76a01e470c06c, migration
  -- 20230529180330_alter_api_roles_for_inherit.sql, not initial role creation.
  v_expected_role_contracts constant jsonb := '[
    {"role":"anon","superuser":false,"inherit":true,"create_role":false,"create_db":false,"login":false,"replication":false,"connection_limit":-1,"bypass_rls":false,"valid_until":null,"safe":true},
    {"role":"authenticated","superuser":false,"inherit":true,"create_role":false,"create_db":false,"login":false,"replication":false,"connection_limit":-1,"bypass_rls":false,"valid_until":null,"safe":true},
    {"role":"authenticator","superuser":false,"inherit":false,"create_role":false,"create_db":false,"login":true,"replication":false,"connection_limit":-1,"bypass_rls":false,"valid_until":null,"safe":true},
    {"role":"service_role","superuser":false,"inherit":true,"create_role":false,"create_db":false,"login":false,"replication":false,"connection_limit":-1,"bypass_rls":true,"valid_until":null,"safe":true}
  ]'::jsonb;
  v_expected_role_memberships jsonb;
  v_expected_effective_privileges constant jsonb := '[
    {"role":"anon","controller_wrapper_execute":false,"transport_probe_execute":false,"private_helper_execute":false,"controller_keys_access":false,"execution_receipts_access":false,"expected_contracts_access":false,"safe":true},
    {"role":"authenticated","controller_wrapper_execute":false,"transport_probe_execute":false,"private_helper_execute":false,"controller_keys_access":false,"execution_receipts_access":false,"expected_contracts_access":false,"safe":true},
    {"role":"authenticator","controller_wrapper_execute":false,"transport_probe_execute":false,"private_helper_execute":false,"controller_keys_access":false,"execution_receipts_access":false,"expected_contracts_access":false,"safe":true},
    {"role":"service_role","controller_wrapper_execute":true,"transport_probe_execute":true,"private_helper_execute":false,"controller_keys_access":false,"execution_receipts_access":false,"expected_contracts_access":false,"safe":true}
  ]'::jsonb;
begin
  if v_postgres_major in (15, 16) then
    v_owner_table_acl := '[
      {"grantee":"owner","privilege":"DELETE","grantable":false},
      {"grantee":"owner","privilege":"INSERT","grantable":false},
      {"grantee":"owner","privilege":"REFERENCES","grantable":false},
      {"grantee":"owner","privilege":"SELECT","grantable":false},
      {"grantee":"owner","privilege":"TRIGGER","grantable":false},
      {"grantee":"owner","privilege":"TRUNCATE","grantable":false},
      {"grantee":"owner","privilege":"UPDATE","grantable":false}
    ]'::jsonb;
  elsif v_postgres_major = 17 then
    v_owner_table_acl := '[
      {"grantee":"owner","privilege":"DELETE","grantable":false},
      {"grantee":"owner","privilege":"INSERT","grantable":false},
      {"grantee":"owner","privilege":"MAINTAIN","grantable":false},
      {"grantee":"owner","privilege":"REFERENCES","grantable":false},
      {"grantee":"owner","privilege":"SELECT","grantable":false},
      {"grantee":"owner","privilege":"TRIGGER","grantable":false},
      {"grantee":"owner","privilege":"TRUNCATE","grantable":false},
      {"grantee":"owner","privilege":"UPDATE","grantable":false}
    ]'::jsonb;
  else
    -- This security contract is reviewed only against PostgreSQL 15, 16 and 17.
    v_owner_table_acl := '[]'::jsonb;
    v_safe := false;
  end if;

  if v_postgres_major = 15 then
    v_expected_role_memberships := '[
      {"member":"authenticator","role":"anon","admin_option":false},
      {"member":"authenticator","role":"authenticated","admin_option":false},
      {"member":"authenticator","role":"service_role","admin_option":false},
      {"member":"postgres","role":"anon","admin_option":false},
      {"member":"postgres","role":"authenticated","admin_option":false},
      {"member":"postgres","role":"service_role","admin_option":false},
      {"member":"supabase_storage_admin","role":"authenticator","admin_option":false}
    ]'::jsonb;
  elsif v_postgres_major in (16, 17) then
    v_expected_role_memberships := '[
      {"member":"authenticator","role":"anon","admin_option":false,"inherit_option":false,"set_option":true},
      {"member":"authenticator","role":"authenticated","admin_option":false,"inherit_option":false,"set_option":true},
      {"member":"authenticator","role":"service_role","admin_option":false,"inherit_option":false,"set_option":true},
      {"member":"postgres","role":"anon","admin_option":true,"inherit_option":true,"set_option":true},
      {"member":"postgres","role":"authenticated","admin_option":true,"inherit_option":true,"set_option":true},
      {"member":"postgres","role":"authenticator","admin_option":true,"inherit_option":true,"set_option":true},
      {"member":"postgres","role":"service_role","admin_option":true,"inherit_option":true,"set_option":true},
      {"member":"supabase_storage_admin","role":"authenticator","admin_option":false,"inherit_option":false,"set_option":true}
    ]'::jsonb;
  else
    v_expected_role_memberships := '[]'::jsonb;
  end if;

  if array(
    select contract_name
    from private.fixture_cleanup_expected_function_contracts_v1
    order by contract_name
  ) <> v_expected_names then
    v_safe := false;
  end if;

  for v_spec in
    select *
    from private.fixture_cleanup_expected_function_contracts_v1
    order by contract_name
  loop
    select proc.*
      into v_proc
    from pg_proc proc
    where proc.oid = to_regprocedure(v_spec.signature);

    if not found then
      v_contract := jsonb_build_object(
        'definition_sha256', null,
        'owner_exact', false,
        'security_definer', false,
        'search_path', '[]'::jsonb,
        'language', null,
        'volatility', null,
        'strict', null,
        'execute_acl', '[]'::jsonb,
        'safe', false
      );
    else
      v_definition_sha256 := encode(
        extensions.digest(pg_get_functiondef(v_proc.oid), 'sha256'),
        'hex'
      );
      v_owner_exact := pg_get_userbyid(v_proc.proowner) = current_user;
      v_security_definer := v_proc.prosecdef;
      v_search_path := to_jsonb(coalesce(v_proc.proconfig, '{}'::text[]));
      select language.lanname
        into v_language
      from pg_language language
      where language.oid = v_proc.prolang;
      v_volatility := case v_proc.provolatile
        when 'v' then 'volatile'
        when 's' then 'stable'
        when 'i' then 'immutable'
        else 'unknown'
      end;
      v_strict := v_proc.proisstrict;
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'grantee',
            case
              when privilege.grantee = v_proc.proowner then 'owner'
              when privilege.grantee = 0 then 'public'
              else pg_get_userbyid(privilege.grantee)
            end,
            'grantable', privilege.is_grantable
          )
          order by case
            when privilege.grantee = v_proc.proowner then 'owner'
            when privilege.grantee = 0 then 'public'
            else pg_get_userbyid(privilege.grantee)
          end
        ),
        '[]'::jsonb
      )
        into v_execute_acl
      from aclexplode(
        coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))
      ) privilege
      where privilege.privilege_type = 'EXECUTE';

      v_contract := jsonb_build_object(
        'definition_sha256', v_definition_sha256,
        'owner_exact', v_owner_exact,
        'security_definer', v_security_definer,
        'search_path', v_search_path,
        'language', v_language,
        'volatility', v_volatility,
        'strict', v_strict,
        'execute_acl', v_execute_acl,
        'safe',
          v_definition_sha256 = v_spec.expected_sha256
          and v_owner_exact
          and v_security_definer = v_spec.expected_security_definer
          and v_search_path = v_spec.expected_search_path
          and v_language = v_spec.expected_language
          and v_volatility = v_spec.expected_volatility
          and v_strict = v_spec.expected_strict
          and v_execute_acl = v_spec.expected_execute_acl
      );
    end if;
    v_safe := v_safe and coalesce((v_contract ->> 'safe')::boolean, false);
    v_contracts := v_contracts ||
      jsonb_build_object(v_spec.contract_name, v_contract);
  end loop;

  for v_table_spec in
    select * from (values
      ('controller_keys'::text, 'private.fixture_cleanup_controller_keys_v1'::text),
      ('execution_receipts'::text, 'private.fixture_cleanup_execution_receipts_v1'::text),
      ('expected_function_contracts'::text, 'private.fixture_cleanup_expected_function_contracts_v1'::text)
    ) spec(name, signature)
  loop
    select class.* into v_class
    from pg_class class
    where class.oid = to_regclass(v_table_spec.signature);

    if not found then
      v_contract := jsonb_build_object(
        'owner_exact', false,
        'acl', '[]'::jsonb,
        'safe', false
      );
    else
      v_owner_exact := pg_get_userbyid(v_class.relowner) = current_user;
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'grantee',
            case
              when privilege.grantee = v_class.relowner then 'owner'
              when privilege.grantee = 0 then 'public'
              else pg_get_userbyid(privilege.grantee)
            end,
            'privilege', privilege.privilege_type,
            'grantable', privilege.is_grantable
          )
          order by case
            when privilege.grantee = v_class.relowner then 'owner'
            when privilege.grantee = 0 then 'public'
            else pg_get_userbyid(privilege.grantee)
          end, privilege.privilege_type
        ),
        '[]'::jsonb
      ) into v_execute_acl
      from aclexplode(
        coalesce(v_class.relacl, acldefault('r', v_class.relowner))
      ) privilege;
      v_contract := jsonb_build_object(
        'owner_exact', v_owner_exact,
        'acl', v_execute_acl,
        'safe', v_owner_exact and v_execute_acl = v_owner_table_acl
      );
    end if;
    v_safe := v_safe and coalesce((v_contract ->> 'safe')::boolean, false);
    v_table_contracts := v_table_contracts ||
      jsonb_build_object(v_table_spec.name, v_contract);
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role', role_row.rolname,
        'superuser', role_row.rolsuper,
        'inherit', role_row.rolinherit,
        'create_role', role_row.rolcreaterole,
        'create_db', role_row.rolcreatedb,
        'login', role_row.rolcanlogin,
        'replication', role_row.rolreplication,
        'connection_limit', role_row.rolconnlimit,
        'bypass_rls', role_row.rolbypassrls,
        'valid_until', role_row.rolvaliduntil,
        'safe',
          not role_row.rolsuper
          and not role_row.rolcreaterole
          and not role_row.rolcreatedb
          and not role_row.rolreplication
          and role_row.rolconnlimit = -1
          and role_row.rolvaliduntil is null
          and case role_row.rolname
            when 'anon' then
              role_row.rolinherit and not role_row.rolcanlogin
                and not role_row.rolbypassrls
            when 'authenticated' then
              role_row.rolinherit and not role_row.rolcanlogin
                and not role_row.rolbypassrls
            when 'authenticator' then
              not role_row.rolinherit and role_row.rolcanlogin
                and not role_row.rolbypassrls
            when 'service_role' then
              role_row.rolinherit and not role_row.rolcanlogin
                and role_row.rolbypassrls
            else false
          end
      ) order by role_row.rolname
    ),
    '[]'::jsonb
  ) into v_role_contracts
  from pg_roles role_row
  where role_row.rolname in (
    'anon', 'authenticated', 'authenticator', 'service_role'
  );
  v_role_safe := v_role_contracts = v_expected_role_contracts;
  v_safe := v_safe and v_role_safe;

  if v_postgres_major = 15 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member', member_role.rolname,
          'role', granted_role.rolname,
          'admin_option', membership.admin_option
        ) order by member_role.rolname, granted_role.rolname
      ),
      '[]'::jsonb
    ) into v_role_memberships
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname in (
      'anon', 'authenticated', 'authenticator', 'service_role'
    ) or member_role.rolname in (
      'anon', 'authenticated', 'authenticator', 'service_role'
    );
  else
    -- PostgreSQL 16 split role membership into independently mutable ADMIN,
    -- INHERIT and SET options. Dynamic SQL keeps this function parseable on 15.
    execute $membership_query$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'member', member_role.rolname,
            'role', granted_role.rolname,
            'admin_option', membership.admin_option,
            'inherit_option', membership.inherit_option,
            'set_option', membership.set_option
          ) order by member_role.rolname, granted_role.rolname
        ),
        '[]'::jsonb
      )
      from pg_auth_members membership
      join pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_roles member_role on member_role.oid = membership.member
      where granted_role.rolname in (
        'anon', 'authenticated', 'authenticator', 'service_role'
      ) or member_role.rolname in (
        'anon', 'authenticated', 'authenticator', 'service_role'
      )
    $membership_query$ into v_role_memberships;
  end if;
  v_membership_safe :=
    v_role_memberships = v_expected_role_memberships;
  v_safe := v_safe and v_membership_safe;

  with role_privileges as (
    select
      role_name,
      has_function_privilege(
        role_name,
        'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
        'execute'
      ) as controller_wrapper_execute,
      has_function_privilege(
        role_name,
        'public.fixture_cleanup_transport_probe_v1()',
        'execute'
      ) as transport_probe_execute,
      has_function_privilege(role_name, 'private.fixture_cleanup_legacy_contract_attestation_v1()', 'execute')
        or has_function_privilege(role_name, 'private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])', 'execute')
        or has_function_privilege(role_name, 'private.fixture_cleanup_controller_contract_attestation_v1()', 'execute')
        or has_function_privilege(role_name, 'private.fixture_cleanup_canonical_jsonb_v1(jsonb)', 'execute')
        or has_function_privilege(role_name, 'private.fixture_cleanup_assert_retained_v1()', 'execute')
        or has_function_privilege(role_name, 'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)', 'execute')
        or has_function_privilege(role_name, 'private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)', 'execute')
        as private_helper_execute,
      has_table_privilege(
        role_name,
        'private.fixture_cleanup_controller_keys_v1',
        'select,insert,update,delete,truncate,references,trigger'
      ) as controller_keys_access,
      has_table_privilege(
        role_name,
        'private.fixture_cleanup_execution_receipts_v1',
        'select,insert,update,delete,truncate,references,trigger'
      ) as execution_receipts_access,
      has_table_privilege(
        role_name,
        'private.fixture_cleanup_expected_function_contracts_v1',
        'select,insert,update,delete,truncate,references,trigger'
      ) as expected_contracts_access
    from unnest(array[
      'anon', 'authenticated', 'authenticator', 'service_role'
    ]) role_name
  )
  select jsonb_agg(
    jsonb_build_object(
      'role', role_name,
      'controller_wrapper_execute', controller_wrapper_execute,
      'transport_probe_execute', transport_probe_execute,
      'private_helper_execute', private_helper_execute,
      'controller_keys_access', controller_keys_access,
      'execution_receipts_access', execution_receipts_access,
      'expected_contracts_access', expected_contracts_access,
      'safe',
        controller_wrapper_execute = (role_name = 'service_role')
        and transport_probe_execute = (role_name = 'service_role')
        and not private_helper_execute
        and not controller_keys_access
        and not execution_receipts_access
        and not expected_contracts_access
    ) order by role_name
  ) into v_effective_privileges
  from role_privileges;
  v_effective_safe :=
    v_effective_privileges = v_expected_effective_privileges;
  v_safe := v_safe and v_effective_safe;

  return jsonb_build_object(
    'postgres_major', v_postgres_major,
    'safe', v_safe,
    'functions', v_contracts,
    'tables', v_table_contracts,
    'roles', v_role_contracts,
    'role_memberships', v_role_memberships,
    'effective_privileges', v_effective_privileges
  );
end;
$function$;

revoke all on function
  private.fixture_cleanup_controller_contract_attestation_v1()
  from public, anon, authenticated, service_role;

create or replace function public.fixture_cleanup_transport_probe_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_legacy_contract jsonb;
  v_controller_contract jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'fixture cleanup probe blocked: service role is required'
      using errcode = '42501';
  end if;
  v_legacy_contract := private.fixture_cleanup_legacy_contract_attestation_v1();
  v_controller_contract :=
    private.fixture_cleanup_controller_contract_attestation_v1();
  return jsonb_build_object(
    'role', auth.role(),
    'postgres_major', (v_controller_contract ->> 'postgres_major')::integer,
    'old_public_rpc', to_regprocedure(
      'public.admin_cleanup_fixture_catalog_v1(text,text)'
    ) is not null,
    'ungated_service_execute', has_function_privilege(
      'service_role',
      'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
      'execute'
    ),
    'key_select', has_table_privilege(
      'service_role',
      'private.fixture_cleanup_controller_keys_v1',
      'select'
    ),
    'legacy_definition_sha256', v_legacy_contract ->> 'definition_sha256',
    'legacy_contract_safe', coalesce(
      (v_legacy_contract ->> 'safe')::boolean,
      false
    ),
    'controller_contract_safe', coalesce(
      (v_controller_contract ->> 'safe')::boolean,
      false
    ),
    'controller_contracts', v_controller_contract -> 'functions',
    'controller_table_contracts', v_controller_contract -> 'tables',
    'controller_role_contracts', v_controller_contract -> 'roles',
    'controller_role_memberships',
      v_controller_contract -> 'role_memberships',
    'controller_effective_privileges',
      v_controller_contract -> 'effective_privileges'
  );
end;
$function$;

revoke all on function public.fixture_cleanup_transport_probe_v1()
  from public, anon, authenticated;
grant execute on function public.fixture_cleanup_transport_probe_v1()
  to service_role;

insert into private.fixture_cleanup_expected_function_contracts_v1 (
  contract_name,
  signature,
  expected_sha256,
  expected_security_definer,
  expected_search_path,
  expected_language,
  expected_volatility,
  expected_strict,
  expected_execute_acl
) values
  (
    'legacy_attester',
    'private.fixture_cleanup_legacy_contract_attestation_v1()',
    'c2830bd8f872ae71a94325295e35d7c6283df405f9d65feaff7192dc578203ad', true, '["search_path=pg_catalog"]',
    'plpgsql', 'stable', false,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'canonical_evidence',
    'private.fixture_cleanup_canonical_evidence_v1(jsonb,text[])',
    '79a0862a703d7d0698a6b179157bf4fef0fda58e52471e6efd77f66605eeceab', false, '["search_path=pg_catalog"]',
    'plpgsql', 'stable', true,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'controller_attester',
    'private.fixture_cleanup_controller_contract_attestation_v1()',
    '4e37b8d49d9c60097a2659c4c7fd2c8b162ef8f9a4f0b226431d2d08f61778ef', true, '["search_path=pg_catalog"]',
    'plpgsql', 'stable', false,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'canonical_jsonb',
    'private.fixture_cleanup_canonical_jsonb_v1(jsonb)',
    '6db0a612dc15cb21e0fd39317d87e4e103d0953f2ab5e8d759da39431fa5ad8d', false, '["search_path=pg_catalog"]',
    'plpgsql', 'stable', true,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'assert_retained',
    'private.fixture_cleanup_assert_retained_v1()',
    '1766ff88e3dfaf4b37f3629406c6be1bbed32274e0937e1a4ab7257d715aa612', true, '["search_path=pg_catalog"]',
    'plpgsql', 'volatile', false,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'moved_destructive',
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
    '1f20fcb5390b85bd1ba3d45166e204bdc947e0ef3ea3f3214a16a1c6aef08b30', true, '["search_path=pg_catalog"]',
    'plpgsql', 'volatile', false,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'controller_wrapper',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'f5574da2efc5aaaa9c9e063d380aed273a7e14be0d6de78ad46bffd178a5d141', true, '["search_path=pg_catalog"]',
    'plpgsql', 'volatile', false,
    '[{"grantee":"owner","grantable":false},{"grantee":"service_role","grantable":false}]'
  ),
  (
    'controller_evidence',
    'private.fixture_cleanup_assert_controller_evidence_v1(text,jsonb,jsonb)',
    '9631a9eb83cb21f3c84faddc02c5cd08a33db51be410228590e02df99b4c6380', true, '["search_path=pg_catalog"]',
    'plpgsql', 'volatile', false,
    '[{"grantee":"owner","grantable":false}]'
  ),
  (
    'transport_probe',
    'public.fixture_cleanup_transport_probe_v1()',
    '6a286ad85ab3b904675a0c1a86306bf3c389a30323d09c4f48dca06ef926181b', true, '["search_path=pg_catalog"]',
    'plpgsql', 'stable', false,
    '[{"grantee":"owner","grantable":false},{"grantee":"service_role","grantable":false}]'
  );

do $block$
begin
  if not coalesce(
    (
      private.fixture_cleanup_controller_contract_attestation_v1()
        ->> 'safe'
    )::boolean,
    false
  ) then
    raise exception 'fixture cleanup migration blocked: controller contract mismatch'
      using errcode = '42501';
  end if;
end;
$block$;

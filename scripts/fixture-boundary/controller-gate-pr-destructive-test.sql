begin;

set local lock_timeout = '10s';

delete from private.fixture_cleanup_boundary_v1;
delete from private.fixture_cleanup_retained_v1;
delete from private.fixture_cleanup_execution_receipts_v1;
update private.fixture_cleanup_tables_v1 set expected_count = 0;
update private.fixture_cleanup_tables_v1
set expected_count = 1
where table_name = 'role_groups';

delete from public.role_groups;

insert into public.role_groups (id, name, description) values (
  '00000000-0000-4000-8000-000000000102',
  'sanitized-fixture-role',
  'Deterministic destructive PR fixture'
);

insert into private.fixture_cleanup_boundary_v1 (
  table_name,
  identity,
  identity_key,
  fingerprint_fields,
  row_sha256
)
select
  'role_groups',
  jsonb_build_object('id', row.id::text),
  row.id::text,
  array['created_at', 'description', 'id', 'name', 'updated_at']::text[],
  encode(
    extensions.digest(
      convert_to(
        private.fixture_cleanup_canonical_jsonb_v1(to_jsonb(row)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
from public.role_groups row;

set local session_replication_role = replica;
insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000211');
set local session_replication_role = origin;
insert into public.profiles (id, email, full_name)
values
  ('00000000-0000-4000-8000-000000000201', 'registered@example.test', 'Registered retained identity'),
  ('00000000-0000-4000-8000-000000000211', 'later@example.test', 'Later unregistered identity');
insert into public.audit_log (id, action, entity_type)
values
  ('00000000-0000-4000-8000-000000000203', 'registered-proof', 'fixture-test'),
  ('00000000-0000-4000-8000-000000000213', 'later-proof', 'fixture-test');
insert into private.fixture_cleanup_retained_v1 (kind, id) values
  ('auth_users', '00000000-0000-4000-8000-000000000201'),
  ('profiles', '00000000-0000-4000-8000-000000000201'),
  ('audit_log', '00000000-0000-4000-8000-000000000203');

update private.fixture_cleanup_controller_keys_v1
set is_active = false,
    retired_at = coalesce(retired_at, clock_timestamp())
where is_active and retired_at is null;
insert into private.fixture_cleanup_controller_keys_v1 (
  key_id,
  hmac_secret,
  activated_at,
  is_active
) values (
  'deterministic-pr-v1',
  repeat('deterministic-pr-secret-', 2),
  clock_timestamp() - interval '2 hours',
  true
);

select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  v_manifest_sha constant text :=
    '2ee30597dd997614acc93422d00bbd2874c7438b0dc189d826ea9fbea55c1489';
  v_confirmation constant text :=
    'DELETE-EXACT-BMH-INSTITUTE-FIXTURES:dhvfsyteqsxagokoerrx:2ee30597dd997614acc93422d00bbd2874c7438b0dc189d826ea9fbea55c1489';
  v_secret constant text := repeat('deterministic-pr-secret-', 2);
  v_execution_id constant text := '00000000-0000-4000-8000-000000000301';
  v_malformed_execution_id constant text :=
    '00000000-0000-4000-8000-000000000302';
  v_now timestamptz := clock_timestamp();
  v_approval jsonb;
  v_rollback jsonb;
  v_malformed_approval jsonb;
  v_malformed_rollback jsonb;
  v_result jsonb;
  v_expected_deleted jsonb := jsonb_build_object(
    'answer_options', 0,
    'assignment_submissions', 0,
    'assignments', 0,
    'certificates', 0,
    'content_blocks', 0,
    'course_access', 0,
    'courses', 0,
    'invites', 0,
    'lessons', 0,
    'modules', 0,
    'program_access', 0,
    'program_certificates', 0,
    'program_courses', 0,
    'programs', 0,
    'questions', 0,
    'quizzes', 0,
    'role_groups', 1,
    'role_play_results', 0,
    'user_block_progress', 0,
    'user_course_resume', 0,
    'user_lesson_completions', 0,
    'user_quiz_attempts', 0,
    'user_role_groups', 0,
    'user_video_progress', 0
  );
  v_legacy_definition text;
  v_legacy_attestation_definition text;
begin
  v_rollback := jsonb_build_object(
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'manifest_sha256', v_manifest_sha,
    'captured_at', to_char((v_now - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'backup_id', 'deterministic-pr-backup',
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
    'restore_rehearsal_backup_id', 'deterministic-pr-backup',
    'restore_rehearsed_at', to_char((v_now - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'restore_rehearsal_evidence_sha256', repeat('5', 64),
    'signature_version', 'hmac-sha256-v1',
    'execution_id', v_execution_id,
    'controller_key_id', 'deterministic-pr-v1'
  );
  v_rollback := v_rollback || jsonb_build_object(
    'controller_signature',
    encode(
      extensions.hmac(
        'fixture-cleanup-rollback-v1:'
          || private.fixture_cleanup_canonical_evidence_v1(
            v_rollback,
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
    'controller_key_id', 'deterministic-pr-v1'
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

  v_result := public.admin_cleanup_fixture_catalog_v1(
    v_manifest_sha,
    v_confirmation,
    v_approval,
    v_rollback
  );
  if v_result is distinct from jsonb_build_object(
    'status', 'deleted',
    'deleted', v_expected_deleted
  ) then
    raise exception 'deterministic first cleanup did not return deleted with exact counts: %',
      v_result;
  end if;
  if not exists (
    select 1
    from private.fixture_cleanup_execution_receipts_v1 receipt
    where receipt.execution_id = v_execution_id::uuid
      and receipt.manifest_sha256 = v_manifest_sha
      and receipt.controller_key_id = 'deterministic-pr-v1'
      and receipt.outcome = 'deleted'
  ) or (
    select count(*)
    from private.fixture_cleanup_execution_receipts_v1
    where execution_id = v_execution_id::uuid
  ) <> 1 then
    raise exception 'same-transaction receipt was not exact';
  end if;

  v_result := public.admin_cleanup_fixture_catalog_v1(
    v_manifest_sha,
    v_confirmation,
    v_approval,
    v_rollback
  );
  if v_result is distinct from
    '{"status":"already_deleted","deleted":{}}'::jsonb
    or (
      select count(*)
      from private.fixture_cleanup_execution_receipts_v1
      where execution_id = v_execution_id::uuid
    ) <> 1
  then
    raise exception 'deterministic retry was not exactly already_deleted: %',
      v_result;
  end if;

  insert into public.role_groups (id, name, description) values (
    '00000000-0000-4000-8000-000000000102',
    'sanitized-fixture-role',
    'Deterministic destructive PR fixture'
  );
  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      v_approval,
      v_rollback
    );
    raise exception 'restored boundary identity replay was accepted';
  exception when others then
    if sqlerrm = 'restored boundary identity replay was accepted' then raise; end if;
    if sqlerrm not like '%controller execution evidence was already consumed%' then
      raise exception 'restored boundary identity replay failed for wrong reason: %',
        sqlerrm;
    end if;
  end;
  delete from public.role_groups
  where id = '00000000-0000-4000-8000-000000000102';

  select pg_get_functiondef(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'::regprocedure
  ) into v_legacy_definition;
  select pg_get_functiondef(
    'private.fixture_cleanup_legacy_contract_attestation_v1()'::regprocedure
  ) into v_legacy_attestation_definition;

  execute $mock$
    create or replace function
      private.admin_cleanup_fixture_catalog_v021_without_controller_gate(
        p_manifest_sha256 text,
        p_confirmation text
      )
    returns jsonb
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $body$
    begin
      delete from public.role_groups
      where id = '00000000-0000-4000-8000-000000000199';
      return '{
        "status":"deleted",
        "deleted":{
          "answer_options":0,"assignment_submissions":0,"assignments":0,
          "certificates":0,"content_blocks":0,"course_access":0,
          "courses":0,"invites":0,"lessons":0,"modules":0,
          "program_access":0,"program_certificates":0,"program_courses":0,
          "programs":0,"questions":0,"quizzes":0,"role_groups":2,
          "role_play_results":0,"user_block_progress":0,
          "user_course_resume":0,"user_lesson_completions":0,
          "user_quiz_attempts":0,"user_role_groups":0,
          "user_video_progress":0
        }
      }'::jsonb;
    end;
    $body$
  $mock$;
  execute $mock$
    create or replace function
      private.fixture_cleanup_legacy_contract_attestation_v1()
    returns jsonb
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog
    as $body$
    begin
      return jsonb_build_object('definition_sha256', 'test-double', 'safe', true);
    end;
    $body$
  $mock$;

  -- The reviewed attester now covers both mocked definitions. Point its
  -- owner-only test registry at those exact transactional doubles so the test
  -- reaches the wrapper's result validator rather than failing earlier.
  update private.fixture_cleanup_expected_function_contracts_v1 contract
  set expected_sha256 = encode(
    extensions.digest(
      pg_get_functiondef(to_regprocedure(contract.signature)),
      'sha256'
    ),
    'hex'
  )
  where contract_name in ('legacy_attester', 'moved_destructive');

  insert into public.role_groups (id, name, description) values (
    '00000000-0000-4000-8000-000000000199',
    'rollback-marker',
    'Must survive rejected destructive result contracts'
  );

  v_malformed_rollback := (v_rollback - 'controller_signature')
    || jsonb_build_object('execution_id', v_malformed_execution_id);
  v_malformed_rollback := v_malformed_rollback || jsonb_build_object(
    'controller_signature',
    encode(
      extensions.hmac(
        'fixture-cleanup-rollback-v1:'
          || private.fixture_cleanup_canonical_evidence_v1(
            v_malformed_rollback,
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
    )
  );
  v_malformed_approval := (v_approval - 'controller_signature')
    || jsonb_build_object('execution_id', v_malformed_execution_id);
  v_malformed_approval := v_malformed_approval || jsonb_build_object(
    'controller_signature',
    encode(
      extensions.hmac(
        'fixture-cleanup-approval-v1:'
          || private.fixture_cleanup_canonical_evidence_v1(
            v_malformed_approval,
            array['approved_at']::text[]
          ),
        v_secret,
        'sha256'
      ),
      'hex'
    )
  );

  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha,
      v_confirmation,
      v_malformed_approval,
      v_malformed_rollback
    );
    raise exception 'malformed destructive result was accepted';
  exception when others then
    if sqlerrm = 'malformed destructive result was accepted' then raise; end if;
    if sqlerrm not like '%destructive result contract mismatch%' then
      raise exception 'malformed destructive result failed for wrong reason: %',
        sqlerrm;
    end if;
  end;
  if not exists (
    select 1 from public.role_groups
    where id = '00000000-0000-4000-8000-000000000199'
  ) or exists (
    select 1
    from private.fixture_cleanup_execution_receipts_v1
    where execution_id = v_malformed_execution_id::uuid
  ) then
    raise exception 'malformed destructive result did not roll back';
  end if;

  -- A numeric-only object is still unsafe when its exact frozen key set is
  -- missing a table. Exercise the real wrapper so the mutation and receipt
  -- must both roll back after result validation fails.
  execute $mock$
    create or replace function
      private.admin_cleanup_fixture_catalog_v021_without_controller_gate(
        p_manifest_sha256 text,
        p_confirmation text
      )
    returns jsonb
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $body$
    declare
      v_deleted jsonb;
    begin
      delete from public.role_groups
      where id = '00000000-0000-4000-8000-000000000199';
      select jsonb_object_agg(table_name, expected_count)
        into v_deleted
      from private.fixture_cleanup_tables_v1
      where table_name = any(array[
        'answer_options','assignment_submissions','assignments','certificates',
        'content_blocks','course_access','courses','invites','lessons','modules',
        'program_access','program_certificates','program_courses','programs',
        'questions','quizzes','role_groups','role_play_results',
        'user_block_progress','user_course_resume','user_lesson_completions',
        'user_quiz_attempts','user_role_groups','user_video_progress'
      ]::text[]);
      return jsonb_build_object(
        'status', 'deleted',
        'deleted', v_deleted - 'programs'
      );
    end;
    $body$
  $mock$;
  update private.fixture_cleanup_expected_function_contracts_v1 contract
  set expected_sha256 = encode(extensions.digest(
    pg_get_functiondef(to_regprocedure(contract.signature)), 'sha256'
  ), 'hex')
  where contract_name = 'moved_destructive';

  v_malformed_rollback := (v_rollback - 'controller_signature')
    || jsonb_build_object(
      'execution_id', '00000000-0000-4000-8000-000000000303'
    );
  v_malformed_rollback := v_malformed_rollback || jsonb_build_object(
    'controller_signature', encode(extensions.hmac(
      'fixture-cleanup-rollback-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_malformed_rollback,
          array['backup_verified_live_at','captured_at','restore_rehearsed_at']::text[]
        ),
      v_secret, 'sha256'
    ), 'hex')
  );
  v_malformed_approval := (v_approval - 'controller_signature')
    || jsonb_build_object(
      'execution_id', '00000000-0000-4000-8000-000000000303'
    );
  v_malformed_approval := v_malformed_approval || jsonb_build_object(
    'controller_signature', encode(extensions.hmac(
      'fixture-cleanup-approval-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_malformed_approval, array['approved_at']::text[]
        ),
      v_secret, 'sha256'
    ), 'hex')
  );
  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha, v_confirmation, v_malformed_approval, v_malformed_rollback
    );
    raise exception 'missing numeric result key was accepted';
  exception when others then
    if sqlerrm = 'missing numeric result key was accepted' then raise; end if;
    if sqlerrm not like '%destructive result contract mismatch%' then
      raise exception 'missing numeric result key failed for wrong reason: %', sqlerrm;
    end if;
  end;
  if not exists (
    select 1 from public.role_groups
    where id = '00000000-0000-4000-8000-000000000199'
  ) or exists (
    select 1 from private.fixture_cleanup_execution_receipts_v1
    where execution_id = '00000000-0000-4000-8000-000000000303'
  ) then
    raise exception 'missing numeric result key did not roll back';
  end if;

  -- The inverse case must also fail: every expected numeric key plus one
  -- unreviewed numeric key is not the frozen destructive result contract.
  execute $mock$
    create or replace function
      private.admin_cleanup_fixture_catalog_v021_without_controller_gate(
        p_manifest_sha256 text,
        p_confirmation text
      )
    returns jsonb
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $body$
    declare
      v_deleted jsonb;
    begin
      delete from public.role_groups
      where id = '00000000-0000-4000-8000-000000000199';
      select jsonb_object_agg(table_name, expected_count)
        into v_deleted
      from private.fixture_cleanup_tables_v1
      where table_name = any(array[
        'answer_options','assignment_submissions','assignments','certificates',
        'content_blocks','course_access','courses','invites','lessons','modules',
        'program_access','program_certificates','program_courses','programs',
        'questions','quizzes','role_groups','role_play_results',
        'user_block_progress','user_course_resume','user_lesson_completions',
        'user_quiz_attempts','user_role_groups','user_video_progress'
      ]::text[]);
      return jsonb_build_object(
        'status', 'deleted',
        'deleted', v_deleted || jsonb_build_object('unexpected_table', 0)
      );
    end;
    $body$
  $mock$;
  update private.fixture_cleanup_expected_function_contracts_v1 contract
  set expected_sha256 = encode(extensions.digest(
    pg_get_functiondef(to_regprocedure(contract.signature)), 'sha256'
  ), 'hex')
  where contract_name = 'moved_destructive';

  v_malformed_rollback := (v_rollback - 'controller_signature')
    || jsonb_build_object(
      'execution_id', '00000000-0000-4000-8000-000000000304'
    );
  v_malformed_rollback := v_malformed_rollback || jsonb_build_object(
    'controller_signature', encode(extensions.hmac(
      'fixture-cleanup-rollback-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_malformed_rollback,
          array['backup_verified_live_at','captured_at','restore_rehearsed_at']::text[]
        ),
      v_secret, 'sha256'
    ), 'hex')
  );
  v_malformed_approval := (v_approval - 'controller_signature')
    || jsonb_build_object(
      'execution_id', '00000000-0000-4000-8000-000000000304'
    );
  v_malformed_approval := v_malformed_approval || jsonb_build_object(
    'controller_signature', encode(extensions.hmac(
      'fixture-cleanup-approval-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_malformed_approval, array['approved_at']::text[]
        ),
      v_secret, 'sha256'
    ), 'hex')
  );
  begin
    perform public.admin_cleanup_fixture_catalog_v1(
      v_manifest_sha, v_confirmation, v_malformed_approval, v_malformed_rollback
    );
    raise exception 'extra numeric result key was accepted';
  exception when others then
    if sqlerrm = 'extra numeric result key was accepted' then raise; end if;
    if sqlerrm not like '%destructive result contract mismatch%' then
      raise exception 'extra numeric result key failed for wrong reason: %', sqlerrm;
    end if;
  end;
  if not exists (
    select 1 from public.role_groups
    where id = '00000000-0000-4000-8000-000000000199'
  ) or exists (
    select 1 from private.fixture_cleanup_execution_receipts_v1
    where execution_id = '00000000-0000-4000-8000-000000000304'
  ) then
    raise exception 'extra numeric result key did not roll back';
  end if;

  execute v_legacy_definition;
  execute v_legacy_attestation_definition;

  if (select array_agg(id order by id) from auth.users) is distinct from
      array[
        '00000000-0000-4000-8000-000000000201'::uuid,
        '00000000-0000-4000-8000-000000000211'::uuid
      ]
    or (select array_agg(id order by id) from public.profiles) is distinct from
      array[
        '00000000-0000-4000-8000-000000000201'::uuid,
        '00000000-0000-4000-8000-000000000211'::uuid
      ]
    or (select array_agg(id order by id) from public.audit_log) is distinct from
      array[
        '00000000-0000-4000-8000-000000000203'::uuid,
        '00000000-0000-4000-8000-000000000213'::uuid
      ]
  then
    raise exception 'registered or later unregistered account/audit identity changed';
  end if;
end;
$test$;

rollback;

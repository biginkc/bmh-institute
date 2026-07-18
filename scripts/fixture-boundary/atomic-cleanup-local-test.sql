\set ON_ERROR_STOP on

select set_config('fixture.manifest_sha', :'manifest_sha', false);
select set_config('fixture.confirmation', :'confirmation', false);
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config(
  'fixture.evidence_now',
  to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  false
);

insert into private.fixture_cleanup_controller_keys_v1 (
  key_id, hmac_secret, activated_at, is_active
) values (
  'local-harness-v1',
  repeat('local-harness-controller-secret-', 2),
  clock_timestamp() - interval '2 hours',
  true
);

create function pg_temp.fixture_cleanup_test_call(
  p_manifest_sha text,
  p_confirmation text,
  p_execution_id text default '00000000-0000-4000-8000-000000000036'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := current_setting('fixture.evidence_now')::timestamptz;
  v_secret constant text := repeat('local-harness-controller-secret-', 2);
  v_approval jsonb;
  v_rollback jsonb;
begin
  v_rollback := jsonb_build_object(
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'manifest_sha256', p_manifest_sha,
    'captured_at', to_char((v_now - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'backup_id', 'local-harness-backup',
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
    'restore_rehearsal_backup_id', 'local-harness-backup',
    'restore_rehearsed_at', to_char((v_now - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'restore_rehearsal_evidence_sha256', repeat('5', 64),
    'signature_version', 'hmac-sha256-v1',
    'execution_id', p_execution_id,
    'controller_key_id', 'local-harness-v1'
  );
  v_rollback := v_rollback || jsonb_build_object(
    'controller_signature',
    encode(extensions.hmac(
      'fixture-cleanup-rollback-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_rollback,
          array['backup_verified_live_at','captured_at','restore_rehearsed_at']::text[]
        ),
      v_secret,
      'sha256'
    ), 'hex')
  );
  v_approval := jsonb_build_object(
    'project_ref', 'dhvfsyteqsxagokoerrx',
    'manifest_sha256', p_manifest_sha,
    'approved_by', 'Jarrad Henry',
    'approved_at', to_char((v_now - interval '5 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'recorded_by', 'controller',
    'evidence_sha256', repeat('6', 64),
    'scope', 'fixture_cleanup_after_real_course_acceptance',
    'authorization', 'execute',
    'signature_version', 'hmac-sha256-v1',
    'execution_id', p_execution_id,
    'controller_key_id', 'local-harness-v1'
  );
  v_approval := v_approval || jsonb_build_object(
    'controller_signature',
    encode(extensions.hmac(
      'fixture-cleanup-approval-v1:'
        || private.fixture_cleanup_canonical_evidence_v1(
          v_approval,
          array['approved_at']::text[]
        ),
      v_secret,
      'sha256'
    ), 'hex')
  );
  return public.admin_cleanup_fixture_catalog_v1(
    p_manifest_sha,
    p_confirmation,
    v_approval,
    v_rollback
  );
end;
$function$;

do $$
declare
  v_manifest constant text := current_setting('fixture.manifest_sha');
  v_confirmation constant text := current_setting('fixture.confirmation');
  v_before integer;
begin
  select count(*) into v_before from public.courses;

  begin
    insert into public.modules (id, course_id, title, sort_order)
    values (
      '10000000-0000-4000-8000-000000000001',
      '02c489f6-d43f-43d4-b065-3846feb468f4',
      'Late unmanifested module',
      999
    );
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected an unexplained-reference failure';
  exception when others then
    if sqlerrm not like '%unexplained reference%' then raise; end if;
  end;
  if (select count(*) from public.courses) <> v_before then
    raise exception 'late-dependent failure caused partial deletion';
  end if;

  begin
    update public.courses
      set title = 'Drifted fixture title'
      where id = '02c489f6-d43f-43d4-b065-3846feb468f4';
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a row-drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;
  if (select count(*) from public.courses) <> v_before then
    raise exception 'drift failure caused partial deletion';
  end if;

  begin
    update public.courses
      set thumbnail_path = 'real-artwork/course.webp', content_import_id = 'real-import'
      where id = '02c489f6-d43f-43d4-b065-3846feb468f4';
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a post-capture-field drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;
  if (select count(*) from public.courses) <> v_before then
    raise exception 'post-capture drift failure caused partial deletion';
  end if;

  begin
    alter table public.programs drop column thumbnail_asset_key;
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a migration-020 prerequisite failure';
  exception when others then
    if sqlerrm not like '%migration 020 artwork provenance prerequisite is missing%' then raise; end if;
  end;

  begin
    update public.user_course_resume
      set updated_at = updated_at + interval '1 second'
      where user_id = '0bce714e-9a91-475e-b4a0-6975cd198c30'
        and course_id = 'c188c671-e80b-43e5-91c2-c3cb626ec7e8';
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a timestamp drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;

  begin
    alter table public.courses add column future_real_content text;
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a column-set drift failure';
  exception when others then
    if sqlerrm not like '%column-set drift%' then raise; end if;
  end;

  begin
    create schema fixture_cleanup_probe;
    create table fixture_cleanup_probe.future_course_reference (
      id uuid primary key,
      course_id uuid not null references public.courses(id) on delete cascade
    );
    insert into fixture_cleanup_probe.future_course_reference (id, course_id)
    values (
      '20000000-0000-4000-8000-000000000001',
      '02c489f6-d43f-43d4-b065-3846feb468f4'
    );
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a cross-schema foreign-key failure';
  exception when others then
    if sqlerrm not like '%cross-schema foreign key%' then raise; end if;
  end;

  begin
    update public.assignments
      set rubric = '[{"criterion":"real"}]'::jsonb
      where id = '0dee1efc-2b0c-4fc8-89ee-0e7619929b05';
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a rubric drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;

  begin
    delete from public.answer_options
      where id = '644e5d42-b1d3-49d6-8c71-bfc207e3d74d';
    perform pg_temp.fixture_cleanup_test_call(v_manifest, v_confirmation);
    raise exception 'test expected a partial-state failure';
  exception when others then
    if sqlerrm not like '%partial fixture state%' then raise; end if;
  end;
  if (select count(*) from public.courses) <> v_before then
    raise exception 'partial-state failure caused partial deletion';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has cleanup execute privilege';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has cleanup execute privilege';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing cleanup execute privilege';
  end if;
end;
$$;

set role service_role;
select pg_temp.fixture_cleanup_test_call(:'manifest_sha', :'confirmation');
reset role;

-- A fresh authorization first used while the graph is absent is terminal too.
-- It must be consumed before any fixture row can be restored and replayed.
set role service_role;
select pg_temp.fixture_cleanup_test_call(
  :'manifest_sha',
  :'confirmation',
  '00000000-0000-4000-8000-000000000038'
);
reset role;

do $$
begin
  if not exists (
    select 1
    from private.fixture_cleanup_execution_receipts_v1
    where execution_id = '00000000-0000-4000-8000-000000000038'
      and outcome = 'already_deleted'
  ) then
    raise exception 'absent-first authorization was not consumed';
  end if;
end;
$$;

-- The same signed envelope may retry storage reconciliation only while the
-- database fixture graph remains fully absent.
set role service_role;
select pg_temp.fixture_cleanup_test_call(:'manifest_sha', :'confirmation');
reset role;

insert into public.role_groups (id, name, description)
values (
  '15b6f18b-a353-4f1a-a22d-279925a91f3b',
  'local-replay-probe',
  'must survive a consumed execution envelope'
);

do $$
begin
  begin
    perform pg_temp.fixture_cleanup_test_call(
      current_setting('fixture.manifest_sha'),
      current_setting('fixture.confirmation'),
      '00000000-0000-4000-8000-000000000038'
    );
    raise exception 'replayed controller evidence was accepted';
  exception when others then
    if sqlerrm = 'replayed controller evidence was accepted' then raise; end if;
    if sqlerrm not like '%controller execution evidence was already consumed%' then
      raise exception 'replayed evidence failed for the wrong reason: %', sqlerrm;
    end if;
  end;
  if not exists (
    select 1 from public.role_groups
    where id = '15b6f18b-a353-4f1a-a22d-279925a91f3b'
  ) then
    raise exception 'replay refusal deleted the restored fixture row';
  end if;
end;
$$;

do $$
begin
  if (select count(*) from public.courses) <> 0 then
    raise exception 'fixture courses remain after atomic cleanup';
  end if;
  if (select count(*) from public.profiles) <> 22 then
    raise exception 'profiles were altered by cleanup';
  end if;
  if (select count(*) from auth.users) <> 22 then
    raise exception 'auth users were altered by cleanup';
  end if;
  if (select count(*) from public.audit_log) <> 427 then
    raise exception 'audit history was altered by cleanup';
  end if;
end;
$$;

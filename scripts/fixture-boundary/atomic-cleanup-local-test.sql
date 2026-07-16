\set ON_ERROR_STOP on

select set_config('fixture.manifest_sha', :'manifest_sha', false);
select set_config('fixture.confirmation', :'confirmation', false);

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
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
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
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
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
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
    raise exception 'test expected a post-capture-field drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;
  if (select count(*) from public.courses) <> v_before then
    raise exception 'post-capture drift failure caused partial deletion';
  end if;

  begin
    alter table public.programs drop column thumbnail_asset_key;
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
    raise exception 'test expected a migration-020 prerequisite failure';
  exception when others then
    if sqlerrm not like '%migration 020 artwork provenance prerequisite is missing%' then raise; end if;
  end;

  begin
    update public.user_course_resume
      set updated_at = updated_at + interval '1 second'
      where user_id = '0bce714e-9a91-475e-b4a0-6975cd198c30'
        and course_id = 'c188c671-e80b-43e5-91c2-c3cb626ec7e8';
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
    raise exception 'test expected a timestamp drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;

  begin
    alter table public.courses add column future_real_content text;
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
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
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
    raise exception 'test expected a cross-schema foreign-key failure';
  exception when others then
    if sqlerrm not like '%cross-schema foreign key%' then raise; end if;
  end;

  begin
    update public.assignments
      set rubric = '[{"criterion":"real"}]'::jsonb
      where id = '0dee1efc-2b0c-4fc8-89ee-0e7619929b05';
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
    raise exception 'test expected a rubric drift failure';
  exception when others then
    if sqlerrm not like '%row drift%' then raise; end if;
  end;

  begin
    delete from public.answer_options
      where id = '644e5d42-b1d3-49d6-8c71-bfc207e3d74d';
    perform public.admin_cleanup_fixture_catalog_v1(v_manifest, v_confirmation);
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
    'public.admin_cleanup_fixture_catalog_v1(text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has cleanup execute privilege';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.admin_cleanup_fixture_catalog_v1(text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has cleanup execute privilege';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_cleanup_fixture_catalog_v1(text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing cleanup execute privilege';
  end if;
end;
$$;

set role service_role;
select public.admin_cleanup_fixture_catalog_v1(:'manifest_sha', :'confirmation');
reset role;

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

set role service_role;
select public.admin_cleanup_fixture_catalog_v1(:'manifest_sha', :'confirmation');
reset role;

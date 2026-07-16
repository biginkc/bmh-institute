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

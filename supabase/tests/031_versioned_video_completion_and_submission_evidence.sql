begin;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('bmh.apply_import_id', 'migration-031-acceptance', true);

do $$
begin
  if not has_table_privilege(
    'service_role',
    'public.user_video_completion_history',
    'SELECT, INSERT'
  ) then
    raise exception 'service_role must retain read and append access to video history';
  end if;
  if has_table_privilege(
    'service_role',
    'public.user_video_completion_history',
    'UPDATE'
  ) or has_table_privilege(
    'service_role',
    'public.user_video_completion_history',
    'DELETE'
  ) then
    raise exception 'service_role must not mutate or delete video history';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.user_video_completion_history'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype <> 'r'
  ) then
    raise exception 'video history foreign keys must use ON DELETE RESTRICT';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'user_video_completion_history'
      and policy.cmd <> 'SELECT'
  ) then
    raise exception 'video history must not expose write policies';
  end if;
end;
$$;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '03103103-1031-4031-8031-031031031031',
  'authenticated',
  'authenticated',
  'migration-031-acceptance@bmh.invalid',
  crypt('Migration031Acceptance!Aa1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Migration 031 Acceptance"}'::jsonb,
  now(),
  now()
);

insert into public.role_groups (id, name) values
  ('3011f04d-1ea7-587a-ac02-c6da588d8166', 'Migration 031 acceptance');
insert into public.programs (
  id, title, content_import_id, certificate_enabled
) values (
  '6668cf17-ad0d-51f7-a135-3e90c2616fa9',
  'Migration 031 program',
  'migration-031-acceptance',
  false
);
insert into public.courses (
  id, title, content_import_id, certificate_enabled
) values (
  'd04910a2-f8dd-5e22-a1fd-f6745ac6ba96',
  'Migration 031 course',
  'migration-031-acceptance',
  false
);
insert into public.program_courses (id, program_id, course_id) values (
  '686ebdb0-f372-5128-a0d3-2203b572d294',
  '6668cf17-ad0d-51f7-a135-3e90c2616fa9',
  'd04910a2-f8dd-5e22-a1fd-f6745ac6ba96'
);
insert into public.program_access (id, program_id, role_group_id) values (
  '0efe90e1-484c-52b9-ab35-fe98ed8eb6fb',
  '6668cf17-ad0d-51f7-a135-3e90c2616fa9',
  '3011f04d-1ea7-587a-ac02-c6da588d8166'
);
insert into public.modules (id, course_id, title) values (
  '87136fad-23af-5496-a2eb-d8381ea7ad1d',
  'd04910a2-f8dd-5e22-a1fd-f6745ac6ba96',
  'Migration 031 module'
);
insert into public.lessons (
  id, module_id, title, lesson_type, content_import_id, sort_order
) values
  (
    '8d13c5af-797c-5d1e-a850-69589a969220',
    '87136fad-23af-5496-a2eb-d8381ea7ad1d',
    'Matching video',
    'content',
    'migration-031-acceptance',
    1
  ),
  (
    'd92b3c67-f7d3-51b6-a80f-9612f61043fc',
    '87136fad-23af-5496-a2eb-d8381ea7ad1d',
    'Stale video',
    'content',
    'migration-031-acceptance',
    2
  );
insert into public.content_blocks (
  id, lesson_id, block_type, content, sort_order
) values
  (
    '93c6e93e-a62c-5c23-a667-157c2ad7f9b5',
    '8d13c5af-797c-5d1e-a850-69589a969220',
    'video',
    '{"file_path":"courses/migration-031/matching-v1.mp4","duration_seconds":100}'::jsonb,
    1
  ),
  (
    'a3a7e7e3-4ae4-5133-a910-c526f05173b5',
    'd92b3c67-f7d3-51b6-a80f-9612f61043fc',
    'video',
    '{"file_path":"courses/migration-031/current-v2.mp4","duration_seconds":100}'::jsonb,
    1
  );
select set_config('bmh.apply_import_id', '', true);

insert into public.user_video_progress (
  user_id,
  block_id,
  position_seconds,
  duration_seconds,
  watched_ranges,
  last_observed_position_seconds,
  asset_version
) values
  (
    '03103103-1031-4031-8031-031031031031',
    '93c6e93e-a62c-5c23-a667-157c2ad7f9b5',
    90,
    100,
    '[[0,90]]'::jsonb,
    90,
    'courses/migration-031/matching-v1.mp4#duration=100'
  ),
  (
    '03103103-1031-4031-8031-031031031031',
    'a3a7e7e3-4ae4-5133-a910-c526f05173b5',
    90,
    100,
    '[[0,90]]'::jsonb,
    90,
    'courses/migration-031/stale-v1.mp4#duration=100'
  );
insert into public.user_block_progress (user_id, block_id, asset_version) values
  (
    '03103103-1031-4031-8031-031031031031',
    '93c6e93e-a62c-5c23-a667-157c2ad7f9b5',
    null
  ),
  (
    '03103103-1031-4031-8031-031031031031',
    'a3a7e7e3-4ae4-5133-a910-c526f05173b5',
    null
  );

-- Exercise the migration's guarded legacy reconciliation against both cases.
update public.user_block_progress progress
set asset_version = public.fn_video_asset_version(block.content)
from public.content_blocks block
join public.user_video_progress video_progress
  on video_progress.block_id = block.id
where block.id = progress.block_id
  and block.block_type = 'video'
  and video_progress.user_id = progress.user_id
  and video_progress.asset_version =
    public.fn_video_asset_version(block.content)
  and progress.asset_version is null;

insert into public.user_video_completion_history (
  user_id, block_id, asset_version, completed_at
)
select progress.user_id, progress.block_id, progress.asset_version,
       progress.completed_at
from public.user_block_progress progress
join public.content_blocks block on block.id = progress.block_id
where block.block_type = 'video'
  and progress.asset_version is not null
on conflict (user_id, block_id, asset_version) do nothing;

do $$
declare
  v_matching_version text;
  v_stale_version text;
begin
  select asset_version into v_matching_version
  from public.user_block_progress
  where user_id = '03103103-1031-4031-8031-031031031031'
    and block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';
  select asset_version into v_stale_version
  from public.user_block_progress
  where user_id = '03103103-1031-4031-8031-031031031031'
    and block_id = 'a3a7e7e3-4ae4-5133-a910-c526f05173b5';
  if v_matching_version is distinct from
    'courses/migration-031/matching-v1.mp4#duration=100'
  then
    raise exception 'matching legacy playback did not receive current credit';
  end if;
  if v_stale_version is not null then
    raise exception 'stale legacy playback received replacement-cut credit';
  end if;
  if (
    select count(*)
    from public.user_video_completion_history
    where user_id = '03103103-1031-4031-8031-031031031031'
  ) <> 1 then
    raise exception 'legacy history must contain only the proven current cut';
  end if;
end;
$$;

update public.content_blocks
set content =
  '{"file_path":"courses/migration-031/matching-v2.mp4","duration_seconds":100}'::jsonb
where id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';

do $$
begin
  if public.fn_lesson_is_complete(
    '03103103-1031-4031-8031-031031031031',
    '8d13c5af-797c-5d1e-a850-69589a969220'
  ) then
    raise exception 'replacement cut inherited old completion credit';
  end if;
end;
$$;

insert into public.user_video_completion_history (
  user_id, block_id, asset_version
) values (
  '03103103-1031-4031-8031-031031031031',
  '93c6e93e-a62c-5c23-a667-157c2ad7f9b5',
  'courses/migration-031/matching-v2.mp4#duration=100'
);
update public.user_block_progress
set asset_version = 'courses/migration-031/matching-v2.mp4#duration=100',
    completed_at = now()
where user_id = '03103103-1031-4031-8031-031031031031'
  and block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';

do $$
declare
  v_admin_rows integer;
  v_current_completed_at timestamptz;
begin
  if not public.fn_lesson_is_complete(
    '03103103-1031-4031-8031-031031031031',
    '8d13c5af-797c-5d1e-a850-69589a969220'
  ) then
    raise exception 'replacement re-completion did not restore current credit';
  end if;
  if (
    select count(*)
    from public.user_video_completion_history
    where block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5'
  ) <> 2 then
    raise exception 'replacement re-completion did not retain both cut histories';
  end if;
  select count(*), max(completed_at)
    into v_admin_rows, v_current_completed_at
  from public.fn_admin_lesson_completion_states(
    array['03103103-1031-4031-8031-031031031031'::uuid],
    array[
      '8d13c5af-797c-5d1e-a850-69589a969220'::uuid,
      'd92b3c67-f7d3-51b6-a80f-9612f61043fc'::uuid
    ]
  )
  where is_complete;
  if v_admin_rows <> 1 or v_current_completed_at is null then
    raise exception 'admin batch state did not preserve dynamic completion timing';
  end if;
end;
$$;

do $$
declare
  v_payload jsonb := jsonb_build_object(
    'answer_options', '[]'::jsonb,
    'questions', '[]'::jsonb,
    'content_blocks', jsonb_build_array(
      jsonb_build_object(
        'id', '93c6e93e-a62c-5c23-a667-157c2ad7f9b5',
        'source_key', 'content-block-match'
      ),
      jsonb_build_object(
        'id', 'a3a7e7e3-4ae4-5133-a910-c526f05173b5',
        'source_key', 'content-block-stale'
      )
    ),
    'lessons', jsonb_build_array(
      jsonb_build_object(
        'id', '8d13c5af-797c-5d1e-a850-69589a969220',
        'source_key', 'lesson-match'
      ),
      jsonb_build_object(
        'id', 'd92b3c67-f7d3-51b6-a80f-9612f61043fc',
        'source_key', 'lesson-stale'
      )
    ),
    'assignments', '[]'::jsonb,
    'quizzes', '[]'::jsonb,
    'modules', jsonb_build_array(jsonb_build_object(
      'id', '87136fad-23af-5496-a2eb-d8381ea7ad1d',
      'source_key', 'module'
    )),
    'program_access', jsonb_build_array(jsonb_build_object(
      'id', '0efe90e1-484c-52b9-ab35-fe98ed8eb6fb',
      'source_key', 'program-access'
    )),
    'program_courses', jsonb_build_array(jsonb_build_object(
      'id', '686ebdb0-f372-5128-a0d3-2203b572d294',
      'source_key', 'program-course'
    )),
    'courses', jsonb_build_array(jsonb_build_object(
      'id', 'd04910a2-f8dd-5e22-a1fd-f6745ac6ba96',
      'source_key', 'course'
    )),
    'programs', jsonb_build_array(jsonb_build_object(
      'id', '6668cf17-ad0d-51f7-a135-3e90c2616fa9',
      'source_key', 'program'
    )),
    'role_groups', jsonb_build_array(jsonb_build_object(
      'id', '3011f04d-1ea7-587a-ac02-c6da588d8166',
      'source_key', 'role-group'
    ))
  );
begin
  perform public.fn_rollback_course_import(
    'migration-031-acceptance',
    v_payload
  );
  raise exception 'rollback unexpectedly deleted immutable history';
exception
  when others then
    if sqlerrm !~ 'immutable video completion history exists' then
      raise;
    end if;
end;
$$;

do $$
begin
  begin
    update public.user_video_completion_history
    set completed_at = completed_at + interval '1 second'
    where block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';
    raise exception 'video history update unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;
  begin
    delete from public.user_video_completion_history
    where block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';
    raise exception 'video history delete unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;
  begin
    delete from public.content_blocks
    where id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5';
    raise exception 'content block delete unexpectedly erased immutable history';
  exception
    when foreign_key_violation then null;
  end;
  if (
    select count(*)
    from public.user_video_completion_history
    where block_id = '93c6e93e-a62c-5c23-a667-157c2ad7f9b5'
  ) <> 2 then
    raise exception 'history changed after rejected parent deletion';
  end if;
end;
$$;

rollback;

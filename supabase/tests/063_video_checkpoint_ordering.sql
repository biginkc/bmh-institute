begin;

-- A changed PostgreSQL argument type creates an overload rather than
-- replacing the prior function. Keep the cumulative migration assertion here
-- so the legacy timestamp route cannot remain callable to authenticated users.
do $$
declare
  v_checkpoint_function_count bigint;
begin
  if to_regprocedure(
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,timestamptz)'
  ) is not null then
    raise exception 'legacy timestamp checkpoint overload still exists';
  end if;
  if to_regprocedure(
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)'
  ) is null then
    raise exception 'sequence checkpoint function is missing';
  end if;
  select count(*)
    into v_checkpoint_function_count
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'fn_checkpoint_video_playback';
  if v_checkpoint_function_count <> 1 then
    raise exception 'checkpoint RPC has unexpected overload count: %', v_checkpoint_function_count;
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)',
    'execute'
  ) then
    raise exception 'authenticated is missing the sequence checkpoint RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)',
    'execute'
  ) or has_function_privilege(
    'service_role',
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)',
    'execute'
  ) then
    raise exception 'non-authenticated role can execute the sequence checkpoint RPC';
  end if;
end;
$$;

-- This is an executable migration acceptance test. It uses one learner/video
-- fixture and runs the same two writes in both arrival orders.
select set_config('request.jwt.claim.role', 'authenticated', true);

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
  '06306306-3063-4063-8063-063063063063',
  'authenticated',
  'authenticated',
  'video-checkpoint-ordering@bmh.invalid',
  crypt('VideoCheckpointOrdering!Aa1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Video checkpoint ordering"}'::jsonb,
  now(),
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '06306306-3063-4063-8063-063063063063',
  true
);
insert into public.role_groups (id, name) values (
  '06306306-3063-4063-8063-563063063063',
  'Video checkpoint ordering learners'
);
insert into public.user_role_groups (user_id, role_group_id) values (
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-563063063063'
);
insert into public.courses (id, title, is_published) values (
  '06306306-3063-4063-8063-163063063063',
  'Video checkpoint ordering course',
  true
);
insert into public.course_access (course_id, role_group_id) values (
  '06306306-3063-4063-8063-163063063063',
  '06306306-3063-4063-8063-563063063063'
);
insert into public.modules (id, course_id, title) values (
  '06306306-3063-4063-8063-263063063063',
  '06306306-3063-4063-8063-163063063063',
  'Video checkpoint ordering module'
);
insert into public.lessons (id, module_id, title, lesson_type) values (
  '06306306-3063-4063-8063-363063063063',
  '06306306-3063-4063-8063-263063063063',
  'Video checkpoint ordering lesson',
  'content'
);
insert into public.content_blocks (id, lesson_id, block_type, content) values (
  '06306306-3063-4063-8063-463063063063',
  '06306306-3063-4063-8063-363063063063',
  'video',
  '{"file_path":"tests/video-checkpoint-ordering.mp4","duration_seconds":100}'::jsonb
);

-- Checkpoint arrival first must not make the queued [0,2] observation stale.
select public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  4,
  100,
  0
);
select public.fn_record_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  'observe',
  2,
  100,
  0,
  2
);

do $$
declare
  v_ranges jsonb;
  v_last_at timestamptz;
  v_position numeric;
begin
  select watched_ranges, last_observed_at, position_seconds
    into v_ranges, v_last_at, v_position
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_ranges <> '[[0, 2]]'::jsonb then
    raise exception 'checkpoint-first race dropped legitimate coverage: %', v_ranges;
  end if;
  if v_last_at is null or v_last_at > clock_timestamp() then
    raise exception 'database observation clock became invalid: %', v_last_at;
  end if;
  if v_position <> 4 then
    raise exception 'checkpoint-first arrival regressed the final resume position: %', v_position;
  end if;
  if exists (
    select 1 from public.user_block_progress
    where user_id = '06306306-3063-4063-8063-063063063063'
      and block_id = '06306306-3063-4063-8063-463063063063'
  ) then
    raise exception 'checkpoint or short observation granted completion credit';
  end if;
end;
$$;

-- Reset only the progress row so the same fixture can prove the reverse order.
delete from public.user_video_progress
where user_id = '06306306-3063-4063-8063-063063063063'
  and block_id = '06306306-3063-4063-8063-463063063063';

-- Observation arrival first must retain its coverage when unload arrives later.
select public.fn_record_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  'observe',
  2,
  100,
  0,
  2
);

-- An observation must advance the server ordering sequence. A delayed
-- checkpoint carrying the old sequence cannot regress the resume position.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  8,
  100,
  0
  );
  if v_result ->> 'stale' <> 'true' then
    raise exception 'delayed checkpoint with an old server sequence was accepted: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_position numeric;
begin
  select position_seconds into v_position
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_position <> 2 then
    raise exception 'observation did not block a delayed checkpoint regression: %', v_position;
  end if;
end;
$$;

select public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  4,
  100,
  1
);

do $$
declare
  v_ranges jsonb;
  v_position numeric;
begin
  select watched_ranges, position_seconds
    into v_ranges, v_position
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_ranges <> '[[0, 2]]'::jsonb then
    raise exception 'observation-first race dropped legitimate coverage: %', v_ranges;
  end if;
  if v_position <> 4 then
    raise exception 'checkpoint did not preserve the latest resume position: %', v_position;
  end if;
  if exists (
    select 1 from public.user_block_progress
    where user_id = '06306306-3063-4063-8063-063063063063'
      and block_id = '06306306-3063-4063-8063-463063063063'
  ) then
    raise exception 'unload checkpoint granted completion credit';
  end if;
end;
$$;

-- Replacing the authored asset starts a new progress identity before stale
-- ordering is evaluated. An old marker from the prior asset must not reject
-- the first checkpoint for the replacement, and it must not carry coverage.
update public.content_blocks
set content = '{"file_path":"tests/video-checkpoint-ordering-v2.mp4","duration_seconds":100}'::jsonb
where id = '06306306-3063-4063-8063-463063063063';

select public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  6,
  100,
  0
);

do $$
declare
  v_ranges jsonb;
  v_position numeric;
  v_asset_version text;
begin
  select watched_ranges, position_seconds, asset_version
    into v_ranges, v_position, v_asset_version
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_position <> 6 then
    raise exception 'replacement checkpoint was rejected as stale: %', v_position;
  end if;
  if v_ranges <> '[]'::jsonb then
    raise exception 'asset replacement carried watched coverage forward: %', v_ranges;
  end if;
  if v_asset_version <> 'tests/video-checkpoint-ordering-v2.mp4#duration=100' then
    raise exception 'replacement checkpoint kept the prior asset version: %', v_asset_version;
  end if;
end;
$$;

-- A late checkpoint carrying the old server sequence must remain stale even
-- when database updated_at is newer.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  9,
  100,
  0
  );
  if v_result ->> 'stale' <> 'true' then
    raise exception 'late checkpoint with an old server sequence was accepted: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_position numeric;
begin
  select position_seconds into v_position
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_position <> 6 then
    raise exception 'stale checkpoint overwrote a newer resume position: %', v_position;
  end if;
end;
$$;

rollback;

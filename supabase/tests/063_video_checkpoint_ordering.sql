begin;

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
  clock_timestamp() + interval '90 seconds'
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
begin
  select watched_ranges, last_observed_at
    into v_ranges, v_last_at
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_ranges <> '[[0, 2]]'::jsonb then
    raise exception 'checkpoint-first race dropped legitimate coverage: %', v_ranges;
  end if;
  if v_last_at is null or v_last_at > clock_timestamp() then
    raise exception 'positive client clock skew became the observation baseline: %', v_last_at;
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
select public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  4,
  100,
  clock_timestamp() + interval '90 seconds'
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

-- A late older checkpoint must remain stale even when database updated_at is
-- newer because the client-ordering field is independent of server time.
select public.fn_checkpoint_video_playback(
  '06306306-3063-4063-8063-063063063063',
  '06306306-3063-4063-8063-463063063063',
  9,
  100,
  clock_timestamp() - interval '1 hour'
);

do $$
declare
  v_position numeric;
begin
  select position_seconds into v_position
  from public.user_video_progress
  where user_id = '06306306-3063-4063-8063-063063063063'
    and block_id = '06306306-3063-4063-8063-463063063063';
  if v_position <> 4 then
    raise exception 'stale checkpoint overwrote a newer resume position: %', v_position;
  end if;
end;
$$;

rollback;

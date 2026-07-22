-- Keep the grading result from the moment an answer is locked so later answer
-- key edits cannot disclose material that was private when the learner answered.

set lock_timeout = '10s';

begin;

-- The production fixture-cleanup boundary fingerprints this table. Verify its
-- pre-migration rows before evolving that boundary so this migration cannot
-- accidentally bless unrelated drift.
do $$
declare
  v_total integer;
  v_present integer;
  v_expected record;
  v_current_row jsonb;
  v_projection jsonb;
  v_current_hash text;
begin
  if to_regclass('private.fixture_cleanup_boundary_v1') is null then
    return;
  end if;

  select count(*) into v_total
  from private.fixture_cleanup_boundary_v1
  where table_name = 'user_quiz_attempts';

  select count(*) into v_present
  from private.fixture_cleanup_boundary_v1 boundary
  join public.user_quiz_attempts attempt
    on attempt.id::text = boundary.identity ->> 'id'
  where boundary.table_name = 'user_quiz_attempts';

  if v_present <> 0 and v_present <> v_total then
    raise exception 'fixture cleanup blocked: partial pre-migration quiz-attempt state';
  end if;

  for v_expected in
    select boundary.*
    from private.fixture_cleanup_boundary_v1 boundary
    join public.user_quiz_attempts attempt
      on attempt.id::text = boundary.identity ->> 'id'
    where boundary.table_name = 'user_quiz_attempts'
  loop
    select to_jsonb(attempt) into strict v_current_row
    from public.user_quiz_attempts attempt
    where attempt.id::text = v_expected.identity ->> 'id';

    select jsonb_object_agg(field, v_current_row -> field)
      into v_projection
    from unnest(v_expected.fingerprint_fields) field;

    v_current_hash := encode(
      extensions.digest(
        convert_to(
          private.fixture_cleanup_canonical_jsonb_v1(v_projection),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if v_current_hash <> v_expected.row_sha256 then
      raise exception 'fixture cleanup blocked: pre-migration quiz-attempt row drift %',
        v_expected.identity_key;
    end if;
  end loop;
end;
$$;

alter table public.user_quiz_attempts
  add column if not exists answer_results jsonb not null default '{}'::jsonb,
  add column if not exists grading_snapshot_state text not null default 'native';

alter table public.user_quiz_attempts
  drop constraint if exists user_quiz_attempts_grading_snapshot_state_check;
alter table public.user_quiz_attempts
  add constraint user_quiz_attempts_grading_snapshot_state_check
  check (grading_snapshot_state in (
    'native', 'legacy_backfilled', 'legacy_summary_only'
  ));

lock table public.user_quiz_attempts in share row exclusive mode;
lock table public.questions, public.answer_options in share mode;

-- A completed legacy attempt has only one trustworthy result: its stored score
-- and pass/fail outcome. Never reconstruct per-question correctness after keys,
-- points, or questions may have changed.
update public.user_quiz_attempts
set answer_results = '{}'::jsonb,
    grading_snapshot_state = 'legacy_summary_only'
where completed_at is not null;

-- Incomplete attempts must still be structurally resumable. Fail the whole
-- migration instead of consuming or silently rewriting an unusable attempt.
do $$
begin
  if exists (
    select 1
    from public.user_quiz_attempts attempt
    where attempt.completed_at is null
      and (
        jsonb_typeof(attempt.question_order) is distinct from 'array'
        or jsonb_typeof(attempt.answer_orders) is distinct from 'object'
        or jsonb_typeof(attempt.responses) is distinct from 'object'
      )
  ) then
    raise exception 'Incomplete legacy quiz attempts contain malformed saved state; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    where attempt.completed_at is null
      and (
        jsonb_array_length(attempt.question_order) = 0
        or jsonb_array_length(attempt.question_order) <> (
          select count(distinct question_id)
          from jsonb_array_elements_text(attempt.question_order) question_id
        )
      )
  ) then
    raise exception 'Incomplete legacy quiz attempts contain malformed saved state; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    cross join lateral
      jsonb_array_elements_text(attempt.question_order) saved(question_id)
    left join public.questions question
      on question.id::text = saved.question_id
     and question.quiz_id = attempt.quiz_id
    where attempt.completed_at is null
      and question.id is null
  ) then
    raise exception 'Incomplete legacy quiz attempts reference unavailable questions; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    cross join lateral
      jsonb_array_elements_text(attempt.question_order) saved(question_id)
    where attempt.completed_at is null
      and jsonb_typeof(attempt.answer_orders -> saved.question_id)
        is distinct from 'array'
  ) then
    raise exception 'Incomplete legacy quiz attempts reference unavailable answer options; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    cross join lateral
      jsonb_array_elements_text(attempt.question_order) saved(question_id)
    where attempt.completed_at is null
      and (
        jsonb_array_length(attempt.answer_orders -> saved.question_id) = 0
        or jsonb_array_length(attempt.answer_orders -> saved.question_id) <> (
          select count(distinct option_id)
          from jsonb_array_elements_text(
            attempt.answer_orders -> saved.question_id
          ) option_id
        )
        or exists (
          select 1
          from jsonb_array_elements_text(
            attempt.answer_orders -> saved.question_id
          ) option_id
          left join public.answer_options option
            on option.id::text = option_id
           and option.question_id::text = saved.question_id
          where option.id is null
        )
      )
  ) then
    raise exception 'Incomplete legacy quiz attempts reference unavailable answer options; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    cross join lateral
      jsonb_each(attempt.responses) response(question_id, selected)
    where attempt.completed_at is null
      and jsonb_typeof(response.selected) is distinct from 'array'
  ) then
    raise exception 'Incomplete legacy quiz attempts contain invalid responses; remediation is required before migration.';
  end if;

  if exists (
    select 1
    from public.user_quiz_attempts attempt
    cross join lateral
      jsonb_each(attempt.responses) response(question_id, selected)
    where attempt.completed_at is null
      and (
        jsonb_array_length(response.selected) = 0
        or jsonb_array_length(response.selected) <> (
          select count(distinct option_id)
          from jsonb_array_elements_text(response.selected) option_id
        )
        or not attempt.question_order ? response.question_id
        or (
          (select question.question_type
           from public.questions question
           where question.id::text = response.question_id)
            <> 'multi_select'
          and jsonb_array_length(response.selected) <> 1
        )
        or exists (
          select 1
          from jsonb_array_elements_text(response.selected) option_id
          where not coalesce(
            (attempt.answer_orders -> response.question_id) ? option_id,
            false
          )
        )
      )
  ) then
    raise exception 'Incomplete legacy quiz attempts contain invalid responses; remediation is required before migration.';
  end if;
end;
$$;

-- Existing incomplete responses predate immutable per-question evidence.
-- Grade them once against the deployment-time key, but deliberately omit
-- authored explanation text even for a legacy-correct answer.
update public.user_quiz_attempts attempt
set answer_results = coalesce((
  select jsonb_object_agg(
    response.key,
    jsonb_build_object(
      'is_correct', grading.is_correct,
      'points', coalesce(question.points, 1),
      'question_type', question.question_type
    ) || case
      when grading.is_correct then jsonb_build_object('explanation', null)
      else '{}'::jsonb
    end
    order by response.key
  )
  from jsonb_each(attempt.responses) response
  join public.questions question
    on question.id = response.key::uuid
    and question.quiz_id = attempt.quiz_id
  cross join lateral (
    select case
      when question.question_type = 'multi_select' then
        array(
          select selected
          from jsonb_array_elements_text(response.value) selected
          order by selected
        ) = array(
          select option.id::text
          from public.answer_options option
          where option.question_id = question.id
            and option.is_correct = true
          order by option.id::text
        )
      else
        jsonb_array_length(response.value) = 1
        and response.value ->> 0 = any(array(
          select option.id::text
          from public.answer_options option
          where option.question_id = question.id
            and option.is_correct = true
          order by option.id::text
        ))
    end as is_correct
  ) grading
), '{}'::jsonb),
    grading_snapshot_state = 'legacy_backfilled'
where attempt.completed_at is null;

drop policy if exists user_quiz_attempts_self_read
  on public.user_quiz_attempts;
create policy user_quiz_attempts_self_read on public.user_quiz_attempts
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.fn_actor_may_access_catalog_entity_v1(
      auth.uid(), 'lessons', lesson_id
    )
    and public.fn_lesson_is_unlocked(user_id, lesson_id)
  );
grant select on public.user_quiz_attempts to authenticated;

-- Advance the human-reviewed fixture manifest and every database-side checksum
-- binding atomically. Exact before/after hashes prevent this migration from
-- authorizing deletion of a row that drifted before the schema change.
do $$
declare
  v_expected record;
  v_boundary private.fixture_cleanup_boundary_v1%rowtype;
  v_attempt public.user_quiz_attempts%rowtype;
  v_old_fields text[] := array[
    'answer_orders', 'completed_at', 'id', 'lesson_id', 'passed',
    'question_order', 'quiz_id', 'responses', 'score', 'started_at', 'user_id'
  ]::text[];
  v_new_fields text[] := array[
    'answer_orders', 'answer_results', 'completed_at',
    'grading_snapshot_state', 'id', 'lesson_id', 'passed', 'question_order',
    'quiz_id', 'responses', 'score', 'started_at', 'user_id'
  ]::text[];
  v_old_hash text;
  v_new_hash text;
  v_live_count integer;
  v_moved_definition text;
  v_moved_definition_sha text;
  v_old_moved_definition_sha text;
  v_attester_definition text;
  v_attester_definition_sha text;
  v_old_attester_definition_sha text;
  v_occurrences integer;
  v_old_manifest_sha constant text :=
    '2ee30597dd997614acc93422d00bbd2874c7438b0dc189d826ea9fbea55c1489';
  v_new_manifest_sha constant text :=
    '84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528';
begin
  if to_regclass('private.fixture_cleanup_boundary_v1') is null then
    return;
  end if;

  if to_regprocedure(
      'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'
    ) is null
    or to_regprocedure(
      'private.fixture_cleanup_legacy_contract_attestation_v1()'
    ) is null
  then
    raise exception 'quiz privacy migration blocked: fixture cleanup contract prerequisite is missing';
  end if;

  select count(*) into strict v_live_count
  from public.user_quiz_attempts attempt
  join private.fixture_cleanup_boundary_v1 boundary
    on boundary.table_name = 'user_quiz_attempts'
   and boundary.identity_key = attempt.id::text;
  if v_live_count not in (0, 11) then
    raise exception 'quiz privacy migration blocked: partial fixture quiz-attempt state';
  end if;

  for v_expected in
    select * from (values
      ('0661a1b9-e84c-44de-a4bb-e895a5e30391'::uuid, '2fa90621534436292c0a95970688d531d12bd8461ee36adee12ec3c4ebc72bd7', 'd60fe5c928cd101d2ccd24f3c44d8cf59c4f5a71f94be456c9b4da1a2662388f'),
      ('09f64a7b-91b5-42a9-be05-8ac8088de2a6'::uuid, '3fe04155847e3e30c0c940bbd5319ee71d828f2de6a63196fdd7dc715104362f', 'ae56413b3005e4d8cb91a5b5a282d2f562dc57db009e7673d39e9b63b5b7df21'),
      ('1e369174-67cd-402b-a1fd-d3cf87e89f0f'::uuid, '09dae33dff4dc567c848347453d84c23a2fa3ab3b151dfc1d5c6e98dad3f80c7', '6c152501c55c0233ae17839bb92f26675daf64540f94b6791420d3f966fcf293'),
      ('2ac8983c-42d5-4003-bbb1-7ebde41b0f0e'::uuid, 'ebf6511b80329bfe8ac3b971b824032901e5b61ba14ee3eb1d170e6ce8c1fcaf', '865364302df3c8859c69a190a8164784a4f1450857eb6f5bdb6fcb94098a6724'),
      ('399bdc9e-54ab-480e-98e8-902d1353f0bb'::uuid, '724214ab6441450be6d26a4c00e983f4f82e972983224126d8c408fa007be712', '216840467946f6d248c6401c1d66c955e7a6c2449966dceb83af7ab987fc089a'),
      ('8955f32a-9395-4774-8616-4a45ea05f450'::uuid, '5543567358734850c10a0decb9b5d79bb6f8a38cc5132bab1b4d2d465d8cdebb', 'ccff2c46fc7533add704dceceae096a8f044b4e54391cdc8d63fc443274dccc8'),
      ('95e7e06c-1a7a-46c0-b782-3ca340410756'::uuid, '4a7ac106c31b4c65e0c7ec83faefe632a4516482e343cf84f37e4683cc0f0064', 'cc0168fd5346e69482208e0603579b12aaaaaa2d448f2b32b79818aa52abb8d1'),
      ('bb06223a-8adf-4e3a-8b68-9660911b29b2'::uuid, '7843c80093a9f10ff36a3c1c2581912481783e5fcbf3cfdf8f40f3ebe9402316', 'cb2ec232b1defe48e02f72c319dd806ec367506b102e794c34b41d4881a2ad0b'),
      ('bceb2eb8-d083-4617-92f1-51c5c04e8e67'::uuid, '5a79194ad64566a0cf835572c450c547fccb8caddd6dddc3b5285f4e1679148d', '9918bbcfa7ce9dd19b4a967f0da57d36a540f63c3407e57c8bc7cda069cf1904'),
      ('bd7b600b-d1de-4f11-b039-f06a6efcb768'::uuid, '11ac3ef35c78cc5540a2aa7c7d203e7e544014481ecb16c6bba5bfe92a15a0d2', '119c9ad3f4e25e944ef1bfd08d8ecb489e1929939c5c471adf42c717f2e3f868'),
      ('ddd39588-a941-4a90-b98c-893392765b8a'::uuid, 'b8143781dfaf6f2324c5802415ae9829788d1783bc62e66e902d1030736fcd72', 'c48a07cf8f3bf445016ba1059b556886cbc194990bef1ceabe4033b76ec001c4')
    ) expected(id, old_hash, new_hash)
  loop
    select * into strict v_boundary
    from private.fixture_cleanup_boundary_v1
    where table_name = 'user_quiz_attempts'
      and identity_key = v_expected.id::text;

    if v_boundary.fingerprint_fields is distinct from v_old_fields
      or v_boundary.row_sha256 <> v_expected.old_hash
    then
      raise exception 'quiz privacy migration blocked: prior fixture boundary drift for %', v_expected.id;
    end if;

    if v_live_count = 11 then
      select * into strict v_attempt
      from public.user_quiz_attempts
      where id = v_expected.id;
      select encode(extensions.digest(convert_to(
        private.fixture_cleanup_canonical_jsonb_v1((
          select jsonb_object_agg(field, to_jsonb(v_attempt) -> field)
          from unnest(v_old_fields) field
        )), 'UTF8'), 'sha256'), 'hex') into strict v_old_hash;
      select encode(extensions.digest(convert_to(
        private.fixture_cleanup_canonical_jsonb_v1((
          select jsonb_object_agg(field, to_jsonb(v_attempt) -> field)
          from unnest(v_new_fields) field
        )), 'UTF8'), 'sha256'), 'hex') into strict v_new_hash;
      if v_old_hash <> v_expected.old_hash
        or v_new_hash <> v_expected.new_hash
      then
        raise exception 'quiz privacy migration blocked: live fixture row drift for %', v_expected.id;
      end if;
    end if;

    update private.fixture_cleanup_boundary_v1
    set fingerprint_fields = v_new_fields,
        row_sha256 = v_expected.new_hash
    where table_name = 'user_quiz_attempts'
      and identity_key = v_expected.id::text;
  end loop;

  select expected_sha256 into strict v_old_moved_definition_sha
  from private.fixture_cleanup_expected_function_contracts_v1
  where contract_name = 'moved_destructive';
  select pg_get_functiondef(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'::regprocedure
  ) into strict v_moved_definition;
  if encode(extensions.digest(v_moved_definition, 'sha256'), 'hex')
      <> v_old_moved_definition_sha
  then
    raise exception 'quiz privacy migration blocked: moved cleanup definition drift';
  end if;
  v_occurrences := (
    length(v_moved_definition) -
    length(replace(v_moved_definition, v_old_manifest_sha, ''))
  ) / length(v_old_manifest_sha);
  if v_occurrences <> 2 or position(v_new_manifest_sha in v_moved_definition) > 0 then
    raise exception 'quiz privacy migration blocked: legacy manifest contract mismatch';
  end if;
  execute replace(v_moved_definition, v_old_manifest_sha, v_new_manifest_sha);

  select encode(extensions.digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex')
    into strict v_moved_definition_sha
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'
  );

  select expected_sha256 into strict v_old_attester_definition_sha
  from private.fixture_cleanup_expected_function_contracts_v1
  where contract_name = 'legacy_attester';
  select pg_get_functiondef(
    'private.fixture_cleanup_legacy_contract_attestation_v1()'::regprocedure
  ) into strict v_attester_definition;
  if encode(extensions.digest(v_attester_definition, 'sha256'), 'hex')
      <> v_old_attester_definition_sha
  then
    raise exception 'quiz privacy migration blocked: legacy attester definition drift';
  end if;
  v_occurrences := (
    length(v_attester_definition) -
    length(replace(v_attester_definition, v_old_moved_definition_sha, ''))
  ) / length(v_old_moved_definition_sha);
  if v_occurrences <> 1 then
    raise exception 'quiz privacy migration blocked: legacy attester contract mismatch';
  end if;
  execute replace(
    v_attester_definition,
    v_old_moved_definition_sha,
    v_moved_definition_sha
  );

  select encode(extensions.digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex')
    into strict v_attester_definition_sha
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'private.fixture_cleanup_legacy_contract_attestation_v1()'
  );

  update private.fixture_cleanup_expected_function_contracts_v1
  set expected_sha256 = v_moved_definition_sha
  where contract_name = 'moved_destructive'
    and expected_sha256 = v_old_moved_definition_sha;
  if not found then
    raise exception 'quiz privacy migration blocked: moved contract registry mismatch';
  end if;
  update private.fixture_cleanup_expected_function_contracts_v1
  set expected_sha256 = v_attester_definition_sha
  where contract_name = 'legacy_attester'
    and expected_sha256 = v_old_attester_definition_sha;
  if not found then
    raise exception 'quiz privacy migration blocked: attester contract registry mismatch';
  end if;

  if not coalesce(
      (private.fixture_cleanup_legacy_contract_attestation_v1() ->> 'safe')::boolean,
      false
    )
    or not coalesce(
      (private.fixture_cleanup_controller_contract_attestation_v1() ->> 'safe')::boolean,
      false
    )
  then
    raise exception 'quiz privacy migration failed: controller contract attestation is not safe';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.user_quiz_attempts attempt
    where attempt.grading_snapshot_state <> 'legacy_summary_only'
      and exists (
      select 1
      from jsonb_object_keys(attempt.responses) response(question_id)
      where not attempt.answer_results ? response.question_id
    )
  ) then
    raise exception 'This attempt has no stored grading result.';
  end if;
  if exists (
    select 1
    from public.user_quiz_attempts attempt,
      lateral jsonb_each(attempt.answer_results) result
    where result.value ->> 'is_correct' = 'false'
      and result.value ? 'explanation'
  ) then
    raise exception 'A missed-question snapshot contains an explanation.';
  end if;
end;
$$;

drop function public.fn_record_quiz_answer(uuid, uuid, text[]);

create function public.fn_record_quiz_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected text[]
)
returns table (
  responses jsonb,
  answer_results jsonb,
  completed_at timestamptz,
  already_answered boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.user_quiz_attempts%rowtype;
  v_question_type text;
  v_explanation text;
  v_points integer;
  v_stored text[];
  v_selected_sorted text[];
  v_correct_sorted text[];
  v_is_correct boolean;
  v_answer_result jsonb;
begin
  select attempt.*
    into v_attempt
  from public.user_quiz_attempts attempt
  where attempt.id = p_attempt_id
  for update;

  if not found
    or not (
      coalesce(auth.role(), '') = 'service_role'
      or auth.uid() = v_attempt.user_id
    )
  then
    raise exception 'Attempt not found.';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and (
      not public.fn_actor_may_access_catalog_entity_v1(
        auth.uid(),
        'lessons',
        v_attempt.lesson_id
      )
      or not public.fn_lesson_is_unlocked(
        v_attempt.user_id,
        v_attempt.lesson_id
      )
    )
  then
    raise exception 'Attempt not found.';
  end if;
  if v_attempt.completed_at is not null then
    raise exception 'This attempt has already been submitted.';
  end if;
  if not coalesce(v_attempt.question_order ? p_question_id::text, false) then
    raise exception 'The response contains a question outside this attempt.';
  end if;

  select
    question.question_type,
    question.explanation,
    coalesce(question.points, 1),
    coalesce(
      array_agg(option.id::text order by option.id::text)
        filter (where option.is_correct = true),
      '{}'::text[]
    )
    into v_question_type, v_explanation, v_points, v_correct_sorted
  from public.questions question
  left join public.answer_options option
    on option.question_id = question.id
  where question.id = p_question_id
    and question.quiz_id = v_attempt.quiz_id
  group by
    question.id,
    question.question_type,
    question.explanation,
    question.points;

  if v_question_type is null then
    raise exception 'This attempt contains unavailable questions.';
  end if;
  if p_selected is null
    or cardinality(p_selected) = 0
    or (v_question_type <> 'multi_select' and cardinality(p_selected) <> 1)
    or exists (select 1 from unnest(p_selected) selected where selected is null)
    or cardinality(p_selected) <>
      (select count(distinct selected) from unnest(p_selected) selected)
  then
    raise exception 'A response contains invalid or duplicate answers.';
  end if;
  if exists (
    select 1
    from unnest(p_selected) selected
    where not coalesce(
      (v_attempt.answer_orders -> p_question_id::text) ? selected,
      false
    )
  ) then
    raise exception 'The response contains an answer outside this attempt.';
  end if;

  select array_agg(selected order by selected)
    into v_selected_sorted
  from unnest(p_selected) selected;

  if coalesce(v_attempt.responses, '{}'::jsonb) ? p_question_id::text then
    select array_agg(selected order by selected)
      into v_stored
    from jsonb_array_elements_text(
      v_attempt.responses -> p_question_id::text
    ) selected;

    if v_stored is not distinct from v_selected_sorted then
      if not coalesce(v_attempt.answer_results, '{}'::jsonb) ? p_question_id::text then
        raise exception 'This attempt has no stored grading result.';
      end if;
      return query
      select
        v_attempt.responses,
        v_attempt.answer_results,
        v_attempt.completed_at,
        true;
      return;
    end if;
    raise exception 'This question has already been answered.';
  end if;

  if v_question_type = 'multi_select' then
    v_is_correct := v_selected_sorted = v_correct_sorted;
  else
    v_is_correct := cardinality(v_selected_sorted) = 1
      and v_selected_sorted[1] = any(v_correct_sorted);
  end if;

  v_answer_result := jsonb_build_object(
    'is_correct', v_is_correct,
    'points', v_points,
    'question_type', v_question_type
  );
  if v_is_correct then
    v_answer_result := v_answer_result
      || jsonb_build_object('explanation', v_explanation);
  end if;

  update public.user_quiz_attempts attempt
  set responses = coalesce(attempt.responses, '{}'::jsonb)
      || jsonb_build_object(p_question_id::text, to_jsonb(p_selected)),
    answer_results = coalesce(attempt.answer_results, '{}'::jsonb)
      || jsonb_build_object(p_question_id::text, v_answer_result)
  where attempt.id = p_attempt_id
  returning attempt.responses, attempt.answer_results, attempt.completed_at
    into v_attempt.responses, v_attempt.answer_results, v_attempt.completed_at;

  return query
  select
    v_attempt.responses,
    v_attempt.answer_results,
    v_attempt.completed_at,
    false;
end;
$$;

revoke all on function public.fn_record_quiz_answer(uuid, uuid, text[])
  from public, anon;
grant execute on function public.fn_record_quiz_answer(uuid, uuid, text[])
  to authenticated, service_role;

comment on function public.fn_record_quiz_answer(uuid, uuid, text[]) is
  'Atomically records a learner answer and immutable privacy-safe grading result after current access checks.';

commit;

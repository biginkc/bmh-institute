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
  add column if not exists answer_results jsonb not null default '{}'::jsonb;

lock table public.user_quiz_attempts in share row exclusive mode;
lock table public.questions, public.answer_options in share mode;

-- Existing responses predate immutable per-question evidence. Grade them once
-- against the deployment-time key, but deliberately omit authored explanation
-- text even for a legacy-correct answer. That preserves locked feedback and
-- scoring without risking disclosure from an unknown historical key version.
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
), '{}'::jsonb)
where jsonb_typeof(attempt.responses) = 'object';

-- Evolve the cleanup boundary only after verifying its previous fingerprints.
-- Rehash rows that still exist; rows already removed retain unused hashes.
do $$
declare
  v_fields text[] := array[
    'answer_orders', 'answer_results', 'completed_at', 'id', 'lesson_id',
    'passed', 'question_order', 'quiz_id', 'responses', 'score', 'started_at',
    'user_id'
  ]::text[];
begin
  if to_regclass('private.fixture_cleanup_boundary_v1') is null then
    return;
  end if;

  update private.fixture_cleanup_boundary_v1
  set fingerprint_fields = v_fields
  where table_name = 'user_quiz_attempts';

  update private.fixture_cleanup_boundary_v1 boundary
  set row_sha256 = encode(
    extensions.digest(
      convert_to(
        private.fixture_cleanup_canonical_jsonb_v1((
          select jsonb_object_agg(field, to_jsonb(attempt) -> field)
          from unnest(v_fields) field
        )),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.user_quiz_attempts attempt
  where boundary.table_name = 'user_quiz_attempts'
    and attempt.id::text = boundary.identity ->> 'id';
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.user_quiz_attempts attempt
    where exists (
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

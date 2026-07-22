-- Keep the grading result from the moment an answer is locked so later answer
-- key edits cannot disclose material that was private when the learner answered.

set lock_timeout = '10s';

alter table public.user_quiz_attempts
  add column if not exists answer_results jsonb not null default '{}'::jsonb;

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

  select question.question_type, question.explanation
    into v_question_type, v_explanation
  from public.questions question
  where question.id = p_question_id
    and question.quiz_id = v_attempt.quiz_id;

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
      if not coalesce(v_attempt.answer_results, '{}'::jsonb)
        ? p_question_id::text
      then
        update public.user_quiz_attempts attempt
        set answer_results = coalesce(attempt.answer_results, '{}'::jsonb)
          || jsonb_build_object(
            p_question_id::text,
            jsonb_build_object('is_correct', false)
          )
        where attempt.id = p_attempt_id
        returning attempt.answer_results into v_attempt.answer_results;
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

  select coalesce(array_agg(option.id::text order by option.id::text), '{}'::text[])
    into v_correct_sorted
  from public.answer_options option
  where option.question_id = p_question_id
    and option.is_correct = true;

  if v_question_type = 'multi_select' then
    v_is_correct := v_selected_sorted = v_correct_sorted;
  else
    v_is_correct := cardinality(v_selected_sorted) = 1
      and v_selected_sorted[1] = any(v_correct_sorted);
  end if;

  v_answer_result := jsonb_build_object('is_correct', v_is_correct);
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

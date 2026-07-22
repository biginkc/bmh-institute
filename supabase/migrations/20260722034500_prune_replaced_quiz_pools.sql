-- Reconcile a replaced quiz pool on one unreleased deterministic import.
-- The retained IDs are digest-bound, must already belong to the exact import,
-- and pruning is refused while any quiz attempt or reviewer-authored option exists.

set lock_timeout = '10s';

create or replace function public.fn_prune_replaced_quiz_pools_v1(
  p_import_id text,
  p_retain_question_ids uuid[],
  p_retain_option_ids uuid[],
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_ids uuid[];
  v_option_ids uuid[];
  v_quiz_ids uuid[];
  v_lesson_ids uuid[];
  v_extra_question_ids uuid[];
  v_extra_option_ids uuid[];
  v_contract_sha256 text;
  v_deleted_questions integer := 0;
  v_deleted_options integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Replaced quiz-pool pruning requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Replaced quiz-pool pruning refused: invalid import_id.'
      using errcode = '22023';
  end if;
  if p_retain_question_ids is null or p_retain_option_ids is null
    or cardinality(p_retain_question_ids) < 1
    or cardinality(p_retain_option_ids) < 2
    or cardinality(p_retain_question_ids) > 10000
    or cardinality(p_retain_option_ids) > 50000
  then
    raise exception 'Replaced quiz-pool pruning refused: invalid retained ID arrays.'
      using errcode = '22023';
  end if;

  select array_agg(id order by id) into v_question_ids
  from unnest(p_retain_question_ids) item(id);
  select array_agg(id order by id) into v_option_ids
  from unnest(p_retain_option_ids) item(id);
  if (select count(distinct id) from unnest(v_question_ids) item(id))
       <> cardinality(v_question_ids)
    or (select count(distinct id) from unnest(v_option_ids) item(id))
       <> cardinality(v_option_ids)
  then
    raise exception 'Replaced quiz-pool pruning refused: retained IDs must be unique.'
      using errcode = '22023';
  end if;

  v_contract_sha256 := encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        p_import_id || ':'
          || array_to_string(v_question_ids, ',') || ':'
          || array_to_string(v_option_ids, ','),
        'UTF8'
      )
    ),
    'hex'
  );
  if p_confirmation <>
    'PRUNE-REPLACED-QUIZ-POOLS:' || p_import_id || ':' || v_contract_sha256
  then
    raise exception 'Replaced quiz-pool pruning refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('course-import-catalog-mutation', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('course-import-release:' || p_import_id, 0)
  );

  lock table
    public.programs, public.courses, public.modules, public.lessons,
    public.quizzes, public.questions, public.answer_options,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;

  if exists (
    select 1 from public.content_import_release_records release
    where release.import_id = p_import_id
  ) or exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Replaced quiz-pool pruning refused: import is published or released.'
      using errcode = '42501';
  end if;

  select
    coalesce(array_agg(lesson.id order by lesson.id), '{}'::uuid[]),
    coalesce(array_agg(lesson.quiz_id order by lesson.quiz_id), '{}'::uuid[])
    into v_lesson_ids, v_quiz_ids
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
    and lesson.quiz_id is not null;

  if cardinality(v_quiz_ids) = 0
    or (select count(*) from public.questions question
        where question.id = any(v_question_ids)
          and question.quiz_id = any(v_quiz_ids)) <> cardinality(v_question_ids)
    or (select count(*) from public.answer_options option
        where option.id = any(v_option_ids)
          and option.question_id = any(v_question_ids)) <> cardinality(v_option_ids)
  then
    raise exception 'Replaced quiz-pool pruning refused: retained graph contract mismatch.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(question.id order by question.id), '{}'::uuid[])
    into v_extra_question_ids
  from public.questions question
  where question.quiz_id = any(v_quiz_ids)
    and question.id <> all(v_question_ids);

  select coalesce(array_agg(option.id order by option.id), '{}'::uuid[])
    into v_extra_option_ids
  from public.answer_options option
  join public.questions question on question.id = option.question_id
  where question.quiz_id = any(v_quiz_ids)
    and option.id <> all(v_option_ids);

  if cardinality(v_extra_question_ids) = 0
    and cardinality(v_extra_option_ids) = 0
  then
    return jsonb_build_object(
      'status', 'already_exact',
      'import_id', p_import_id,
      'deleted_questions', 0,
      'deleted_options', 0,
      'contract_sha256', v_contract_sha256
    );
  end if;

  if exists (
    select 1 from public.user_quiz_attempts attempt
    where attempt.lesson_id = any(v_lesson_ids)
      or attempt.quiz_id = any(v_quiz_ids)
  ) then
    raise exception 'Replaced quiz-pool pruning refused: quiz attempt activity exists.'
      using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.course_import_reviewer_answer_options_v1 created
    where created.import_id = p_import_id
      and (
        created.question_id = any(v_extra_question_ids)
        or created.answer_option_id = any(v_extra_option_ids)
      )
  ) then
    raise exception 'Replaced quiz-pool pruning refused: reviewer-authored option evidence exists.'
      using errcode = '23503';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.answer_options option
  where option.id = any(v_extra_option_ids);
  get diagnostics v_deleted_options = row_count;
  delete from public.questions question
  where question.id = any(v_extra_question_ids);
  get diagnostics v_deleted_questions = row_count;
  perform set_config('bmh.rollback_import_id', '', true);

  if v_deleted_questions <> cardinality(v_extra_question_ids)
    or v_deleted_options <> cardinality(v_extra_option_ids)
  then
    raise exception 'Replaced quiz-pool pruning failed exact delete counts.';
  end if;

  return jsonb_build_object(
    'status', 'pruned',
    'import_id', p_import_id,
    'deleted_questions', v_deleted_questions,
    'deleted_options', v_deleted_options,
    'contract_sha256', v_contract_sha256
  );
end;
$$;

revoke all on function public.fn_prune_replaced_quiz_pools_v1(text, uuid[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.fn_prune_replaced_quiz_pools_v1(text, uuid[], uuid[], text)
  to service_role;

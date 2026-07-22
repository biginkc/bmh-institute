-- Preserve the immutable v1 release receipt while permitting one exact,
-- append-only audited quiz-bank revision on the same catalog identities.

set lock_timeout = '10s';

create table public.content_import_release_revisions (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  revision integer not null check (revision > 1),
  prior_manifest_sha256 text not null check (prior_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[a-f0-9]{64}$'),
  catalog_sha256 text not null check (catalog_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  quiz_count integer not null check (quiz_count > 0),
  question_count integer not null check (question_count > 0),
  option_count integer not null check (option_count > 0),
  prior_quiz_graph jsonb not null,
  invalidated_incomplete_attempts jsonb not null,
  evidence jsonb not null,
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id, revision)
);

comment on table public.content_import_release_revisions is
  'Immutable revisions layered over the immutable original imported-catalog release receipt.';

alter table public.content_import_release_revisions enable row level security;
revoke all on table public.content_import_release_revisions from public, anon, authenticated;
grant select on table public.content_import_release_revisions to service_role;

create or replace function public.fn_guard_content_import_release_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Content import release revisions are immutable.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.release_revision_import_id', true), '') <> new.import_id
  then
    raise exception 'Content import release revisions require the evidence-bound revision operation.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_release_revision()
  from public, anon, authenticated;

create trigger content_import_release_revisions_guard
before insert or update or delete on public.content_import_release_revisions
for each row execute function public.fn_guard_content_import_release_revision();

create or replace view public.content_import_active_release_v1
with (security_invoker = true)
as
select
  release.import_id,
  release.program_id,
  release.released_at as original_released_at,
  release.manifest_sha256 as original_manifest_sha256,
  coalesce(revision.revision, 1) as active_revision,
  coalesce(revision.manifest_sha256, release.manifest_sha256) as active_manifest_sha256,
  coalesce(revision.catalog_sha256, release.catalog_sha256) as active_catalog_sha256,
  coalesce(revision.revised_at, release.released_at) as active_released_at
from public.content_import_release_records release
left join lateral (
  select item.revision, item.manifest_sha256, item.catalog_sha256, item.revised_at
  from public.content_import_release_revisions item
  where item.import_id = release.import_id
  order by item.revision desc
  limit 1
) revision on true;

revoke all on public.content_import_active_release_v1 from public, anon, authenticated;
grant select on public.content_import_active_release_v1 to service_role;

create or replace function public.fn_revise_released_quizzes_v1(
  p_import_id text,
  p_expected_prior_manifest_sha256 text,
  p_manifest_sha256 text,
  p_quizzes jsonb,
  p_questions jsonb,
  p_answer_options jsonb,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.content_import_release_records%rowtype;
  v_active_revision integer;
  v_active_manifest_sha256 text;
  v_prior_catalog_sha256 text;
  v_catalog_sha256 text;
  v_payload_sha256 text;
  v_revision integer;
  v_quiz_ids uuid[];
  v_question_ids uuid[];
  v_option_ids uuid[];
  v_lesson_ids uuid[];
  v_prior_graph jsonb;
  v_invalidated_attempts jsonb;
  v_invalidated_count integer := 0;
  v_deleted_questions integer := 0;
  v_deleted_options integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released quiz revision requires the service role.' using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_prior_manifest_sha256 !~ '^[a-f0-9]{64}$'
    or p_manifest_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Released quiz revision refused: invalid identity or manifest checksum.'
      using errcode = '22023';
  end if;
  if p_manifest_sha256 = p_expected_prior_manifest_sha256 then
    raise exception 'Released quiz revision refused: manifest checksum did not change.'
      using errcode = '22023';
  end if;
  if p_confirmation is distinct from
    'REVISE-RELEASED-QUIZZES:' || p_import_id || ':'
      || p_expected_prior_manifest_sha256 || ':' || p_manifest_sha256 || ':19:920'
  then
    raise exception 'Released quiz revision refused: confirmation mismatch.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_quizzes) is distinct from 'array'
    or jsonb_array_length(p_quizzes) <> 19
    or jsonb_typeof(p_questions) is distinct from 'array'
    or jsonb_array_length(p_questions) <> 920
    or jsonb_typeof(p_answer_options) is distinct from 'array'
    or jsonb_array_length(p_answer_options) < 1840
    or jsonb_array_length(p_answer_options) > 10000
  then
    raise exception 'Released quiz revision refused: expected exactly 19 quizzes and 920 questions.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or not (p_evidence ?& array[
      'question_bank_sha256', 'approval_request_sha256',
      'approval_ledger_sha256', 'rollback_sha256'
    ])
    or exists (
      select 1
      from jsonb_each_text(p_evidence) item
      where item.key = any(array[
        'question_bank_sha256', 'approval_request_sha256',
        'approval_ledger_sha256', 'rollback_sha256'
      ]) and item.value !~ '^[a-f0-9]{64}$'
    )
  then
    raise exception 'Released quiz revision refused: checksum-bound evidence is incomplete.'
      using errcode = '22023';
  end if;

  -- Reject extra or missing fields instead of letting jsonb_to_recordset ignore
  -- payload drift.
  if exists (
    select 1 from jsonb_array_elements(p_quizzes) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array[
          'description','id','max_attempts','passing_score','questions_per_attempt',
          'randomize_answers','randomize_questions','retake_cooldown_hours',
          'show_correct_answers_after','title'
        ]::text[]
  ) or exists (
    select 1 from jsonb_array_elements(p_questions) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array[
          'explanation','id','points','question_text','question_type','quiz_id','sort_order'
        ]::text[]
  ) or exists (
    select 1 from jsonb_array_elements(p_answer_options) item
    where jsonb_typeof(item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(item) key)
        <> array['id','is_correct','option_text','question_id','sort_order']::text[]
  ) then
    raise exception 'Released quiz revision refused: payload row shape mismatch.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.programs, public.courses, public.modules, public.lessons,
    public.quizzes, public.questions, public.answer_options,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;

  select * into v_release
  from public.content_import_release_records release
  where release.import_id = p_import_id;
  if not found
    or not exists (
      select 1 from public.programs program
      where program.id = v_release.program_id
        and program.content_import_id = p_import_id
        and program.is_published
    )
    or exists (
      select 1
      from public.program_courses link
      join public.courses course on course.id = link.course_id
      where link.program_id = v_release.program_id and not course.is_published
    )
  then
    raise exception 'Released quiz revision refused: exact published release was not found.'
      using errcode = '42501';
  end if;

  select coalesce(max(revision), 1) into v_active_revision
  from public.content_import_release_revisions
  where import_id = p_import_id;
  if v_active_revision = 1 then
    v_active_manifest_sha256 := v_release.manifest_sha256;
  else
    select manifest_sha256 into strict v_active_manifest_sha256
    from public.content_import_release_revisions
    where import_id = p_import_id and revision = v_active_revision;
  end if;

  if v_active_manifest_sha256 = p_manifest_sha256 then
    v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
    return jsonb_build_object(
      'status', 'already_revised',
      'import_id', p_import_id,
      'revision', v_active_revision,
      'manifest_sha256', p_manifest_sha256,
      'catalog_sha256', v_catalog_sha256
    );
  end if;
  if v_active_manifest_sha256 <> p_expected_prior_manifest_sha256 then
    raise exception 'Released quiz revision refused: active manifest changed after preflight.'
      using errcode = '40001';
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
  if cardinality(v_quiz_ids) <> 19 then
    raise exception 'Released quiz revision refused: published import does not own exactly 19 quizzes.'
      using errcode = '22023';
  end if;

  select array_agg(row.id order by row.id) into v_question_ids
  from jsonb_to_recordset(p_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  );
  select array_agg(row.id order by row.id) into v_option_ids
  from jsonb_to_recordset(p_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  );

  if (select count(distinct row.id) from jsonb_to_recordset(p_quizzes) as row(
      id uuid, title text, description text, passing_score integer,
      randomize_questions boolean, randomize_answers boolean,
      questions_per_attempt integer, max_attempts integer,
      retake_cooldown_hours integer, show_correct_answers_after text
    )) <> 19
    or (select array_agg(row.id order by row.id) from jsonb_to_recordset(p_quizzes) as row(
      id uuid, title text, description text, passing_score integer,
      randomize_questions boolean, randomize_answers boolean,
      questions_per_attempt integer, max_attempts integer,
      retake_cooldown_hours integer, show_correct_answers_after text
    )) <> v_quiz_ids
    or exists (
      select 1 from jsonb_to_recordset(p_quizzes) as row(
        id uuid, title text, description text, passing_score integer,
        randomize_questions boolean, randomize_answers boolean,
        questions_per_attempt integer, max_attempts integer,
        retake_cooldown_hours integer, show_correct_answers_after text
      )
      where row.passing_score <> 80
        or row.questions_per_attempt is not null
        or not row.randomize_questions
        or not row.randomize_answers
        or row.max_attempts is not null
        or row.retake_cooldown_hours <> 0
        or row.show_correct_answers_after <> 'after_pass'
        or nullif(btrim(row.title), '') is null
    )
  then
    raise exception 'Released quiz revision refused: quiz identity or exhaustive-delivery contract mismatch.'
      using errcode = '22023';
  end if;

  if (select count(distinct id) from unnest(v_question_ids) id) <> 920
    or (select count(distinct id) from unnest(v_option_ids) id) <> jsonb_array_length(p_answer_options)
    or exists (
      select 1 from jsonb_to_recordset(p_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      )
      where row.quiz_id <> all(v_quiz_ids)
        or row.question_type not in ('true_false', 'single_choice', 'multi_select')
        or nullif(btrim(row.question_text), '') is null
        or row.points < 0 or row.sort_order < 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      )
      group by row.quiz_id, row.sort_order having count(*) <> 1
    )
    or exists (
      select 1 from jsonb_to_recordset(p_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      )
      where row.question_id <> all(v_question_ids)
        or nullif(btrim(row.option_text), '') is null or row.sort_order < 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      )
      group by row.question_id, row.sort_order having count(*) <> 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_questions)
        as question(id uuid, quiz_id uuid, question_text text, question_type text,
          explanation text, points integer, sort_order integer)
      left join lateral (
        select count(*) as option_count,
          count(*) filter (where option.is_correct) as correct_count
        from jsonb_to_recordset(p_answer_options)
          as option(id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer)
        where option.question_id = question.id
      ) totals on true
      where totals.option_count < 2
        or totals.correct_count < 1
        or (question.question_type in ('single_choice', 'true_false') and totals.correct_count <> 1)
        or (question.question_type = 'multi_select' and totals.correct_count < 2)
        or (question.question_type = 'true_false' and totals.option_count <> 2)
    )
  then
    raise exception 'Released quiz revision refused: question or answer-option graph mismatch.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.questions question
    where question.id = any(v_question_ids) and question.quiz_id <> all(v_quiz_ids)
  ) or exists (
    select 1 from public.answer_options option
    where option.id = any(v_option_ids) and option.question_id <> all(v_question_ids)
  ) then
    raise exception 'Released quiz revision refused: replacement IDs collide outside the released graph.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.course_import_reviewer_answer_options_v1 evidence
    join public.questions question on question.id = evidence.question_id
    where evidence.import_id = p_import_id
      and question.quiz_id = any(v_quiz_ids)
      and (
        evidence.question_id <> all(v_question_ids)
        or evidence.answer_option_id <> all(v_option_ids)
      )
  ) then
    raise exception 'Released quiz revision refused: reviewer-authored option evidence depends on replaced rows.'
      using errcode = '23503';
  end if;

  -- Completed attempts remain in place. Require a recognized immutable grading
  -- state before removing any catalog rows they may have referenced.
  if exists (
    select 1 from public.user_quiz_attempts attempt
    where attempt.quiz_id = any(v_quiz_ids)
      and attempt.completed_at is not null
      and attempt.grading_snapshot_state not in ('native', 'legacy_backfilled', 'legacy_summary_only')
  ) then
    raise exception 'Released quiz revision refused: completed attempt lacks a reviewable grading snapshot.'
      using errcode = '23503';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  select jsonb_build_object(
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', quiz.id, 'title', quiz.title, 'description', quiz.description,
        'passing_score', quiz.passing_score,
        'randomize_questions', quiz.randomize_questions,
        'randomize_answers', quiz.randomize_answers,
        'questions_per_attempt', quiz.questions_per_attempt,
        'max_attempts', quiz.max_attempts,
        'retake_cooldown_hours', quiz.retake_cooldown_hours,
        'show_correct_answers_after', quiz.show_correct_answers_after
      ) order by quiz.id)
      from public.quizzes quiz where quiz.id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id, 'quiz_id', question.quiz_id,
        'question_text', question.question_text,
        'question_type', question.question_type,
        'explanation', question.explanation, 'points', question.points,
        'sort_order', question.sort_order
      ) order by question.id)
      from public.questions question where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'answer_options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id, 'question_id', option.question_id,
        'option_text', option.option_text, 'is_correct', option.is_correct,
        'sort_order', option.sort_order
      ) order by option.id)
      from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb)
  ) into v_prior_graph;

  select coalesce(jsonb_agg(to_jsonb(attempt) order by attempt.id), '[]'::jsonb)
    into v_invalidated_attempts
  from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;

  delete from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  get diagnostics v_invalidated_count = row_count;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.answer_options option
  using public.questions question
  where option.question_id = question.id
    and question.quiz_id = any(v_quiz_ids)
    and option.id <> all(v_option_ids);
  get diagnostics v_deleted_options = row_count;
  delete from public.questions question
  where question.quiz_id = any(v_quiz_ids)
    and question.id <> all(v_question_ids);
  get diagnostics v_deleted_questions = row_count;
  perform set_config('bmh.rollback_import_id', '', true);

  update public.quizzes quiz set
    title = row.title,
    description = row.description,
    passing_score = row.passing_score,
    randomize_questions = row.randomize_questions,
    randomize_answers = row.randomize_answers,
    questions_per_attempt = row.questions_per_attempt,
    max_attempts = row.max_attempts,
    retake_cooldown_hours = row.retake_cooldown_hours,
    show_correct_answers_after = row.show_correct_answers_after
  from jsonb_to_recordset(p_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  ) where quiz.id = row.id;

  perform set_config('bmh.apply_import_id', p_import_id, true);
  insert into public.questions (
    id, quiz_id, question_text, question_type, explanation, points, sort_order
  )
  select row.id, row.quiz_id, row.question_text, row.question_type,
    row.explanation, row.points, row.sort_order
  from jsonb_to_recordset(p_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  )
  on conflict (id) do update set
    quiz_id = excluded.quiz_id,
    question_text = excluded.question_text,
    question_type = excluded.question_type,
    explanation = excluded.explanation,
    points = excluded.points,
    sort_order = excluded.sort_order;

  insert into public.answer_options (
    id, question_id, option_text, is_correct, sort_order
  )
  select row.id, row.question_id, row.option_text, row.is_correct, row.sort_order
  from jsonb_to_recordset(p_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  )
  on conflict (id) do update set
    question_id = excluded.question_id,
    option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;
  perform set_config('bmh.apply_import_id', '', true);

  if (select count(*) from public.questions question where question.quiz_id = any(v_quiz_ids)) <> 920
    or (select count(*) from public.answer_options option join public.questions question
      on question.id = option.question_id where question.quiz_id = any(v_quiz_ids))
      <> jsonb_array_length(p_answer_options)
    or exists (
      select 1 from public.quizzes quiz
      where quiz.id = any(v_quiz_ids) and quiz.questions_per_attempt is not null
    )
  then
    raise exception 'Released quiz revision failed exact post-mutation reconciliation.';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  v_payload_sha256 := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'quizzes', p_quizzes,
        'questions', p_questions,
        'answer_options', p_answer_options
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_revision := v_active_revision + 1;

  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence, revised_by
  ) values (
    p_import_id, v_revision, p_expected_prior_manifest_sha256, p_manifest_sha256,
    v_prior_catalog_sha256, v_catalog_sha256, v_payload_sha256,
    19, 920, jsonb_array_length(p_answer_options),
    v_prior_graph, v_invalidated_attempts, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  return jsonb_build_object(
    'status', 'revised',
    'import_id', p_import_id,
    'revision', v_revision,
    'prior_manifest_sha256', p_expected_prior_manifest_sha256,
    'manifest_sha256', p_manifest_sha256,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_catalog_sha256,
    'payload_sha256', v_payload_sha256,
    'quizzes', 19,
    'questions', 920,
    'answer_options', jsonb_array_length(p_answer_options),
    'invalidated_incomplete_attempts', v_invalidated_count,
    'deleted_legacy_questions', v_deleted_questions,
    'deleted_legacy_answer_options', v_deleted_options
  );
end;
$$;

revoke all on function public.fn_revise_released_quizzes_v1(
  text, text, text, jsonb, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_revise_released_quizzes_v1(
  text, text, text, jsonb, jsonb, jsonb, jsonb, text
) to service_role;

comment on function public.fn_revise_released_quizzes_v1(
  text, text, text, jsonb, jsonb, jsonb, jsonb, text
) is 'Atomically revisions the exact exhaustive quiz graph while retaining the immutable original release receipt and completed attempt history.';

create or replace function public.fn_rollback_released_quiz_revision_v1(
  p_import_id text,
  p_expected_revision integer,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.content_import_release_revisions%rowtype;
  v_current_catalog_sha256 text;
  v_catalog_sha256 text;
  v_payload_sha256 text;
  v_quizzes jsonb;
  v_questions jsonb;
  v_answer_options jsonb;
  v_quiz_ids uuid[];
  v_question_ids uuid[];
  v_option_ids uuid[];
  v_current_graph jsonb;
  v_invalidated_attempts jsonb;
  v_invalidated_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released quiz revision rollback requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_revision is null or p_expected_revision < 2
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'operation' <> 'rollback'
    or p_evidence ->> 'rollback_sha256' !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Released quiz revision rollback refused: invalid rollback evidence.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.programs, public.courses, public.modules, public.lessons,
    public.quizzes, public.questions, public.answer_options,
    public.user_quiz_attempts,
    public.course_import_reviewer_answer_options_v1
  in share row exclusive mode;

  select * into v_latest
  from public.content_import_release_revisions revision
  where revision.import_id = p_import_id
  order by revision.revision desc
  limit 1;
  if not found or v_latest.revision <> p_expected_revision then
    raise exception 'Released quiz revision rollback refused: active revision changed after preflight.'
      using errcode = '40001';
  end if;
  if p_confirmation is distinct from
    'ROLLBACK-RELEASED-QUIZZES:' || p_import_id || ':' || p_expected_revision::text || ':'
      || v_latest.manifest_sha256 || ':' || v_latest.prior_manifest_sha256
  then
    raise exception 'Released quiz revision rollback refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_current_catalog_sha256 <> v_latest.catalog_sha256 then
    raise exception 'Released quiz revision rollback refused: catalog changed after the recorded revision.'
      using errcode = '40001';
  end if;

  v_quizzes := v_latest.prior_quiz_graph -> 'quizzes';
  v_questions := v_latest.prior_quiz_graph -> 'questions';
  v_answer_options := v_latest.prior_quiz_graph -> 'answer_options';
  if jsonb_typeof(v_quizzes) is distinct from 'array'
    or jsonb_array_length(v_quizzes) <> 19
    or jsonb_typeof(v_questions) is distinct from 'array'
    or jsonb_array_length(v_questions) < 1
    or jsonb_typeof(v_answer_options) is distinct from 'array'
    or jsonb_array_length(v_answer_options) < 2
  then
    raise exception 'Released quiz revision rollback refused: archived prior graph is malformed.';
  end if;

  select array_agg(row.id order by row.id) into v_quiz_ids
  from jsonb_to_recordset(v_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  );
  select array_agg(row.id order by row.id) into v_question_ids
  from jsonb_to_recordset(v_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  );
  select array_agg(row.id order by row.id) into v_option_ids
  from jsonb_to_recordset(v_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  );

  if (select count(distinct id) from unnest(v_quiz_ids) id) <> 19
    or (select count(distinct id) from unnest(v_question_ids) id) <> jsonb_array_length(v_questions)
    or (select count(distinct id) from unnest(v_option_ids) id) <> jsonb_array_length(v_answer_options)
    or exists (
      select 1 from jsonb_to_recordset(v_questions) as row(
        id uuid, quiz_id uuid, question_text text, question_type text,
        explanation text, points integer, sort_order integer
      ) where row.quiz_id <> all(v_quiz_ids)
    )
    or exists (
      select 1 from jsonb_to_recordset(v_answer_options) as row(
        id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
      ) where row.question_id <> all(v_question_ids)
    )
    or (select array_agg(lesson.quiz_id order by lesson.quiz_id)
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
        and lesson.quiz_id is not null) <> v_quiz_ids
  then
    raise exception 'Released quiz revision rollback refused: archived prior graph identity mismatch.';
  end if;

  if exists (
    select 1 from public.user_quiz_attempts attempt
    where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is not null
  ) then
    raise exception 'Released quiz revision rollback refused: completed quiz activity now exists; automatic rollback is unsafe.'
      using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.course_import_reviewer_answer_options_v1 evidence
    join public.questions question on question.id = evidence.question_id
    where evidence.import_id = p_import_id and question.quiz_id = any(v_quiz_ids)
  ) then
    raise exception 'Released quiz revision rollback refused: reviewer-authored option evidence now exists.'
      using errcode = '23503';
  end if;

  select jsonb_build_object(
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', quiz.id, 'title', quiz.title, 'description', quiz.description,
        'passing_score', quiz.passing_score,
        'randomize_questions', quiz.randomize_questions,
        'randomize_answers', quiz.randomize_answers,
        'questions_per_attempt', quiz.questions_per_attempt,
        'max_attempts', quiz.max_attempts,
        'retake_cooldown_hours', quiz.retake_cooldown_hours,
        'show_correct_answers_after', quiz.show_correct_answers_after
      ) order by quiz.id)
      from public.quizzes quiz where quiz.id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id, 'quiz_id', question.quiz_id,
        'question_text', question.question_text,
        'question_type', question.question_type,
        'explanation', question.explanation, 'points', question.points,
        'sort_order', question.sort_order
      ) order by question.id)
      from public.questions question where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb),
    'answer_options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id, 'question_id', option.question_id,
        'option_text', option.option_text, 'is_correct', option.is_correct,
        'sort_order', option.sort_order
      ) order by option.id)
      from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)
    ), '[]'::jsonb)
  ) into v_current_graph;

  select coalesce(jsonb_agg(to_jsonb(attempt) order by attempt.id), '[]'::jsonb)
    into v_invalidated_attempts
  from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  delete from public.user_quiz_attempts attempt
  where attempt.quiz_id = any(v_quiz_ids) and attempt.completed_at is null;
  get diagnostics v_invalidated_count = row_count;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.answer_options option
  using public.questions question
  where option.question_id = question.id
    and question.quiz_id = any(v_quiz_ids)
    and option.id <> all(v_option_ids);
  delete from public.questions question
  where question.quiz_id = any(v_quiz_ids)
    and question.id <> all(v_question_ids);
  perform set_config('bmh.rollback_import_id', '', true);

  update public.quizzes quiz set
    title = row.title,
    description = row.description,
    passing_score = row.passing_score,
    randomize_questions = row.randomize_questions,
    randomize_answers = row.randomize_answers,
    questions_per_attempt = row.questions_per_attempt,
    max_attempts = row.max_attempts,
    retake_cooldown_hours = row.retake_cooldown_hours,
    show_correct_answers_after = row.show_correct_answers_after
  from jsonb_to_recordset(v_quizzes) as row(
    id uuid, title text, description text, passing_score integer,
    randomize_questions boolean, randomize_answers boolean,
    questions_per_attempt integer, max_attempts integer,
    retake_cooldown_hours integer, show_correct_answers_after text
  ) where quiz.id = row.id;

  perform set_config('bmh.apply_import_id', p_import_id, true);
  insert into public.questions (
    id, quiz_id, question_text, question_type, explanation, points, sort_order
  )
  select row.id, row.quiz_id, row.question_text, row.question_type,
    row.explanation, row.points, row.sort_order
  from jsonb_to_recordset(v_questions) as row(
    id uuid, quiz_id uuid, question_text text, question_type text,
    explanation text, points integer, sort_order integer
  )
  on conflict (id) do update set
    quiz_id = excluded.quiz_id,
    question_text = excluded.question_text,
    question_type = excluded.question_type,
    explanation = excluded.explanation,
    points = excluded.points,
    sort_order = excluded.sort_order;

  insert into public.answer_options (
    id, question_id, option_text, is_correct, sort_order
  )
  select row.id, row.question_id, row.option_text, row.is_correct, row.sort_order
  from jsonb_to_recordset(v_answer_options) as row(
    id uuid, question_id uuid, option_text text, is_correct boolean, sort_order integer
  )
  on conflict (id) do update set
    question_id = excluded.question_id,
    option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;
  perform set_config('bmh.apply_import_id', '', true);

  if (select count(*) from public.questions question where question.quiz_id = any(v_quiz_ids))
      <> jsonb_array_length(v_questions)
    or (select count(*) from public.answer_options option
      join public.questions question on question.id = option.question_id
      where question.quiz_id = any(v_quiz_ids)) <> jsonb_array_length(v_answer_options)
  then
    raise exception 'Released quiz revision rollback failed exact reconciliation.';
  end if;

  v_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  v_payload_sha256 := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'quizzes', v_quizzes,
        'questions', v_questions,
        'answer_options', v_answer_options
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  perform set_config('bmh.release_revision_import_id', p_import_id, true);
  insert into public.content_import_release_revisions (
    import_id, revision, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence, revised_by
  ) values (
    p_import_id, v_latest.revision + 1,
    v_latest.manifest_sha256, v_latest.prior_manifest_sha256,
    v_current_catalog_sha256, v_catalog_sha256, v_payload_sha256,
    jsonb_array_length(v_quizzes), jsonb_array_length(v_questions),
    jsonb_array_length(v_answer_options),
    v_current_graph, v_invalidated_attempts, p_evidence, auth.uid()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', p_import_id,
    'revision', v_latest.revision + 1,
    'prior_manifest_sha256', v_latest.manifest_sha256,
    'manifest_sha256', v_latest.prior_manifest_sha256,
    'prior_catalog_sha256', v_current_catalog_sha256,
    'catalog_sha256', v_catalog_sha256,
    'payload_sha256', v_payload_sha256,
    'quizzes', jsonb_array_length(v_quizzes),
    'questions', jsonb_array_length(v_questions),
    'answer_options', jsonb_array_length(v_answer_options),
    'invalidated_incomplete_attempts', v_invalidated_count
  );
end;
$$;

revoke all on function public.fn_rollback_released_quiz_revision_v1(
  text, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_rollback_released_quiz_revision_v1(
  text, integer, jsonb, text
) to service_role;

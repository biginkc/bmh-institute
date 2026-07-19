-- Register migration 046's reviewer-created answer option tracking table as a
-- dependency-only fixture cleanup surface. The table is not a deletion target.
-- Any row that points into the fixture catalog must block cleanup.

set lock_timeout = '10s';

insert into private.fixture_cleanup_tables_v1 (
  table_name,
  identity_fields,
  expected_count
) values (
  'course_import_reviewer_answer_options_v1',
  array['answer_option_id']::text[],
  0
)
on conflict (table_name) do nothing;

insert into private.fixture_cleanup_references_v1 (
  child_table,
  child_field,
  parent_table,
  match_type
) values
  (
    'course_import_reviewer_answer_options_v1',
    'answer_option_id',
    'answer_options',
    'scalar'
  ),
  (
    'course_import_reviewer_answer_options_v1',
    'program_id',
    'programs',
    'scalar'
  ),
  (
    'course_import_reviewer_answer_options_v1',
    'question_id',
    'questions',
    'scalar'
  )
on conflict (child_table, child_field, parent_table) do nothing;

do $$
declare
  v_references jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'child_field', child_field,
      'parent_table', parent_table,
      'match_type', match_type
    )
    order by child_field
  )
    into v_references
  from private.fixture_cleanup_references_v1
  where child_table = 'course_import_reviewer_answer_options_v1';

  if not exists (
    select 1
    from private.fixture_cleanup_tables_v1
    where table_name = 'course_import_reviewer_answer_options_v1'
      and identity_fields = array['answer_option_id']::text[]
      and expected_count = 0
  ) or v_references is distinct from '[
    {
      "child_field": "answer_option_id",
      "parent_table": "answer_options",
      "match_type": "scalar"
    },
    {
      "child_field": "program_id",
      "parent_table": "programs",
      "match_type": "scalar"
    },
    {
      "child_field": "question_id",
      "parent_table": "questions",
      "match_type": "scalar"
    }
  ]'::jsonb then
    raise exception 'Migration 047 refused: reviewer answer-option fixture dependency contract conflicts with the final schema.';
  end if;
end;
$$;

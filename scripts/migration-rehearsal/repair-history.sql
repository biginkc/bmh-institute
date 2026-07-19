begin;

-- This is the SQL equivalent of marking 001 through 010 applied. It must run
-- before any legacy version is removed so the history never has a gap.
insert into supabase_migrations.schema_migrations (version, statements, name)
values
  ('001', array[]::text[], 'initial_schema'),
  ('002', array[]::text[], 'functions_and_triggers'),
  ('003', array[]::text[], 'rls_policies'),
  ('004', array[]::text[], 'indexes'),
  ('005', array[]::text[], 'seed_dev'),
  ('006', array[]::text[], 'storage_content_bucket'),
  ('007', array[]::text[], 'storage_submissions_bucket'),
  ('008', array[]::text[], 'answer_options_public_view'),
  ('009', array[]::text[], 'answer_options_public_row_filter'),
  ('010', array[]::text[], 'prevent_last_owner_deletion');

do $$
begin
  if (
    select array_agg(version order by version)
    from supabase_migrations.schema_migrations
  ) <> array[
    '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
    '011', '012', '013', '014',
    '20260423204031', '20260423204130', '20260423204205',
    '20260423204222', '20260423204234', '20260423224651',
    '20260423231622', '20260501012728', '20260501020518',
    '20260501020537'
  ]::text[] then
    raise exception 'numbered migrations were not recorded before legacy removal';
  end if;
end;
$$;

-- This is the SQL equivalent of marking the ten legacy versions reverted.
delete from supabase_migrations.schema_migrations
where version = any(array[
  '20260423204031', '20260423204130', '20260423204205',
  '20260423204222', '20260423204234', '20260423224651',
  '20260423231622', '20260501012728', '20260501020518',
  '20260501020537'
]::text[]);

do $$
begin
  if (
    select array_agg(version order by version)
    from supabase_migrations.schema_migrations
  ) <> array[
    '001', '002', '003', '004', '005', '006', '007',
    '008', '009', '010', '011', '012', '013', '014'
  ]::text[] then
    raise exception 'repaired history is not exactly 001 through 014';
  end if;
end;
$$;

commit;

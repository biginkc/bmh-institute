-- Re-apply the restrictive Hugo lifecycle gate after later migrations add
-- public RLS tables. The database-wide regression test requires every public
-- browser-readable table to remain behind the same active-access boundary.

begin;

set local lock_timeout = '10s';

do $$
declare
  v_table record;
begin
  for v_table in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
    order by relation.relname
  loop
    execute format(
      'drop policy if exists hugo_active_authenticated_gate on %I.%I',
      v_table.schema_name,
      v_table.table_name
    );
    execute format(
      'create policy hugo_active_authenticated_gate on %I.%I as restrictive for all to authenticated using ((select public.fn_hugo_access_is_active(auth.uid()))) with check ((select public.fn_hugo_access_is_active(auth.uid())))',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end;
$$;

commit;

-- Postgres contract checks for the admin deletion boundary.  This test is
-- read-only and deliberately does not create or delete catalog data.
begin;

do $$
declare
  preview_security text;
  delete_security text;
begin
  select case when prosecdef then 'definer' else 'invoker' end
    into preview_security
    from pg_proc
    where oid = 'public.fn_admin_preview_deletion_v1(text, uuid)'::regprocedure;
  select case when prosecdef then 'definer' else 'invoker' end
    into delete_security
    from pg_proc
    where oid = 'public.fn_admin_delete_catalog_entity_v1(text, uuid)'::regprocedure;

  assert preview_security = 'definer', 'preview must execute through the admin boundary';
  assert delete_security = 'definer', 'delete must execute through the admin boundary';
  assert exists (
    select 1 from pg_proc
    where oid = 'public.fn_admin_delete_catalog_entity_v1(text, uuid)'::regprocedure
      and proconfig @> array['search_path=public']::text[]
  ), 'delete function must pin search_path';
  assert exists (
    select 1 from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and confrelid = 'public.quizzes'::regclass
      and confdeltype = 'r'
  ), 'lesson backing quiz protection must remain restrictive';
  assert exists (
    select 1 from pg_trigger
    where tgrelid = 'public.lessons'::regclass
      and not tgisinternal
  ), 'lesson integrity triggers must remain installed';
end;
$$;

rollback;

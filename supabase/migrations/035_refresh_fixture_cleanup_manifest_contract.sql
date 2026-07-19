-- Migration 021 is already applied on linked databases and must remain
-- immutable. Refresh only the checksum-bound cleanup contract for the
-- identifier-free fixture manifest; the catalog boundary itself is unchanged.

set lock_timeout = '10s';

do $migration$
declare
  v_function regprocedure := to_regprocedure(
    'public.admin_cleanup_fixture_catalog_v1(text,text)'
  );
  v_definition text;
  v_old_sha constant text :=
    'd08e3f36e876f1345a2218560879335d11c8ccebce4aa3cc6490a14913698d5b';
  v_new_sha constant text :=
    '80a4e2cac5e11e28c65605be1f22acccb708670095d0f46d5c14219feafca9a1';
  v_old_occurrences integer;
  v_new_occurrences integer;
begin
  if v_function is null then
    raise exception 'fixture cleanup contract refresh blocked: cleanup function is missing';
  end if;

  select pg_get_functiondef(v_function) into strict v_definition;
  v_old_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old_sha, ''))
  ) / length(v_old_sha);
  v_new_occurrences := (
    length(v_definition) - length(replace(v_definition, v_new_sha, ''))
  ) / length(v_new_sha);

  if v_old_occurrences <> 2 or v_new_occurrences <> 0 then
    raise exception
      'fixture cleanup contract refresh blocked: expected two old checksum bindings and no new binding, found old=% new=%',
      v_old_occurrences,
      v_new_occurrences;
  end if;

  execute replace(v_definition, v_old_sha, v_new_sha);

  select pg_get_functiondef(
    'public.admin_cleanup_fixture_catalog_v1(text,text)'::regprocedure
  ) into strict v_definition;
  v_old_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old_sha, ''))
  ) / length(v_old_sha);
  v_new_occurrences := (
    length(v_definition) - length(replace(v_definition, v_new_sha, ''))
  ) / length(v_new_sha);

  if v_old_occurrences <> 0 or v_new_occurrences <> 2 then
    raise exception
      'fixture cleanup contract refresh failed: expected no old checksum binding and two new bindings, found old=% new=%',
      v_old_occurrences,
      v_new_occurrences;
  end if;
end
$migration$;

revoke all on function public.admin_cleanup_fixture_catalog_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_cleanup_fixture_catalog_v1(text, text)
  to service_role;

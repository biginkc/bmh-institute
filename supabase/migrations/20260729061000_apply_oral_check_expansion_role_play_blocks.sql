-- Performs the actual, live forward invocation of
-- fn_insert_oral_check_expansion_role_play_blocks() -- mirrors
-- 20260728050000_apply_oral_check_pilot_role_play_blocks.sql's pattern
-- exactly, scaled from 3 blocks to 9. Numbered after both the insert
-- migration (20260729060000) and the rollback migration (20260729060500) so
-- a real deployment can never commit the live insertion before rollback
-- capability exists -- and this file's own preflight below asserts that
-- ordering explicitly, as a second, redundant layer on top of the identical
-- assertion already inside fn_insert_oral_check_expansion_role_play_blocks()
-- itself.
--
-- Replay-safe against a clean database (supabase db reset, CI, a fresh
-- preview or test project), mirroring the pilot's own replay-safety design
-- exactly: a database that holds no bmh-employee-training-v1 catalog and no
-- release record for it skips quietly (NOTICE, no write) because there is
-- nothing here for this one-shot insertion to modify; a database that holds
-- the catalog but no release record is the dangerous state (an incomplete
-- restore, a catalog reloaded after replay) and still fails closed; a
-- database with a real release record applies, as always. A `supabase db
-- push` aimed at the wrong, completely empty Supabase project is an
-- operator-layer concern this SQL cannot detect on its own (a migration has
-- no way to know which project it is connected to) -- the real production
-- target already holds the catalog and release, so this branch is
-- unreachable there.

do $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  v_has_release boolean;
  v_has_catalog boolean;
begin
  if to_regclass('public.content_import_oral_check_expansion_role_play_rollback_records') is null
    or to_regprocedure('public.fn_rollback_oral_check_expansion_role_play_blocks()') is null
  then
    raise exception 'Oral-check expansion forward apply refused: the rollback capability (content_import_oral_check_expansion_role_play_rollback_records / fn_rollback_oral_check_expansion_role_play_blocks) is not installed. This migration must never invoke the forward insertion without a prepared rollback path already in place.'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.fn_insert_oral_check_expansion_role_play_blocks()') is null then
    raise exception 'Oral-check expansion forward apply refused: fn_insert_oral_check_expansion_role_play_blocks() is not installed.'
      using errcode = '55000';
  end if;

  select exists (
    select 1 from public.content_import_release_records
    where import_id = v_import_id
  ) into v_has_release;

  select exists (
    select 1 from public.programs where content_import_id = v_import_id
    union all
    select 1 from public.courses where content_import_id = v_import_id
    union all
    select 1 from public.lessons where content_import_id = v_import_id
  ) into v_has_catalog;

  if not v_has_release then
    if v_has_catalog then
      raise exception 'Oral-check expansion forward apply refused: the % catalog exists on this database but has no published release record. This is the state that must never be applied through -- an incomplete restore, a catalog reloaded after migration replay, or an import that was applied but never released. Investigate the target before retrying; do not loosen this check.',
        v_import_id
        using errcode = '55000';
    end if;

    raise notice 'Oral-check expansion forward apply skipped: this database holds no % catalog and no release record for it, so there is nothing for this one-shot expansion insertion to modify. This is the expected outcome of replaying the migration history against a clean database (supabase db reset, CI, a fresh preview or test project). On the real production target the catalog and release both exist, so this branch is unreachable there.',
      v_import_id;
    return;
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_insert_oral_check_expansion_role_play_blocks();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

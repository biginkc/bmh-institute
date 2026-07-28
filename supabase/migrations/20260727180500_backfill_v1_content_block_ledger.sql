-- Cutover phase 2 (separate committed transaction -- see phase 1's rationale
-- in 20260727180000): absorb the already-applied v1 one-shot content-block
-- history into the shared content_import_release_revisions ledger. Phase 1
-- committed the v1 retirement and sealed every legacy admission path, so by
-- the time this transaction takes the shared advisory lock (a drain barrier
-- for any in-flight v1 straggler still holding it), the v1 receipt table is
-- frozen and this backfill sees the complete, final v1 history.
--
-- Exposed as a callable (service-role-only) function rather than inlined so
-- the SQL test harness can exercise the exact transition inside a rolled-back
-- transaction. Validation is deliberately strict and FAIL-LOUD: a legacy
-- receipt is mirrored only after its predecessor linkage and final live
-- catalog are proven against current state; any mismatch aborts the whole
-- migration rather than appending a fabricated history.

set lock_timeout = '10s';

create or replace function public.fn_backfill_v1_content_block_revisions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_mirror public.content_import_release_revisions%rowtype;
  v_release_manifest_sha256 text;
  v_active_manifest_sha256 text;
  v_live_catalog_sha256 text;
  v_next_revision integer;
  v_expected_mutation_count integer;
  v_download_evidence jsonb;
  v_backfilled integer := 0;
  v_import_ids text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'v1 content block revision backfill requires service_role.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  lock table
    public.content_import_release_revisions,
    public.content_import_released_content_block_revision_records
  in share row exclusive mode;

  for v_record in
    select *
    from public.content_import_released_content_block_revision_records record
    order by record.revised_at, record.manifest_sha256
  loop
    v_expected_mutation_count := v_record.guide_update_count
      + v_record.flashcard_update_count + v_record.role_play_insert_count;

    -- Idempotency bound to FULL legacy receipt identity: if a mirror row
    -- already carries this receipt's payload digest, every other identity
    -- field must match it exactly -- a partial match means the ledger and
    -- the legacy history disagree, and appending anything on top of that
    -- disagreement would fabricate lineage. Abort instead.
    select mirror.* into v_mirror
    from public.content_import_release_revisions mirror
    where mirror.import_id = v_record.import_id
      and mirror.kind = 'content_blocks'
      and mirror.payload_sha256 = v_record.database_payload_sha256;
    if found then
      if v_mirror.manifest_sha256 <> v_record.manifest_sha256
        or v_mirror.prior_manifest_sha256 <> v_record.expected_active_manifest_sha256
        or v_mirror.prior_catalog_sha256 <> v_record.prior_catalog_sha256
        or v_mirror.catalog_sha256 <> v_record.replacement_catalog_sha256
        or v_mirror.client_payload_sha256 <> v_record.client_payload_sha256
        or v_mirror.mutation_count <> v_expected_mutation_count
      then
        raise exception 'v1 backfill aborted: an existing mirror row for % (payload %) does not match the legacy receipt identity.',
          v_record.import_id, v_record.database_payload_sha256;
      end if;
      continue;
    end if;

    -- Predecessor chain: the receipt's declared predecessor manifest must be
    -- exactly what the shared ledger currently says is active. For multiple
    -- receipts per import this also validates receipt-to-receipt linkage,
    -- because each mirror insert advances the active manifest to its own.
    select active.active_manifest_sha256 into v_active_manifest_sha256
    from public.content_import_active_release_v1 active
    where active.import_id = v_record.import_id;
    if v_active_manifest_sha256 is null then
      raise exception 'v1 backfill aborted: % has a legacy receipt but no release in the shared ledger.',
        v_record.import_id;
    end if;
    if v_active_manifest_sha256 <> v_record.expected_active_manifest_sha256 then
      raise exception 'v1 backfill aborted: legacy receipt for % declares predecessor manifest % but the shared ledger''s active manifest is %.',
        v_record.import_id, v_record.expected_active_manifest_sha256, v_active_manifest_sha256;
    end if;

    -- Original-release binding.
    select release.manifest_sha256 into v_release_manifest_sha256
    from public.content_import_release_records release
    where release.import_id = v_record.import_id;
    if v_release_manifest_sha256 is distinct from v_record.original_release_manifest_sha256 then
      raise exception 'v1 backfill aborted: legacy receipt for % is bound to original release manifest % but the release record holds %.',
        v_record.import_id, v_record.original_release_manifest_sha256, v_release_manifest_sha256;
    end if;

    select coalesce(max(revision), 1) + 1 into v_next_revision
    from public.content_import_release_revisions
    where import_id = v_record.import_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'block_id', mutation.value ->> 'block_id',
      'file_path', mutation.value -> 'replacement_content' ->> 'file_path',
      'sha256', mutation.value ->> 'replacement_sha256',
      'size_bytes', mutation.value ->> 'replacement_size_bytes'
    ) order by mutation.value ->> 'block_id'), '[]'::jsonb)
    into v_download_evidence
    from jsonb_array_elements(v_record.mutations) mutation(value)
    where mutation.value ->> 'block_type' = 'download';

    perform set_config('bmh.release_revision_import_id', v_record.import_id, true);
    insert into public.content_import_release_revisions (
      import_id, revision, kind, state_parent_revision,
      prior_manifest_sha256, manifest_sha256,
      prior_catalog_sha256, catalog_sha256,
      payload_sha256, client_payload_sha256, download_evidence_sha256,
      mutation_count, update_count, insert_count,
      mutations, prior_block_graph, evidence, revised_at, revised_by
    ) values (
      v_record.import_id, v_next_revision, 'content_blocks', v_next_revision - 1,
      v_record.expected_active_manifest_sha256, v_record.manifest_sha256,
      v_record.prior_catalog_sha256, v_record.replacement_catalog_sha256,
      v_record.database_payload_sha256, v_record.client_payload_sha256,
      encode(sha256(convert_to(v_download_evidence::text, 'UTF8')), 'hex'),
      v_expected_mutation_count,
      v_record.guide_update_count + v_record.flashcard_update_count,
      v_record.role_play_insert_count,
      v_record.mutations,
      -- The v1 record carried each update's expected (pre-image) content
      -- inline in its mutations; project it into the same prior_block_graph
      -- shape v2 writes, so the shared row is uniformly rollback-shaped.
      jsonb_build_object(
        'updated_rows', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', mutation.value ->> 'block_id',
            'lesson_id', mutation.value ->> 'lesson_id',
            'block_type', mutation.value ->> 'block_type',
            'content', mutation.value -> 'expected_content',
            'sort_order', (mutation.value ->> 'sort_order')::integer,
            'is_required_for_completion',
              (mutation.value ->> 'is_required_for_completion')::boolean
          ) order by mutation.value ->> 'block_id')
          from jsonb_array_elements(v_record.mutations) mutation(value)
          where mutation.value ->> 'action' = 'update'
        ), '[]'::jsonb),
        'inserted_block_ids', coalesce((
          select jsonb_agg(mutation.value ->> 'block_id')
          from jsonb_array_elements(v_record.mutations) mutation(value)
          where mutation.value ->> 'action' = 'insert'
        ), '[]'::jsonb)
      ),
      v_record.evidence || jsonb_build_object('backfilled_from', 'released_content_blocks_v1'),
      v_record.revised_at, v_record.revised_by
    );
    perform set_config('bmh.release_revision_import_id', '', true);
    v_backfilled := v_backfilled + 1;
    if not (v_record.import_id = any(v_import_ids)) then
      v_import_ids := v_import_ids || v_record.import_id;
    end if;
  end loop;

  -- Final reality check: for every import that gained mirror rows, the LIVE
  -- catalog must equal what the shared ledger now says is active (which,
  -- post-mirror, is the last legacy receipt's replacement checksum). If the
  -- database does not actually sit in the state the legacy history claims,
  -- fail the whole migration loudly rather than record a history that
  -- contradicts reality.
  declare
    v_import_id text;
    v_active_catalog text;
  begin
    foreach v_import_id in array v_import_ids loop
      select active.active_catalog_sha256 into v_active_catalog
      from public.content_import_active_release_v1 active
      where active.import_id = v_import_id;
      v_live_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
      if v_live_catalog_sha256 <> v_active_catalog then
        raise exception 'v1 backfill aborted: after mirroring, the live catalog for % is % but the legacy history claims %.',
          v_import_id, v_live_catalog_sha256, v_active_catalog;
      end if;
    end loop;
  end;

  return jsonb_build_object('status', 'backfilled', 'rows', v_backfilled);
end;
$$;

revoke all on function public.fn_backfill_v1_content_block_revisions()
  from public, anon, authenticated;
grant execute on function public.fn_backfill_v1_content_block_revisions()
  to service_role;

-- Run the backfill now. In production this absorbs the single applied
-- 44-block correction as the next shared revision; on a fresh database the
-- v1 table is empty and this is a no-op.
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_backfill_v1_content_block_revisions();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

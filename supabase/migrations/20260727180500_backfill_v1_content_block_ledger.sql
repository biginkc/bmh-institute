-- Cutover phase 2 (separate committed transaction -- see phase 1's rationale
-- in 20260727180000): absorb the already-applied legacy correction history
-- into the shared content_import_release_revisions ledger. Phase 1 committed
-- the retirement of every legacy correction RPC (the v1 one-shot
-- content-block correction AND the released poster/caption replacement
-- RPCs) and sealed every legacy admission path, so by the time this
-- transaction takes the shared advisory lock (a drain barrier for any
-- in-flight legacy straggler still holding it), all three receipt tables
-- are frozen and this backfill sees the complete, final legacy history.
--
-- Exposed as a callable (service-role-only) function rather than inlined so
-- the SQL test harness can exercise the exact transition inside a rolled-back
-- transaction. Validation is deliberately strict and FAIL-LOUD: a legacy
-- receipt is mirrored only after its predecessor linkage is proven against
-- the reconstructed causal state, and the reconstructed final state must
-- equal the LIVE catalog; any mismatch aborts the whole migration rather
-- than appending a fabricated history.
--
-- CAUSAL REPLAY MODEL (this section is the design contract):
--
-- The catalog history of a released import is a single sequence of state
-- transitions produced by several mechanisms:
--   * the release itself. Going forward, fn_release_course_import_v1 now
--     inserts a real ledger row (kind = legacy_catalog_correction,
--     evidence.operation = 'release_anchor', revision 2) recording the
--     post-publication catalog under the same lock as the pre-publication
--     hash -- see 20260727180000. That row is just ANOTHER pre-existing
--     ledger row to this backfill (an "anchor", below); no special-casing
--     needed for imports released after this migration.
--   * quiz revisions (and their rollbacks), which already write this shared
--     ledger directly (also anchors);
--   * the v1 one-shot content-block correction, and the released
--     poster/caption replacement mechanisms, each of which kept its own
--     append-only receipt table and never wrote this ledger ("receipts").
--
-- This backfill reconstructs that one sequence per import: it merges the
-- existing ledger rows and all unmirrored receipts into one queue ordered
-- by their real timestamps, then walks it while tracking the expected
-- manifest and catalog state. Every event -- anchor or receipt -- must
-- chain exactly from the reconstructed expected state, EXCEPT the very
-- first event overall for an import that has no release-anchor row (an
-- import released BEFORE this migration -- including real production
-- data): its declared prior catalog is trusted directly as the seed, with
-- no comparison against anything. This is sound, not a caller-controlled
-- free pass, because every receipt row was written exclusively by its own
-- CAS-verified, service-role, marker-guarded RPC (the receipt tables'
-- guard triggers are operation-bound and are now sealed entirely) -- a
-- receipt's declared prior catalog IS what the live catalog was at its own
-- execution time, proven by that RPC's own compare-and-swap, not asserted
-- by this backfill. (An earlier version of this migration required a
-- SEPARATE, independently-attested post_publication_catalog_sha256 column
-- before trusting a first event at all -- abandoned as a CRITICAL bug: that
-- column has no default, so every already-released import, including real
-- production data, has it permanently null, and phase 2 would abort on the
-- very first real apply after phase 1 had already committed and retired
-- the legacy write paths. Trusting a receipt's own CAS-proven prior catalog
-- directly needs no such attestation and costs nothing for historical
-- data.)
--
-- The reconstructed chain must still terminate exactly at the LIVE catalog,
-- recomputed under the full canonical lock set below -- a fabricated first
-- event (or any other tampering) cannot lead anywhere real, so this is
-- still a real safety net even though the first event itself is trusted.
--
-- The returned first_events_trusted count is reconciled per import against
-- whether this CALL actually appended new lineage, not against how many
-- times the trust comparison internally evaluated true: the first event's
-- own prior_catalog is compared against the release record's pre-publication
-- snapshot on EVERY call for an already-resolved import (there is nothing
-- to persist the bridge on -- the anchor/mirror row that resolved it holds
-- the same value on every subsequent read), so a naive per-comparison count
-- would double-count on every idempotent re-run forever. Counting only
-- when new rows are appended keeps the returned metric call-scoped and
-- idempotency-safe: a re-run that finds everything already mirrored reports
-- zero, regardless of how many imports' genesis anchors it re-verifies.
--
-- Fail-loud consequences, on purpose: catalog movement this model cannot
-- explain (an unrecorded mutation between receipts, a receipt that breaks
-- the chain, a history whose causally-last event is an anchor that older
-- mirrors would out-number in the active view) aborts the migration. An
-- abort means the real history needs an explicitly attested correction --
-- never a silent pass.

set lock_timeout = '10s';

create or replace function public.fn_backfill_v1_content_block_revisions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_release record;
  v_event record;
  v_mirror public.content_import_release_revisions%rowtype;
  v_expected_manifest text;
  v_expected_catalog text;
  v_parent_revision integer;
  v_first_event_seen boolean;
  v_next_revision integer;
  v_live_catalog text;
  v_active_catalog text;
  v_expected_mutation_count integer;
  v_absorbed_into_revision integer;
  v_download_evidence jsonb;
  v_backfilled integer := 0;
  v_first_events_trusted integer := 0;
  v_import_trust_used boolean;
  v_import_backfilled_start integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'v1 content block revision backfill requires service_role.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  -- Lock the ledger and every legacy receipt table this backfill reads, plus
  -- the FULL canonical catalog-hash table set via the shared helper: the
  -- final verification below hashes the MUTABLE catalog, and without these
  -- locks a concurrent write (an admin edit, an access change) could land
  -- between the final hash read and this transaction's commit -- recording
  -- an active catalog checksum that is stale at birth. Locks are held
  -- through commit.
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.content_import_released_content_block_revision_records,
    public.content_import_video_poster_replacement_records,
    public.content_import_video_caption_replacement_records
  in share row exclusive mode;
  perform public.fn_lock_course_import_catalog_tables();

  for v_import_id in
    select distinct source.import_id
    from (
      select record.import_id from public.content_import_released_content_block_revision_records record
      union
      select record.import_id from public.content_import_video_poster_replacement_records record
      union
      select record.import_id from public.content_import_video_caption_replacement_records record
    ) source
    order by source.import_id
  loop
    select release.manifest_sha256, release.catalog_sha256, release.released_at
    into v_release
    from public.content_import_release_records release
    where release.import_id = v_import_id;
    if not found then
      raise exception 'v1 backfill aborted: % has a legacy receipt but no release record.',
        v_import_id;
    end if;

    v_expected_manifest := v_release.manifest_sha256;
    v_expected_catalog := v_release.catalog_sha256;
    v_parent_revision := 1;
    v_import_trust_used := false;
    v_import_backfilled_start := v_backfilled;
    -- True only until the FIRST event (anchor or receipt) in the merged
    -- queue below has been processed. If that first event is a
    -- release-anchor row (every import released after this migration), it
    -- chains normally (its own prior_catalog_sha256 is the release's
    -- pre-publish capture, matching v_expected_catalog exactly) and this
    -- flag is irrelevant. If it is a legacy receipt (any import released
    -- BEFORE this migration, real production data included), its declared
    -- prior catalog is trusted directly -- see the header comment.
    v_first_event_seen := false;

    -- ONE causal queue: existing ledger rows of every kind ("anchors" --
    -- release anchors, quiz revisions and their rollbacks, previously
    -- created mirrors) plus every legacy receipt, ordered by real event
    -- time. Anchors sort before receipts on a timestamp tie so an
    -- already-created mirror carries the chain before its source receipt
    -- is reached (and skipped).
    for v_event in
      select * from (
        select
          row.revised_at as event_at, true as is_anchor,
          'anchor'::text as source, row.revision,
          row.prior_manifest_sha256 as prior_manifest,
          row.manifest_sha256 as manifest,
          row.prior_catalog_sha256 as prior_catalog,
          row.catalog_sha256 as catalog,
          null::text as expected_active_manifest,
          null::text as original_release_manifest,
          null::text as database_payload_sha256, null::text as client_payload_sha256,
          null::integer as guide_update_count, null::integer as flashcard_update_count,
          null::integer as role_play_insert_count,
          null::jsonb as mutations, null::jsonb as evidence, null::uuid as revised_by
        from public.content_import_release_revisions row
        where row.import_id = v_import_id
        union all
        select
          record.revised_at, false, 'content_blocks', null,
          null, record.manifest_sha256,
          record.prior_catalog_sha256, record.replacement_catalog_sha256,
          record.expected_active_manifest_sha256,
          record.original_release_manifest_sha256,
          record.database_payload_sha256, record.client_payload_sha256,
          record.guide_update_count, record.flashcard_update_count,
          record.role_play_insert_count,
          record.mutations, record.evidence, record.revised_by
        from public.content_import_released_content_block_revision_records record
        where record.import_id = v_import_id
        union all
        select
          record.replaced_at, false, 'poster_replacement', null,
          null, null,
          record.prior_catalog_sha256, record.replacement_catalog_sha256,
          null, null,
          record.database_payload_sha256, record.client_payload_sha256,
          null, null, null,
          null,
          jsonb_build_object(
            'operation', 'poster_replacement',
            'approval_evidence_sha256', record.approval_evidence_sha256,
            'preflight_evidence_sha256', record.preflight_evidence_sha256,
            'replacement_count', record.replacement_count
          ),
          null
        from public.content_import_video_poster_replacement_records record
        where record.import_id = v_import_id
        union all
        select
          record.replaced_at, false, 'caption_replacement', null,
          null, null,
          record.prior_catalog_sha256, record.replacement_catalog_sha256,
          null, null,
          record.database_payload_sha256, record.client_payload_sha256,
          null, null, null,
          null,
          jsonb_build_object(
            'operation', 'caption_replacement',
            'approval_evidence_sha256', record.approval_evidence_sha256,
            'replacement_count', record.replacement_count
          ),
          null
        from public.content_import_video_caption_replacement_records record
        where record.import_id = v_import_id
      ) merged
      order by merged.event_at, merged.is_anchor desc,
        coalesce(merged.revision, 2147483647), merged.database_payload_sha256
    loop
      if v_event.is_anchor then
        -- Existing ledger rows are immutable evidence: they must chain
        -- exactly from the reconstructed state, UNLESS this is the very
        -- first event ever seen for this import (no release-anchor row
        -- exists -- see the header comment) -- then its declared prior
        -- catalog is trusted directly, no comparison performed.
        --
        -- This can legitimately fire on EVERY call for the same import
        -- (v_expected_catalog is re-seeded from v_release.catalog_sha256,
        -- the pre-publication snapshot, at the top of every per-import
        -- iteration -- so an already-resolved genesis anchor's own
        -- post-publication prior_catalog mismatches it on every call, not
        -- just the first). That is fine: it only marks v_import_trust_used,
        -- which is reconciled against whether this call actually appends
        -- anything NEW for this import (see below) before it ever affects
        -- the returned v_first_events_trusted count -- so a re-run that
        -- re-walks an already-fully-mirrored import reports 0 regardless of
        -- how many times this branch internally re-fires.
        if not v_first_event_seen and v_event.prior_catalog <> v_expected_catalog then
          v_expected_catalog := v_event.prior_catalog;
          v_import_trust_used := true;
        end if;
        v_first_event_seen := true;
        if v_event.prior_catalog <> v_expected_catalog
          or v_event.prior_manifest <> v_expected_manifest
        then
          raise exception 'v1 backfill aborted: ledger revision % for % does not chain from the reconstructed causal state (expected manifest %, catalog %; row declares %, %).',
            v_event.revision, v_import_id, v_expected_manifest, v_expected_catalog,
            v_event.prior_manifest, v_event.prior_catalog;
        end if;
        v_expected_manifest := v_event.manifest;
        v_expected_catalog := v_event.catalog;
        v_parent_revision := v_event.revision;
        continue;
      end if;

      -- Receipt. Idempotency first, bound to FULL receipt identity: if a
      -- mirror row already carries this receipt's payload digest, every
      -- other identity field must match exactly -- a partial match means
      -- the ledger and the legacy history disagree, and appending anything
      -- on top of that disagreement would fabricate lineage. The mirror
      -- itself already advanced the chain as an anchor above.
      select mirror.* into v_mirror
      from public.content_import_release_revisions mirror
      where mirror.import_id = v_import_id
        and mirror.kind = (case when v_event.source = 'content_blocks'
          then 'content_blocks' else 'legacy_catalog_correction' end)
        and mirror.payload_sha256 = v_event.database_payload_sha256;
      if found then
        if v_mirror.prior_catalog_sha256 <> v_event.prior_catalog
          or v_mirror.catalog_sha256 <> v_event.catalog
          or v_mirror.client_payload_sha256 <> v_event.client_payload_sha256
          or (v_event.source = 'content_blocks' and (
            v_mirror.manifest_sha256 <> v_event.manifest
            or v_mirror.prior_manifest_sha256 <> v_event.expected_active_manifest
            or v_mirror.mutation_count <> v_event.guide_update_count
              + v_event.flashcard_update_count + v_event.role_play_insert_count
          ))
        then
          raise exception 'v1 backfill aborted: an existing mirror row for % (payload %) does not match the legacy receipt identity.',
            v_import_id, v_event.database_payload_sha256;
        end if;
        continue;
      end if;

      -- Predecessor CATALOG linkage: trust the FIRST event's declared
      -- prior catalog directly (see the header comment); every OTHER
      -- receipt must chain exactly from the reconstructed causal state.
      -- This branch is unreachable for an already-mirrored receipt (the
      -- idempotency check above already matched and `continue`d it), so
      -- reaching here always means a genuinely NEW row is about to be
      -- inserted for this import -- see v_import_trust_used below.
      if not v_first_event_seen and v_event.prior_catalog <> v_expected_catalog then
        v_expected_catalog := v_event.prior_catalog;
        v_import_trust_used := true;
      end if;
      v_first_event_seen := true;

      -- Predecessor MANIFEST chain (v1 content receipts only -- poster and
      -- caption corrections never touch the manifest): the receipt's
      -- declared predecessor manifest must be exactly the reconstructed
      -- causal manifest at this point in the sequence, which also validates
      -- receipt-to-receipt linkage across interleaved quiz revisions.
      if v_event.source = 'content_blocks'
        and v_event.expected_active_manifest <> v_expected_manifest
      then
        raise exception 'v1 backfill aborted: legacy receipt for % declares predecessor manifest % but the reconstructed causal manifest is %.',
          v_import_id, v_event.expected_active_manifest, v_expected_manifest;
      end if;

      if v_event.prior_catalog <> v_expected_catalog then
        raise exception 'v1 backfill aborted: legacy receipt for % (%) declares predecessor catalog % but the reconstructed causal catalog is %.',
          v_import_id, v_event.source, v_event.prior_catalog, v_expected_catalog;
      end if;
      if v_event.prior_catalog = v_event.catalog then
        raise exception 'v1 backfill aborted: legacy receipt for % (%) claims an unchanged catalog, which no applied correction can produce.',
          v_import_id, v_event.source;
      end if;

      if v_event.source = 'content_blocks' then
        -- Original-release binding (content-block receipts only).
        if v_event.original_release_manifest is distinct from v_release.manifest_sha256 then
          raise exception 'v1 backfill aborted: legacy receipt for % is bound to original release manifest % but the release record holds %.',
            v_import_id, v_event.original_release_manifest, v_release.manifest_sha256;
        end if;
      end if;

      select coalesce(max(revision), 1) + 1 into v_next_revision
      from public.content_import_release_revisions
      where import_id = v_import_id;

      -- If an EXISTING quiz anchor already recorded this mirror's resulting
      -- catalog as ITS OWN prior catalog, that anchor's live execution
      -- already causally absorbed this mirror's effect -- even though the
      -- anchor's own (immutable) state_parent_revision cannot be rewritten
      -- to point at a row this backfill is only now inserting. Record the
      -- edge on the NEW row instead (see absorbed_into_revision's column
      -- comment); fn_classify_revision_lineage traverses it so this mirror
      -- still classifies as a genuine superseded ancestor of the current
      -- state, not diverged. Scoped to quiz anchors: those are the only
      -- kind that could have existed, chronologically, before this
      -- backfill ever ran.
      select revision into v_absorbed_into_revision
      from public.content_import_release_revisions
      where import_id = v_import_id
        and kind = 'quiz'
        and prior_catalog_sha256 = v_event.catalog
      limit 1;

      if v_event.source = 'content_blocks' then
        v_expected_mutation_count := v_event.guide_update_count
          + v_event.flashcard_update_count + v_event.role_play_insert_count;
        select coalesce(jsonb_agg(jsonb_build_object(
          'block_id', mutation.value ->> 'block_id',
          'file_path', mutation.value -> 'replacement_content' ->> 'file_path',
          'sha256', mutation.value ->> 'replacement_sha256',
          'size_bytes', mutation.value ->> 'replacement_size_bytes'
        ) order by mutation.value ->> 'block_id'), '[]'::jsonb)
        into v_download_evidence
        from jsonb_array_elements(v_event.mutations) mutation(value)
        where mutation.value ->> 'block_type' = 'download';

        perform set_config('bmh.release_revision_import_id', v_import_id, true);
        insert into public.content_import_release_revisions (
          import_id, revision, kind, state_parent_revision, absorbed_into_revision,
          prior_manifest_sha256, manifest_sha256,
          prior_catalog_sha256, catalog_sha256,
          payload_sha256, client_payload_sha256, download_evidence_sha256,
          mutation_count, update_count, insert_count,
          mutations, prior_block_graph, evidence, revised_at, revised_by
        ) values (
          v_import_id, v_next_revision, 'content_blocks', v_parent_revision, v_absorbed_into_revision,
          v_expected_manifest, v_event.manifest,
          v_event.prior_catalog, v_event.catalog,
          v_event.database_payload_sha256, v_event.client_payload_sha256,
          encode(sha256(convert_to(v_download_evidence::text, 'UTF8')), 'hex'),
          v_expected_mutation_count,
          v_event.guide_update_count + v_event.flashcard_update_count,
          v_event.role_play_insert_count,
          v_event.mutations,
          -- The v1 record carried each update's expected (pre-image)
          -- content inline in its mutations; project it into the same
          -- prior_block_graph shape v2 writes, so the shared row is
          -- uniformly rollback-shaped.
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
              from jsonb_array_elements(v_event.mutations) mutation(value)
              where mutation.value ->> 'action' = 'update'
            ), '[]'::jsonb),
            'inserted_block_ids', coalesce((
              select jsonb_agg(mutation.value ->> 'block_id')
              from jsonb_array_elements(v_event.mutations) mutation(value)
              where mutation.value ->> 'action' = 'insert'
            ), '[]'::jsonb)
          ),
          v_event.evidence || jsonb_build_object('backfilled_from', 'released_content_blocks_v1'),
          v_event.event_at, v_event.revised_by
        );
        perform set_config('bmh.release_revision_import_id', '', true);
        v_expected_manifest := v_event.manifest;
      else
        -- Poster/caption replacement: a validated lineage edge that carries
        -- no manifest change and no mutation payload -- see the
        -- legacy_catalog_correction kind-shape constraint (20260727180000).
        perform set_config('bmh.release_revision_import_id', v_import_id, true);
        insert into public.content_import_release_revisions (
          import_id, revision, kind, state_parent_revision, absorbed_into_revision,
          prior_manifest_sha256, manifest_sha256,
          prior_catalog_sha256, catalog_sha256,
          payload_sha256, client_payload_sha256,
          evidence, revised_at, revised_by
        ) values (
          v_import_id, v_next_revision, 'legacy_catalog_correction', v_parent_revision, v_absorbed_into_revision,
          v_expected_manifest, v_expected_manifest,
          v_event.prior_catalog, v_event.catalog,
          v_event.database_payload_sha256, v_event.client_payload_sha256,
          v_event.evidence || jsonb_build_object(
            'backfilled_from', case v_event.source
              when 'poster_replacement' then 'released_video_poster_replacement_v1'
              else 'released_video_caption_replacement_v1'
            end
          ),
          v_event.event_at, v_event.revised_by
        );
        perform set_config('bmh.release_revision_import_id', '', true);
      end if;

      v_expected_catalog := v_event.catalog;
      v_parent_revision := v_next_revision;
      v_backfilled := v_backfilled + 1;
    end loop;

    -- Reconcile the per-import trust flag against whether this CALL
    -- actually appended anything new for this import. The flag can fire
    -- every single time this import's genesis is walked (an anchor's own
    -- prior_catalog is compared against the pre-publication snapshot on
    -- every call, not just the first -- see the anchor branch's comment
    -- above), so it is not by itself a safe signal for the returned count.
    -- Whether new rows were appended IS call-scoped and idempotency-safe:
    -- an already-mirrored receipt is matched and skipped before it can ever
    -- contribute a new row, so v_backfilled only advances for this import
    -- when genuinely new lineage is built on top of the trusted genesis.
    if v_import_trust_used and v_backfilled > v_import_backfilled_start then
      v_first_events_trusted := v_first_events_trusted + 1;
    end if;

    -- Reality checks, per import: the reconstructed final state must be
    -- exactly the LIVE catalog (recomputed under the full lock set), and
    -- the active-state view -- which reads the MAX-revision row -- must
    -- also land on it. The second check fails loudly for a history whose
    -- causally-last event is a pre-existing anchor that this backfill's
    -- later-numbered mirrors would out-number in the view: that interleave
    -- cannot be represented without renumbering immutable rows, so it must
    -- be resolved explicitly, never silently.
    v_live_catalog := public.fn_course_import_catalog_sha256(v_import_id);
    if v_live_catalog <> v_expected_catalog then
      raise exception 'v1 backfill aborted: after replay, the live catalog for % is % but the legacy history claims %.',
        v_import_id, v_live_catalog, v_expected_catalog;
    end if;
    select active.active_catalog_sha256 into v_active_catalog
    from public.content_import_active_release_v1 active
    where active.import_id = v_import_id;
    if v_active_catalog <> v_expected_catalog then
      raise exception 'v1 backfill aborted: the active-state view for % resolves catalog % but the causally-final state is % -- the history''s ordering cannot be represented by the shared ledger''s revision numbering.',
        v_import_id, v_active_catalog, v_expected_catalog;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'backfilled',
    'rows', v_backfilled,
    'first_events_trusted', v_first_events_trusted
  );
end;
$$;

revoke all on function public.fn_backfill_v1_content_block_revisions()
  from public, anon, authenticated;
grant execute on function public.fn_backfill_v1_content_block_revisions()
  to service_role;

-- Run the backfill now. In production this absorbs the applied poster and
-- caption corrections plus the single 44-block v1 correction as validated
-- shared-ledger lineage; on a fresh database all three receipt tables are
-- empty and this is a no-op.
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_backfill_v1_content_block_revisions();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { assertApprovedVoiceId } from "../../scripts/course-content/closer-lab-production-mapping.mjs";

const ATTESTATION_URL = new URL(
  "../../docs/course-production/oral-check-pilot-production-attestation.json",
  import.meta.url,
);
const MIGRATION_URL = new URL(
  "../../supabase/migrations/20260728020000_insert_oral_check_pilot_role_play_blocks.sql",
  import.meta.url,
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ElevenLabs voice IDs are opaque 20-character alphanumeric tokens (not
// UUIDs) -- e.g. the canonical Andrea PVC clone c7VyuzKrx3xIuZs8QT0P.
const ELEVENLABS_VOICE_ID_PATTERN = /^[0-9A-Za-z]{16,32}$/;

async function loadAttestation() {
  return JSON.parse(await readFile(ATTESTATION_URL, "utf8"));
}

// Finds the single jsonb_build_object(...) mutation element in the
// migration's v_mutations array that declares this exact block_id, and
// returns just that element's source text (up to the next 'block_id', or
// the end of the array). Binding block_id -> source_key -> scenario_id
// within ONE extracted substring, in ONE assertion, is what makes a swapped
// lesson-to-scenario mapping actually detectable: two independent
// migrationSql.includes() checks (the round-1 shape) would both still pass
// even if source_key A's mutation object were the one carrying scenario B's
// scenario_id, because both substrings exist SOMEWHERE in the file -- just
// not necessarily together.
function extractMutationElement(migrationSql, blockId) {
  const marker = `'block_id', '${blockId}',`;
  const start = migrationSql.indexOf(marker);
  if (start === -1) {
    throw new Error(`Migration has no mutation element for block_id ${blockId}`);
  }
  const nextMarkerIndex = migrationSql.indexOf("'block_id', '", start + marker.length);
  const arrayEndIndex = migrationSql.indexOf("\n  );\n\n  v_database_payload_sha256", start);
  const end = nextMarkerIndex === -1 ? arrayEndIndex : Math.min(nextMarkerIndex, arrayEndIndex === -1 ? Infinity : arrayEndIndex);
  if (end === -1 || end <= start) {
    throw new Error(`Could not bound the mutation element for block_id ${blockId}`);
  }
  return migrationSql.slice(start, end);
}

// This is a much lighter contract than the 6-scenario Closer Lab
// production-mapping ledger/catalog/provenance chain (checksum-pinned to a
// closed sales-role-play namespace via a live production RPC export) --
// deliberately so. This attestation exists to prove the 3 Andrea Oral Check
// scenario IDs bound in the pilot migration are real, live, persona-backed,
// voice-bound Closer Lab role_plays, checked in as read-only-verified
// evidence, without requiring the Closer Lab-side export RPC that namespace
// does not have yet. See the attestation file's own "purpose" field and the
// migration's header comment for the full reasoning.
test("the oral-check pilot production attestation is internally consistent", async () => {
  const attestation = await loadAttestation();

  assert.equal(attestation.schema_version, 1);
  assert.equal(attestation.verification.project_ref, "xqrkugdxpwhjscrheuqo");
  assert.equal(attestation.scenarios.length, 3);
  assert.equal(attestation.summary.scenario_count, 3);
  assert.equal(attestation.summary.total_rubric_goals, 12);
  assert.equal(attestation.summary.total_rubric_goal_documents, 12);
  assert.equal(attestation.summary.all_non_archived, true);
  assert.equal(attestation.summary.all_voice_ids_present_and_equal, true);
  // Reuses the repo's own approved-voice validator (the same one the
  // frozen 6-scenario chain's fetchCloserProductionGraph() calls) rather
  // than a bespoke regex, so this test and the production trust path agree
  // on what counts as a valid, non-empty voice binding.
  assert.equal(
    assertApprovedVoiceId(attestation.summary.shared_voice_id),
    attestation.summary.shared_voice_id,
  );

  for (const scenario of attestation.scenarios) {
    assert.match(scenario.role_play_id, UUID_PATTERN, `${scenario.block_source_key} role_play_id is a real UUID`);
    assert.match(scenario.persona_id, UUID_PATTERN, `${scenario.block_source_key} persona_id is a real UUID`);
    assert.match(scenario.block_id, UUID_PATTERN, `${scenario.block_source_key} block_id is a real UUID`);
    assert.equal(scenario.archived_at, null, `${scenario.block_source_key} is not archived`);
    assert.equal(scenario.persona_archived_at, null, `${scenario.block_source_key} persona is not archived`);
    // The mandatory voice binding: the repo's established Closer Lab trust
    // validator (assertApprovedVoiceId, reused above and again per-scenario
    // here) treats a missing or blank voice_id as a hard failure. Prior to
    // this fix, this attestation never recorded voice_id at all, so a
    // persona with no usable voice binding would have attested clean.
    assert.match(scenario.voice_id, ELEVENLABS_VOICE_ID_PATTERN, `${scenario.block_source_key} persona has a real ElevenLabs voice_id`);
    assert.equal(
      scenario.voice_id,
      attestation.summary.shared_voice_id,
      `${scenario.block_source_key} voice_id matches the attested shared voice`,
    );
    assert.ok(
      typeof scenario.role_play_managed_source_key === "string"
        && scenario.role_play_managed_source_key.startsWith("bmh-institute-oral-checks-v1:role-play:"),
      `${scenario.block_source_key} role_play has a namespaced managed_source_key`,
    );
    assert.ok(
      typeof scenario.persona_managed_source_key === "string"
        && scenario.persona_managed_source_key.startsWith("bmh-institute-oral-checks-v1:persona:"),
      `${scenario.block_source_key} persona has a namespaced managed_source_key`,
    );
    assert.equal(scenario.rubric_goals.length, 4, `${scenario.block_source_key} has exactly 4 rubric goals`);
    assert.equal(
      scenario.rubric_goals.reduce((sum, goal) => sum + goal.weight, 0),
      100,
      `${scenario.block_source_key} rubric goal weights sum to 100`,
    );
    for (const goal of scenario.rubric_goals) {
      assert.match(goal.id, UUID_PATTERN, `${scenario.block_source_key} rubric goal id is a real UUID`);
      // Active-data completeness: not just "at least one document", but
      // that this goal is itself not silently archived while still being
      // reported as part of a "clean" attestation.
      assert.ok(goal.document_count >= 1, `${scenario.block_source_key} goal "${goal.name}" has at least one supporting document`);
    }
  }

  const roleplayIds = new Set(attestation.scenarios.map((scenario) => scenario.role_play_id));
  assert.equal(roleplayIds.size, 3, "all three scenario IDs are unique");
  const blockIds = new Set(attestation.scenarios.map((scenario) => scenario.block_id));
  assert.equal(blockIds.size, 3, "all three block IDs are unique");
});

test("each scenario's block_id, source_key, and scenario_id are bound TOGETHER in the migration's own mutation element, not just present somewhere in the file", async () => {
  const [attestation, migrationSql] = await Promise.all([
    loadAttestation(),
    readFile(MIGRATION_URL, "utf8"),
  ]);

  for (const scenario of attestation.scenarios) {
    const element = extractMutationElement(migrationSql, scenario.block_id);
    // A single assertion, scoped to the one substring that IS this
    // scenario's mutation element: if a future edit swapped which
    // scenario_id or source_key belongs to which block_id, this substring
    // would no longer contain the right pairing and this line would fail --
    // unlike two independent whole-file .includes() checks, which both
    // pass regardless of which mutation element each string actually lives
    // in.
    assert.ok(
      element.includes(`'source_key', '${scenario.block_source_key}',`)
        && element.includes(`'scenario_id', '${scenario.role_play_id}',`),
      `migration's mutation element for block_id ${scenario.block_id} binds source_key ${scenario.block_source_key} and scenario_id ${scenario.role_play_id} together`,
    );
  }

  const attestedIds = new Set(attestation.scenarios.map((scenario) => scenario.role_play_id));
  assert.equal(attestedIds.size, 3);
});

// A protected, opt-in live recheck: mirrors the frozen 6-scenario chain's
// BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION pattern in
// import-semantic-gate.mjs, but scoped to this attestation instead of the
// production_rpc-based ledger (there is no export_bmh_institute_production_graph
// equivalent for the oral-check namespace -- see the migration's header
// comment). Silently skipped unless BOTH an explicit opt-in flag AND
// credentials are present, so this never turns into a live production call
// inside routine CI. DISCLOSED LIMITATION: the PostgREST embed query below
// (role_plays -> persona, role_play_goals -> rubric_goals ->
// rubric_goal_documents(count)) was verified column-by-column and FK-by-FK
// against the live information_schema (read-only, via Supabase MCP
// execute_sql, 2026-07-28), and the same 3 role_play/persona/goal rows this
// query targets were independently confirmed live and matching this
// attestation via direct SQL in that same session -- but the REST embed
// call itself, through this exact fetch() path with a real service-role
// bearer token, has NOT been executed end-to-end because no
// CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY was available in this session. Run
// it for real, once, immediately before the migration is actually applied
// to production (see the migration's header comment), and fix forward if
// the exact embed shape needs adjustment, with:
//   BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION=1 \
//   CLOSER_LAB_PRODUCTION_SUPABASE_URL=https://xqrkugdxpwhjscrheuqo.supabase.co \
//   CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY=... \
//   node --test content/course-manifests/oral-check-pilot-production-attestation.qa.test.mjs
test("live recheck: the attested role_play/persona/goal data still matches production exactly (opt-in, credentialed)", async (t) => {
  if (process.env.BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION !== "1") {
    t.skip("set BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION=1 to run the live recheck");
    return;
  }
  const url = process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL;
  const serviceRoleKey = process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION=1 requires CLOSER_LAB_PRODUCTION_SUPABASE_URL and CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY to also be set.",
    );
  }
  const {
    assertCloserProductionUrl,
    buildCloserServiceHeaders,
  } = await import("../../scripts/course-content/closer-lab-production-mapping.mjs");
  const canonicalUrl = assertCloserProductionUrl(url);
  const attestation = await loadAttestation();
  const ids = attestation.scenarios.map((scenario) => scenario.role_play_id);
  const endpoint = new URL(
    `/rest/v1/role_plays?id=in.(${ids.join(",")})&select=id,title,archived_at,managed_source_key,persona:personas(id,name,voice_id,archived_at,managed_source_key),role_play_goals(sort_order,weight,rubric_goals(id,name,archived_at,rubric_goal_documents(count)))`,
    canonicalUrl,
  );
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    headers: buildCloserServiceHeaders(serviceRoleKey),
  });
  if (response.url !== endpoint.href) {
    throw new Error("Live recheck response did not originate from the exact canonical Closer Lab REST endpoint.");
  }
  if (!response.ok) {
    throw new Error(`Live recheck request failed with HTTP ${response.status}.`);
  }
  const live = await response.json();
  const liveById = new Map(live.map((row) => [row.id, row]));

  assert.equal(liveById.size, 3, "live query returned all 3 attested role_plays");
  for (const scenario of attestation.scenarios) {
    const row = liveById.get(scenario.role_play_id);
    assert.ok(row, `${scenario.block_source_key} scenario_id ${scenario.role_play_id} still exists in production`);
    assert.equal(row.archived_at, null, `${scenario.block_source_key} is still not archived`);
    assert.equal(row.managed_source_key, scenario.role_play_managed_source_key);
    // Round-3 review (finding 2) caught that this test used to stop at
    // counts and totals: it never compared the role-play TITLE, the
    // PERSONA IDENTITY, or each individual goal's id/name/order/weight
    // against the checked-in attestation. Four different active goals that
    // happen to also total weight 100 would have passed this test cleanly
    // while learners were actually scored against the wrong rubric
    // entirely. Every field below is now deep-compared against the exact
    // checked-in attestation, not just shape/count/sum.
    assert.equal(row.title, scenario.title, `${scenario.block_source_key} role_play title matches the attested title exactly`);
    assert.equal(row.persona.id, scenario.persona_id, `${scenario.block_source_key} persona id matches the attested persona identity`);
    assert.equal(row.persona.name, scenario.persona_name, `${scenario.block_source_key} persona name matches the attested persona identity`);
    assert.equal(row.persona.voice_id, scenario.voice_id, `${scenario.block_source_key} voice_id has not drifted`);
    assert.equal(row.persona.archived_at, null, `${scenario.block_source_key} persona is still not archived`);
    assert.equal(row.persona.managed_source_key, scenario.persona_managed_source_key);
    assert.equal(row.role_play_goals.length, 4, `${scenario.block_source_key} has exactly 4 live goal links`);
    assert.equal(scenario.rubric_goals.length, 4, `${scenario.block_source_key} has exactly 4 attested goal links`);

    const liveSortOrders = row.role_play_goals.map((link) => link.sort_order).slice().sort((left, right) => left - right);
    assert.deepEqual(liveSortOrders, [0, 1, 2, 3], `${scenario.block_source_key} live goal links have exactly sort_order 0-3, no duplicates or gaps`);
    const attestedSortOrders = scenario.rubric_goals.map((goal) => goal.sort_order).slice().sort((left, right) => left - right);
    assert.deepEqual(attestedSortOrders, [0, 1, 2, 3], `${scenario.block_source_key} attested goals have exactly sort_order 0-3, no duplicates or gaps`);

    const liveGoalsBySortOrder = [...row.role_play_goals].sort((left, right) => left.sort_order - right.sort_order);
    const attestedGoalsBySortOrder = [...scenario.rubric_goals].sort((left, right) => left.sort_order - right.sort_order);
    for (let index = 0; index < attestedGoalsBySortOrder.length; index += 1) {
      const liveGoal = liveGoalsBySortOrder[index];
      const attestedGoal = attestedGoalsBySortOrder[index];
      // Binds id, name, order, individual weight, and document count
      // together for the goal AT THIS EXACT rubric position -- a swapped or
      // substituted rubric (same 4 weights summing to 100, wrong goals)
      // fails here even though total-weight and count checks alone would
      // not catch it.
      assert.equal(liveGoal.rubric_goals.id, attestedGoal.id, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} id matches`);
      assert.equal(liveGoal.rubric_goals.name, attestedGoal.name, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} name matches`);
      assert.equal(Number(liveGoal.weight), attestedGoal.weight, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} individual weight matches`);
      assert.equal(liveGoal.rubric_goals.archived_at, null, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} is not archived`);
      const liveDocumentCount = Number(liveGoal.rubric_goals.rubric_goal_documents?.[0]?.count ?? 0);
      assert.equal(liveDocumentCount, attestedGoal.document_count, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} document_count matches`);
      assert.ok(liveDocumentCount >= 1, `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order} has at least one supporting document`);
    }

    const liveWeightSum = row.role_play_goals.reduce((sum, link) => sum + Number(link.weight), 0);
    assert.equal(liveWeightSum, 100, `${scenario.block_source_key} live goal weights still sum to 100`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

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

async function loadAttestation() {
  return JSON.parse(await readFile(ATTESTATION_URL, "utf8"));
}

// This is a much lighter contract than the 6-scenario Closer Lab
// production-mapping ledger/catalog/provenance chain (checksum-pinned to a
// closed sales-role-play namespace via a live production RPC export) --
// deliberately so. This attestation exists to prove the 3 Andrea Oral Check
// scenario IDs bound in the pilot migration are real, live, persona-backed
// Closer Lab role_plays, checked in as read-only-verified evidence, without
// requiring the Closer Lab-side export RPC that namespace does not have
// yet. See the attestation file's own "purpose" field and the migration's
// header comment for the full reasoning.
test("the oral-check pilot production attestation is internally consistent", async () => {
  const attestation = await loadAttestation();

  assert.equal(attestation.schema_version, 1);
  assert.equal(attestation.verification.project_ref, "xqrkugdxpwhjscrheuqo");
  assert.equal(attestation.scenarios.length, 3);
  assert.equal(attestation.summary.scenario_count, 3);
  assert.equal(attestation.summary.total_rubric_goals, 12);
  assert.equal(attestation.summary.total_rubric_goal_documents, 12);
  assert.equal(attestation.summary.all_non_archived, true);

  for (const scenario of attestation.scenarios) {
    assert.match(scenario.role_play_id, UUID_PATTERN, `${scenario.block_source_key} role_play_id is a real UUID`);
    assert.match(scenario.persona_id, UUID_PATTERN, `${scenario.block_source_key} persona_id is a real UUID`);
    assert.equal(scenario.archived_at, null, `${scenario.block_source_key} is not archived`);
    assert.equal(scenario.persona_archived_at, null, `${scenario.block_source_key} persona is not archived`);
    assert.equal(scenario.rubric_goals.length, 4, `${scenario.block_source_key} has exactly 4 rubric goals`);
    assert.equal(
      scenario.rubric_goals.reduce((sum, goal) => sum + goal.weight, 0),
      100,
      `${scenario.block_source_key} rubric goal weights sum to 100`,
    );
    for (const goal of scenario.rubric_goals) {
      assert.match(goal.id, UUID_PATTERN, `${scenario.block_source_key} rubric goal id is a real UUID`);
      assert.ok(goal.document_count >= 1, `${scenario.block_source_key} goal "${goal.name}" has at least one supporting document`);
    }
  }

  const roleplayIds = new Set(attestation.scenarios.map((scenario) => scenario.role_play_id));
  assert.equal(roleplayIds.size, 3, "all three scenario IDs are unique");
});

test("the attested scenario IDs exactly match what the pilot migration binds", async () => {
  const [attestation, migrationSql] = await Promise.all([
    loadAttestation(),
    readFile(MIGRATION_URL, "utf8"),
  ]);

  for (const scenario of attestation.scenarios) {
    assert.ok(
      migrationSql.includes(`'scenario_id', '${scenario.role_play_id}'`),
      `migration binds ${scenario.block_source_key}'s attested scenario_id ${scenario.role_play_id}`,
    );
    assert.ok(
      migrationSql.includes(`'source_key', '${scenario.block_source_key}'`),
      `migration uses the attested block_source_key ${scenario.block_source_key}`,
    );
  }

  const attestedIds = new Set(attestation.scenarios.map((scenario) => scenario.role_play_id));
  assert.equal(attestedIds.size, 3);
});

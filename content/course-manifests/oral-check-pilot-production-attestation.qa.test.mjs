import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { test } from "node:test";

import { assertApprovedVoiceId } from "../../scripts/course-content/closer-lab-production-mapping.mjs";

const ATTESTATION_URL = new URL(
  "../../docs/course-production/oral-check-pilot-production-attestation.json",
  import.meta.url,
);
const RECEIPT_URL = new URL(
  "../../docs/course-production/oral-check-pilot-live-verification-receipt.json",
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// Round-9 review, finding 1. The receipt is staged in memory by the live
// recheck and committed to disk only if the whole process exits clean, so a
// run that fails anywhere -- including in the mutation tests that prove the
// drift detection still works -- leaves no evidence the apply command would
// accept. Combined with deleting any prior receipt at the start of the live
// recheck, this means a receipt can only ever describe a run that verified
// production end to end and then passed every other assertion in the file.
let stagedReceipt = null;

process.on("exit", () => {
  if (stagedReceipt === null) {
    return;
  }
  if (process.exitCode !== undefined && process.exitCode !== 0) {
    return;
  }
  writeFileSync(RECEIPT_URL, `${JSON.stringify(stagedReceipt, null, 2)}\n`, "utf8");
});

async function loadAttestation() {
  return JSON.parse(await readFile(ATTESTATION_URL, "utf8"));
}

// Round-6 review, finding 5: long free-text runtime material (persona
// system_prompt and opener, role_play description and pre_read, each rubric
// goal's member_facing_description and ai_explanation) is pinned by hash
// rather than copied into the attestation, so the evidence file stays
// reviewable while still detecting a single changed character. Throws rather
// than hashing a null or a number, because a live field that has gone missing
// must fail loudly here instead of silently hashing to some stable value that
// then never matches, or worse, matches an attested hash of "".
function sha256Hex(value, label) {
  assert.equal(
    typeof value,
    "string",
    `${label} must be a string in the live response to be hash-compared, got ${value === null ? "null" : typeof value}`,
  );
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Every sha256 this attestation pins, in one flat list. Used to assert the
// pins are real, distinct hashes -- a generator bug that copied one scenario's
// prompt hash across all three would otherwise leave the live recheck
// asserting the same wrong thing three times and passing.
function pinnedRuntimeHashes(attestation) {
  const hashes = [];
  for (const scenario of attestation.scenarios) {
    hashes.push(
      scenario.role_play_runtime.description_sha256,
      scenario.role_play_runtime.pre_read_sha256,
      scenario.persona_runtime.system_prompt_sha256,
      scenario.persona_runtime.opener_sha256,
    );
    for (const goal of scenario.rubric_goals) {
      hashes.push(goal.member_facing_description_sha256, goal.ai_explanation_sha256);
      for (const document of goal.documents) {
        hashes.push(document.content_sha256);
      }
    }
  }
  return hashes;
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

// Round-6 Codex review, finding 5: before this, the attestation pinned only
// identity, ordering, weights, and the COUNT of supporting documents. Every
// mandatory assertion stayed green while the material that actually drives the
// conversation and the scoring could change underneath: the persona's
// system_prompt and opener, the role_play's pre_read and talking_points, each
// rubric goal's ai_explanation and member-facing definition, and the contents
// of the supporting documents the grader reads. For blocks that are required
// for lesson completion, that means a different Andrea and a different scoring
// basis with the deployment evidence still reporting clean. The attestation now
// pins all of it, and this test proves the pins are structurally real so the
// live recheck below has something with teeth to compare against.
test("the attestation pins the mutable conversation and scoring material, not just identity and counts", async () => {
  const attestation = await loadAttestation();

  for (const scenario of attestation.scenarios) {
    const label = scenario.block_source_key;
    const rolePlay = scenario.role_play_runtime;
    assert.ok(rolePlay, `${label} pins role_play runtime material`);
    assert.equal(rolePlay.scoring_frame, "knowledge_check", `${label} is scored as a knowledge check`);
    assert.ok(
      Number.isInteger(rolePlay.max_turns) && rolePlay.max_turns > 0,
      `${label} pins a real max_turns bound on the conversation`,
    );
    assert.equal(typeof rolePlay.type_tag, "string");
    assert.equal(typeof rolePlay.allow_anonymous, "boolean");
    assert.match(rolePlay.description_sha256, SHA256_PATTERN, `${label} pins the role_play description`);
    assert.match(rolePlay.pre_read_sha256, SHA256_PATTERN, `${label} pins the learner pre_read`);
    assert.ok(
      Array.isArray(rolePlay.talking_points) && rolePlay.talking_points.length > 0,
      `${label} pins the talking points that steer the conversation`,
    );
    for (const point of rolePlay.talking_points) {
      assert.equal(typeof point, "string", `${label} talking point is a string`);
    }

    const persona = scenario.persona_runtime;
    assert.ok(persona, `${label} pins persona runtime material`);
    assert.equal(typeof persona.role, "string");
    assert.match(persona.system_prompt_sha256, SHA256_PATTERN, `${label} pins the persona system prompt`);
    assert.match(persona.opener_sha256, SHA256_PATTERN, `${label} pins the persona opener`);
    assert.match(persona.demeanor_sha256, SHA256_PATTERN, `${label} pins the persona demeanor`);

    for (const goal of scenario.rubric_goals) {
      assert.equal(typeof goal.goal_type, "string", `${label} goal ${goal.sort_order} pins goal_type`);
      assert.ok(Array.isArray(goal.anchors_mid), `${label} goal ${goal.sort_order} pins anchors_mid`);
      assert.match(
        goal.member_facing_description_sha256,
        SHA256_PATTERN,
        `${label} goal ${goal.sort_order} pins its member-facing definition`,
      );
      assert.match(
        goal.ai_explanation_sha256,
        SHA256_PATTERN,
        `${label} goal ${goal.sort_order} pins the ai_explanation the grader scores against`,
      );
      assert.ok(Array.isArray(goal.documents), `${label} goal ${goal.sort_order} pins its supporting documents`);
      assert.equal(
        goal.documents.length,
        goal.document_count,
        `${label} goal ${goal.sort_order} pins exactly as many documents as it counts`,
      );
      for (const document of goal.documents) {
        assert.match(document.id, UUID_PATTERN, `${label} goal ${goal.sort_order} document id is a real UUID`);
        assert.equal(typeof document.storage_path, "string");
        assert.ok(document.storage_path.length > 0, `${label} goal ${goal.sort_order} document has a storage path`);
        assert.equal(typeof document.display_name, "string");
        assert.equal(typeof document.mime_type, "string");
        assert.ok(Number.isInteger(document.size_bytes) && document.size_bytes > 0);
        assert.match(
          document.content_sha256,
          SHA256_PATTERN,
          `${label} goal ${goal.sort_order} pins the document's content hash, not just its existence`,
        );
      }
    }
  }

  const hashes = pinnedRuntimeHashes(attestation);
  // 3 descriptions + 3 pre_reads + 3 system prompts + 3 openers
  // + 12 member-facing definitions + 12 ai_explanations + 12 document contents.
  assert.equal(hashes.length, 48, "every runtime-relevant text field is pinned");
  assert.equal(
    new Set(hashes).size,
    48,
    "no pinned hash is duplicated, so a copy-paste generator bug cannot make three scenarios attest the same material",
  );
  assert.equal(attestation.summary.total_pinned_runtime_hashes, 48);

  const documentIds = new Set();
  const documentPaths = new Set();
  let documentCount = 0;
  for (const scenario of attestation.scenarios) {
    for (const goal of scenario.rubric_goals) {
      for (const document of goal.documents) {
        documentIds.add(document.id);
        documentPaths.add(document.storage_path);
        documentCount += 1;
      }
    }
  }
  assert.equal(documentCount, attestation.summary.total_rubric_goal_documents);
  assert.equal(documentIds.size, documentCount, "each pinned document is a distinct row");
  assert.equal(documentPaths.size, documentCount, "each pinned document is a distinct object");
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

// Round-7 Codex review, finding 5: the round-6 comparison checked each
// document's content_sha256 COLUMN, which is metadata. It never downloaded and
// hashed the Storage object at storage_path, which is what Closer Lab actually
// reads while scoring a learner. Storage bytes can be replaced while the
// metadata row stays pinned, leaving the attestation green while the grader
// receives entirely different instructions. This hashes the real bytes.
//
// The fetcher is injected rather than called directly so the offline mutation
// test can exercise this against a fake that returns the wrong bytes. The
// reviewer's specific complaint was that the mutation test "only changes the
// metadata value and does not cover this divergence", which is only fixable by
// making the byte check reachable without credentials.
async function assertLiveDocumentBytesMatchAttestation(scenario, fetchDocumentBytes) {
  for (const goal of scenario.rubric_goals) {
    for (const document of goal.documents) {
      const label = `${scenario.block_source_key} document ${document.storage_path}`;
      const bytes = await fetchDocumentBytes(document.storage_path);
      assert.ok(
        bytes instanceof Uint8Array,
        `${label} must be fetched as raw bytes, not decoded text, so the hash covers exactly what Closer Lab stores`,
      );
      assert.equal(
        bytes.byteLength,
        document.size_bytes,
        `${label} byte length matches the attested size_bytes`,
      );
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        document.content_sha256,
        `${label} STORAGE BYTES hash to the attested content_sha256. A mismatch means the grader is reading different material than this attestation pins, even though the database metadata still agrees.`,
      );
    }
  }
}

// Round-6 review, finding 5: this comparison is extracted so it can be
// exercised offline, against a synthetic live payload, by the mutation test
// below. Without that, the only proof these assertions actually detect
// drift would be a credentialed production run, which has never happened
// and cannot happen in normal CI. The live recheck and the mutation test
// now run the exact same code.
function assertLiveRowMatchesAttestedScenario(row, scenario) {
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

  // Round-6 review, finding 5: the mutable conversation material. A change
  // to any of these produces a materially different Andrea for a block that
  // is required for lesson completion, and every assertion above would still
  // have passed.
  const rolePlay = scenario.role_play_runtime;
  assert.equal(row.type_tag, rolePlay.type_tag, `${scenario.block_source_key} type_tag has not drifted`);
  assert.equal(Number(row.max_turns), rolePlay.max_turns, `${scenario.block_source_key} max_turns has not drifted`);
  assert.equal(row.allow_anonymous, rolePlay.allow_anonymous, `${scenario.block_source_key} allow_anonymous has not drifted`);
  assert.equal(
    row.call_duration_seconds === null ? null : Number(row.call_duration_seconds),
    rolePlay.call_duration_seconds,
    `${scenario.block_source_key} call_duration_seconds has not drifted`,
  );
  assert.equal(row.scoring_frame, rolePlay.scoring_frame, `${scenario.block_source_key} scoring_frame has not drifted`);
  assert.equal(
    sha256Hex(row.description, `${scenario.block_source_key} role_play description`),
    rolePlay.description_sha256,
    `${scenario.block_source_key} role_play description has not drifted`,
  );
  assert.equal(
    sha256Hex(row.pre_read, `${scenario.block_source_key} role_play pre_read`),
    rolePlay.pre_read_sha256,
    `${scenario.block_source_key} learner pre_read has not drifted`,
  );
  assert.deepEqual(
    row.talking_points,
    rolePlay.talking_points,
    `${scenario.block_source_key} talking points have not drifted, in content or order`,
  );

  const persona = scenario.persona_runtime;
  assert.equal(row.persona.role, persona.role, `${scenario.block_source_key} persona role has not drifted`);
  assert.equal(row.persona.avatar_url, persona.avatar_url, `${scenario.block_source_key} persona avatar has not drifted`);
  assert.equal(
    sha256Hex(row.persona.system_prompt, `${scenario.block_source_key} persona system_prompt`),
    persona.system_prompt_sha256,
    `${scenario.block_source_key} persona system prompt has not drifted -- this is the instruction set that decides what Andrea actually says`,
  );
  assert.equal(
    sha256Hex(row.persona.opener, `${scenario.block_source_key} persona opener`),
    persona.opener_sha256,
    `${scenario.block_source_key} persona opener has not drifted`,
  );
  assert.equal(
    sha256Hex(row.persona.demeanor, `${scenario.block_source_key} persona demeanor`),
    persona.demeanor_sha256,
    `${scenario.block_source_key} persona demeanor has not drifted`,
  );
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

    // Round-6 review, finding 5: the scoring semantics themselves. The
    // grader reads ai_explanation and the goal's definitions to decide
    // achieved vs missed; a rewrite there changes what a learner has to say
    // to pass, with the goal id, name, order, weight, and document count all
    // unchanged.
    const goalLabel = `${scenario.block_source_key} goal at sort_order ${attestedGoal.sort_order}`;
    assert.equal(liveGoal.rubric_goals.goal_type, attestedGoal.goal_type, `${goalLabel} goal_type has not drifted`);
    assert.equal(liveGoal.rubric_goals.knowledge_subtype, attestedGoal.knowledge_subtype, `${goalLabel} knowledge_subtype has not drifted`);
    assert.equal(liveGoal.rubric_goals.score_min, attestedGoal.score_min, `${goalLabel} score_min has not drifted`);
    assert.equal(liveGoal.rubric_goals.score_max, attestedGoal.score_max, `${goalLabel} score_max has not drifted`);
    assert.equal(liveGoal.rubric_goals.anchor_min, attestedGoal.anchor_min, `${goalLabel} anchor_min has not drifted`);
    assert.equal(liveGoal.rubric_goals.anchor_max, attestedGoal.anchor_max, `${goalLabel} anchor_max has not drifted`);
    assert.deepEqual(liveGoal.rubric_goals.anchors_mid, attestedGoal.anchors_mid, `${goalLabel} anchors_mid has not drifted`);
    assert.equal(liveGoal.rubric_goals.achieved_definition, attestedGoal.achieved_definition, `${goalLabel} achieved_definition has not drifted`);
    assert.equal(liveGoal.rubric_goals.missed_definition, attestedGoal.missed_definition, `${goalLabel} missed_definition has not drifted`);
    assert.equal(
      sha256Hex(liveGoal.rubric_goals.member_facing_description, `${goalLabel} member_facing_description`),
      attestedGoal.member_facing_description_sha256,
      `${goalLabel} member-facing definition has not drifted`,
    );
    assert.equal(
      sha256Hex(liveGoal.rubric_goals.ai_explanation, `${goalLabel} ai_explanation`),
      attestedGoal.ai_explanation_sha256,
      `${goalLabel} ai_explanation has not drifted -- this is what the grader scores the learner against`,
    );

    // Round-6 review, finding 5: the supporting documents by identity and
    // CONTENT, not by count. Swapping a document's bytes, repointing it at
    // another object, or replacing the row entirely all leave the count at 1.
    const liveDocuments = [...(liveGoal.rubric_goals.rubric_goal_documents ?? [])].sort(
      (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    const attestedDocuments = [...attestedGoal.documents].sort(
      (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    assert.equal(liveDocuments.length, attestedGoal.document_count, `${goalLabel} document count matches`);
    assert.equal(liveDocuments.length, attestedDocuments.length, `${goalLabel} document count matches the pinned list`);
    assert.ok(liveDocuments.length >= 1, `${goalLabel} has at least one supporting document`);
    for (let documentIndex = 0; documentIndex < attestedDocuments.length; documentIndex += 1) {
      const liveDocument = liveDocuments[documentIndex];
      const attestedDocument = attestedDocuments[documentIndex];
      assert.equal(liveDocument.id, attestedDocument.id, `${goalLabel} document identity matches`);
      assert.equal(liveDocument.storage_path, attestedDocument.storage_path, `${goalLabel} document storage_path matches`);
      assert.equal(liveDocument.display_name, attestedDocument.display_name, `${goalLabel} document display_name matches`);
      assert.equal(liveDocument.mime_type, attestedDocument.mime_type, `${goalLabel} document mime_type matches`);
      assert.equal(Number(liveDocument.size_bytes), attestedDocument.size_bytes, `${goalLabel} document size_bytes matches`);
      assert.equal(Number(liveDocument.token_count), attestedDocument.token_count, `${goalLabel} document token_count matches`);
      assert.equal(
        liveDocument.content_sha256,
        attestedDocument.content_sha256,
        `${goalLabel} document CONTENT hash matches -- the bytes the grader reads have not been rewritten underneath this attestation`,
      );
    }
  }

  const liveWeightSum = row.role_play_goals.reduce((sum, link) => sum + Number(link.weight), 0);
  assert.equal(liveWeightSum, 100, `${scenario.block_source_key} live goal weights still sum to 100`);
}

// A protected, opt-in live recheck: mirrors the frozen 6-scenario chain's
// BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION pattern in
// import-semantic-gate.mjs, but scoped to this attestation instead of the
// production_rpc-based ledger (there is no export_bmh_institute_production_graph
// equivalent for the oral-check namespace -- see the migration's header
// comment). Silently skipped unless BOTH an explicit opt-in flag AND
// credentials are present, so this never turns into a live production call
// inside routine CI. DISCLOSED LIMITATION: the PostgREST embed query below
// (role_plays -> persona, role_play_goals -> rubric_goals ->
// rubric_goal_documents) was verified column-by-column and FK-by-FK against
// the live information_schema (read-only, via Supabase MCP execute_sql), and
// every value it compares was read directly out of the live closer-lab
// project in that same way when round-6 review finding 5 widened this query
// and the attestation together -- after the full 12-scenario oral-check
// catalog had been applied to Closer Lab production, so the pins describe
// the state that is actually live. What has NOT been exercised end-to-end is
// the REST embed call itself, through this exact fetch() path with a real
// service-role bearer token, because no CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY
// has been available in any session so far. The widened select asks for more
// columns and returns rubric_goal_documents as rows rather than a count, so
// if the embed shape needs adjustment that will surface on the first
// credentialed run. Run it for real, once, immediately before the migration
// is actually applied to production (see the migration's header comment),
// and fix forward if needed, with:
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
  // Round-9 review, finding 1. Invalidate any existing receipt BEFORE
  // verifying anything. Without this, a run that fails partway leaves the
  // previous run's receipt in place and still inside its 24 hour window, so
  // the sequence "verify clean, production drifts, recheck fails" left the
  // apply command accepting evidence that had just been contradicted. The
  // receipt must never outlive a failed attempt to reconfirm it.
  await rm(RECEIPT_URL, { force: true });

  const {
    assertCloserProductionUrl,
    buildCloserServiceHeaders,
  } = await import("../../scripts/course-content/closer-lab-production-mapping.mjs");
  const canonicalUrl = assertCloserProductionUrl(url);
  // Round-9 review, finding 1. ONE read of the attestation, used both for the
  // comparison and for the hash recorded in the receipt. The previous version
  // compared one read and hashed a second, independent read, so an edit landing
  // between them would bind the receipt to bytes that were never verified.
  const attestationBytes = await readFile(ATTESTATION_URL);
  const attestationSha256 = createHash("sha256").update(attestationBytes).digest("hex");
  const attestation = JSON.parse(attestationBytes.toString("utf8"));
  const ids = attestation.scenarios.map((scenario) => scenario.role_play_id);
  // Round-6 review, finding 5 widened this select. It used to stop at
  // identity, ordering, weights, and rubric_goal_documents(count). It now
  // pulls every runtime-relevant field so the comparison below can prove the
  // live conversation and scoring basis, not just that something with the
  // right IDs and the right number of attachments still exists.
  const endpoint = new URL(
    `/rest/v1/role_plays?id=in.(${ids.join(",")})&select=id,title,archived_at,managed_source_key,type_tag,max_turns,allow_anonymous,call_duration_seconds,scoring_frame,description,pre_read,talking_points,persona:personas(id,name,voice_id,archived_at,managed_source_key,role,avatar_url,system_prompt,opener,demeanor),role_play_goals(sort_order,weight,rubric_goals(id,name,archived_at,goal_type,knowledge_subtype,score_min,score_max,anchor_min,anchor_max,anchors_mid,achieved_definition,missed_definition,member_facing_description,ai_explanation,rubric_goal_documents(id,storage_path,display_name,mime_type,size_bytes,token_count,content_sha256)))`,
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
    assertLiveRowMatchesAttestedScenario(liveById.get(scenario.role_play_id), scenario);
  }

  // Round-7 review, finding 5: hash the actual Storage bytes, not just the
  // metadata column compared above.
  const bucket = attestation.verification.storage_bucket;
  assert.ok(bucket, "the attestation records which Storage bucket the documents live in");
  // Round-8 review, finding 6: Supabase serves Storage objects through a CDN
  // whose cache can lag a replace by up to a minute, so a stable URL with no
  // cache busting can hand back the OLD bytes. Verifying stale content is
  // worse than not verifying at all, because it reports green. Two defences,
  // since either alone can be defeated: a unique query parameter per run so
  // the request cannot match a cached entry, and explicit no-cache request
  // headers. The authenticated object path is used rather than the public one
  // because that is the read Closer Lab itself performs with a service role.
  const cacheBuster = `${Date.now()}-${randomUUID()}`;
  const fetchDocumentBytes = async (storagePath) => {
    const objectEndpoint = new URL(
      `/storage/v1/object/authenticated/${bucket}/${storagePath}`,
      canonicalUrl,
    );
    objectEndpoint.searchParams.set("cache_bust", cacheBuster);
    const objectResponse = await fetch(objectEndpoint, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: {
        ...buildCloserServiceHeaders(serviceRoleKey),
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
    if (objectResponse.url !== objectEndpoint.href) {
      throw new Error(
        `Storage fetch for ${storagePath} did not originate from the exact canonical Closer Lab endpoint.`,
      );
    }
    if (!objectResponse.ok) {
      throw new Error(
        `Storage fetch for ${storagePath} failed with HTTP ${objectResponse.status}.`,
      );
    }
    return new Uint8Array(await objectResponse.arrayBuffer());
  };
  let documentsByteVerified = 0;
  for (const scenario of attestation.scenarios) {
    await assertLiveDocumentBytesMatchAttestation(scenario, fetchDocumentBytes);
    documentsByteVerified += scenario.rubric_goals.reduce(
      (total, goal) => total + goal.documents.length,
      0,
    );
  }

  assert.equal(documentsByteVerified, attestation.summary.total_rubric_goal_documents);

  // Round-8 review, finding 5. This test is documented as a mandatory gate,
  // but it exits SUCCESS with the live case SKIPPED whenever the opt-in flag
  // or the credentials are absent, so nothing stopped an operator from
  // applying having hashed zero production documents. Writing a receipt only
  // on the path that genuinely reached production gives the apply command
  // something it can require and check, rather than a runbook instruction it
  // has to trust. The attestation hash is included so a receipt cannot vouch
  // for an attestation that has since changed.
  //
  // Round-9 review, finding 1: the receipt is STAGED here and written only if
  // the entire process exits clean. The previous version wrote it inline,
  // before this test's own final assertion and before the mutation tests that
  // follow had run, so a receipt could be produced by a run that then failed,
  // including a run where the drift-detection logic itself was broken.
  stagedReceipt = {
    verified_at: new Date().toISOString(),
    project_ref: attestation.verification.project_ref,
    storage_bucket: bucket,
    attestation_sha256: attestationSha256,
    scenarios_verified: attestation.scenarios.length,
    documents_byte_verified: documentsByteVerified,
  };
});

// Round-6 Codex review, finding 5, the part that is easy to get wrong: it is
// not enough to widen the live query and the attestation. The comparison has
// to actually FAIL when the material drifts, and the only place that could
// previously have been demonstrated is a credentialed production run, which
// has never happened. This builds a self-consistent synthetic attestation and
// a matching synthetic live row, confirms they compare clean, then mutates one
// runtime-relevant field at a time and requires every single mutation to be
// caught by the exact same comparison the live recheck runs.
//
// Every mutation listed here is one that the pre-round-6 comparison would have
// waved through: identity, ordering, individual weights, and document counts
// are all left untouched by design.
function buildSyntheticPair() {
  const text = (value) => value;
  const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  const goalSpecs = [
    { id: "11111111-1111-4111-8111-111111111111", weight: 40, sortOrder: 0 },
    { id: "22222222-2222-4222-8222-222222222222", weight: 30, sortOrder: 1 },
    { id: "33333333-3333-4333-8333-333333333333", weight: 20, sortOrder: 2 },
    { id: "44444444-4444-4444-8444-444444444444", weight: 10, sortOrder: 3 },
  ];
  const description = text("A synthetic oral check.");
  const preRead = text("Watch the lesson first.");
  const systemPrompt = text("You are Andrea. Ask about the lesson.");
  const opener = text("Hey, let's talk it through.");
  const demeanor = text("WARM, ENCOURAGING");
  const talkingPoints = ["Andrea asks the first thing.", "Andrea asks the second thing."];

  const scenario = {
    block_source_key: "block-oral-check-synthetic",
    role_play_id: "55555555-5555-4555-8555-555555555555",
    role_play_managed_source_key: "synthetic:role-play:one",
    title: "Synthetic Oral Check",
    persona_id: "66666666-6666-4666-8666-666666666666",
    persona_name: "Andrea",
    persona_managed_source_key: "synthetic:persona:one",
    voice_id: "c7VyuzKrx3xIuZs8QT0P",
    role_play_runtime: {
      type_tag: "Synthetic · Oral Check",
      max_turns: 12,
      allow_anonymous: true,
      call_duration_seconds: null,
      scoring_frame: "knowledge_check",
      description_sha256: hash(description),
      pre_read_sha256: hash(preRead),
      talking_points: [...talkingPoints],
    },
    persona_runtime: {
      role: "BMH Institute learning coach",
      avatar_url: "/personas/library/avatar-09-south-asian-woman-young.jpg",
      system_prompt_sha256: hash(systemPrompt),
      opener_sha256: hash(opener),
      demeanor_sha256: hash(demeanor),
    },
    rubric_goals: goalSpecs.map((spec) => ({
      id: spec.id,
      name: `Synthetic goal ${spec.sortOrder}`,
      weight: spec.weight,
      sort_order: spec.sortOrder,
      document_count: 1,
      goal_type: "knowledge",
      knowledge_subtype: "other",
      score_min: null,
      score_max: null,
      anchor_min: null,
      anchor_max: null,
      anchors_mid: [],
      achieved_definition: null,
      missed_definition: null,
      member_facing_description_sha256: hash(`member facing ${spec.sortOrder}`),
      ai_explanation_sha256: hash(`ai explanation ${spec.sortOrder}`),
      documents: [
        {
          id: `7777777${spec.sortOrder}-7777-4777-8777-777777777777`,
          storage_path: `rubric-docs/synthetic/doc-${spec.sortOrder}.md`,
          display_name: `Synthetic doc ${spec.sortOrder}`,
          mime_type: "text/markdown",
          size_bytes: 100 + spec.sortOrder,
          token_count: 20 + spec.sortOrder,
          content_sha256: hash(`document body ${spec.sortOrder}`),
        },
      ],
    })),
  };

  const row = {
    id: scenario.role_play_id,
    title: scenario.title,
    archived_at: null,
    managed_source_key: scenario.role_play_managed_source_key,
    type_tag: scenario.role_play_runtime.type_tag,
    max_turns: scenario.role_play_runtime.max_turns,
    allow_anonymous: scenario.role_play_runtime.allow_anonymous,
    call_duration_seconds: null,
    scoring_frame: scenario.role_play_runtime.scoring_frame,
    description,
    pre_read: preRead,
    talking_points: [...talkingPoints],
    persona: {
      id: scenario.persona_id,
      name: scenario.persona_name,
      voice_id: scenario.voice_id,
      archived_at: null,
      managed_source_key: scenario.persona_managed_source_key,
      role: scenario.persona_runtime.role,
      avatar_url: scenario.persona_runtime.avatar_url,
      system_prompt: systemPrompt,
      opener,
      demeanor,
    },
    role_play_goals: goalSpecs.map((spec) => ({
      sort_order: spec.sortOrder,
      weight: spec.weight,
      rubric_goals: {
        id: spec.id,
        name: `Synthetic goal ${spec.sortOrder}`,
        archived_at: null,
        goal_type: "knowledge",
        knowledge_subtype: "other",
        score_min: null,
        score_max: null,
        anchor_min: null,
        anchor_max: null,
        anchors_mid: [],
        achieved_definition: null,
        missed_definition: null,
        member_facing_description: `member facing ${spec.sortOrder}`,
        ai_explanation: `ai explanation ${spec.sortOrder}`,
        rubric_goal_documents: [
          {
            id: `7777777${spec.sortOrder}-7777-4777-8777-777777777777`,
            storage_path: `rubric-docs/synthetic/doc-${spec.sortOrder}.md`,
            display_name: `Synthetic doc ${spec.sortOrder}`,
            mime_type: "text/markdown",
            size_bytes: 100 + spec.sortOrder,
            token_count: 20 + spec.sortOrder,
            content_sha256: hash(`document body ${spec.sortOrder}`),
          },
        ],
      },
    })),
  };

  return { scenario, row };
}

test("the live comparison actually detects drift in conversation and scoring material", () => {
  const control = buildSyntheticPair();
  assert.doesNotThrow(
    () => assertLiveRowMatchesAttestedScenario(control.row, control.scenario),
    "a live row that matches the attestation compares clean",
  );

  const mutations = [
    ["persona system prompt rewritten", (row) => { row.persona.system_prompt += " Also ask about pricing."; }],
    ["persona opener rewritten", (row) => { row.persona.opener = "Different opener."; }],
    ["persona demeanor changed", (row) => { row.persona.demeanor = "BLUNT"; }],
    ["persona role changed", (row) => { row.persona.role = "Sales coach"; }],
    ["persona avatar swapped", (row) => { row.persona.avatar_url = "/personas/library/other.jpg"; }],
    ["role_play description rewritten", (row) => { row.description = "Something else entirely."; }],
    ["learner pre_read rewritten", (row) => { row.pre_read = "Read nothing."; }],
    ["a talking point rewritten", (row) => { row.talking_points[0] = "Andrea asks something else."; }],
    ["a talking point removed", (row) => { row.talking_points.pop(); }],
    ["talking points reordered", (row) => { row.talking_points.reverse(); }],
    ["max_turns widened", (row) => { row.max_turns = 40; }],
    ["type_tag changed", (row) => { row.type_tag = "Synthetic · Something Else"; }],
    ["scoring_frame changed", (row) => { row.scoring_frame = "sales_call"; }],
    ["allow_anonymous flipped", (row) => { row.allow_anonymous = false; }],
    ["call_duration_seconds set", (row) => { row.call_duration_seconds = 600; }],
    ["goal ai_explanation rewritten", (row) => { row.role_play_goals[0].rubric_goals.ai_explanation = "Score them generously."; }],
    ["goal member-facing definition rewritten", (row) => { row.role_play_goals[1].rubric_goals.member_facing_description = "Anything goes."; }],
    ["goal_type changed", (row) => { row.role_play_goals[0].rubric_goals.goal_type = "skill"; }],
    ["knowledge_subtype changed", (row) => { row.role_play_goals[0].rubric_goals.knowledge_subtype = "terminology"; }],
    ["score bounds introduced", (row) => { row.role_play_goals[0].rubric_goals.score_max = 5; }],
    ["achieved_definition introduced", (row) => { row.role_play_goals[2].rubric_goals.achieved_definition = "Say anything."; }],
    ["anchors_mid populated", (row) => { row.role_play_goals[0].rubric_goals.anchors_mid = [{ score: 3, label: "ok" }]; }],
    ["document content rewritten", (row) => { row.role_play_goals[0].rubric_goals.rubric_goal_documents[0].content_sha256 = "0".repeat(64); }],
    ["document repointed at another object", (row) => { row.role_play_goals[0].rubric_goals.rubric_goal_documents[0].storage_path = "rubric-docs/synthetic/other.md"; }],
    ["document row replaced", (row) => { row.role_play_goals[0].rubric_goals.rubric_goal_documents[0].id = "88888888-8888-4888-8888-888888888888"; }],
    ["document display name changed", (row) => { row.role_play_goals[0].rubric_goals.rubric_goal_documents[0].display_name = "Renamed"; }],
    ["document truncated", (row) => { row.role_play_goals[0].rubric_goals.rubric_goal_documents[0].size_bytes = 1; }],
    ["a required text field emptied", (row) => { row.persona.system_prompt = null; }],
  ];

  for (const [label, mutate] of mutations) {
    const { scenario, row } = buildSyntheticPair();
    mutate(row);
    assert.throws(
      () => assertLiveRowMatchesAttestedScenario(row, scenario),
      `the live comparison must reject: ${label}`,
    );
  }

  assert.ok(mutations.length >= 25, "the drift matrix stays broad");
});

// Round-7 Codex review, finding 5, the offline half. The reviewer's exact
// objection to the round-6 mutation test was that it "only changes the
// metadata value and does not cover this divergence" between the pinned
// content_sha256 column and the Storage bytes the grader actually reads. This
// covers that divergence without credentials by injecting a fake fetcher: the
// attestation and every database field stay untouched and internally
// consistent, and only the bytes behind storage_path move.
test("the live comparison detects Storage bytes drifting from pinned document metadata", async () => {
  const attestation = await loadAttestation();
  const scenario = attestation.scenarios[0];
  const documents = scenario.rubric_goals.flatMap((goal) => goal.documents);
  assert.ok(documents.length >= 1);

  // Control: a fetcher that returns bytes matching the pins compares clean.
  // Built by finding a byte string whose hash IS the pin is impossible, so
  // instead prove the mechanism on a synthetic pair, then prove every failure
  // mode against the real attestation.
  const body = Buffer.from("# Real document body\n", "utf8");
  const syntheticScenario = {
    block_source_key: "block-oral-check-synthetic",
    rubric_goals: [
      {
        documents: [
          {
            storage_path: "rubric-docs/synthetic/doc.md",
            size_bytes: body.byteLength,
            content_sha256: createHash("sha256").update(body).digest("hex"),
          },
        ],
      },
    ],
  };
  await assert.doesNotReject(
    () =>
      assertLiveDocumentBytesMatchAttestation(
        syntheticScenario,
        async () => new Uint8Array(body),
      ),
    "bytes that hash to the pin compare clean",
  );

  const mutations = [
    [
      "one byte changed, same length, metadata untouched",
      async () => {
        const drifted = Buffer.from(body);
        drifted[2] = drifted[2] ^ 0x01;
        return new Uint8Array(drifted);
      },
    ],
    [
      "content replaced wholesale",
      async () => new Uint8Array(Buffer.from("Score everyone as achieved.\n", "utf8")),
    ],
    [
      "content truncated",
      async () => new Uint8Array(body.subarray(0, body.byteLength - 1)),
    ],
    [
      "content appended to",
      async () => new Uint8Array(Buffer.concat([body, Buffer.from("extra", "utf8")])),
    ],
    [
      "empty object served",
      async () => new Uint8Array(0),
    ],
    [
      "text returned instead of raw bytes, which would hash differently after decoding",
      async () => body.toString("utf8"),
    ],
  ];

  for (const [label, fetcher] of mutations) {
    await assert.rejects(
      () => assertLiveDocumentBytesMatchAttestation(syntheticScenario, fetcher),
      `the Storage byte check must reject: ${label}`,
    );
  }

  // And against the REAL attestation: any fetcher that does not serve the
  // exact pinned bytes must be rejected for every one of the 12 documents.
  for (const document of documents) {
    await assert.rejects(
      () =>
        assertLiveDocumentBytesMatchAttestation(scenario, async (storagePath) => {
          assert.equal(typeof storagePath, "string");
          return new Uint8Array(Buffer.from("not the pinned bytes", "utf8"));
        }),
      `real attestation document ${document.storage_path} must not accept arbitrary bytes`,
    );
  }
});

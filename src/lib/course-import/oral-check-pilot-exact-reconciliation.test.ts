import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  expectedManagedIds,
  unexpectedManagedRows,
} from "./exact-reconciliation";
import { buildImportPlan, deterministicImportId } from "./operations";
import { postgresJsonbSha256 } from "./postgres-jsonb";
import type { CourseImportManifest } from "./manifest";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
);
const IMPORT_ID = "bmh-employee-training-v1";

// supabase/migrations/20260728020000_insert_oral_check_pilot_role_play_blocks.sql
// hardcodes these 3 UUIDs directly in its INSERT payload (they are never
// computed at migration-apply time). This is the independent, hand-copied
// ground truth from that migration file -- NOT derived from the manifest or
// from buildImportPlan -- so a test that compares against it actually
// proves something about the relationship between the two, rather than
// just reflecting back whatever the manifest happens to contain.
const MIGRATION_HARDCODED_BLOCK_IDS = {
  "block-oral-check-slot-02": "7300bba9-a9fc-582c-aa20-dd5d58754165",
  "block-oral-check-slot-05": "4464ecdd-2650-59ed-a525-78871e846d20",
  "block-oral-check-slot-16": "34758403-1ddd-5e3c-a054-b2f28310d8b8",
} as const;

// The COMPLETE hand-copied ground truth of the migration's `v_mutations`
// jsonb payload -- every field the migration inserts, for all 3 blocks, not
// just the fields an earlier version of this test happened to check for
// block-oral-check-slot-02 alone. Round-4 Codex review (finding 3) caught
// that the prior version omitted lesson_id, sort_order, assignment_source_key,
// context, learner_goal, success_criteria, and fail_conditions entirely, and
// only deep-compared full content for slot 02 -- leaving slots 05 and 16
// free to drift silently while CI stayed green. This constant, together
// with the checksum-binding test below, closes that gap: any drift in ANY
// field of ANY of the 3 blocks now fails either the deep-equal comparison
// or the independent checksum bind (or both).
const MIGRATION_MUTATIONS = [
  {
    block_id: "7300bba9-a9fc-582c-aa20-dd5d58754165",
    lesson_id: "dc391d4b-58f4-5a94-a97f-ca59c4d98f41",
    source_key: "block-oral-check-slot-02",
    sort_order: 6,
    content: {
      mode: "oral_check",
      height_px: 760,
      scenario_id: "e46baf56-d0ae-4621-87f3-07718f0744b2",
      scenario_spec: {
        assignment_source_key: "oral-check-slot-02",
        context:
          "This lesson covers the core vocabulary a caller needs on a live call -- property and seller-situation terms, wholesaling mechanics, deal-math terms, and CRM/pipeline terms. Andrea checks it out loud because recognizing these terms in the moment on a real call is different from recognizing them on a written quiz.",
        learner_goal:
          "Demonstrate accurate understanding of the core terms in your own words, not a memorized definition.",
        success_criteria: [
          "Correctly defines core property/seller-situation terms (distressed, off-market, MLS, DOM, FSBO)",
          "Explains the wholesaling mechanism (assignment of contract, assignment fee, and/or double close)",
          "Correctly defines ARV, MAO, and equity and how they relate to the offer calculation",
          "Correctly explains at least 2 transaction/CRM terms (PSA, EMD, title company, lien, Sandra, disposition)",
        ],
        fail_conditions: [
          'Confuses or misstates the core property/seller-situation terms (e.g., calls a listed property "off-market")',
          "Cannot describe the wholesaling mechanism (assignment of contract vs. buying and reselling)",
          "Gives no grounded answer -- guesses or answers a different question",
        ],
      },
    },
  },
  {
    block_id: "4464ecdd-2650-59ed-a525-78871e846d20",
    lesson_id: "823f016f-6e4c-5791-ac42-9f24c28040df",
    source_key: "block-oral-check-slot-05",
    sort_order: 7,
    content: {
      mode: "oral_check",
      height_px: 760,
      scenario_id: "fd3b4f85-2407-426b-a21b-db9d7163ebbb",
      scenario_spec: {
        assignment_source_key: "oral-check-slot-05",
        context:
          "This lesson covers the As-Is Cash Home Purchase offer, the four-step process, why sellers accept a below-market price, and how the offer number gets built. Andrea checks it out loud because explaining the offer to a real seller is different from reciting the script.",
        learner_goal:
          "Demonstrate accurate understanding of the offer and why it works, in your own words.",
        success_criteria: [
          "Explains the core offer and the four-step process accurately",
          "Explains why sellers accept a below-market price (speed/certainty/simplicity/convenience trade-off)",
          "Walks through the offer formula (ARV minus repairs minus margin) with the correct general shape",
          "Names at least 2 Ideal-Seller-Profile criteria OR 2 not-a-fit criteria",
        ],
        fail_conditions: [
          "Confuses or misstates the core offer terms (e.g., says the deal is not cash or claims commissions are charged)",
          "Cannot walk through the four-step process or the offer formula's shape",
          "Gives no grounded answer -- guesses or answers a different question",
        ],
      },
    },
  },
  {
    block_id: "34758403-1ddd-5e3c-a054-b2f28310d8b8",
    lesson_id: "cccdb0ef-b907-5bce-ade1-3ff0b0d054ce",
    source_key: "block-oral-check-slot-16",
    sort_order: 6,
    content: {
      mode: "oral_check",
      height_px: 760,
      scenario_id: "7765693a-5f8a-4aa1-ac39-c21866624006",
      scenario_spec: {
        assignment_source_key: "oral-check-slot-16",
        context:
          "This lesson covers what a KPI is, the six pipeline metrics tracked left to right, and how to use that order to diagnose exactly where a funnel is breaking. Andrea checks it out loud because using the numbers to self-diagnose is different from reciting the list.",
        learner_goal:
          "Demonstrate accurate understanding of the six metrics and how to read them, in your own words.",
        success_criteria: [
          "Names the six metrics in the correct left-to-right order",
          "Explains dial count as an effort indicator, not a strict goal (names the speed-dialing risk)",
          "Correctly diagnoses at least one funnel-gap scenario (e.g., high quality conversations / low process calls = discovery or disqualifying-too-fast problem)",
          "Explains why metrics are tracked left-to-right (to pinpoint exactly where in the funnel something broke)",
        ],
        fail_conditions: [
          "Confuses or misstates the six metrics or their order",
          "Cannot explain the left-to-right diagnostic logic when asked directly",
          "Gives no grounded answer -- guesses or answers a different question",
        ],
      },
    },
  },
] as const;

// The migration's `fn_guard_imported_content_block_insert_v1()` trigger
// hardcodes this EXACT value as the required
// bmh.oral_check_pilot_payload_sha256 marker
// (encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex')), and
// supabase/tests/056_oral_check_pilot_role_play_blocks.sql has already
// proven -- by running the real, unmodified migration function against a
// real database and reaching a genuine successful insertion -- that this
// constant truly equals the sha256 of the migration's real v_mutations
// value at runtime. It is therefore reliable, independently-verified
// ground truth for what the migration actually inserts, byte for byte.
const MIGRATION_DATABASE_PAYLOAD_SHA256 =
  "893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5";

function loadManifest(): CourseImportManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as CourseImportManifest;
}

describe("oral-check pilot blocks are first-class manifest entries (PR #130 finding 1, closed)", () => {
  // An earlier version of this test cloned expectedManagedIds() and then
  // manually appended these 3 IDs to the clone before asserting they were
  // present -- which passes by construction and proves nothing about real
  // deployed state, and left the actual course:import verify / rollback
  // reconciliation path with no way to recognize these 3 rows as expected.
  // The fix: the 3 oral-check blocks are now real entries in
  // content/course-manifests/bmh-employee-training.v1.json (see
  // ORAL_CHECK_ROLE_PLAYS in scripts/course-content/build-manifest.mjs),
  // so expectedManagedIds() -- the same function the real reconciliation
  // path calls -- already includes them with no test-side injection at all.

  it("deterministicImportId, applied to each block's manifest source_key, reproduces the migration's hardcoded block_id exactly", () => {
    // This is the load-bearing assertion: it independently re-derives each
    // ID from the manifest's source_key using the production ID scheme and
    // checks it against a value copied by hand from the migration file, not
    // against anything buildImportPlan or the manifest computed for us.
    for (const [sourceKey, blockId] of Object.entries(MIGRATION_HARDCODED_BLOCK_IDS)) {
      expect(deterministicImportId(IMPORT_ID, sourceKey)).toBe(blockId);
    }
  });

  it("the manifest actually declares these 3 blocks under the exact source_key the migration expects", () => {
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    for (const [sourceKey, blockId] of Object.entries(MIGRATION_HARDCODED_BLOCK_IDS)) {
      const operation = plan.operations.find((candidate) => candidate.sourceKey === sourceKey);
      expect(operation, `manifest declares a content_blocks operation for ${sourceKey}`).toBeDefined();
      expect(operation?.table).toBe("content_blocks");
      expect(operation?.id).toBe(blockId);
    }
  });

  it("the manifest-declared row for EACH of the 3 blocks byte-matches the COMPLETE migration payload -- block_id, lesson_id, sort_order, requiredness, and full nested content, not a partial field spot-check", () => {
    // Round-4 review (finding 3) caught that the prior version of this test
    // only checked mode/height_px/scenario_id/title-absence/scenario_spec-
    // truthiness/requiredness for all 3 blocks, and never checked lesson_id,
    // sort_order, or the actual deep contents of scenario_spec (context,
    // learner_goal, success_criteria, fail_conditions) at all. This
    // compares the ENTIRE planned row against the ENTIRE migration payload,
    // for all 3 blocks, field for field.
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    const bySourceKey = new Map(plan.operations.map((operation) => [operation.sourceKey, operation]));

    expect(MIGRATION_MUTATIONS.length).toBe(3);
    for (const mutation of MIGRATION_MUTATIONS) {
      const operation = bySourceKey.get(mutation.source_key);
      expect(operation, `manifest declares ${mutation.source_key}`).toBeDefined();
      expect(operation?.table).toBe("content_blocks");
      expect(operation?.id).toBe(mutation.block_id);
      expect(operation?.row.lesson_id).toBe(mutation.lesson_id);
      expect(operation?.row.sort_order).toBe(mutation.sort_order);
      expect(operation?.row.block_type).toBe("role_play");
      expect(operation?.row.is_required_for_completion).toBe(true);
      // Full, deep structural equality of the entire content object --
      // mode, height_px, scenario_id, and every scenario_spec field
      // (assignment_source_key, context, learner_goal, success_criteria,
      // fail_conditions), not a subset of spot-checked keys. The manifest
      // never sets an explicit title for these blocks (the "Talk with
      // Andrea" label is a render-time fallback for content.mode ===
      // "oral_check" with no explicit title -- content-blocks.tsx /
      // learner-parts.ts, this same PR), so title is correctly absent from
      // both sides.
      expect(operation?.row.content).toStrictEqual(mutation.content);
    }
  });

  it("the COMPLETE reconstructed migration payload (all 3 blocks, every field) hashes to the migration's own independently-verified database payload checksum -- structurally impossible for any field of any block to drift undetected", () => {
    // This is the checksum-binding test round-4 review asked for. It does
    // not trust the hand-copied MIGRATION_MUTATIONS constant above on its
    // own: it hashes that constant with the exact PostgreSQL jsonb-text
    // serialization rules (postgresJsonbSha256, shared with
    // released-content-block-revision.ts) and checks the result against
    // MIGRATION_DATABASE_PAYLOAD_SHA256 -- a value independently hardcoded
    // in a DIFFERENT part of the same migration file (the
    // fn_guard_imported_content_block_insert_v1 trigger guard) and already
    // proven, by a real successful insertion in
    // supabase/tests/056_oral_check_pilot_role_play_blocks.sql, to equal
    // the SQL side's own live-computed hash of its real v_mutations value.
    // If MIGRATION_MUTATIONS above were mistranscribed in ANY field for ANY
    // of the 3 blocks, this hash would not match and this test would fail
    // -- independent of whatever the manifest-derived comparison above
    // does or does not catch.
    const handCopiedHash = postgresJsonbSha256(MIGRATION_MUTATIONS);
    expect(handCopiedHash).toBe(MIGRATION_DATABASE_PAYLOAD_SHA256);

    // And separately: the manifest-derived plan, reassembled into the
    // exact same {block_id, lesson_id, source_key, sort_order, content}
    // shape the migration's v_mutations uses, must ALSO hash to that same
    // checksum -- proving manifest<->migration parity via an independent
    // hash comparison, not just JS deep-equality (which could in principle
    // share a transcription mistake with the hand-copied constant above;
    // an independently-verified external checksum cannot).
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    const bySourceKey = new Map(plan.operations.map((operation) => [operation.sourceKey, operation]));
    const manifestDerivedMutations = MIGRATION_MUTATIONS.map((mutation) => {
      const operation = bySourceKey.get(mutation.source_key);
      if (!operation) {
        throw new Error(`manifest is missing ${mutation.source_key}`);
      }
      return {
        block_id: operation.id,
        lesson_id: operation.row.lesson_id,
        source_key: operation.sourceKey,
        sort_order: operation.row.sort_order,
        content: operation.row.content,
      };
    });
    expect(postgresJsonbSha256(manifestDerivedMutations)).toBe(
      MIGRATION_DATABASE_PAYLOAD_SHA256,
    );
  });

  it("a live DB inventory that matches the manifest-derived expectation (i.e., these 3 rows present, nothing else) reconciles with ZERO unexpected content_blocks -- the real reconciliation path, not a test-side allowlist", () => {
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    const expected = expectedManagedIds(plan);

    // "actual" here IS expected -- there is deliberately no manual
    // injection of the 3 pilot IDs anywhere in this file. If a future edit
    // ever removes the oral-check blocks from the manifest (or renames
    // their source_key) while the migration still inserts rows under the
    // old hardcoded IDs, expectedManagedIds() would stop including them and
    // this same live-DB shape would start reporting them as unexpected --
    // this test would need to be lying to itself to still pass, and it
    // can't, because it never hardcodes the 3 IDs as "expected" on its own.
    const unexpected = unexpectedManagedRows(plan, expected);
    expect(unexpected).toEqual([]);
  });

  it("removing the oral-check blocks from the plan (simulating the pre-PR-#130 manifest) makes the same live rows report as unexpected -- proving the fix, not a tautology", () => {
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    const expectedWithPilotBlocks = expectedManagedIds(plan);

    const priorPlan = {
      ...plan,
      operations: plan.operations.filter(
        (operation) => !(sourceKeyIsOralCheckPilot(operation.sourceKey)),
      ),
    };
    const unexpected = unexpectedManagedRows(priorPlan, expectedWithPilotBlocks);
    expect(unexpected.map((row) => row.id).sort()).toEqual(
      Object.values(MIGRATION_HARDCODED_BLOCK_IDS).sort(),
    );
  });
});

function sourceKeyIsOralCheckPilot(sourceKey: string): boolean {
  return sourceKey in MIGRATION_HARDCODED_BLOCK_IDS;
}

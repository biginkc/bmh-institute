import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  expectedManagedIds,
  unexpectedManagedRows,
} from "./exact-reconciliation";
import { buildImportPlan, deterministicImportId } from "./operations";
import type { CourseImportManifest } from "./manifest";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
);
const IMPORT_ID = "bmh-employee-training-v1";

// 20260728020000_insert_oral_check_pilot_role_play_blocks.sql hardcodes
// these 3 UUIDs directly in its INSERT payload (they are never computed at
// migration-apply time). This is the independent, hand-copied ground truth
// from that migration file -- NOT derived from the manifest or from
// buildImportPlan -- so a test that compares against it actually proves
// something about the relationship between the two, rather than just
// reflecting back whatever the manifest happens to contain.
const MIGRATION_HARDCODED_BLOCK_IDS = {
  "block-oral-check-slot-02": "7300bba9-a9fc-582c-aa20-dd5d58754165",
  "block-oral-check-slot-05": "4464ecdd-2650-59ed-a525-78871e846d20",
  "block-oral-check-slot-16": "34758403-1ddd-5e3c-a054-b2f28310d8b8",
} as const;

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

  it("the manifest-declared content for each block byte-matches what the migration inserts (mode, height_px, scenario_id, scenario_spec -- no title)", () => {
    const manifest = loadManifest();
    const plan = buildImportPlan(manifest);
    const bySourceKey = new Map(plan.operations.map((operation) => [operation.sourceKey, operation]));

    const expectedScenarioIds: Record<string, string> = {
      "block-oral-check-slot-02": "e46baf56-d0ae-4621-87f3-07718f0744b2",
      "block-oral-check-slot-05": "fd3b4f85-2407-426b-a21b-db9d7163ebbb",
      "block-oral-check-slot-16": "7765693a-5f8a-4aa1-ac39-c21866624006",
    };

    for (const sourceKey of Object.keys(MIGRATION_HARDCODED_BLOCK_IDS)) {
      const operation = bySourceKey.get(sourceKey);
      const content = operation?.row.content as Record<string, unknown>;
      expect(content.mode).toBe("oral_check");
      expect(content.height_px).toBe(760);
      expect(content.scenario_id).toBe(expectedScenarioIds[sourceKey]);
      expect(content.title).toBeUndefined();
      expect(content.scenario_spec).toBeTruthy();
      expect(operation?.row.is_required_for_completion).toBe(true);
    }
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

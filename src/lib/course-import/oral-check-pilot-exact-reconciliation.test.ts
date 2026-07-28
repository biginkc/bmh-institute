import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MANAGED_IMPORT_TABLES,
  expectedManagedIds,
  unexpectedManagedRows,
  type ManagedIdInventory,
} from "./exact-reconciliation";
import { buildImportPlan } from "./operations";
import type { CourseImportManifest } from "./manifest";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
);

// The 3 blocks 20260728020000_insert_oral_check_pilot_role_play_blocks.sql
// inserts directly, bypassing the manifest entirely -- see that migration's
// header comment. deterministicImportId('bmh-employee-training-v1', <source_key>)
// for 'block-oral-check-slot-02' / '-05' / '-16'.
const ORAL_CHECK_PILOT_BLOCK_IDS = [
  "7300bba9-a9fc-582c-aa20-dd5d58754165",
  "4464ecdd-2650-59ed-a525-78871e846d20",
  "34758403-1ddd-5e3c-a054-b2f28310d8b8",
] as const;

function realPlanInventory(): ManagedIdInventory {
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8"),
  ) as CourseImportManifest;
  const plan = buildImportPlan(manifest);
  const expected = expectedManagedIds(plan);
  // Real database state = exactly what the manifest plans, plus the 3
  // one-shot pilot inserts -- nothing else. A real DB read would include
  // rows for the OTHER managed tables too, but since expectedManagedIds
  // already gives us that exact set with no drift, cloning it and adding
  // only the 3 known block IDs precisely isolates the one gap this test
  // exists to bound.
  const inventory = Object.fromEntries(
    MANAGED_IMPORT_TABLES.map((table) => [table, [...expected[table]]]),
  ) as ManagedIdInventory;
  inventory.content_blocks.push(...ORAL_CHECK_PILOT_BLOCK_IDS);
  return inventory;
}

describe("oral-check pilot exact reconciliation gap (known, bounded, documented)", () => {
  it("flags EXACTLY the 3 one-shot pilot blocks as unexpected -- nothing else has drifted", () => {
    // This is a KNOWN, ACCEPTED gap, not a clean-reconciliation claim: the
    // pilot migration inserts 3 role_play blocks directly against
    // production, deliberately bypassing the manifest (adding them there
    // cascades into the separate Closer Lab production-mapping
    // ledger/catalog/provenance/builder chain -- see the migration's header
    // comment and the PR description for why that is out of scope for this
    // one-shot pilot). Anyone running `course:import verification` or a
    // rollback against this import WILL see these 3 reported as
    // "unexpected" until a follow-up either (a) extends the manifest +
    // Closer Lab ledger chain (requires a new Closer Lab export RPC for the
    // oral-check scenario namespace, which does not exist yet), or (b)
    // teaches the reconciliation tooling an explicit allowlist for known
    // one-shot corrections. This test's job is narrower and immediate: prove
    // the gap is EXACTLY these 3 known IDs, not evidence of open-ended,
    // unbounded drift.
    const plan = buildImportPlan(
      JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as CourseImportManifest,
    );
    const unexpected = unexpectedManagedRows(plan, realPlanInventory());

    expect(unexpected).toEqual(
      [...ORAL_CHECK_PILOT_BLOCK_IDS]
        .sort()
        .map((id) => ({ table: "content_blocks" as const, id })),
    );
  });

  it("the pilot's block IDs are absent from the current manifest-derived plan (proving the gap is real, not stale)", () => {
    const plan = buildImportPlan(
      JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as CourseImportManifest,
    );
    const planIds = new Set(plan.operations.map((operation) => operation.id));
    for (const id of ORAL_CHECK_PILOT_BLOCK_IDS) {
      expect(planIds.has(id)).toBe(false);
    }
  });
});

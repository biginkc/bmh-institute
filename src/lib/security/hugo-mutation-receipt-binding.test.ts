import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260729040000_hugo_mutation_receipt_binding.sql",
  ),
  "utf8",
);
const postgresTest = readFileSync(
  resolve("supabase/tests/061_hugo_mutation_receipt_binding.sql"),
  "utf8",
);
const controllerHarness = readFileSync(
  resolve(
    "scripts/fixture-boundary/run-controller-gate-pr-harness.mjs",
  ),
  "utf8",
);

describe("Hugo mutation receipt binding", () => {
  it("backfills historical receipts from the existing operation journal", () => {
    expect(migration).toContain(
      "set receipt = public.fn_hugo_bind_mutation_receipt(",
    );
    expect(migration).toContain("operation_row.operation_id");
    expect(migration).toContain("operation_row.request_hash");
    expect(migration).toContain(
      "hugo_access_operations_receipt_binding_check",
    );
    expect(migration).not.toMatch(
      /jsonb_build_object\([^)]*email/im,
    );
  });

  it("binds every new journal insert before the stored receipt is accepted", () => {
    expect(migration).toContain(
      "new.receipt := public.fn_hugo_bind_mutation_receipt(",
    );
    expect(migration).toContain("new.operation_id");
    expect(migration).toContain("new.request_hash");
    expect(migration).toContain(
      "create trigger hugo_access_operations_bind_request_hash",
    );
    expect(migration).toContain(
      "before insert on public.hugo_access_operations",
    );
    expect(migration).toMatch(
      /revoke insert, update, delete, truncate[\s\S]*on public\.hugo_access_operations[\s\S]*from service_role;/,
    );
  });

  it("returns the stored bound receipt after each private mutation", () => {
    expect(migration).toContain(
      "perform public.hugo_apply_access_unhashed(",
    );
    expect(migration).toContain(
      "perform public.hugo_prepare_pristine_delete_unhashed(",
    );
    expect(migration).toContain(
      "perform public.hugo_delete_identity_unhashed(",
    );
    expect(migration.match(
      /return public\.fn_hugo_bound_operation_receipt\(p_operation_id\);/g,
    )).toHaveLength(6);
  });

  it("covers apply, prepare, delete, replay, and changed-request conflicts in Postgres", () => {
    expect(postgresTest).toContain(
      "historical receipt must be backfilled with its operation id",
    );
    expect(postgresTest).toContain(
      "apply first response must equal the stored bound receipt",
    );
    expect(postgresTest).toContain(
      "prepare exact retry must return the identical bound receipt",
    );
    expect(postgresTest).toContain(
      "delete exact retry must return the identical bound receipt",
    );
    expect(postgresTest).toContain(
      "changed apply request must not mutate identity state",
    );
  });

  it("executes receipt and identity behavior in the PostgreSQL 15-17 CI harness", () => {
    expect(controllerHarness).toContain(
      "seedHugoHistoricalUnboundReceipt();",
    );
    expect(controllerHarness).toContain(
      "supabase/tests/061_hugo_mutation_receipt_binding.sql",
    );
    expect(controllerHarness).toContain(
      "supabase/tests/062_hugo_verified_identity_and_orphan_delete_guard.sql",
    );
  });
});

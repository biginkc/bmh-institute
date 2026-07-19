import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("fixture cleanup CLI", () => {
  it("launches under the repository runtime and reaches its credential gate", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
        join(process.cwd(), "scripts/cleanup-fixture-catalog.ts"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PROD_SUPABASE_URL: "",
          PROD_SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("Set PROD_SUPABASE_URL.");
    expect(output).not.toContain("Top-level await is currently not supported");
  });

  it("forwards both exact controller records to the database mutation gate", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/cleanup-fixture-catalog.ts"),
      "utf8",
    );
    expect(source).toContain("validateControllerVerifiedCleanupEvidence");
    expect(source).toContain("createFixtureCleanupSupabaseClient");
    expect(source).toContain("assertFixtureCleanupTransportContract");
    expect(source).not.toContain("createClient(url, serviceRole");
    expect(source).toContain("p_approval: approval");
    expect(source).toContain("p_rollback: rollback");
    expect(source).not.toContain(
      'rpc("admin_cleanup_fixture_catalog_v1", {\n        p_manifest_sha256: manifestSha256,\n        p_confirmation: confirmation,\n      })',
    );
  });
});

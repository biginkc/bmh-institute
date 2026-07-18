import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("fixture cleanup evidence signer", () => {
  it("writes matching signed envelopes without exposing the secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "fixture-cleanup-signer-"));
    try {
      const now = Date.now();
      const hash = "8".repeat(64);
      const approvalInput = join(dir, "approval-input.json");
      const rollbackInput = join(dir, "rollback-input.json");
      const approvalOutput = join(dir, "approval.json");
      const rollbackOutput = join(dir, "rollback.json");
      writeFileSync(
        approvalInput,
        JSON.stringify({
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          approved_by: "Jarrad Henry",
          approved_at: new Date(now - 5 * 60_000).toISOString(),
          recorded_by: "controller",
          evidence_sha256: "6".repeat(64),
          scope: "fixture_cleanup_after_real_course_acceptance",
          authorization: "execute",
        }),
      );
      writeFileSync(
        rollbackInput,
        JSON.stringify({
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          captured_at: new Date(now - 30 * 60_000).toISOString(),
          backup_id: "verified-backup",
          backup_provider: "supabase",
          backup_project_ref: "dhvfsyteqsxagokoerrx",
          backup_status: "COMPLETED",
          backup_verified_live_at: new Date(now - 20 * 60_000).toISOString(),
          backup_verified_by: "controller",
          backup_verification_evidence_sha256: "4".repeat(64),
          restore_rehearsal_status: "passed",
          restore_rehearsal_backup_id: "verified-backup",
          restore_rehearsed_at: new Date(now - 10 * 60_000).toISOString(),
          restore_rehearsal_evidence_sha256: "5".repeat(64),
          schema_sha256: "1".repeat(64),
          data_sha256: "2".repeat(64),
          storage_inventory_sha256: "3".repeat(64),
        }),
      );
      const secret = "signer-test-secret-with-at-least-32-characters";
      const result = spawnSync(
        process.execPath,
        [
          join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
          join(process.cwd(), "scripts/sign-fixture-cleanup-evidence.ts"),
          `--approval-input=${approvalInput}`,
          `--rollback-input=${rollbackInput}`,
          `--approval-output=${approvalOutput}`,
          `--rollback-output=${rollbackOutput}`,
          "--execution-id=00000000-0000-4000-8000-000000000036",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "signer-test-v1",
            FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET: secret,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const approval = JSON.parse(readFileSync(approvalOutput, "utf8"));
      const rollback = JSON.parse(readFileSync(rollbackOutput, "utf8"));
      expect(approval.execution_id).toBe(rollback.execution_id);
      expect(approval.controller_key_id).toBe("signer-test-v1");
      expect(approval.controller_signature).toMatch(/^[0-9a-f]{64}$/);
      expect(rollback.controller_signature).toMatch(/^[0-9a-f]{64}$/);
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
      expect(statSync(approvalOutput).mode & 0o777).toBe(0o600);
      expect(statSync(rollbackOutput).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

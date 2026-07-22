import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateCourseManifest } from "./manifest";
import { buildImportPlan } from "./operations";
import {
  assertImportedVideoPosterReplacementApproval,
  buildImportedVideoPosterReplacements,
} from "./video-poster-replacement";

const approvalPath = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";

function realInputs() {
  const manifest = JSON.parse(readFileSync(resolve(
    process.cwd(),
    "content/course-manifests/bmh-employee-training.v1.json",
  ), "utf8")) as unknown;
  const validated = validateCourseManifest(manifest, { gate: "release" });
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  const ledger = JSON.parse(readFileSync(resolve(
    process.cwd(),
    "docs/course-production/thumbnail-pilots/production-ledger.json",
  ), "utf8")) as unknown;
  return { plan: buildImportPlan(validated.value), ledger };
}

function realApproval() {
  const bytes = readFileSync(resolve(process.cwd(), approvalPath));
  return {
    approval: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("released imported video poster replacement payload", () => {
  it("binds all 29 existing video block IDs to exact old and new poster checksums", () => {
    const { plan, ledger } = realInputs();
    const replacements = buildImportedVideoPosterReplacements(plan, ledger);
    const storagePath = /^courses\/bmh-employee-training\/v1\/posters\/[a-z0-9-]+-[0-9a-f]{64}\.webp$/;

    expect(replacements).toHaveLength(29);
    expect(new Set(replacements.map((replacement) => replacement.block_id))).toHaveLength(29);
    expect(new Set(replacements.map((replacement) => replacement.poster_asset_key))).toHaveLength(29);
    for (const replacement of replacements) {
      expect(replacement.expected_poster_path).toMatch(storagePath);
      expect(replacement.replacement_poster_path).toMatch(storagePath);
      expect(replacement.expected_poster_path).toContain(replacement.expected_poster_sha256);
      expect(replacement.replacement_poster_path).toContain(replacement.replacement_poster_sha256);
      expect(replacement.expected_content.poster_path).toBe(replacement.expected_poster_path);
      expect(replacement.expected_poster_path).not.toBe(replacement.replacement_poster_path);
      expect(replacement.replacement_size_bytes).toBeGreaterThan(0);
    }
  });

  it("refuses a poster without the exact archived rollback checksum", () => {
    const { plan, ledger } = realInputs();
    const mutable = structuredClone(ledger) as { assets: Array<Record<string, unknown>> };
    const poster = mutable.assets.find((asset) => asset.asset_key === "poster-video-slot-01-welcome");
    if (!poster) throw new Error("fixture poster missing");
    poster.history = [];

    expect(() => buildImportedVideoPosterReplacements(plan, mutable)).toThrow(/no exact poster redesign rollback checksum/i);
  });

  it("refuses a manifest path that is not bound to its poster asset", () => {
    const { plan, ledger } = realInputs();
    const mutable = structuredClone(plan);
    const block = mutable.operations.find((operation) => operation.table === "content_blocks" && operation.row.block_type === "video");
    if (!block) throw new Error("fixture video block missing");
    (block.row.content as Record<string, unknown>).poster_path = "courses/bmh-employee-training/v1/posters/forged-" + "f".repeat(64) + ".webp";

    expect(() => buildImportedVideoPosterReplacements(mutable, ledger)).toThrow(/does not bind to one manifest poster asset/i);
  });

  it("binds the exact approval artifact to every generated replacement", () => {
    const { plan, ledger } = realInputs();
    const { approval, sha256 } = realApproval();
    const replacements = buildImportedVideoPosterReplacements(plan, ledger);

    expect(() => assertImportedVideoPosterReplacementApproval({
      replacements,
      ledgerInput: ledger,
      approvalInput: approval,
      approvalPath,
      approvalSha256: sha256,
    })).not.toThrow();
  });

  it("refuses altered approval bindings and ledger approval checksums", () => {
    const { plan, ledger } = realInputs();
    const { approval, sha256 } = realApproval();
    const replacements = buildImportedVideoPosterReplacements(plan, ledger);
    const alteredApproval = structuredClone(approval) as { assets: Array<Record<string, unknown>> };
    alteredApproval.assets[0].poster_asset_key = "poster-forged";

    expect(() => assertImportedVideoPosterReplacementApproval({
      replacements,
      ledgerInput: ledger,
      approvalInput: alteredApproval,
      approvalPath,
      approvalSha256: sha256,
    })).toThrow(/does not bind the exact replacement asset set/i);

    expect(() => assertImportedVideoPosterReplacementApproval({
      replacements,
      ledgerInput: ledger,
      approvalInput: approval,
      approvalPath,
      approvalSha256: "f".repeat(64),
    })).toThrow(/not bound to the production ledger/i);
  });
});

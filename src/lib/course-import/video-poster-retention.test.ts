import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateCourseManifest } from "./manifest";
import { buildImportPlan } from "./operations";
import { loadApprovedVideoPosterRetention } from "./video-poster-retention";

describe("approved video poster retention", () => {
  it.each([
    ["content/course-manifests/bmh-employee-training.v1.json", 29],
    ["content/course-manifests/bmh-employee-training-canary.v1.json", 1],
  ])("binds exact optional rollback objects for %s", async (manifestPath, count) => {
    const validated = validateCourseManifest(
      JSON.parse(readFileSync(resolve(process.cwd(), manifestPath), "utf8")) as unknown,
      { gate: manifestPath.includes("canary") ? "canary" : "release" },
    );
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const retention = await loadApprovedVideoPosterRetention(buildImportPlan(validated.value));
    expect(retention?.assets).toHaveLength(count);
    expect(retention?.clientPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not widen unrelated imports", async () => {
    const validated = validateCourseManifest(
      JSON.parse(readFileSync(resolve(process.cwd(), "content/course-manifests/bmh-employee-training.v1.json"), "utf8")) as unknown,
      { gate: "release" },
    );
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const plan = buildImportPlan(validated.value);
    plan.importId = "other-v1";
    await expect(loadApprovedVideoPosterRetention(plan)).resolves.toBeNull();
  });
});

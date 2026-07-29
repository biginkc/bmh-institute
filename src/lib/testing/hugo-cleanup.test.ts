import { describe, expect, it, vi } from "vitest";

import {
  createHugoAcceptanceRun,
  createHugoCleanupManifest,
  createHugoSeedRecorder,
  runHugoCleanupSteps,
} from "../../../e2e/hugo-acceptance";

describe("runHugoCleanupSteps", () => {
  it("runs every cleanup step and reports all failures", async () => {
    const completed: string[] = [];
    const firstFailure = vi.fn(async () => {
      completed.push("first");
      throw new Error("first cleanup failed");
    });
    const successful = vi.fn(async () => {
      completed.push("second");
    });
    const secondFailure = vi.fn(async () => {
      completed.push("third");
      throw new Error("third cleanup failed");
    });

    await expect(
      runHugoCleanupSteps([
        { label: "first resource", run: firstFailure },
        { label: "second resource", run: successful },
        { label: "third resource", run: secondFailure },
      ]),
    ).rejects.toThrow(
      "Hugo cleanup failed for first resource: first cleanup failed; third resource: third cleanup failed",
    );

    expect(completed).toEqual(["first", "second", "third"]);
  });

  it("publishes each resource before a later seed step can fail", () => {
    const observed = [] as ReturnType<typeof createHugoCleanupManifest>[];
    const recorder = createHugoSeedRecorder(
      createHugoCleanupManifest(createHugoAcceptanceRun("partial-seed")),
      (manifest) => observed.push(manifest),
    );

    recorder.record({
      project: "closer",
      kind: "persona",
      id: "persona-created-before-failure",
    });

    expect(() => {
      throw new Error("middle seed failed");
    }).toThrow("middle seed failed");
    expect(recorder.current().resources).toEqual([
      {
        project: "closer",
        kind: "persona",
        id: "persona-created-before-failure",
      },
    ]);
    expect(observed.at(-1)).toBe(recorder.current());
  });
});

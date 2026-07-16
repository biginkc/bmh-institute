import { describe, expect, it } from "vitest";

import { buildImportPlan, deterministicImportId } from "./operations";
import { validCourseManifest } from "./test-fixtures";

describe("buildImportPlan", () => {
  it("produces stable dependency-ordered operations", () => {
    const first = buildImportPlan(validCourseManifest());
    const second = buildImportPlan(validCourseManifest());

    expect(first).toEqual(second);
    expect(first.operations[0]).toMatchObject({ table: "role_groups", action: "upsert" });
    expect(first.operations.at(-1)).toMatchObject({ table: "program_access", action: "upsert" });
    expect(first.summary).toMatchObject({ programs: 1, courses: 1, modules: 1, lessons: 3 });
    expect(first.operations.find((operation) => operation.table === "assignments")?.row.rubric).toEqual([
      { criterion: "Complete", description: "Answers every prompt." },
    ]);
  });

  it("creates UUID-shaped deterministic identifiers", () => {
    const one = deterministicImportId("training-v1", "lesson-1");
    const again = deterministicImportId("training-v1", "lesson-1");
    const other = deterministicImportId("training-v1", "lesson-2");

    expect(one).toBe(again);
    expect(one).not.toBe(other);
    expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

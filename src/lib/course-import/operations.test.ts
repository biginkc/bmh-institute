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
    expect(first.operations.find((operation) => operation.table === "programs")?.row.content_import_id).toBe(
      "training-v1",
    );
    expect(first.operations.find((operation) => operation.table === "courses")?.row.content_import_id).toBe(
      "training-v1",
    );
    expect(first.operations.find((operation) => operation.table === "lessons")?.row.content_import_id).toBe(
      "training-v1",
    );
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

  it("builds the prerequisite chain from module and lesson sort_order, not JSON array order", () => {
    const manifest = validCourseManifest();
    const originalModule = manifest.program.courses[0].modules[0];
    const laterModule = structuredClone(originalModule);
    laterModule.source_key = "module-later";
    laterModule.sort_order = 20;
    laterModule.lessons = laterModule.lessons.map((lesson, index) => ({
      ...lesson,
      source_key: `${lesson.source_key}-later`,
      sort_order: index + 10,
      blocks: lesson.blocks?.map((block) => ({ ...block, source_key: `${block.source_key}-later` })),
      quiz: lesson.quiz ? {
        ...lesson.quiz,
        source_key: `${lesson.quiz.source_key}-later`,
        questions: lesson.quiz.questions.map((question) => ({
          ...question,
          source_key: `${question.source_key}-later`,
          options: question.options.map((option) => ({ ...option, source_key: `${option.source_key}-later` })),
        })),
      } : undefined,
      assignment: lesson.assignment ? { ...lesson.assignment, source_key: `${lesson.assignment.source_key}-later` } : undefined,
    }));
    originalModule.sort_order = 10;
    originalModule.lessons.reverse();
    manifest.program.courses[0].modules = [laterModule, originalModule];

    const plan = buildImportPlan(manifest);
    const lessonRows = plan.operations.filter((operation) => operation.table === "lessons");
    const expectedSourceOrder = [
      ...originalModule.lessons.slice().sort((a, b) => a.sort_order - b.sort_order),
      ...laterModule.lessons.slice().sort((a, b) => a.sort_order - b.sort_order),
    ].map((lesson) => lesson.source_key);
    expect(lessonRows.map((row) => row.sourceKey)).toEqual(expectedSourceOrder);
    expect(lessonRows.map((row) => row.row.prerequisite_lesson_id)).toEqual([
      null,
      ...lessonRows.slice(0, -1).map((row) => row.id),
    ]);
  });

  it("rejects ambiguous duplicate sort_order values when constructing prerequisites", () => {
    const manifest = validCourseManifest();
    manifest.program.courses[0].modules[0].lessons[1].sort_order =
      manifest.program.courses[0].modules[0].lessons[0].sort_order;
    expect(() => buildImportPlan(manifest)).toThrow(/duplicate lesson sort_order/i);

    const duplicateModuleManifest = validCourseManifest();
    duplicateModuleManifest.program.courses[0].modules.push(
      structuredClone(duplicateModuleManifest.program.courses[0].modules[0]),
    );
    expect(() => buildImportPlan(duplicateModuleManifest)).toThrow(/duplicate module sort_order/i);
  });

  it("never persists an unproven direct storage path", () => {
    const manifest = validCourseManifest();
    manifest.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "raw-held-guide",
      type: "download",
      sort_order: 2,
      required: false,
      content: { file_path: "courses/other/v1/guides/held.pdf" },
    });
    expect(() => buildImportPlan(manifest)).toThrow(
      "raw-held-guide.file_path must exactly match one approved immutable asset in this import",
    );
  });

  it("sanitizes imported text again when constructing database operations", () => {
    const manifest = validCourseManifest();
    manifest.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "defense-in-depth-text",
      type: "text",
      sort_order: 2,
      required: false,
      content: { html: '<p onclick="alert(1)">Safe words</p><script>bad()</script>' },
    });

    const plan = buildImportPlan(manifest);
    const row = plan.operations.find(
      (operation) => operation.sourceKey === "defense-in-depth-text",
    );
    expect(row?.row.content).toEqual({ html: "<p>Safe words</p>" });
  });

  it("rejects a direct path even when it matches a held asset key", () => {
    const manifest = validCourseManifest();
    const video = manifest.assets.find((asset) => asset.source_key === "video-1");
    const block = manifest.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video || !block) throw new Error("Fixture video is missing.");
    video.approval_status = "hold";
    block.content.file_path = video.storage_path;
    expect(() => buildImportPlan(manifest)).toThrow(
      "block-video.file_path must exactly match one approved immutable asset in this import",
    );
  });

  it("persists exact entity-bound provenance only for approved immutable artwork", () => {
    const manifest = validCourseManifest();
    const checksum = "a".repeat(64);
    const thumbnail = manifest.assets.find((asset) => asset.source_key === "thumb-1");
    if (!thumbnail) throw new Error("Fixture thumbnail is missing.");
    thumbnail.checksum_sha256 = checksum;
    thumbnail.storage_path = `courses/training/v1/thumbnails/thumb-${checksum}.webp`;
    const plan = buildImportPlan(manifest);
    for (const table of ["programs", "courses", "lessons"] as const) {
      const rows = plan.operations.filter((operation) => operation.table === table);
      for (const operation of rows.filter((row) => row.row.thumbnail_path)) {
        expect(operation.row).toMatchObject({
          thumbnail_asset_key: "thumb-1",
          thumbnail_approved_path: thumbnail.storage_path,
          thumbnail_approved_sha256: checksum,
          thumbnail_path: thumbnail.storage_path,
        });
      }
    }
  });
});

import { describe, expect, it } from "vitest";

import { validateCanaryScope, validateCourseManifest } from "./manifest";
import { validCourseManifest } from "./test-fixtures";

describe("validateCourseManifest", () => {
  it("accepts a complete unpublished draft manifest", () => {
    const result = validateCourseManifest(validCourseManifest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.program.courses[0].modules[0].lessons).toHaveLength(3);
  });

  it("keeps import and source key lengths inside the database rollback contract", () => {
    const maxImport = validCourseManifest();
    const maxImportBase = "a".repeat(125);
    maxImport.import_id = `${maxImportBase}-v1`;
    for (const asset of maxImport.assets) {
      asset.storage_path = asset.storage_path.replace(
        "courses/training/v1/",
        `courses/${maxImportBase}/v1/`,
      );
    }
    expect(maxImport.import_id).toHaveLength(128);
    expect(validateCourseManifest(maxImport).ok).toBe(true);

    const longImport = validCourseManifest();
    longImport.import_id = `${"a".repeat(126)}-v1`;
    const longImportResult = validateCourseManifest(longImport);
    expect(longImportResult.ok).toBe(false);
    if (!longImportResult.ok) {
      expect(longImportResult.errors).toContain(
        "import_id must be at most 128 characters and use lowercase letters, numbers, dots, underscores, or hyphens.",
      );
    }

    const maxSource = validCourseManifest();
    maxSource.program.courses[0].modules[0].lessons[0].source_key = "b".repeat(512);
    expect(validateCourseManifest(maxSource).ok).toBe(true);

    const longSource = validCourseManifest();
    longSource.program.courses[0].modules[0].lessons[0].source_key = "b".repeat(513);
    const longSourceResult = validateCourseManifest(longSource);
    expect(longSourceResult.ok).toBe(false);
    if (!longSourceResult.ok) {
      expect(longSourceResult.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("source_key must be at most 512 characters")]),
      );
    }

    const longDerivedSource = validCourseManifest();
    longDerivedSource.program.source_key = "p".repeat(256);
    longDerivedSource.program.courses[0].source_key = "c".repeat(256);
    const longDerivedResult = validateCourseManifest(longDerivedSource);
    expect(longDerivedResult.ok).toBe(false);
    if (!longDerivedResult.ok) {
      expect(longDerivedResult.errors).toContain(
        "program.courses[0].program_course derived source_key must be at most 512 characters for rollback.",
      );
    }

    const longAccessSource = validCourseManifest();
    longAccessSource.program.source_key = "p".repeat(504);
    const longAccessResult = validateCourseManifest(longAccessSource);
    expect(longAccessResult.ok).toBe(false);
    if (!longAccessResult.ok) {
      expect(longAccessResult.errors).toContain(
        "program_access derived source_key must be at most 512 characters for rollback.",
      );
    }

    for (const invalidSource of ["Uppercase", "unicodé"]) {
      const invalid = validCourseManifest();
      invalid.program.courses[0].modules[0].source_key = invalidSource;
      expect(validateCourseManifest(invalid).ok).toBe(false);
    }
  });

  it("rejects publication, duplicate keys, and unresolved asset references", () => {
    const input = validCourseManifest();
    (input.program as { is_published: boolean }).is_published = true;
    input.assets[1].source_key = input.assets[0].source_key;
    const lesson = input.program.courses[0].modules[0].lessons[0];
    lesson.thumbnail_asset_key = "missing-thumbnail";

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("program.is_published must be false"),
        expect.stringContaining("Duplicate source_key"),
        expect.stringContaining("missing-thumbnail"),
      ]),
    );
  });

  it("rejects invalid lesson payloads and unapproved required media", () => {
    const input = validCourseManifest();
    input.assets[0].approval_status = "hold";
    input.program.courses[0].modules[0].lessons[0].quiz =
      input.program.courses[0].modules[0].lessons[1].quiz;

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("referenced asset video-1 is not approved"),
        expect.stringContaining("content lesson"),
      ]),
    );
  });

  it("rejects required blocks that cannot report completion", () => {
    const nonTrackable = validCourseManifest();
    const block = nonTrackable.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!block) throw new Error("Fixture video block is missing.");
    block.type = "text";
    block.content = { html: "<p>Read this.</p>" };

    const nonTrackableResult = validateCourseManifest(nonTrackable);
    expect(nonTrackableResult.ok).toBe(false);
    if (!nonTrackableResult.ok) {
      expect(nonTrackableResult.errors).toContain(
        "program.courses[0].modules[0].lessons[0].blocks[0] cannot be required because text blocks do not report completion.",
      );
    }

    const missingVideo = validCourseManifest();
    const video = missingVideo.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video) throw new Error("Fixture video block is missing.");
    video.content = {};
    const missingVideoResult = validateCourseManifest(missingVideo);
    expect(missingVideoResult.ok).toBe(false);
    if (!missingVideoResult.ok) {
      expect(missingVideoResult.errors).toContain(
        "program.courses[0].modules[0].lessons[0].blocks[0] requires an uploaded video asset before it can be required.",
      );
    }
  });

  it("requires release assets to use immutable import-owned storage paths", () => {
    const input = validCourseManifest();
    input.assets[0].checksum_sha256 = "a".repeat(64);
    input.assets[0].storage_path = "courses/another-import/video.mp4";

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must be owned by courses/training/v1/"),
        expect.stringContaining("must include its SHA-256 checksum"),
      ]),
    );
  });

  it("rejects cross-import storage paths before upload or rollback", () => {
    const input = validCourseManifest();
    input.assets[0].storage_path = "courses/another-import/video.mp4";

    const result = validateCourseManifest(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "assets[0].storage_path must be owned by courses/training/v1/.",
    );
  });

  it("requires a poster asset reference on every release video", () => {
    const input = validCourseManifest();
    const video = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video) throw new Error("Fixture video block is missing.");
    delete video.content.poster_asset_key;

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[0].content.poster_asset_key is required for release.",
    );
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "120"])(
    "rejects required release video duration %s",
    (duration) => {
      const input = validCourseManifest();
      const video = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
      if (!video) throw new Error("Fixture video block is missing.");
      video.content.duration_seconds = duration;

      const result = validateCourseManifest(input, { gate: "release" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContain(
        "program.courses[0].modules[0].lessons[0].blocks[0].content.duration_seconds must be a finite positive number for a required release video.",
      );
    },
  );

  it("requires both the media asset and authored duration on a required release video", () => {
    const input = validCourseManifest();
    const video = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video) throw new Error("Fixture video block is missing.");
    delete video.content.asset_key;
    delete video.content.duration_seconds;

    const result = validateCourseManifest(input, { gate: "release" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      "program.courses[0].modules[0].lessons[0].blocks[0].content.asset_key is required for release.",
      "program.courses[0].modules[0].lessons[0].blocks[0].content.duration_seconds must be a finite positive number for a required release video.",
    ]));
  });

  it("rejects placeholder Closer Lab IDs on required release role plays", () => {
    const input = validCourseManifest();
    input.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "block-role-play",
      type: "role_play",
      sort_order: 2,
      required: true,
      content: { scenario_id: "  PeNdInG :closer-lab-scenario  " },
    });

    expect(validateCourseManifest(input).ok).toBe(true);
    const result = validateCourseManifest(input, { gate: "release" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[2].content.scenario_id must be a production Closer Lab scenario ID for a required release role play.",
    );
  });

  it("requires optional learner resources to be approved for release", () => {
    const input = validCourseManifest();
    input.assets.push({
      source_key: "guide-1",
      kind: "pdf",
      local_path: "assets/guide.pdf",
      storage_path: "courses/training/v1/guides/guide.pdf",
      mime_type: "application/pdf",
      checksum_sha256: null,
      size_bytes: 10,
      approval_status: "hold",
    });
    input.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "guide-block",
      type: "download",
      sort_order: 2,
      required: false,
      content: { asset_key: "guide-1" },
    });

    const result = validateCourseManifest(input, { gate: "release" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[2] referenced asset guide-1 is not approved.",
    );
  });

  it("rejects direct resolved paths that bypass the manifest asset map", () => {
    const input = validCourseManifest();
    input.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "raw-held-guide",
      type: "download",
      sort_order: 2,
      required: false,
      content: {
        file_path: "courses/other-private/v1/guides/held.pdf",
        filename: "held.pdf",
      },
    });
    const result = validateCourseManifest(input, { gate: "release" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[2].content.file_path must exactly match one manifest asset.",
    );
  });

  it("rejects a resolved path that disagrees with its asset key", () => {
    const input = validCourseManifest();
    const block = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!block) throw new Error("Fixture video block is missing.");
    block.content.file_path = input.assets[1].storage_path;
    const result = validateCourseManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[0].content.file_path does not match asset_key video-1.",
    );
  });

  it("returns validation errors for malformed and oversized assignment rubrics", () => {
    const malformed = validCourseManifest() as unknown as Record<string, unknown>;
    const assignment = assignmentFrom(malformed);
    assignment.rubric = [null];
    expect(() => validateCourseManifest(malformed)).not.toThrow();
    const malformedResult = validateCourseManifest(malformed);
    expect(malformedResult.ok).toBe(false);

    const oversized = validCourseManifest() as unknown as Record<string, unknown>;
    const oversizedAssignment = assignmentFrom(oversized);
    oversizedAssignment.rubric = Array.from({ length: 21 }, () => ({ criterion: "A", description: "B" }));
    oversizedAssignment.submission_type = "script";
    oversizedAssignment.requires_review = "yes";
    const oversizedResult = validateCourseManifest(oversized);
    expect(oversizedResult.ok).toBe(false);
    if (oversizedResult.ok) return;
    expect(oversizedResult.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("submission_type is invalid"),
        expect.stringContaining("requires_review must be boolean"),
        expect.stringContaining("up to 20 criteria"),
      ]),
    );
  });

  it("requires catalog artwork to be an image in this import's thumbnail namespace", () => {
    const input = validCourseManifest();
    input.assets[1].storage_path = "courses/another-import/v1/thumbnails/cover.webp";
    input.assets[1].mime_type = "video/mp4";

    const result = validateCourseManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must be owned by courses/training/v1/"),
        expect.stringContaining("must reference an image in courses/training/v1/thumbnails/"),
      ]),
    );
  });

  it("rejects using the full manifest as a canary", () => {
    const input = validCourseManifest();
    expect(validateCanaryScope(input)).toEqual(
      expect.arrayContaining([
        "Canary import_id must include canary.",
        "Canary manifest must contain exactly one Tech Stack content lesson.",
      ]),
    );
  });

  it("never throws for null or primitive nested catalog entries", () => {
    const cases = [
      (manifest: Record<string, unknown>) => {
        programFrom(manifest).courses = [null];
      },
      (manifest: Record<string, unknown>) => {
        courseFrom(manifest).modules = ["module"];
      },
      (manifest: Record<string, unknown>) => {
        moduleFrom(manifest).lessons = [null];
      },
      (manifest: Record<string, unknown>) => {
        lessonFrom(manifest).blocks = [false];
      },
      (manifest: Record<string, unknown>) => {
        quizFrom(manifest).questions = [null];
      },
      (manifest: Record<string, unknown>) => {
        questionFrom(manifest).options = [42];
      },
    ];

    for (const mutate of cases) {
      const raw = structuredClone(validCourseManifest()) as unknown as Record<string, unknown>;
      mutate(raw);
      expect(() => validateCourseManifest(raw)).not.toThrow();
      expect(validateCourseManifest(raw).ok).toBe(false);
    }
  });

  it("validates asset and block enums, booleans, and integer contracts before apply", () => {
    const raw = validCourseManifest() as unknown as Record<string, unknown>;
    const program = programFrom(raw);
    program.course_order_mode = "shuffle";
    program.certificate_enabled = "yes";
    const course = courseFrom(raw);
    course.certificate_enabled = 1;
    const courseModule = moduleFrom(raw);
    courseModule.sort_order = -1;
    const lesson = lessonFrom(raw);
    lesson.required = "yes";
    const block = blockFrom(raw);
    block.type = "bogus";
    block.required = "yes";
    block.sort_order = 0.5;
    const assets = raw.assets as Array<Record<string, unknown>>;
    assets[0].kind = "executable";

    const result = validateCourseManifest(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      "program.course_order_mode is invalid.",
      "program.certificate_enabled must be boolean.",
      "program.courses[0].certificate_enabled must be boolean.",
      "program.courses[0].modules[0].sort_order must be a non-negative integer.",
      "program.courses[0].modules[0].lessons[0].required must be boolean.",
      "program.courses[0].modules[0].lessons[0].blocks[0].type is invalid.",
      "program.courses[0].modules[0].lessons[0].blocks[0].required must be boolean.",
      "program.courses[0].modules[0].lessons[0].blocks[0].sort_order must be a non-negative integer.",
      "assets[0].kind is invalid.",
    ]));
  });

  it("rejects referenced assets with the wrong kind or MIME contract", () => {
    const input = validCourseManifest();
    const block = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!block) throw new Error("Fixture video block is missing.");
    input.assets[0].kind = "pdf";
    input.assets[0].mime_type = "application/pdf";
    block.content.poster_asset_key = "video-1";
    block.content.caption_asset_key = "thumb-1";
    block.content.transcript_asset_key = "thumb-1";

    const result = validateCourseManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.filter((error) => error.includes("incompatible kind or MIME"))).toHaveLength(4);
  });
});

function assignmentFrom(manifest: Record<string, unknown>) {
  const program = manifest.program as { courses: Array<{ modules: Array<{ lessons: Array<Record<string, unknown>> }> }> };
  const lesson = program.courses[0].modules[0].lessons.find((item) => item.type === "assignment");
  if (!lesson || !lesson.assignment || typeof lesson.assignment !== "object") {
    throw new Error("Fixture assignment is missing.");
  }
  return lesson.assignment as Record<string, unknown>;
}

function programFrom(manifest: Record<string, unknown>) {
  return manifest.program as Record<string, unknown>;
}

function courseFrom(manifest: Record<string, unknown>) {
  return (programFrom(manifest).courses as Array<Record<string, unknown>>)[0];
}

function moduleFrom(manifest: Record<string, unknown>) {
  return (courseFrom(manifest).modules as Array<Record<string, unknown>>)[0];
}

function lessonFrom(manifest: Record<string, unknown>) {
  return (moduleFrom(manifest).lessons as Array<Record<string, unknown>>)[0];
}

function blockFrom(manifest: Record<string, unknown>) {
  return (lessonFrom(manifest).blocks as Array<Record<string, unknown>>)[0];
}

function quizFrom(manifest: Record<string, unknown>) {
  const lesson = (moduleFrom(manifest).lessons as Array<Record<string, unknown>>)
    .find((item) => item.type === "quiz");
  if (!lesson || !lesson.quiz || typeof lesson.quiz !== "object") throw new Error("Fixture quiz is missing.");
  return lesson.quiz as Record<string, unknown>;
}

function questionFrom(manifest: Record<string, unknown>) {
  return (quizFrom(manifest).questions as Array<Record<string, unknown>>)[0];
}

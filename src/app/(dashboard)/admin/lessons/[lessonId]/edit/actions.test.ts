import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let blockTypeRow: {
  block_type: string;
  is_required_for_completion?: boolean;
  content?: Record<string, unknown>;
} | null = { block_type: "text" };
let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    email: "admin@bmh.invalid",
    system_role: "owner",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "content_blocks") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: blockTypeRow,
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: async () => ({ error: updateError }),
          };
        },
      };
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateBlock } from "./actions";

describe("updateBlock sanitization (HARDEN-05)", () => {
  beforeEach(() => {
    blockTypeRow = { block_type: "text" };
    updatePatch = null;
    updateError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the existing block_type before writing", async () => {
    await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { html: "<p>Safe</p>" },
    });

    expect(updatePatch).toEqual({
      content: { html: "<p>Safe</p>" },
      is_required_for_completion: false,
    });
  });

  it("sanitizes text block html before update", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { html: '<p>Safe</p><script>alert("xss")</script>' },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: { html: "<p>Safe</p>" },
      is_required_for_completion: false,
    });
  });

  it("does not sanitize non-text blocks", async () => {
    blockTypeRow = { block_type: "embed" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { html: '<p>Safe</p><script>alert("xss")</script>' },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: { html: '<p>Safe</p><script>alert("xss")</script>' },
      is_required_for_completion: false,
    });
  });

  it("returns a clear error when the block is missing", async () => {
    blockTypeRow = null;

    const result = await updateBlock({
      blockId: "missing",
      lessonId: "lesson-1",
      content: { html: "<p>Safe</p>" },
    });

    expect(result).toEqual({ ok: false, error: "Block not found." });
    expect(updatePatch).toBeNull();
  });
});

describe("updateBlock embed branch (HARDEN-05)", () => {
  beforeEach(() => {
    blockTypeRow = { block_type: "embed" };
    updatePatch = null;
    updateError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid https iframe_src and writes the trimmed value", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        iframe_src: "  https://www.loom.com/embed/abc  ",
        aspect_ratio: "16:9",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: {
        iframe_src: "https://www.loom.com/embed/abc",
        aspect_ratio: "16:9",
      },
      is_required_for_completion: false,
    });
  });

  it("rejects an http iframe_src without updating", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { iframe_src: "http://example.com" },
    });

    expect(result).toEqual({
      ok: false,
      error: "Embed URL must start with https://",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects a javascript iframe_src without updating", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { iframe_src: "javascript:alert(1)" },
    });

    expect(result).toEqual({
      ok: false,
      error: "Embed URL must start with https://",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects a protocol-relative iframe_src without updating", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { iframe_src: "//example.com/foo" },
    });

    expect(result).toEqual({
      ok: false,
      error: "Embed URL must start with https://",
    });
    expect(updatePatch).toBeNull();
  });

  it("preserves the text sanitizer branch when block_type is text", async () => {
    blockTypeRow = { block_type: "text" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { html: "<p>hi</p>", iframe_src: "http://danger" },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: { html: "<p>hi</p>", iframe_src: "http://danger" },
      is_required_for_completion: false,
    });
  });
});

describe("updateBlock role_play branch", () => {
  beforeEach(() => {
    blockTypeRow = { block_type: "role_play" };
    updatePatch = null;
    updateError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("trims the configured scenario id before saving", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "  scenario-1  ",
        title: " Handle the price objection ",
        height_px: 900,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: {
        scenario_id: "scenario-1",
        title: "Handle the price objection",
        height_px: 900,
      },
      is_required_for_completion: false,
    });
  });

  it("allows an admin to make a role play required", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "scenario-1",
        title: "Opening practice",
        height_px: 720,
      },
      is_required_for_completion: true,
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({ is_required_for_completion: true });
  });

  it("forces an external video to optional even when the client requests required", async () => {
    blockTypeRow = { block_type: "video" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { source: "youtube", url: "https://youtu.be/example" },
      is_required_for_completion: true,
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({ is_required_for_completion: false });
  });

  it("allows an uploaded video with authored duration to be required", async () => {
    blockTypeRow = { block_type: "video" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        source: "upload",
        file_path: "courses/test/video.mp4",
        duration_seconds: 412.096,
      },
      is_required_for_completion: true,
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: {
        source: "upload",
        file_path: "courses/test/video.mp4",
        duration_seconds: 412.096,
      },
      is_required_for_completion: true,
    });
  });

  it("rejects a required uploaded video without authored duration", async () => {
    blockTypeRow = { block_type: "video" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        source: "upload",
        file_path: "courses/test/video.mp4",
      },
      is_required_for_completion: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "Add a valid video duration before requiring completion.",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects an invalid authored duration even when the video is optional", async () => {
    blockTypeRow = { block_type: "video" };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        source: "upload",
        file_path: "courses/test/video.mp4",
        duration_seconds: 0,
      },
      is_required_for_completion: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "Video duration must be a positive number of seconds.",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects an empty scenario id without updating", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { scenario_id: "   ", title: "Role play", height_px: 720 },
    });

    expect(result).toEqual({
      ok: false,
      error: "Scenario ID is required.",
    });
    expect(updatePatch).toBeNull();
  });
});

describe("updateBlock role_play branch preserves backend-only oral-check fields (PR #130 finding 4)", () => {
  beforeEach(() => {
    blockTypeRow = {
      block_type: "role_play",
      content: {
        mode: "oral_check",
        height_px: 760,
        scenario_id: "e46baf56-d0ae-4621-87f3-07718f0744b2",
        scenario_spec: {
          assignment_source_key: "oral-check-slot-02",
          context: "Existing persisted context.",
          learner_goal: "Existing persisted goal.",
          success_criteria: ["a", "b", "c"],
          fail_conditions: ["x", "y", "z"],
        },
      },
    };
    updatePatch = null;
    updateError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges onto the persisted content instead of replacing it wholesale, keeping mode and scenario_spec", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "e46baf56-d0ae-4621-87f3-07718f0744b2",
        title: "",
        height_px: 800,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: {
        mode: "oral_check",
        scenario_id: "e46baf56-d0ae-4621-87f3-07718f0744b2",
        scenario_spec: {
          assignment_source_key: "oral-check-slot-02",
          context: "Existing persisted context.",
          learner_goal: "Existing persisted goal.",
          success_criteria: ["a", "b", "c"],
          fail_conditions: ["x", "y", "z"],
        },
        height_px: 800,
      },
      is_required_for_completion: false,
    });
    // No title key at all -- not "Role play" -- so the learner-facing
    // renderer's oral_check fallback ("Talk with Andrea") keeps applying.
    expect(updatePatch).not.toHaveProperty("content.title");
  });

  it("still lets an admin set an explicit title on an oral-check block", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "e46baf56-d0ae-4621-87f3-07718f0744b2",
        title: "  Custom oral check title  ",
        height_px: 760,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      content: expect.objectContaining({
        mode: "oral_check",
        title: "Custom oral check title",
      }),
    });
  });

  it("a non-oral-check role play with a blank submitted title still defaults to 'Role play'", async () => {
    blockTypeRow = {
      block_type: "role_play",
      content: { scenario_id: "old-scenario", title: "Old title", height_px: 720 },
    };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { scenario_id: "scenario-2", title: "", height_px: 720 },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      content: expect.objectContaining({ title: "Role play" }),
    });
  });
});

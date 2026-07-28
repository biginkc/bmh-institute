import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let blockTypeRow: {
  block_type: string;
  content?: Record<string, unknown>;
  is_required_for_completion?: boolean;
} | null = { block_type: "text" };
let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;
/** Runs after updateBlock's SELECT resolves -- lets a test mutate
 * blockTypeRow to simulate a concurrent backend publish landing between the
 * action's read and its write, exercising the read/write race for real. */
let afterSelect: (() => void) | null = null;
/** The args the action sent to the atomic role-play merge RPC, plus the
 * content the simulated database produced by merging them onto the LIVE row
 * content at rpc time (NOT the content the action read earlier). */
let rpcCall: Record<string, unknown> | null = null;
let rpcMergedContent: Record<string, unknown> | null = null;
let rpcError: { message: string } | null = null;

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
            maybeSingle: async () => {
              // Snapshot, like a real SELECT: later mutations of
              // blockTypeRow (a simulated concurrent publish) must not
              // retroactively change what this action already read.
              const snapshot = blockTypeRow
                ? structuredClone(blockTypeRow)
                : null;
              afterSelect?.();
              return { data: snapshot, error: null };
            },
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "fn_admin_merge_role_play_block_content") {
        throw new Error(`Unexpected rpc ${name}`);
      }
      rpcCall = args;
      if (rpcError) return { data: null, error: rpcError };
      if (!blockTypeRow || blockTypeRow.block_type !== "role_play") {
        return { data: null, error: null };
      }
      // Simulate the database-side compare-and-swap: the merge matches zero
      // rows (null result, nothing written) unless the LIVE row's scenario
      // binding still equals what the caller's browser loaded.
      const liveScenario = blockTypeRow.content?.scenario_id ?? null;
      if (liveScenario !== args.p_expected_scenario_id) {
        return { data: null, error: null };
      }
      // Otherwise: content || three keys, applied to the row's CURRENT
      // content -- which may have changed since the action's SELECT.
      rpcMergedContent = {
        ...(blockTypeRow.content ?? {}),
        scenario_id: args.p_scenario_id,
        title: args.p_title,
        height_px: args.p_height_px,
      };
      blockTypeRow.content = rpcMergedContent;
      return { data: rpcMergedContent, error: null };
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
    afterSelect = null;
    rpcCall = null;
    rpcMergedContent = null;
    rpcError = null;
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
    afterSelect = null;
    rpcCall = null;
    rpcMergedContent = null;
    rpcError = null;
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
    blockTypeRow = {
      block_type: "role_play",
      content: { scenario_id: "scenario-1", title: "Role play", height_px: 720 },
    };
    updatePatch = null;
    updateError = null;
    afterSelect = null;
    rpcCall = null;
    rpcMergedContent = null;
    rpcError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("trims the configured scenario id and saves through the atomic merge RPC, never a full-content update", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "scenario-1",
      content: {
        scenario_id: "  scenario-1  ",
        title: " Handle the price objection ",
        height_px: 900,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toBeNull();
    expect(rpcCall).toEqual({
      p_block_id: "block-1",
      p_expected_scenario_id: "scenario-1",
      p_scenario_id: "scenario-1",
      p_title: "Handle the price objection",
      p_height_px: 900,
      p_is_required_for_completion: false,
    });
  });

  it("preserves an existing oral-check mode marker when only the title changes", async () => {
    blockTypeRow = {
      block_type: "role_play",
      content: {
        mode: "oral_check",
        scenario_id: "scenario-1",
        title: "Talk with Andrea",
        height_px: 760,
      },
    };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "scenario-1",
      // The admin form has no UI control for `mode` — it always resends the
      // fields it does expose, so the payload below is what the client
      // actually sends when an admin only edits the title.
      content: {
        scenario_id: "scenario-1",
        title: "Handle the price objection",
        height_px: 760,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpcMergedContent).toEqual({
      mode: "oral_check",
      scenario_id: "scenario-1",
      title: "Handle the price objection",
      height_px: 760,
    });
  });

  it("ignores stale content keys replayed by an outdated tab instead of overwriting newer backend-only fields", async () => {
    // Freshly persisted state: the block has since been marked as an
    // oral-check with an attached scenario_spec by a backend publish.
    blockTypeRow = {
      block_type: "role_play",
      content: {
        mode: "oral_check",
        scenario_id: "scenario-current",
        scenario_spec: { context: "Current published spec" },
        title: "Talk with Andrea",
        height_px: 760,
      },
    };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "scenario-current",
      // A STALE tab loaded before the backend publish replays its whole old
      // snapshot: no mode, no scenario_spec, old scenario_id under a bogus
      // extra key. Only the three form-exposed fields may take effect; the
      // stale snapshot's other keys must not leak into persisted content.
      content: {
        scenario_id: "scenario-current",
        title: "Retitled from the stale tab",
        height_px: 720,
        mode: undefined,
        legacy_marker: "should-never-persist",
        scenario_spec: { context: "Stale pre-publish spec" },
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpcMergedContent).toEqual({
      mode: "oral_check",
      scenario_id: "scenario-current",
      scenario_spec: { context: "Current published spec" },
      title: "Retitled from the stale tab",
      height_px: 720,
    });
  });

  it("conflicts a stale save when a publication rebinds the scenario between the read and the write, losing the stale value", async () => {
    // Two-client interleaving, worst case: the admin's tab loaded
    // scenario-old, then -- between this action's read and its write -- a
    // publication rebinds the block to scenario-published and attaches a
    // new spec. The stale tab's save (which would write scenario-old BACK
    // over the new binding while keeping the new spec) must LOSE: the
    // compare-and-swap on the loaded binding conflicts, nothing is written,
    // and the admin is told to reload.
    blockTypeRow = {
      block_type: "role_play",
      content: {
        scenario_id: "scenario-old",
        title: "Talk with Andrea",
        height_px: 760,
      },
    };
    afterSelect = () => {
      blockTypeRow!.content = {
        mode: "oral_check",
        scenario_id: "scenario-published",
        scenario_spec: { context: "Published between read and write" },
        title: "Talk with Andrea",
        height_px: 760,
      };
    };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "scenario-old",
      content: {
        scenario_id: "scenario-old",
        title: "Admin retitle from the stale tab",
        height_px: 800,
      },
    });

    expect(result).toEqual({
      ok: false,
      error:
        "This role play changed since you loaded it (its scenario binding moved). Reload the page and re-apply your edit.",
    });
    expect(updatePatch).toBeNull();
    expect(rpcMergedContent).toBeNull();
    // The publication's binding and spec survive untouched.
    expect(blockTypeRow!.content).toEqual({
      mode: "oral_check",
      scenario_id: "scenario-published",
      scenario_spec: { context: "Published between read and write" },
      title: "Talk with Andrea",
      height_px: 760,
    });
  });

  it("refuses a role play save that does not carry the loaded scenario binding", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "scenario-1",
        title: "No expected binding",
        height_px: 720,
      },
    });

    expect(result).toEqual({
      ok: false,
      error: "Missing the loaded scenario binding. Reload the page and try again.",
    });
    expect(rpcCall).toBeNull();
  });

  it("saves a brand-new role play's FIRST scenario binding (the block starts with an explicit empty scenario_id, not an omitted field)", async () => {
    // createBlock's default content for a new role_play block is exactly
    // { scenario_id: "", title: "Role play", height_px: 720 } -- the editor
    // loads that live row and sends expected_scenario_id: "" (what it
    // actually saw), never omitting the field. This must succeed: "" is a
    // real loaded binding, not a missing one.
    blockTypeRow = {
      block_type: "role_play",
      content: { scenario_id: "", title: "Role play", height_px: 720 },
    };

    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "",
      content: {
        scenario_id: "pending:oral-check-1",
        title: "Talk with Andrea",
        height_px: 720,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpcCall).toEqual({
      p_block_id: "block-1",
      p_expected_scenario_id: "",
      p_scenario_id: "pending:oral-check-1",
      p_title: "Talk with Andrea",
      p_height_px: 720,
      p_is_required_for_completion: false,
    });
    expect(rpcMergedContent).toEqual({
      scenario_id: "pending:oral-check-1",
      title: "Talk with Andrea",
      height_px: 720,
    });
  });

  it("allows an admin to make a role play required", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      expected_scenario_id: "scenario-1",
      content: {
        scenario_id: "scenario-1",
        title: "Opening practice",
        height_px: 720,
      },
      is_required_for_completion: true,
    });

    expect(result).toEqual({ ok: true });
    expect(rpcCall).toMatchObject({ p_is_required_for_completion: true });
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

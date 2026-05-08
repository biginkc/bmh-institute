import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let blockTypeRow: { block_type: string } | null = { block_type: "text" };
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

    expect(updatePatch).toEqual({ content: { html: "<p>Safe</p>" } });
  });

  it("sanitizes text block html before update", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { html: '<p>Safe</p><script>alert("xss")</script>' },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({ content: { html: "<p>Safe</p>" } });
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

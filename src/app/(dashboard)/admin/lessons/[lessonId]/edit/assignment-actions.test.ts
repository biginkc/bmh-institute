import { beforeEach, describe, expect, it, vi } from "vitest";

let updatePatch: Record<string, unknown> | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updatePatch = patch;
        return { eq: async () => ({ error: null }) };
      },
    }),
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateAssignment } from "./assignment-actions";

describe("updateAssignment reviewer rubric", () => {
  beforeEach(() => {
    updatePatch = null;
  });

  it("persists normalized review criteria with the assignment", async () => {
    const result = await updateAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      title: "Readiness check",
      instructions: "Describe your setup.",
      submission_type: "text",
      requires_review: true,
      rubric: [
        {
          criterion: "  Systems readiness ",
          description: " Confirms access to every required system. ",
        },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      rubric: [
        {
          criterion: "Systems readiness",
          description: "Confirms access to every required system.",
        },
      ],
    });
  });

  it("rejects a reviewed assignment without usable criteria", async () => {
    const result = await updateAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      title: "Readiness check",
      instructions: "Describe your setup.",
      submission_type: "text",
      requires_review: true,
      rubric: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "Add at least one rubric criterion for reviewers.",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects malformed rubric payloads instead of throwing", async () => {
    const result = await updateAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      title: "Readiness check",
      instructions: "Describe your setup.",
      submission_type: "text",
      requires_review: true,
      rubric: [{ criterion: null, description: {} }] as never,
    });

    expect(result).toEqual({
      ok: false,
      error: "Every rubric criterion needs a name and review guidance.",
    });
    expect(updatePatch).toBeNull();
  });
});

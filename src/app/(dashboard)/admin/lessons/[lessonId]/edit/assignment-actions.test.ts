import { beforeEach, describe, expect, it, vi } from "vitest";

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const LESSON_ID = "22222222-2222-4222-8222-222222222222";
let lessonResult: unknown;
let updateResult: unknown;
let updatePatch: Record<string, unknown> | null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "lessons") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => lessonResult }),
          }),
        };
      }
      return {
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: () => ({
              select: () => ({ maybeSingle: async () => updateResult }),
            }),
          };
        },
      };
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateAssignment } from "./assignment-actions";

function validInput() {
  return {
    assignmentId: ASSIGNMENT_ID,
    lessonId: LESSON_ID,
    title: "  Readiness check ",
    instructions: " Describe your setup. ",
    submission_type: "text" as const,
    requires_review: true,
    rubric: [
      {
        criterion: "  Systems readiness ",
        description: " Confirms access to every required system. ",
      },
    ],
  };
}

describe("updateAssignment", () => {
  beforeEach(() => {
    lessonResult = {
      data: { lesson_type: "assignment", assignment_id: ASSIGNMENT_ID },
      error: null,
    };
    updateResult = { data: { id: ASSIGNMENT_ID }, error: null };
    updatePatch = null;
  });

  it("proves lesson ownership and persists normalized settings", async () => {
    expect(await updateAssignment(validInput())).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      title: "Readiness check",
      instructions: "Describe your setup.",
      rubric: [
        {
          criterion: "Systems readiness",
          description: "Confirms access to every required system.",
        },
      ],
    });
  });

  it("rejects malformed outer payloads without throwing", async () => {
    expect(await updateAssignment(null)).toEqual({
      ok: false,
      error: "The assignment request is malformed.",
    });
    expect(updatePatch).toBeNull();
  });

  it("rejects a different or non-assignment lesson", async () => {
    lessonResult = { data: { lesson_type: "content", assignment_id: ASSIGNMENT_ID }, error: null };
    expect(await updateAssignment(validInput())).toEqual({
      ok: false,
      error: "This assignment does not belong to the lesson.",
    });
    expect(updatePatch).toBeNull();
  });

  it("does not report success when the update matched no row", async () => {
    updateResult = { data: null, error: null };
    expect(await updateAssignment(validInput())).toEqual({
      ok: false,
      error: "Assignment not found.",
    });
  });

  it("returns a stable error instead of leaking database detail", async () => {
    updateResult = { data: null, error: { message: "sensitive database detail" } };
    expect(await updateAssignment(validInput())).toEqual({
      ok: false,
      error: "Couldn't save the assignment.",
    });
  });
});

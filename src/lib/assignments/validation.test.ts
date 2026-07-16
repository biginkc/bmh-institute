import { describe, expect, it } from "vitest";

import { parseAssignmentUpdateInput } from "./validation";

const base = {
  assignmentId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
  title: "Readiness check",
  instructions: "Describe your setup.",
  submission_type: "text",
  requires_review: true,
  rubric: [{ criterion: "Complete", description: "Answers every prompt." }],
};

describe("parseAssignmentUpdateInput", () => {
  it.each([null, new FormData(), { ...base, submission_type: "script" }, { ...base, requires_review: "yes" }])(
    "rejects malformed action input %#",
    (input) => expect(parseAssignmentUpdateInput(input).ok).toBe(false),
  );

  it("rejects oversized assignment and rubric fields", () => {
    expect(parseAssignmentUpdateInput({ ...base, title: "x".repeat(201) }).ok).toBe(false);
    expect(parseAssignmentUpdateInput({ ...base, instructions: "x".repeat(10_001) }).ok).toBe(false);
    expect(
      parseAssignmentUpdateInput({
        ...base,
        rubric: Array.from({ length: 21 }, () => ({ criterion: "A", description: "B" })),
      }).ok,
    ).toBe(false);
  });
});

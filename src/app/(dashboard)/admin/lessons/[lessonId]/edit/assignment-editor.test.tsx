import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { updateAssignment } from "./assignment-actions";
import { AssignmentEditor } from "./assignment-editor";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./assignment-actions", () => ({
  updateAssignment: vi.fn(async () => ({ ok: true })),
}));

describe("<AssignmentEditor />", () => {
  it("preserves assignment settings and review behavior", async () => {
    const user = userEvent.setup();
    render(
      <AssignmentEditor
        lessonId="lesson-1"
        assignment={{
          id: "assignment-1",
          title: "Record a role play",
          instructions: "Upload your response.",
          submission_type: "file_upload",
          requires_review: true,
          rubric: [
            {
              criterion: "Preparation",
              description: "Includes a complete practice response.",
            },
          ],
        }}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Submission type"), "url");
    await user.clear(screen.getByLabelText("Criterion 1"));
    await user.type(screen.getByLabelText("Criterion 1"), "Call quality");
    await user.click(screen.getByRole("button", { name: "Add criterion" }));
    await user.type(screen.getByLabelText("Criterion 2"), "Follow-up plan");
    await user.type(
      screen.getAllByLabelText("What reviewers check")[1],
      "Names the next action and owner.",
    );
    await user.click(screen.getByRole("button", { name: "Save assignment" }));

    expect(updateAssignment).toHaveBeenCalledWith({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      title: "Record a role play",
      instructions: "Upload your response.",
      submission_type: "url",
      requires_review: true,
      rubric: [
        {
          criterion: "Call quality",
          description: "Includes a complete practice response.",
        },
        {
          criterion: "Follow-up plan",
          description: "Names the next action and owner.",
        },
      ],
    });
  });
});

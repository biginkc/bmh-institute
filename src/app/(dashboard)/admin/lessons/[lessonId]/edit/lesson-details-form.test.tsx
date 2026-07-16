import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { updateLessonDetails } from "./actions";
import { LessonDetailsForm } from "./lesson-details-form";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./actions", () => ({
  updateLessonDetails: vi.fn(async () => ({ ok: true })),
}));

describe("<LessonDetailsForm />", () => {
  it("preserves the lesson details save payload", async () => {
    const user = userEvent.setup();
    render(
      <LessonDetailsForm
        lessonId="lesson-1"
        defaultTitle="Opening the call"
        defaultDescription="Start strong"
        defaultRequired
      />,
    );

    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "  Updated opening  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateLessonDetails).toHaveBeenCalledWith({
      lessonId: "lesson-1",
      title: "Opening the call",
      description: "Updated opening",
      is_required_for_completion: true,
    });
  });
});

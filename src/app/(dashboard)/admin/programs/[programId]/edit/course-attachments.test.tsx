import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  attachCourseToProgram,
  detachCourseFromProgram,
} from "../../actions";
import { CourseAttachments } from "./course-attachments";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../actions", () => ({
  attachCourseToProgram: vi.fn(async () => ({ ok: true })),
  detachCourseFromProgram: vi.fn(async () => ({ ok: true })),
}));

describe("<CourseAttachments />", () => {
  it("keeps numbered order, status, and detach payload unchanged", async () => {
    const user = userEvent.setup();
    render(
      <CourseAttachments
        programId="program-1"
        attached={[
          {
            courseId: "course-1",
            title: "Call foundations",
            isPublished: true,
            sortOrder: 0,
          },
        ]}
        available={[
          { id: "course-2", title: "Follow-up", isPublished: true },
          { id: "course-3", title: "Negotiation", isPublished: false },
        ]}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove call foundations/i }));
    expect(detachCourseFromProgram).toHaveBeenCalledWith({
      programId: "program-1",
      courseId: "course-1",
    });

    await user.selectOptions(screen.getByLabelText("Attach a course"), "course-3");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    expect(attachCourseToProgram).toHaveBeenCalledWith({
      programId: "program-1",
      courseId: "course-3",
    });
  });
});

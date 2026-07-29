import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CourseAttachments } from "./course-attachments";

vi.mock("../../actions", () => ({
  attachCourseToProgram: vi.fn(),
  detachCourseFromProgram: vi.fn(),
  moveProgramCourse: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("CourseAttachments", () => {
  it("renders imported membership without mutation controls", () => {
    render(
      <CourseAttachments
        programId="program-1"
        readOnly
        attached={[{ courseId: "course-1", title: "Imported course", isPublished: false, sortOrder: 0 }]}
        available={[{ id: "course-2", title: "Draft course", isPublished: false }]}
      />,
    );

    expect(screen.getByText(/managed by the release workflow/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /move|remove|attach/i })).not.toBeInTheDocument();
  });
});

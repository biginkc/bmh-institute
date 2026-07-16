import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createLesson,
  createModule,
  moveLesson,
  moveModule,
} from "../../actions";
import { ModulesEditor } from "./modules-editor";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../actions", () => ({
  createLesson: vi.fn(async () => ({ ok: true, id: "lesson-2" })),
  createModule: vi.fn(async () => ({ ok: true, id: "module-2" })),
  deleteLesson: vi.fn(async () => ({ ok: true })),
  deleteModule: vi.fn(async () => ({ ok: true })),
  moveLesson: vi.fn(async () => ({ ok: true })),
  moveModule: vi.fn(async () => ({ ok: true })),
  updateModule: vi.fn(async () => ({ ok: true })),
}));

describe("<ModulesEditor />", () => {
  it("keeps module creation and lesson editing behavior reachable", async () => {
    const user = userEvent.setup();
    render(
      <ModulesEditor
        courseId="course-1"
        modules={[
          {
            id: "module-1",
            title: "The call",
            description: null,
            sort_order: 0,
            lessons: [
              {
                id: "lesson-1",
                title: "Opening the call",
                description: null,
                lesson_type: "content",
                sort_order: 0,
                prerequisite_lesson_id: null,
                quiz_id: null,
                assignment_id: null,
                is_required_for_completion: true,
              },
              {
                id: "lesson-2",
                title: "Qualifying the seller",
                description: null,
                lesson_type: "quiz",
                sort_order: 1,
                prerequisite_lesson_id: null,
                quiz_id: "quiz-1",
                assignment_id: null,
                is_required_for_completion: true,
              },
            ],
          },
          {
            id: "module-2",
            title: "The follow-up",
            description: null,
            sort_order: 1,
            lessons: [],
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /edit opening the call/i })).toHaveAttribute(
      "href",
      "/admin/lessons/lesson-1/edit",
    );
    expect(screen.getAllByRole("button", { name: "Move module up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move lesson up" })[0]).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Move module down" })[0]);
    await waitFor(() =>
      expect(moveModule).toHaveBeenCalledWith({
        moduleId: "module-1",
        courseId: "course-1",
        direction: "down",
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "Move lesson down" })[0]);
    await waitFor(() =>
      expect(moveLesson).toHaveBeenCalledWith({
        lessonId: "lesson-1",
        moduleId: "module-1",
        courseId: "course-1",
        direction: "down",
      }),
    );

    await user.type(screen.getAllByLabelText("Add lesson")[0], "Handle objections");
    await user.selectOptions(screen.getAllByLabelText("Type")[0], "assignment");
    await user.click(screen.getAllByRole("button", { name: "Add lesson" })[0]);
    await waitFor(() =>
      expect(createLesson).toHaveBeenCalledWith({
        moduleId: "module-1",
        courseId: "course-1",
        title: "Handle objections",
        lesson_type: "assignment",
      }),
    );

    await user.type(screen.getByLabelText("Add a module"), "Objections");
    await user.click(screen.getByRole("button", { name: "Add module" }));

    await waitFor(() =>
      expect(createModule).toHaveBeenCalledWith({
        courseId: "course-1",
        title: "Objections",
      }),
    );
  });
});

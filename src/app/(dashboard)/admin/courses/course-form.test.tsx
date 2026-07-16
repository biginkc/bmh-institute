import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CourseForm } from "./course-form";

describe("<CourseForm />", () => {
  it("preserves course field names and edit defaults", () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(
      <CourseForm
        action={action}
        submitLabel="Save changes"
        defaults={{
          title: "Call foundations",
          description: "Learn the opening.",
          is_published: true,
        }}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveAttribute("name", "title");
    expect(screen.getByLabelText("Title")).toHaveValue("Call foundations");
    expect(screen.getByLabelText("Description")).toHaveAttribute(
      "name",
      "description",
    );
    expect(screen.getByLabelText("Published (visible to learners)")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("submits the existing fields and presents action errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (state: unknown, formData: FormData) => {
      void state;
      void formData;
      return {
        ok: false as const,
        error: "Course could not be saved.",
        fieldErrors: { title: "Use a longer title." },
      };
    });
    render(<CourseForm action={action} submitLabel="Create course" />);

    await user.type(screen.getByLabelText("Title"), "Calls");
    await user.type(screen.getByLabelText("Description"), "Core call training");
    await user.click(screen.getByLabelText("Published (visible to learners)"));
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByText("Course could not be saved.")).toBeVisible();
    expect(screen.getByText("Use a longer title.")).toBeVisible();
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("title")).toBe("Calls");
    expect(submitted.get("description")).toBe("Core call training");
    expect(submitted.get("is_published")).toBe("on");
  });
});

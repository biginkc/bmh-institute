import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProgramForm } from "./program-form";

describe("<ProgramForm />", () => {
  it("preserves program field names, order mode, and edit defaults", () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(
      <ProgramForm
        action={action}
        submitLabel="Save changes"
        defaults={{
          title: "Acquisitions onboarding",
          description: "Core training.",
          course_order_mode: "sequential",
          is_published: false,
        }}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveAttribute("name", "title");
    expect(screen.getByLabelText("Course order")).toHaveAttribute(
      "name",
      "course_order_mode",
    );
    expect(screen.getByLabelText("Course order")).toHaveValue("sequential");
    expect(screen.getByLabelText("Published (visible to learners)")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("keeps pending and success feedback around the existing form action", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: { ok: true }) => void = () => undefined;
    const action = vi.fn(
      (state: unknown, formData: FormData) => {
        void state;
        void formData;
        return new Promise<{ ok: true }>((resolve) => {
          resolveAction = resolve;
        });
      },
    );
    render(<ProgramForm action={action} submitLabel="Create program" />);

    await user.type(screen.getByLabelText("Title"), "New starter program");
    await user.selectOptions(screen.getByLabelText("Course order"), "sequential");
    await user.click(screen.getByRole("button", { name: "Create program" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("title")).toBe("New starter program");
    expect(submitted.get("course_order_mode")).toBe("sequential");

    await act(async () => resolveAction({ ok: true }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create program" })).toBeEnabled();
  });
});

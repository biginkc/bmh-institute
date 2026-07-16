import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LessonEditorTabs } from "./lesson-editor-tabs";

describe("<LessonEditorTabs />", () => {
  it("shows all editor tabs while enabling only the lesson type and details", async () => {
    const user = userEvent.setup();
    render(
      <LessonEditorTabs
        lessonType="content"
        editor={<input aria-label="Draft content" defaultValue="Content editor" />}
        details={<div>Details editor</div>}
      />,
    );

    expect(screen.getByRole("tab", { name: "Content blocks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Quiz" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Assignment" })).toBeDisabled();
    const draft = screen.getByLabelText("Draft content");
    expect(draft).toBeVisible();
    await user.clear(draft);
    await user.type(draft, "Unsaved lesson copy");
    expect(screen.getByRole("tab", { name: "Quiz" })).not.toHaveAttribute(
      "aria-controls",
    );
    for (const tab of ["Content blocks", "Details"]) {
      const controlId = screen.getByRole("tab", { name: tab }).getAttribute("aria-controls");
      expect(controlId).not.toBeNull();
      expect(document.getElementById(controlId!)).not.toBeNull();
    }

    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByText("Details editor")).toBeVisible();
    expect(draft).not.toBeVisible();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Content blocks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Draft content")).toHaveValue(
      "Unsaved lesson copy",
    );
  });
});

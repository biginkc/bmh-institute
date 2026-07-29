import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserEditForm } from "./user-edit-form";
import { saveUserSettings } from "./actions";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  saveUserSettings: vi.fn(async () => ({ ok: true, newProgramTitles: [] })),
}));

describe("<UserEditForm />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the checked role groups from the current form state", async () => {
    const user = userEvent.setup();
    render(
      <UserEditForm
        userId="learner-1"
        initialSystemRole="learner"
        initialRoleGroupIds={[]}
        allRoleGroups={[{ id: "group-1", name: "Pilot role group" }]}
        canModifyRole
      />,
    );

    await user.click(screen.getByLabelText("Pilot role group"));
    await user.selectOptions(screen.getByLabelText("System role"), "admin");
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));

    expect(saveUserSettings).toHaveBeenCalledWith({
      userId: "learner-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });
  });

  it("does not expose login lifecycle or account deletion controls", () => {
    render(
      <UserEditForm
        userId="learner-1"
        initialSystemRole="learner"
        initialRoleGroupIds={[]}
        allRoleGroups={[]}
        canModifyRole
      />,
    );

    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete user" })).not.toBeInTheDocument();
  });
});

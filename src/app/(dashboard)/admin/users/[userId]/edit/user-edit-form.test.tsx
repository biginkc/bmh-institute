import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserEditForm } from "./user-edit-form";
import { saveUserSettings } from "./actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  deleteUser: vi.fn(),
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
        initialStatus="active"
        initialRoleGroupIds={[]}
        allRoleGroups={[{ id: "group-1", name: "Pilot role group" }]}
        canModifyRole
        canSuspend
      />,
    );

    await user.click(screen.getByLabelText("Pilot role group"));
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));

    expect(saveUserSettings).toHaveBeenCalledWith({
      userId: "learner-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["group-1"],
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateRoleGroup } from "./actions";
import { RoleGroupsEditor } from "./role-groups-editor";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./actions", () => ({
  createRoleGroup: vi.fn(async () => ({ ok: true })),
  deleteRoleGroup: vi.fn(async () => ({ ok: true })),
  updateRoleGroup: vi.fn(async () => ({ ok: true })),
}));

describe("<RoleGroupsEditor />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves inline editing while using the BMH data table", async () => {
    const user = userEvent.setup();
    render(
      <RoleGroupsEditor
        initial={[
          {
            id: "group-1",
            name: "Acquisitions",
            description: "Acquisitions team",
          },
        ]}
      />,
    );

    const nameInput = screen.getByLabelText("Acquisitions name");
    await user.clear(nameInput);
    await user.type(nameInput, "Acquisitions VAs");
    await user.tab();

    await waitFor(() => {
      expect(updateRoleGroup).toHaveBeenCalledWith({
        id: "group-1",
        name: "Acquisitions VAs",
        description: "Acquisitions team",
      });
    });
    expect(screen.getByRole("columnheader", { name: "Role group" }).style.textTransform).toBe(
      "uppercase",
    );
  });
});

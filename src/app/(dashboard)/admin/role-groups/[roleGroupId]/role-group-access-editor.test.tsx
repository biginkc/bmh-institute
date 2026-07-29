import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RoleGroupAccessEditor } from "./role-group-access-editor";

const { setRoleGroupAccess } = vi.hoisted(() => ({
  setRoleGroupAccess: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("../actions", () => ({ setRoleGroupAccess }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("RoleGroupAccessEditor", () => {
  it("shows direct and inherited course access and saves toggles", async () => {
    const user = userEvent.setup();
    render(
      <RoleGroupAccessEditor
        roleGroupId="group-1"
        protectedGroup={false}
        programs={[{ id: "program-1", title: "Onboarding", isPublished: true, direct: true }]}
        courses={[{ id: "course-1", title: "Opening calls", isPublished: true, direct: false, inherited: true }]}
      />,
    );

    expect(screen.getByText("Inherited from program")).toBeVisible();
    const checkbox = screen.getByRole("checkbox", { name: "Grant courses access: Opening calls" });
    await user.click(checkbox);
    await waitFor(() => expect(setRoleGroupAccess).toHaveBeenCalledWith({
      roleGroupId: "group-1",
      scope: "course",
      targetId: "course-1",
      enabled: true,
    }));
  });

  it("locks every grant for importer-owned groups", () => {
    render(
      <RoleGroupAccessEditor
        roleGroupId="group-1"
        protectedGroup
        programs={[{ id: "program-1", title: "Imported review", isPublished: false, direct: true }]}
        courses={[]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Grant programs access: Imported review" })).toBeDisabled();
  });
});

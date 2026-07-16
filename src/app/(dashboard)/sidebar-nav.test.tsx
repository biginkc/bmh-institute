import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarNav } from "./sidebar-nav";

const pathnameMock = vi.fn(() => "/dashboard");

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

describe("SidebarNav ecosystem shell contract", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/dashboard");
  });

  it("shows learner navigation without admin links for learner users", () => {
    render(<SidebarNav isAdmin={false} pendingSubmissionsCount={7} />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: /certificates/i })).toHaveAttribute(
      "href",
      "/certificates",
    );
    expect(screen.queryByRole("link", { name: /my profile/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /programs/i })).toBeNull();
    expect(screen.queryByText("7")).toBeNull();
  });

  it("shows admin links and pending submissions count for admin users", () => {
    render(<SidebarNav isAdmin pendingSubmissionsCount={7} />);

    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("link", { name: /programs/i })).toHaveAttribute(
      "href",
      "/admin/programs",
    );
    expect(screen.getByRole("link", { name: /submissions/i })).toHaveAttribute(
      "href",
      "/admin/submissions",
    );
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("marks the active route with the blue loop-series treatment", () => {
    pathnameMock.mockReturnValue("/admin/submissions");

    render(<SidebarNav isAdmin pendingSubmissionsCount={1} />);

    const activeLink = screen.getByRole("link", { name: /submissions/i });
    expect(activeLink).toHaveAttribute("data-active", "true");
    expect(activeLink).toHaveClass("bg-[var(--surface-tint)]");
    expect(activeLink).toHaveClass("text-[var(--blue-700)]");
  });

  it("shows the BMH section labels for learner and admin groups", () => {
    render(<SidebarNav isAdmin pendingSubmissionsCount={0} />);

    expect(screen.getByText("Learn")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
  });
});

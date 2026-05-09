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
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /certificates/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /my profile/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /programs/i })).toBeNull();
    expect(screen.queryByText("7")).toBeNull();
  });

  it("shows admin links and pending submissions count for admin users", () => {
    render(<SidebarNav isAdmin pendingSubmissionsCount={7} />);

    expect(screen.getByRole("link", { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /programs/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /submissions/i })).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("marks the active route with the left-border nav pattern", () => {
    pathnameMock.mockReturnValue("/admin/submissions");

    render(<SidebarNav isAdmin pendingSubmissionsCount={1} />);

    const activeLink = screen.getByRole("link", { name: /submissions/i });
    expect(activeLink).toHaveAttribute("data-active", "true");
    expect(activeLink).toHaveClass("border-l-4");
    expect(activeLink).toHaveClass("border-foreground");
    expect(activeLink).not.toHaveClass("bg-primary");
    expect(activeLink).not.toHaveClass("text-primary-foreground");
  });

  it("keeps the sibling app flat primary nav without section labels", () => {
    render(<SidebarNav isAdmin pendingSubmissionsCount={0} />);

    expect(screen.queryByText("Learn")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });
});

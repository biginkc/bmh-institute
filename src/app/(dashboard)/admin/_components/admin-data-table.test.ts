// @vitest-environment jsdom

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AdminDataTable } from "./admin-data-table";

describe("<AdminDataTable />", () => {
  it("uses the BMH table treatment and preserves link and status cells", () => {
    render(
      createElement(AdminDataTable, {
        columns: [
          { key: "name", label: "Learner", presentation: "link", hrefKey: "href" },
          { key: "status", label: "Status", presentation: "badge", toneKey: "tone" },
        ],
        rows: [
          {
            id: "learner-1",
            name: "Sofia Ruiz",
            href: "/admin/reports/users/learner-1",
            status: "On track",
            tone: "green",
          },
        ],
      }),
    );

    const learnerHeader = screen.getByRole("columnheader", { name: "Learner" });
    expect(learnerHeader.style.textTransform).toBe("uppercase");
    expect(screen.getByRole("link", { name: "Sofia Ruiz" }).getAttribute("href")).toBe(
      "/admin/reports/users/learner-1",
    );
    expect(screen.getByText("On track").style.borderRadius).toBe(
      "var(--radius-pill)",
    );
  });

  it("renders a calm empty row through the design-system table", () => {
    render(
      createElement(AdminDataTable, {
        columns: [{ key: "name", label: "Learner" }],
        rows: [],
        empty: "No learners yet.",
      }),
    );

    expect(screen.getByText("No learners yet.")).toBeTruthy();
  });
});

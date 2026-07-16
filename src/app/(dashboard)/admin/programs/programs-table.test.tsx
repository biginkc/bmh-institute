import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgramsTable } from "./programs-table";

describe("<ProgramsTable />", () => {
  it("keeps order mode, course count, status, and edit navigation reachable", () => {
    render(
      <ProgramsTable
        programs={[
          {
            id: "program-1",
            title: "Acquisitions onboarding",
            course_order_mode: "sequential",
            is_published: false,
            courseCount: 3,
          },
        ]}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Sequential")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /edit acquisitions onboarding/i }),
    ).toHaveAttribute("href", "/admin/programs/program-1/edit");
  });
});

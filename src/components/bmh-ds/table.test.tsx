import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Table } from "./table";

describe("<Table />", () => {
  it("preserves row semantics and exposes a native keyboard control", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table
        columns={[{ key: "name", label: "Name" }]}
        rows={[{ id: 1, name: "Sofia Ruiz" }]}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByRole("row", { name: /Sofia Ruiz/ });
    expect(row.tagName).toBe("TR");

    const openButton = screen.getByRole("button", { name: "Open Sofia Ruiz" });
    await user.tab();
    expect(openButton).toHaveFocus();
    expect(openButton).toHaveStyle({ outline: "2px solid var(--action)" });

    await user.click(openButton);
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: "Sofia Ruiz" });

    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table } from "./table";

describe("<Table />", () => {
  it("preserves row semantics and activates clickable rows from the keyboard", () => {
    const onRowClick = vi.fn();
    render(
      <Table
        columns={[{ key: "name", label: "Name" }]}
        rows={[{ id: 1, name: "Sofia Ruiz" }]}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByRole("row", { name: "Sofia Ruiz" });
    expect(row.tagName).toBe("TR");

    fireEvent.keyDown(row, {
      key: "Enter",
    });
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: "Sofia Ruiz" });

    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});

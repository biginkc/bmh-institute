import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table } from "./table";

describe("<Table />", () => {
  it("activates clickable rows from the keyboard", () => {
    const onRowClick = vi.fn();
    render(
      <Table
        columns={[{ key: "name", label: "Name" }]}
        rows={[{ id: 1, name: "Sofia Ruiz" }]}
        onRowClick={onRowClick}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Sofia Ruiz" }), {
      key: "Enter",
    });
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: "Sofia Ruiz" });
  });
});

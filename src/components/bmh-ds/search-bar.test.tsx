import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SearchBar } from "./search-bar";

describe("<SearchBar />", () => {
  it("uses its placeholder as an accessible name", () => {
    render(<SearchBar placeholder="Search lessons" />);

    expect(screen.getByRole("textbox", { name: "Search lessons" })).toBeInTheDocument();
  });
});

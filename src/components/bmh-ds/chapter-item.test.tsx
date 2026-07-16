import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChapterItem } from "./chapter-item";

describe("<ChapterItem />", () => {
  it("uses native disabled semantics while locked", () => {
    render(<ChapterItem index={5} title="Complex Objections" status="locked" />);

    expect(screen.getByRole("button", { name: /complex objections/i })).toBeDisabled();
  });
});

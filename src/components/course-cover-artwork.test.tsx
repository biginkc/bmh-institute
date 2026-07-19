import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CourseCoverArtwork } from "./course-cover-artwork";

describe("<CourseCoverArtwork />", () => {
  it("renders a signed private cover with meaningful alternative text", () => {
    const { container } = render(
      <CourseCoverArtwork
        imageUrl="https://storage.example.test/signed-cover.webp"
        alt="BMH Employee Training course cover"
      />,
    );

    expect(screen.getByRole("img", { name: "BMH Employee Training course cover" })).toHaveAttribute(
      "src",
      "https://storage.example.test/signed-cover.webp",
    );
    expect(container.firstChild).toHaveAttribute("data-course-cover-state", "signed");
  });

  it("renders a stable branded fallback when signing fails or no cover exists", () => {
    const { container } = render(
      <CourseCoverArtwork alt="BMH Employee Training course cover" />,
    );

    expect(
      screen.getByRole("img", { name: "BMH Employee Training course cover placeholder" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BMH Institute")).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("data-course-cover-state", "fallback");
  });
});

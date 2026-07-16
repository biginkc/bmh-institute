import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FlashcardBlock } from "./flashcard-block";

describe("FlashcardBlock", () => {
  it("supports reveal and keyboard navigation with progress", async () => {
    const user = userEvent.setup();
    render(
      <FlashcardBlock
        cards={[
          { front: "Front one", back: "Back one" },
          { front: "Front two", back: "Back two" },
        ]}
      />,
    );

    expect(screen.getByText("Card 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByText("Back one")).toBeVisible();
    screen.getByRole("region", { name: "Lesson flashcards" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Front two")).toBeVisible();
    expect(screen.getByText("Card 2 of 2")).toBeVisible();
  });

  it("renders a clear empty state", () => {
    render(<FlashcardBlock cards={[]} />);
    expect(screen.getByText("No flashcards have been added yet.")).toBeVisible();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { createBlock, deleteBlock, moveBlock, updateBlock } from "./actions";
import { BlocksEditor } from "./blocks-editor";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./actions", () => ({
  createBlock: vi.fn(async () => ({ ok: true })),
  deleteBlock: vi.fn(async () => ({ ok: true })),
  moveBlock: vi.fn(async () => ({ ok: true })),
  updateBlock: vi.fn(async () => ({ ok: true })),
}));

const paletteLabels = [
  "Text",
  "Video",
  "Image",
  "PDF",
  "Audio",
  "Download",
  "Callout",
  "External link",
  "Embed (iframe)",
  "Role play",
  "Divider",
];

describe("<BlocksEditor />", () => {
  it("renders the complete 11-type palette and preserves block creation payloads", async () => {
    const user = userEvent.setup();
    render(<BlocksEditor lessonId="lesson-1" initialBlocks={[]} />);

    expect(screen.getByRole("heading", { name: "Add a block" })).toBeInTheDocument();
    for (const label of paletteLabels) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Role play" }));
    expect(createBlock).toHaveBeenCalledWith({
      lessonId: "lesson-1",
      block_type: "role_play",
    });

    vi.mocked(createBlock).mockResolvedValueOnce({
      ok: false,
      error: "Block could not be added.",
    });
    await user.click(screen.getByRole("button", { name: "Divider" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Block could not be added."),
    );
  });

  it("preserves block reorder, save, and delete payloads", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(
      <BlocksEditor
        lessonId="lesson-1"
        initialBlocks={[
          {
            id: "block-1",
            block_type: "text",
            content: { html: "<p>Opening</p>" },
            sort_order: 0,
            is_required_for_completion: false,
          },
          {
            id: "block-2",
            block_type: "divider",
            content: {},
            sort_order: 1,
            is_required_for_completion: false,
          },
        ]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Move block down" })[0]);
    await waitFor(() =>
      expect(moveBlock).toHaveBeenCalledWith({
        blockId: "block-1",
        lessonId: "lesson-1",
        direction: "down",
      }),
    );

    await user.clear(screen.getByLabelText("HTML"));
    await user.type(screen.getByLabelText("HTML"), "<p>Updated</p>");
    await user.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() =>
      expect(updateBlock).toHaveBeenCalledWith({
        blockId: "block-1",
        lessonId: "lesson-1",
        content: { html: "<p>Updated</p>" },
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "Delete block" })[0]);
    await waitFor(() =>
      expect(deleteBlock).toHaveBeenCalledWith({
        blockId: "block-1",
        lessonId: "lesson-1",
      }),
    );
    confirm.mockRestore();
  });
});

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const completeRolePlayBlock = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  completeRolePlayBlock: (...args: unknown[]) => completeRolePlayBlock(...args),
}));

import { RolePlayBlock } from "./role-play-block";

describe("<RolePlayBlock /> completion messages", () => {
  beforeEach(() => {
    refresh.mockReset();
    completeRolePlayBlock.mockReset();
    completeRolePlayBlock.mockResolvedValue({ ok: true, alreadyMarked: false });
  });

  it("accepts completion only from the rendered Closer Lab iframe window", async () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
      initialHeightPx={720}
        initialComplete={false}
      />,
    );
    const iframe = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    const data = {
      type: "rp.complete",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 100,
      summary_url: "https://evil.example/forged",
      completion_token: "signed-proof",
    };

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: "https://lab.example.com",
          source: window,
        }),
      );
    });
    expect(completeRolePlayBlock).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: "https://lab.example.com",
          source: iframe.contentWindow,
        }),
      );
    });

    await waitFor(() => {
      expect(completeRolePlayBlock).toHaveBeenCalledWith({
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: "attempt-1",
        completionToken: "signed-proof",
      });
    });
    expect(screen.getByText("Complete")).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders persisted completion immediately after reload", () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        initialHeightPx={720}
        initialComplete
      />,
    );

    expect(screen.getByText("Complete")).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });
});

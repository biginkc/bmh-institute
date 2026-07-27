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
        launchCredential="launch-credential-1"
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
    expect(screen.getByRole("status")).toHaveTextContent("Completed");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders persisted completion immediately after reload", () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
      />,
    );

    expect(screen.getByText("Complete")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Completed");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("<RolePlayBlock /> rp.launch handshake", () => {
  const IFRAME_SRC =
    "https://lab.example.com/embed/role-play/scenario-1?token=secret";
  const CL_ORIGIN = "https://lab.example.com";

  function renderBlock(launchCredential = "launch-credential-1") {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc={IFRAME_SRC}
        launchCredential={launchCredential}
        initialHeightPx={720}
        initialComplete={false}
      />,
    );
    const postMessage = vi.fn();
    // The unconfigured branch renders no iframe at all, which is itself the
    // assertion in that case.
    const iframe = screen.queryByTitle("Opening practice") as
      | HTMLIFrameElement
      | null;
    if (iframe) {
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: { postMessage },
      });
    }
    return { iframe: iframe as HTMLIFrameElement, postMessage };
  }

  function dispatchReady(iframe: HTMLIFrameElement, overrides = {}) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "rp.ready", scenario_id: "scenario-1" },
          origin: CL_ORIGIN,
          source: iframe.contentWindow,
          ...overrides,
        }),
      );
    });
  }

  it("answers rp.ready with the signed credential at the exact Closer Lab origin", () => {
    const { iframe, postMessage } = renderBlock();
    dispatchReady(iframe);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "rp.launch",
        scenario_id: "scenario-1",
        credential: "launch-credential-1",
      },
      CL_ORIGIN,
    );
  });

  it("never uses a wildcard targetOrigin", () => {
    const { iframe, postMessage } = renderBlock();
    dispatchReady(iframe);
    // The credential is a bearer capability; "*" would leak it to any page
    // that navigated the frame.
    expect(postMessage.mock.calls[0][1]).toBe(CL_ORIGIN);
    expect(postMessage.mock.calls[0][1]).not.toBe("*");
  });

  it("re-answers every rp.ready retry with the identical credential", () => {
    const { iframe, postMessage } = renderBlock();
    dispatchReady(iframe);
    dispatchReady(iframe);
    dispatchReady(iframe);

    expect(postMessage).toHaveBeenCalledTimes(3);
    const credentials = postMessage.mock.calls.map(
      (call) => (call[0] as { credential: string }).credential,
    );
    expect(credentials).toEqual([
      "launch-credential-1",
      "launch-credential-1",
      "launch-credential-1",
    ]);
  });

  it("ignores rp.ready from an untrusted origin", () => {
    const { iframe, postMessage } = renderBlock();
    dispatchReady(iframe, { origin: "https://evil.example" });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ignores rp.ready that did not come from the iframe window", () => {
    const { iframe, postMessage } = renderBlock();
    dispatchReady(iframe, { source: window });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("renders unconfigured and never posts when the credential is missing", () => {
    const { postMessage } = renderBlock("");
    expect(screen.getByText("Role play not configured.")).toBeVisible();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("still flips the status to Ready on rp.ready", () => {
    const { iframe } = renderBlock();
    expect(screen.getByRole("status")).toHaveTextContent("Loading role play");
    dispatchReady(iframe);
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
  });

  it("delegates the microphone and keeps allow-same-origin", () => {
    renderBlock();
    const iframe = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    expect(iframe.getAttribute("allow")).toContain("microphone");
    // getUserMedia is refused in a sandboxed frame without allow-same-origin.
    expect(iframe.getAttribute("sandbox")).toContain("allow-same-origin");
  });
});

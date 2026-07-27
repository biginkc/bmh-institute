import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeRolePlayBlock = vi.fn();
const refreshRolePlayEmbed = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  completeRolePlayBlock: (...args: unknown[]) => completeRolePlayBlock(...args),
  refreshRolePlayEmbed: (...args: unknown[]) => refreshRolePlayEmbed(...args),
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
        mintedAtMs={Date.now()}
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
        mintedAtMs={Date.now()}
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

  function renderBlock(
    launchCredential = "launch-credential-1",
    mintedAtMs = Date.now(),
  ) {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc={IFRAME_SRC}
        launchCredential={launchCredential}
        mintedAtMs={mintedAtMs}
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

describe("<RolePlayBlock /> credential refresh and readiness", () => {
  const IFRAME_SRC =
    "https://lab.example.com/embed/role-play/scenario-1?token=secret";
  const REFRESHED_SRC =
    "https://lab.example.com/embed/role-play/scenario-1?token=secret2";
  const CL_ORIGIN = "https://lab.example.com";
  const STALE = 4 * 60 * 1000;

  function renderStale(mintedAgoMs = STALE) {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc={IFRAME_SRC}
        launchCredential="cred-old"
        mintedAtMs={Date.now() - mintedAgoMs}
        initialHeightPx={720}
        initialComplete={false}
      />,
    );
    const iframe = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });
    return { iframe, postMessage };
  }

  function send(iframe: HTMLIFrameElement, data: Record<string, unknown>) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: CL_ORIGIN,
          source: iframe.contentWindow,
        }),
      );
    });
  }

  beforeEach(() => {
    // Scoped to this block: the suites above rely on real timers via waitFor.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    refreshRolePlayEmbed.mockReset();
    refreshRolePlayEmbed.mockResolvedValue({
      ok: true,
      iframeSrc: REFRESHED_SRC,
      launchCredential: "cred-new",
      mintedAtMs: Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-mints a stale credential and hands the fresh one to the iframe", async () => {
    const { iframe } = renderStale();
    expect(iframe.getAttribute("src")).toBe(IFRAME_SRC);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(refreshRolePlayEmbed).toHaveBeenCalledWith({
      blockId: "block-1",
      scenarioId: "scenario-1",
    });

    const reloaded = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    expect(reloaded.getAttribute("src")).toBe(REFRESHED_SRC);

    // The reloaded frame announces itself; it must receive the NEW credential.
    const postMessage = vi.fn();
    Object.defineProperty(reloaded, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });
    send(reloaded, { type: "rp.ready", scenario_id: "scenario-1" });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ credential: "cred-new" }),
      CL_ORIGIN,
    );
  });

  it("does not re-mint while a credential is still fresh", async () => {
    renderStale(10_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(refreshRolePlayEmbed).not.toHaveBeenCalled();
  });

  it("stops re-minting once rp.started arrives, so a live session is never torn down", async () => {
    const { iframe } = renderStale();
    send(iframe, { type: "rp.started", scenario_id: "scenario-1" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(refreshRolePlayEmbed).not.toHaveBeenCalled();
    expect(iframe.getAttribute("src")).toBe(IFRAME_SRC);
    expect(screen.getByRole("status")).toHaveTextContent("In progress");
  });

  it("ignores rp.started from an untrusted source", async () => {
    const { iframe } = renderStale();
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "rp.started", scenario_id: "scenario-1" },
          origin: "https://evil.example",
          source: iframe.contentWindow,
        }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    // Untrusted rp.started must not be able to suppress the refresh.
    expect(refreshRolePlayEmbed).toHaveBeenCalled();
  });

  it("surfaces an actionable error when the iframe never becomes ready", async () => {
    renderStale(0);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(/didn't load/i);
    expect(alert).toHaveTextContent("scenario-1");
  });

  it("does not show the readiness error once the iframe is ready", async () => {
    const { iframe } = renderStale(0);
    send(iframe, { type: "rp.ready", scenario_id: "scenario-1" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
  });

  it("keeps the old credential when a refresh fails rather than breaking the frame", async () => {
    refreshRolePlayEmbed.mockResolvedValue({ ok: false, error: "nope" });
    const { iframe } = renderStale();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(refreshRolePlayEmbed).toHaveBeenCalled();
    expect(iframe.getAttribute("src")).toBe(IFRAME_SRC);
  });
});

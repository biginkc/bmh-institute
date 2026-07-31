import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RolePlayLatestResult } from "@/lib/content-security/validate";

const completeRolePlayBlock = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/(dashboard)/lessons/[lessonId]/actions", () => ({
  completeRolePlayBlock: (...args: unknown[]) => completeRolePlayBlock(...args),
}));

import { RolePlayBlock } from "./role-play-block";

const READY_RESULT: RolePlayLatestResult = {
  score: 85,
  goalsMetCount: 3,
  goalsTotalCount: 4,
  summaryUrl: "https://lab.bmhgroupkc.com/embed/review/token-abc",
  completedAt: "2026-07-30T12:00:00.000Z",
};

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

  it("falls back to the practice iframe when marked complete but no result row exists", () => {
    // A completed block with a *successful* query that returned zero rows
    // is the legacy/edge gap (see fetchLatestRolePlayResults in page.tsx) —
    // it must never render a broken/empty score card, so it falls back to
    // the pre-existing "Complete" badge + iframe view instead. This is
    // distinct from resultFetchFailed below: here the query itself worked.
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
        latestResult={null}
        resultFetchFailed={false}
      />,
    );

    expect(screen.getByText("Complete")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Completed");
    expect(screen.getByTitle("Opening practice")).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows an explicit error state, never the practice iframe, when the results query itself failed", () => {
    // A failed `role_play_results` read must NOT be indistinguishable from
    // "no prior attempt" — that would silently hide a live read failure
    // behind the legacy-gap fallback. resultFetchFailed is a signal
    // separate from latestResult specifically so this case can't collapse
    // into the "no row" branch above.
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
        latestResult={null}
        resultFetchFailed
      />,
    );

    expect(screen.queryByTitle("Opening practice")).toBeNull();
    expect(
      screen.getByText(/couldn't load a score for your last attempt/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });
});

describe("<RolePlayBlock /> return-visit score view", () => {
  it("shows the most recent score by default instead of the iframe", () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
        latestResult={READY_RESULT}
      />,
    );

    expect(screen.getByText("Score: 85%")).toBeVisible();
    expect(screen.getByText("3 of 4 objectives met")).toBeVisible();
    expect(screen.queryByTitle("Opening practice")).toBeNull();
    expect(screen.getByRole("link", { name: /view full review/i })).toHaveAttribute(
      "href",
      READY_RESULT.summaryUrl,
    );
  });

  it("shows a fresh, unattempted exercise as the interactive iframe, not a score view", () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete={false}
        latestResult={null}
      />,
    );

    expect(screen.getByTitle("Opening practice")).toBeVisible();
    expect(screen.queryByText(/score:/i)).toBeNull();
  });

  it("shows an explicit unavailable message instead of a blank/stuck card when the score is missing", () => {
    // score_status pending/failed on Closer Lab's side never produces a
    // role_play_results row (see recon), but the DB column itself is
    // nullable, so this defends the one shape that COULD reach the client:
    // a persisted row whose score somehow came back null.
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
        latestResult={{ ...READY_RESULT, score: null }}
      />,
    );

    expect(screen.queryByTitle("Opening practice")).toBeNull();
    expect(screen.queryByText(/score:/i)).toBeNull();
    expect(
      screen.getByText(/couldn't load a score for your last attempt/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("try again switches to the practice iframe without touching the prior attempt", async () => {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc="https://lab.example.com/embed/role-play/scenario-1?token=secret"
        launchCredential="launch-credential-1"
        initialHeightPx={720}
        initialComplete
        latestResult={READY_RESULT}
      />,
    );

    expect(screen.getByText("Score: 85%")).toBeVisible();
    await act(async () => {
      screen.getByRole("button", { name: /try again/i }).click();
    });

    expect(screen.queryByText("Score: 85%")).toBeNull();
    expect(screen.getByTitle("Opening practice")).toBeVisible();
    // "Try again" is purely a client-side view switch — it never calls the
    // completion action, so the previous attempt's row is never touched.
    expect(completeRolePlayBlock).not.toHaveBeenCalled();
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

  it("delegates microphone AND autoplay, and keeps allow-same-origin", () => {
    renderBlock();
    const iframe = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    const allow = iframe.getAttribute("allow") ?? "";
    expect(allow).toContain("microphone");
    // Without autoplay the agent joins and then dies with
    // browser_persona_audio_unavailable: a cross-origin child cannot resume an
    // AudioContext or play the persona track. Observed in production.
    expect(allow).toContain("autoplay");
    // getUserMedia is refused in a sandboxed frame without allow-same-origin.
    expect(iframe.getAttribute("sandbox")).toContain("allow-same-origin");
  });

  /**
   * Regression guard for the "Talk with Andrea" camera fix.
   *
   * The Permissions-Policy response header (next.config.ts) is only HALF of
   * the delegation model: it grants camera=(self "https://lab.bmhgroupkc.com")
   * at the top-level document, but a cross-origin child iframe only receives
   * that grant if the iframe's own `allow` attribute also names the feature.
   * A header-only test (headers.test.ts) cannot catch a missing `allow`
   * attribute — it never renders a component. This test would have failed
   * on the original PR #159, which fixed the header but left the iframe's
   * `allow="microphone; autoplay; clipboard-write"` unchanged.
   */
  it("delegates camera to the Closer Lab iframe origin", () => {
    renderBlock();
    const iframe = screen.getByTitle("Opening practice") as HTMLIFrameElement;
    const allow = iframe.getAttribute("allow") ?? "";

    // Capture the `camera` token AND anything else up to the next `;` or end
    // of string. `allow="camera https://evil.example; microphone; autoplay"`
    // would satisfy a bare `.toContain("camera")` check while delegating to
    // the wrong origin — so require the directive to carry NO explicit
    // origin list. Bare `camera` resolves to the default 'src' allowlist,
    // which is exactly the iframe's own src origin, asserted below.
    const cameraDirective = allow.match(/(^|;\s*)camera([^;]*)(?=;|$)/);
    expect(cameraDirective).not.toBeNull();
    expect(cameraDirective?.[2].trim()).toBe("");

    expect(new URL(iframe.src).origin).toBe(CL_ORIGIN);
  });
});

describe("<RolePlayBlock /> readiness and session state", () => {
  const IFRAME_SRC =
    "https://lab.example.com/embed/role-play/scenario-1?token=secret";
  const CL_ORIGIN = "https://lab.example.com";

  function renderBlock() {
    render(
      <RolePlayBlock
        blockId="block-1"
        scenarioId="scenario-1"
        title="Opening practice"
        iframeSrc={IFRAME_SRC}
        launchCredential="cred-1"
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start the readiness clock until the iframe has loaded", async () => {
    renderBlock();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    // No load event yet, so no failure can be asserted.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("waits longer than Closer Lab's own 30s retry window before failing", async () => {
    const { iframe } = renderBlock();
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    // Closer Lab is still legitimately retrying rp.ready at this point.
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/didn't load/i);
    expect(alert).toHaveTextContent("scenario-1");
  });

  it("never reports a failure once the iframe is ready", async () => {
    const { iframe } = renderBlock();
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    send(iframe, { type: "rp.ready", scenario_id: "scenario-1" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
  });

  it("reports In progress once Closer Lab says the session started", () => {
    const { iframe } = renderBlock();
    send(iframe, { type: "rp.started", scenario_id: "scenario-1" });
    expect(screen.getByRole("status")).toHaveTextContent("In progress");
  });

  it("ignores rp.started from an untrusted origin", () => {
    const { iframe } = renderBlock();
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "rp.started", scenario_id: "scenario-1" },
          origin: "https://evil.example",
          source: iframe.contentWindow,
        }),
      );
    });
    expect(screen.getByRole("status")).not.toHaveTextContent("In progress");
  });
});

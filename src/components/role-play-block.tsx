"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { completeRolePlayBlock } from "@/app/(dashboard)/lessons/[lessonId]/actions";
import {
  clampRolePlayHeight,
  getTrustedOrigin,
  isTrustedRolePlayMessage,
  parseRolePlayEvent,
} from "@/lib/role-plays/embed-events";
import type { RolePlayLatestResult } from "@/lib/content-security/validate";
import { cn } from "@/lib/utils";
import { RolePlayScoreCard } from "./role-play-score-card";

/**
 * If the iframe has not announced itself this long after LOADING, something
 * upstream is wrong (Closer Lab down, CSP, network). Must exceed Closer Lab's
 * own 30s rp.ready retry window, or a healthy slow handshake gets reported as
 * a failure while its supported recovery is still running.
 */
const READY_TIMEOUT_MS = 45 * 1000;

type RolePlayBlockProps = {
  blockId: string;
  scenarioId: string;
  title: string;
  iframeSrc: string;
  launchCredential: string;
  initialHeightPx: number;
  initialComplete: boolean;
  /**
   * Most recent `role_play_results` row for this learner+block, or null when
   * there isn't one (fresh exercise, or — per production data, currently
   * unreachable but defended anyway — a completed block with no matching
   * row, see `mode` below).
   */
  latestResult?: RolePlayLatestResult | null;
  /**
   * True when the server's `role_play_results` read for this lesson failed
   * (a query error, not zero rows). Distinct from `latestResult === null`:
   * this means "we don't know the score, and it's not safe to assume there
   * isn't one" and must render the same explicit "couldn't load a score"
   * state as a persisted null score — never silently fall back to the
   * iframe as if this were the legacy gap.
   */
  resultFetchFailed?: boolean;
};

export function RolePlayBlock({
  blockId,
  scenarioId,
  title,
  iframeSrc,
  launchCredential,
  initialHeightPx,
  initialComplete,
  latestResult = null,
  resultFetchFailed = false,
}: RolePlayBlockProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(initialComplete);
  const [error, setError] = useState<string | null>(null);
  const [heightPx, setHeightPx] = useState(clampRolePlayHeight(initialHeightPx));
  const [pending, startTransition] = useTransition();
  // Computed once from the props this instance mounted with. A returning
  // learner (fresh page load) gets the score view by default; "Try again"
  // flips this to "practice" for the rest of this component's lifetime. A
  // completion that happens live in THIS session keeps showing the iframe's
  // own in-progress/complete state rather than snapping to a score view with
  // stale (pre-attempt) data — the score view only applies on the return
  // visit, once the server has the new attempt's result.
  const [mode, setMode] = useState<"score" | "practice">(
    initialComplete && (latestResult || resultFetchFailed) ? "score" : "practice",
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const completedRef = useRef(initialComplete);
  const readyRef = useRef(false);
  const startedRef = useRef(false);
  const trustedOrigin = useMemo(() => getTrustedOrigin(iframeSrc), [iframeSrc]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!trustedOrigin) return;
    // Narrowed once here; the nested handler closes over this non-null copy.
    const targetOrigin = trustedOrigin;

    function onMessage(event: MessageEvent) {
      const data = parseRolePlayEvent(event.data);
      if (!data) return;
      if (
        !isTrustedRolePlayMessage({
          eventOrigin: event.origin,
          trustedOrigin,
          eventSource: event.source,
          trustedSource: iframeRef.current?.contentWindow ?? null,
          expectedScenarioId: scenarioId,
          event: data,
        })
      ) {
        return;
      }

      if (data.type === "rp.ready") {
        setReady(true);
        readyRef.current = true;
        setError(null);
        // Answer EVERY rp.ready, not just the first. Closer Lab re-posts every
        // 500ms for 30s and keeps the first credential it receives, so replying
        // each time makes the handshake self-healing against a dropped message
        // without minting anything extra — the credential is minted once per
        // render. Never use "*" here: this is a bearer capability.
        const target = iframeRef.current?.contentWindow;
        if (target && launchCredential) {
          target.postMessage(
            {
              type: "rp.launch",
              scenario_id: scenarioId,
              credential: launchCredential,
            },
            targetOrigin,
          );
        }
      } else if (data.type === "rp.started") {
        // A session is live. Stop re-minting: swapping the iframe src now would
        // tear the learner's role play down mid-run.
        startedRef.current = true;
        setStarted(true);
      } else if (data.type === "rp.height") {
        setHeightPx(clampRolePlayHeight(data.height_px));
      } else if (data.type === "rp.error") {
        setError(data.message || "Role play failed. Please try again.");
      } else if (data.type === "rp.complete") {
        startTransition(async () => {
          const result = await completeRolePlayBlock({
            blockId,
            scenarioId,
            attemptId: data.attempt_id,
            completionToken: data.completion_token,
          });
          if (result.ok) {
            setComplete(true);
            setError(null);
            if (!completedRef.current) {
              completedRef.current = true;
              router.refresh();
            }
          } else {
            setError(result.error);
          }
        });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [blockId, launchCredential, router, scenarioId, trustedOrigin]);

  useEffect(() => {
    if (!loaded || ready || complete) return;
    // Anchored to iframe load, not mount, and deliberately longer than Closer
    // Lab's own 30s rp.ready retry window so a slow-but-healthy handshake is
    // never reported as a failure. Paused while the tab is hidden.
    const timer = setTimeout(() => {
      if (readyRef.current || document.hidden) return;
      setError(
        `The practice didn't load. Reload the page, and if it keeps happening tell your admin (scenario ${scenarioId}).`,
      );
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [complete, loaded, ready, scenarioId]);

  // The default view for a returning learner on an already-completed
  // exercise: their most recent score, not another live iframe. Doesn't need
  // iframe config to render, so this is checked before the config guard.
  if (mode === "score" && (latestResult || resultFetchFailed)) {
    return (
      <RolePlayScoreCard
        title={title || "Role play"}
        result={latestResult}
        onTryAgain={() => setMode("practice")}
      />
    );
  }

  // Without a credential the child would spin on "Waiting for BMH Institute…"
  // forever, so a mint failure must surface as unconfigured instead.
  if (!iframeSrc || !trustedOrigin || !launchCredential) {
    return (
      <div className="rounded-[var(--bmh-radius-md)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-050)] p-6 text-center font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
        Role play not configured.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[var(--bmh-radius-lg)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--bmh-shadow-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-tint)] px-5 py-4 font-[family-name:var(--font-body)]">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
            {title || "Role play"}
          </h2>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-0.5 text-xs font-bold text-[var(--text-muted)]"
          >
            {complete
              ? "Completed"
              : started
                ? "In progress"
                : ready
                  ? "Ready"
                  : "Loading role play"}
          </p>
        </div>
        {complete ? (
          <div className="flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-extrabold text-[var(--success)]">
            <CheckCircle2 className="size-4" />
            Complete
          </div>
        ) : null}
      </div>
      {/*
        `autoplay` is load-bearing, not cosmetic. The autoplay policy's default
        allowlist is 'self', so a cross-origin child cannot resume an
        AudioContext or play the persona's audio track without this delegation
        — even after the learner clicks Start inside the frame. Without it the
        agent joins, listens, then dies with browser_persona_audio_unavailable.
        Observed in production 2026-07-27.

        `camera` is the other required half of the permissions-policy model.
        The response header (next.config.ts) grants camera=(self "https://
        lab.bmhgroupkc.com"), but a header alone does nothing — the browser
        also requires the embedding iframe's own `allow` attribute to
        delegate the feature down to the child, or getUserMedia() is refused
        inside the frame regardless of what the header says. Neither half
        substitutes for the other.
      */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        onLoad={() => setLoaded(true)}
        title={title || "Role play"}
        allow="camera; microphone; autoplay; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms"
        className={cn("w-full", pending && "opacity-80")}
        style={{ height: `${heightPx}px` }}
      />
      {error ? (
        <p role="alert" className="border-t border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

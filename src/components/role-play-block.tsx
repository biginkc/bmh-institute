"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  completeRolePlayBlock,
  refreshRolePlayEmbed,
} from "@/app/(dashboard)/lessons/[lessonId]/actions";
import {
  clampRolePlayHeight,
  getTrustedOrigin,
  isTrustedRolePlayMessage,
  parseRolePlayEvent,
} from "@/lib/role-plays/embed-events";
import { cn } from "@/lib/utils";

/**
 * Credentials are minted with a hard 300s TTL. Re-mint once they pass this age
 * so clicking Start is never the moment we discover they expired. Comfortably
 * inside 300s, and far enough above the 30s poll to avoid churn.
 */
const CREDENTIAL_STALE_MS = 3.5 * 60 * 1000;
const CREDENTIAL_POLL_MS = 30 * 1000;

/**
 * If the iframe has not announced itself by now, something upstream is wrong
 * (Closer Lab down, CSP, network). Say so instead of showing a blank box
 * forever.
 */
const READY_TIMEOUT_MS = 20 * 1000;

type RolePlayBlockProps = {
  blockId: string;
  scenarioId: string;
  title: string;
  iframeSrc: string;
  launchCredential: string;
  mintedAtMs: number;
  initialHeightPx: number;
  initialComplete: boolean;
};

export function RolePlayBlock({
  blockId,
  scenarioId,
  title,
  iframeSrc: initialIframeSrc,
  launchCredential: initialLaunchCredential,
  mintedAtMs: initialMintedAtMs,
  initialHeightPx,
  initialComplete,
}: RolePlayBlockProps) {
  const router = useRouter();
  const [iframeSrc, setIframeSrc] = useState(initialIframeSrc);
  const [launchCredential, setLaunchCredential] = useState(
    initialLaunchCredential,
  );
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(initialComplete);
  const [error, setError] = useState<string | null>(null);
  const [heightPx, setHeightPx] = useState(clampRolePlayHeight(initialHeightPx));
  const [pending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const completedRef = useRef(initialComplete);
  const readyRef = useRef(false);
  const startedRef = useRef(false);
  const refreshingRef = useRef(false);
  // 0 or absent means "age unknown" — treated as stale below, so an older
  // cached block without this field simply re-mints once.
  const mintedAtRef = useRef(initialMintedAtMs);
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

  const refreshIfStale = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (startedRef.current || completedRef.current) return;
    if (refreshingRef.current) return;
    const mintedAt = mintedAtRef.current;
    const ageIsKnown = Number.isFinite(mintedAt) && mintedAt > 0;
    if (ageIsKnown && Date.now() - mintedAt < CREDENTIAL_STALE_MS) return;

    refreshingRef.current = true;
    try {
      const result = await refreshRolePlayEmbed({ blockId, scenarioId });
      // Re-check: the learner may have started while the request was in flight.
      if (startedRef.current || completedRef.current) return;
      if (result.ok) {
        mintedAtRef.current = result.mintedAtMs;
        setLaunchCredential(result.launchCredential);
        // Changing src reloads the iframe, which re-mints Closer Lab's frame
        // proof and produces a fresh rp.ready we answer with the new
        // credential.
        setIframeSrc(result.iframeSrc);
        setReady(false);
        readyRef.current = false;
        setError(null);
      }
      // A failed refresh is deliberately silent: the existing credential may
      // still be valid, and the readiness timeout will surface a real problem.
    } finally {
      refreshingRef.current = false;
    }
  }, [blockId, scenarioId]);

  useEffect(() => {
    if (started || complete) return;
    const interval = setInterval(refreshIfStale, CREDENTIAL_POLL_MS);
    const onVisible = () => void refreshIfStale();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [complete, refreshIfStale, started]);

  useEffect(() => {
    if (ready || complete) return;
    const timer = setTimeout(() => {
      if (readyRef.current) return;
      setError(
        `The practice didn't load. Reload the page, and if it keeps happening tell your admin (scenario ${scenarioId}).`,
      );
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [complete, iframeSrc, ready, scenarioId]);

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
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={title || "Role play"}
        allow="microphone; clipboard-write"
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
